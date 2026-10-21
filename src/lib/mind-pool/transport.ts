import type { Candidate, CompletionDiagnostics, MindJsonFailure, MindKind } from "./types.ts";

export function requestBody(
  candidate: Candidate,
  system: string,
  user: string,
  tokens: number,
  jsonMode: boolean,
) {
  const body: Record<string, unknown> = {
    model: candidate.route.model,
    temperature: 0.7,
    max_tokens: tokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  if (candidate.route.reasoningEffort === "none") {
    // Omitting reasoning_effort leaves the selected model's default in place.
    if (
      candidate.provider.protocol !== "openai" ||
      new URL(candidate.provider.baseUrl).origin !== "https://openrouter.ai"
    )
      throw new Error("Disabling reasoning requires OpenRouter");
    body.reasoning = { enabled: false };
  } else if (candidate.route.reasoningEffort === "minimal") {
    if (
      candidate.provider.protocol !== "openai" ||
      new URL(candidate.provider.baseUrl).origin !== "https://generativelanguage.googleapis.com"
    )
      throw new Error("Minimal reasoning requires Gemini");
    body.reasoning_effort = "minimal";
  } else if (candidate.route.reasoningEffort) {
    body.reasoning_effort = candidate.route.reasoningEffort;
  }
  return body;
}

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p: unknown) => {
      if (typeof p === "string") return p;
      if (p && typeof p === "object" && "text" in p && typeof p.text === "string") return p.text;
      return "";
    })
    .join("");
}

export function decodeCompletion(body: unknown, protocol: "openai" | "cohere") {
  const value = body as {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    message?: { content?: unknown };
    finish_reason?: string;
    usage?: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
      tokens?: { input_tokens?: number; output_tokens?: number };
    };
  } | null;
  const text = textOf(
    protocol === "cohere" ? value?.message?.content : value?.choices?.[0]?.message?.content,
  );
  const usage = value?.usage;
  const inputTokens = tokenCount(
    protocol === "cohere" ? usage?.tokens?.input_tokens : usage?.prompt_tokens,
  );
  const outputTokens = tokenCount(
    protocol === "cohere" ? usage?.tokens?.output_tokens : usage?.completion_tokens,
  );
  const total =
    protocol === "cohere"
      ? inputTokens !== null && outputTokens !== null
        ? inputTokens + outputTokens
        : null
      : usage?.total_tokens;
  const rawFinish =
    protocol === "cohere" ? value?.finish_reason : value?.choices?.[0]?.finish_reason;
  const finishReason = normalizedFinishReason(rawFinish);
  return {
    text,
    actualTokens: tokenCount(total),
    truncated: finishReason === "length",
    finishReason,
    inputTokens,
    outputTokens,
    reasoningTokens:
      protocol === "openai" ? tokenCount(usage?.completion_tokens_details?.reasoning_tokens) : null,
  };
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizedFinishReason(value: unknown): CompletionDiagnostics["finishReason"] {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "other";
  if (value === "MAX_TOKENS") return "length";
  if (value === "COMPLETE") return "stop";
  switch (value) {
    case "stop":
    case "length":
    case "content_filter":
    case "tool_calls":
    case "error":
      return value;
    default:
      return "other";
  }
}

// Check the envelope here. The game's existing parseMind/applyResult still
// validate resident identities, schedules and effects before touching the town.
export function mindJsonFailure(kind: MindKind, text: string): MindJsonFailure | null {
  if (!text.trim()) return "empty";
  if (text.length > 20_000) return "oversize";
  try {
    const raw = text
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "");
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return "not-object";
    if (kind === "player")
      return typeof v.reply === "string" && Boolean(v.reply.trim()) ? null : "missing-envelope";
    const field = kind === "plan" ? "plans" : kind === "reflect" ? "agents" : "lines";
    return Array.isArray(v[field]) && v[field].length > 0 ? null : "missing-envelope";
  } catch {
    return "invalid-json";
  }
}

export function validMindJson(kind: MindKind, text: string): boolean {
  return mindJsonFailure(kind, text) === null;
}

export function retryAfterMs(header: string | null, now: number): number {
  if (!header) return 60_000;
  const seconds = Number(header);
  const value = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(header) - now;
  return Number.isFinite(value) ? Math.max(1_000, value) : 60_000;
}

export async function readJsonBounded(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256_000) throw new Error("oversize response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
