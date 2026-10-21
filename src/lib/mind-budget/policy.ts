import type { MindKind } from "../mind-pool/types.ts";

export type BudgetPolicy = {
  version: 1;
  dailyCalls: number;
  playerDailyCalls: number;
  playerMinuteCalls: number;
  playerInteractiveReserveCalls: number;
  playerInteractiveReserveMinuteCalls: number;
  concurrent: number;
  backgroundConcurrent: number;
  interactiveReserveCalls: number;
  dailyMicrousd: number;
  interactiveReserveMicrousd: number;
  // Operator-supplied upper tariffs for EVERY enabled model and billing tier.
  // One nanodollar = 10^-9 USD; cached-input discounts must not be assumed.
  inputNanousdPerToken: number | null;
  outputNanousdPerToken: number | null;
};
export type BudgetReservation = {
  user: string;
  kind: MindKind;
  calls: number;
  microusd: number;
  leaseMs: number;
};
export type BudgetLease = { id: string; calls: number; microusd: number };
export interface BudgetStore {
  reserve(request: BudgetReservation, policy: BudgetPolicy): Promise<BudgetLease | null>;
  finish(lease: BudgetLease, knownAttempts: number | null): Promise<void>;
}

export const DEFAULT_BUDGET: BudgetPolicy = {
  version: 1,
  dailyCalls: 500,
  playerDailyCalls: 100,
  playerMinuteCalls: 6,
  playerInteractiveReserveCalls: 20,
  playerInteractiveReserveMinuteCalls: 2,
  concurrent: 4,
  backgroundConcurrent: 2,
  interactiveReserveCalls: 100,
  dailyMicrousd: 1_000_000,
  interactiveReserveMicrousd: 200_000,
  inputNanousdPerToken: null,
  outputNanousdPerToken: null,
};
const whole = (value: unknown, min = 0): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= 1_000_000_000;
export function validateBudgetPolicy(value: unknown): BudgetPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid mind budget policy");
  const policy = value as BudgetPolicy;
  if (
    policy.version !== 1 ||
    !whole(policy.dailyCalls, 1) ||
    !whole(policy.playerDailyCalls, 1) ||
    !whole(policy.playerMinuteCalls, 1) ||
    !whole(policy.playerInteractiveReserveCalls) ||
    !whole(policy.playerInteractiveReserveMinuteCalls) ||
    !whole(policy.concurrent, 1) ||
    !whole(policy.backgroundConcurrent) ||
    !whole(policy.interactiveReserveCalls) ||
    !whole(policy.dailyMicrousd) ||
    !whole(policy.interactiveReserveMicrousd) ||
    policy.playerDailyCalls > policy.dailyCalls ||
    policy.playerMinuteCalls > policy.playerDailyCalls ||
    policy.playerInteractiveReserveCalls >= policy.playerDailyCalls ||
    policy.playerInteractiveReserveMinuteCalls >= policy.playerMinuteCalls ||
    policy.backgroundConcurrent >= policy.concurrent ||
    policy.interactiveReserveCalls >= policy.dailyCalls ||
    (policy.dailyMicrousd === 0
      ? policy.interactiveReserveMicrousd !== 0
      : policy.interactiveReserveMicrousd >= policy.dailyMicrousd) ||
    (policy.inputNanousdPerToken !== null && !whole(policy.inputNanousdPerToken)) ||
    (policy.outputNanousdPerToken !== null && !whole(policy.outputNanousdPerToken)) ||
    (policy.inputNanousdPerToken === null) !== (policy.outputNanousdPerToken === null)
  )
    throw new Error("Invalid mind budget policy");
  return policy;
}
export function loadBudgetPolicy(env: Record<string, string | undefined>): BudgetPolicy {
  if (!env.MIND_BUDGET_CONFIG?.trim()) return { ...DEFAULT_BUDGET };
  return validateBudgetPolicy(JSON.parse(env.MIND_BUDGET_CONFIG));
}
export function estimateBudgetMicrousd(
  policy: BudgetPolicy,
  inputBytes: number,
  maxOutputTokens: number,
  attempts: number,
): number | null {
  if (policy.inputNanousdPerToken === null || policy.outputNanousdPerToken === null) return null;
  // UTF-8 bytes are a deliberately conservative token upper estimate. Reserve
  // every possible retry up front, including maximum billed reasoning/output.
  const cost =
    Math.ceil(
      ((inputBytes + 256) * policy.inputNanousdPerToken +
        maxOutputTokens * policy.outputNanousdPerToken) /
        1_000,
    ) * attempts;
  if (!Number.isSafeInteger(cost) || cost < 0)
    throw new Error("Mind budget estimate exceeds integer accounting");
  return cost;
}
export function validReservation(request: BudgetReservation): boolean {
  return (
    typeof request.user === "string" &&
    request.user.length > 0 &&
    request.user.length <= 128 &&
    ["plan", "reflect", "talk", "player"].includes(request.kind) &&
    whole(request.calls, 1) &&
    request.calls <= 4 &&
    whole(request.microusd) &&
    whole(request.leaseMs, 1) &&
    request.leaseMs <= 120_000
  );
}
