import type { MindKind } from "../mind-pool/types.ts";
import { estimateBudgetMicrousd } from "./policy.ts";
import type { BudgetPolicy, BudgetStore } from "./policy.ts";

type Result = { ok: boolean; diagnostics?: { attempts: number } };
export async function runBudgetedMind<T extends Result>(input: {
  kind: MindKind;
  userHash: string;
  system: string;
  user: string;
  maxAttempts: number;
  maxOutputTokens: number;
  leaseMs: number;
  policy: BudgetPolicy;
  store: BudgetStore;
  scope: "shared" | "ephemeral";
  run: () => Promise<T>;
}): Promise<T | { ok: false; error: "slow" | "unreachable" | "offline" }> {
  let lease;
  try {
    const inputBytes = new TextEncoder().encode(input.system + input.user).byteLength;
    const estimate = estimateBudgetMicrousd(
      input.policy,
      inputBytes,
      input.maxOutputTokens,
      input.maxAttempts,
    );
    if (input.scope === "shared" && estimate === null) return { ok: false, error: "offline" };
    lease = await input.store.reserve(
      {
        user: input.userHash,
        kind: input.kind,
        calls: input.maxAttempts,
        microusd: estimate ?? 0,
        leaseMs: input.leaseMs,
      },
      input.policy,
    );
    if (!lease) return { ok: false, error: "slow" };
    const result = await input.run();
    const attempts = result.diagnostics?.attempts;
    await input.store.finish(
      lease,
      result.ok &&
        typeof attempts === "number" &&
        Number.isSafeInteger(attempts) &&
        attempts >= 1 &&
        attempts <= input.maxAttempts
        ? attempts
        : null,
    );
    return result;
  } catch {
    if (lease) {
      try {
        await input.store.finish(lease, null);
      } catch {
        /* Keep worst-case reservation charged. */
      }
    }
    return { ok: false, error: "unreachable" };
  }
}
