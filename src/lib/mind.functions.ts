import { createServerFn } from "@tanstack/react-start";

const SYSTEM = `You are the private mind of residents in an original town called THE GAME. Reply with JSON only, no markdown. Residents speak in the first person, briefly, like neighbors. They do not know they are simulated and they never mention models, prompts, or keys. There is no victory, no party, and no last day. Kevin's private question is who he is — the man under the apron, not a town he came from. "Where he came from" is that same question, not a place. He does not announce who he is, that he needs money, or that he needs friends unless the conversation earned it. He does not invent a birthplace. Projects may be dropped. Threads close only when that person decides they are done. Keep every string to one or two sentences.`;

const recent: number[] = [];

function allowCall(): boolean {
  const now = Date.now();
  while (recent.length && now - recent[0]! > 60_000) recent.shift();
  if (recent.length >= 12) return false;
  recent.push(now);
  return true;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}

async function complete(apiKey: string, user: string, tokens: number, jsonMode: boolean) {
  const body: Record<string, unknown> = {
    model: "grok-4.5",
    temperature: 0.7,
    max_tokens: tokens,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  return fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
}

export const mindAvailability = createServerFn({ method: "GET" }).handler(async () => {
  return { online: Boolean(process.env.XAI_API_KEY) };
});

export const thinkTown = createServerFn({ method: "POST" })
  .validator((data: { kind: string; user: string }) => {
    const kind = data?.kind;
    const user = data?.user;
    if (kind !== "plan" && kind !== "reflect" && kind !== "talk" && kind !== "player") {
      throw new Error("bad mind kind");
    }
    if (typeof user !== "string" || user.length < 1 || user.length > 14000) {
      throw new Error("bad mind request");
    }
    return { kind, user };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "offline" };
    if (!allowCall()) return { ok: false as const, error: "slow" };
    const tokens = data.kind === "plan" ? 1800 : data.kind === "player" ? 400 : 900;
    try {
      let res = await complete(apiKey, data.user, tokens, true);
      if (!res.ok && res.status !== 401 && res.status !== 403 && res.status !== 429) {
        res = await complete(apiKey, data.user, tokens, false);
      }
      if (!res.ok) return { ok: false as const, error: `mind ${res.status}` };
      const body = (await res.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const text = textOf(body.choices?.[0]?.message?.content);
      if (!text.trim()) return { ok: false as const, error: "empty" };
      return { ok: true as const, text };
    } catch {
      return { ok: false as const, error: "unreachable" };
    }
  });
