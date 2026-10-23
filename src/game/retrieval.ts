import type { Agent, ThinkJob, Town } from "./types";
import { absMinute, logRetrieval, scoreResidentMemories } from "./memory";
import { clip, mentionsSeed, plain } from "./text";
import { placeTitle, zoneAt } from "./world";
import { memorySource, sharedMemories } from "./conversation";

// Both prompt construction and its diagnostic use this resident's own memory stream.
export function promptMemories(town: Town, agent: Agent, job: ThinkJob) {
  const other =
    job.kind === "talk"
      ? town.agents.find((resident) => resident.id === (job.a === agent.id ? job.b : job.a))
      : undefined;
  const stream = other ? sharedMemories(agent, other) : (agent.memories ?? []);
  const question =
    job.kind === "player"
      ? plain(job.text, 400)
      : job.kind === "act"
        ? "manuscript physical action previous result own creative intentions"
        : job.kind === "talk"
          ? `${job.a} ${job.b}`
          : job.kind;
  const query = `${question} ${placeTitle(zoneAt(agent.tile.x, agent.tile.y))} ${(other
    ? []
    : (agent.threads ?? [])
  )
    .filter((t) => t.open)
    .map((t) => t.text)
    .join(" ")} ${other ? "" : (agent.want ?? "")}`;
  const ranked = scoreResidentMemories(
    { id: agent.id, memories: stream },
    query,
    absMinute(town.day, town.minute),
  );
  const selected = ranked.slice(0, 4);
  const keptMemory = !other && stream.find((m) => m.seed || (m.protected && m.type === "favor"));
  const kept = keptMemory && ranked.find((s) => s.memory.id === keptMemory.id);
  if (kept && !selected.some((s) => s.memory.id === kept.memory.id)) selected.unshift(kept);
  const memories = selected.map((s) => ({
    id: s.memory.id,
    day: s.memory.day,
    minute: s.memory.minute,
    with: s.memory.with,
    source: memorySource(s.memory),
    text: clip(s.memory.text, 420),
    type: s.memory.type,
    importance: s.memory.importance,
  }));
  const top = selected.map((s, i) => ({
    text: memories[i].text,
    type: s.memory.type,
    score: Math.round(s.score * 100) / 100,
  }));
  const logs = town.retrievals ?? (town.retrievals = []);
  const previous = [...logs].reverse().find((r) => r.agentId === agent.id);
  if (
    !previous ||
    previous.day !== town.day ||
    previous.minute !== town.minute ||
    previous.question !== query.slice(0, 240) ||
    JSON.stringify(previous.top) !== JSON.stringify(top)
  ) {
    const log = logRetrieval(town, { ...agent, memories: stream }, query);
    log.top = top;
    log.seedInStream = ranked.some((s) => s.memory.seed || mentionsSeed(s.memory.text));
    const seedIndex = selected.findIndex((s) => s.memory.seed || mentionsSeed(s.memory.text));
    log.seedRank = seedIndex < 0 ? null : seedIndex + 1;
    log.missed = log.seedInStream
      ? seedIndex < 0
      : /\bkevin\b|who he is|man under the apron/i.test(query);
  }
  return memories;
}
