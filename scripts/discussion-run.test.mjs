import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCUSSION_RUN_INTERVAL_MS,
  evaluateDiscussionRun,
  markDiscussionRunStarted,
  settleDiscussionRun,
  startDiscussionRun,
  stopDiscussionRun,
} from "../src/game/discussion-run.ts";

function fixture(fields = {}) {
  return {
    town: {},
    townIdentity: "world:fixture",
    meeting: {
      id: "discussion:10",
      epoch: 3,
      status: "active",
      decisions: 4,
      utteranceCount: 0,
      floorActor: "arwyn",
    },
    job: {
      kind: "act",
      task: "discussion",
      day: 1,
      minute: 420,
      agentId: "arwyn",
      meetingId: "discussion:10",
      sessionRevision: 3,
      actorRevision: 5,
      turnId: "discussion:10:turn:20",
    },
    jobFresh: true,
    visible: true,
    replaying: false,
    importing: false,
    localOnly: false,
    enabled: true,
    available: true,
    busy: false,
    lastRequestStartedAt: null,
    ...fields,
  };
}

function dispatch(snapshot, nowMs = 1_000, previous = null) {
  const state = startDiscussionRun(snapshot, nowMs, previous);
  const marked = markDiscussionRunStarted(state, snapshot, nowMs);
  assert.ok(marked, "Fixture must have one actual eligible request");
  return marked;
}

test("no eligibility, time or availability event starts a run without explicit user start", () => {
  const snapshot = fixture();
  for (const time of [0, 31_000, 1_000_000]) {
    assert.equal(evaluateDiscussionRun(null, snapshot, time).kind, "stopped");
    assert.equal(markDiscussionRunStarted(null, snapshot, time), null);
  }
  const started = startDiscussionRun(snapshot, 0);
  assert.equal(evaluateDiscussionRun(started, snapshot, 0).kind, "ready");
  assert.equal(started.requestsStarted, 0);
  assert.equal(started.lastStartedAt, null);
});

test("physical starts are at least 31 seconds apart across completion, stop and explicit resume", () => {
  assert.equal(DISCUSSION_RUN_INTERVAL_MS, 31_000);
  const snapshot = fixture();
  const first = dispatch(snapshot);
  const settled = settleDiscussionRun(first.state, first.token, true);
  const stopped = stopDiscussionRun(settled, "Stopped by the player.");
  const resumed = startDiscussionRun(snapshot, 1_001, stopped);
  for (const now of [1_001, 31_999]) {
    const decision = evaluateDiscussionRun(resumed, snapshot, now);
    assert.equal(decision.kind, "wait");
    assert.equal(decision.waitingFor, "pacing");
    assert.equal(decision.waitMs, 32_000 - now);
    assert.equal(markDiscussionRunStarted(resumed, snapshot, now), null);
  }
  assert.equal(evaluateDiscussionRun(resumed, snapshot, 32_000).kind, "ready");
  const second = markDiscussionRunStarted(resumed, snapshot, 32_000);
  assert.equal(second.state.requestsStarted, 2);
  assert.equal(second.state.lastStartedAt, 32_000);
});

test("shared manual-request pacing and clock rollback cannot permit an early start", () => {
  const snapshot = fixture({ lastRequestStartedAt: 20_000 });
  const state = startDiscussionRun(snapshot, 21_000);
  assert.equal(evaluateDiscussionRun(state, snapshot, 21_000).waitMs, 30_000);
  assert.equal(evaluateDiscussionRun(state, snapshot, 10_000).waitMs, 41_000);
  assert.equal(markDiscussionRunStarted(state, snapshot, 50_999), null);
  assert.ok(markDiscussionRunStarted(state, snapshot, 51_000));
});

test("global busy and the helper's flight block overlap without counting a waiting attempt", () => {
  const snapshot = fixture({ busy: true });
  const waiting = startDiscussionRun(snapshot, 0);
  assert.equal(evaluateDiscussionRun(waiting, snapshot, 0).waitingFor, "request");
  assert.equal(waiting.requestsStarted, 0);
  assert.equal(markDiscussionRunStarted(waiting, snapshot, 0), null);
  const ready = { ...snapshot, busy: false };
  const first = markDiscussionRunStarted(waiting, ready, 0);
  assert.ok(first);
  const whilePending = { ...ready, job: null, busy: false };
  assert.equal(evaluateDiscussionRun(first.state, whilePending, 40_000).waitingFor, "request");
  assert.equal(markDiscussionRunStarted(first.state, whilePending, 40_000), null);
  assert.equal(first.state.requestsStarted, 1);
});

test("the final permitted decision settles before caps stop the next request", () => {
  const snapshot = fixture({ meeting: { ...fixture().meeting, decisions: 15 } });
  const first = dispatch(snapshot);
  const atCap = { ...snapshot, job: null, meeting: { ...snapshot.meeting, decisions: 16 } };
  assert.equal(evaluateDiscussionRun(first.state, atCap, 40_000).waitingFor, "request");
  const settled = settleDiscussionRun(first.state, first.token, true);
  assert.equal(evaluateDiscussionRun(settled, atCap, 40_000).kind, "stopped");
  assert.equal(markDiscussionRunStarted(settled, atCap, 40_000), null);
  const sixTurns = { ...snapshot, meeting: { ...snapshot.meeting, utteranceCount: 6 } };
  assert.equal(startDiscussionRun(sixTurns, 50_000).status, "stopped");
});

test("a player floor and real arrivals wait without invented passes or resident choices", () => {
  const snapshot = fixture();
  const state = startDiscussionRun(snapshot, 0);
  const playerTurn = {
    ...snapshot,
    job: null,
    meeting: { ...snapshot.meeting, floorActor: "player" },
  };
  const saved = structuredClone(playerTurn);
  assert.equal(evaluateDiscussionRun(state, playerTurn, 100_000).waitingFor, "player");
  assert.equal(markDiscussionRunStarted(state, playerTurn, 100_000), null);
  assert.deepEqual(playerTurn, saved);
  assert.equal(evaluateDiscussionRun(state, snapshot, 100_000).kind, "ready");
  const arrivals = { ...snapshot, job: null, waitingForArrival: true };
  assert.equal(evaluateDiscussionRun(state, arrivals, 100_000).waitingFor, "arrival");
  assert.equal(markDiscussionRunStarted(state, arrivals, 100_000), null);
  assert.equal(evaluateDiscussionRun(state, snapshot, 100_000).kind, "ready");
});

test("no normal NPC job stops willing listeners instead of requeueing or inventing speech", () => {
  const snapshot = fixture({ job: null, meeting: { ...fixture().meeting, floorActor: null } });
  const before = structuredClone(snapshot);
  const stopped = startDiscussionRun(snapshot, 0);
  assert.equal(stopped.status, "stopped");
  assert.equal(
    evaluateDiscussionRun(stopped, { ...snapshot, job: fixture().job }, 50_000).kind,
    "stopped",
  );
  assert.deepEqual(snapshot, before);
});

test("lifecycle interruptions stop until an explicit new start even after conditions recover", () => {
  const snapshot = fixture();
  const state = startDiscussionRun(snapshot, 0);
  for (const mutation of [
    { visible: false },
    { replaying: true },
    { importing: true },
    { enabled: false },
    { localOnly: true },
    { available: false },
    { town: {} },
    { townIdentity: "another-world" },
    { meeting: null },
    { meeting: { ...snapshot.meeting, id: "discussion:11" } },
    { meeting: { ...snapshot.meeting, epoch: 4 } },
    { meeting: { ...snapshot.meeting, status: "paused" } },
    { meeting: { ...snapshot.meeting, status: "closed" } },
  ]) {
    const interrupted = evaluateDiscussionRun(state, { ...snapshot, ...mutation }, 0);
    assert.equal(interrupted.kind, "stopped");
    assert.equal(evaluateDiscussionRun(interrupted.state, snapshot, 50_000).kind, "stopped");
    assert.equal(startDiscussionRun(snapshot, 50_000, interrupted.state).status, "running");
  }
});

test("importing a copy with the same identity cannot carry over automatic authorization", () => {
  const snapshot = fixture();
  const state = startDiscussionRun(snapshot, 0);
  const imported = { ...snapshot, town: structuredClone(snapshot.town) };
  assert.equal(evaluateDiscussionRun(state, imported, 0).kind, "stopped");
  assert.equal(evaluateDiscussionRun(null, imported, 50_000).kind, "stopped");
});

test("stale and foreign jobs fail closed while ordinary new actor revisions remain valid", () => {
  const snapshot = fixture();
  const state = startDiscussionRun(snapshot, 0);
  for (const mutation of [
    { jobFresh: false },
    { job: { ...snapshot.job, task: "physical" } },
    { job: { ...snapshot.job, agentId: "player" } },
    { job: { ...snapshot.job, meetingId: "discussion:11" } },
    { job: { ...snapshot.job, sessionRevision: 4 } },
  ])
    assert.equal(evaluateDiscussionRun(state, { ...snapshot, ...mutation }, 0).kind, "stopped");
  assert.equal(
    evaluateDiscussionRun(
      state,
      { ...snapshot, job: { ...snapshot.job, actorRevision: 6, turnId: "turn:21" } },
      0,
    ).kind,
    "ready",
  );
});

test("failure or cancellation cannot be undone by a late completion or by elapsed time", () => {
  const snapshot = fixture();
  const first = dispatch(snapshot);
  const failed = settleDiscussionRun(first.state, first.token, false);
  assert.equal(failed.status, "stopped");
  assert.equal(failed.inFlight, null);
  assert.equal(evaluateDiscussionRun(failed, snapshot, 100_000).kind, "stopped");
  const cancelled = stopDiscussionRun(first.state, "Stopped while the tab was hidden.");
  const earlyResume = startDiscussionRun(snapshot, 50_000, cancelled);
  assert.equal(earlyResume.status, "stopped");
  assert.equal(earlyResume.inFlight, first.token);
  const completed = settleDiscussionRun(earlyResume, first.token, true);
  assert.equal(completed.status, "stopped");
  assert.equal(completed.inFlight, null);
  assert.equal(startDiscussionRun(snapshot, 50_000, completed).status, "running");
});

test("duplicate or unrelated completion tokens cannot release a newer physical request", () => {
  const snapshot = fixture();
  const first = dispatch(snapshot);
  const settled = settleDiscussionRun(first.state, first.token, true);
  const second = dispatch(snapshot, 40_000, settled);
  assert.equal(settleDiscussionRun(second.state, first.token, false), second.state);
  assert.equal(settleDiscussionRun(second.state, { ...second.token }, true), second.state);
  // A forgotten prior UI state may reuse numeric counters; the token itself
  // remains opaque, so that unrelated completion still cannot clear this run.
  const unrelated = dispatch(snapshot, 0);
  assert.deepEqual(unrelated.token, first.token);
  assert.equal(settleDiscussionRun(unrelated.state, first.token, true), unrelated.state);
});

test("invalid clocks cannot dispatch and pure inspection never mutates its inputs", () => {
  const snapshot = fixture();
  Object.freeze(snapshot.meeting);
  Object.freeze(snapshot.job);
  Object.freeze(snapshot);
  const state = Object.freeze(startDiscussionRun(snapshot, 0));
  const before = { ...state };
  for (const time of [NaN, Infinity, -1]) {
    assert.equal(evaluateDiscussionRun(state, snapshot, time).kind, "stopped");
    assert.equal(markDiscussionRunStarted(state, snapshot, time), null);
  }
  assert.equal(
    evaluateDiscussionRun(state, { ...snapshot, lastRequestStartedAt: NaN }, 0).kind,
    "stopped",
  );
  const marked = markDiscussionRunStarted(state, snapshot, 0);
  assert.ok(marked);
  assert.deepEqual(state, before);
  assert.equal(state.requestsStarted, 0);
  assert.equal(state.inFlight, null);
});
