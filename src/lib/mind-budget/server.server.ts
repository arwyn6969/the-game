import { createHash } from "node:crypto";
import type { Sql } from "../db.ts";
import type { MindKind } from "../mind-pool/types.ts";
import { loadBudgetPolicy } from "./policy.ts";
import { EphemeralMindBudgetStore, SqlMindBudgetStore } from "./store.ts";
import { runBudgetedMind } from "./runner.ts";
import { createPostgresPool } from "../postgres.server.ts";

const globalBudget = globalThis as typeof globalThis & {
  __mindBudgetPool?: ReturnType<typeof createPostgresPool>;
  __mindEphemeralBudget?: EphemeralMindBudgetStore;
};
export function budgetScope(env = process.env): "shared" | "ephemeral" | "unavailable" {
  if (env.DATABASE_URL?.trim()) return "shared";
  if (
    env.GROK_PROJECT_ID ||
    env.VERCEL ||
    (env.NODE_ENV === "production" && env.MIND_BUDGET_LOCAL_DEV !== "true")
  )
    return "unavailable";
  return "ephemeral";
}
export function budgetConfigured(env = process.env): boolean {
  try {
    const scope = budgetScope(env);
    const policy = loadBudgetPolicy(env);
    return (
      scope !== "unavailable" && (scope === "ephemeral" || policy.inputNanousdPerToken !== null)
    );
  } catch {
    return false;
  }
}
async function budgetStore(scope: "shared" | "ephemeral") {
  if (scope === "ephemeral") {
    globalBudget.__mindEphemeralBudget ??= new EphemeralMindBudgetStore();
    return globalBudget.__mindEphemeralBudget;
  }
  if (!globalBudget.__mindBudgetPool) {
    globalBudget.__mindBudgetPool = createPostgresPool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 3_000,
      query_timeout: 3_000,
      statement_timeout: 3_000,
      lock_timeout: 3_000,
    });
  }
  const pool = globalBudget.__mindBudgetPool;
  const sql: Pick<Sql, "query"> = {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await pool.query(text, params)).rows as T[],
  };
  return new SqlMindBudgetStore(sql);
}
export async function withMindBudget<
  T extends { ok: boolean; diagnostics?: { attempts: number } },
>(input: {
  kind: MindKind;
  userId: string;
  system: string;
  user: string;
  maxAttempts: number;
  maxOutputTokens: number;
  run: () => Promise<T>;
}) {
  try {
    const scope = budgetScope(process.env);
    if (scope === "unavailable" || !input.userId.trim())
      return { ok: false as const, error: "offline" };
    return await runBudgetedMind({
      ...input,
      scope,
      policy: loadBudgetPolicy(process.env),
      store: await budgetStore(scope),
      leaseMs: 90_000,
      // Only the trusted middleware's verified ID reaches this boundary. The
      // operational ledger receives its hash, never player names or emails.
      userHash: createHash("sha256").update(input.userId).digest("hex"),
    });
  } catch {
    return { ok: false as const, error: "unreachable" };
  }
}
