export type LegacyMindKind = "plan" | "reflect" | "talk" | "player";
export type MindKind = LegacyMindKind | "act";
/** Existing configurations require only these four routes. Actions are explicit opt-in. */
export const MIND_KINDS: LegacyMindKind[] = ["plan", "reflect", "talk", "player"];

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
  // none: OpenRouter or NVIDIA Ultra; minimal: Gemini's OpenAI-compatible API.
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
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
  routes: Record<LegacyMindKind, Route> & { act?: Route };
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
  "ok" | "rate_limit" | "auth" | "config" | "format" | "invalid" | "unreachable" | "timeout";
export type MindJsonFailure =
  "empty" | "oversize" | "invalid-json" | "not-object" | "missing-envelope";
export type CompletionDiagnostics = {
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | "error" | "other" | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  responseCharacters: number;
  invalidReason: MindJsonFailure | "truncated" | null;
};
export type Completion = {
  outcome: Outcome;
  status: number | null;
  latencyMs: number;
  actualTokens: number | null;
  // Only normalized categories/counts; never provider text, reasoning, or IDs.
  response?: CompletionDiagnostics;
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
export type PoolDiagnostics = {
  mode: "pool";
  provider: string | null;
  model: string | null;
  attempts: number;
  elapsedMs: number;
  totalTokens: number | null;
  outcome: Outcome | null;
  status: number | null;
  response?: CompletionDiagnostics;
};
export type PoolResult = (
  { ok: true; text: string } | { ok: false; error: "offline" | "slow" | "unreachable" }
) & { diagnostics?: PoolDiagnostics };
