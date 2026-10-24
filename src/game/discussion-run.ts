import type { AgentId } from "./types";
import type { DiscussionJob, DiscussionSession } from "./discussion-types";

export const DISCUSSION_RUN_INTERVAL_MS = 31_000;

/** Opaque town reference prevents an imported copy of the same world resuming a run. */
export type DiscussionRunSnapshot = {
  town: object | null;
  townIdentity: string | null;
  meeting: {
    id: string;
    epoch: number;
    status: DiscussionSession["status"];
    decisions: number;
    utteranceCount: number;
    floorActor: AgentId | null;
  } | null;
  job: DiscussionJob | null;
  jobFresh: boolean;
  visible: boolean;
  replaying: boolean;
  importing: boolean;
  localOnly: boolean;
  enabled: boolean;
  available: boolean;
  /** Include the existing global transport lock and logical pending request. */
  busy: boolean;
  /** The shared physical start time, including manual/other AI requests. */
  lastRequestStartedAt: number | null;
  waitingForArrival?: boolean;
};

export type DiscussionRunToken = Readonly<{ generation: number; sequence: number }>;
export type DiscussionRunState = Readonly<{
  status: "running" | "stopped";
  reason: string | null;
  town: object | null;
  townIdentity: string | null;
  meetingId: string | null;
  meetingEpoch: number | null;
  generation: number;
  requestSequence: number;
  requestsStarted: number;
  lastStartedAt: number | null;
  inFlight: DiscussionRunToken | null;
}>;

export type DiscussionRunDecision =
  | { kind: "stopped"; state: DiscussionRunState | null; reason: string; waitMs: 0 }
  | {
      kind: "wait";
      state: DiscussionRunState;
      reason: string;
      waitMs: number;
      waitingFor: "request" | "pacing" | "player" | "arrival";
    }
  | {
      kind: "ready";
      state: DiscussionRunState;
      reason: null;
      waitMs: 0;
      job: DiscussionJob;
    };

const validTime = (value: number | null): boolean =>
  value === null || (Number.isFinite(value) && value >= 0);

export function stopDiscussionRun(
  state: DiscussionRunState | null,
  reason = "Automatic meeting decisions stopped. Start again when you are ready.",
): DiscussionRunState | null {
  return state ? { ...state, status: "stopped", reason } : null;
}

/** Explicit user start/resume only. A previous run retains pacing after stopping. */
export function startDiscussionRun(
  snapshot: DiscussionRunSnapshot,
  nowMs: number,
  previous: DiscussionRunState | null = null,
): DiscussionRunState {
  if (previous?.inFlight)
    return {
      ...previous,
      status: "stopped",
      reason: "The previous request is still settling. Start again after it finishes.",
    };
  const sameMeeting =
    previous?.town === snapshot.town &&
    previous?.townIdentity === snapshot.townIdentity &&
    previous?.meetingId === snapshot.meeting?.id;
  const state: DiscussionRunState = {
    status: "running",
    reason: null,
    town: snapshot.town,
    townIdentity: snapshot.townIdentity,
    meetingId: snapshot.meeting?.id ?? null,
    meetingEpoch: snapshot.meeting?.epoch ?? null,
    generation: (previous?.generation ?? 0) + 1,
    requestSequence: previous?.requestSequence ?? 0,
    requestsStarted: sameMeeting ? previous!.requestsStarted : 0,
    lastStartedAt: previous?.lastStartedAt ?? null,
    inFlight: null,
  };
  return evaluateDiscussionRun(state, snapshot, nowMs).state!;
}

/** No clocks, timers, model calls, save writes or changes to the normal NPC queue. */
export function evaluateDiscussionRun(
  state: DiscussionRunState | null,
  snapshot: DiscussionRunSnapshot,
  nowMs: number,
): DiscussionRunDecision {
  const stopped = (reason: string): DiscussionRunDecision => ({
    kind: "stopped",
    state: stopDiscussionRun(state, reason),
    reason,
    waitMs: 0,
  });
  const wait = (
    reason: string,
    waitingFor: "request" | "pacing" | "player" | "arrival",
    waitMs = 0,
  ): DiscussionRunDecision => ({ kind: "wait", state: state!, reason, waitingFor, waitMs });
  if (!state) return stopped("Start automatic meeting decisions when you are ready.");
  if (state.status === "stopped")
    return {
      kind: "stopped",
      state,
      reason: state.reason ?? "Automatic meeting decisions stopped.",
      waitMs: 0,
    };
  if (
    !Number.isFinite(nowMs) ||
    nowMs < 0 ||
    !validTime(snapshot.lastRequestStartedAt) ||
    !validTime(state.lastStartedAt)
  )
    return stopped("The request clock is unavailable. Start again after checking the connection.");
  if (
    !snapshot.town ||
    !snapshot.townIdentity ||
    snapshot.town !== state.town ||
    snapshot.townIdentity !== state.townIdentity
  )
    return stopped("The town changed. Start automatic meeting decisions in the current town.");
  if (snapshot.importing)
    return stopped("Town import opened. Start again after choosing the town to use.");
  if (snapshot.replaying) return stopped("Replay is view-only. Return to now and start again.");
  if (!snapshot.visible) return stopped("This tab is hidden. Return here and start again.");
  if (!snapshot.enabled)
    return stopped("Library meetings are disabled. Enable them and start again.");
  if (snapshot.localOnly)
    return stopped("Local dialogue is selected. Enable AI before starting again.");
  if (!snapshot.available)
    return stopped("Resident AI is unavailable. Check the connection and start again.");
  const meeting = snapshot.meeting;
  if (!meeting || meeting.id !== state.meetingId)
    return stopped("The meeting changed. Start automatic decisions for the current meeting.");
  if (meeting.status === "closed") return stopped("This meeting is finished.");
  if (meeting.status === "paused")
    return stopped("The meeting is paused. Resume it and explicitly start again.");
  if (!["gathering", "active"].includes(meeting.status))
    return stopped(
      "The meeting state could not be checked. Preserve the town before trying again.",
    );
  if (meeting.epoch !== state.meetingEpoch)
    return stopped("The meeting was interrupted. Start again with its current state.");
  if (
    !Number.isSafeInteger(meeting.decisions) ||
    meeting.decisions < 0 ||
    !Number.isSafeInteger(meeting.utteranceCount) ||
    meeting.utteranceCount < 0
  )
    return stopped(
      "The meeting state could not be checked. Preserve the town and start again after checking it.",
    );
  // The final permitted request must settle before its newly marked count stops
  // the run; stopping here must never cancel an already authorized response.
  if (state.inFlight || snapshot.busy)
    return wait("Waiting for the current AI request to finish.", "request");
  if (meeting.decisions >= 16) return stopped("This meeting reached its sixteen-decision limit.");
  if (meeting.utteranceCount >= 6) return stopped("This meeting reached its six-turn limit.");
  if (meeting.floorActor === "player")
    return wait("It is your turn. Say your line or pass to continue.", "player");
  const job = snapshot.job;
  if (!job) {
    if (snapshot.waitingForArrival)
      return wait("Waiting for residents to arrive at the library.", "arrival");
    return stopped("No resident decision is ready. Nobody is required to speak.");
  }
  if (
    !snapshot.jobFresh ||
    job.kind !== "act" ||
    job.task !== "discussion" ||
    job.agentId === ("player" as string) ||
    job.meetingId !== meeting.id ||
    job.sessionRevision !== meeting.epoch
  )
    return stopped("That resident decision changed. Check the meeting and start again.");
  const lastStart = Math.max(
    state.lastStartedAt ?? -Infinity,
    snapshot.lastRequestStartedAt ?? -Infinity,
  );
  const remaining = Math.max(0, lastStart + DISCUSSION_RUN_INTERVAL_MS - nowMs);
  if (remaining > 0) return wait("Waiting between AI requests.", "pacing", remaining);
  return { kind: "ready", state, reason: null, waitMs: 0, job: { ...job } };
}

/** Call immediately at the actual physical request start, after all UI guards. */
export function markDiscussionRunStarted(
  state: DiscussionRunState | null,
  snapshot: DiscussionRunSnapshot,
  nowMs: number,
): { state: DiscussionRunState; token: DiscussionRunToken; job: DiscussionJob } | null {
  const decision = evaluateDiscussionRun(state, snapshot, nowMs);
  if (decision.kind !== "ready") return null;
  const token = {
    generation: decision.state.generation,
    sequence: decision.state.requestSequence + 1,
  };
  return {
    state: {
      ...decision.state,
      lastStartedAt: nowMs,
      requestSequence: token.sequence,
      requestsStarted: decision.state.requestsStarted + 1,
      inFlight: token,
    },
    token,
    job: decision.job,
  };
}

/** A late/duplicate completion can release only the matching run request. */
export function settleDiscussionRun(
  state: DiscussionRunState | null,
  token: DiscussionRunToken,
  success: boolean,
): DiscussionRunState | null {
  if (!state?.inFlight || state.inFlight !== token) return state;
  const settled = { ...state, inFlight: null };
  if (settled.status === "stopped") return settled;
  return success
    ? settled
    : stopDiscussionRun(
        settled,
        "The resident decision failed. Check the meeting and explicitly start again.",
      );
}
