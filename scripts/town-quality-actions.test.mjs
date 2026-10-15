import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
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
const { playerActions, applyPlayerAction, applyResult, BABA_LOAF } =
  await server.ssrLoadModule("/src/game/effects.ts");
const { advanceFundedPayroll } = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { libraryActions, applyLibraryAction, libraryView } =
  await server.ssrLoadModule("/src/game/community.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const agent = (town, id) => town.agents.find((person) => person.id === id);
const near = (town, id) => {
  agent(town, "player").tile = { ...agent(town, id).tile };
};
const cash = (town) =>
  town.agents.reduce((sum, a) => sum + a.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
function choose(town, target, label) {
  const action = playerActions(town, target).find((a) => a.label.startsWith(label));
  assert.ok(action, `Missing ${label}`);
  assert.equal(action.disabledReason, undefined, action.disabledReason);
  const result = applyPlayerAction(town, target, action.id);
  assert.equal(result.ok, true, result.reply);
  return result;
}
function libraryChoose(town, label) {
  const action = libraryActions(town).find((a) => a.label.startsWith(label));
  assert.ok(action, `Missing library action ${label}`);
  assert.equal(action.disabledReason, undefined, action.disabledReason);
  const result = applyLibraryAction(town, action.id);
  assert.equal(result.ok, true, result.reply);
}
function legacy(town, ambiguous = false) {
  const player = agent(town, "player");
  player.shiftHours = 1.5;
  player.projects.push({
    id: "old-shift",
    owner: "player",
    kind: "shift",
    place: "cafe",
    status: "open",
    day: town.day,
    text: "Cafe shift under the preserved original terms.",
  });
  for (const beat of player.plan.beats)
    if (beat.hour >= 16 && beat.hour < 19)
      Object.assign(beat, { place: "cafe", spot: "out", status: "at work" });
  if (ambiguous)
    player.projects.push({
      id: "other-old-shift",
      owner: "player",
      kind: "shift",
      place: "grocery",
      status: "open",
      day: town.day,
      text: "An overlapping grocery agreement.",
    });
}

test("standalone inventory consumes one loaf with its debt intact and rejects replay", () => {
  const town = createTown("Ada");
  near(town, "baba");
  choose(town, "baba", "Accept bread tab");
  const tab = structuredClone(town.favors[0]);
  agent(town, "player").tile = { ...ANCHORS.library };
  const quote = playerActions(town, "player").find((a) => a.label === "Eat loaf");
  const before = cash(town);
  assert.equal(applyPlayerAction(town, "player", quote.id).ok, true);
  assert.equal(agent(town, "player").projects.find((p) => p.text === BABA_LOAF).status, "done");
  assert.deepEqual(town.favors[0], tab);
  assert.equal(cash(town), before);
  const snapshot = JSON.stringify(town);
  assert.equal(applyPlayerAction(town, "player", quote.id).ok, false);
  assert.equal(JSON.stringify(town), snapshot);
});

test("ordinary conversation does not initialize books and quote previews are read-only", () => {
  const town = createTown("Ada");
  applyResult(town, {
    kind: "player",
    mind: "offline",
    agentId: "kevin",
    playerText: "Hello",
    reply: "Good morning.",
    delta: 0,
    note: "",
    favor: null,
  });
  assert.equal(town.economy, undefined);
  const before = JSON.stringify(town);
  assert.ok(playerActions(town, "kevin").some((a) => a.label.startsWith("Accept cafe shift")));
  assert.equal(JSON.stringify(town), before);
});

test("funded cafe attendance, suspension and its reservation survive midnight and pay once", () => {
  const town = createTown("Ada");
  const before = cash(town);
  near(town, "kevin");
  choose(town, "kevin", "Accept cafe shift");
  const agreement = () => town.economy.work.agreements.find((a) => a.worker === "player");
  assert.equal(agreement().fee, 5);
  assert.equal(town.economy.holds.find((h) => h.id === agreement().holdId).remaining, 5);
  agent(town, "player").tile = { ...ANCHORS.cafe };
  for (let minute = 960; minute < 1020; minute++) {
    town.minute = minute;
    advanceFundedPayroll(town);
  }
  assert.equal(agreement().eligibleMinutes, 60);
  agent(town, "kevin").tile = { ...ANCHORS.cafe };
  near(town, "kevin");
  choose(town, "kevin", "Suspend cafe shift");
  const progress = agreement().eligibleMinutes;
  town.minute = 1439;
  stepMinute(town, false);
  assert.equal(town.day, 2);
  assert.equal(agreement().eligibleMinutes, progress);
  assert.equal(town.economy.holds.find((h) => h.id === agreement().holdId).remaining, 5);
  agent(town, "kevin").tile = { ...ANCHORS.cafe };
  near(town, "kevin");
  choose(town, "kevin", "Resume cafe shift");
  for (let minute = 960; minute < 1080; minute++) {
    town.minute = minute;
    advanceFundedPayroll(town);
  }
  assert.equal(agreement().status, "completed");
  assert.equal(agent(town, "player").money, 9);
  advanceFundedPayroll(town);
  assert.equal(agent(town, "player").money, 9);
  assert.equal(town.economy.work.payables.filter((p) => p.worker === "player").length, 1);
  assert.equal(cash(town), before);
  assert.deepEqual(auditEconomy(town), []);
});

test("legacy partial recognition preserves evidence and ambiguous recognition confirms zero", () => {
  for (const ambiguous of [false, true]) {
    const town = createTown("Ada");
    legacy(town, ambiguous);
    near(town, "kevin");
    const original = structuredClone({
      projects: agent(town, "player").projects,
      hours: agent(town, "player").shiftHours,
    });
    choose(town, "kevin", "Recognise cafe work");
    const claim = town.economy.work.legacyClaims.find((c) => c.worker === "player");
    assert.equal(claim.evidence.shiftHours, original.hours);
    assert.deepEqual(claim.evidence.projects, original.projects);
    const agreement = town.economy.work.agreements.find((a) => a.worker === "player");
    assert.equal(agreement.eligibleMinutes, ambiguous ? 0 : 90);
    assert.equal(agreement.status, "suspended");
    assert.equal(agent(town, "player").money, 4);
    assert.deepEqual(auditEconomy(town), []);
  }
});

test("NPC debt settlement records the current actors after first financial activation", () => {
  const town = createTown("Ada");
  town.favors.push({
    id: "npc-debt",
    from: "northern",
    to: "baba",
    amount: 1,
    text: "Recorded supplies",
    status: "owed",
    day: 1,
  });
  const before = cash(town);
  applyResult(town, {
    kind: "talk",
    mind: "offline",
    a: "northern",
    b: "baba",
    lines: [{ speaker: "baba", text: "That settles the supply tab." }],
    relationships: [],
    favor: {
      action: "pay",
      id: "npc-debt",
      from: "northern",
      to: "baba",
      amount: 1,
      text: "Recorded supplies",
    },
    revealedSeed: false,
  });
  assert.equal(town.favors[0].status, "paid");
  assert.ok(
    agent(town, "northern").memories.some((m) =>
      m.turns?.some((turn) => turn.text === "That settles the supply tab."),
    ),
  );
  assert.ok(
    agent(town, "baba").memories.some((m) =>
      m.turns?.some((turn) => turn.text === "That settles the supply tab."),
    ),
  );
  assert.equal(cash(town), before);
  assert.deepEqual(auditEconomy(town), []);
});

test("a shared meal consumes once, shows the public result, and stays with participants and witnesses", () => {
  const town = createTown("Ada");
  agent(town, "player").tile = { ...ANCHORS.library };
  libraryChoose(town, "Accept source check");
  while (libraryActions(town).some((a) => a.category === "evidence" && !a.disabledReason)) {
    const action = libraryActions(town).find((a) => a.category === "evidence" && !a.disabledReason);
    assert.equal(applyLibraryAction(town, action.id).ok, true);
  }
  libraryChoose(town, "Submit source check");
  libraryChoose(town, "Request reference check");
  libraryChoose(town, "Delegate submission");
  libraryChoose(town, "Test this index");
  for (let i = 0; i < 30 && !libraryView(town).progress.includes("1/1 independent lookup"); i++) {
    const wait = libraryActions(town).find((a) => a.label.startsWith("Wait for lookup"));
    assert.ok(wait);
    assert.equal(applyLibraryAction(town, wait.id).ok, true);
  }
  assert.ok(libraryView(town).progress.includes("1/1 independent lookup"));
  agent(town, "baba").tile = { ...ANCHORS.grocery };
  near(town, "baba");
  choose(town, "baba", "Accept bread tab");
  const absent = agent(town, "sub");
  absent.tile = { ...ANCHORS.library };
  const witness = agent(town, "data");
  witness.tile = { x: ANCHORS.grocery.x + 1, y: ANCHORS.grocery.y };
  const relationships = JSON.stringify(town.agents.map((a) => a.relationships));
  const quote = playerActions(town, "player").find((a) => a.label === "Share loaf with Baba");
  assert.ok(quote);
  assert.match(quote.terms, /accepts/);
  assert.equal(applyPlayerAction(town, "player", quote.id).ok, true);
  for (const id of ["player", "baba", "data"])
    assert.ok(
      agent(town, id).memories.some(
        (m) => m.source === "event" && m.text.includes("shared the offered loaf"),
      ),
    );
  assert.equal(
    agent(town, "sub").memories.some((m) => m.text.includes("shared the offered loaf")),
    false,
  );
  assert.equal(JSON.stringify(town.agents.map((a) => a.relationships)), relationships);
  assert.equal(town.favors.find((f) => f.from === "player" && f.to === "baba").status, "owed");
  assert.equal(applyPlayerAction(town, "player", quote.id).ok, false);
  assert.deepEqual(auditEconomy(town), []);
});

test("an imported large purse settles its exact large debt without clipping balances", () => {
  const town = createTown("Ada");
  agent(town, "player").money = 5000;
  town.favors.push({
    id: "large-original-debt",
    from: "player",
    to: "baba",
    amount: 45,
    text: "Preserved original loan",
    status: "owed",
    day: 1,
  });
  near(town, "baba");
  const before = cash(town);
  choose(town, "baba", "Pay 45");
  assert.equal(agent(town, "player").money, 4955);
  assert.equal(agent(town, "baba").money, 54);
  assert.equal(town.favors.find((f) => f.id === "large-original-debt").status, "paid");
  assert.equal(cash(town), before);
  assert.deepEqual(auditEconomy(town), []);
});

test("staged actions preserve existing resident, project and debt references", () => {
  const town = createTown("Ada");
  const player = agent(town, "player");
  near(town, "baba");
  choose(town, "baba", "Accept bread tab");
  assert.equal(agent(town, "player"), player);
  const loaf = player.projects.find((p) => p.text === BABA_LOAF);
  const debt = town.favors[0];
  choose(town, "player", "Eat loaf");
  assert.equal(agent(town, "player"), player);
  assert.equal(loaf.status, "done");
  choose(town, "baba", "Pay 2");
  assert.equal(town.favors[0], debt);
  assert.equal(debt.status, "paid");
});

test("a non-shift project with the legacy shift identity cannot masquerade as a valid agreement", () => {
  const town = createTown("Ada");
  agent(town, "player").projects.push({
    id: "conflicting-old-project",
    owner: "player",
    kind: "other",
    status: "open",
    day: 1,
    text: "Cafe shift, 16:00 to 19:00 each day until cancelled; 5 after three hours if the till can pay.",
  });
  near(town, "kevin");
  const quote = playerActions(town, "kevin").find((a) => a.label.startsWith("Accept cafe shift"));
  assert.match(quote.disabledReason, /conflicts/);
  const before = JSON.stringify(town);
  assert.equal(applyPlayerAction(town, "kevin", quote.id).ok, false);
  assert.equal(JSON.stringify(town), before);
});

test("explicit earned settlement preserves the employer's remembered deed and town-life receipt", () => {
  const town = createTown("Ada");
  legacy(town);
  agent(town, "player").shiftHours = 3;
  near(town, "kevin");
  const quote = playerActions(town, "kevin").find((a) => a.label.startsWith("Receive earned wage"));
  assert.ok(quote);
  assert.equal(applyPlayerAction(town, "kevin", quote.id).ok, true);
  assert.equal(agent(town, "player").money, 9);
  assert.ok(
    agent(town, "kevin").memories.some(
      (m) => m.source === "event" && m.text.includes("worked the Hobbs shift"),
    ),
  );
  assert.ok(town.social.some((event) => event.text.includes("worked the Hobbs shift")));
  assert.ok(
    agent(town, "player").memories.some(
      (m) =>
        m.source === "event" && m.text === "Hobbs Cafe paid me 5 for a shift I actually worked.",
    ),
  );
  assert.equal(applyPlayerAction(town, "kevin", quote.id).ok, false);
  assert.equal(agent(town, "player").money, 9);
});
