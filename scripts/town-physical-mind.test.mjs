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
const {
  validatePhysicalItems,
  initializePhysicalItems,
  nextPhysicalJob,
  markPhysicalRequest,
  recordPhysicalUsage,
  physicalObservation,
  applyPhysicalCommand,
  startPhysicalSession,
  stopPhysicalSession,
} = await server.ssrLoadModule("/src/game/physical-items.ts");
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

function itemCommand(town, kind, fields = {}) {
  const item = town.physicalItems.items[0];
  return applyPhysicalCommand(town, "northern", {
    kind,
    itemId: item.id,
    itemRevision: item.revision,
    ...fields,
  });
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
  assert.equal(itemCommand(town, "read").ok, true);
  const read = currentContext(town, job).prompt;
  assert.match(read, /ACTUAL_SAVED_CONTENT/);
  assert.doesNotMatch(read, /PRIVATE_OTHER_RESIDENT_FACT/);
});

test("known unchanged read words remain available without choosing a replacement action", () => {
  const { town, job } = fixture();
  town.physicalItems.items[0].location = { kind: "ground", tile: { ...ANCHORS.library } };
  assert.equal(itemCommand(town, "read").ok, true);
  let context = currentContext(town, job);
  assert.equal(context.observation.knownManuscript.text, "ACTUAL_SAVED_CONTENT");
  assert.equal(context.observation.knownManuscript.contentRevision, 1);
  assert.equal(context.observation.session.readContentRevision, 1);
  assert.equal(Object.hasOwn(context.observation.session.lastResult, "content"), false);
  assert.equal(
    context.observation.availableActions.some((option) => option.kind === "read"),
    false,
  );
  assert.ok(context.observation.availableActions.some((option) => option.kind === "wait"));
  assert.equal(context.observation.actor.heldItemId, null);
  assert.match(context.prompt, /Custody\/itemRevision changes do not change words/);
  assert.match(context.prompt, /new content or an explicit new trial permits rereading/);
  assert.match(context.prompt, /Choose any remaining option freely, including wait/);
  assert.equal(parseMind(context.job, '{"decision":{"kind":"wait"}}').decision.kind, "wait");
  assert.doesNotMatch(context.prompt, /PRIVATE_OTHER_RESIDENT_FACT/);
  // A custody-only revision must not make old words new or hide already read text.
  assert.equal(itemCommand(town, "pick-up").ok, true);
  context = currentContext(town, job);
  assert.equal(context.observation.knownManuscript.text, "ACTUAL_SAVED_CONTENT");
  assert.equal(
    context.observation.availableActions.some((option) => option.kind === "read"),
    false,
  );
  assert.equal(context.observation.actor.heldItemId, "manuscript:town:1");
  assert.equal(town.physicalItems.items[0].contentRevision, 1);
  // Another resident gets neither the receipt nor its actual words.
  town.agents.find((agent) => agent.id === "baba").tile = { ...ANCHORS.library };
  const other = physicalObservation(town, "baba");
  assert.equal(other.knownManuscript == null, true);
  assert.doesNotMatch(JSON.stringify(other), /ACTUAL_SAVED_CONTENT/);
});

test("reading a blank ground manuscript records content revision zero as known", () => {
  const { town, job } = fixture();
  Object.assign(town.physicalItems.items[0], {
    title: "Blank manuscript",
    text: "",
    author: null,
    revision: 0,
    contentRevision: 0,
    location: { kind: "ground", tile: { ...ANCHORS.library } },
  });
  assert.deepEqual(validatePhysicalItems(town), []);
  assert.equal(itemCommand(town, "read").ok, true);
  const { observation } = currentContext(town, job);
  assert.equal(observation.session.readContentRevision, 0);
  assert.equal(observation.knownManuscript.contentRevision, 0);
  assert.equal(observation.knownManuscript.text, "");
  assert.equal(
    observation.availableActions.some((option) => option.kind === "read"),
    false,
  );
  assert.equal(observation.actor.heldItemId, null);
});

test("new content and an explicit later trial permit rereading without prescribing a plot", () => {
  const { town, job } = fixture();
  assert.equal(itemCommand(town, "read").ok, true);
  assert.equal(
    itemCommand(town, "write", {
      title: "Fictional self",
      text: "FICTION: Another Northern owns a flying bus and 900 imaginary coins.",
    }).ok,
    true,
  );
  let context = currentContext(town, job);
  assert.equal(context.observation.knownManuscript == null, true);
  assert.ok(context.observation.availableActions.some((option) => option.kind === "read"));
  assert.equal(itemCommand(town, "read").ok, true);
  context = currentContext(town, job);
  assert.equal(context.observation.knownManuscript.text, town.physicalItems.items[0].text);
  assert.equal(
    context.observation.availableActions.some((option) => option.kind === "read"),
    false,
  );
  stopPhysicalSession(town);
  assert.equal(startPhysicalSession(town, "northern", 8).ok, true);
  context = currentContext(town, job);
  assert.equal(context.observation.knownManuscript == null, true);
  assert.ok(context.observation.availableActions.some((option) => option.kind === "read"));
  assert.match(context.prompt, /freely write fiction/);
  assert.match(context.prompt, /No genre, story, destination or event is required/);
});

test("an unchanged read proposed again parks without another read result or fabricated alternative", () => {
  const { town, job } = fixture();
  const before = currentContext(town, job);
  const option = before.observation.availableActions.find((candidate) => candidate.kind === "read");
  assert.equal(itemCommand(town, "read").ok, true);
  // A fresh request can still return a proposal omitted from its current options.
  const parsed = parseMind(currentContext(town, job).job, JSON.stringify({ decision: option }));
  const item = structuredClone(town.physicalItems.items[0]);
  const memories = structuredClone(town.agents.find((agent) => agent.id === "northern").memories);
  const result = applyPhysicalCommand(town, "northern", parsed.decision);
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, "content"), false);
  assert.equal(town.physicalItems.session.enabled, false);
  assert.deepEqual(town.physicalItems.items[0], item);
  assert.deepEqual(town.agents.find((agent) => agent.id === "northern").memories, memories);
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

test("speech uses one bounded decision and the next prompt contains actual words without an invented reply", () => {
  const town = createTown("A human");
  const northern = town.agents.find((agent) => agent.id === "northern");
  const data = town.agents.find((agent) => agent.id === "data");
  northern.tile = { x: 39, y: 20 };
  data.tile = { x: 38, y: 20 };
  initializePhysicalItems(town);
  assert.equal(startPhysicalSession(town, "northern", 8).ok, true);
  const item = structuredClone(town.physicalItems.items[0]);
  const finances = JSON.stringify({
    favors: town.favors,
    economy: town.economy,
    cash: town.agents.map((agent) => agent.money),
  });
  const beforeData = new Set(data.memories.map((memory) => memory.id));
  const beforeNorthern = new Set(northern.memories.map((memory) => memory.id));
  const words = ["Data. You're up early.", "I haven't chosen what to do next."];
  for (const [index, text] of words.entries()) {
    const job = nextPhysicalJob(town);
    assert.ok(job);
    const prompt = buildPrompt(town, job);
    assert.match(
      prompt,
      /Speech consumes one decision and continues; wait, failure or the request cap stops/,
    );
    if (index === 1) assert.ok(prompt.includes(words[0]));
    assert.doesNotMatch(prompt, /Data said:|Data replied:|Data agreed|Data accepted/);
    assert.match(prompt, /No genre, story, destination or event is required/);
    assert.match(prompt, /Choose any remaining option freely, including wait/);
    assert.ok(prompt.length <= 8000);
    assert.equal(markPhysicalRequest(town, job), true);
    // Synthetic completion accounting; no transport or provider is used by this test.
    recordPhysicalUsage(town, job, { elapsedMs: 0, attempts: 1, totalTokens: 1, success: true });
    const result = parseMind(job, JSON.stringify({ decision: { kind: "speak", text } }));
    assert.equal(applyPhysicalCommand(town, "northern", result.decision).ok, true);
    assert.equal(town.physicalItems.session.waiting, false);
    assert.equal(town.physicalItems.session.decisions, index + 1);
    assert.equal(town.physicalItems.session.usage.requests, index + 1);
    assert.equal(town.physicalItems.session.maxDecisions, 8);
    assert.ok(nextPhysicalJob(town));
  }
  assert.deepEqual(town.physicalItems.items[0], item);
  assert.equal(
    JSON.stringify({
      favors: town.favors,
      economy: town.economy,
      cash: town.agents.map((agent) => agent.money),
    }),
    finances,
  );
  const heard = data.memories.filter((memory) => !beforeData.has(memory.id));
  assert.deepEqual(heard, []);
  const spoken = northern.memories.filter((memory) => !beforeNorthern.has(memory.id));
  assert.equal(spoken.length, 2);
  for (const [index, memory] of spoken.entries()) {
    assert.equal(memory.source, "statement");
    assert.equal(memory.text, `Northern said: “${words[index]}”`);
  }
  const options = physicalObservation(town, "northern").availableActions.map(
    (option) => option.kind,
  );
  assert.ok(
    options.includes("speak") &&
      options.includes("wait") &&
      options.includes("read") &&
      options.includes("pick-up"),
  );
  assert.equal(applyPhysicalCommand(town, "northern", { kind: "wait" }).ok, true);
  assert.equal(nextPhysicalJob(town), null);
});
