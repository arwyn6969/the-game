import { z } from "zod";
import type { AgentId, NpcId, Town } from "./types";
import { NPC_IDS, AGENT_IDS } from "./types";
import type { FollowPoint, FollowSession } from "./following-types";
import type { DiscussionCommand, DiscussionUtterance } from "./discussion-types";
import { acousticArea, canHear } from "./attention";
import { applyDiscussionCommand, advanceDiscussions } from "./discussions";
import { wageInterval } from "./funded-work";
import { findPath } from "./path";
import { cell, walkable, zoneAt, placeTitle } from "./world";
import {
  beginFollow,
  currentFollow,
  followRunning,
  followDistance,
  pauseFollow,
  resumeFollow,
  endFollow,
  retainFollowEvidence,
  tickFollow,
  FOLLOW_LIMITS,
} from "./following";

const grants = new WeakMap<Town, { id: string; revision: number }>();
const hasGrant = (town: Town, s: FollowSession) =>
  grants.get(town)?.id === s.id && grants.get(town)?.revision === s.controlRevision;
const grant = (town: Town, s: FollowSession) =>
  grants.set(town, { id: s.id, revision: s.controlRevision });
const person = (town: Town, id: AgentId) => town.agents.find((a) => a.id === id);
export const followTime = (town: Pick<Town, "day" | "minute">) =>
  (town.day - 1) * 1440 + town.minute;
export const publicFollowTile = (point: FollowPoint) =>
  ["outdoors", "library"].includes(acousticArea(point) ?? "");
export const followingOwnsMovement = (town: Town) => {
  const s = currentFollow(town.following);
  return followRunning(s) && hasGrant(town, s);
};
export function observableCompanion(town: Town, target: AgentId): boolean {
  const player = person(town, "player"),
    resident = person(town, target);
  return Boolean(
    target !== "player" &&
    player &&
    resident &&
    publicFollowTile(player.tile) &&
    publicFollowTile(resident.tile) &&
    canHear(player.tile, resident.tile),
  );
}
function compatibleMeeting(town: Town, s: FollowSession) {
  return town.discussions?.sessions.find(
    (m) =>
      ["gathering", "active"].includes(m.status) &&
      m.members.some(
        (a) => a.id === s.target && a.choice === "accepted" && a.arrived && a.mode !== "off",
      ) &&
      m.members.some(
        (a) => a.id === "player" && a.invitation === "delivered" && a.choice === "accepted",
      ),
  );
}
export function followConflict(town: Town, target: NpcId): string | null {
  if (town.coffee?.routines.some((r) => r.worker === "player" && r.status === "active"))
    return "Café service owns movement. Pause it before spending time together; your shift and wage remain reserved.";
  if (
    town.economy?.work?.agreements.some(
      (a) =>
        a.worker === "player" &&
        a.status === "active" &&
        (a.kind === "check" || wageInterval(town, a)),
    )
  )
    return "An earlier work obligation has priority. Its agreement and payment are preserved.";
  const meeting = town.discussions?.sessions.find(
    (m) => m.status !== "closed" && m.members.some((a) => a.id === "player" && a.mode !== "off"),
  );
  if (
    meeting &&
    !meeting.members.some(
      (a) => a.id === target && a.choice === "accepted" && a.arrived && a.mode !== "off",
    )
  )
    return "Your separate discussion has priority. Leave it explicitly before starting another activity.";
  return null;
}
export function followingAttentionCommandOwned(town: Town, command: DiscussionCommand) {
  const s = currentFollow(town.following);
  return Boolean(
    s &&
    ["listen", "stop-listening"].includes(command.kind) &&
    command.commandId ===
      `${s.id}:${s.controlRevision}:${command.kind}:${command.expectedRevision}`,
  );
}
function command(
  town: Town,
  s: FollowSession,
  contextId: string,
  kind: "listen" | "stop-listening",
) {
  const meeting = town.discussions?.sessions.find((m) => m.id === contextId);
  const member = meeting?.members.find((m) => m.id === "player");
  if (!member) return false;
  return applyDiscussionCommand(town, "player", {
    kind,
    meetingId: contextId,
    expectedRevision: member.revision,
    commandId: `${s.id}:${s.controlRevision}:${kind}:${member.revision}`,
  }).ok;
}
function releaseListener(town: Town, s: FollowSession) {
  const owned = s.listener;
  delete s.listener;
  delete s.contextId;
  if (!owned) return;
  const member = town.discussions?.sessions
    .find((m) => m.id === owned.contextId)
    ?.members.find((m) => m.id === "player");
  if (member?.revision === owned.revision && member.mode === "listening")
    command(town, s, owned.contextId, "stop-listening");
}
function release(town: Town, s: FollowSession) {
  // A terminal transition increments the revision before releasing its old path.
  if (grants.get(town)?.id === s.id) {
    const player = person(town, "player");
    if (player) player.path = [];
  }
  grants.delete(town);
  releaseListener(town, s);
}
export function suspendFollowing(town: Town, reason: string) {
  const s = currentFollow(town.following);
  if (!s || s.state === "ended") return false;
  const running = followRunning(s);
  release(town, s);
  pauseFollow(s, reason);
  return running;
}
/** A validated manual attention command supersedes the owned transition itself. */
export function supersedeFollowingAttention(town: Town) {
  const s = currentFollow(town.following);
  if (!s || !followRunning(s)) return;
  delete s.listener;
  delete s.contextId;
  suspendFollowing(town, "You changed discussion attention. Resume explicitly.");
}
export function stopFollowing(town: Town, reason = "You stopped spending time together.") {
  const s = currentFollow(town.following);
  if (!s || s.state === "ended") return;
  release(town, s);
  endFollow(s, followTime(town), reason);
  trim(town);
}
export function startFollowing(
  town: Town,
  target: NpcId,
  duration = 60,
  listen = true,
): { ok: boolean; message: string } {
  if (!NPC_IDS.includes(target) || !observableCompanion(town, target))
    return {
      ok: false,
      message: "Walk within six tiles in an accessible public area or the library first.",
    };
  const conflict = followConflict(town, target);
  if (conflict) return { ok: false, message: conflict };
  // Reserve enough bytes for a full journal before taking control. Normal save recovery remains authoritative.
  if (new TextEncoder().encode(JSON.stringify(town)).length > 8 * 1024 * 1024 - 256 * 1024)
    return {
      ok: false,
      message:
        "This town needs save capacity before another journal can start. Export a recovery copy.",
    };
  const s = beginFollow({
    id: `follow-${crypto.randomUUID()}`,
    target,
    now: followTime(town),
    duration,
    listen,
    observed: person(town, target)!.tile,
    player: person(town, "player")!.tile,
  });
  if (!s) return { ok: false, message: "Choose 30, 60 or 120 game minutes." };
  stopFollowing(town, "A new companion session replaced this session.");
  town.following ??= { version: 1, sessions: [] };
  town.following.sessions = town.following.sessions
    .filter((r) => r.state === "ended")
    .slice(-FOLLOW_LIMITS.completed);
  town.following.sessions.push(s);
  grant(town, s);
  person(town, "player")!.path = [];
  visit(town, s);
  advanceFollowing(town);
  return { ok: true, message: s.reason };
}
export function resumeFollowing(town: Town): { ok: boolean; message: string } {
  const s = currentFollow(town.following);
  if (!s || s.state !== "paused")
    return { ok: false, message: "Choose a paused session to Resume." };
  const conflict = followConflict(town, s.target);
  if (conflict) return { ok: false, message: conflict };
  if (!observableCompanion(town, s.target))
    return { ok: false, message: "Walk closer to the resident in a public area, then Resume." };
  if (!resumeFollow(s, followTime(town), person(town, "player")!.tile))
    return { ok: false, message: s.reason };
  s.lastObserved = { ...person(town, s.target)!.tile };
  grant(town, s);
  person(town, "player")!.path = [];
  advanceFollowing(town);
  return { ok: true, message: s.reason };
}
function visit(town: Town, s: FollowSession) {
  const tile = person(town, "player")!.tile;
  const place = zoneAt(tile.x, tile.y);
  if (!publicFollowTile(tile)) return;
  retainFollowEvidence(s, {
    eventId: `${s.id}:visit:${place}`,
    recipient: "player",
    kind: "visit",
    at: followTime(town),
    place,
    text: `You visited ${placeTitle(place)}.`,
  });
}
function standPoint(town: Town, s: FollowSession, reserved: Partial<Record<AgentId, FollowPoint>>) {
  const player = person(town, "player")!;
  const blocked = new Set([
    ...town.agents.filter((a) => a.id !== "player").map((a) => `${a.tile.x},${a.tile.y}`),
    ...Object.values(reserved).map((p) => `${p!.x},${p!.y}`),
  ]);
  const suitable = (p: FollowPoint) =>
    walkable(p.x, p.y) &&
    publicFollowTile(p) &&
    cell(p.x, p.y)?.ground !== "door" &&
    !blocked.has(`${p.x},${p.y}`) &&
    followDistance(p, s.lastObserved) >= 1 &&
    followDistance(p, s.lastObserved) <= 3 &&
    canHear(p, s.lastObserved);
  const reachable = (p: FollowPoint) => {
    if (followDistance(player.tile, p) === 0) return true;
    const route = findPath(player.tile, p, blocked);
    return route.length > 0 && route.every(publicFollowTile);
  };
  if (s.goal && suitable(s.goal) && reachable(s.goal)) return s.goal;
  const candidates: FollowPoint[] = [];
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -3; dy <= 3; dy++) {
      const p = { x: s.lastObserved.x + dx, y: s.lastObserved.y + dy };
      if (suitable(p)) candidates.push(p);
    }
  return candidates
    .sort(
      (a, b) =>
        followDistance(player.tile, a) - followDistance(player.tile, b) || a.y - b.y || a.x - b.x,
    )
    .find(reachable);
}
/** One goal is selected before the existing bounded navigation pass; no NPC plans are changed. */
export function followingMovementGoal(
  town: Town,
  reserved: Partial<Record<AgentId, FollowPoint>> = {},
) {
  const s = currentFollow(town.following);
  if (!s || !followRunning(s)) return undefined;
  if (!hasGrant(town, s)) {
    suspendFollowing(town, "Restored history has no movement authority. Resume explicitly.");
    return undefined;
  }
  const conflict = followConflict(town, s.target);
  if (conflict || reserved.player) {
    suspendFollowing(town, conflict ?? "An earlier activity owns movement.");
    return undefined;
  }
  if (s.listener) {
    const m = town.discussions?.sessions
      .find((m) => m.id === s.listener!.contextId)
      ?.members.find((m) => m.id === "player");
    if (m && m.revision !== s.listener.revision) {
      suspendFollowing(town, "Discussion attention changed. Resume explicitly.");
      return undefined;
    }
  }
  const observed = observableCompanion(town, s.target) ? person(town, s.target)!.tile : undefined;
  if (observed) s.lastObserved = { ...observed };
  const goal = standPoint(town, s, reserved);
  tickFollow(s, { now: followTime(town), player: person(town, "player")!.tile, observed, goal });
  if (!followRunning(s)) {
    release(town, s);
    trim(town);
    return undefined;
  }
  visit(town, s);
  if (!followRunning(s)) {
    release(town, s);
    trim(town);
    return undefined;
  }
  return goal;
}
function trim(town: Town) {
  if (town.following) {
    const active = town.following.sessions.filter((s) => s.state !== "ended");
    town.following.sessions = [
      ...town.following.sessions.filter((s) => s.state === "ended").slice(-FOLLOW_LIMITS.completed),
      ...active,
    ];
  }
}
export function advanceFollowing(town: Town) {
  const s = currentFollow(town.following);
  if (!s || !followRunning(s) || !hasGrant(town, s)) return;
  advanceDiscussions(town);
  const meeting = observableCompanion(town, s.target) ? compatibleMeeting(town, s) : undefined;
  if (s.listener && s.listener.contextId !== meeting?.id) releaseListener(town, s);
  if (s.listen && meeting) {
    const member = meeting.members.find((m) => m.id === "player")!;
    if (
      member.arrived &&
      member.mode === "off" &&
      !s.listener &&
      command(town, s, meeting.id, "listen")
    )
      s.listener = { contextId: meeting.id, revision: member.revision };
    if (member.arrived && member.mode === "listening") {
      s.state = "listening";
      s.contextId = meeting.id;
      s.reason = "Listening to this library discussion. Only received words enter your journal.";
    }
  }
  const library = town.economy?.projects?.library as unknown as
    | Pick<
        Parameters<typeof import("./reading-evening").validateReadingEvening>[1],
        "evening" | "events"
      >
    | undefined;
  const reading = library?.evening;
  const scene = library?.events.find((e) => e.id === `reading:${reading?.eventId}:scene`);
  if (
    reading?.status === "done" &&
    reading.attendedByPlayer &&
    reading.completedAt &&
    reading.outcome &&
    scene?.participants.includes("player") &&
    scene.participants.includes(s.target) &&
    followTime(scene) >= s.startedAt &&
    followTime(scene) <= followTime(town)
  )
    retainFollowEvidence(s, {
      eventId: scene.id,
      recipient: "player",
      kind: "activity",
      at: followTime(scene),
      place: reading.choice ?? "library",
      text: reading.outcome,
    });
  if (!followRunning(s)) {
    release(town, s);
    trim(town);
  }
}
/** Called at utterance commitment, after the discussion's existing acoustic/attention checks. */
export function recordFollowingSpeech(town: Town, contextId: string, turn: DiscussionUtterance) {
  const s = currentFollow(town.following);
  if (
    !s ||
    !followRunning(s) ||
    !hasGrant(town, s) ||
    s.contextId !== contextId ||
    !turn.recipientIds.includes("player")
  )
    return;
  if (followTime(town) >= s.deadline) {
    stopFollowing(town, "The selected game-time duration is complete.");
    return;
  }
  retainFollowEvidence(s, {
    eventId: turn.id,
    recipient: "player",
    kind: "speech",
    at: followTime(turn.at),
    place: "library",
    contextId,
    speaker: turn.speaker,
    text: turn.text,
  });
  if (!followRunning(s)) {
    release(town, s);
    trim(town);
  }
}
export function recoverFollowing(town: Town) {
  const s = currentFollow(town.following);
  if (!s) return;
  release(town, s);
  pauseFollow(
    s,
    "Town restored. Resume explicitly in the live town; no missed speech was replayed.",
  );
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) =>
        !Array.from(s).some((c) => {
          const n = c.charCodeAt(0);
          return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
        }),
    );
const time = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1440);
const point = z
  .object({ x: z.number().int().min(0).max(100), y: z.number().int().min(0).max(100) })
  .strict();
const evidence = z
  .object({
    eventId: text(180),
    recipient: z.literal("player"),
    kind: z.enum(["visit", "speech", "activity"]),
    at: time,
    place: text(40),
    text: text(400),
    speaker: z.enum(AGENT_IDS).optional(),
    contextId: text(180).optional(),
  })
  .strict();
const session = z
  .object({
    id: text(180),
    target: z.enum(NPC_IDS),
    policyVersion: z.literal(1),
    controlRevision: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER - 1440),
    state: z.enum(["accompanying", "listening", "waiting", "paused", "ended"]),
    duration: z.union([z.literal(30), z.literal(60), z.literal(120)]),
    listen: z.boolean(),
    startedAt: time,
    deadline: time,
    progressAt: time,
    lastObserved: point,
    lastObservedAt: time,
    lastPlayer: point,
    goal: point.optional(),
    contextId: text(180).optional(),
    listener: z
      .object({ contextId: text(180), revision: z.number().int().nonnegative() })
      .strict()
      .optional(),
    reason: text(400),
    endedAt: time.optional(),
    evidence: z.array(evidence).max(128),
  })
  .strict()
  .refine(
    (s) =>
      (s.evidence.length < FOLLOW_LIMITS.evidence || s.state === "ended") &&
      s.deadline === s.startedAt + s.duration &&
      s.progressAt >= s.startedAt &&
      s.lastObservedAt >= s.startedAt &&
      (s.state === "ended") === (s.endedAt !== undefined) &&
      (s.endedAt === undefined || s.endedAt >= s.startedAt) &&
      s.evidence.every((e) => e.at >= s.startedAt && e.at <= s.deadline) &&
      new Set(s.evidence.map((e) => `${e.recipient}:${e.eventId}`)).size === s.evidence.length,
  );
const schema = z
  .object({ version: z.literal(1), sessions: z.array(session).max(9) })
  .strict()
  .refine(
    (s) =>
      s.sessions.filter((r) => r.state === "ended").length <= 8 &&
      s.sessions.filter((r) => r.state !== "ended").length <= 1 &&
      s.sessions.slice(0, -1).every((r) => r.state === "ended") &&
      new Set(s.sessions.map((r) => r.id)).size === s.sessions.length,
  );
export function validateFollowing(town: Town): string[] {
  if (!Object.hasOwn(town, "following")) return [];
  return town.version === 2 &&
    schema.safeParse(town.following).success &&
    town.following!.sessions.every(
      (s) =>
        s.startedAt <= followTime(town) &&
        s.evidence.every((e) => e.at <= followTime(town)) &&
        (s.endedAt === undefined || s.endedAt <= followTime(town)),
    )
    ? []
    : ["Following journal is unsupported or malformed. Keep the original town bytes for recovery."];
}
