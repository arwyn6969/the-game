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
const { libraryActions, applyLibraryAction, libraryView } =
  await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const act = (town, kind, argument) => {
  const choice = libraryActions(town).find((item) => {
    const [choiceKind, choiceArgument] = JSON.parse(item.id);
    return choiceKind === kind && (argument === undefined || choiceArgument === argument);
  });
  assert.ok(choice, `Missing ${kind}:${argument ?? ""}`);
  const result = applyLibraryAction(town, choice.id);
  assert.equal(result.ok, true, result.reply);
  assert.deepEqual(auditEconomy(town), []);
};
const budget = (town) => {
  const before = JSON.stringify(town);
  const { funded, spent, custody, reserved, available, refunded, payments } = libraryView(town);
  assert.equal(JSON.stringify(town), before, "displaying project accounts cannot mutate the town");
  assert.equal(funded, spent + custody + refunded, "public figures reconcile the actual project");
  assert.equal(custody, reserved + available, "reservations are included within remaining cash");
  return { funded, spent, custody, reserved, available, refunded, payments };
};

test("library money distinguishes proposed funding, reservations, completed fees and refunds", () => {
  const town = createTown("Feedback test");
  assert.deepEqual(budget(town), {
    funded: 0,
    spent: 0,
    custody: 0,
    reserved: 0,
    available: 0,
    refunded: 0,
    payments: [],
  });
  act(town, "accept", "source");
  assert.deepEqual(
    { ...budget(town), payments: [] },
    { funded: 8, spent: 0, custody: 8, reserved: 6, available: 2, refunded: 0, payments: [] },
  );
  town.agents.find(({ id }) => id === "player").tile = { ...ANCHORS.library };
  for (const key of ["card:equipment", "card:dorm", "box:Cedar"]) act(town, "inspect", key);
  act(town, "report", "source");
  const paid = budget(town);
  assert.equal(paid.spent, 2);
  assert.equal(paid.custody, 6);
  assert.equal(paid.reserved, 4);
  assert.deepEqual(
    paid.payments.map(({ worker, amount }) => ({ worker, amount })),
    [{ worker: "Feedback test", amount: 2 }],
  );
  act(town, "close");
  const closed = budget(town);
  assert.equal(closed.custody, 0);
  assert.equal(closed.refunded, 6);
  assert.equal(closed.spent, 2, "closure preserves the paid contribution");
});

test("public receipts cover all three project workers while the lookup keeps its narrow outcome", () => {
  const town = createTown("Feedback test");
  act(town, "accept", "source");
  town.agents.find(({ id }) => id === "player").tile = { ...ANCHORS.library };
  for (const key of ["card:equipment", "card:dorm", "box:Cedar", "box:Birch", "box:Alder"])
    act(town, "inspect", key);
  act(town, "report", "source");
  act(town, "request", "reference");
  act(town, "submit", "player");
  act(town, "test");
  for (let minute = 0; minute < 80 && !libraryView(town).lookupCompleted; minute++)
    advanceTown(town, 1);
  const result = libraryView(town);
  assert.equal(result.lookupCompleted, true);
  const final = budget(town);
  assert.equal(final.spent, 6);
  assert.equal(final.custody, 2);
  assert.equal(final.available, 2);
  assert.equal(final.reserved, 0);
  assert.deepEqual(
    final.payments.map(({ amount }) => amount),
    [2, 2, 2],
  );
  assert.deepEqual(
    new Set(final.payments.map(({ worker }) => worker)),
    new Set(["Feedback test", "Kevin", "Northern"]),
  );
  assert.match(result.outcome, /community room access note in Cedar/);
  assert.equal(
    result.entries.find(({ id }) => id === "room-access").date,
    "Historical date unknown",
  );
});
