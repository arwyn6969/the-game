import type { AgentId, Town } from "./types";
import { memorySource, sharedMemories } from "./conversation";
import { clip } from "./text";

/** Separate observed contact, personal regard and kept commitments without inventing feelings. */
export function relationshipContext(
  town: Town,
  ownerId: AgentId,
  aboutId: AgentId,
  shared = false,
) {
  const owner = town.agents.find((agent) => agent.id === ownerId);
  const other = town.agents.find((agent) => agent.id === aboutId);
  if (!owner || !other || ownerId === aboutId) return null;
  const now = (town.day - 1) * 1440 + town.minute;
  const memories = (shared ? sharedMemories(owner, other) : owner.memories).filter(
    (memory) =>
      memory.type === "chat" &&
      memory.with === aboutId &&
      memorySource(memory) === "statement" &&
      (memory.day - 1) * 1440 + memory.minute <= now &&
      memory.turns?.some((turn) => turn.text.trim()),
  );
  const unique = [
    ...new Map(
      memories.map((memory) => [JSON.stringify([memory.day, memory.minute, memory.turns]), memory]),
    ).values(),
  ];
  const last = unique.sort((a, b) => b.day - a.day || b.minute - a.minute)[0];
  // Only obligations made by this counterparty to this resident establish reliability here.
  const commitments = [
    ...new Map(
      (town.favors ?? [])
        .filter((favor) => favor.from === aboutId && favor.to === ownerId && favor.day <= town.day)
        .map((favor) => [favor.id, favor]),
    ).values(),
  ];
  const count = (status: string) => commitments.filter((favor) => favor.status === status).length;
  const relationship = owner.relationships?.[aboutId];
  return {
    about: aboutId,
    familiarity: {
      retainedExchanges: unique.length,
      lastContact: last ? { day: last.day, minute: last.minute } : null,
      scope: "Retained spoken exchanges, not lifetime contact or friendship.",
    },
    ...(!shared && relationship
      ? {
          regard: { score: relationship.score, interpretation: clip(relationship.note, 100) },
        }
      : {}),
    reliability: {
      kept: count("paid"),
      broken: count("broken"),
      pending: count("owed"),
      forgiven: count("forgiven"),
    },
    limits:
      "Regard is a personal interpretation, not trust or affection. Pending is not broken; forgiven is not fulfilled. Disagreement alone proves neither dislike nor unreliability.",
  };
}
