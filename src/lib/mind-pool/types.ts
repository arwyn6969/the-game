export type MindKind = "plan" | "reflect" | "talk" | "player";
export const MIND_KINDS: MindKind[] = ["plan", "reflect", "talk", "player"];

export type Limits = {
  rpm: number;
  rpd: number;
  // A rolling 31-day cap, useful for monthly trial allowances.
  monthly: number;
  tpm: number;
  tpd: number;
  concurrent: number;
};
export type Route = {
  model: string;
  maxTokens: number;
  reasoningEffort?: "low" | "medium" | "high";
  // Lower ranks are preferred. This is an operator preference, not a benchmark.
  rank: number;
};
export type Provider = {
  id: string;
  enabled: boolean;
  freeTierConfirmed: boolean;
  baseUrl: string;
  apiKeyEnv: string;
  protocol: "openai" | "cohere";
  jsonMode: boolean;
  limits: Limits;
  routes: Record<MindKind, Route>;
};
export type PoolConfig = {
  version: 1;
  timeoutMs: number;
  deadlineMs: number;
  maxAttempts: number;
  providers: Provider[];
};
export type Candidate = { provider: Provider; route: Route };
export type Lease = { id: string; jsonMode: boolean };
export type Outcome =
  "ok" | "rate_limit" | "auth" | "config" | "format" | "invalid" | "unreachable";
export type Completion = {
  outcome: Outcome;
  status: number | null;
  latencyMs: number;
  actualTokens: number | null;
  // Account cooldown applies across all models using this provider's key.
  accountCooldownMs?: number;
  modelCooldownMs?: number;
  disableAccount?: boolean;
  disableModel?: boolean;
  disableJsonMode?: boolean;
};
export interface QuotaStore {
  reserve(
    candidate: Candidate,
    kind: MindKind,
    tokens: number,
    leaseMs: number,
  ): Promise<Lease | null>;
  finish(candidate: Candidate, lease: Lease, completion: Completion): Promise<void>;
}
export type PoolResult =
  { ok: true; text: string } | { ok: false; error: "offline" | "slow" | "unreachable" };
