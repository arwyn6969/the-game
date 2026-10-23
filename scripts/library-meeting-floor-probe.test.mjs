import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { currentDiscussionFloorJob } from "./library-meeting-floor-probe.mjs";

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
after(() => server.close());
const core = { observation: d.discussionObservation, isFresh: d.isDiscussionJobFresh };
const meeting = (town) => town.discussions.sessions.at(-1);
const member = (town, id) => meeting(town).members.find((person) => person.id === id);
const person = (town, id) => town.agents.find((person) => person.id === id);
let commandNumber = 0;
function command(town, id, kind, fields = {}) {
  const result = d.applyDiscussionCommand(town, id, {
    kind,
    ...fields,
    meetingId: meeting(town).id,
    expectedRevision: member(town, id).revision,
    commandId: `fixture:${++commandNumber}`,
  });
  assert.equal(result.ok, true, result.message);
}
function fixture() {
  const town = createTown("Observer");
  for (const [id, tile] of Object.entries({
    arwyn: { x: 44, y: 21 },
    northern: { x: 42, y: 21 },
    sub: { x: 43, y: 20 },
    player: { x: 43, y: 22 },
    baba: { x: 42, y: 22 },
  }))
    person(town, id).tile = tile;
  assert.equal(d.createLibraryDiscussion(town, "An optional shared reading", "arwyn").ok, true);
  for (const id of ["arwyn", "northern", "sub"]) {
    command(town, "player", "invite", { invitee: id });
    command(town, id, "accept");
  }
  command(town, "arwyn", "participate");
  command(town, "northern", "listen");
  assert.equal(meeting(town).status, "active");
  return town;
}
function applyModelChoice(town, decision) {
  const job = currentDiscussionFloorJob(town, core);
  assert.ok(job);
  assert.equal(d.markDiscussionRequest(town, job), true);
  const result = d.applyDiscussionResult(town, { ...job, mind: "grok", decision });
  assert.equal(result.ok, true, result.message);
  d.recordDiscussionUsage(town, job, {
    attempts: 1,
    totalTokens: 30,
    elapsedMs: 10,
    success: true,
  });
  return job;
}

test("probe selects only the actual Arwyn floor while ordinary next decision remains Sub", () => {
  const town = fixture(),
    before = structuredClone(town);
  assert.equal(d.nextDiscussionJob(town).agentId, "sub");
  const job = currentDiscussionFloorJob(town, core);
  assert.equal(job.agentId, "arwyn");
  assert.equal(job.sessionRevision, meeting(town).epoch);
  assert.equal(job.actorRevision, member(town, "arwyn").revision);
  assert.equal(job.turnId, meeting(town).floor.id);
  assert.equal(job.day, town.day);
  assert.equal(job.minute, town.minute);
  assert.deepEqual(
    town,
    before,
    "Selecting a floor must not change choices, hearing, time or queue",
  );
  assert.equal(d.nextDiscussionJob(town).agentId, "sub");
});

test("real executor accepts the probed floor and delivers only to actual opted-in listeners", () => {
  const town = fixture();
  const subMemories = structuredClone(person(town, "sub").memories);
  const babaMemories = structuredClone(person(town, "baba").memories);
  const playerMemories = structuredClone(person(town, "player").memories);
  const first = applyModelChoice(town, {
    kind: "speak",
    text: "Could we make a reading welcoming?",
  });
  assert.deepEqual(meeting(town).utterances[0].recipientIds, ["northern"]);
  assert.deepEqual(person(town, "sub").memories, subMemories);
  assert.deepEqual(person(town, "baba").memories, babaMemories);
  assert.deepEqual(person(town, "player").memories, playerMemories);
  assert.equal(member(town, "sub").mode, "off");
  command(town, "player", "listen");
  const second = applyModelChoice(town, {
    kind: "speak",
    text: "An idea for those now listening.",
  });
  assert.notEqual(
    second.turnId,
    first.turnId,
    "Only the newly reserved current floor may be reused",
  );
  assert.deepEqual(meeting(town).utterances[1].recipientIds.sort(), ["northern", "player"]);
  assert.deepEqual(
    d.discussionObservation(town, "player").receivedTurns.map((turn) => turn.seq),
    [2],
  );
  assert.deepEqual(person(town, "sub").memories, subMemories);
  assert.equal(
    d.nextDiscussionJob(town).agentId,
    "sub",
    "The probe must not consume Sub's pending choice",
  );
});

test("the floor still offers genuine pass, leave and close choices", () => {
  for (const kind of ["pass", "leave", "close"]) {
    const town = fixture();
    const view = d.discussionObservation(town, "arwyn");
    assert.ok(view.availableActions.some((action) => action.kind === kind));
    applyModelChoice(town, { kind });
    assert.deepEqual(meeting(town).utterances, []);
    if (kind !== "pass") assert.equal(currentDiscussionFloorJob(town, core), null);
    else
      assert.equal(
        member(town, "arwyn").mode,
        "participating",
        "A pass uses ordinary core behavior; the operator runner decides to stop probing",
      );
  }
});

test("paused, unarrived, withdrawn, moved or pending floor cannot be probed", () => {
  const paused = fixture();
  d.pauseDiscussion(paused, "Provider failure");
  assert.equal(currentDiscussionFloorJob(paused, core), null);
  const unarrived = fixture();
  member(unarrived, "arwyn").arrived = false;
  assert.equal(currentDiscussionFloorJob(unarrived, core), null);
  const withdrawn = fixture();
  command(withdrawn, "arwyn", "stop-listening");
  assert.equal(currentDiscussionFloorJob(withdrawn, core), null);
  const moved = fixture();
  person(moved, "arwyn").tile = { x: 20, y: 20 };
  assert.equal(
    currentDiscussionFloorJob(moved, core),
    null,
    "Actual freshness catches movement before a simulation tick",
  );
  const pending = fixture();
  const job = currentDiscussionFloorJob(pending, core);
  assert.equal(d.markDiscussionRequest(pending, job), true);
  assert.equal(currentDiscussionFloorJob(pending, core), null);
});

test("absent speaking permission or an altered observation is not an authorized floor", () => {
  const town = fixture();
  assert.equal(
    currentDiscussionFloorJob(town, {
      ...core,
      observation: () => ({
        meeting: { id: meeting(town).id },
        availableActions: [{ kind: "pass" }],
      }),
    }),
    null,
  );
  assert.equal(
    currentDiscussionFloorJob(town, {
      ...core,
      observation: () => ({
        meeting: { id: "another-context" },
        availableActions: [{ kind: "speak" }],
      }),
    }),
    null,
  );
  assert.equal(currentDiscussionFloorJob(town), null);
});
