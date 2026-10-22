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
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { validatePhysicalItems, physicalObservation, applyPhysicalCommand } =
  await server.ssrLoadModule("/src/game/physical-items.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");

function fixture() {
  const town = createTown("A human");
  const actor = town.agents.find((agent) => agent.id === "northern");
  actor.tile = { ...ANCHORS.library };
  town.agents
    .find((agent) => agent.id === "arwyn")
    .memories.push({
      id: "private-other",
      day: 1,
      minute: 1,
      type: "observe",
      text: "PRIVATE_OTHER_RESIDENT_FACT",
      importance: 10,
      keywords: [],
      protected: true,
    });
  town.physicalItems = {
    version: 1,
    items: [
      {
        id: "manuscript:town:1",
        kind: "manuscript",
        title: "Private content fixture",
        text: "ACTUAL_SAVED_CONTENT",
        author: "northern",
        owner: "town",
        revision: 2,
        contentRevision: 1,
        location: { kind: "held", holder: "northern" },
      },
    ],
    session: {
      actor: "northern",
      revision: 3,
      enabled: true,
      waiting: true,
      decisions: 1,
      maxDecisions: 8,
      intent: null,
      lastResult: null,
      usage: {
        requests: 1,
        providerAttempts: 0,
        attemptsUnknown: 1,
        knownTokens: 0,
        tokenSamples: 0,
        tokensUnknown: 1,
        elapsedMs: 0,
        failures: 0,
      },
    },
  };
  assert.deepEqual(validatePhysicalItems(town), []);
  const job = {
    kind: "act",
    agentId: "northern",
    sessionRevision: 3,
    day: town.day,
    minute: town.minute,
  };
  return { town, job };
}

function currentContext(town, job) {
  const currentJob = { ...job, sessionRevision: town.physicalItems.session.revision };
  const prompt = buildPrompt(town, currentJob);
  return {
    job: currentJob,
    prompt,
    observation: JSON.parse(prompt.split("\nCurrent observation: ")[1]),
  };
}

test("act prompts disclose item metadata and actual read results, never global contents or another resident's memory", () => {
  const { town, job } = fixture();
  const initial = buildPrompt(town, job);
  assert.ok(initial.length <= 8000);
  assert.match(initial, /exactly ONE supported physical decision/);
  assert.match(initial, /manuscript:town:1/);
  assert.doesNotMatch(initial, /ACTUAL_SAVED_CONTENT|PRIVATE_OTHER_RESIDENT_FACT/);
  assert.match(initial, /player has not spoken/);
  assert.match(initial, /not a completed one/);
  town.physicalItems.session.lastResult = {
    ok: true,
    kind: "read",
    itemId: "manuscript:town:1",
    message: "Read current content",
    content: {
      title: "Private content fixture",
      text: "ACTUAL_SAVED_CONTENT",
      revision: 1,
      author: "northern",
    },
  };
  const read = buildPrompt(town, job);
  assert.match(read, /ACTUAL_SAVED_CONTENT/);
  assert.doesNotMatch(read, /PRIVATE_OTHER_RESIDENT_FACT/);
});

test("act options distinguish a held manuscript from reachable, distant and unseen ground items", () => {
  const cases = [
    { name: "held", location: { kind: "held", holder: "northern" }, read: true, held: true },
    {
      name: "same ground tile",
      location: { kind: "ground", tile: { ...ANCHORS.library } },
      read: true,
    },
    {
      name: "cardinal adjacent ground",
      location: { kind: "ground", tile: { x: ANCHORS.library.x + 1, y: ANCHORS.library.y } },
      read: true,
    },
    {
      name: "visible distant ground",
      location: { kind: "ground", tile: { x: ANCHORS.library.x + 2, y: ANCHORS.library.y } },
      read: false,
    },
    { name: "unseen ground", location: { kind: "ground", tile: { ...ANCHORS.park } }, read: false },
    { name: "other holder", location: { kind: "held", holder: "arwyn" }, read: false },
  ];
  for (const scenario of cases) {
    const { town, job } = fixture();
    town.physicalItems.items[0].location = scenario.location;
    assert.deepEqual(validatePhysicalItems(town), []);
    const { prompt, observation } = currentContext(town, job);
    const options = observation.availableActions;
    assert.equal(
      options.some((option) => option.kind === "read"),
      scenario.read,
      scenario.name,
    );
    for (const kind of ["write", "put-down"])
      assert.equal(
        options.some((option) => option.kind === kind),
        Boolean(scenario.held),
        scenario.name,
      );
    for (const option of options.filter((option) => option.itemId)) {
      assert.equal(option.itemId, "manuscript:town:1");
      assert.equal(option.itemRevision, 2);
    }
    assert.match(prompt, /Choose only from Current observation.availableActions/);
    assert.match(prompt, /reachable ground manuscript when listed; ground reading needs no pickup/);
    assert.match(prompt, /engine revalidates the actor\/session, item revision, custody and reach/);
    assert.doesNotMatch(prompt, /ACTUAL_SAVED_CONTENT|PRIVATE_OTHER_RESIDENT_FACT|<held id>/);
    // The bring template already contains exact destinations; no duplicate global catalogue.
    assert.equal(Object.hasOwn(observation, "destinations"), false);
    assert.ok(prompt.length <= 8000);
  }
});

test("an actual put-down exposes a ground read and the read returns only the real saved words", () => {
  const { town, job } = fixture();
  const putDown = { kind: "put-down", itemId: "manuscript:town:1", itemRevision: 2 };
  assert.equal(applyPhysicalCommand(town, "northern", putDown).ok, true);
  const { observation, prompt, job: currentJob } = currentContext(town, job);
  const option = observation.availableActions.find((candidate) => candidate.kind === "read");
  assert.deepEqual(option, { kind: "read", itemId: "manuscript:town:1", itemRevision: 3 });
  assert.equal(observation.actor.heldItemId, null);
  assert.doesNotMatch(prompt, /ACTUAL_SAVED_CONTENT/);
  const parsed = parseMind(currentJob, JSON.stringify({ decision: option }));
  const result = applyPhysicalCommand(town, "northern", parsed.decision);
  assert.equal(result.ok, true);
  assert.equal(result.content.text, "ACTUAL_SAVED_CONTENT");
  assert.equal(town.physicalItems.items[0].location.kind, "ground");
  assert.match(currentContext(town, currentJob).prompt, /ACTUAL_SAVED_CONTENT/);
});

test("a previously offered ground read is revalidated if the actor moves before applying it", () => {
  const { town, job } = fixture();
  town.physicalItems.items[0].location = { kind: "ground", tile: { ...ANCHORS.library } };
  const before = currentContext(town, job);
  const option = before.observation.availableActions.find((candidate) => candidate.kind === "read");
  const parsed = parseMind(before.job, JSON.stringify({ decision: option }));
  town.agents.find((agent) => agent.id === "northern").tile = { ...ANCHORS.park };
  const result = applyPhysicalCommand(town, "northern", parsed.decision);
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, "content"), false);
  assert.equal(
    physicalObservation(town, "northern").availableActions.some((action) => action.kind === "read"),
    false,
  );
});

test("an active physical journey has no current choice and fails before requesting inference", () => {
  const { town, job } = fixture();
  assert.equal(
    applyPhysicalCommand(town, "northern", {
      kind: "bring",
      itemId: "manuscript:town:1",
      itemRevision: 2,
      destination: "noticeboard",
    }).ok,
    true,
  );
  assert.deepEqual(physicalObservation(town, "northern").availableActions, []);
  assert.throws(() => currentContext(town, job), /No physical decision is currently available/);
});

test("act parser binds actor/session to the request and rejects extra authority rather than turning it into wait", () => {
  const { town, job } = fixture();
  const decision = { kind: "read", itemId: "manuscript:town:1", itemRevision: 2 };
  assert.deepEqual(parseMind(job, JSON.stringify({ decision })), {
    kind: "act",
    mind: "grok",
    agentId: "northern",
    sessionRevision: 3,
    decision,
  });
  for (const response of [
    { decision, agentId: "player" },
    { decision, sessionRevision: 4 },
    { decision: { ...decision, actor: "player" } },
    { decision: { kind: "delete-town" } },
    { reply: "I picked it up" },
    { decision: { kind: "wait" }, decisions: [{ kind: "write" }] },
  ])
    assert.equal(parseMind(job, JSON.stringify(response)), null);
  assert.equal(parseMind({ ...job, agentId: "player" }, '{"decision":{"kind":"wait"}}'), null);
  assert.equal(parseMind({ ...job, sessionRevision: -1 }, '{"decision":{"kind":"wait"}}'), null);
  const bring = currentContext(town, job).observation.availableActions.find(
    (option) => option.kind === "bring",
  );
  assert.equal(parseMind(job, JSON.stringify({ decision: bring })), null);
  const { destinations, ...fields } = bring;
  const completed = { ...fields, destination: destinations[0] };
  assert.deepEqual(parseMind(job, JSON.stringify({ decision: completed })).decision, completed);
});

test("unavailable act inference has no authored NPC action or speech fallback", () => {
  const { town, job } = fixture();
  const before = structuredClone(town);
  assert.throws(() => offlineResult(town, job), /require available AI/);
  assert.deepEqual(town, before);
});
