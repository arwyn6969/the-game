import type {
  LearningSession,
  LearningPurpose,
  LearningCall,
  LearningReceipt,
} from "./learning-types";
import { LEARNING_GOAL, newPractice } from "./learning-practice";
import type { NpcId, AgentId } from "./types";

export const LEARNING_LIMITS = {
  calls: 12,
  questions: 2,
  reflection: 1,
  receipts: 32,
  completed: 8,
  text: 400,
} as const;
export const currentLearning = (state?: { sessions: LearningSession[] }) =>
  Array.isArray(state?.sessions) ? state.sessions.at(-1) : undefined;
export const emptyLearningUsage = () => ({
  requests: 1,
  providerAttempts: 0,
  attemptsUnknown: 1,
  knownTokens: 0,
  tokenSamples: 0,
  tokensUnknown: 1,
  elapsedMs: 0,
  failures: 0,
});
export function beginLesson(input: {
  id: string;
  followId: string;
  contextId: string;
  target: NpcId;
  now: number;
  variant: number;
}): LearningSession {
  return {
    id: input.id,
    followId: input.followId,
    contextId: input.contextId,
    target: input.target,
    revision: 1,
    status: "active",
    consent: "pending",
    goal: LEARNING_GOAL,
    startedAt: input.now,
    reason: "Ask and learn enabled. Teaching is voluntary; start with a before-instruction case.",
    questions: 0,
    answers: 0,
    reflected: false,
    trials: [
      newPractice("baseline", input.variant, input.id),
      newPractice("after", input.variant, input.id),
      newPractice("transfer", input.variant, input.id),
    ],
    calls: [],
    receipts: [],
  };
}
export function learningPurposes(s: LearningSession): LearningPurpose[] {
  if (
    s.status !== "active" ||
    s.calls.some((c) => c.status === "pending") ||
    s.calls.length >= LEARNING_LIMITS.calls ||
    s.receipts.length >= LEARNING_LIMITS.receipts
  )
    return [];
  const used = (p: LearningPurpose) => s.calls.filter((c) => c.purpose === p).length;
  const trial = (phase: string) => s.trials.find((t) => t.phase === phase)!;
  const out: LearningPurpose[] = [];
  const addPractice = (phase: "baseline" | "after" | "transfer") => {
    const t = trial(phase);
    if (!t.finished && !used(`${phase}-plan`)) out.push(`${phase}-plan`);
    else if (t.planned && !t.finished && !used(`${phase}-submit`)) out.push(`${phase}-submit`);
  };
  if (!trial("baseline").finished) addPractice("baseline");
  else if (s.consent === "pending" && !used("invite")) out.push("invite");
  else if (s.consent === "accepted") {
    if (s.questions > s.answers && used("answer") < 2) out.push("answer");
    else if (used("question") < 2) out.push("question");
    if (s.questions === s.answers) {
      if (!trial("after").finished) addPractice("after");
      else addPractice("transfer");
    }
  }
  if (!used("reflection") && trial("baseline").finished) out.push("reflection");
  return out;
}
export function reserveLearningCall(
  s: LearningSession,
  purpose: LearningPurpose,
  actor: AgentId,
  now: number,
  id: string,
): LearningCall | null {
  if (!learningPurposes(s).includes(purpose)) return null;
  const call: LearningCall = {
    id,
    purpose,
    actor,
    role: purpose === "invite" || purpose === "answer" ? "speaker" : "learner",
    status: "pending",
    at: now,
    usage: emptyLearningUsage(),
  };
  s.calls.push(call);
  if (purpose.endsWith("-plan") || purpose.endsWith("-submit"))
    s.trials.find((t) => purpose.startsWith(t.phase))!.attempts++;
  return call;
}
export function appendLearningReceipt(
  s: LearningSession,
  input: Omit<LearningReceipt, "id">,
  id: string,
) {
  if (s.receipts.some((r) => r.id === id)) return false;
  if (s.receipts.length >= LEARNING_LIMITS.receipts) {
    s.status = "paused";
    s.reason = "Lesson journal capacity reached. No further automatic actions are authorized.";
    s.revision++;
    return false;
  }
  s.receipts.push({
    id,
    ...input,
    text: input.text.slice(0, 400),
    sourceIds: input.sourceIds.slice(0, 12),
  });
  return true;
}
export function interruptLesson(s: LearningSession, reason: string, ended = false) {
  if (s.status === "ended") return;
  s.revision++;
  s.status = ended ? "ended" : "paused";
  s.reason = reason;
  for (const call of s.calls.filter((c) => c.status === "pending")) {
    call.status = "interrupted";
    const trial = s.trials.find((t) => call.purpose.startsWith(`${t.phase}-`));
    if (trial) trial.finished = true;
  }
}
