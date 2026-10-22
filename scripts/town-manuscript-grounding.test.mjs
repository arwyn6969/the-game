import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

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
const { activateFundedTown } = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const { initializePhysicalItems, startPhysicalSession, applyPhysicalCommand } =
  await server.ssrLoadModule("/src/game/physical-items.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);

function fixture(actorId = "northern") {
  const town = createTown("A human");
  initializePhysicalItems(town);
  person(town, actorId).tile = { ...ANCHORS.library };
  startPhysicalSession(town, actorId, 8);
  return town;
}
function context(town, actorId = "northern") {
  const job = {
    kind: "act",
    agentId: actorId,
    sessionRevision: town.physicalItems.session.revision,
    day: town.day,
    minute: town.minute,
  };
  const prompt = buildPrompt(town, job);
  return {
    job,
    prompt,
    resident: JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent observation: ")[0]),
    observation: JSON.parse(prompt.split("\nCurrent observation: ")[1]),
  };
}
function shift(town, actorId, text) {
  const actor = person(town, actorId);
  actor.projects.push({
    id: `${actorId}-recorded-shift`,
    owner: actorId,
    kind: "shift",
    text,
    place: "cafe",
    status: "open",
    day: town.day,
  });
  for (const beat of actor.plan.beats)
    if (beat.hour >= 16 && beat.hour < 19)
      Object.assign(beat, { place: "cafe", spot: "out", status: "at work" });
}

test("action facts use the bound NPC's actual town coins and limitations, without player facts", () => {
  for (const actorId of ["northern", "baba"]) {
    const town = fixture(actorId);
    person(town, "player").money = 71;
    person(town, "player").projects.push({
      id: "player-private",
      owner: "player",
      kind: "shift",
      text: "PRIVATE_PLAYER_JOB",
      status: "open",
      day: 1,
    });
    town.favors.push({
      id: "others-private",
      from: "arwyn",
      to: "sub",
      amount: 27,
      text: "PRIVATE_OTHER_DEBT",
      status: "owed",
      day: 1,
    });
    const { prompt, resident } = context(town, actorId);
    const facts = resident.authoritativeFacts;
    assert.equal(facts.actorId, actorId);
    assert.equal(facts.cash, person(town, actorId).money);
    assert.equal(facts.unit, "town coins");
    assert.notEqual(facts.cash, 71);
    assert.ok(resident.limitations.length > 0);
    assert.deepEqual(facts.records.ownObligations, []);
    assert.deepEqual(facts.records.acceptedFundedWork, []);
    assert.match(facts.missing, /unknown/);
    assert.doesNotMatch(prompt, /PRIVATE_PLAYER_JOB|PRIVATE_OTHER_DEBT/);
  }
});

test("own legacy shift terms stay distinct from accepted funded work and relevant obligations", () => {
  const town = fixture();
  const terms = "Cafe shift 16:00–19:00; five town coins after actual attendance if funded.";
  shift(town, "northern", terms);
  shift(town, "player", "PRIVATE_PLAYER_AGREEMENT");
  town.favors.push({
    id: "northern-tab",
    from: "northern",
    to: "baba",
    amount: 3,
    text: "Recorded bread tab",
    status: "owed",
    day: 1,
  });
  let facts = context(town).resident.authoritativeFacts;
  assert.equal(facts.fundedWorkInitialized, false);
  assert.equal(facts.records.recordedShiftProjects[0].text, terms);
  assert.deepEqual(facts.records.acceptedFundedWork, []);
  assert.equal(facts.records.ownObligations[0].amount, 3);
  assert.equal(activateFundedTown(town).ok, true);
  const before = JSON.stringify({
    economy: town.economy,
    favors: town.favors,
    cash: town.agents.map((agent) => agent.money),
  });
  const { resident, prompt } = context(town);
  facts = resident.authoritativeFacts;
  assert.equal(facts.fundedWorkInitialized, true);
  assert.ok(facts.records.acceptedFundedWork.length > 0);
  const agreement = town.economy.work.agreements.find((item) => item.worker === "northern");
  assert.equal(facts.records.acceptedFundedWork[0].id, agreement.id);
  assert.equal(facts.records.acceptedFundedWork[0].fee, agreement.fee);
  assert.match(prompt, /recordedShiftProject preserves legacy\/project terms/);
  assert.match(prompt, /earned work payment is unpaid until its status is settled/);
  assert.doesNotMatch(prompt, /PRIVATE_PLAYER_AGREEMENT/);
  assert.equal(
    JSON.stringify({
      economy: town.economy,
      favors: town.favors,
      cash: town.agents.map((agent) => agent.money),
    }),
    before,
  );
});

test("old document events remain intact but do not turn their embedded claims into authoritative facts", () => {
  const town = fixture();
  const old = {
    id: "legacy-document-event",
    day: 1,
    minute: 400,
    type: "observe",
    source: "event",
    text: "I wrote the manuscript text: Cash £12.40; rent £85; library wage £9/hr.",
    importance: 10,
    keywords: ["manuscript", "physical", "action"],
    protected: true,
  };
  person(town, "northern").memories.push(old);
  const memories = structuredClone(person(town, "northern").memories);
  const { prompt, resident } = context(town);
  assert.equal(resident.authoritativeFacts.cash, 2);
  assert.ok(resident.memories.some((memory) => memory.id === old.id && memory.source === "event"));
  assert.match(prompt, /verifies the action and words, never the truth of embedded claims/);
  assert.match(prompt, /even when an old memory has source "event"/);
  assert.match(prompt, /own writing and repetition do not corroborate/);
  assert.deepEqual(person(town, "northern").memories, memories);
});

test("current accepted work and unpaid earnings outrank later closed history in the bounded packet", () => {
  const town = fixture();
  shift(town, "northern", "Existing cafe attendance terms.");
  assert.equal(activateFundedTown(town).ok, true);
  const work = town.economy.work;
  const active = work.agreements.find((agreement) => agreement.worker === "northern");
  // Projection-only history isolates ordering; this is not a settlement fixture.
  for (let i = 0; i < 3; i++)
    work.agreements.push({
      ...structuredClone(active),
      id: `later-completed-${i}`,
      status: "completed",
    });
  const payable = {
    id: "unpaid-northern",
    agreementId: active.id,
    worker: "northern",
    payer: active.payer,
    amount: 5,
    holdId: active.holdId,
    status: "earned",
    reason: null,
    transactionId: null,
  };
  work.payables.push(payable);
  for (let i = 0; i < 3; i++)
    work.payables.push({
      ...payable,
      id: `later-paid-${i}`,
      status: "settled",
      transactionId: `past-${i}`,
    });
  const facts = context(town).resident.authoritativeFacts;
  assert.equal(facts.records.acceptedFundedWork[0].id, active.id);
  assert.equal(facts.records.acceptedFundedWork[0].status, "active");
  assert.equal(facts.records.workPayments[0].id, payable.id);
  assert.equal(facts.records.workPayments[0].status, "earned");
  assert.ok(facts.omitted.acceptedFundedWork > 0);
  assert.ok(facts.omitted.workPayments > 0);
});

test("the grounding contract preserves freely chosen fiction and hypotheses with invented numeric values", () => {
  const town = fixture();
  const { prompt, job } = context(town);
  assert.match(prompt, /freely write fiction/);
  assert.match(prompt, /including fictional versions of yourself/);
  assert.match(prompt, /Label hypotheses or estimates as such/);
  assert.match(prompt, /No genre, story, destination or event is required/);
  const decision = {
    kind: "write",
    itemId: town.physicalItems.items[0].id,
    itemRevision: 0,
    title: "A fictional Northern",
    text: "FICTION: Another Northern has £12.40 and lives on a bus that costs £22.",
  };
  assert.deepEqual(parseMind(job, JSON.stringify({ decision })).decision, decision);
});

test("long own records and a maximum read remain bounded without dropping actual cash or disclosing others", () => {
  const town = fixture();
  const actor = person(town, "northern");
  const nearby = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  town.agents
    .filter((agent) => agent.id !== actor.id)
    .forEach((agent, index) => {
      const [dx, dy] = nearby[index];
      agent.tile = { x: actor.tile.x + dx, y: actor.tile.y + dy };
    });
  for (let i = 0; i < 24; i++)
    town.favors.push({
      id: `northern-tab-${i}`,
      from: "northern",
      to: "baba",
      amount: i + 1,
      text: "A long recorded obligation ".repeat(20),
      status: "owed",
      day: 1,
    });
  for (let i = 0; i < 4; i++)
    actor.projects.push({
      id: `northern-shift-${i}`,
      owner: "northern",
      kind: "shift",
      status: "open",
      text: "Preserved shift terms ".repeat(30),
      place: "cafe",
      day: 1,
    });
  for (const command of [
    { kind: "pick-up" },
    { kind: "write", title: "A".repeat(80), text: "C".repeat(1200) },
    { kind: "read" },
  ]) {
    const item = town.physicalItems.items[0];
    assert.equal(
      applyPhysicalCommand(town, "northern", {
        ...command,
        itemId: item.id,
        itemRevision: item.revision,
      }).ok,
      true,
    );
  }
  const { prompt, resident, observation } = context(town);
  assert.ok(prompt.length <= 8000, `prompt ${prompt.length}`);
  assert.equal(observation.nearbyResidents.length, town.agents.length - 1);
  for (const kind of ["read", "write", "put-down", "bring"])
    assert.ok(observation.availableActions.some((action) => action.kind === kind));
  assert.equal(
    observation.availableActions.find((action) => action.kind === "bring").destinations.length,
    9,
  );
  assert.ok(JSON.stringify(resident.authoritativeFacts).length <= 1500);
  assert.equal(resident.authoritativeFacts.cash, 2);
  assert.equal(resident.authoritativeFacts.unit, "town coins");
  assert.ok(resident.authoritativeFacts.omitted.ownObligations > 0);
  assert.ok(resident.authoritativeFacts.omitted.recordedShiftProjects > 0);
  assert.match(prompt, new RegExp("C".repeat(1200)));
});
