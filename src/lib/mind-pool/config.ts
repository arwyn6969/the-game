import { DEFAULT_CONFIG } from "./catalog.ts";
import { MIND_KINDS } from "./types.ts";
import type { Candidate, Limits, MindKind, PoolConfig } from "./types.ts";

const LIMIT_KEYS: (keyof Limits)[] = ["rpm", "rpd", "monthly", "tpm", "tpd", "concurrent"];
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
const integer = (v: unknown, min: number, max: number) =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;

// A recognizable provider credential must only go to that provider's API host.
// Unprefixed keys remain supported for Cohere, Mistral and custom endpoints.
const KEY_HOSTS: [string, string][] = [
  ["AIza", "generativelanguage.googleapis.com"],
  ["gsk_", "api.groq.com"],
  ["nvapi-", "integrate.api.nvidia.com"],
  ["sk-or-v1-", "openrouter.ai"],
];
export function credentialMatchesEndpoint(baseUrl: string, key: string): boolean {
  const owner = KEY_HOSTS.find(([prefix]) => key.trim().startsWith(prefix));
  return !owner || new URL(baseUrl).hostname === owner[1];
}

export function validateConfig(value: unknown): PoolConfig {
  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.providers) ||
    value.providers.length > 20 ||
    !integer(value.timeoutMs, 100, 12_000) ||
    !integer(value.deadlineMs, 100, 30_000) ||
    !integer(value.maxAttempts, 1, 4) ||
    Number(value.timeoutMs) > Number(value.deadlineMs)
  ) {
    throw new Error("Invalid mind pool configuration");
  }
  const ids = new Set<string>();
  for (const p of value.providers) {
    if (
      !object(p) ||
      typeof p.id !== "string" ||
      !/^[a-z][a-z0-9-]{0,31}$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.enabled !== "boolean" ||
      typeof p.freeTierConfirmed !== "boolean" ||
      (p.protocol !== "openai" && p.protocol !== "cohere") ||
      typeof p.jsonMode !== "boolean" ||
      typeof p.baseUrl !== "string" ||
      typeof p.apiKeyEnv !== "string" ||
      (p.apiKeyEnv !== "" &&
        (!/^[A-Z][A-Z0-9_]*$/.test(p.apiKeyEnv) || p.apiKeyEnv.startsWith("VITE_"))) ||
      !object(p.limits) ||
      !object(p.routes)
    )
      throw new Error("Invalid mind pool provider");
    ids.add(p.id);
    const url = new URL(p.baseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      (p.apiKeyEnv === "" && !(p.id === "ollama" && local))
    ) {
      throw new Error(
        "Provider needs HTTPS and a server-side key; only local Ollama can omit a key",
      );
    }
    for (const key of LIMIT_KEYS) {
      if (!integer(p.limits[key], 1, 1_000_000_000)) throw new Error("Invalid mind pool quota");
    }
    for (const kind of MIND_KINDS) {
      const r = p.routes[kind];
      if (
        !object(r) ||
        typeof r.model !== "string" ||
        !r.model.trim() ||
        r.model.length > 200 ||
        !integer(r.rank, 1, 1_000) ||
        !integer(r.maxTokens, 400, 16_000)
      )
        throw new Error("Invalid mind pool route");
      if (
        r.reasoningEffort !== undefined &&
        (typeof r.reasoningEffort !== "string" ||
          !["none", "low", "medium", "high"].includes(r.reasoningEffort) ||
          p.protocol === "cohere" ||
          (r.reasoningEffort === "none" && url.origin !== "https://openrouter.ai"))
      ) {
        throw new Error("Invalid mind pool reasoning effort");
      }
      if (
        url.hostname === "openrouter.ai" &&
        r.model !== "openrouter/free" &&
        !r.model.endsWith(":free")
      ) {
        throw new Error("OpenRouter pool models must use openrouter/free or a :free model");
      }
      if (url.hostname === "api.x.ai")
        throw new Error("Paid Grok is excluded from the free pool; use legacy mode explicitly");
    }
  }
  return value as unknown as PoolConfig;
}

export function candidatesFor(
  config: PoolConfig,
  kind: MindKind,
  env: Record<string, string | undefined>,
): Candidate[] {
  return config.providers
    .filter(
      (p) =>
        p.enabled &&
        p.freeTierConfirmed &&
        (!p.apiKeyEnv ||
          (Boolean(env[p.apiKeyEnv]?.trim()) &&
            credentialMatchesEndpoint(p.baseUrl, env[p.apiKeyEnv]!))),
    )
    .map((provider) => ({ provider, route: provider.routes[kind] }))
    .sort((a, b) => a.route.rank - b.route.rank);
}

export function defaultConfig(): PoolConfig {
  return structuredClone(DEFAULT_CONFIG);
}
