import { NPC_IDS } from "../game/types.ts";
import type { DiscussionDecision, DiscussionJob } from "../game/discussion-types.ts";

const SIMPLE_DECISIONS = [
  "read-invitation",
  "ignore",
  "accept",
  "decline",
  "listen",
  "participate",
  "stop-listening",
  "request-turn",
  "withdraw-turn",
  "pass",
  "leave",
  "close",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    value.trim().length > 0 &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  );
}

function contextId(value: unknown): value is string {
  return boundedText(value, 96) && value === value.trim() && !/[\r\n\t]/.test(value);
}

/** Actor and request identity come from the engine, never from generated JSON. */
export function validDiscussionJob(value: unknown): value is DiscussionJob {
  const job = record(value);
  return Boolean(
    job &&
    job.kind === "act" &&
    job.task === "discussion" &&
    NPC_IDS.includes(job.agentId as (typeof NPC_IDS)[number]) &&
    contextId(job.meetingId) &&
    Number.isSafeInteger(job.day) &&
    Number(job.day) >= 1 &&
    Number.isSafeInteger(job.minute) &&
    Number(job.minute) >= 0 &&
    Number(job.minute) <= 1439 &&
    Number.isSafeInteger(job.sessionRevision) &&
    Number(job.sessionRevision) >= 0 &&
    Number.isSafeInteger(job.actorRevision) &&
    Number(job.actorRevision) >= 0 &&
    (job.turnId === null || contextId(job.turnId)),
  );
}

/** Syntax only: current offers, presence, attention and the floor are checked at commit. */
export function parseDiscussionDecision(value: unknown): DiscussionDecision | null {
  const decision = record(value);
  if (!decision) return null;
  if (decision.kind === "speak")
    return exactKeys(decision, ["kind", "text"]) && boundedText(decision.text, 400)
      ? { kind: "speak", text: decision.text.trim() }
      : null;
  return typeof decision.kind === "string" &&
    (SIMPLE_DECISIONS as readonly string[]).includes(decision.kind) &&
    exactKeys(decision, ["kind"])
    ? { kind: decision.kind as (typeof SIMPLE_DECISIONS)[number] }
    : null;
}

/** The discriminator keeps discussion output distinct from legacy physical act output. */
export function parseDiscussionEnvelope(value: unknown): DiscussionDecision | null {
  const envelope = record(value);
  return envelope && envelope.task === "discussion" && exactKeys(envelope, ["task", "decision"])
    ? parseDiscussionDecision(envelope.decision)
    : null;
}

/** Accept a JSON object or a single complete JSON fence, never prose containing a command. */
export function parseDiscussionResponse(text: string): DiscussionDecision | null {
  if (typeof text !== "string" || text.length > 20_000) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  try {
    return parseDiscussionEnvelope(JSON.parse(fenced?.[1] ?? trimmed));
  } catch {
    return null;
  }
}
