import type { AgentId, Memory, MindResult, SocialEvent, Town } from "./types";
import { AGENT_IDS } from "./types";
import { clip, mentionsSeed } from "./text";
import { placeTitle, zoneAt } from "./world";
import { makeMemory, pushMemory } from "./memory";

export const MAX_SOCIAL_EVENTS = 128;
const stamp = (row: { day: number; minute: number }) => (row.day - 1) * 1440 + row.minute;
const isId = (id: unknown): id is AgentId => AGENT_IDS.includes(id as AgentId);

export function captureSocial(town: Town) {
  return {
    ids: new Set(town.agents.flatMap((agent) => agent.memories.map((m) => m.id))),
    plans: new Map(
      town.agents.map((agent) => [agent.id, agent.plan.beats.map((beat) => JSON.stringify(beat))]),
    ),
    relations: new Map(
      town.agents.flatMap((agent) =>
        Object.entries(agent.relationships).map(
          ([about, rel]) => [`${agent.id}:${about}`, rel?.score ?? 0] as const,
        ),
      ),
    ),
  };
}

function witnessed(town: Town, participants: AgentId[]) {
  if (participants.includes("player")) return true;
  const player = town.agents.find((agent) => agent.id === "player")!;
  return participants.every((id) => {
    const other = town.agents.find((agent) => agent.id === id)!;
    return (
      zoneAt(player.tile.x, player.tile.y) === zoneAt(other.tile.x, other.tile.y) &&
      Math.abs(player.tile.x - other.tile.x) + Math.abs(player.tile.y - other.tile.y) <= 6
    );
  });
}

/** Record only applied, grounded dialogue and actual score changes, never model proposals. */
export function recordSocial(
  town: Town,
  result: MindResult,
  before: ReturnType<typeof captureSocial>,
) {
  if (result.kind !== "talk" && result.kind !== "player" && result.kind !== "reflect") return;
  const fresh = town.agents.flatMap((agent) =>
    agent.memories
      .filter((memory) => !before.ids.has(memory.id))
      .map((memory) => ({ agent, memory })),
  );
  const append = (event: Omit<SocialEvent, "id">) => {
    (town.social ??= []).push({ intentions: [], ...event, id: `s${town.nextId++}` });
    town.social = town.social.slice(-MAX_SOCIAL_EVENTS);
  };
  if (result.kind === "reflect") {
    for (const { agent, memory } of fresh.filter(
      ({ memory }) => memory.type === "reflect" && !/^(fold|said|plan)-/.test(memory.id),
    )) {
      append({
        kind: "reflection",
        day: memory.day,
        minute: memory.minute,
        participants: [agent.id],
        place: placeTitle(zoneAt(agent.tile.x, agent.tile.y)),
        turns: [],
        text: memory.text,
        changes: [],
        memories: [{ agentId: agent.id, memoryId: memory.id }],
        witnessed: false,
        secret: Boolean(memory.seed || mentionsSeed(memory.text)),
        mind: result.mind,
      });
    }
    return;
  }
  const participants: AgentId[] =
    result.kind === "talk" ? [result.a, result.b] : ["player", result.agentId];
  const copies = fresh.filter(
    ({ agent, memory }) =>
      participants.includes(agent.id) &&
      memory.type === "chat" &&
      memory.with &&
      participants.includes(memory.with),
  );
  const first = copies[0];
  if (!first) return;
  const changes = participants.flatMap((owner) =>
    participants
      .filter((about) => about !== owner)
      .flatMap((about) => {
        const relation = town.agents.find((agent) => agent.id === owner)?.relationships[about];
        const previous = before.relations.get(`${owner}:${about}`) ?? 0;
        return relation && previous !== relation.score
          ? [{ owner, about, before: previous, after: relation.score, note: relation.note }]
          : [];
      }),
  );
  const event: Omit<SocialEvent, "id"> = {
    kind: "conversation",
    day: first.memory.day,
    minute: first.memory.minute,
    participants,
    place: placeTitle(zoneAt(first.agent.tile.x, first.agent.tile.y)),
    turns: first.memory.turns ?? [],
    text: first.memory.text,
    changes,
    intentions: participants.flatMap((agentId) => {
      const agent = town.agents.find((a) => a.id === agentId)!;
      const index = agent.plan.beats.findIndex(
        (beat, hour) =>
          hour >= Math.floor(town.minute / 60) &&
          JSON.stringify(beat) !== before.plans.get(agentId)?.[hour],
      );
      const beat = agent.plan.beats[index];
      return beat
        ? [{ agentId, fromHour: index, place: placeTitle(beat.place), activity: beat.status }]
        : [];
    }),
    memories: copies.map(({ agent, memory }) => ({ agentId: agent.id, memoryId: memory.id })),
    witnessed: witnessed(town, participants),
    secret:
      (result.kind === "talk" && Boolean(result.revealedSeed)) ||
      copies.some(
        ({ memory }) =>
          memory.seed ||
          mentionsSeed(memory.text) ||
          memory.turns?.some((turn) => mentionsSeed(turn.text)),
      ) ||
      changes.some((change) => mentionsSeed(change.note)),
    mind: result.mind,
  };
  if (event.intentions?.some((intention) => mentionsSeed(intention.activity))) event.secret = true;
  if (event.witnessed && !participants.includes("player")) {
    const player = town.agents.find((agent) => agent.id === "player")!;
    pushMemory(
      player,
      makeMemory(town, event.day, event.minute, "observe", event.text, 6, {
        source: "statement",
        turns: event.turns,
        seed: event.secret,
        protected: event.secret,
      }),
    );
  }
  append(event);
}

/** Old histories retain their recorded words, with no invented past relationship values. */
function legacyConversations(town: Town): SocialEvent[] {
  const recorded = new Set(
    (town.social ?? []).flatMap((event) => event.memories.map((m) => m.memoryId)),
  );
  const seen = new Set<string>();
  const events: SocialEvent[] = [];
  for (const agent of town.agents)
    for (const memory of agent.memories) {
      if (memory.type !== "chat" || !memory.with || recorded.has(memory.id)) continue;
      const participants = [agent.id, memory.with].sort() as AgentId[];
      const key = JSON.stringify([
        participants,
        memory.day,
        memory.minute,
        memory.turns ?? memory.text,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        id: `legacy-${memory.id}`,
        kind: "conversation",
        day: memory.day,
        minute: memory.minute,
        participants,
        place: "Recorded conversation",
        turns: memory.turns ?? [],
        text: memory.text,
        changes: [],
        intentions: [],
        memories: [{ agentId: agent.id, memoryId: memory.id }],
        witnessed: participants.includes("player"),
        secret: Boolean(
          memory.seed ||
          mentionsSeed(memory.text) ||
          memory.turns?.some((t) => mentionsSeed(t.text)),
        ),
        mind: memory.mind,
      });
    }
  return events;
}

export function visibleSocialEvents(
  town: Town,
  watch: boolean,
  at = { day: town.day, minute: town.minute },
): SocialEvent[] {
  return [...(town.social ?? []), ...legacyConversations(town)]
    .filter(
      (event) =>
        stamp(event) <= stamp(at) &&
        (watch ? !event.secret : event.witnessed && event.kind === "conversation"),
    )
    .sort((a, b) => stamp(b) - stamp(a) || b.id.localeCompare(a.id, undefined, { numeric: true }))
    .slice(0, MAX_SOCIAL_EVENTS);
}

/** Untrusted imported presentation history is bounded and validated separately from town state. */
export function cleanSocial(value: unknown): SocialEvent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(-MAX_SOCIAL_EVENTS).flatMap((row): SocialEvent[] => {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      seen.has(row.id) ||
      !["conversation", "reflection"].includes(row.kind) ||
      !Number.isInteger(row.day) ||
      row.day < 1 ||
      !Number.isInteger(row.minute) ||
      row.minute < 0 ||
      row.minute > 1439 ||
      !Array.isArray(row.participants) ||
      !row.participants.length ||
      row.participants.length > 2 ||
      row.participants.some((id: unknown) => !isId(id)) ||
      new Set(row.participants).size !== row.participants.length
    )
      return [];
    seen.add(row.id);
    const turns = (Array.isArray(row.turns) ? row.turns : [])
      .filter(
        (turn: { speaker?: unknown; text?: unknown }) =>
          turn && row.participants.includes(turn.speaker) && typeof turn.text === "string",
      )
      .slice(0, 4)
      .map((turn: { speaker: AgentId; text: string }) => ({
        speaker: turn.speaker,
        text: clip(turn.text, 700),
      }));
    const text = typeof row.text === "string" ? clip(row.text, 700) : "";
    const changes = (Array.isArray(row.changes) ? row.changes : [])
      .filter(
        (change: { owner?: unknown; about?: unknown; before?: unknown; after?: unknown }) =>
          change &&
          row.participants.includes(change.owner) &&
          row.participants.includes(change.about) &&
          change.owner !== change.about &&
          Number.isFinite(change.before) &&
          Number.isFinite(change.after),
      )
      .slice(0, 2)
      .map(
        (change: {
          owner: AgentId;
          about: AgentId;
          before: number;
          after: number;
          note: string;
        }) => ({
          owner: change.owner,
          about: change.about,
          before: Math.max(-3, Math.min(3, change.before)),
          after: Math.max(-3, Math.min(3, change.after)),
          note: clip(typeof change.note === "string" ? change.note : "", 180),
        }),
      );
    return [
      {
        id: clip(row.id, 80),
        kind: row.kind,
        day: row.day,
        minute: row.minute,
        participants: row.participants,
        place: clip(typeof row.place === "string" ? row.place : "Town", 80),
        turns,
        text,
        changes,
        intentions: (Array.isArray(row.intentions) ? row.intentions : [])
          .filter(
            (i: { agentId: unknown; fromHour: unknown; place: unknown; activity: unknown }) =>
              i &&
              row.participants.includes(i.agentId) &&
              Number.isInteger(i.fromHour) &&
              Number(i.fromHour) >= 0 &&
              Number(i.fromHour) <= 23 &&
              typeof i.place === "string" &&
              typeof i.activity === "string",
          )
          .slice(0, 2)
          .map((i: { agentId: AgentId; fromHour: number; place: string; activity: string }) => ({
            agentId: i.agentId,
            fromHour: i.fromHour,
            place: clip(i.place, 80),
            activity: clip(i.activity, 110),
          })),
        memories: (Array.isArray(row.memories) ? row.memories : [])
          .filter(
            (m: { agentId?: unknown; memoryId?: unknown }) =>
              m && row.participants.includes(m.agentId) && typeof m.memoryId === "string",
          )
          .slice(0, 2)
          .map((m: { agentId: AgentId; memoryId: string }) => ({
            agentId: m.agentId,
            memoryId: clip(m.memoryId, 80),
          })),
        witnessed: row.witnessed === true,
        secret: Boolean(
          row.secret ||
          mentionsSeed(text) ||
          turns.some((t: { text: string }) => mentionsSeed(t.text)) ||
          changes.some((c: { note: string }) => mentionsSeed(c.note)) ||
          (Array.isArray(row.intentions) &&
            row.intentions.some(
              (i: { activity?: unknown }) =>
                typeof i?.activity === "string" && mentionsSeed(i.activity),
            )),
        ),
        mind: row.mind === "grok" || row.mind === "offline" ? row.mind : undefined,
      },
    ];
  });
}

export function publicReflections(
  town: Town,
  agentId: AgentId,
  at = { day: town.day, minute: town.minute },
): Memory[] {
  return town.agents
    .find((agent) => agent.id === agentId)!
    .memories.filter(
      (m) =>
        m.type === "reflect" &&
        !m.seed &&
        !mentionsSeed(m.text) &&
        !/^(fold|said|plan)-/.test(m.id) &&
        stamp(m) <= stamp(at),
    )
    .slice(-3)
    .reverse();
}
