import type { Agent, AgentId, Memory, Town } from "./types";
import { AGENT_IDS } from "./types";
import { clip } from "./text";
import { placeTitle } from "./world";

// Optional additions preserve older memories. The save boundary validates them.
export type RecordedMemory = Memory & {
  turns?: { speaker: AgentId; text: string }[];
  source?: "event" | "statement" | "reflection";
};

export function memorySource(memory: RecordedMemory): NonNullable<RecordedMemory["source"]> {
  if (memory.source) return memory.source;
  if (memory.type === "chat") return "statement";
  if (memory.type === "reflect" || memory.type === "plan") return "reflection";
  return "event";
}

export type ConversationTurn = {
  memoryId: string;
  day: number;
  minute: number;
  speaker: AgentId | null;
  text: string;
  source: NonNullable<RecordedMemory["source"]>;
  legacy?: true;
};

/** Pair-specific history is independent of keyword ranking, including pronoun follow-ups. */
export function recentConversation(agent: Agent, otherId: AgentId, limit = 6): ConversationTurn[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const rows: ConversationTurn[] = [];
  const memories = [...(agent.memories ?? [])]
    .filter((m) => m.type === "chat" && m.with === otherId)
    .sort((a, b) => a.day - b.day || a.minute - b.minute);
  for (const memory of memories as RecordedMemory[]) {
    const meta = {
      memoryId: memory.id,
      day: memory.day,
      minute: memory.minute,
      source: memorySource(memory),
    };
    const turns = Array.isArray(memory.turns)
      ? memory.turns.filter(
          (turn) =>
            turn &&
            (turn.speaker === agent.id || turn.speaker === otherId) &&
            AGENT_IDS.includes(turn.speaker) &&
            typeof turn.text === "string" &&
            turn.text.trim(),
        )
      : [];
    if (turns.length) {
      for (const turn of turns.slice(0, 4))
        rows.push({ ...meta, speaker: turn.speaker, text: clip(turn.text, 700) });
    } else if (memory.text) {
      // Older combined prose is retained verbatim; do not invent speaker attribution.
      rows.push({ ...meta, speaker: null, text: memory.text, legacy: true });
    }
  }
  return rows.slice(-Math.max(0, Math.min(12, limit)));
}

/** A shared request may see only conversations copied into both participants' streams. */
export function sharedMemories(agent: Agent, other: Agent): Memory[] {
  const sharedKey = (memory: Memory) => JSON.stringify([memory.day, memory.minute, memory.text]);
  const copies = new Set(
    (other.memories ?? [])
      .filter((memory) => memory.type === "chat" && memory.with === agent.id)
      .map(sharedKey),
  );
  return (agent.memories ?? []).filter(
    (memory) => memory.type === "chat" && memory.with === other.id && copies.has(sharedKey(memory)),
  );
}

/** Only the parties' obligations belong in this context; no town-wide private ledger. */
export function pairObligations(town: Town, a: AgentId, b: AgentId) {
  const related = (town.favors ?? []).filter(
    (favor) => (favor.from === a && favor.to === b) || (favor.from === b && favor.to === a),
  );
  const owed = related.filter((favor) => favor.status === "owed");
  const settled = related.filter((favor) => favor.status !== "owed").slice(-3);
  return [...owed, ...settled].map(({ id, from, to, amount, status, text, day }) => ({
    id,
    from,
    to,
    amount,
    status,
    text,
    day,
    source: "event" as const,
  }));
}

/**
 * Narrow, deterministic guard for common unsupported player-action claims.
 * This does not claim to verify arbitrary prose; evidence instructions and evals
 * cover the broader dialogue, while authoritative action rules remain separate.
 */
export function groundPlayerReply(town: Town, resident: Agent, reply: string): string {
  const text = reply.replace(/[’‘]/g, "'");
  if (/\b(?:i|we)(?:'ve| have)? (?:completed|finished|repaired|fixed)\b/i.test(text))
    return "I can discuss the next step, but I have no verified completion to report.";
  const debts = pairObligations(town, "player", resident.id);
  const owed = debts.filter((debt) => debt.from === "player" && debt.status === "owed");
  const paid = debts.filter((debt) => debt.from === "player" && debt.status === "paid");
  const paymentClaim =
    /\b(?:you (?:have |already )?(?:paid|repaid)|(?:your|the) (?:tab|debt) (?:is |has been |was )?(?:paid|settled|closed)|(?:i|we)(?:'ve| have)? (?:received|taken) (?:your )?payment)\b/i.test(
      text,
    );
  const noDebtClaim =
    /\b(?:you owe (?:me |us )?nothing|no (?:open |unpaid )?(?:tab|debt)(?: remains| between us)?)\b/i.test(
      text,
    );
  if (paymentClaim || (noDebtClaim && owed.length)) {
    if (owed.length)
      return `The recorded tab is still open: ${owed.map((debt) => `${debt.amount} for ${debt.text}`).join("; ")}. Talking does not pay it; use the quoted payment choice.`;
    if (paid.length) {
      const last = paid.at(-1)!;
      return `The recorded tab of ${last.amount} for ${last.text} is paid. This conversation made no new payment.`;
    }
    return "There is no recorded payment between us. This conversation has not moved any money.";
  }
  const player = town.agents.find((agent) => agent.id === "player");
  if (!player) return reply;
  if (
    /\b(?:you(?:'ve| have)? (?:accepted|taken) (?:the |a |your )?(?:cafe )?shift|i(?:'ve| have)? (?:signed you up|accepted (?:the |your )?shift for you))\b/i.test(
      text,
    )
  ) {
    const shift = player.projects.find(
      (project) => project.kind === "shift" && project.status === "open",
    );
    return shift
      ? `Your recorded agreement is still open: ${shift.text}`
      : "There is no accepted shift in your agreements. Read the terms and choose explicitly if you want to take one.";
  }
  if (
    /\b(?:i(?:'ve| have)? (?:paid|credited) you|your wage (?:is |has been )?(?:paid|credited))\b/i.test(
      text,
    )
  ) {
    const workplace = resident.id === "kevin" ? "cafe" : resident.id === "baba" ? "grocery" : null;
    const receipt =
      workplace &&
      [...player.memories]
        .reverse()
        .find(
          (memory) =>
            memory.type === "favor" &&
            memorySource(memory) === "event" &&
            memory.day === town.day &&
            memory.text.startsWith(`${placeTitle(workplace)} paid me `),
        );
    return receipt
      ? `The wage record says: ${receipt.text}`
      : "I have no wage receipt to confirm that. Talking does not pay a wage; your agreement and recorded work decide it.";
  }
  return reply;
}

export function groundSharedLine(town: Town, a: Agent, b: Agent, text: string): string {
  if (/\b(?:i|we|you)(?:['’]ve| have)? (?:completed|finished|repaired|fixed)\b/i.test(text))
    return "We can discuss the next step, but I have no verified completion to report.";
  if (
    /\b(?:i|we|you)(?:['’]ve| have)? (?:paid|repaid)|\b(?:tab|debt) (?:is |was |has been )?(?:paid|settled|closed)\b/i.test(
      text,
    )
  ) {
    const obligations = pairObligations(town, a.id, b.id);
    if (!obligations.length) return "There is no payment recorded between us.";
    return `Our recorded agreement says: ${obligations.map((debt) => `${debt.text}, ${debt.amount}, ${debt.status}`).join("; ")}.`;
  }
  return text;
}
