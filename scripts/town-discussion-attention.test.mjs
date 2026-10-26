import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const d = await server.ssrLoadModule("/src/game/discussions.ts");
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
after(() => server.close());

let serial = 0;
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const meeting = (town) => town.discussions.sessions.at(-1);
const member = (town, id) => meeting(town).members.find((entry) => entry.id === id);
const ok = (result) => assert.equal(result.ok, true, result.message);
function command(town, id, kind, fields = {}) {
  const result = d.applyDiscussionCommand(town, id, {
    kind,
    ...fields,
    meetingId: meeting(town).id,
    expectedRevision: member(town, id).revision,
    commandId: `attention-test:${++serial}`,
  });
  ok(result);
  return result;
}
function fixture() {
  const town = createTown("Listener QA");
  town.paused = true;
  for (const [id, tile] of Object.entries({
    player: { x: 43, y: 22 },
    arwyn: { x: 44, y: 21 },
    northern: { x: 42, y: 21 },
    sub: { x: 43, y: 20 },
    baba: { x: 42, y: 22 },
  })) {
    person(town, id).tile = tile;
    person(town, id).path = [];
  }
  ok(d.createLibraryDiscussion(town, "An optional shared reading", "arwyn"));
  for (const id of ["arwyn", "northern", "sub"]) command(town, "player", "invite", { invitee: id });
  return town;
}
function join(town, id, mode = "listen") {
  if (member(town, id).choice === "pending") command(town, id, "accept");
  command(town, id, mode);
}
function allListening() {
  const town = fixture();
  for (const id of ["arwyn", "northern", "sub"]) join(town, id);
  assert.equal(meeting(town).status, "active");
  assert.equal(d.nextDiscussionJob(town), null);
  return town;
}
function decide(town, decision) {
  const job = d.nextDiscussionJob(town);
  assert.ok(job, "An actual engine-scheduled decision must be available");
  assert.equal(d.markDiscussionRequest(town, job), true);
  const result = d.applyDiscussionResult(town, { ...job, mind: "grok", decision });
  ok(result);
  d.recordDiscussionUsage(town, job, {
    success: true,
    attempts: 1,
    totalTokens: 20,
    elapsedMs: 10,
  });
  return job;
}
function floorJob(town) {
  const session = meeting(town);
  return {
    kind: "act",
    task: "discussion",
    day: town.day,
    minute: town.minute,
    agentId: session.floor.actor,
    meetingId: session.id,
    sessionRevision: session.epoch,
    actorRevision: member(town, session.floor.actor).revision,
    turnId: session.floor.id,
  };
}

test("explicit Start offers an already-listening facilitator one free choice, then parks", () => {
  const town = allListening();
  const before = structuredClone(town);
  assert.equal(d.requestDiscussionFacilitation(town), true);
  assert.equal(d.requestDiscussionFacilitation(town), false, "An existing job is not recued");
  assert.equal(d.nextDiscussionJob(town).agentId, "arwyn");
  assert.equal(member(town, "arwyn").revision, member(before, "arwyn").revision + 1);
  assert.deepEqual(town.agents, before.agents, "The cue invents no observation or speech");
  assert.deepEqual(meeting(town).usage, meeting(before).usage);
  assert.deepEqual(meeting(town).queue, []);
  assert.equal(meeting(town).floor, null);
  assert.deepEqual(
    meeting(town).members.map((m) => [m.choice, m.mode]),
    meeting(before).members.map((m) => [m.choice, m.mode]),
  );
  const actions = d.discussionObservation(town, "arwyn").availableActions;
  assert.deepEqual(
    actions.find((action) => action.kind === "listen"),
    { kind: "listen", label: "Keep listening" },
  );
  assert.ok(actions.some((action) => action.kind === "participate"));
  assert.ok(actions.some((action) => action.kind === "close"));
  assert.ok(!actions.some((action) => action.kind === "speak"));
  decide(town, { kind: "listen" });
  for (let i = 0; i < 4; i++) {
    d.advanceDiscussions(town);
    assert.equal(d.nextDiscussionJob(town), null, "Idle checks consume no further choice");
  }
  assert.equal(meeting(town).decisions, 1);
  assert.equal(meeting(town).utterances.length, 0);
  assert.ok(
    meeting(town).members.every((m) => m.mode === (m.id === "player" ? "off" : "listening")),
  );
  assert.deepEqual(d.validateDiscussions(town), []);
});

test("only an actual heard line offers a listener one reconsideration, without backfill", () => {
  const town = fixture();
  join(town, "arwyn", "participate");
  join(town, "northern");
  command(town, "sub", "decline");
  const before = structuredClone(town);
  assert.equal(
    decide(town, { kind: "speak", text: "A proposal for the attentive listeners." }).agentId,
    "arwyn",
  );
  const turn = meeting(town).utterances[0];
  assert.deepEqual(turn.recipientIds, ["northern"]);
  assert.equal(d.nextDiscussionJob(town).agentId, "northern");
  assert.equal(member(town, "northern").decisionNeeded, true);
  assert.equal(d.discussionObservation(town, "northern").receivedTurns[0].text, turn.text);
  for (const id of ["sub", "player", "baba"]) {
    assert.deepEqual(person(town, id).memories, person(before, id).memories);
    assert.deepEqual(d.discussionObservation(town, id).receivedTurns, []);
    if (member(town, id)) assert.deepEqual(member(town, id), member(before, id));
  }
  decide(town, { kind: "listen" });
  assert.equal(member(town, "northern").decisionNeeded, false);
  assert.equal(d.nextDiscussionJob(town).agentId, "arwyn");
  join(town, "player");
  assert.deepEqual(d.discussionObservation(town, "player").receivedTurns, []);
  assert.equal(person(town, "player").memories.length, person(before, "player").memories.length);
  const restored = save.parseTownFile(save.exportTown(town));
  assert.deepEqual(restored.discussions, town.discussions);
  assert.deepEqual(d.validateDiscussions(restored), []);
});

test("declined, off and nearby nonmembers receive neither a speech cue nor a memory", () => {
  const town = fixture();
  join(town, "arwyn", "participate");
  command(town, "northern", "decline");
  command(town, "sub", "accept");
  join(town, "player");
  const before = structuredClone(town);
  command(town, "arwyn", "speak", { text: "Only the player is deliberately listening." });
  assert.deepEqual(meeting(town).utterances[0].recipientIds, ["player"]);
  for (const id of ["northern", "sub", "baba"]) {
    assert.deepEqual(person(town, id).memories, person(before, id).memories);
    assert.deepEqual(d.discussionObservation(town, id).receivedTurns, []);
    if (member(town, id)) assert.deepEqual(member(town, id), member(before, id));
  }
});

test("listener turn requests acknowledge the cue without invalidating the reserved speaker", () => {
  const town = fixture();
  join(town, "arwyn", "participate");
  join(town, "northern");
  join(town, "sub");
  decide(town, { kind: "speak", text: "Would anyone like a turn?" });
  const reserved = floorJob(town);
  assert.equal(reserved.agentId, "arwyn");
  assert.equal(d.isDiscussionJobFresh(town, reserved), true);
  assert.equal(decide(town, { kind: "request-turn" }).agentId, "northern");
  assert.equal(member(town, "northern").decisionNeeded, false);
  assert.equal(member(town, "northern").mode, "participating");
  assert.equal(d.isDiscussionJobFresh(town, reserved), true);
  // Earlier v2 saves may retain this flag after a queued request. Withdrawing
  // that request must acknowledge it instead of immediately scheduling a loop.
  member(town, "northern").decisionNeeded = true;
  assert.deepEqual(d.validateDiscussions(town), []);
  command(town, "northern", "withdraw-turn");
  assert.equal(member(town, "northern").decisionNeeded, false);
  assert.equal(decide(town, { kind: "listen" }).agentId, "sub");
  assert.equal(d.isDiscussionJobFresh(town, reserved), true);
  assert.deepEqual(d.nextDiscussionJob(town), reserved);
  command(town, "northern", "request-turn");
  assert.equal(d.markDiscussionRequest(town, reserved), true);
  ok(d.applyDiscussionResult(town, { ...reserved, mind: "grok", decision: { kind: "pass" } }));
  d.recordDiscussionUsage(town, reserved, {
    success: true,
    attempts: 1,
    totalTokens: 10,
    elapsedMs: 1,
  });
  assert.equal(meeting(town).floor.actor, "northern", "The normal fair queue is retained");
  assert.deepEqual(d.validateDiscussions(town), []);
});

test("newly heard speech makes an older pending listener proposal stale", () => {
  const town = fixture();
  join(town, "arwyn", "participate");
  join(town, "northern");
  join(town, "sub");
  join(town, "player", "participate");
  decide(town, { kind: "speak", text: "The initial actual proposal." });
  assert.equal(meeting(town).floor.actor, "player");
  const pending = d.nextDiscussionJob(town);
  assert.equal(pending.agentId, "northern");
  assert.equal(d.markDiscussionRequest(town, pending), true);
  const oldRevision = member(town, "northern").revision;
  command(town, "player", "speak", { text: "A new actual point while the choice was pending." });
  assert.equal(member(town, "northern").revision, oldRevision + 1);
  assert.equal(d.discussionObservation(town, "northern").receivedTurns.length, 2);
  assert.equal(d.isDiscussionJobFresh(town, pending), false);
  assert.equal(
    d.applyDiscussionResult(town, {
      ...pending,
      mind: "grok",
      decision: { kind: "listen" },
    }).ok,
    false,
  );
  assert.equal(member(town, "northern").decisionNeeded, true);
  assert.equal(member(town, "northern").mode, "listening");
  d.recordDiscussionUsage(town, pending, {
    success: false,
    attempts: 1,
    totalTokens: 12,
    elapsedMs: 3,
  });
  d.pauseDiscussion(town, "The older listener proposal is stale.");
  assert.equal(meeting(town).utterances.length, 2, "No rejected words were reconstructed");
  assert.deepEqual(d.validateDiscussions(town), []);
});

test("Start cannot add another cue to an existing decision, pending request or player floor", () => {
  const pendingInvitation = fixture();
  const snapshot = save.exportTown(pendingInvitation);
  assert.equal(d.requestDiscussionFacilitation(pendingInvitation), false);
  assert.equal(save.exportTown(pendingInvitation), snapshot);
  const town = allListening();
  assert.equal(d.requestDiscussionFacilitation(town), true);
  const job = d.nextDiscussionJob(town);
  assert.equal(d.markDiscussionRequest(town, job), true);
  const inFlight = save.exportTown(town);
  assert.equal(d.requestDiscussionFacilitation(town), false);
  assert.equal(save.exportTown(town), inFlight);
  const playerFloor = allListening();
  join(playerFloor, "player", "participate");
  assert.equal(meeting(playerFloor).floor.actor, "player");
  const held = save.exportTown(playerFloor);
  assert.equal(d.requestDiscussionFacilitation(playerFloor), false);
  assert.equal(d.nextDiscussionJob(playerFloor), null);
  assert.equal(save.exportTown(playerFloor), held);
});

test("Start respects presence, quorum, pauses, six turns and sixteen decisions", () => {
  for (const alter of [
    (town) => command(town, "arwyn", "stop-listening"),
    (town) => command(town, "arwyn", "leave"),
    (town) => {
      person(town, "arwyn").tile = { x: 10, y: 21 };
    },
    (town) => {
      command(town, "northern", "stop-listening");
      command(town, "sub", "stop-listening");
    },
    (town) => d.pauseDiscussion(town),
    (town) => command(town, "arwyn", "close"),
  ]) {
    const town = allListening();
    alter(town);
    const before = save.exportTown(town);
    assert.equal(d.requestDiscussionFacilitation(town), false);
    assert.equal(save.exportTown(town), before);
  }
  const bounded = allListening();
  for (let i = 0; i < 16; i++) {
    assert.equal(d.requestDiscussionFacilitation(bounded), true);
    decide(bounded, { kind: "listen" });
  }
  assert.equal(meeting(bounded).status, "paused");
  assert.equal(d.requestDiscussionFacilitation(bounded), false);
  assert.equal(d.nextDiscussionJob(bounded), null);
  assert.equal(meeting(bounded).decisions, 16);
  assert.equal(d.resumeDiscussion(bounded).ok, false);
  assert.deepEqual(d.validateDiscussions(bounded), []);
  const complete = allListening();
  command(complete, "arwyn", "participate");
  for (let i = 0; i < 6; i++) command(complete, "arwyn", "speak", { text: `Actual line ${i + 1}` });
  assert.equal(meeting(complete).status, "closed");
  assert.ok(meeting(complete).members.every((m) => !m.decisionNeeded));
  assert.equal(d.requestDiscussionFacilitation(complete), false);
  assert.equal(d.nextDiscussionJob(complete), null);
});
