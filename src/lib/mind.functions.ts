import { createServerFn } from "@tanstack/react-start";
import { MIND_SYSTEM, requestMind, validateMindRequest } from "./mind.gateway";
import { authMiddleware } from "./auth/middleware";

export const mindAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const { budgetConfigured } = await import("./mind-budget/server.server");
  if (!budgetConfigured(process.env)) return { online: false, configured: false, actions: false };
  if (process.env.MIND_PROVIDER_MODE === "pool") {
    const { poolAvailable } = await import("./mind-pool/server");
    const configured = await poolAvailable();
    const actions = await poolAvailable(undefined, "act");
    return { online: configured, configured, actions };
  }
  if (process.env.MIND_PROVIDER_MODE && process.env.MIND_PROVIDER_MODE !== "legacy")
    return { online: false, configured: false, actions: false };
  const configured = Boolean(process.env.XAI_API_KEY);
  return { online: configured, configured, actions: false };
});

export const thinkTown = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { kind: string; user: string }) => validateMindRequest(data))
  .handler(async ({ data, context }) => {
    const { withMindBudget } = await import("./mind-budget/server.server");
    const budget = {
      kind: data.kind,
      user: data.user,
      system: MIND_SYSTEM,
      userId: context.userId,
    };
    if (process.env.MIND_PROVIDER_MODE === "pool") {
      const { thinkWithPool, loadPoolConfig } = await import("./mind-pool/server");
      const { candidatesFor } = await import("./mind-pool/config");
      try {
        const config = await loadPoolConfig();
        if (data.kind === "act") config.maxAttempts = 1;
        const candidates = candidatesFor(config, data.kind, process.env);
        if (!candidates.length) return { ok: false as const, error: "offline" };
        return withMindBudget({
          ...budget,
          maxAttempts: config.maxAttempts,
          maxOutputTokens: Math.max(...candidates.map((candidate) => candidate.route.maxTokens)),
          run: () => thinkWithPool(data.kind, data.user, MIND_SYSTEM, config),
        });
      } catch {
        return { ok: false as const, error: "unreachable" };
      }
    }
    if (data.kind === "act") return { ok: false as const, error: "offline" };
    if (process.env.MIND_PROVIDER_MODE && process.env.MIND_PROVIDER_MODE !== "legacy")
      return { ok: false as const, error: "offline" };
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return requestMind(data, { apiKey });
    return withMindBudget({
      ...budget,
      maxAttempts: 1,
      maxOutputTokens: data.kind === "plan" ? 1800 : data.kind === "player" ? 700 : 900,
      run: () => requestMind(data, { apiKey }),
    });
  });
