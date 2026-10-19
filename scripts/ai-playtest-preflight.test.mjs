import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_BUDGET } from "../src/lib/mind-budget/policy.ts";
import { SqlMindBudgetStore } from "../src/lib/mind-budget/store.ts";
import { defaultConfig } from "../src/lib/mind-pool/config.ts";
import {
  parseArguments,
  configurationReport,
  inspectDatabase,
  preflight,
} from "./ai-playtest-preflight.mjs";

const secret = "PRIVATE_SENTINEL_DO_NOT_PRINT_1234567890";
const environment = (changes = {}) => ({
  DATABASE_URL: `postgresql://operator:${secret}@private-db.invalid/game`,
  VITE_AUTH_ENABLED: "true",
  BETTER_AUTH_SECRET: secret,
  GROK_AUTH_CLIENT_ID: "operator-client",
  GROK_AUTH_CLIENT_SECRET: secret,
  GROK_AUTH_ISSUER: "https://private-broker.invalid",
  BETTER_AUTH_URL: "https://private-game.invalid",
  XAI_API_KEY: secret,
  MIND_PROVIDER_MODE: "legacy",
  MIND_BUDGET_CONFIG: JSON.stringify({
    ...DEFAULT_BUDGET,
    inputNanousdPerToken: 1000,
    outputNanousdPerToken: 1000,
  }),
  ...changes,
});
let db;
const baseline = {};
const label = (text) => /preflight:(\w+)/.exec(text)?.[1];
before(async () => {
  db = new PGlite();
  // Only this disposable test database is provisioned; the operator CLI has no DDL.
  await db.exec(
    await readFile(new URL("../migrations/20261013_mind_budget.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    "create table _migrations(name text primary key); insert into _migrations values('20261013_mind_budget.sql')",
  );
  const result = await inspectDatabase(
    {
      query: async (text, params) => {
        const result = await db.query(text, params);
        if (label(text)) baseline[label(text)] = structuredClone(result.rows);
        return result;
      },
    },
    configurationReport(environment()),
  );
  assert.equal(result.status, "passed");
});
after(async () => {
  await db.close();
});
function fakeDatabase(change = () => {}) {
  const data = structuredClone(baseline);
  change(data);
  const queries = [];
  let closed = false;
  return {
    queries,
    get closed() {
      return closed;
    },
    query: async (text, params) => {
      queries.push({ text, params });
      return { rows: structuredClone(data[label(text)] || []) };
    },
    close: async () => {
      closed = true;
    },
  };
}
const inspect = (client, env = environment()) =>
  preflight(env, { inspectDb: true, connect: async () => client });
const noSecrets = (report) => {
  const output = JSON.stringify(report);
  for (const value of [
    secret,
    "private-db.invalid",
    "private-broker.invalid",
    "private-game.invalid",
    "operator-client",
  ])
    assert.equal(output.includes(value), false);
};

test("CLI accepts only explicit read-only inspection/config/zero-spend options", () => {
  assert.deepEqual(
    parseArguments(["--inspect-db", "--pool-config", "operator.json", "--zero-spend"]),
    { inspectDb: true, poolConfigPath: "operator.json", zeroSpend: true },
  );
  for (const args of [
    ["--authenticated"],
    ["--force"],
    ["--max-spend-usd", "10"],
    ["--pool-config"],
    ["--inspect-db", "--inspect-db"],
  ])
    assert.throws(() => parseArguments(args), /arguments_invalid/);
});

test("default performs no network; missing prerequisites block before even a database connection", async () => {
  let connections = 0;
  const connect = async () => {
    connections++;
    throw new Error(secret);
  };
  const valid = await preflight(environment(), { connect });
  assert.equal(valid.configDatabasePreflight, "configuration-only");
  assert.equal(valid.database.status, "not-requested");
  const missing = await preflight({}, { inspectDb: true, connect });
  assert.equal(missing.configDatabasePreflight, "blocked");
  assert.ok(missing.configuration.issues.includes("budget_policy_missing"));
  assert.equal(connections, 0);
  assert.equal(valid.readyForAiPlaytest, false);
  assert.ok(
    Object.values(valid.pendingVerification).every((value) => value.startsWith("pending:")),
  );
});

test("allowlisted configuration exposes bounds, not credentials, URLs or arbitrary policy fields", async () => {
  const env = environment();
  const policy = JSON.parse(env.MIND_BUDGET_CONFIG);
  policy.privateCredential = secret;
  env.MIND_BUDGET_CONFIG = JSON.stringify(policy);
  const report = await preflight(env);
  noSecrets(report);
  assert.equal(report.configuration.jobs.player.maxAttempts, 1);
  assert.equal(report.configuration.jobs.player.maxOutputTokens, 700);
  assert.equal(report.configuration.jobs.plan.maxOutputTokens, 1800);
  assert.ok(report.configuration.jobs.player.reservedMicrousd > 0);
  assert.equal(report.configuration.policy.privateCredential, undefined);
});

test("invalid policy, auth, callback and mode errors never echo supplied values", async () => {
  for (const changes of [
    { MIND_BUDGET_CONFIG: `{${secret}` },
    { MIND_BUDGET_CONFIG: JSON.stringify(DEFAULT_BUDGET) },
    { VITE_AUTH_ENABLED: "false" },
    { BETTER_AUTH_URL: `https://user:${secret}@private-game.invalid/` },
    { GROK_AUTH_CLIENT_SECRET: "" },
    { MIND_PROVIDER_MODE: secret },
    { DATABASE_URL: "" },
    { MIND_BUDGET_LOCAL_DEV: "true" },
    { XAI_API_KEY: "" },
  ]) {
    const report = await preflight(environment(changes));
    assert.equal(report.configDatabasePreflight, "blocked");
    noSecrets(report);
  }
});

test("pool requires eligible candidates for every kind and rejects unsafe model identifiers", async () => {
  const config = defaultConfig();
  const cohere = config.providers.find((provider) => provider.id === "cohere");
  cohere.enabled = true;
  cohere.freeTierConfirmed = true;
  const env = environment({
    MIND_PROVIDER_MODE: "pool",
    COHERE_API_KEY: secret,
    MIND_POOL_CONFIG: JSON.stringify(config),
  });
  const report = await preflight(env);
  assert.equal(report.configDatabasePreflight, "configuration-only");
  assert.equal(report.configuration.jobs.plan.maxAttempts, 3);
  assert.equal(report.configuration.jobs.player.maxOutputTokens, 1500);
  noSecrets(report);
  for (const key of ["COHERE_API_KEY", "MIND_POOL_CONFIG"]) {
    const changed = { ...env, [key]: "" };
    assert.equal((await preflight(changed)).configDatabasePreflight, "blocked");
  }
  for (const model of [
    secret,
    `https://private-provider.invalid/${secret}`,
    "contains\nprivate-data",
  ]) {
    cohere.routes.player.model = model;
    const failed = await preflight({ ...env, MIND_POOL_CONFIG: JSON.stringify(config) });
    assert.equal(failed.configDatabasePreflight, "blocked");
    assert.equal(JSON.stringify(failed).includes(model), false);
    noSecrets(failed);
  }
});

test("model aliases containing a credential or private broker account ID are rejected before reporting identifiers", async () => {
  for (const embedded of [secret, "operator-client"]) {
    const config = defaultConfig();
    const provider = config.providers.find((item) => item.id === "cohere");
    provider.enabled = true;
    provider.freeTierConfirmed = true;
    provider.routes.player.model = `alias/${embedded}`;
    const report = await preflight(
      environment({
        MIND_PROVIDER_MODE: "pool",
        COHERE_API_KEY: secret,
        MIND_POOL_CONFIG: JSON.stringify(config),
      }),
    );
    assert.equal(report.configDatabasePreflight, "blocked");
    assert.deepEqual(report.configuration.providers, []);
    assert.deepEqual(report.configuration.jobs, {});
    assert.ok(report.configuration.issues.includes("pool_configuration_invalid"));
    assert.equal(JSON.stringify(report).includes(embedded), false);
    noSecrets(report);
  }
});

test("a syntactically valid provider ID containing a configured secret is rejected before report construction", async () => {
  const providerSecret = "s".repeat(32);
  const config = defaultConfig();
  const provider = config.providers.find((item) => item.id === "cohere");
  provider.id = providerSecret;
  provider.enabled = true;
  provider.freeTierConfirmed = true;
  const report = await preflight(
    environment({
      BETTER_AUTH_SECRET: providerSecret,
      MIND_PROVIDER_MODE: "pool",
      COHERE_API_KEY: secret,
      MIND_POOL_CONFIG: JSON.stringify(config),
    }),
  );
  assert.equal(report.configDatabasePreflight, "blocked");
  assert.deepEqual(report.configuration.providers, []);
  assert.deepEqual(report.configuration.jobs, {});
  assert.ok(report.configuration.issues.includes("pool_configuration_invalid"));
  assert.equal(JSON.stringify(report).includes(providerSecret), false);
  noSecrets(report);
});

test("explicit pool config file is supported without printing its contents or path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "game-preflight-"));
  try {
    const path = join(dir, `${secret}.json`);
    const config = defaultConfig();
    config.providers[0].enabled = true;
    config.providers[0].freeTierConfirmed = true;
    await writeFile(path, JSON.stringify(config));
    const env = environment({
      MIND_PROVIDER_MODE: "pool",
      GEMINI_API_KEY: "AIza-private-test-key",
    });
    const report = await preflight(env, { poolConfigPath: path });
    assert.equal(report.configDatabasePreflight, "configuration-only");
    noSecrets(report);
    const ambiguous = await preflight(
      { ...env, MIND_POOL_CONFIG: JSON.stringify(config) },
      { poolConfigPath: path },
    );
    assert.ok(ambiguous.configuration.issues.includes("pool_configuration_ambiguous"));
    noSecrets(ambiguous);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("zero-spend blocks positive reservations; zero tariffs still cannot prove non-billing or authorize a playtest", async () => {
  let connected = false;
  const blocked = await preflight(environment(), {
    zeroSpend: true,
    inspectDb: true,
    connect: async () => {
      connected = true;
    },
  });
  assert.equal(blocked.approvedSpendMicrousd, 0);
  assert.equal(blocked.configDatabasePreflight, "blocked");
  assert.equal(connected, false);
  const env = environment({
    MIND_BUDGET_CONFIG: JSON.stringify({
      ...DEFAULT_BUDGET,
      inputNanousdPerToken: 0,
      outputNanousdPerToken: 0,
    }),
  });
  const allowance = await preflight(env, { zeroSpend: true });
  assert.ok(
    allowance.configuration.issues.includes("configured_budget_exceeds_zero_spend_authority"),
  );
  env.MIND_BUDGET_CONFIG = JSON.stringify({
    ...JSON.parse(env.MIND_BUDGET_CONFIG),
    dailyMicrousd: 0,
    interactiveReserveMicrousd: 0,
  });
  const zero = await preflight(env, { zeroSpend: true });
  assert.equal(zero.configDatabasePreflight, "configuration-only");
  assert.equal(zero.configuration.jobs.player.reservedMicrousd, 0);
  assert.equal(zero.readyForAiPlaytest, false);
  assert.equal(zero.configuredAllowanceGrantsSpendingAuthority, false);
  assert.match(zero.pendingVerification.accountTariffsAndTokenSemantics, /^pending:/);
});

test("real disposable Postgres-compatible schema passes SELECT-only inspection and always rolls back", async () => {
  const queries = [];
  const client = {
    query: async (text, params) => {
      queries.push(text);
      return db.query(text, params);
    },
  };
  const result = await inspectDatabase(client, configurationReport(environment()));
  assert.equal(result.status, "passed");
  assert.equal(result.headroom.microusd, DEFAULT_BUDGET.dailyMicrousd);
  assert.equal(queries[0], "BEGIN READ ONLY");
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.ok(
    queries.every((text) => /^(select\b|BEGIN READ ONLY$|SET LOCAL\b|ROLLBACK$)/i.test(text)),
  );
  assert.equal(
    queries.some((text) =>
      /select\s+(?:\*\s+from\s+)?mind_budget_(?:reserve|finish)\s*\(/i.test(text),
    ),
    false,
  );
  assert.equal(
    (await db.query("select count(*) as count from mind_budget_attempts")).rows[0].count,
    0,
  );
});

test("missing schema, migration, functions, exact lock row and individual privileges all fail closed", async () => {
  const cases = [
    [
      "database_schema_missing",
      (data) => {
        data.schema[0].lock_table = false;
      },
    ],
    [
      "database_schema_missing",
      (data) => {
        data.columns.pop();
      },
    ],
    [
      "database_migration_missing",
      (data) => {
        data.migration[0].applied = false;
      },
    ],
    [
      "database_functions_mismatch",
      (data) => {
        data.functions.pop();
      },
    ],
    [
      "database_functions_mismatch",
      (data) => {
        data.functions[0].prosrc = secret;
      },
    ],
    [
      "database_lock_missing",
      (data) => {
        data.lock[0].rows = "0";
      },
    ],
    [
      "database_lock_missing",
      (data) => {
        data.lock[0].maximum = 2;
      },
    ],
    [
      "database_privileges_missing",
      (data) => {
        data.privileges[0].allowed = false;
      },
    ],
    [
      "database_privileges_missing",
      (data) => {
        data.privileges.pop();
      },
    ],
  ];
  for (const [expected, change] of cases) {
    const client = fakeDatabase(change);
    const report = await inspect(client);
    assert.equal(report.configDatabasePreflight, "blocked");
    assert.equal(report.database.issue, expected);
    assert.equal(client.queries.at(-1).text, "ROLLBACK");
    assert.equal(client.closed, true);
    noSecrets(report);
  }
});

test("shared headroom and malformed counters are checked without reading individual identities", async () => {
  for (const change of [
    (row) => {
      row.calls = DEFAULT_BUDGET.dailyCalls;
    },
    (row) => {
      row.microusd = DEFAULT_BUDGET.dailyMicrousd;
    },
    (row) => {
      row.live = DEFAULT_BUDGET.concurrent;
    },
    (row) => {
      row.background = DEFAULT_BUDGET.backgroundConcurrent;
      row.live = DEFAULT_BUDGET.backgroundConcurrent;
    },
  ]) {
    const client = fakeDatabase((data) => change(data.usage[0]));
    assert.equal((await inspect(client)).database.issue, "database_headroom_insufficient");
    assert.ok(client.queries.every(({ text }) => !/select\s+\*/i.test(text)));
  }
  for (const value of [secret, null, false, -1, "9007199254740992"]) {
    const broken = fakeDatabase((data) => {
      data.usage[0].calls = value;
    });
    const report = await inspect(broken);
    assert.equal(report.database.issue, "database_counters_invalid");
    noSecrets(report);
  }
});

test("lowered monetary ceilings preserve prior charges and match actual SQL rejection of free work", async () => {
  const ledger = new SqlMindBudgetStore({
    query: async (text, params) => (await db.query(text, params)).rows,
  });
  try {
    for (const limits of [
      { dailyMicrousd: 0, interactiveReserveMicrousd: 0, priorCost: 1 },
      { dailyMicrousd: 1000, interactiveReserveMicrousd: 200, priorCost: 801 },
    ]) {
      await db.exec("truncate mind_budget_attempts");
      const prior = await ledger.reserve(
        { user: "synthetic", kind: "player", calls: 1, microusd: limits.priorCost, leaseMs: 1000 },
        configurationReport(environment()).policy,
      );
      assert.ok(prior);
      await ledger.finish(prior, 1);
      const config = configurationReport(
        environment({
          MIND_BUDGET_CONFIG: JSON.stringify({
            ...DEFAULT_BUDGET,
            dailyMicrousd: limits.dailyMicrousd,
            interactiveReserveMicrousd: limits.interactiveReserveMicrousd,
            inputNanousdPerToken: 0,
            outputNanousdPerToken: 0,
          }),
        }),
      );
      assert.deepEqual(config.issues, []);
      const result = await inspectDatabase({ query: (...args) => db.query(...args) }, config);
      assert.equal(result.issue, "database_headroom_insufficient");
      assert.equal(
        await ledger.reserve(
          { user: "synthetic", kind: "talk", calls: 1, microusd: 0, leaseMs: 1000 },
          config.policy,
        ),
        null,
      );
      assert.equal(
        (await db.query("select count(*) as count from mind_budget_attempts")).rows[0].count,
        1,
      );
    }
  } finally {
    await db.exec("truncate mind_budget_attempts");
  }
});

test("provider fetch is never used and connection errors cannot reveal credentials", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error(secret);
  };
  try {
    const client = fakeDatabase();
    const report = await inspect(client);
    assert.equal(report.configDatabasePreflight, "passed");
    assert.equal(report.readyForAiPlaytest, false);
    noSecrets(report);
    const failed = await preflight(environment(), {
      inspectDb: true,
      connect: async () => {
        throw new Error(secret);
      },
    });
    assert.equal(failed.database.issue, "database_connection_failed");
    noSecrets(failed);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("rollback failure blocks the report and still closes the connection", async () => {
  const client = fakeDatabase();
  const query = client.query;
  client.query = async (text, params) => {
    if (text === "ROLLBACK") throw new Error(secret);
    return query(text, params);
  };
  const report = await inspect(client);
  assert.equal(report.database.issue, "database_rollback_failed");
  assert.equal(client.closed, true);
  noSecrets(report);
});
