import { MIND_SYSTEM, validateMindRequest } from "./mind.gateway.ts";
import type { GatewayResult, MindDiagnostics, MindRequest } from "./mind.gateway.ts";
import { decodeCompletion, readJsonBounded, validMindJson } from "./mind-pool/transport.ts";
import { ACTION_PROVIDER_TIMEOUT_MS } from "./mind-timing.ts";

export type PersonalModelSettings = {
  mode: "hosted" | "api-key" | "local";
  baseUrl: string;
  model: string;
  apiKey: string;
};

export const DEFAULT_PERSONAL_MODEL: PersonalModelSettings = {
  mode: "hosted",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  apiKey: "",
};

const STORAGE_KEY = "the-game:personal-model:v1";
const KEY_HOSTS: [string, string][] = [
  ["sk-or-v1-", "openrouter.ai"],
  ["sk-proj-", "api.openai.com"],
  ["sk-svcacct-", "api.openai.com"],
  ["xai-", "api.x.ai"],
  ["AIza", "generativelanguage.googleapis.com"],
  ["gsk_", "api.groq.com"],
  ["nvapi-", "integrate.api.nvidia.com"],
  ["sk-ant-", "api.anthropic.com"],
];
const hasControl = (value: string) =>
  Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );

function normalizeSettings(
  value: PersonalModelSettings,
  requireKey: boolean,
): PersonalModelSettings {
  if (
    !value ||
    !["hosted", "api-key", "local"].includes(value.mode) ||
    typeof value.baseUrl !== "string" ||
    typeof value.model !== "string" ||
    typeof value.apiKey !== "string"
  )
    throw new Error("Choose a valid AI source.");
  if (value.mode === "hosted") return { ...DEFAULT_PERSONAL_MODEL };
  const baseUrl = value.baseUrl.trim();
  const model = value.model.trim();
  const apiKey = value.apiKey.trim();
  if (!model || model.length > 200 || hasControl(model))
    throw new Error("Enter a model name of up to 200 characters.");
  if (
    apiKey.length > 4096 ||
    /\s/.test(apiKey) ||
    hasControl(apiKey) ||
    (value.mode === "api-key" && requireKey && !apiKey)
  )
    throw new Error("Enter a valid API key for this session.");
  let url: URL;
  try {
    if (baseUrl.length > 2000 || /\s/.test(baseUrl) || hasControl(baseUrl)) throw new Error();
    url = new URL(baseUrl);
  } catch {
    throw new Error("Enter a valid API base URL.");
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Use an API base URL without credentials, a query or a fragment.");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (value.mode === "local") {
    if (!loopback || !["http:", "https:"].includes(url.protocol))
      throw new Error("Use a local model on localhost, 127.0.0.1 or [::1].");
  } else if (url.protocol !== "https:") {
    throw new Error("Your API key requires an HTTPS base URL.");
  }
  const owner = KEY_HOSTS.find(([prefix]) => apiKey.startsWith(prefix));
  if (owner && url.hostname !== owner[1])
    throw new Error("This API key belongs to a different provider. Check the base URL.");
  return { mode: value.mode, baseUrl: url.href.replace(/\/+$/, ""), model, apiKey };
}

export function validatePersonalModelSettings(value: PersonalModelSettings): PersonalModelSettings {
  return normalizeSettings(value, true);
}

/** Preferences are separate from town saves. Credentials are never written to storage. */
export function readPersonalModelSettings(): PersonalModelSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PERSONAL_MODEL };
    const saved = raw as Record<string, unknown>;
    return normalizeSettings(
      {
        mode: saved.mode as PersonalModelSettings["mode"],
        baseUrl: saved.baseUrl as string,
        model: saved.model as string,
        // Ignore a credential even if older or externally modified storage contains one.
        apiKey: "",
      },
      false,
    );
  } catch {
    return { ...DEFAULT_PERSONAL_MODEL };
  }
}

export function savePersonalModelSettings(settings: PersonalModelSettings): boolean {
  try {
    const { mode, baseUrl, model } = validatePersonalModelSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, baseUrl, model }));
    return true;
  } catch {
    return false;
  }
}

/** Configuration readiness only: this does not contact or qualify a model. */
export function personalModelReady(settings: PersonalModelSettings): boolean {
  try {
    return validatePersonalModelSettings(settings).mode !== "hosted";
  } catch {
    return false;
  }
}

export function personalModelTimeoutMs(
  settings: PersonalModelSettings,
  kind: MindRequest["kind"],
): number {
  return settings.mode === "local" ? 60_000 : kind === "act" ? ACTION_PROVIDER_TIMEOUT_MS : 25_000;
}

/** One direct browser request. No fallback to hosted AI and no automatic retry. */
export async function requestPersonalModel(
  data: MindRequest,
  settings: PersonalModelSettings,
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<GatewayResult> {
  const started = Date.now();
  const diagnostics: MindDiagnostics = {
    model: "personal",
    attempts: 0,
    elapsedMs: 0,
    inputTokens: null,
    outputTokens: null,
    outcome: "offline",
  };
  const fail = (outcome: MindDiagnostics["outcome"], error = outcome): GatewayResult => ({
    ok: false,
    error,
    diagnostics: { ...diagnostics, outcome, elapsedMs: Math.max(0, Date.now() - started) },
  });
  let safe: PersonalModelSettings;
  try {
    safe = validatePersonalModelSettings(settings);
    data = validateMindRequest(data);
  } catch {
    return fail("offline");
  }
  if (safe.mode === "hosted") return fail("offline");
  diagnostics.model = safe.model;
  const deadline = AbortSignal.timeout(personalModelTimeoutMs(safe, data.kind));
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  if (signal.aborted) return fail("timeout");
  try {
    diagnostics.attempts = 1;
    const response = await (options.fetcher ?? fetch)(`${safe.baseUrl}/chat/completions`, {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(safe.apiKey ? { Authorization: `Bearer ${safe.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: safe.model,
        temperature: 0.7,
        max_tokens:
          data.kind === "plan"
            ? 1800
            : data.kind === "player"
              ? 700
              : data.kind === "act"
                ? 1200
                : 900,
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: MIND_SYSTEM },
          { role: "user", content: data.user },
        ],
      }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      // Do not expose provider bodies: they may echo credentials or resident context.
      return fail(response.status === 429 ? "rate-limit" : "http-error");
    }
    let body: unknown;
    try {
      body = await readJsonBounded(response);
    } catch {
      return fail(signal.aborted ? "timeout" : "malformed");
    }
    if (signal.aborted) return fail("timeout");
    const completion = decodeCompletion(body, "openai");
    diagnostics.inputTokens = completion.inputTokens;
    diagnostics.outputTokens = completion.outputTokens;
    if (!completion.text.trim()) return fail("empty");
    if (completion.truncated || !validMindJson(data.kind, completion.text))
      return fail("malformed");
    // TownApp retains the same job-specific parsing and simulation authority checks.
    return {
      ok: true,
      text: completion.text,
      diagnostics: {
        ...diagnostics,
        outcome: "online",
        elapsedMs: Math.max(0, Date.now() - started),
      },
    };
  } catch {
    return fail(signal.aborted ? "timeout" : "unreachable");
  }
}
