import { createServerFn } from "@tanstack/react-start";
import { requestMind, validateMindRequest } from "./mind.gateway";

const recent: number[] = [];

function allowCall(): boolean {
  const now = Date.now();
  while (recent.length && now - recent[0]! > 60_000) recent.shift();
  if (recent.length >= 12) return false;
  recent.push(now);
  return true;
}

export const mindAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const configured = Boolean(process.env.XAI_API_KEY);
  return { online: configured, configured };
});

export const thinkTown = createServerFn({ method: "POST" })
  .validator((data: { kind: string; user: string }) => validateMindRequest(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    return requestMind(data, { apiKey, allowed: !apiKey || allowCall() });
  });
