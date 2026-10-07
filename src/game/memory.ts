import type { Agent, AgentId, Memory, MemoryType, RetrievalLog, Town } from "./types";
import { mentionsSeed } from "./text";

const STOP = new Set(
  "that this with from they have were been your about into just what when where will them then than some there their would could should because while after before other which also does did not only more over very into been being from your ours".split(
    " ",
  ),
);

export function keywords(text: string): string[] {
  const parts = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return [...new Set(parts)].slice(0, 24);
}

export function absMinute(day: number, minute: number): number {
  return (day - 1) * 1440 + minute;
}

export function makeMemory(
  town: Town,
  day: number,
  minute: number,
  type: MemoryType,
  text: string,
  importance: number,
  extra?: Partial<Memory>,
): Memory {
  const clipped = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 420);
  if (!Number.isFinite(town.nextId)) town.nextId = 1;
  const rank = Number.isFinite(importance) ? importance : 5;
  return {
    id: `m${town.nextId++}`,
    day: Number.isFinite(day) ? day : town.day,
    minute: Number.isFinite(minute) ? minute : town.minute,
    type,
    text: clipped,
    importance: Math.max(1, Math.min(10, Math.round(rank))),
    keywords: keywords(clipped),
    ...extra,
  };
}

export type Scored = {
  memory: Memory;
  score: number;
  recency: number;
  importance: number;
  relevance: number;
};

export function scoreMemories(
  memories: Memory[],
  query: string,
  nowAbs: number,
): Scored[] {
  const qk = keywords(query);
  const qset = new Set(qk);
  return memories
    .map((memory) => {
      const stamp = absMinute(
        Number.isFinite(memory.day) ? memory.day : 1,
        Number.isFinite(memory.minute) ? memory.minute : 0,
      );
      const ageHours = Math.max(0, (nowAbs - stamp) / 60);
      const recency = Number.isFinite(ageHours) ? Math.pow(0.995, ageHours) : 0;
      const importance = Number.isFinite(memory.importance) ? memory.importance / 10 : 0.5;
      const words = Array.isArray(memory.keywords) ? memory.keywords : [];
      let overlap = 0;
      for (const w of words) if (typeof w === "string" && qset.has(w)) overlap++;
      const relevance = Math.min(1, overlap / 3);
      const score = recency + importance + relevance;
      return { memory, score, recency, importance, relevance };
    })
    .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance);
}

export function retrieve(
  memories: Memory[],
  query: string,
  nowAbs: number,
  k = 8,
): Scored[] {
  return scoreMemories(memories, query, nowAbs).slice(0, k);
}

export function logRetrieval(
  town: Town,
  agent: Agent,
  question: string,
): RetrievalLog {
  const now = absMinute(town.day, town.minute);
  const ranked = scoreMemories(agent.memories, question, now);
  const top = ranked.slice(0, 8);
  const seedIndex = ranked.findIndex((s) => s.memory.seed || mentionsSeed(s.memory.text));
  const seedInStream = seedIndex >= 0;
  const seedRank = seedInStream ? seedIndex + 1 : null;
  const inTop = seedRank !== null && seedRank <= 8;
  const askingAboutKevin = /\bkevin\b|cafe owner|who he is|man under the apron|where he came/i.test(question);
  const missed = seedInStream ? !inTop : askingAboutKevin;
  const log: RetrievalLog = {
    id: `r${town.nextId++}`,
    day: town.day,
    minute: town.minute,
    agentId: agent.id,
    question: question.slice(0, 240),
    top: top.map((s) => ({
      text: s.memory.text.slice(0, 160),
      score: Math.round(s.score * 100) / 100,
      type: s.memory.type,
    })),
    seedInStream,
    seedRank,
    missed,
  };
  town.retrievals.push(log);
  if (town.retrievals.length > 36) town.retrievals.splice(0, town.retrievals.length - 36);
  return log;
}

function foldId(kind: string, oldest: Memory[], extra: number) {
  return `${kind}-${oldest[0]?.id ?? "x"}-${oldest[oldest.length - 1]?.id ?? "y"}-${extra}`;
}

function foldText(prefix: string, oldest: Memory[]) {
  const summary = oldest
    .map((m) => m.text.replace(/\.$/, ""))
    .join("; ")
    .slice(0, 380);
  const carried = oldest.some((m) => m.seed || mentionsSeed(m.text));
  return {
    text: carried ? `${prefix} ${summary}. Who he is stayed in the fold.` : `${prefix} ${summary}.`,
    seed: carried,
  };
}
function compressPlans(agent: Agent) {
  const plans = agent.memories.filter((m) => m.type === "plan" && !m.protected && !m.seed && !mentionsSeed(m.text));
  if (plans.length <= 6) return;
  const oldest = plans.slice(0, plans.length - 4);
  const folded = foldText("Older days, folded so the plan is not lost:", oldest);
  const reflect: Memory = {
    id: foldId("plan", oldest, agent.memories.length),
    day: oldest[oldest.length - 1]?.day ?? 1,
    minute: oldest[oldest.length - 1]?.minute ?? 0,
    type: "reflect",
    text: folded.text,
    importance: 5,
    keywords: keywords(folded.text),
    protected: true,
    seed: folded.seed,
    mind: "offline",
  };
  const drop = new Set(oldest.map((m) => m.id));
  agent.memories = agent.memories.filter((m) => !drop.has(m.id));
  agent.memories.push(reflect);
}

export function pushMemory(agent: Agent, memory: Memory) {
  if (!memory.text) return;
  if (!Array.isArray(agent.memories)) agent.memories = [];
  agent.memories.push(memory);
  if (memory.type !== "plan") agent.newMemories = (agent.newMemories || 0) + 1;
  compressObservations(agent);
  compressDialogue(agent);
  compressPlans(agent);
}

export function compressDialogue(agent: Agent) {
  const bulky = (m: Memory) =>
    (m.type === "chat" || m.type === "plan") && !m.protected && !m.seed && !mentionsSeed(m.text);
  let guard = 0;
  while (agent.memories.filter(bulky).length > 40 && guard++ < 4) {
    const oldest = agent.memories
      .filter(bulky)
      .sort((a, b) => absMinute(a.day, a.minute) - absMinute(b.day, b.minute))
      .slice(0, 8);
    if (oldest.length < 8) break;
    const folded = foldText("What was said, folded so it is not lost:", oldest);
    const reflect: Memory = {
      id: foldId("said", oldest, agent.memories.length),
      day: oldest[oldest.length - 1]?.day ?? 1,
      minute: oldest[oldest.length - 1]?.minute ?? 0,
      type: "reflect",
      text: folded.text,
      importance: Math.max(5, ...oldest.map((m) => (Number.isFinite(m.importance) ? m.importance : 5))),
      keywords: keywords(folded.text),
      protected: true,
      seed: folded.seed,
      mind: "offline",
    };
    const drop = new Set(oldest.map((m) => m.id));
    agent.memories = agent.memories.filter((m) => !drop.has(m.id));
    agent.memories.push(reflect);
  }
}

export function compressObservations(agent: Agent) {
  const isObs = (m: Memory) => m.type === "observe" && !m.protected && !m.seed && !mentionsSeed(m.text);
  let guard = 0;
  while (agent.memories.filter(isObs).length > 48 && guard++ < 6) {
    const oldest = agent.memories
      .filter(isObs)
      .sort(
        (a, b) =>
          absMinute(a.day, a.minute) - absMinute(b.day, b.minute),
      )
      .slice(0, 8);
    if (oldest.length < 8 && agent.memories.filter(isObs).length <= 48) break;
    const folded = foldText("Looking back, the ordinary minutes fold together:", oldest);
    const reflect: Memory = {
      id: foldId("fold", oldest, agent.memories.length),
      day: oldest[oldest.length - 1]?.day ?? agent.memories[0]?.day ?? 1,
      minute: oldest[oldest.length - 1]?.minute ?? 0,
      type: "reflect",
      text: folded.text,
      importance: Math.max(5, ...oldest.map((m) => (Number.isFinite(m.importance) ? m.importance : 5))),
      keywords: keywords(folded.text),
      protected: true,
      seed: folded.seed,
      mind: "offline",
    };
    const drop = new Set(oldest.map((m) => m.id));
    agent.memories = agent.memories.filter((m) => !drop.has(m.id));
    agent.memories.push(reflect);
  }
}

export function observationCount(agent: Agent): number {
  return agent.memories.filter((m) => m.type === "observe" && !m.protected).length;
}

export function agentById(town: Town, id: AgentId): Agent {
  const found = town.agents.find((a) => a.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

export function others(town: Town, id: AgentId): Agent[] {
  return town.agents.filter((a) => a.id !== id);
}
