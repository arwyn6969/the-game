import type { Limits, MindKind, PoolConfig, Provider } from "./types.ts";

const limits = (overrides: Partial<Limits> = {}): Limits => ({
  rpm: 5,
  rpd: 50,
  monthly: 1_000,
  tpm: 20_000,
  tpd: 100_000,
  concurrent: 1,
  ...overrides,
});
function provider(
  id: string,
  baseUrl: string,
  apiKeyEnv: string,
  models: [string, string],
  ranks: [number, number],
  quota: Partial<Limits> = {},
): Provider {
  const route = (kind: MindKind) => ({
    model: kind === "plan" || kind === "reflect" ? models[0] : models[1],
    maxTokens:
      kind === "plan" ? 6_000 : kind === "reflect" ? 4_000 : kind === "talk" ? 2_000 : 1_500,
    rank: kind === "plan" || kind === "reflect" ? ranks[0] : ranks[1],
  });
  return {
    id,
    enabled: false,
    freeTierConfirmed: false,
    baseUrl,
    apiKeyEnv,
    protocol: id === "cohere" ? "cohere" : "openai",
    jsonMode: true,
    limits: limits(quota),
    routes: {
      plan: route("plan"),
      reflect: route("reflect"),
      talk: route("talk"),
      player: route("player"),
    },
  };
}

// Deliberately conservative local ceilings, NOT a statement of account entitlement.
// Confirm models, free mode and limits in each account before enabling a provider.
export const DEFAULT_CONFIG: PoolConfig = {
  version: 1,
  timeoutMs: 8_000,
  deadlineMs: 28_000,
  maxAttempts: 3,
  providers: [
    provider(
      "gemini",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "GEMINI_API_KEY",
      ["gemini-2.5-pro", "gemini-2.5-flash"],
      [10, 20],
    ),
    provider(
      "groq",
      "https://api.groq.com/openai/v1",
      "GROQ_API_KEY",
      ["openai/gpt-oss-120b", "openai/gpt-oss-120b"],
      [20, 10],
      { rpm: 20, rpd: 500, monthly: 15_000, concurrent: 2 },
    ),
    provider(
      "nvidia",
      "https://integrate.api.nvidia.com/v1",
      "NVIDIA_API_KEY",
      ["nvidia/nemotron-3-super-120b-a12b", "nvidia/nemotron-3-super-120b-a12b"],
      [30, 40],
    ),
    provider(
      "cohere",
      "https://api.cohere.com/v2",
      "COHERE_API_KEY",
      ["command-a-plus-05-2026", "command-a-plus-05-2026"],
      [40, 30],
      { monthly: 900 },
    ),
    provider(
      "mistral",
      "https://api.mistral.ai/v1",
      "MISTRAL_API_KEY",
      ["mistral-small-latest", "mistral-small-latest"],
      [50, 50],
    ),
    provider(
      "openrouter",
      "https://openrouter.ai/api/v1",
      "OPENROUTER_API_KEY",
      ["openrouter/free", "openrouter/free"],
      [60, 60],
      { rpd: 40, monthly: 1_200 },
    ),
    provider("ollama", "http://127.0.0.1:11434/v1", "", ["qwen3:8b", "qwen3:8b"], [70, 70], {
      rpm: 30,
      rpd: 10_000,
      monthly: 300_000,
      tpd: 10_000_000,
    }),
  ],
};
