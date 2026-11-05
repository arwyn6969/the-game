import type { NpcId } from "./types";

export type FollowPoint = { x: number; y: number };
export type FollowState = "accompanying" | "listening" | "waiting" | "paused" | "ended";
export type FollowEvidence = {
  eventId: string;
  recipient: "player";
  kind: "visit" | "speech" | "activity";
  at: number;
  place: string;
  text: string;
  speaker?: string;
  contextId?: string;
};
export type FollowSession = {
  id: string;
  target: NpcId;
  policyVersion: 1;
  controlRevision: number;
  state: FollowState;
  duration: 30 | 60 | 120;
  listen: boolean;
  startedAt: number;
  deadline: number;
  progressAt: number;
  lastObserved: FollowPoint;
  lastObservedAt: number;
  lastPlayer: FollowPoint;
  goal?: FollowPoint;
  contextId?: string;
  listener?: { contextId: string; revision: number };
  reason: string;
  endedAt?: number;
  evidence: FollowEvidence[];
};
export type Following = { version: 1; sessions: FollowSession[] };
