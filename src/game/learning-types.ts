import type { AgentId, NpcId } from "./types";
import type { PhysicalUsage } from "./physical-types";
export type LearningPurpose =
  | "baseline-plan"
  | "baseline-submit"
  | "invite"
  | "question"
  | "answer"
  | "after-plan"
  | "after-submit"
  | "transfer-plan"
  | "transfer-submit"
  | "reflection";
export type PracticePhase = "baseline" | "after" | "transfer";
export type LearningReceipt = {
  id: string;
  kind: "event" | "claim" | "interpretation";
  at: number;
  actor: AgentId;
  text: string;
  sourceIds: string[];
};
export type PracticeTrial = {
  phase: PracticePhase;
  caseId: string;
  variant: number;
  inspected: string[];
  observations: { id: string; text: string }[];
  planned: boolean;
  finished: boolean;
  result?: {
    box: string;
    historicalDate: "confirmed" | "unconfirmed";
    correct: boolean;
    explanation: string;
    evidenceIds: string[];
  };
  attempts: number;
};
export type LearningCall = {
  compute?: {
    provider: string;
    model: string;
    maxOutputTokens: number;
    maxPromptCharacters: 14000;
  };
  id: string;
  purpose: LearningPurpose;
  actor: AgentId;
  role: "speaker" | "learner";
  status: "pending" | "applied" | "rejected" | "unavailable" | "interrupted";
  at: number;
  usage: PhysicalUsage;
};
export type LearnedMethod = {
  id: "reference-check-v1";
  prerequisites: string[];
  procedure: string[];
  permittedActions: string[];
  sourceIds: string[];
  limitations: string[];
};
export type LearningSession = {
  id: string;
  followId: string;
  target: NpcId;
  contextId: string;
  revision: number;
  status: "active" | "paused" | "ended";
  consent: "pending" | "accepted" | "declined" | "deferred";
  goal: "Check current references without inventing a historical date";
  startedAt: number;
  reason: string;
  questions: number;
  answers: number;
  reflected: boolean;
  method?: LearnedMethod;
  attention?: { revision: number; previousMode: "listening" | "participating" };
  trials: PracticeTrial[];
  calls: LearningCall[];
  receipts: LearningReceipt[];
};
export type LearningState = { version: 1; sessions: LearningSession[] };
export type LearningJob = {
  discussionJob?: import("./discussion-types").DiscussionJob;
  id: string;
  lessonId: string;
  purpose: LearningPurpose;
  actor: AgentId;
  revision: number;
  followRevision: number;
  contextId: string;
  epoch: number;
  memberRevision: number;
  turnId: string | null;
};
export type LearningDecision =
  | { kind: "inspect"; boxes: string[] }
  | {
      kind: "submit";
      box: string;
      historicalDate: "confirmed" | "unconfirmed";
      evidenceIds: string[];
    }
  | { kind: "accept" | "decline" | "defer"; text: string; sourceIds: string[] }
  | { kind: "question" | "answer" | "reflect"; text: string; sourceIds: string[] }
  | { kind: "pass" };
