import type { AgentId, NpcId, PlaceId } from "./types";

export type ItemLocation =
  | { kind: "ground"; tile: { x: number; y: number } }
  | { kind: "held"; holder: AgentId };

export type PhysicalItem = {
  id: string;
  kind: "manuscript";
  title: string;
  text: string;
  author: AgentId | null;
  owner: "town";
  revision: number;
  contentRevision: number;
  location: ItemLocation;
};

/** A bring intention combines approach, pickup and travel without extra inference. */
export type PhysicalDecision =
  | { kind: "bring"; itemId: string; itemRevision: number; destination: PlaceId }
  | { kind: "pick-up"; itemId: string; itemRevision: number }
  | { kind: "put-down"; itemId: string; itemRevision: number }
  | { kind: "read"; itemId: string; itemRevision: number }
  | { kind: "write"; itemId: string; itemRevision: number; title: string; text: string }
  | { kind: "speak"; text: string }
  | { kind: "wait" };

export type PhysicalActionResult = {
  ok: boolean;
  message: string;
  kind: PhysicalDecision["kind"];
  itemId?: string;
  content?: { title: string; text: string; revision: number; author: AgentId | null };
};

export type PhysicalIntent = {
  kind: "bring" | "pick-up";
  itemId: string;
  itemRevision: number;
  destination?: PlaceId;
  phase: "approach" | "carry";
  startedAt: number;
  deadlineAt: number;
};

export type PhysicalUsage = {
  requests: number;
  providerAttempts: number;
  attemptsUnknown: number;
  knownTokens: number;
  tokenSamples: number;
  tokensUnknown: number;
  elapsedMs: number;
  failures: number;
};

export type PhysicalSession = {
  actor: NpcId;
  revision: number;
  enabled: boolean;
  waiting: boolean;
  decisions: number;
  maxDecisions: number;
  intent: PhysicalIntent | null;
  lastResult: PhysicalActionResult | null;
  /** This actor read this content revision in the current bounded sequence. */
  readContentRevision?: number;
  usage: PhysicalUsage;
};

export type PhysicalItemsState = {
  version: 1;
  items: PhysicalItem[];
  session: PhysicalSession | null;
  /** Current supported pose only; not a historical animation record. */
  reading?: { actor: AgentId; itemId: string; contentRevision: number; until: number };
};

export type PhysicalUsageSample = {
  elapsedMs: number;
  attempts: number | null;
  totalTokens: number | null;
  success: boolean;
};
