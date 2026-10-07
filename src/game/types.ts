export const AGENT_IDS = [
  "kevin",
  "arwyn",
  "northern",
  "baba",
  "sub",
  "player",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const NPC_IDS = [
  "kevin",
  "arwyn",
  "northern",
  "baba",
  "sub",
] as const satisfies readonly AgentId[];

export type NpcId = (typeof NPC_IDS)[number];

export const PLACE_IDS = [
  "cafe",
  "library",
  "dorms",
  "park",
  "townhouses",
  "grocery",
  "noticeboard",
  "plaza",
  "street",
] as const;

export type PlaceId = (typeof PLACE_IDS)[number];

export type MemoryType = "observe" | "chat" | "plan" | "reflect" | "favor";

export type Face = "n" | "s" | "e" | "w";

export type Spot = "home" | "out";

export type ProjectKind =
  | "shift"
  | "rumor"
  | "collab"
  | "debt"
  | "notes"
  | "notice"
  | "other";

export type Memory = {
  id: string;
  day: number;
  minute: number;
  type: MemoryType;
  text: string;
  importance: number;
  keywords: string[];
  protected?: boolean;
  seed?: boolean;
  with?: AgentId;
  mind?: "grok" | "offline";
};

export type Thread = {
  id: string;
  text: string;
  open: boolean;
  seed?: boolean;
  hidden?: boolean;
};

export type Relationship = {
  score: number;
  note: string;
};

export type Beat = {
  hour: number;
  place: PlaceId;
  status: string;
  spot: Spot;
};

export type Plan = {
  day: number;
  summary: string;
  beats: Beat[];
};

export type Project = {
  id: string;
  owner: AgentId;
  kind: ProjectKind;
  text: string;
  place?: PlaceId;
  status: "open" | "dropped" | "done";
  day: number;
};

export type Favor = {
  id: string;
  from: AgentId;
  to: AgentId;
  text: string;
  amount: number;
  status: "owed" | "paid" | "forgiven" | "broken";
  day: number;
};

export type Notice = {
  id: string;
  author: AgentId;
  day: number;
  minute: number;
  text: string;
};

export type RetrievalHit = {
  text: string;
  score: number;
  type: MemoryType;
};

export type RetrievalLog = {
  id: string;
  day: number;
  minute: number;
  agentId: AgentId;
  question: string;
  top: RetrievalHit[];
  seedInStream: boolean;
  seedRank: number | null;
  missed: boolean;
};

export type Agent = {
  id: AgentId;
  name: string;
  role: string;
  identity: string;
  selfSentence: string;
  want: string;
  home: { x: number; y: number };
  tile: { x: number; y: number };
  face: Face;
  money: number;
  relationships: Partial<Record<AgentId, Relationship>>;
  threads: Thread[];
  memories: Memory[];
  plan: Plan;
  projects: Project[];
  newMemories: number;
  shiftHours: number;
  paidToday: boolean;
  callUsed: boolean;
  path: { x: number; y: number }[];
  status: string;
  lastTalk: Partial<Record<AgentId, number>>;
  bubble?: { text: string; until: number };
};

export type ScrubFrame = { d?: number; m: number; p: number[] };

export type Town = {
  version: 1;
  day: number;
  minute: number;
  playerName: string;
  agents: Agent[];
  notices: Notice[];
  favors: Favor[];
  tills: { cafe: number; grocery: number };
  retrievals: RetrievalLog[];
  scrub: ScrubFrame[];
  nextId: number;
  colocation: Record<string, number>;
  askedMindDay: number;
  paused: boolean;
  sawHint: boolean;
  guide: number;
};

export type ThinkKind = "plan" | "reflect" | "talk" | "player";

export type ThinkJob =
  | { kind: "plan"; day: number; minute: number; weekly: boolean }
  | { kind: "reflect"; day: number; minute: number; agents: AgentId[]; weekly: boolean }
  | { kind: "talk"; day: number; minute: number; a: AgentId; b: AgentId }
  | { kind: "player"; day: number; minute: number; agentId: AgentId; text: string };

export type MindLine = { speaker: AgentId; text: string };

export type RelationshipEdit = {
  owner: AgentId;
  about: AgentId;
  delta: number;
  note: string;
};

export type FavorEdit = {
  action: "offer" | "pay" | "forgive" | "break";
  from: AgentId;
  to: AgentId;
  amount: number;
  text: string;
  id?: string;
};

export type ThreadEdit = {
  owner: AgentId;
  action: "open" | "rewrite" | "close";
  text: string;
  id?: string;
};

export type ProjectEdit = {
  owner: AgentId;
  action: "start" | "drop" | "done";
  kind: ProjectKind;
  text: string;
  place?: PlaceId;
  id?: string;
};

export type Block = {
  from: number;
  to: number;
  place: PlaceId;
  status: string;
  spot: Spot;
};

export type PlanDraft = {
  id: AgentId;
  summary: string;
  blocks: Block[];
  want?: string;
  selfSentence?: string;
  project?: ProjectEdit;
  thread?: ThreadEdit;
};

export type MindResult =
  | { kind: "plan"; mind: "grok" | "offline"; weekly?: boolean; plans: PlanDraft[] }
  | {
      kind: "reflect";
      mind: "grok" | "offline";
      agents: { id: AgentId; reflections: string[]; selfSentence?: string }[];
    }
  | {
      kind: "talk";
      mind: "grok" | "offline";
      a: AgentId;
      b: AgentId;
      lines: MindLine[];
      relationships: RelationshipEdit[];
      favor?: FavorEdit | null;
      thread?: ThreadEdit | null;
      notice?: { author: AgentId; text: string } | null;
      project?: ProjectEdit | null;
      replan?: { id: AgentId; blocks: Block[] }[];
      revealedSeed?: boolean;
    }
  | {
      kind: "player";
      mind: "grok" | "offline";
      agentId: AgentId;
      playerText: string;
      reply: string;
      delta: number;
      note: string;
      favor?: FavorEdit | null;
      thread?: ThreadEdit | null;
      notice?: { author: AgentId; text: string } | null;
      project?: ProjectEdit | null;
    };
