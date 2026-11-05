import { z } from "zod";
import type { LearningDecision } from "../game/learning-types.ts";
const text = (max = 400) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) =>
        ![...v].some((c) => {
          const n = c.charCodeAt(0);
          return n === 127 || (n < 32 && ![9, 10, 13].includes(n));
        }),
    );
const ids = z.array(text(180)).max(12);
const decision = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inspect"), boxes: z.array(text(20)).min(1).max(3) }).strict(),
  z
    .object({
      kind: z.literal("submit"),
      box: text(20),
      historicalDate: z.enum(["confirmed", "unconfirmed"]),
      evidenceIds: ids,
    })
    .strict(),
  ...(["accept", "decline", "defer", "question", "answer", "reflect"] as const).map((kind) =>
    z.object({ kind: z.literal(kind), text: text(), sourceIds: ids.min(1) }).strict(),
  ),
  z.object({ kind: z.literal("pass") }).strict(),
]);
export function parseLearningDecision(raw: unknown): LearningDecision | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const r = decision.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Gateway syntax only. Live actor, context, permission and tools are rechecked by the engine. */
export function parseLearningEnvelope(value: unknown): LearningDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.task !== "follower-learning" ||
    Object.keys(row).length !== 2 ||
    !Object.hasOwn(row, "decision")
  )
    return null;
  return parseLearningDecision(row.decision);
}
export function parseLearningResponse(text: string): LearningDecision | null {
  try {
    // Match the gateway's JSON fence handling without accepting surrounding prose.
    const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return parseLearningEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
}
