import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { mindJsonFailure } from "../src/lib/mind-pool/transport.ts";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const {
  createLibraryDiscussion,
  applyDiscussionCommand,
  nextDiscussionJob,
  markDiscussionRequest,
  applyDiscussionResult,
  recordDiscussionUsage,
} = await server.ssrLoadModule("/src/game/discussions.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const meeting = (town) => town.discussions.sessions.at(-1);
const member = (town, id) => meeting(town).members.find((row) => row.id === id);
let commandNumber = 0;
function command(town, id, kind, fields = {}) {
  const result = applyDiscussionCommand(town, id, {
    kind,
    meetingId: meeting(town).id,
    expectedRevision: member(town, id).revision,
    commandId: `context-test:${++commandNumber}`,
    ...fields,
  });
  assert.equal(result.ok, true, result.message);
}

const responseChoices = (prompt) =>
  prompt
    .split("\n")
    .filter((line) => line.startsWith('{"task":"discussion","decision":'))
    .map((line) => JSON.parse(line));

test("recorded pre-step04 Arwyn attention offers have complete strict wire choices without speech or actor metadata", () => {
  // Portable synthetic setup reproduces the actual saved job and observation;
  // no real player save, historical provider output or inference is needed.
  const town = parseTownFile(exportTown(createTown("Observer")));
  town.paused = true;
  for (const [id, tile] of Object.entries({
    arwyn: { x: 44, y: 21 },
    northern: { x: 42, y: 21 },
    sub: { x: 43, y: 20 },
    player: { x: 43, y: 22 },
    baba: { x: 42, y: 22 },
  }))
    person(town, id).tile = tile;
  assert.equal(
    createLibraryDiscussion(
      town,
      "What would make a short shared reading at the library welcoming?",
      "arwyn",
    ).ok,
    true,
  );
  for (const invitee of ["arwyn", "northern", "sub"])
    command(town, "player", "invite", { invitee });
  for (const [actor, kind] of [
    ["arwyn", "accept"],
    ["northern", "decline"],
    ["sub", "accept"],
  ]) {
    const job = nextDiscussionJob(town);
    assert.equal(job.agentId, actor);
    assert.equal(markDiscussionRequest(town, job), true);
    const parsed = parseMind(job, JSON.stringify({ task: "discussion", decision: { kind } }));
    assert.equal(applyDiscussionResult(town, parsed).ok, true);
    recordDiscussionUsage(town, job, {
      success: true,
      attempts: 1,
      totalTokens: 25,
      elapsedMs: 10,
    });
  }
  const job = nextDiscussionJob(town);
  assert.deepEqual(job, {
    kind: "act",
    task: "discussion",
    day: 1,
    minute: 420,
    agentId: "arwyn",
    meetingId: "discussion:10",
    sessionRevision: 1,
    actorRevision: 5,
    turnId: null,
  });
  const before = structuredClone(town);
  const prompt = buildPrompt(town, job);
  assert.match(prompt, /You are the proposed facilitator/);
  assert.match(prompt, /choosing participate when offered/);
  assert.match(prompt, /ask a short, concrete opening question/);
  assert.match(prompt, /You may still decline, listen, pass, leave or close when offered/);
  const observation = JSON.parse(prompt.split("\nCurrent observation: ")[1]);
  assert.deepEqual(observation.availableActions, [
    { kind: "leave", label: "Leave discussion" },
    { kind: "listen", label: "Join and listen" },
    { kind: "participate", label: "Join as a speaker" },
  ]);
  const choices = responseChoices(prompt);
  assert.deepEqual(
    choices,
    ["leave", "listen", "participate"].map((kind) => ({ task: "discussion", decision: { kind } })),
  );
  for (const choice of choices) {
    const text = JSON.stringify(choice);
    assert.equal(mindJsonFailure("act", text), null);
    assert.deepEqual(parseMind(job, text).decision, choice.decision);
    assert.deepEqual(Object.keys(choice).sort(), ["decision", "task"]);
    assert.deepEqual(Object.keys(choice.decision), ["kind"]);
    for (const extra of [
      { label: "Join and listen" },
      { reason: "An explanation" },
      { actor: "arwyn" },
    ]) {
      const invalid = JSON.stringify({ ...choice, decision: { ...choice.decision, ...extra } });
      assert.equal(mindJsonFailure("act", invalid), "missing-envelope");
      assert.equal(parseMind(job, invalid), null);
    }
  }
  assert.doesNotMatch(
    prompt,
    /"kind":"speak"|<your own words>|\{"task":"discussion","decision":\{\.\.\.\}\}/,
  );
  assert.match(prompt, /choose freely/i);
  assert.deepEqual(
    town,
    before,
    "Wire guidance must not change the resident's choices or knowledge",
  );
});

test("every offered simple choice has a strict envelope and speech shape appears only with the floor", () => {
  const town = fixture();
  const cases = [context(town)];
  command(town, "northern", "read-invitation");
  cases.push(context(town));
  command(town, "northern", "accept");
  cases.push(context(town));
  command(town, "northern", "participate");
  for (const kind of ["read-invitation", "accept", "listen"]) command(town, "arwyn", kind);
  cases.push(context(town), context(town, "arwyn"));
  command(town, "arwyn", "participate");
  cases.push(context(town, "arwyn"));
  const covered = new Set();
  for (const { job, prompt, observation } of cases) {
    const choices = responseChoices(prompt);
    assert.deepEqual(
      choices.map(({ decision }) => decision.kind).sort(),
      observation.availableActions.map(({ kind }) => kind).sort(),
    );
    const canSpeak = observation.availableActions.some(({ kind }) => kind === "speak");
    const speech = choices.find(({ decision }) => decision.kind === "speak");
    assert.equal(Boolean(speech), canSpeak);
    if (canSpeak) {
      assert.deepEqual(speech, {
        task: "discussion",
        decision: { kind: "speak", text: "<your own words>" },
      });
      assert.match(prompt, /replace.*placeholder/i);
    } else assert.doesNotMatch(prompt, /<your own words>/);
    for (const choice of choices) {
      const text = JSON.stringify(choice);
      assert.equal(mindJsonFailure("act", text), null);
      assert.deepEqual(parseMind(job, text).decision, choice.decision);
      assert.deepEqual(Object.keys(choice).sort(), ["decision", "task"]);
      assert.deepEqual(
        Object.keys(choice.decision).sort(),
        choice.decision.kind === "speak" ? ["kind", "text"] : ["kind"],
      );
      covered.add(choice.decision.kind);
    }
  }
  assert.deepEqual(
    [...covered].sort(),
    [
      "read-invitation",
      "ignore",
      "accept",
      "decline",
      "leave",
      "listen",
      "participate",
      "stop-listening",
      "request-turn",
      "withdraw-turn",
      "pass",
      "close",
      "speak",
    ].sort(),
  );
});
function currentJob(town, id = "northern") {
  return {
    kind: "act",
    task: "discussion",
    agentId: id,
    meetingId: meeting(town).id,
    sessionRevision: meeting(town).epoch,
    actorRevision: member(town, id).revision,
    turnId: meeting(town).floor?.actor === id ? meeting(town).floor.id : null,
    day: town.day,
    minute: town.minute,
  };
}
function context(town, id = "northern") {
  const job = currentJob(town, id);
  const prompt = buildPrompt(town, job);
  return {
    job,
    prompt,
    resident: JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent observation: ")[0]),
    observation: JSON.parse(prompt.split("\nCurrent observation: ")[1]),
  };
}
function fixture() {
  const town = createTown("A human");
  town.minute = 600;
  for (const [id, tile] of Object.entries({
    northern: { x: 42, y: 21 },
    arwyn: { x: 44, y: 21 },
    sub: { x: 43, y: 20 },
    player: { x: 43, y: 22 },
  }))
    person(town, id).tile = tile;
  const created = createLibraryDiscussion(town, "UNREAD_MEETING_TOPIC");
  assert.equal(created.ok, true, created.message);
  person(town, "northern").memories = [
    {
      id: "own-known",
      day: 1,
      minute: 590,
      type: "observe",
      source: "event",
      text: "OWN_KNOWN_RECORD about a shared activity discussion",
      importance: 10,
      keywords: ["discussion", "shared", "activity"],
    },
  ];
  person(town, "arwyn").memories.push({
    id: "private-other",
    day: 1,
    minute: 590,
    type: "observe",
    text: "PRIVATE_OTHER_RESIDENT_RECORD",
    importance: 10,
    keywords: ["discussion"],
  });
  town.social = [
    {
      id: "spectator-only",
      kind: "conversation",
      day: 1,
      minute: 590,
      participants: ["arwyn", "sub"],
      place: "Library",
      text: "SPECTATOR_ONLY_GLOBAL_TRANSCRIPT",
      turns: [{ speaker: "sub", text: "SPECTATOR_ONLY_GLOBAL_TRANSCRIPT" }],
      changes: [],
      memories: [],
      witnessed: false,
      secret: false,
    },
  ];
  return town;
}

test("unread invitations expose a local cue and legal reading choice, not the topic or other knowledge", () => {
  const town = fixture();
  const before = structuredClone(town);
  const { prompt, resident, observation } = context(town);
  assert.ok(prompt.length <= 10000);
  assert.match(prompt, /exactly ONE offered discussion decision/);
  assert.match(prompt, /Ordinary proximity is not listening/);
  assert.equal(observation.meeting.id, meeting(town).id);
  assert.equal(Object.hasOwn(observation.meeting, "topic"), false);
  assert.ok(observation.perceivedCues.length);
  assert.ok(observation.availableActions.some((action) => action.kind === "read-invitation"));
  assert.deepEqual(observation.receivedTurns, []);
  assert.equal(resident.id, "northern");
  assert.match(prompt, /OWN_KNOWN_RECORD/);
  assert.doesNotMatch(
    prompt,
    /UNREAD_MEETING_TOPIC|PRIVATE_OTHER_RESIDENT_RECORD|SPECTATOR_ONLY_GLOBAL_TRANSCRIPT/,
  );
  assert.deepEqual(town, before, "constructing a discussion prompt does not change town state");
});

test("discussion prompts include only this actor's own or actually received turns", () => {
  const town = fixture();
  for (const id of ["northern", "arwyn", "sub"]) {
    command(town, id, "read-invitation");
    command(town, id, "accept");
    command(town, id, id === "sub" ? "listen" : "participate");
  }
  const session = meeting(town);
  session.utterances = [
    {
      id: `${session.id}:speech:1`,
      seq: 1,
      speaker: "arwyn",
      text: "UNATTENDED_EARLIER_WORDS",
      at: { day: 1, minute: 598 },
      speakerTile: { ...person(town, "arwyn").tile },
      recipientIds: ["sub"],
      source: "statement",
      mind: "grok",
    },
    {
      id: `${session.id}:speech:2`,
      seq: 2,
      speaker: "arwyn",
      text: "ACTUALLY_RECEIVED_WORDS",
      at: { day: 1, minute: 599 },
      speakerTile: { ...person(town, "arwyn").tile },
      recipientIds: ["northern"],
      source: "statement",
      mind: "grok",
    },
    {
      id: `${session.id}:speech:3`,
      seq: 3,
      speaker: "northern",
      text: "ACTORS_OWN_PRIOR_WORDS",
      at: { day: 1, minute: 600 },
      speakerTile: { ...person(town, "northern").tile },
      recipientIds: ["arwyn"],
      source: "statement",
      mind: "grok",
    },
  ];
  const { prompt, observation } = context(town);
  assert.match(prompt, /ACTUALLY_RECEIVED_WORDS|ACTORS_OWN_PRIOR_WORDS/);
  assert.equal(observation.receivedTurns.length, 2);
  assert.doesNotMatch(
    prompt,
    /UNATTENDED_EARLIER_WORDS|PRIVATE_OTHER_RESIDENT_RECORD|SPECTATOR_ONLY_GLOBAL_TRANSCRIPT/,
  );
  assert.ok(observation.receivedTurns.every((turn) => !Object.hasOwn(turn, "recipientIds")));
  assert.match(prompt, /Suggestions here are nonbinding/);
  assert.match(prompt, /no line buys, pays, accepts work/);
});

test("discussion parse binds identity to the pending job and rejects physical or extra-authority output", () => {
  const town = fixture();
  const job = currentJob(town);
  const response = { task: "discussion", decision: { kind: "read-invitation" } };
  assert.deepEqual(parseMind(job, JSON.stringify(response)), {
    kind: "act",
    task: "discussion",
    mind: "grok",
    agentId: job.agentId,
    meetingId: job.meetingId,
    sessionRevision: job.sessionRevision,
    actorRevision: job.actorRevision,
    turnId: null,
    decision: response.decision,
  });
  for (const invalid of [
    { ...response, actor: "sub" },
    { ...response, meetingId: "another" },
    { ...response, actorRevision: 999 },
    { decision: response.decision },
    { decision: { kind: "wait" } },
    { task: "discussion", decision: { kind: "speak", text: "Hi", speaker: "arwyn" } },
  ])
    assert.equal(parseMind(job, JSON.stringify(invalid)), null);
  assert.equal(parseMind(job, "I also paid them. " + JSON.stringify(response)), null);
  assert.equal(parseMind({ ...job, agentId: "player" }, JSON.stringify(response)), null);
  assert.equal(parseMind({ ...job, meetingId: "\n" }, JSON.stringify(response)), null);
  const physicalJob = { kind: "act", agentId: "northern", sessionRevision: 2, day: 1, minute: 600 };
  assert.equal(parseMind(physicalJob, JSON.stringify(response)), null);
  assert.equal(
    parseMind({ ...physicalJob, task: "unknown" }, '{"decision":{"kind":"wait"}}'),
    null,
  );
  assert.equal(parseMind(physicalJob, '{"decision":{"kind":"wait"}}').decision.kind, "wait");
});

test("unsupported discussion context fails before inference and has no authored fallback", () => {
  const town = fixture();
  const job = currentJob(town);
  assert.throws(
    () => buildPrompt(town, { ...job, meetingId: "unknown" }),
    /No discussion decision/,
  );
  assert.throws(() => buildPrompt(town, { ...job, actorRevision: -1 }), /Invalid discussion/);
  const before = structuredClone(town);
  assert.throws(() => offlineResult(town, job), /require available AI/);
  assert.deepEqual(town, before);
});

test("maximum bounded received dialogue fits the prompt without borrowing other residents' context", () => {
  const town = fixture();
  for (const id of ["northern", "arwyn"]) {
    command(town, id, "read-invitation");
    command(town, id, "accept");
    command(town, id, "participate");
  }
  const session = meeting(town);
  session.utterances = Array.from({ length: 6 }, (_, index) => ({
    id: `${session.id}:speech:${index + 1}`,
    seq: index + 1,
    speaker: "arwyn",
    text: `${index}:` + "A".repeat(398),
    at: { day: 1, minute: 599 },
    speakerTile: { ...person(town, "arwyn").tile },
    recipientIds: ["northern"],
    source: "statement",
    mind: "grok",
  }));
  person(town, "northern").memories = Array.from({ length: 30 }, (_, index) => ({
    id: `own-long:${index}`,
    day: 1,
    minute: 599,
    type: "observe",
    source: "statement",
    text: "Own memory claim " + "B".repeat(390),
    importance: 7,
    keywords: ["discussion"],
  }));
  const { prompt, resident, observation } = context(town);
  assert.ok(prompt.length <= 10000, `actual prompt characters: ${prompt.length}`);
  assert.equal(observation.receivedTurns.length, 6);
  assert.equal(resident.memories.length, 3);
  assert.ok(resident.memories.every((memory) => memory.text.length <= 220));
  assert.doesNotMatch(prompt, /PRIVATE_OTHER_RESIDENT_RECORD|SPECTATOR_ONLY_GLOBAL_TRANSCRIPT/);
});
