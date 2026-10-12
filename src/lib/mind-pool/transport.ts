import type { Candidate, MindKind } from "./types.ts";

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
    usage?: { total_tokens?: number; tokens?: { input_tokens?: number; output_tokens?: number } };
  } | null;
  const text = textOf(
    protocol === "cohere" ? value?.message?.content : value?.choices?.[0]?.message?.content,
  );
  const usage = value?.usage;
  const total =
    protocol === "cohere"
      ? Number(usage?.tokens?.input_tokens) + Number(usage?.tokens?.output_tokens)
      : usage?.total_tokens;
  return {
    text,
    actualTokens:
      typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : null,
    truncated: ["length", "MAX_TOKENS"].includes(
      protocol === "cohere"
        ? (value?.finish_reason ?? "")
        : (value?.choices?.[0]?.finish_reason ?? ""),
    ),
  };
}

// Check the envelope here. The game's existing parseMind/applyResult still
// validate resident identities, schedules and effects before touching the town.
export function validMindJson(kind: MindKind, text: string): boolean {
  if (!text.trim() || text.length > 20_000) return false;
  try {
    const raw = text
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "");
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    if (kind === "player") return typeof v.reply === "string" && Boolean(v.reply.trim());
    const field = kind === "plan" ? "plans" : kind === "reflect" ? "agents" : "lines";
    return Array.isArray(v[field]) && v[field].length > 0;
  } catch {
    return false;
  }
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
