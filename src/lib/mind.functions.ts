import { createServerFn } from "@tanstack/react-start";
import { MIND_SYSTEM, requestMind, validateMindRequest } from "./mind.gateway";

const recent: number[] = [];

function allowCall(): boolean {
  const now = Date.now();
  while (recent.length && now - recent[0]! > 60_000) recent.shift();
  if (recent.length >= 12) return false;
  recent.push(now);
  return true;
}

export const mindAvailability = createServerFn({ method: "GET" }).handler(async () => {
  if (process.env.MIND_PROVIDER_MODE === "pool") {
    const { poolAvailable } = await import("./mind-pool/server");
    const configured = await poolAvailable();
    return { online: configured, configured };
  }
  if (process.env.MIND_PROVIDER_MODE && process.env.MIND_PROVIDER_MODE !== "legacy")
    return { online: false, configured: false };
  const configured = Boolean(process.env.XAI_API_KEY);
  return { online: configured, configured };
});

export const thinkTown = createServerFn({ method: "POST" })
  .validator((data: { kind: string; user: string }) => validateMindRequest(data))
  .handler(async ({ data }) => {
    if (process.env.MIND_PROVIDER_MODE === "pool") {
      const { thinkWithPool } = await import("./mind-pool/server");
      return thinkWithPool(data.kind, data.user, MIND_SYSTEM);
    }
    if (process.env.MIND_PROVIDER_MODE && process.env.MIND_PROVIDER_MODE !== "legacy")
      return { ok: false as const, error: "offline" };
    const apiKey = process.env.XAI_API_KEY;
    return requestMind(data, { apiKey, allowed: !apiKey || allowCall() });
  });
