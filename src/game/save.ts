import type { Agent, AgentId, Face, Memory, MemoryType, Town } from "./types";
import { AGENT_IDS } from "./types";
import { compressDialogue, compressObservations, keywords } from "./memory";
import { addSpecialists, SEED_TEXT } from "./town";
import { mentionsSeed, plain, purse } from "./text";
import { nearestWalkable } from "./world";
import { refreshResidentStatus } from "./navigation";

export const TOWN_STORAGE_KEY = "the-game-town-v2";
export const LEGACY_TOWN_STORAGE_KEY = "the-game-town-v1";
const LEGACY_IDS = ["kevin", "arwyn", "northern", "baba", "sub", "player"] as const;
export const MAX_TOWN_FILE_BYTES = 8 * 1024 * 1024;

export type SaveResult =
  | { ok: true; bytes: number; replayOmitted: boolean }
  | { ok: false; reason: "unavailable" | "serialization" | "quota" | "storage" };

let lastSaveResult: SaveResult | null = null;

export function getLastSaveResult(): SaveResult | null {
  return lastSaveResult;
}
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
const OLD_SELF =
  "Right now I am someone who has said, at least once, that he does not know where he came from.";
const NEW_SELF =
  "Right now I am someone who has said, at least once, that he does not know who he is.";

const RESIDENT_LINES: [string, string][] = [
  [
    "Arwyn lives in the back room of the library, among boxes nobody has catalogued since the college shrank. She is a researcher by temperament more than by paycheck: margins, dates, the way a person tells a story twice and changes one fact. She dresses like the stacks, grey-green and unfussy, and she listens longer than is comfortable. Origins are her private weather. She believes a town is a set of documents that learned to walk.",
    "Arwyn lives in the back room of the library, among boxes nobody has catalogued since the college shrank. He is a researcher by temperament more than by paycheck: margins, dates, the way a person tells a story twice and changes one fact. He dresses like the stacks, grey-green and unfussy, and he listens longer than is comfortable. Origins are his private weather. He believes a town is a set of documents that learned to walk.",
  ],
  [
    "Baba runs the counter at the grocery and keeps the produce honest. She is practical to the bone: weights, change, who promised to pay on Thursday. She does not romanticize the town and does not swindle it either. A mental tab of debts, favors, and forgiven sums is her real ledger. She speaks in short sentences and expects the same. People underestimate how much she has already noticed.",
    "Baba runs the counter at the grocery and keeps the produce honest. He is practical to the bone: weights, change, who promised to pay on Thursday. He does not romanticize the town and does not swindle it either. A mental tab of debts, favors, and forgiven sums is his real ledger. He speaks in short sentences and expects the same. People underestimate how much he has already noticed.",
  ],
  [
    "Sub writes beside the park path, usually on a bench that faces the pond. Other people's days are the raw material: a quarrel, a generous pour, a student counting coins. Sub turns them into stories and sometimes gets them wrong — a glance becomes a romance, a debt becomes a curse, a question becomes a confession with better lighting. Sub is not trying to lie. The page wants a shape, and the truth is rarely shaped.",
    "Sub writes beside the park path, usually on a bench that faces the pond. Other people's days are the raw material: a quarrel, a generous pour, a student counting coins. He turns them into stories and sometimes gets them wrong — a glance becomes a romance, a debt becomes a curse, a question becomes a confession with better lighting. He is not trying to lie. The page wants a shape, and the truth is rarely shaped.",
  ],
  ["at the cafe, listening more than she drinks", "at the cafe, listening more than he drinks"],
  ["home on the row, the tab already in her head", "home on the row, the tab already in his head"],
  [
    "Right now I am still the one who reads a life before she interrupts it.",
    "Right now I am still the one who reads a life before I interrupt it.",
  ],
  [
    "She listened when I said I do not know who I am, and she did not turn it into a place.",
    "He listened when I said I do not know who I am, and he did not turn it into a place.",
  ],
  [
    "She let me eat on a tab of 2 and did not pretend it was kindness without a number.",
    "He let me eat on a tab of 2 and did not pretend it was kindness without a number.",
  ],
];

function maleLine(text: string): string {
  for (const [from, to] of RESIDENT_LINES) if (text === from) return to;
  return text;
}

function reframeResidents(town: Town) {
  for (const agent of town.agents) {
    if (typeof agent.identity === "string") agent.identity = maleLine(agent.identity);
    if (typeof agent.status === "string") agent.status = maleLine(agent.status);
    if (typeof agent.selfSentence === "string") agent.selfSentence = maleLine(agent.selfSentence);
    for (const beat of agent.plan?.beats ?? []) {
      if (beat && typeof beat.status === "string") beat.status = maleLine(beat.status);
    }
    for (const rel of Object.values(agent.relationships ?? {})) {
      if (rel && typeof rel.note === "string") rel.note = maleLine(rel.note);
    }
    for (const memory of agent.memories ?? []) {
      if (!memory || typeof memory.text !== "string") continue;
      const next = maleLine(memory.text);
      if (next === memory.text) continue;
      memory.text = next;
      memory.keywords = keywords(next);
    }
  }
}

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
    minute: Number.isFinite(memory.minute)
      ? Math.max(0, Math.min(1439, Math.floor(memory.minute)))
      : 0,
    importance: Number.isFinite(memory.importance)
      ? Math.max(1, Math.min(10, Math.round(memory.importance)))
      : 5,
    keywords:
      Array.isArray(memory.keywords) &&
      memory.keywords.some((w) => typeof w === "string" && w.length > 2)
        ? memory.keywords.filter((w) => typeof w === "string").slice(0, 24)
        : keywords(memory.text),
    protected: Boolean(memory.protected || memory.seed || mentionsSeed(memory.text)),
    seed: Boolean(memory.seed),
    source: ["event", "statement", "reflection"].includes(memory.source ?? "")
      ? memory.source
      : undefined,
    turns: Array.isArray(memory.turns)
      ? memory.turns
          .filter(
            (turn) =>
              turn && isAgentId(turn.speaker) && typeof turn.text === "string" && turn.text.trim(),
          )
          .slice(-6)
          .map((turn) => ({ speaker: turn.speaker, text: plain(turn.text, 700) }))
      : undefined,
  };
}

export function validateTown(value: unknown): value is Town {
  if (!value || typeof value !== "object") return false;
  // The separate S1 ledger cannot be maintained by this runtime. Reject it
  // before migration or balance normalization so recovery retains its books.
  if (Object.hasOwn(value, "economy")) return false;
  const town = value as Town;
  const version = (value as { version?: unknown }).version;
  if (version !== 1 && version !== 2) return false;
  const expectedIds = version === 1 ? LEGACY_IDS : AGENT_IDS;
  if (!Array.isArray(town.agents) || town.agents.length !== expectedIds.length) return false;
  const ids = new Set(town.agents.map((a) => a?.id));
  if (expectedIds.some((id) => !ids.has(id))) return false;
  const originalRoster = town.agents.map((a) => a.id);
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
  reframeResidents(town);
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
  town.guide = town.sawHint
    ? 3
    : Number.isFinite(town.guide)
      ? Math.max(0, Math.min(3, Math.floor(town.guide)))
      : 0;
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
    agent.name =
      typeof agent.name === "string" && agent.name.trim() ? plain(agent.name, 18) : agent.id;
    if (agent.id === "player") agent.name = town.playerName;
    agent.identity = typeof agent.identity === "string" ? agent.identity.slice(0, 800) : "";
    agent.selfSentence =
      typeof agent.selfSentence === "string" ? agent.selfSentence.slice(0, 220) : "";
    agent.want = typeof agent.want === "string" ? agent.want.slice(0, 280) : "";
    agent.status = typeof agent.status === "string" ? agent.status.slice(0, 140) : "between places";
    agent.role = typeof agent.role === "string" ? agent.role.slice(0, 40) : "Resident";
    agent.path = [];
    agent.projects = Array.isArray(agent.projects)
      ? agent.projects.filter((p) => p && typeof p.text === "string")
      : [];
    agent.relationships =
      agent.relationships && typeof agent.relationships === "object" ? agent.relationships : {};
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
    agent.threads = Array.isArray(agent.threads)
      ? agent.threads.filter((t) => t && typeof t.text === "string")
      : [];
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
  town.notices = town.notices.filter(
    (n) => n && isAgentId(n.author) && typeof n.text === "string" && n.text.trim(),
  );
  if (town.notices.length > 48) {
    const keepSeed = town.notices.filter((n) => mentionsSeed(n.text));
    const rest = town.notices
      .filter((n) => !mentionsSeed(n.text))
      .slice(-Math.max(0, 48 - keepSeed.length));
    town.notices = [...rest, ...keepSeed].slice(-48);
  }
  town.favors = town.favors.filter(
    (f) =>
      f &&
      isAgentId(f.from) &&
      isAgentId(f.to) &&
      f.from !== f.to &&
      FAVOR_STATUS.has(f.status) &&
      typeof f.text === "string",
  );
  for (const favor of town.favors) {
    favor.amount = purse(favor.amount, 30);
    bump(favor.id);
  }
  town.scrub = town.scrub.filter(
    (frame) => frame && Number.isFinite(frame.m) && Array.isArray(frame.p),
  );
  town.scrub = town.scrub.filter((frame) => {
    const roster = frame.ids ?? originalRoster;
    if (
      !Array.isArray(roster) ||
      roster.some((id) => !isAgentId(id)) ||
      new Set(roster).size !== roster.length
    )
      return false;
    if (
      frame.p.length !== roster.length * 2 ||
      frame.p.some((position) => !Number.isFinite(position))
    )
      return false;
    frame.ids = [...roster];
    return true;
  });
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
  if (version === 1) {
    town.version = 2;
    addSpecialists(town);
  }
  for (const agent of town.agents) refreshResidentStatus(town, agent);
  return true;
}

function serialize(town: Town, omitReplay = false): string {
  const clone = JSON.parse(JSON.stringify(town)) as Town;
  for (const agent of clone.agents) agent.path = [];
  if (omitReplay) clone.scrub = [];
  return JSON.stringify({ version: 2, town: clone });
}

function isQuota(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return /QuotaExceededError|NS_ERROR_DOM_QUOTA_REACHED/i.test(`${name} ${message}`);
}

export function loadTown(): Town | null {
  const report = readTownSave();
  return report.status === "ready" ? report.town : null;
}

export type LoadReport =
  | { status: "missing" }
  | { status: "ready"; town: Town }
  | { status: "unreadable"; raw: string }
  | { status: "unavailable" };

/** Distinguishes an empty browser from a save that must not be overwritten. */
export function readTownSave(): LoadReport {
  let box: Storage | null;
  try {
    box = store();
  } catch {
    return { status: "unavailable" };
  }
  if (!box) return { status: "unavailable" };
  let raw: string | null;
  try {
    // Never overwrite or silently fall back from a damaged newer save.
    // The original v1 bytes remain available under their original key.
    raw = box.getItem(TOWN_STORAGE_KEY) ?? box.getItem(LEGACY_TOWN_STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "missing" };
  try {
    const town = parseTownFile(raw);
    if (!town) return { status: "unreadable", raw };
    return { status: "ready", town };
  } catch {
    return { status: "unreadable", raw };
  }
}

export function saveTownWithStatus(town: Town): SaveResult {
  const done = (result: SaveResult) => (lastSaveResult = result);
  const box = store();
  if (!box) return done({ ok: false, reason: "unavailable" });
  let raw: string;
  try {
    raw = serialize(town);
  } catch {
    return done({ ok: false, reason: "serialization" });
  }
  try {
    box.setItem(TOWN_STORAGE_KEY, raw);
    return done({
      ok: true,
      bytes: new TextEncoder().encode(raw).byteLength,
      replayOmitted: false,
    });
  } catch (error) {
    if (!isQuota(error)) return done({ ok: false, reason: "storage" });
    if (!town.scrub?.length) return done({ ok: false, reason: "quota" });
    // Replay is disposable. Memories, identity and debts remain in both the save and the live town.
    try {
      raw = serialize(town, true);
      box.setItem(TOWN_STORAGE_KEY, raw);
      return done({
        ok: true,
        bytes: new TextEncoder().encode(raw).byteLength,
        replayOmitted: true,
      });
    } catch (retryError) {
      return done({ ok: false, reason: isQuota(retryError) ? "quota" : "storage" });
    }
  }
}

export function saveTown(town: Town): void {
  saveTownWithStatus(town);
}

export function exportTown(town: Town): string {
  return serialize(town, true);
}

export function parseTownFile(text: string): Town | null {
  try {
    if (
      text.length > MAX_TOWN_FILE_BYTES ||
      new TextEncoder().encode(text).byteLength > MAX_TOWN_FILE_BYTES
    )
      return null;
    const data = JSON.parse(text) as { version?: number; town?: unknown };
    if (
      data &&
      typeof data === "object" &&
      "town" in data &&
      ((data.version !== 1 && data.version !== 2) ||
        (data.town as { version?: unknown } | null)?.version !== data.version)
    )
      return null;
    const town = data && typeof data === "object" && "town" in data ? data.town : data;
    if (!validateTown(town)) return null;
    return town;
  } catch {
    return null;
  }
}
