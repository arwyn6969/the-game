import type { Agent, AgentId, Memory, MemoryType, RetrievalLog, Town } from "./types";
import { mentionsSeed } from "./text";
import { memorySource } from "./conversation";
import type { RecordedMemory } from "./conversation";
import { memoryInterestScore } from "./interests";

const STOP = new Set(
  "that this with from they have were been your about into just what when where will them then than some there their would could should because while after before other which also does did not only more over very into been being from your ours".split(
    " ",
  ),
);

export function keywords(text: string): string[] {
  const parts = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
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
  extra?: Partial<RecordedMemory>,
): RecordedMemory {
  const clipped = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
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
    source:
      type === "chat"
        ? "statement"
        : type === "reflect" || type === "plan"
          ? "reflection"
          : "event",
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

// A deliberately small vocabulary bridge, not a claim of general semantic recall.
// Matching a concept only retrieves the original record; it cannot verify its words.
const RECALL_CONCEPTS = [
  ["wage", "wages", "payroll", "salary", "payment", "paid", "earnings"],
  ["receipt", "receipts", "proof", "evidence", "source", "sources", "verification"],
  ["lesson", "lessons", "practice", "practise", "practiced", "practised", "learning", "training"],
  ["repair", "repairs", "repaired", "fault", "faults", "broken", "fix", "fixed"],
  ["manuscript", "draft", "drafts", "revision", "revisions", "rewrite", "rewriting"],
  ["budget", "budgets", "funding", "funded", "afford", "affordable", "affordability"],
] as const;

function recallWords(text: string): Set<string> {
  // Read the actual bounded record instead of relying on old cached keywords. This makes
  // accent normalization and words near the end work for existing saves too.
  const words =
    text
      .slice(0, 1600)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => (word.length > 3 || word === "fix") && !STOP.has(word)));
}

function recallRelevance(query: Set<string>, words: Set<string>): number {
  let overlap = 0;
  for (const word of words) if (query.has(word)) overlap++;
  // Two useful matching words can keep an old answer above fresh unrelated
  // observations. Recency still resolves similarly relevant, dated accounts.
  const direct = Math.min(1, overlap / Math.min(2, Math.max(1, query.size)));
  const indirect = RECALL_CONCEPTS.some(
    (terms) => terms.some((term) => query.has(term)) && terms.some((term) => words.has(term)),
  );
  return Math.max(direct * 2, indirect ? 1.25 : 0);
}

export function scoreMemories(memories: Memory[], query: string, nowAbs: number): Scored[] {
  const qset = recallWords(query);
  return memories
    .map((memory) => {
      const stamp = absMinute(
        Number.isFinite(memory.day) ? memory.day : 1,
        Number.isFinite(memory.minute) ? memory.minute : 0,
      );
      const ageHours = Math.max(0, (nowAbs - stamp) / 60);
      const recency = Number.isFinite(ageHours) ? Math.pow(0.995, ageHours) : 0;
      const importance = Number.isFinite(memory.importance) ? memory.importance / 10 : 0.5;
      const words = recallWords(memory.text);
      const relevance = recallRelevance(qset, words);
      const score = recency + importance + relevance;
      return { memory, score, recency, importance, relevance };
    })
    .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance);
}

export function retrieve(memories: Memory[], query: string, nowAbs: number, k = 8): Scored[] {
  return scoreMemories(memories, query, nowAbs).slice(0, k);
}

export function scoreResidentMemories(
  agent: Pick<Agent, "id" | "memories">,
  query: string,
  nowAbs: number,
): (Scored & { roleRelevance: number })[] {
  return scoreMemories(agent.memories ?? [], query, nowAbs)
    .map((hit) => {
      const roleRelevance = memoryInterestScore(agent.id, hit.memory.text);
      return { ...hit, roleRelevance, score: hit.score + roleRelevance };
    })
    .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance);
}

export function retrieveResident(
  agent: Pick<Agent, "id" | "memories">,
  query: string,
  nowAbs: number,
  k = 8,
) {
  return scoreResidentMemories(agent, query, nowAbs).slice(0, k);
}

/** Keep explicit questions stronger than location, wants and recurring concerns. */
export function scoreResidentContext(
  agent: Pick<Agent, "id" | "memories">,
  question: string,
  background: string,
  nowAbs: number,
) {
  const contextual = new Map(
    scoreMemories(agent.memories ?? [], background, nowAbs).map((hit) => [
      hit.memory.id,
      Math.min(0.2, hit.relevance / 10),
    ]),
  );
  return scoreResidentMemories(agent, question, nowAbs)
    .map((hit) => ({ ...hit, score: hit.score + (contextual.get(hit.memory.id) ?? 0) }))
    .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance);
}

/** Older saves encode archive membership in IDs; accept either form as a reference. */
export function resolveMemoryReference(memories: Memory[], id: string): Memory | undefined {
  if (typeof id !== "string" || !id) return undefined;
  const canonical = (value: string) => value.replace(/^archive-(?:chat|observe|plan)-/, "");
  const matches = memories.filter(
    (memory) => typeof memory.id === "string" && canonical(memory.id) === canonical(id),
  );
  // Ambiguous imported IDs are not an evidentiary link, even when one is exact.
  return matches.length === 1 ? matches[0] : undefined;
}

export function logRetrieval(town: Town, agent: Agent, question: string): RetrievalLog {
  const now = absMinute(town.day, town.minute);
  const ranked = scoreResidentMemories(agent, question, now);
  const top = ranked.slice(0, 8);
  const seedIndex = ranked.findIndex((s) => s.memory.seed || mentionsSeed(s.memory.text));
  const seedInStream = seedIndex >= 0;
  const seedRank = seedInStream ? seedIndex + 1 : null;
  const inTop = seedRank !== null && seedRank <= 8;
  const askingAboutKevin = /\bkevin\b|cafe owner|who he is|man under the apron|where he came/i.test(
    question,
  );
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

const ARCHIVE_PREFIX = "archive-";
const ARCHIVE_LIMITS = { chat: 40, observe: 16, plan: 8 } as const;
const PAIR_ARCHIVE_LIMIT = 8;
type ArchiveKind = keyof typeof ARCHIVE_LIMITS;

/**
 * Keep a bounded set of complete older records. Concatenating eight records and
 * truncating the result silently discarded all but the first one, along with
 * the parties and speakers. An archive retains the original evidence source;
 * archiving a statement does not make it a verified event or a new reflection.
 * Existing protected identity, seed and transaction memories never enter here.
 */
function archiveMemories(agent: Agent, kind: ArchiveKind, memories: Memory[]) {
  if (!memories.length) return;
  const drop = new Set(memories.map((memory) => memory.id));
  // Preserve insertion order, including exchanges within the same game minute.
  // Appending old archives would make reverse readers mistake them for new chat.
  agent.memories = agent.memories.map((memory) =>
    drop.has(memory.id)
      ? {
          ...memory,
          id: `${ARCHIVE_PREFIX}${kind}-${memory.id}`,
          source: memorySource(memory),
          protected: true,
        }
      : memory,
  );
  const prefix = `${ARCHIVE_PREFIX}${kind}-`;
  const archives = agent.memories
    .filter(
      (memory) =>
        typeof memory.id === "string" &&
        memory.id.startsWith(prefix) &&
        !memory.seed &&
        !mentionsSeed(memory.text),
    )
    .sort(
      (a, b) =>
        b.importance - a.importance || absMinute(b.day, b.minute) - absMinute(a.day, a.minute),
    );
  const keep = new Set<string>();
  const pairCounts = new Map<string, number>();
  // Reserve one significant early encounter per partner (or one observation).
  // Otherwise equally important recent routine records erase every older event.
  // This shares the existing caps; it is not unbounded/lifetime storage.
  if (kind !== "plan") {
    const landmarks = [...archives].sort(
      (a, b) =>
        b.importance - a.importance || absMinute(a.day, a.minute) - absMinute(b.day, b.minute),
    );
    for (const memory of landmarks) {
      const pair = kind === "chat" ? (memory.with ?? "legacy-unattributed") : "observation";
      if (keep.size >= ARCHIVE_LIMITS[kind]) break;
      if (pairCounts.has(pair)) continue;
      keep.add(memory.id);
      pairCounts.set(pair, 1);
    }
  }
  for (const memory of archives) {
    if (keep.has(memory.id)) continue;
    const pair = memory.with ?? "legacy-unattributed";
    if (keep.size >= ARCHIVE_LIMITS[kind]) break;
    if (kind === "chat" && (pairCounts.get(pair) ?? 0) >= PAIR_ARCHIVE_LIMIT) continue;
    keep.add(memory.id);
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
  }
  const remove = new Set(
    archives.filter((memory) => !keep.has(memory.id)).map((memory) => memory.id),
  );
  agent.memories = agent.memories.filter((memory) => !remove.has(memory.id));
}
function compressPlans(agent: Agent) {
  const plans = agent.memories.filter(
    (m) => m.type === "plan" && !m.protected && !m.seed && !mentionsSeed(m.text),
  );
  if (plans.length <= 6) return;
  archiveMemories(agent, "plan", plans.slice(0, plans.length - 4));
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
    m.type === "chat" && !m.protected && !m.seed && !mentionsSeed(m.text);
  let guard = 0;
  while (agent.memories.filter(bulky).length > 40 && guard++ < 4) {
    const oldest = agent.memories
      .filter(bulky)
      .sort((a, b) => absMinute(a.day, a.minute) - absMinute(b.day, b.minute))
      .slice(0, 8);
    if (oldest.length < 8) break;
    archiveMemories(agent, "chat", oldest);
  }
}

export function compressObservations(agent: Agent) {
  const isObs = (m: Memory) =>
    m.type === "observe" && !m.protected && !m.seed && !mentionsSeed(m.text);
  let guard = 0;
  while (agent.memories.filter(isObs).length > 48 && guard++ < 6) {
    const oldest = agent.memories
      .filter(isObs)
      .sort((a, b) => absMinute(a.day, a.minute) - absMinute(b.day, b.minute))
      .slice(0, 8);
    if (oldest.length < 8 && agent.memories.filter(isObs).length <= 48) break;
    archiveMemories(agent, "observe", oldest);
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
