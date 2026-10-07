import type { Agent, AgentId, Face, Memory, MemoryType, Town } from "./types";
import { AGENT_IDS } from "./types";
import { compressDialogue, compressObservations, keywords } from "./memory";
import { SEED_TEXT } from "./town";
import { mentionsSeed, plain, purse } from "./text";
import { nearestWalkable } from "./world";

const KEY = "the-game-town-v1";
const FACES = new Set<Face>(["n", "s", "e", "w"]);
const MEMORY_TYPES = new Set<MemoryType>(["observe", "chat", "plan", "reflect", "favor"]);
const FAVOR_STATUS = new Set(["owed", "paid", "forgiven", "broken"]);

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}

function store(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

const OLD_SEED_TEXTS = new Set([
  "I want to find out who I am, where I came from, where I am going, and how to make some money. I will need friends and help.",
  "I still want to know who I am, where I came from, where I am going, and how to make some money. I am willing to be helped.",
]);
const OLD_NOTICE =
  "Pinned from the cafe: Kevin is asking, quietly, who he is and where he came from, and for help earning a living. — Arwyn";
const NEW_NOTICE =
  "Pinned from the cafe: Kevin is asking, quietly, who he is — not a place he came from, the man under the apron — and for help earning a living. — Arwyn";
const OLD_SELF = "Right now I am someone who has said, at least once, that he does not know where he came from.";
const NEW_SELF = "Right now I am someone who has said, at least once, that he does not know who he is.";

function reframeSeed(town: Town) {
  const kevin = town.agents.find((a) => a.id === "kevin");
  if (!kevin) return;
  if (typeof kevin.want === "string" && OLD_SEED_TEXTS.has(kevin.want)) kevin.want = SEED_TEXT;
  if (kevin.selfSentence === OLD_SELF) kevin.selfSentence = NEW_SELF;
  for (const thread of kevin.threads ?? []) {
    if (thread?.seed && OLD_SEED_TEXTS.has(thread.text)) thread.text = SEED_TEXT;
  }
  for (const memory of kevin.memories ?? []) {
    if (memory?.seed && OLD_SEED_TEXTS.has(memory.text)) {
      memory.text = SEED_TEXT;
      memory.keywords = keywords(SEED_TEXT);
    }
  }
  for (const note of town.notices ?? []) {
    if (note?.text === OLD_NOTICE) note.text = NEW_NOTICE;
  }
}

function repairSeed(kevin: Agent) {
  if (!Array.isArray(kevin.threads)) kevin.threads = [];
  if (!Array.isArray(kevin.memories)) kevin.memories = [];
  const hasSeed = kevin.threads.some((t) => t?.seed) || kevin.memories.some((m) => m?.seed);
  if (hasSeed) return;
  const thread = kevin.threads.find((t) => t && mentionsSeed(String(t.text ?? "")));
  if (thread) {
    thread.seed = true;
    thread.open = true;
    thread.hidden = true;
  } else {
    kevin.threads.unshift({
      id: "kevin-seed",
      text: SEED_TEXT,
      open: true,
      seed: true,
      hidden: true,
    });
  }
  const memory = kevin.memories.find((m) => m && mentionsSeed(String(m.text ?? "")));
  if (memory) {
    memory.seed = true;
    memory.protected = true;
    memory.type = memory.type === "observe" ? "reflect" : memory.type;
  } else {
    kevin.memories.unshift({
      id: "m-seed",
      day: 1,
      minute: 0,
      type: "reflect",
      text: SEED_TEXT,
      importance: 10,
      keywords: keywords(SEED_TEXT),
      protected: true,
      seed: true,
    });
  }
}

function cleanMemory(memory: Memory, fallbackDay: number): Memory | null {
  if (!memory || typeof memory.text !== "string" || !memory.text.trim()) return null;
  const type = MEMORY_TYPES.has(memory.type) ? memory.type : "observe";
  return {
    ...memory,
    type,
    text: memory.text.replace(/\s+/g, " ").trim().slice(0, 420),
    day: Number.isFinite(memory.day) ? memory.day : fallbackDay,
    minute: Number.isFinite(memory.minute) ? Math.max(0, Math.min(1439, Math.floor(memory.minute))) : 0,
    importance: Number.isFinite(memory.importance) ? Math.max(1, Math.min(10, Math.round(memory.importance))) : 5,
    keywords:
      Array.isArray(memory.keywords) && memory.keywords.some((w) => typeof w === "string" && w.length > 2)
        ? memory.keywords.filter((w) => typeof w === "string").slice(0, 24)
        : keywords(memory.text),
    protected: Boolean(memory.protected || memory.seed || mentionsSeed(memory.text)),
    seed: Boolean(memory.seed),
  };
}

export function validateTown(value: unknown): value is Town {
  if (!value || typeof value !== "object") return false;
  const town = value as Town;
  if (town.version !== 1) return false;
  if (!Array.isArray(town.agents) || town.agents.length !== AGENT_IDS.length) return false;
  const ids = new Set(town.agents.map((a) => a?.id));
  if (AGENT_IDS.some((id) => !ids.has(id))) return false;
  if (typeof town.day !== "number" || !Number.isFinite(town.day) || town.day < 1) return false;
  if (typeof town.minute !== "number" || !Number.isFinite(town.minute)) return false;
  town.day = Math.floor(town.day);
  town.minute = Math.max(0, Math.min(1439, Math.floor(town.minute)));
  if (typeof town.playerName !== "string" || !town.playerName.trim()) return false;
  town.playerName = plain(town.playerName, 18) || "Ada";
  const kevin = town.agents.find((a) => a.id === "kevin");
  if (!kevin) return false;
  repairSeed(kevin);
  reframeSeed(town);
  if (!Array.isArray(town.notices)) town.notices = [];
  if (!Array.isArray(town.favors)) town.favors = [];
  if (!Array.isArray(town.scrub)) town.scrub = [];
  if (!town.tills || typeof town.tills !== "object") town.tills = { cafe: 0, grocery: 0 };
  town.tills.cafe = purse(town.tills.cafe, 999);
  town.tills.grocery = purse(town.tills.grocery, 999);
  town.colocation = town.colocation && typeof town.colocation === "object" ? town.colocation : {};
  town.retrievals = Array.isArray(town.retrievals) ? town.retrievals : [];
  town.paused = Boolean(town.paused);
  town.sawHint = Boolean(town.sawHint);
  town.guide = town.sawHint ? 3 : Number.isFinite(town.guide) ? Math.max(0, Math.min(3, Math.floor(town.guide))) : 0;
  town.askedMindDay = Number.isFinite(town.askedMindDay) ? town.askedMindDay : 0;
  let maxId = 1;
  const bump = (id: unknown) => {
    const n = Number(String(id ?? "").replace(/^\D+/g, ""));
    if (Number.isFinite(n) && n >= maxId) maxId = Math.floor(n) + 1;
  };
  for (const agent of town.agents) {
    if (!isAgentId(agent.id)) return false;
    agent.tile = nearestWalkable(Number(agent.tile?.x), Number(agent.tile?.y));
    agent.home = nearestWalkable(Number(agent.home?.x), Number(agent.home?.y));
    if (!FACES.has(agent.face)) agent.face = "s";
    agent.money = purse(agent.money);
    agent.name = typeof agent.name === "string" && agent.name.trim() ? plain(agent.name, 18) : agent.id;
    if (agent.id === "player") agent.name = town.playerName;
    agent.identity = typeof agent.identity === "string" ? agent.identity.slice(0, 800) : "";
    agent.selfSentence = typeof agent.selfSentence === "string" ? agent.selfSentence.slice(0, 220) : "";
    agent.want = typeof agent.want === "string" ? agent.want.slice(0, 280) : "";
    agent.status = typeof agent.status === "string" ? agent.status.slice(0, 140) : "between places";
    agent.role = typeof agent.role === "string" ? agent.role.slice(0, 40) : "Resident";
    agent.path = [];
    agent.projects = Array.isArray(agent.projects) ? agent.projects.filter((p) => p && typeof p.text === "string") : [];
    agent.relationships = agent.relationships && typeof agent.relationships === "object" ? agent.relationships : {};
    for (const key of Object.keys(agent.relationships)) {
      if (!isAgentId(key)) {
        delete agent.relationships[key as AgentId];
        continue;
      }
      const rel = agent.relationships[key as AgentId];
      if (!rel) {
        delete agent.relationships[key as AgentId];
        continue;
      }
      const score = Number(rel.score);
      rel.score = Number.isFinite(score) ? Math.max(-3, Math.min(3, Math.round(score))) : 0;
      rel.note = typeof rel.note === "string" ? rel.note.slice(0, 180) : "";
    }
    agent.lastTalk = agent.lastTalk && typeof agent.lastTalk === "object" ? agent.lastTalk : {};
    agent.threads = Array.isArray(agent.threads) ? agent.threads.filter((t) => t && typeof t.text === "string") : [];
    agent.memories = (Array.isArray(agent.memories) ? agent.memories : [])
      .map((m) => cleanMemory(m, town.day))
      .filter((m): m is Memory => Boolean(m));
    if (!agent.plan || typeof agent.plan !== "object") {
      agent.plan = { day: town.day, summary: "Between places.", beats: [] };
    }
    if (!Array.isArray(agent.plan.beats)) agent.plan.beats = [];
    if (typeof agent.plan.summary !== "string") agent.plan.summary = "Between places.";
    agent.newMemories = Number.isFinite(agent.newMemories) ? Math.max(0, agent.newMemories) : 0;
    agent.shiftHours = Number.isFinite(agent.shiftHours) ? Math.max(0, agent.shiftHours) : 0;
    agent.paidToday = Boolean(agent.paidToday);
    agent.callUsed = Boolean(agent.callUsed);
    if (agent.bubble && !Number.isFinite(agent.bubble.until)) delete agent.bubble;
    compressObservations(agent);
    compressDialogue(agent);
    bump(agent.id);
    for (const memory of agent.memories) bump(memory.id);
    for (const thread of agent.threads) bump(thread.id);
    for (const project of agent.projects) bump(project.id);
  }
  town.notices = town.notices.filter((n) => n && isAgentId(n.author) && typeof n.text === "string" && n.text.trim());
  if (town.notices.length > 48) {
    const keepSeed = town.notices.filter((n) => mentionsSeed(n.text));
    const rest = town.notices.filter((n) => !mentionsSeed(n.text)).slice(-Math.max(0, 48 - keepSeed.length));
    town.notices = [...rest, ...keepSeed].slice(-48);
  }
  town.favors = town.favors.filter(
    (f) => f && isAgentId(f.from) && isAgentId(f.to) && f.from !== f.to && FAVOR_STATUS.has(f.status) && typeof f.text === "string",
  );
  for (const favor of town.favors) {
    favor.amount = purse(favor.amount, 30);
    bump(favor.id);
  }
  town.scrub = town.scrub.filter((frame) => frame && Number.isFinite(frame.m) && Array.isArray(frame.p));
  if (town.scrub.length > 10080) town.scrub.splice(0, town.scrub.length - 10080);
  town.retrievals = town.retrievals
    .filter((r) => r && isAgentId(r.agentId) && typeof r.question === "string")
    .slice(-36);
  for (const row of town.retrievals) bump(row.id);
  for (const note of town.notices) bump(note.id);
  const seen = new Set<string>();
  const unique = (id: string | undefined, prefix: string) => {
    if (!id || seen.has(id)) {
      const next = `${prefix}${maxId++}`;
      seen.add(next);
      return next;
    }
    seen.add(id);
    return id;
  };
  for (const favor of town.favors) favor.id = unique(favor.id, "f");
  for (const note of town.notices) note.id = unique(note.id, "n");
  for (const agent of town.agents) {
    for (const thread of agent.threads ?? []) thread.id = unique(thread.id, "th");
    for (const project of agent.projects ?? []) project.id = unique(project.id, "p");
    for (const memory of agent.memories ?? []) memory.id = unique(memory.id, "m");
  }
  town.nextId = Math.max(maxId, Number.isFinite(town.nextId) ? Math.floor(town.nextId) : 1);
  return true;
}

function serialize(town: Town): string {
  const clone = JSON.parse(JSON.stringify(town)) as Town;
  for (const agent of clone.agents) agent.path = [];
  return JSON.stringify({ version: 1, town: clone });
}

function shed(town: Town) {
  for (const agent of town.agents) {
    const bulky = agent.memories.filter(
      (m) => !m.protected && !m.seed && !mentionsSeed(m.text) && m.type !== "favor" && m.type !== "reflect",
    );
    bulky.sort((a, b) => a.day - b.day || a.minute - b.minute);
    const drop = new Set(bulky.slice(0, 12).map((m) => m.id));
    if (drop.size) agent.memories = agent.memories.filter((m) => !drop.has(m.id));
  }
  const settled = town.favors.filter((f) => f.status !== "owed");
  if (settled.length > 20) {
    const drop = new Set(settled.slice(0, settled.length - 20).map((f) => f.id));
    town.favors = town.favors.filter((f) => !drop.has(f.id));
  }
  if (town.notices.length > 16) {
    const keep = town.notices.filter((n) => mentionsSeed(n.text));
    const rest = town.notices.filter((n) => !mentionsSeed(n.text));
    town.notices = [...rest.slice(-(16 - Math.min(keep.length, 8))), ...keep].slice(-24);
  }
  if (town.retrievals.length > 8) town.retrievals.splice(0, town.retrievals.length - 8);
  if (town.scrub.length > 180) town.scrub.splice(0, town.scrub.length - 180);
}

export function loadTown(): Town | null {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { version?: number; town?: unknown };
    if (!validateTown(data.town)) return null;
    return data.town;
  } catch {
    return null;
  }
}

export function saveTown(town: Town) {
  const box = store();
  if (!box) return;
  try {
    box.setItem(KEY, serialize(town));
  } catch {
    try {
      shed(town);
      box.setItem(KEY, serialize(town));
    } catch {
      try {
        shed(town);
        box.setItem(KEY, serialize(town));
      } catch {
        /* The live town keeps running even if this browser cannot store it. */
      }
    }
  }
}

export function exportTown(town: Town): string {
  const clone = JSON.parse(JSON.stringify(town)) as Town;
  for (const agent of clone.agents) agent.path = [];
  return JSON.stringify({ version: 1, town: clone }, null, 2);
}

export function parseTownFile(text: string): Town | null {
  try {
    if (text.length > 1_500_000) return null;
    const data = JSON.parse(text) as { version?: number; town?: unknown };
    const town = data && typeof data === "object" && "town" in data ? data.town : data;
    if (!validateTown(town)) return null;
    return town;
  } catch {
    return null;
  }
}
