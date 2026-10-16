import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultConfig, validateConfig, candidatesFor } from "./config.ts";
import { MIND_KINDS } from "./types.ts";
import type { PoolConfig, MindKind, PoolResult, Completion } from "./types.ts";
import { routeMind } from "./router.ts";
import { SqlQuotaStore } from "./store.ts";
import type { Sql } from "../db.ts";

const globalPool = globalThis as typeof globalThis & {
  __mindQuotaPool?: import("pg").Pool;
};

async function quotaSql(): Promise<Sql> {
  if (!process.env.DATABASE_URL?.trim()) {
    const { getSql } = await import("../db.ts");
    return getSql();
  }
  // Bound ledger latency without changing auth/platform database behaviour.
  const { default: pg } = await import("pg");
  if (!globalPool.__mindQuotaPool) {
    globalPool.__mindQuotaPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 3_000,
      query_timeout: 3_000,
      statement_timeout: 3_000,
      lock_timeout: 3_000,
    });
    globalPool.__mindQuotaPool.on("error", () => {
      /* Requests fail closed; never print connection secrets. */
    });
  }
  const pool = globalPool.__mindQuotaPool;
  // The store only uses .query(); the existing Sql surface has a tagged form too.
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await pool.query(text, params)).rows as T[],
  } as Sql;
}

export async function loadPoolConfig(env = process.env): Promise<PoolConfig> {
  if (env.MIND_POOL_CONFIG?.trim()) return validateConfig(JSON.parse(env.MIND_POOL_CONFIG));
  try {
    const raw = await readFile(
      resolve(env.MIND_POOL_CONFIG_FILE || "config/mind-pool.local.json"),
      "utf8",
    );
    return validateConfig(JSON.parse(raw));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT" &&
      !env.MIND_POOL_CONFIG_FILE
    ) {
      return defaultConfig();
    }
    throw new Error("Mind pool configuration could not be loaded");
  }
}

export async function poolAvailable(configSnapshot?: PoolConfig): Promise<boolean> {
  try {
    const config = configSnapshot ?? (await loadPoolConfig());
    // PGLite is process-local; a deployed pool must use shared Postgres.
    if (process.env.GROK_PROJECT_ID && !process.env.DATABASE_URL?.trim()) return false;
    if (process.env.VERCEL && !process.env.DATABASE_URL?.trim()) return false;
    return MIND_KINDS.every((kind) => candidatesFor(config, kind, process.env).length > 0);
  } catch {
    return false;
  }
}

export async function thinkWithPool(
  kind: MindKind,
  user: string,
  system: string,
  configSnapshot?: PoolConfig,
): Promise<PoolResult> {
  const started = Date.now();
  const attempts: { provider: string; model: string; completion: Completion }[] = [];
  try {
    // One validated, private snapshot governs both the caller's budget and the
    // actual router. Editing a local config during quota I/O cannot raise the
    // reserved request's output or retry allowance underneath it.
    const config = configSnapshot
      ? validateConfig(structuredClone(configSnapshot))
      : await loadPoolConfig();
    if (!(await poolAvailable(config))) return { ok: false, error: "offline" };
    const result = await routeMind({
      kind,
      system,
      user,
      config,
      env: process.env,
      store: new SqlQuotaStore(await quotaSql()),
      onAttempt: (provider, model, completion) => attempts.push({ provider, model, completion }),
    });
    const last = attempts.at(-1);
    return {
      ...result,
      diagnostics: {
        mode: "pool",
        provider: last?.provider ?? null,
        model: last?.model ?? null,
        attempts: attempts.length,
        elapsedMs: Date.now() - started,
        outcome: last?.completion.outcome ?? null,
        status: last?.completion.status ?? null,
        totalTokens: attempts.some((a) => a.completion.actualTokens !== null)
          ? attempts.reduce((sum, a) => sum + (a.completion.actualTokens ?? 0), 0)
          : null,
      },
    };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}
