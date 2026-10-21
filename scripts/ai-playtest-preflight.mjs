#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BUDGET,
  loadBudgetPolicy,
  estimateBudgetMicrousd,
} from "../src/lib/mind-budget/policy.ts";
import { budgetScope } from "../src/lib/mind-budget/server.server.ts";
import { defaultConfig, validateConfig, candidatesFor } from "../src/lib/mind-pool/config.ts";
import { MIND_MODEL, MIND_SYSTEM } from "../src/lib/mind.gateway.ts";

const kinds = ["plan", "reflect", "talk", "player"];
const pending = {
  realSignIn: "pending: prove a real signed-in request through the existing middleware",
  authAndPoolDatabaseReadiness:
    "pending: database inspection checks budget schema only; auth and pool migrations/runtime need separate verification",
  accountTariffsAndTokenSemantics:
    "pending: verify account billing, all models/tiers and billed reasoning limits",
  deployedBuildAndCallbacks:
    "pending: verify the built auth/provider configuration and registered callback",
  userSpendingAuthority: "pending: no user-authorized USD cap is inferred or granted",
  perUserHeadroom:
    "pending: requires the real middleware-verified identity; no identity override is accepted",
};
const present = (value) => typeof value === "string" && Boolean(value.trim());
const hash = (value) => createHash("sha256").update(value).digest("hex");
const numeric = (value) => {
  const number =
    typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("database_counters_invalid");
  return number;
};
function validUrl(value, callback = false) {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" || (callback && local && url.protocol === "http:")) &&
      (!callback || url.pathname === "/")
    );
  } catch {
    return false;
  }
}
export function parseArguments(args) {
  const options = { inspectDb: false };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--inspect-db" && !options.inspectDb) options.inspectDb = true;
    else if (args[index] === "--zero-spend" && !options.zeroSpend) options.zeroSpend = true;
    else if (
      args[index] === "--pool-config" &&
      !options.poolConfigPath &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    )
      options.poolConfigPath = args[++index];
    else throw new Error("arguments_invalid");
  }
  return options;
}
export function configurationReport(env, poolConfig) {
  const issues = [];
  const mode = env.MIND_PROVIDER_MODE || "legacy";
  const auth = {
    explicitFlag: env.VITE_AUTH_ENABLED === "true",
    durableSecret: present(env.BETTER_AUTH_SECRET) && env.BETTER_AUTH_SECRET.trim().length >= 32,
    brokerClient: present(env.GROK_AUTH_CLIENT_ID) && present(env.GROK_AUTH_CLIENT_SECRET),
    issuerUrl: validUrl(env.GROK_AUTH_ISSUER),
    callbackOrigin: validUrl(env.BETTER_AUTH_URL, true),
  };
  if (Object.values(auth).some((value) => !value)) issues.push("auth_configuration_incomplete");
  const scope = budgetScope(env);
  if (scope !== "shared") issues.push("shared_database_required");
  if (env.MIND_BUDGET_LOCAL_DEV === "true") issues.push("ephemeral_budget_opt_in_not_accepted");
  let policy = null;
  if (!present(env.MIND_BUDGET_CONFIG)) issues.push("budget_policy_missing");
  else {
    try {
      const value = loadBudgetPolicy(env);
      policy = Object.fromEntries(Object.keys(DEFAULT_BUDGET).map((key) => [key, value[key]]));
      if (policy.inputNanousdPerToken === null) issues.push("budget_tariffs_missing");
    } catch {
      issues.push("budget_policy_invalid");
    }
  }
  const providers = [];
  const jobs = {};
  if (!["legacy", "pool"].includes(mode)) issues.push("provider_mode_invalid");
  else if (mode === "legacy") {
    const keyPresent = present(env.XAI_API_KEY);
    providers.push({ id: "xai", keyPresent });
    if (!keyPresent) issues.push("provider_key_missing");
    for (const kind of kinds)
      jobs[kind] = {
        models: [{ provider: "xai", model: MIND_MODEL }],
        maxAttempts: 1,
        maxOutputTokens: kind === "plan" ? 1800 : kind === "player" ? 700 : 900,
      };
  } else {
    try {
      const config = validateConfig(poolConfig ?? defaultConfig());
      const credentials = [
        env.XAI_API_KEY,
        env.BETTER_AUTH_SECRET,
        env.GROK_AUTH_CLIENT_SECRET,
        env.GROK_AUTH_CLIENT_ID,
        env.DATABASE_URL,
        ...config.providers.map((provider) => env[provider.apiKeyEnv]),
      ]
        .filter(present)
        .map((value) => value.trim());
      const privateIdentifier = (value) =>
        credentials.some((credential) => value.includes(credential));
      if (
        config.providers.some(
          (provider) =>
            privateIdentifier(provider.id) ||
            kinds.some(
              (kind) =>
                !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(provider.routes[kind].model) ||
                provider.routes[kind].model.includes("://") ||
                privateIdentifier(provider.routes[kind].model),
            ),
        )
      )
        throw new Error("Invalid model identifier");
      for (const provider of config.providers)
        providers.push({
          id: provider.id,
          enabled: provider.enabled,
          freeTierConfirmed: provider.freeTierConfirmed,
          keyPresent: !provider.apiKeyEnv || present(env[provider.apiKeyEnv]),
        });
      for (const kind of kinds) {
        const candidates = candidatesFor(config, kind, env);
        if (!candidates.length) {
          issues.push(`pool_candidates_missing_${kind}`);
          continue;
        }
        jobs[kind] = {
          models: candidates.map(({ provider, route }) => ({
            provider: provider.id,
            model: route.model,
          })),
          maxAttempts: config.maxAttempts,
          maxOutputTokens: Math.max(...candidates.map(({ route }) => route.maxTokens)),
        };
      }
    } catch {
      issues.push("pool_configuration_invalid");
    }
  }
  // Upper bound for the runtime's 14,000 UTF-16-code-unit request limit.
  const inputBytesUpperBound = new TextEncoder().encode(MIND_SYSTEM).byteLength + 14_000 * 4;
  if (policy && policy.inputNanousdPerToken !== null) {
    for (const kind of kinds) {
      const job = jobs[kind];
      if (!job) continue;
      try {
        job.reservedCalls = job.maxAttempts;
        job.reservedMicrousd = estimateBudgetMicrousd(
          policy,
          inputBytesUpperBound,
          job.maxOutputTokens,
          job.maxAttempts,
        );
        const background = kind !== "player";
        if (
          job.reservedMicrousd > 1_000_000_000 ||
          job.reservedCalls >
            policy.dailyCalls - (background ? policy.interactiveReserveCalls : 0) ||
          job.reservedCalls >
            policy.playerDailyCalls - (background ? policy.playerInteractiveReserveCalls : 0) ||
          job.reservedCalls >
            policy.playerMinuteCalls -
              (background ? policy.playerInteractiveReserveMinuteCalls : 0) ||
          job.reservedMicrousd >
            policy.dailyMicrousd - (background ? policy.interactiveReserveMicrousd : 0) ||
          (background && policy.backgroundConcurrent === 0)
        )
          issues.push(`worst_case_request_exceeds_policy_${kind}`);
      } catch {
        issues.push(`reservation_estimate_invalid_${kind}`);
      }
    }
  }
  return {
    mode: ["legacy", "pool"].includes(mode) ? mode : "invalid",
    scope,
    auth,
    policy,
    providers,
    jobs,
    inputBytesUpperBound,
    issues,
  };
}
export async function expectedFunctions() {
  const migration = await readFile(
    new URL("../migrations/20261013_mind_budget.sql", import.meta.url),
    "utf8",
  );
  return Object.fromEntries(
    [...migration.matchAll(/create function (mind_budget_\w+)[\s\S]*?as \$\$([\s\S]*?)\$\$;/g)].map(
      (match) => [match[1], hash(match[2])],
    ),
  );
}
export const SQL = {
  schema: `select /* preflight:schema */ to_regclass('_migrations') is not null as migrations,
    to_regclass('mind_budget_lock') is not null as lock_table,
    to_regclass('mind_budget_attempts') is not null as attempts_table`,
  columns: `select /* preflight:columns */ c.relname, a.attname, format_type(a.atttypid,a.atttypmod) as type, a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid where a.attrelid in (to_regclass('mind_budget_lock'),to_regclass('mind_budget_attempts')) and a.attnum > 0 and not a.attisdropped`,
  migration:
    "select /* preflight:migration */ exists(select 1 from _migrations where name = $1) as applied",
  functions: `select /* preflight:functions */ proname, prosrc, prosecdef from pg_proc where oid in (
    to_regprocedure('mind_budget_reserve(text,text,integer,bigint,integer,jsonb)'),
    to_regprocedure('mind_budget_finish(text,integer)'))`,
  lock: "select /* preflight:lock */ count(*) as rows, min(id) as minimum, max(id) as maximum from mind_budget_lock",
  privileges: `select /* preflight:privileges */ target, privilege,
    has_table_privilege(current_user, target, privilege) as allowed
    from unnest($1::text[], $2::text[]) as checks(target,privilege)
    union all select target, 'EXECUTE', has_function_privilege(current_user,target,'EXECUTE')
    from unnest($3::text[]) as checks(target)`,
  usage: `select /* preflight:usage */ coalesce(sum(charged_calls),0) as calls,
    coalesce(sum(charged_microusd),0) as microusd,
    count(*) filter(where completed_at is null and expires_at > floor(extract(epoch from clock_timestamp())*1000)) as live,
    count(*) filter(where completed_at is null and expires_at > floor(extract(epoch from clock_timestamp())*1000) and kind <> 'player') as background,
    count(*) filter(where charged_calls < 0 or charged_calls > reserved_calls or charged_microusd < 0 or charged_microusd > reserved_microusd) as invalid
    from mind_budget_attempts where started_at > floor(extract(epoch from clock_timestamp())*1000)-86400000`,
};
const tablePrivileges = [
  ["mind_budget_lock", "SELECT"],
  ["mind_budget_lock", "UPDATE"],
  ...["SELECT", "INSERT", "UPDATE", "DELETE"].map((privilege) => [
    "mind_budget_attempts",
    privilege,
  ]),
];
const functionNames = [
  "mind_budget_reserve(text,text,integer,bigint,integer,jsonb)",
  "mind_budget_finish(text,integer)",
];
const databaseErrors = new Set([
  "database_schema_missing",
  "database_migration_missing",
  "database_functions_mismatch",
  "database_lock_missing",
  "database_privileges_missing",
  "database_counters_invalid",
  "database_headroom_insufficient",
]);
function requireCheck(condition, code) {
  if (!condition) throw new Error(code);
}
export async function inspectDatabase(client, config, expected) {
  let result;
  try {
    expected ??= await expectedFunctions();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '3s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const schema = (await client.query(SQL.schema)).rows[0];
    requireCheck(
      schema?.migrations && schema.lock_table && schema.attempts_table,
      "database_schema_missing",
    );
    const columns = (await client.query(SQL.columns)).rows;
    const required = {
      mind_budget_lock: { id: "integer" },
      mind_budget_attempts: {
        id: "text",
        user_hash: "text",
        kind: "text",
        started_at: "bigint",
        expires_at: "bigint",
        completed_at: "bigint",
        reserved_calls: "integer",
        charged_calls: "integer",
        reserved_microusd: "bigint",
        charged_microusd: "bigint",
      },
    };
    requireCheck(
      columns.length === 11 &&
        columns.every(
          (row) =>
            required[row.relname]?.[row.attname] === row.type &&
            row.attnotnull === (row.attname !== "completed_at"),
        ),
      "database_schema_missing",
    );
    requireCheck(
      (await client.query(SQL.migration, ["20261013_mind_budget.sql"])).rows[0]?.applied,
      "database_migration_missing",
    );
    const functions = (await client.query(SQL.functions)).rows;
    requireCheck(
      Object.keys(expected).length === 2 &&
        functions.length === 2 &&
        functions.every((row) => !row.prosecdef && expected[row.proname] === hash(row.prosrc)),
      "database_functions_mismatch",
    );
    const lock = (await client.query(SQL.lock)).rows[0];
    requireCheck(
      Number(lock?.rows) === 1 && Number(lock.minimum) === 1 && Number(lock.maximum) === 1,
      "database_lock_missing",
    );
    const privileges = (
      await client.query(SQL.privileges, [
        tablePrivileges.map(([target]) => target),
        tablePrivileges.map(([, privilege]) => privilege),
        functionNames,
      ])
    ).rows;
    requireCheck(
      privileges.length === 8 && privileges.every((row) => row.allowed === true),
      "database_privileges_missing",
    );
    const raw = (await client.query(SQL.usage)).rows[0];
    const usage = Object.fromEntries(
      ["calls", "microusd", "live", "background", "invalid"].map((key) => [
        key,
        numeric(raw?.[key]),
      ]),
    );
    requireCheck(
      usage.invalid === 0 && usage.background <= usage.live,
      "database_counters_invalid",
    );
    const p = config.policy;
    const headroom = {
      calls: Math.max(0, p.dailyCalls - usage.calls),
      microusd: Math.max(0, p.dailyMicrousd - usage.microusd),
      concurrent: Math.max(0, p.concurrent - usage.live),
      backgroundConcurrent: Math.max(
        0,
        Math.min(p.concurrent - usage.live, p.backgroundConcurrent - usage.background),
      ),
      backgroundCalls: Math.max(0, p.dailyCalls - p.interactiveReserveCalls - usage.calls),
      backgroundMicrousd: Math.max(
        0,
        p.dailyMicrousd - p.interactiveReserveMicrousd - usage.microusd,
      ),
    };
    requireCheck(
      kinds.every((kind) => {
        const job = config.jobs[kind];
        return (
          job &&
          job.reservedCalls <= (kind === "player" ? headroom.calls : headroom.backgroundCalls) &&
          usage.microusd + job.reservedMicrousd <=
            p.dailyMicrousd - (kind === "player" ? 0 : p.interactiveReserveMicrousd) &&
          (kind === "player" ? headroom.concurrent : headroom.backgroundConcurrent) > 0
        );
      }),
      "database_headroom_insufficient",
    );
    result = {
      status: "passed",
      usage,
      headroom,
      functionHashes: Object.fromEntries(functions.map((row) => [row.proname, hash(row.prosrc)])),
    };
  } catch (error) {
    result = {
      status: "blocked",
      issue: databaseErrors.has(error?.message) ? error.message : "database_inspection_failed",
    };
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      result = { status: "blocked", issue: "database_rollback_failed" };
    }
  }
  return result;
}
async function connectDatabase(env) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    statement_timeout: 3000,
    lock_timeout: 3000,
    application_name: "the-game-ai-preflight",
  });
  try {
    const client = await pool.connect();
    return {
      query: (...args) => client.query(...args),
      close: async () => {
        client.release();
        await pool.end();
      },
    };
  } catch {
    await pool.end();
    throw new Error("database_connection_failed");
  }
}
export async function preflight(env, options = {}) {
  let poolConfig;
  let loadIssue;
  try {
    if (options.poolConfigPath && present(env.MIND_POOL_CONFIG))
      loadIssue = "pool_configuration_ambiguous";
    else if (options.poolConfigPath)
      poolConfig = JSON.parse(await readFile(options.poolConfigPath, "utf8"));
    else if (present(env.MIND_POOL_CONFIG)) poolConfig = JSON.parse(env.MIND_POOL_CONFIG);
    else if (present(env.MIND_POOL_CONFIG_FILE))
      loadIssue = "pool_config_file_requires_explicit_path";
  } catch {
    loadIssue = "pool_configuration_unreadable";
  }
  const config = configurationReport(env, poolConfig);
  if (loadIssue) config.issues.push(loadIssue);
  if (options.poolConfigPath && config.mode !== "pool")
    config.issues.push("pool_config_requires_pool_mode");
  if (options.zeroSpend && config.policy && config.policy.dailyMicrousd !== 0)
    config.issues.push("configured_budget_exceeds_zero_spend_authority");
  if (options.zeroSpend && Object.values(config.jobs).some((job) => job.reservedMicrousd > 0))
    config.issues.push("positive_reservation_exceeds_zero_spend_authority");
  const report = {
    version: 1,
    configDatabasePreflight: config.issues.length ? "blocked" : "configuration-only",
    configuration: config,
    database: { status: "not-requested" },
    pendingVerification: { ...pending },
    approvedSpendMicrousd: options.zeroSpend ? 0 : null,
    configuredAllowanceGrantsSpendingAuthority: false,
    readyForAiPlaytest: false,
  };
  if (options.zeroSpend)
    report.pendingVerification.userSpendingAuthority =
      "zero USD only: no billable model request is authorized; non-billing account/route verification remains pending";
  if (options.inspectDb && !config.issues.length) {
    let client;
    try {
      client = await (options.connect ?? connectDatabase)(env);
      report.database = await inspectDatabase(client, config);
    } catch {
      report.database = { status: "blocked", issue: "database_connection_failed" };
    } finally {
      if (client)
        try {
          await client.close();
        } catch {
          report.database = { status: "blocked", issue: "database_close_failed" };
        }
    }
    report.configDatabasePreflight = report.database.status === "passed" ? "passed" : "blocked";
  }
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let report;
  try {
    if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("node_24_required");
    report = await preflight(process.env, parseArguments(process.argv.slice(2)));
  } catch {
    report = {
      configDatabasePreflight: "blocked",
      issue: "arguments_or_runtime_invalid",
      pendingVerification: pending,
      readyForAiPlaytest: false,
    };
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.configDatabasePreflight === "blocked") process.exitCode = 1;
}
