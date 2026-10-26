import type { AgentId, NpcId } from "./types";
import type { PhysicalUsage, PhysicalUsageSample } from "./physical-types";

export type DiscussionTime = { day: number; minute: number };
export type DiscussionDecision =
  | {
      kind:
        | "read-invitation"
        | "ignore"
        | "accept"
        | "decline"
        | "listen"
        | "participate"
        | "stop-listening"
        | "request-turn"
        | "withdraw-turn"
        | "pass"
        | "leave"
        | "close";
    }
  | { kind: "speak"; text: string };
export type DiscussionCommand = (DiscussionDecision | { kind: "invite"; invitee: AgentId }) & {
  meetingId: string;
  /** The acting member's revision, not the whole meeting's revision. */
  expectedRevision: number;
  commandId: string;
};
export type DiscussionMember = {
  id: AgentId;
  invitation: "unseen" | "delivered";
  choice: "pending" | "accepted" | "declined" | "left";
  role: "facilitator" | "participant";
  revision: number;
  mode: "off" | "listening" | "participating";
  arrived: boolean;
  decisionNeeded: boolean;
  noticedCue: boolean;
};
export type DiscussionUtterance = {
  id: string;
  seq: number;
  speaker: AgentId;
  text: string;
  at: DiscussionTime;
  speakerTile: { x: number; y: number };
  recipientIds: AgentId[];
  source: "statement";
  mind: "grok" | "player";
};
export type DiscussionSession = {
  id: string;
  revision: number;
  /** Invalidates requests on pause, resume and close only. */
  epoch: number;
  topic: string;
  venue: "library";
  facilitator: NpcId;
  status: "gathering" | "active" | "paused" | "closed";
  reason: string;
  createdAt: DiscussionTime;
  members: DiscussionMember[];
  queue: AgentId[];
  floor: { actor: AgentId; id: string } | null;
  utterances: DiscussionUtterance[];
  decisions: number;
  usage: PhysicalUsage;
  pending: { actor: NpcId; key: string } | null;
  commands: string[];
};
export type DiscussionState = { version: 1; sessions: DiscussionSession[] };
export type DiscussionJob = {
  kind: "act";
  task: "discussion";
  day: number;
  minute: number;
  agentId: NpcId;
  meetingId: string;
  sessionRevision: number;
  actorRevision: number;
  turnId: string | null;
};
export type DiscussionResult = {
  kind: "act";
  task: "discussion";
  mind: "grok";
  agentId: NpcId;
  meetingId: string;
  sessionRevision: number;
  actorRevision: number;
  turnId: string | null;
  decision: DiscussionDecision;
};
export type DiscussionAction = { kind: DiscussionDecision["kind"]; label: string };
export type DiscussionActionResult = { ok: boolean; message: string; meetingId?: string };
export type DiscussionView = {
  meeting:
    | (Pick<
        DiscussionSession,
        | "id"
        | "revision"
        | "topic"
        | "venue"
        | "facilitator"
        | "status"
        | "reason"
        | "decisions"
        | "usage"
      > & {
        utterances: Omit<DiscussionUtterance, "recipientIds">[];
        queue: AgentId[];
        floor: DiscussionSession["floor"];
      })
    | null;
  actorRevision: number;
  actions: DiscussionAction[];
  canJoin: boolean;
  isListening: boolean;
  isPresent: boolean;
  ownTurn: boolean;
  canInviteIds: AgentId[];
  invitations: {
    id: AgentId;
    name: string;
    delivered: boolean;
    choice: DiscussionMember["choice"];
  }[];
  /** Public roster; never a census of hidden eligible listeners. */
  roster: {
    id: AgentId;
    name: string;
    choice: DiscussionMember["choice"];
    arrived: boolean;
    mode: DiscussionMember["mode"];
    role: DiscussionMember["role"];
  }[];
};
export type DiscussionUsageSample = PhysicalUsageSample;
