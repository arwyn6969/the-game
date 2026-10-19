import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { makeMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { groundPlayerReply } = await server.ssrLoadModule("/src/game/conversation.ts");
const { buildPrompt } = await server.ssrLoadModule("/src/game/prompt.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { libraryActions, applyLibraryAction, libraryView } =
  await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { initializeEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const {
  initialiseFundedWork,
  approvePayrollAgreement,
  cafeAgreementTerms,
  createFundedCafeAgreement,
  recordCafeAttendance,
  CAFE_CANCELLATION,
} = await server.ssrLoadModule("/src/game/funded-work.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const ask = (town, id, text) =>
  offlineResult(town, { kind: "player", agentId: id, text, day: town.day, minute: town.minute })
    .reply;
function act(town, kind, arg = "") {
  const choice = libraryActions(town).find((item) => {
    const actual = JSON.parse(item.id);
    return actual[0] === kind && actual[1] === arg;
  });
  assert.ok(choice, `Missing ${kind}:${arg}`);
  assert.equal(choice.disabledReason, undefined, choice.disabledReason);
  const result = applyLibraryAction(town, choice.id);
  assert.equal(result.ok, true, result.reply);
}
function reading(complete = true) {
  const town = createTown("Mira");
  act(town, "accept", "reference");
  person(town, "player").tile = { ...ANCHORS.library };
  for (const key of [
    "card:kevin",
    "box:Birch",
    "box:Alder",
    "box:Cedar",
    "card:equipment",
    "card:dorm",
  ])
    act(town, "inspect", key);
  act(town, "report", "reference");
  act(town, "request", "source");
  act(town, "submit", "player");
  act(town, "test");
  for (
    let minute = 0;
    minute < 120 && town.economy.projects.library.lookup.status !== "done";
    minute++
  )
    advanceTown(town, 1);
  act(town, "evening-plan", "park");
  if (complete) {
    person(town, "player").tile = { ...libraryView(town).story.gathering.tile };
    for (
      let minute = 0;
      minute < 180 && town.economy.projects.library.evening.status !== "ready";
      minute++
    )
      advanceTown(town, 1);
    act(town, "evening-join", "listen");
  }
  return town;
}
function packet(town) {
  const prompt = buildPrompt(town, {
    kind: "player",
    agentId: "kevin",
    text: "Have I been paid today?",
    day: town.day,
    minute: town.minute,
  });
  return JSON.parse(prompt.split("\nResident: ")[1].split("\nCurrent beat:")[0]).currentFacts;
}

test("a resident answers natural questions about the reading they actually attended after reload", () => {
  const town = parseTownFile(exportTown(reading()));
  assert.ok(town);
  for (const text of [
    "How was the reading?",
    "Did you enjoy your first reading?",
    "What happened at the park gathering?",
  ]) {
    assert.match(ask(town, "northern", text), /Mira joined Northern's first reading in the park/);
  }
});
test("reading questions keep an invitation distinct from a completed scene", () => {
  const town = reading(false);
  assert.match(ask(town, "northern", "What is the reading plan?"), /chose a small park reading/);
  assert.doesNotMatch(
    ask(town, "northern", "How was the reading?"),
    /joined Northern's first reading|went ahead/,
  );
});
test("a reading question cannot teach an uninformed resident the scene or override an education topic", () => {
  const town = reading();
  const scene = town.economy.projects.library.events.find((event) => event.id.endsWith(":scene"));
  const unaware = town.agents.find(
    (agent) =>
      agent.id !== "player" &&
      !scene.participants.includes(agent.id) &&
      !scene.witnesses.includes(agent.id) &&
      !agent.memories.some((memory) => memory.text === scene.text),
  );
  assert.ok(unaware);
  assert.match(ask(town, unaware.id, "How was Northern's reading?"), /not learned what happened/);
  assert.doesNotMatch(
    ask(town, "northern", "I am reading about solar energy"),
    /Mira joined Northern's first reading/,
  );
});

for (const [name, minute, text, source] of [
  ["wrong amount", 400, "Hobbs Cafe paid me 500 for a shift I actually worked.", "event"],
  ["future payment", 1439, "Hobbs Cafe paid me 5 for a shift I actually worked.", "event"],
  ["spoken claim", 400, "Hobbs Cafe paid me 5 for a shift I actually worked.", "statement"],
])
  test(`prompt wage facts exclude ${name}`, () => {
    const town = createTown("Mira");
    person(town, "player").memories.push(makeMemory(town, 1, minute, "favor", text, 8, { source }));
    assert.deepEqual(packet(town).wageReceipts, []);
  });

function paidShift() {
  const town = createTown("Mira");
  initializeEconomy(town);
  initialiseFundedWork(town);
  const cmd = (kind, actor, terms, id) => ({
    kind,
    actor,
    terms,
    id: `dialogue:${id}`,
    authority: "simulation",
  });
  const approval = {
    id: "dialogue:approval",
    kind: "cafe-replacement",
    worker: "player",
    payer: "till:cafe",
    issuer: "kevin",
    claimId: null,
    confirmedMinutes: 0,
    fee: 5,
    requiredMinutes: 180,
    expires: { day: 3, minute: 1439 },
    cancellation: CAFE_CANCELLATION,
  };
  assert.equal(
    approvePayrollAgreement(
      town,
      cmd("approve-payroll-agreement", "kevin", approval, "approve"),
      approval,
    ).ok,
    true,
  );
  const id = "dialogue:cafe";
  assert.equal(
    createFundedCafeAgreement(
      town,
      cmd(
        "accept-funded-cafe-shift",
        "player",
        cafeAgreementTerms(id, "player", approval.id),
        "accept",
      ),
      id,
      "player",
      approval.id,
    ).ok,
    true,
  );
  person(town, "player").tile = { ...ANCHORS.cafe };
  for (let hour = 16; hour < 19; hour++)
    person(town, "player").plan.beats[hour] = {
      hour,
      place: "cafe",
      spot: "out",
      status: "working the agreed shift",
    };
  for (let minute = 960; minute < 1140; minute++) {
    town.minute = minute;
    const terms = { agreementId: id, day: town.day, minute };
    assert.equal(
      recordCafeAttendance(
        town,
        cmd("record-cafe-attendance", "player", terms, `minute:${minute}`),
        id,
      ).ok,
      true,
    );
  }
  assert.equal(person(town, "player").money, 9);
  assert.ok(parseTownFile(exportTown(town)));
  return town;
}
test("online payment grounding confirms an actual settled wage even without old prose receipts", () => {
  const town = parseTownFile(exportTown(paidShift()));
  assert.ok(town);
  const before = JSON.stringify(town.economy);
  assert.match(
    groundPlayerReply(town, person(town, "kevin"), "I have paid you 5.", "Have I been paid today?"),
    /5.*day 1.*18:59/,
  );
  assert.deepEqual(JSON.stringify(town.economy), before);
  assert.match(
    groundPlayerReply(town, person(town, "baba"), "I have paid you.", "Have I been paid today?"),
    /no wage receipt/,
  );
  town.day = 2;
  town.minute = 600;
  assert.match(
    groundPlayerReply(
      town,
      person(town, "kevin"),
      "Your wages have been paid.",
      "What about yesterday?",
    ),
    /5.*day 1.*18:59/,
  );
  assert.match(
    groundPlayerReply(
      town,
      person(town, "kevin"),
      "Your wages have been paid.",
      "What about today?",
    ),
    /no wage receipt/,
  );
});

for (const [day, minute] of [
  [0, 400],
  [1, -1],
])
  test(`an impossible wage date ${day}:${minute} is not authoritative`, () => {
    const town = createTown("Mira");
    const memory = makeMemory(
      town,
      day,
      minute,
      "favor",
      "Hobbs Cafe paid me 5 for a shift I actually worked.",
      8,
      { source: "event" },
    );
    person(town, "player").memories.push(memory);
    assert.deepEqual(packet(town).wageReceipts, []);
    assert.match(
      groundPlayerReply(
        town,
        person(town, "kevin"),
        "I have paid you 5.",
        day === 0 ? "What about yesterday?" : "What about today?",
      ),
      /no wage receipt/,
    );
    assert.ok(
      person(town, "player").memories.some((item) => item.id === memory.id),
      "historical memory must be retained",
    );
    if (day === 0) {
      const restored = parseTownFile(exportTown(town));
      assert.ok(restored);
      assert.deepEqual(packet(restored).wageReceipts, []);
      assert.ok(
        person(restored, "player").memories.some((item) => item.id === memory.id && item.day === 0),
      );
    }
  });
test("the model receives the actual settlement date rather than a date-free paid flag", () => {
  const town = paidShift();
  const payable = packet(town).fundedWork.payables.find((item) => item.status === "settled");
  assert.deepEqual(payable.paidAt, { day: 1, minute: 1139 });
});

for (const entry of ["payroll-runtime", "save"])
  test(`a cafe shift can be accepted after the ${entry} module loads first`, async () => {
    const isolated = await createServer({
      root: fileURLToPath(new URL("..", import.meta.url)),
      configFile: false,
      appType: "custom",
      logLevel: "error",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    });
    try {
      await isolated.ssrLoadModule(`/src/game/${entry}.ts`);
      const payroll = await isolated.ssrLoadModule("/src/game/payroll-runtime.ts");
      const effects = await isolated.ssrLoadModule("/src/game/effects.ts");
      const { createTown: freshTown } = await isolated.ssrLoadModule("/src/game/town.ts");
      const town = freshTown("Mira");
      person(town, "player").tile = { ...person(town, "kevin").tile };
      assert.equal(effects.PLAYER_CAFE_SHIFT, payroll.FUNDED_CAFE_SHIFT_TEXT);
      const offer = effects
        .playerActions(town, "kevin")
        .find((item) => item.label === "Accept cafe shift · 5");
      assert.ok(offer);
      assert.equal(offer.disabledReason, undefined, offer.disabledReason);
      assert.match(offer.terms, /5 coins reserved/);
      const result = effects.applyPlayerAction(town, "kevin", offer.id);
      assert.equal(result.ok, true, result.reply);
      assert.ok(
        person(town, "player").projects.some(
          (project) => project.text === payroll.FUNDED_CAFE_SHIFT_TEXT && project.status === "open",
        ),
      );
      assert.equal(
        town.economy.work.agreements.filter(
          (agreement) => agreement.worker === "player" && agreement.status === "active",
        ).length,
        1,
      );
      assert.equal(person(town, "player").money, 4);
    } finally {
      await isolated.close();
    }
  });
