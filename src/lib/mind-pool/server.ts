import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultConfig, validateConfig, candidatesFor } from "./config.ts";
import { MIND_KINDS } from "./types.ts";
import type { PoolConfig, MindKind, PoolResult } from "./types.ts";
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

export async function poolAvailable(): Promise<boolean> {
  try {
    const config = await loadPoolConfig();
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
): Promise<PoolResult> {
  try {
    if (!(await poolAvailable())) return { ok: false, error: "offline" };
    const config = await loadPoolConfig();
    return await routeMind({
      kind,
      system,
      user,
      config,
      env: process.env,
      store: new SqlQuotaStore(await quotaSql()),
    });
  } catch {
    return { ok: false, error: "unreachable" };
  }
}
