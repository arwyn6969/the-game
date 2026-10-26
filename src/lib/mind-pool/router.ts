import { candidatesFor } from "./config.ts";
import { actionTimeoutMs } from "../mind-timing.ts";
import {
  decodeCompletion,
  readJsonBounded,
  requestBody,
  retryAfterMs,
  mindJsonFailure,
} from "./transport.ts";
import type { Completion, MindKind, PoolConfig, PoolResult, QuotaStore } from "./types.ts";

export async function routeMind(input: {
  kind: MindKind;
  system: string;
  user: string;
  config: PoolConfig;
  store: QuotaStore;
  env: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  now?: () => number;
  onAttempt?: (provider: string, model: string, completion: Completion) => void;
}): Promise<PoolResult> {
  const { kind, system, user, config, store, env } = input;
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? Date.now;
  const candidates = candidatesFor(config, kind, env);
  if (!candidates.length) return { ok: false, error: "offline" };
  // One physical decision has at most one transmitted attempt, including format retries.
  const maxAttempts = kind === "act" ? 1 : config.maxAttempts;
  // Bytes + max output is intentionally conservative and includes every retry.
  // Report actual usage separately; never refund a possibly executed attempt.
  const inputBytes = new TextEncoder().encode(system + user).byteLength + 256;
  const attemptTimeout = kind === "act" ? actionTimeoutMs(config) : config.timeoutMs;
  const deadline = now() + (kind === "act" ? attemptTimeout : config.deadlineMs);
  let attempts = 0;
  try {
    for (const candidate of candidates) {
      const tokens = candidate.route.maxTokens;
      const reservedTokens = inputBytes + tokens;
      let formatRetry = false;
      while (attempts < maxAttempts && now() < deadline) {
        const timeout = Math.min(attemptTimeout, deadline - now());
        const lease = await store.reserve(candidate, kind, reservedTokens, timeout + 10_000);
        if (!lease) break;
        const remaining = Math.min(timeout, deadline - now());
        if (remaining <= 0) {
          await store.finish(candidate, lease, {
            outcome: "unreachable",
            status: null,
            latencyMs: 0,
            actualTokens: null,
          });
          break;
        }
        attempts += 1;
        const started = now();
        const jsonMode = candidate.provider.jsonMode && lease.jsonMode && !formatRetry;
        let completion: Completion = {
          outcome: "unreachable",
          status: null,
          latencyMs: 0,
          actualTokens: null,
          modelCooldownMs: 30_000,
        };
        let text: string | undefined;
        let retryFormat = false;
        const signal = AbortSignal.timeout(Math.max(1, Math.floor(remaining)));
        try {
          const key = env[candidate.provider.apiKeyEnv]?.trim();
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (key) headers.Authorization = `Bearer ${key}`;
          const response = await fetcher(
            `${candidate.provider.baseUrl.replace(/\/$/, "")}/${candidate.provider.protocol === "cohere" ? "chat" : "chat/completions"}`,
            {
              method: "POST",
              headers,
              // Workers supports manual/follow only. Never follow a provider
              // redirect with its credential; a 3xx is handled as unreachable.
              redirect: "manual",
              body: JSON.stringify(requestBody(candidate, system, user, tokens, jsonMode)),
              signal,
            },
          );
          completion.status = response.status;
          if (response.ok) {
            const decoded = decodeCompletion(
              await readJsonBounded(response),
              candidate.provider.protocol,
            );
            completion.actualTokens = decoded.actualTokens;
            completion.response = {
              finishReason: decoded.finishReason,
              inputTokens: decoded.inputTokens,
              outputTokens: decoded.outputTokens,
              reasoningTokens: decoded.reasoningTokens,
              responseCharacters: decoded.text.length,
              invalidReason: decoded.truncated ? "truncated" : mindJsonFailure(kind, decoded.text),
            };
            if (completion.response.invalidReason === null) {
              text = decoded.text;
              completion = { ...completion, outcome: "ok", modelCooldownMs: 0 };
            } else {
              completion.outcome = "invalid";
            }
          } else if (response.status === 429) {
            completion = {
              ...completion,
              outcome: "rate_limit",
              accountCooldownMs: retryAfterMs(response.headers.get("retry-after"), now()),
              modelCooldownMs: 0,
            };
            await response.body?.cancel();
          } else if ([401, 403, 402].includes(response.status)) {
            completion = {
              ...completion,
              outcome: "auth",
              disableAccount: true,
              modelCooldownMs: 0,
            };
            await response.body?.cancel();
          } else if ([400, 404, 422].includes(response.status)) {
            // Only retry without response_format when the error explicitly
            // identifies it; don't double-call for unrelated bad requests.
            let body: unknown;
            try {
              body = await readJsonBounded(response);
            } catch {
              body = null;
            }
            const errorText = JSON.stringify(body);
            retryFormat = jsonMode && /response_format|json_object|json mode/i.test(errorText);
            completion = retryFormat
              ? { ...completion, outcome: "format", disableJsonMode: true, modelCooldownMs: 0 }
              : { ...completion, outcome: "config", disableModel: true, modelCooldownMs: 0 };
          } else {
            await response.body?.cancel();
          }
        } catch {
          // Do not store provider bodies/errors: they can echo prompts or keys.
          if (signal.aborted) completion.outcome = "timeout";
        }
        completion.latencyMs = Math.max(0, now() - started);
        await store.finish(candidate, lease, completion);
        input.onAttempt?.(candidate.provider.id, candidate.route.model, completion);
        if (text) return { ok: true, text };
        if (!retryFormat || formatRetry) break;
        formatRetry = true;
      }
      if (attempts >= maxAttempts || now() >= deadline) break;
    }
    return { ok: false, error: attempts ? "unreachable" : "slow" };
  } catch {
    // A failed ledger must never trigger unmetered calls or paid fallback.
    return { ok: false, error: "unreachable" };
  }
}
