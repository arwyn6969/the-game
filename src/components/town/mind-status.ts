export type MindFailure =
  "connection" | "timeout" | "limited" | "sign-in" | "provider" | "invalid" | "unconfigured";

/** Classify only stable codes. Never turn a transport/provider error into UI text. */
export function mindFailure(error: unknown): MindFailure {
  const record = error && typeof error === "object" ? error : null;
  const status = record && "status" in record ? record.status : null;
  const name = record && "name" in record ? record.name : null;
  const message =
    typeof error === "string"
      ? error
      : record && "message" in record && typeof record.message === "string"
        ? record.message
        : null;

  if (status === 401 || message === "Unauthorized") return "sign-in";
  if (status === 429 || message === "slow" || message === "rate-limit") return "limited";
  if (name === "TimeoutError" || name === "AbortError" || message === "timeout") return "timeout";
  if (message === "offline") return "unconfigured";
  if (["invalid", "malformed", "empty", "huge"].includes(message ?? "")) return "invalid";
  if (message && /^mind \d{3}$/.test(message))
    return message === "mind 429" ? "limited" : "provider";
  return "connection";
}

export function mindFailureFromResult(result: {
  error?: unknown;
  diagnostics?: { outcome?: unknown; status?: unknown };
}): MindFailure {
  const outcome = result.diagnostics?.outcome;
  const status = result.diagnostics?.status;
  // These are provider-side statuses, not the player's authenticated session.
  if (outcome === "rate_limit" || outcome === "rate-limit" || status === 429) return "limited";
  if (
    outcome === "auth" ||
    outcome === "config" ||
    outcome === "http-error" ||
    status === 401 ||
    status === 402 ||
    status === 403 ||
    (typeof status === "number" && status >= 500)
  )
    return "provider";
  if (["invalid", "malformed", "empty", "format"].includes(String(outcome))) return "invalid";
  if (outcome === "timeout") return "timeout";
  if (outcome === "offline") return "unconfigured";
  if (outcome === "unreachable") return "connection";
  return mindFailure(result.error);
}

const MESSAGES: Record<MindFailure, string> = {
  connection: "The game could not reach the AI service.",
  timeout: "The AI took too long to reply.",
  limited: "AI requests are temporarily limited or busy.",
  "sign-in": "Your sign-in has expired. Sign in again to use AI.",
  provider: "The AI provider could not complete this request.",
  invalid: "The AI returned a reply the game could not safely use.",
  unconfigured: "AI is currently unavailable for this game.",
};

export function mindFailureMessage(failure: MindFailure): string {
  return MESSAGES[failure];
}
