import type { FollowEvidence, FollowPoint, FollowSession, Following } from "./following-types";
import type { NpcId } from "./types";

export const FOLLOW_LIMITS = { evidence: 128, completed: 8, text: 400 } as const;
export const followRunning = (s?: FollowSession): s is FollowSession =>
  Boolean(s && !["paused", "ended"].includes(s.state));
export const currentFollow = (state?: Following) =>
  Array.isArray(state?.sessions) ? state.sessions.at(-1) : undefined;
export const followDistance = (a: FollowPoint, b: FollowPoint) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Pure controller: no town, navigation, attention, transport or private position access. */
export function beginFollow(input: {
  id: string;
  target: NpcId;
  now: number;
  duration: number;
  listen: boolean;
  observed: FollowPoint;
  player: FollowPoint;
}): FollowSession | null {
  if (![30, 60, 120].includes(input.duration)) return null;
  return {
    id: input.id,
    target: input.target,
    policyVersion: 1,
    controlRevision: 1,
    state: "accompanying",
    duration: input.duration as FollowSession["duration"],
    listen: input.listen,
    startedAt: input.now,
    deadline: input.now + input.duration,
    progressAt: input.now,
    lastObserved: { ...input.observed },
    lastObservedAt: input.now,
    lastPlayer: { ...input.player },
    reason: "Keeping company. Runs only while this local game is open and active.",
    evidence: [],
  };
}

export function pauseFollow(s: FollowSession, reason: string) {
  if (!followRunning(s)) return;
  s.state = "paused";
  s.reason = reason;
  s.controlRevision++;
  delete s.goal;
}
export function endFollow(s: FollowSession, now: number, reason: string) {
  if (s.state === "ended") return;
  s.state = "ended";
  s.endedAt = now;
  s.reason = reason;
  s.controlRevision++;
  delete s.goal;
}
export function resumeFollow(s: FollowSession, now: number, player: FollowPoint) {
  if (s.state !== "paused") return false;
  if (s.evidence.length >= FOLLOW_LIMITS.evidence) {
    endFollow(s, now, "Journal capacity reached (128 entries). Actual history retained.");
    return false;
  }
  if (now >= s.deadline) {
    endFollow(s, now, "The selected game-time duration has elapsed.");
    return false;
  }
  s.state = "accompanying";
  s.controlRevision++;
  s.lastPlayer = { ...player };
  s.progressAt = now;
  s.lastObservedAt = now;
  s.reason = "Resumed explicitly.";
  return true;
}

export function tickFollow(
  s: FollowSession,
  input: { now: number; player: FollowPoint; observed?: FollowPoint; goal?: FollowPoint },
) {
  if (!followRunning(s)) return;
  if (input.now >= s.deadline) {
    endFollow(s, input.now, "The selected game-time duration is complete.");
    return;
  }
  if (input.observed) {
    s.lastObserved = { ...input.observed };
    s.lastObservedAt = input.now;
  }
  const moved = followDistance(input.player, s.lastPlayer) > 0;
  const together = input.observed && followDistance(input.player, input.observed) <= 3;
  if (moved || together) s.progressAt = input.now;
  s.lastPlayer = { ...input.player };
  if (input.now - s.progressAt >= 5 || input.now - s.lastObservedAt >= 5) {
    pauseFollow(
      s,
      input.observed
        ? "No walking progress for five game minutes."
        : "Target not observable for five game minutes. Walk closer, then Resume.",
    );
    return;
  }
  s.goal = input.goal;
  s.state = input.observed && input.goal ? "accompanying" : "waiting";
  s.reason = !input.observed
    ? "Waiting near the last observed public position."
    : !input.goal
      ? "Waiting for a reachable free place near the doorway or resident."
      : "Walking together at ordinary speed.";
}

export function retainFollowEvidence(s: FollowSession, entry: FollowEvidence) {
  if (
    !followRunning(s) ||
    s.evidence.some((e) => e.eventId === entry.eventId && e.recipient === entry.recipient)
  )
    return false;
  if (s.evidence.length >= FOLLOW_LIMITS.evidence) return false;
  s.evidence.push({ ...entry, text: entry.text.slice(0, FOLLOW_LIMITS.text) });
  // Terminal fields are outside the evidence array: a full journal always has a receipt.
  if (s.evidence.length === FOLLOW_LIMITS.evidence)
    endFollow(s, entry.at, "Journal capacity reached (128 entries). Actual history retained.");
  return true;
}
