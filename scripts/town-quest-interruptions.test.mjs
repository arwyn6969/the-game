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
const { libraryActions, applyLibraryAction, libraryView, validateLibraryState } =
  await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { formatClock } = await server.ssrLoadModule("/src/game/text.ts");

const person = (town, id) => town.agents.find((agent) => agent.id === id);
const state = (town) => town.economy.projects.library;
const stamp = ({ day, minute }) => (day - 1) * 1440 + minute;
const action = (town, kind, arg) =>
  libraryActions(town).find((item) => {
    const [actualKind, actualArg] = JSON.parse(item.id);
    return actualKind === kind && (arg === undefined || actualArg === arg);
  });
function healthy(town) {
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateLibraryState(town), []);
}
function act(town, kind, arg = "") {
  const quoted = action(town, kind, arg);
  assert.ok(quoted, `Missing ${kind}:${arg}`);
  assert.equal(quoted.disabledReason, undefined, quoted.disabledReason);
  const result = applyLibraryAction(town, quoted.id);
  assert.equal(result.ok, true, result.reply);
  healthy(town);
  return quoted;
}
function reload(town) {
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored, "an interrupted project must retain its saved deadline and accounts");
  healthy(restored);
  return restored;
}
function lookedUp(lookupMinute) {
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
  if (lookupMinute !== undefined) town.minute = lookupMinute;
  act(town, "test");
  for (let minute = 0; minute < 120 && state(town).lookup.status !== "done"; minute++)
    advanceTown(town, 1);
  assert.equal(state(town).lookup.status, "done");
  assert.equal(state(town).delivery, false);
  healthy(town);
  return town;
}
function assertCurrentDeadline(town) {
  const deadline = state(town).evening.noteDueAt;
  assert.ok(deadline);
  assert.ok(
    libraryView(town).nextStep.includes(
      `town day ${deadline.day} at ${formatClock(deadline.minute)}`,
    ),
    `The project must show its actual delivery time: ${libraryView(town).nextStep}`,
  );
}

for (const [label, lookupMinute] of [
  ["same-day", undefined],
  ["midnight", 23 * 60 + 10],
])
  test(`${label} note guidance and its real arrival agree after an interrupted lookup is reloaded`, () => {
    let town = lookedUp(lookupMinute);
    const due = structuredClone(state(town).evening.noteDueAt);
    if (label === "midnight") assert.equal(due.day, town.day + 1);
    assertCurrentDeadline(town);
    const remaining = stamp(due) - stamp(town);
    assert.equal(remaining, 30);
    advanceTown(town, remaining - 1);
    assert.equal(state(town).delivery, false);
    town = reload(town);
    assertCurrentDeadline(town);
    assert.deepEqual(state(town).evening.noteDueAt, due);
    const balances = town.agents.map(({ money }) => money);
    advanceTown(town, 1);
    assert.equal(state(town).delivery, true);
    assert.match(libraryView(town).nextStep, /dated delivery note is ready/);
    assert.equal(state(town).events.filter(({ id }) => id === "library:delivery").length, 1);
    assert.deepEqual(
      town.agents.map(({ money }) => money),
      balances,
    );
    reload(town);
  });

test("an older project keeps its original deadline until explicitly adopting the reading", () => {
  let town = lookedUp();
  delete state(town).evening;
  town = reload(town);
  const originalDay = state(town).started + 2;
  assert.match(libraryView(town).nextStep, new RegExp(`town day ${originalDay}`));
  advanceTown(town, 31);
  assert.equal(state(town).delivery, false, "import cannot silently accelerate the old quest");
  town = reload(town);
  assert.equal(state(town).evening, undefined);
  assert.match(libraryView(town).nextStep, new RegExp(`town day ${originalDay}`));
  act(town, "evening-plan", "library");
  assert.equal(state(town).evening.status, "waiting");
  assert.ok(stamp(state(town).evening.noteDueAt) < stamp(town));
  assert.match(
    libraryView(town).nextStep,
    /note is due now; advance the clock/,
    "adopting an already due note must not keep advertising the old two-day wait",
  );
  const wait = action(town, "evening-wait-note");
  assert.ok(wait);
  assert.equal(JSON.parse(wait.id)[1], "1");
  town = reload(town);
  assert.equal(applyLibraryAction(town, wait.id).ok, true);
  assert.equal(state(town).delivery, true);
  assert.equal(state(town).evening.status, "routing");
  reload(town);
});

test("midnight, both cash trays and financial closure preserve one free reading across reload", () => {
  let town = lookedUp(23 * 60 + 10);
  const debts = structuredClone(town.favors);
  const booking = act(town, "evening-plan", "library");
  const wait = action(town, "evening-wait-note");
  assert.ok(wait);
  assert.equal(applyLibraryAction(town, wait.id).ok, true);
  assert.equal(town.day, 2);
  person(town, "player").tile = { ...libraryView(town).story.gathering.tile };
  const bread = act(town, "evening-refreshments", "bread");
  const tea = act(town, "evening-refreshments", "tea");
  const close = act(town, "close");
  const balances = town.agents.map(({ money }) => money);
  const tills = structuredClone(town.tills);
  const transactions = town.economy.transactions.length;
  town = reload(town);
  for (const stale of [booking, wait, bread, tea, close]) {
    const before = exportTown(town);
    assert.equal(applyLibraryAction(town, stale.id).ok, false);
    assert.equal(exportTown(town), before, "replaying an earlier choice must not mutate the town");
  }
  for (let minute = 0; minute < 180 && state(town).evening.status !== "ready"; minute++)
    advanceTown(town, 1);
  assert.equal(state(town).evening.status, "ready");
  assert.equal(state(town).phase, "closed");
  town = reload(town);
  const join = act(town, "evening-join", "read");
  const scene = structuredClone(state(town).evening.scene);
  assert.match(scene.join(" "), /Baba's bread tray and Kevin's tea tray/);
  assert.equal(state(town).evening.attendedByPlayer, true);
  assert.deepEqual(
    town.agents.map(({ money }) => money),
    balances,
  );
  assert.deepEqual(town.tills, tills);
  assert.equal(town.economy.transactions.length, transactions);
  assert.deepEqual(town.favors, debts, "cash trays must not settle old personal bread tabs");
  town = reload(town);
  const before = exportTown(town);
  assert.equal(applyLibraryAction(town, join.id).ok, false);
  assert.equal(exportTown(town), before);
  assert.deepEqual(state(town).evening.scene, scene);
  assert.equal(
    state(town).events.filter(({ id }) => id.endsWith(":scene")).length,
    1,
    "financial closure and reload cannot duplicate the shared scene",
  );
});
