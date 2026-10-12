#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  defaultConfig,
  candidatesFor,
  credentialMatchesEndpoint,
} from "../src/lib/mind-pool/config.ts";
import { loadPoolConfig } from "../src/lib/mind-pool/server.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";
import { SqlQuotaStore } from "../src/lib/mind-pool/store.ts";

const command = process.argv[2] ?? "status";
const configPath = "config/mind-pool.local.json";

async function demo() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(new URL("../migrations/20261012_mind_pool.sql", import.meta.url), "utf8"),
    );
    const config = defaultConfig();
    const env = {};
    for (const p of config.providers) {
      p.enabled = true;
      p.freeTierConfirmed = true;
      env[p.apiKeyEnv] = "demo-placeholder";
    }
    const store = new SqlQuotaStore({
      query: async (text, params) => (await db.query(text, params)).rows,
    });
    const calls = [];
    const result = await routeMind({
      kind: "plan",
      system: "Return JSON",
      user: "Plan a fictional town day.",
      config,
      env,
      store,
      fetcher: async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body.model);
        if (String(url).includes("googleapis"))
          return new Response("{}", { status: 429, headers: { "Retry-After": "60" } });
        return Response.json({
          choices: [
            { message: { content: JSON.stringify({ plans: [{ id: "kevin", blocks: [] }] }) } },
          ],
          usage: { total_tokens: 100 },
        });
      },
    });
    console.log(
      JSON.stringify(
        {
          demo: "Mocked providers; no external API calls",
          preferenceOrder: calls,
          result: result.ok ? "fallback succeeded" : result.error,
        },
        null,
        2,
      ),
    );
    console.table(
      (
        await db.query(
          "select provider, model, outcome, reserved_tokens, actual_tokens from mind_pool_attempts order by started_at",
        )
      ).rows,
    );
  } finally {
    await db.close();
  }
}

async function withDatabase(run) {
  if (!process.env.DATABASE_URL?.trim())
    throw new Error(
      "This command needs DATABASE_URL. Local game PGLite is in-process; demo and tests use a separate disposable ledger.",
    );
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  });
  try {
    await run(pool);
  } finally {
    await pool.end();
  }
}

async function main() {
  if (command === "init") {
    await mkdir("config", { recursive: true });
    await writeFile(configPath, JSON.stringify(defaultConfig(), null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      `Created ${configPath}. Enable chosen providers, confirm their free account tier, and add keys to .env.local. Existing files are never overwritten.`,
    );
    return;
  }
  if (command === "demo") return demo();
  if (command === "dev" || command === "preview") {
    const args =
      command === "dev"
        ? ["run", "dev"]
        : ["run", "preview", "--", "--host", "127.0.0.1", "--port", "8081", "--strictPort"];
    const child = spawn("npm", args, {
      stdio: "inherit",
      env: { ...process.env, MIND_PROVIDER_MODE: "pool" },
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    child.on("error", () => {
      console.error("Could not start the game");
      process.exitCode = 1;
    });
    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
    return;
  }
  const config = await loadPoolConfig();
  if (command === "status") {
    console.log(
      `Mode: ${process.env.MIND_PROVIDER_MODE === "pool" ? "pool" : "legacy (use ai:pool dev for private testing)"}`,
    );
    console.table(
      config.providers.map((p) => ({
        provider: p.id,
        enabled: p.enabled,
        freeConfirmed: p.freeTierConfirmed,
        keyPresent: p.apiKeyEnv ? Boolean(process.env[p.apiKeyEnv]?.trim()) : "local",
        keyEndpointMatch:
          p.apiKeyEnv && process.env[p.apiKeyEnv]?.trim()
            ? credentialMatchesEndpoint(p.baseUrl, process.env[p.apiKeyEnv])
            : "n/a",
        rpm: p.limits.rpm,
        rpd: p.limits.rpd,
        concurrency: p.limits.concurrent,
      })),
    );
    for (const kind of ["plan", "reflect", "talk", "player"]) {
      console.log(
        `${kind}: ${
          candidatesFor(config, kind, process.env)
            .map((c) => `${c.provider.id}/${c.route.model} (rank ${c.route.rank})`)
            .join(" → ") || "offline: no eligible provider"
        }`,
      );
    }
    return;
  }
  if (command === "usage") {
    return withDatabase(async (pool) => {
      const report = await pool.query(`select provider, model, count(*)::int as attempts,
        count(*) filter (where outcome = 'ok')::int as successes,
        count(*) filter (where outcome = 'rate_limit')::int as rate_limits,
        count(*) filter (where completed_at is null and expires_at > extract(epoch from now()) * 1000)::int as active,
        sum(reserved_tokens)::bigint as reserved_tokens, sum(actual_tokens)::bigint as reported_tokens,
        round(avg(latency_ms))::int as average_ms
        from mind_pool_attempts where started_at > extract(epoch from now()) * 1000 - 86400000
        group by provider, model order by provider, model`);
      console.table(report.rows);
      console.table(
        (
          await pool.query(
            "select scope, blocked, cooldown_until, json_mode from mind_pool_health order by scope",
          )
        ).rows,
      );
    });
  }
  if (command === "reset-health") {
    const providerId = process.argv[3];
    if (!config.providers.some((p) => p.id === providerId))
      throw new Error("Specify a configured provider ID after reset-health");
    return withDatabase(async (pool) => {
      await pool.query(
        "update mind_pool_health set blocked = false, cooldown_until = 0, json_mode = true where scope = $1 or scope like $2",
        [`account/${providerId}`, `model/${providerId}/%`],
      );
      console.log(`Health reset for ${providerId}. Quota reservations were preserved.`);
    });
  }
  throw new Error("Commands: init, status, demo, dev, usage, reset-health <provider>");
}

main().catch(() => {
  // Connection and config errors can contain secrets; keep CLI output generic.
  console.error(
    "AI pool command failed. Check the command, config file, Node 24, and (for usage/reset-health) DATABASE_URL and the applied migration. init refuses to overwrite an existing file.",
  );
  process.exitCode = 1;
});
