import type { Agent, ThinkJob, Town } from "./types";
import { absMinute, logRetrieval, scoreMemories } from "./memory";
import { clip, mentionsSeed, plain } from "./text";
import { placeTitle, zoneAt } from "./world";

// Both prompt construction and its diagnostic use this resident's own memory stream.
export function promptMemories(town: Town, agent: Agent, job: ThinkJob) {
  const question =
    job.kind === "player"
      ? plain(job.text, 400)
      : job.kind === "talk"
        ? `${job.a} ${job.b}`
        : job.kind;
  const query = `${question} ${placeTitle(zoneAt(agent.tile.x, agent.tile.y))} ${(
    agent.threads ?? []
  )
    .filter((t) => t.open)
    .map((t) => t.text)
    .join(" ")} ${agent.want ?? ""}`;
  const ranked = scoreMemories(agent.memories ?? [], query, absMinute(town.day, town.minute));
  const selected = ranked.slice(0, 4);
  const keptMemory = (agent.memories ?? []).find(
    (m) => m.seed || (m.protected && m.type === "favor"),
  );
  const kept = keptMemory && ranked.find((s) => s.memory.id === keptMemory.id);
  if (kept && !selected.some((s) => s.memory.id === kept.memory.id)) selected.unshift(kept);
  const memories = selected.map((s) => ({
    text: clip(s.memory.text, 110),
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
    const log = logRetrieval(town, agent, query);
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
