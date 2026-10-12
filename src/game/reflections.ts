import type { Agent, Memory, Town } from "./types";
import { characterProfile } from "./characters";
import { memorySource } from "./conversation";
import { clip, formatClock } from "./text";

const normalized = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
const reflectionKey = (text: string) =>
  normalized(
    text.replace(
      /^On day [+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?, \d{2}:\d{2}, (?=.{1,48} told me: “)/i,
      "",
    ),
  );
const stamp = (memory: Memory) => (memory.day - 1) * 1440 + memory.minute;

function isCheckpoint(memory: Memory): boolean {
  // Compression summaries preserve older material; they are not a new reflection pass.
  return memory.type === "reflect" && !memory.seed && !/^(?:fold|said|plan)-/.test(memory.id);
}

function meaningfulStatement(text: string, speaker: Agent): boolean {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length < 24 || plain.split(" ").length < 6 || plain.endsWith("?")) return false;
  if (/^(?:hello|hi|hey|good (?:morning|afternoon|evening)|thanks|thank you)\b/i.test(plain))
    return false;
  const profile = characterProfile(speaker.id);
  return ![profile.publicInfo, profile.reflection, ...profile.greetings].some(
    (line) => normalized(line) === normalized(plain),
  );
}

/** A small local memory review, not a claim of learning or independent verification. */
export function localReflections(town: Town, agent: Agent): string[] {
  const memories = agent.memories ?? [];
  const seen = new Set(
    memories
      .filter((memory) => memory.type === "reflect")
      .map((memory) => reflectionKey(memory.text)),
  );
  let checkpointTime = -Infinity;
  let checkpointIndex = -1;
  memories.forEach((memory, index) => {
    if (isCheckpoint(memory) && stamp(memory) >= checkpointTime) {
      checkpointTime = stamp(memory);
      checkpointIndex = index;
    }
  });

  const receipts: string[] = [];
  const statements: string[] = [];
  const add = (list: string[], text: string) => {
    const key = reflectionKey(text);
    if (seen.has(key)) return;
    seen.add(key);
    list.push(text);
  };
  // Recency wins within each category, with actual receipts ahead of reported claims.
  const recent = memories
    .map((memory, index) => ({ memory, index }))
    .filter(
      ({ memory, index }) =>
        !memory.seed &&
        (stamp(memory) > checkpointTime ||
          (stamp(memory) === checkpointTime && index > checkpointIndex)),
    )
    .sort((a, b) => stamp(b.memory) - stamp(a.memory) || b.index - a.index);

  for (const { memory } of recent) {
    const source = memorySource(memory);
    if (memory.type === "favor" && source === "event") {
      const prefix = `My record from day ${memory.day}, ${formatClock(memory.minute)}: `;
      add(receipts, prefix + clip(memory.text, 320 - prefix.length));
      continue;
    }
    // Routine observations contain another resident's planned status, not proof of action.
    // Legacy combined chat prose also lacks reliable speaker attribution.
    if (memory.type !== "chat" || source !== "statement" || !memory.with) continue;
    const speaker = town.agents.find((other) => other.id === memory.with && other.id !== agent.id);
    if (!speaker) continue;
    for (const turn of [...(memory.turns ?? [])].reverse()) {
      if (turn.speaker !== speaker.id || !meaningfulStatement(turn.text, speaker)) continue;
      const date = `On day ${memory.day}, ${formatClock(memory.minute)}, `;
      const prefix = `${clip(speaker.name, 48)} told me: “`;
      const suffix = "” This is their account, not independently verified.";
      // Reserve a stable timestamp budget so crossing day 9→10 does not change
      // the quoted excerpt and defeat deduplication of a repeated long claim.
      const quote = clip(
        turn.text,
        320 - Math.max(48, date.length) - prefix.length - suffix.length,
      );
      add(statements, date + prefix + quote + suffix);
    }
  }
  return [...receipts, ...statements].slice(0, 2);
}
