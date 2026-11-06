import { z } from "zod";
import type { Town } from "./types";
import { AGENT_IDS, NPC_IDS } from "./types";
import {
  LEARNING_GOAL,
  REFERENCE_METHOD,
  newPractice,
  inspectPractice,
  submitPractice,
} from "./learning-practice";

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
const natural = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1440);
const purpose = z.enum([
  "baseline-plan",
  "baseline-submit",
  "invite",
  "question",
  "answer",
  "after-plan",
  "after-submit",
  "transfer-plan",
  "transfer-submit",
  "reflection",
]);
export { parseLearningDecision } from "../lib/learning-actions";
const usage = z
  .object({
    requests: z.literal(1),
    providerAttempts: z.number().int().min(0).max(1),
    attemptsUnknown: z.number().int().min(0).max(1),
    knownTokens: natural,
    tokenSamples: z.number().int().min(0).max(1),
    tokensUnknown: z.number().int().min(0).max(1),
    elapsedMs: natural,
    failures: z.number().int().min(0).max(1),
  })
  .strict();
const receipt = z
  .object({
    id: text(180),
    kind: z.enum(["event", "claim", "interpretation"]),
    at: natural,
    actor: z.enum(AGENT_IDS),
    text: text(),
    sourceIds: ids,
  })
  .strict();
const trial = z
  .object({
    phase: z.enum(["baseline", "after", "transfer"]),
    caseId: text(180),
    variant: z.number().int().min(0).max(2),
    inspected: z.array(text(20)).max(3),
    observations: z.array(z.object({ id: text(180), text: text() }).strict()).max(3),
    planned: z.boolean(),
    finished: z.boolean(),
    result: z
      .object({
        box: text(20),
        historicalDate: z.enum(["confirmed", "unconfirmed"]),
        correct: z.boolean(),
        explanation: text(),
        evidenceIds: ids,
      })
      .strict()
      .optional(),
    attempts: z.number().int().min(0).max(2),
  })
  .strict()
  .refine((t) => {
    const expected = newPractice(
      t.phase,
      t.variant,
      t.caseId.slice(0, t.caseId.lastIndexOf(":practice:")),
    );
    if (t.caseId !== expected.caseId) return false;
    if (t.planned && !inspectPractice(expected, t.inspected)) return false;
    if (!t.planned && t.inspected.length) return false;
    if (JSON.stringify(t.observations) !== JSON.stringify(expected.observations)) return false;
    if (t.result) {
      if (
        !submitPractice(expected, t.result) ||
        !t.finished ||
        ["box", "historicalDate", "correct", "explanation"].some(
          (key) =>
            t.result![key as keyof typeof t.result] !==
            expected.result![key as keyof typeof expected.result],
        ) ||
        JSON.stringify(t.result.evidenceIds) !== JSON.stringify(expected.result?.evidenceIds)
      )
        return false;
    }
    return true;
  });
const method = z
  .object({
    id: z.literal("reference-check-v1"),
    prerequisites: z.array(text()).max(6),
    procedure: z.array(text()).max(6),
    permittedActions: z.array(text()).max(6),
    sourceIds: ids,
    limitations: z.array(text()).max(6),
  })
  .strict()
  .refine(
    (m) =>
      m.sourceIds.includes(REFERENCE_METHOD.sourceIds[0]) &&
      JSON.stringify({ ...m, sourceIds: REFERENCE_METHOD.sourceIds }) ===
        JSON.stringify(REFERENCE_METHOD),
  );
const lesson = z
  .object({
    id: text(180),
    followId: text(180),
    contextId: text(180),
    target: z.enum(NPC_IDS),
    revision: natural,
    status: z.enum(["active", "paused", "ended"]),
    consent: z.enum(["pending", "accepted", "declined", "deferred"]),
    goal: z.literal(LEARNING_GOAL),
    startedAt: natural,
    reason: text(),
    questions: z.number().int().min(0).max(2),
    answers: z.number().int().min(0).max(2),
    reflected: z.boolean(),
    method: method.optional(),
    attention: z
      .object({ revision: natural, previousMode: z.enum(["listening", "participating"]) })
      .strict()
      .optional(),
    trials: z.array(trial).length(3),
    calls: z
      .array(
        z
          .object({
            id: text(180),
            compute: z
              .object({
                provider: text(100),
                model: text(160),
                maxOutputTokens: z.number().int().min(1).max(1200),
                maxPromptCharacters: z.literal(14000),
              })
              .strict()
              .optional(),
            purpose,
            actor: z.enum(AGENT_IDS),
            role: z.enum(["speaker", "learner"]),
            status: z.enum(["pending", "applied", "rejected", "unavailable", "interrupted"]),
            at: natural,
            usage,
          })
          .strict(),
      )
      .max(12),
    receipts: z.array(receipt).max(32),
  })
  .strict()
  .refine((s) => {
    const count = (p: string) => s.calls.filter((c) => c.purpose === p).length;
    const applied = (p: string) =>
      s.calls.filter((c) => c.purpose === p && c.status === "applied").length;
    return (
      new Set(s.calls.map((c) => c.id)).size === s.calls.length &&
      new Set(s.receipts.map((c) => c.id)).size === s.receipts.length &&
      new Set(s.trials.map((t) => t.phase)).size === 3 &&
      s.revision >= 1 &&
      s.answers <= s.questions &&
      s.questions <= applied("question") &&
      s.answers <= applied("answer") &&
      (!s.reflected || applied("reflection") === 1) &&
      s.calls.filter((c) => c.status === "pending").length <= 1 &&
      s.calls.every(
        (c) =>
          count(c.purpose) <= (["question", "answer"].includes(c.purpose) ? 2 : 1) &&
          c.actor === (c.role === "learner" ? "player" : s.target) &&
          c.role === (["invite", "answer"].includes(c.purpose) ? "speaker" : "learner"),
      ) &&
      s.trials.every(
        (t) =>
          t.caseId === `${s.id}:practice:${t.phase}:${t.variant}` &&
          t.attempts === s.calls.filter((c) => c.purpose.startsWith(`${t.phase}-`)).length,
      ) &&
      (s.consent !== "accepted" || (s.method && applied("invite") === 1))
    );
  });
const state = z
  .object({ version: z.literal(1), sessions: z.array(lesson).max(9) })
  .strict()
  .refine(
    (s) =>
      s.sessions.filter((r) => r.status === "ended").length <= 8 &&
      s.sessions.slice(0, -1).every((r) => r.status === "ended") &&
      new Set(s.sessions.map((r) => r.followId)).size === s.sessions.length &&
      new Set(s.sessions.map((r) => r.id)).size === s.sessions.length,
  );
export function validateFollowerLearning(town: Town) {
  if (!Object.hasOwn(town, "followerLearning")) return [];
  const parsed = state.safeParse(town.followerLearning);
  const now = (town.day - 1) * 1440 + town.minute;
  return town.version === 2 &&
    parsed.success &&
    parsed.data.sessions.every(
      (s) =>
        s.startedAt <= now &&
        s.calls.every((c) => c.at >= s.startedAt && c.at <= now) &&
        s.receipts.every((r) => r.at >= s.startedAt && r.at <= now),
    )
    ? []
    : [
        "Follower learning records are unsupported or inconsistent. Keep the original town bytes for recovery.",
      ];
}
