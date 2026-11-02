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
const load = (name) => server.ssrLoadModule(`/src/game/${name}.ts`);
const { createTown } = await load("town");
const { applyCoffeeAction, makeCoffeeCommand, coffeeAdmissionReason } = await load("coffee");
const { requestCoffeeStaff } = await load("coffee-residents");
const { startCoffeeRoutine } = await load("coffee-runtime");
const { advanceTown } = await load("sim");
const { playerActions, applyPlayerAction } = await load("effects");
const { auditEconomy } = await load("economy");
const { exportTown, readTownFile } = await load("save");
const { forkTown } = await load("identity");
const who = (town, id) => town.agents.find((actor) => actor.id === id);
const ok = (result) => {
  assert.equal(result.ok, true, result.reason ?? result.message ?? result.reply);
  return result;
};
const action = (town, kind, targetId) =>
  applyCoffeeAction(town, makeCoffeeCommand(town, "player", kind, targetId ? { targetId } : {}));
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);

// Setup supplies a synthetic date and initial poses only. All subsequent NPC
// movement, service, receipts and payroll execute through the actual core loop.
function cafeTown(minute = 960) {
  const town = createTown("Coffee integration");
  town.minute = minute;
  who(town, "player").tile = { x: 7, y: 19 };
  who(town, "kevin").tile = { x: 8, y: 19 };
  who(town, "northern").tile = { x: 7, y: 18 };
  ok(action(town, "enable"));
  return town;
}

test("fresh-town opt-in uses existing money and does not buy coffee or enroll staff", () => {
  const town = createTown("Optional coffee"),
    identity = structuredClone(town.identityRegistry);
  ok(action(town, "enable"));
  assert.equal(total(town), 90);
  assert.equal(town.coffee.orders.length, 0);
  assert.equal(town.coffee.routines.length, 0);
  assert.deepEqual(town.identityRegistry, identity);
  assert.deepEqual(auditEconomy(town), []);
});

test("ordinary staffing request, real navigation, ready cup, pickup and use preserve all accounts", () => {
  const town = cafeTown(),
    identity = structuredClone(town.identityRegistry);
  const request = makeCoffeeCommand(town, "player", "staff-request");
  ok(requestCoffeeStaff(town, request));
  const requested = JSON.stringify(town);
  assert.equal(requestCoffeeStaff(town, request).replayed, true);
  assert.equal(JSON.stringify(town), requested);
  const orderId = ok(action(town, "buy")).value.orderId;
  // The human leaves the counter; this test does not claim browser input coverage.
  who(town, "player").tile = { x: 8, y: 20 };
  let ticks = 0;
  while (
    town.coffee.orders.find((order) => order.id === orderId).phase !== "ready" &&
    ticks < 130
  ) {
    advanceTown(town, 1);
    assert.deepEqual(auditEconomy(town), []);
    ticks++;
  }
  const order = town.coffee.orders.find((item) => item.id === orderId);
  assert.equal(order.phase, "ready", JSON.stringify({ ticks, minute: town.minute, order }));
  assert(
    ticks > 30,
    "Physical travel is included; the numerical 30-minute model is not asserted as game throughput",
  );
  assert.equal(
    order.contributions.reduce((sum, part) => sum + part.end - part.start, 0),
    30,
  );
  assert.equal(town.economy.transactions.filter((tx) => tx.agreementId === orderId).length, 1);
  assert.equal(total(town), 90);
  const saved = readTownFile(exportTown(town));
  assert.equal(saved.status, "ready", saved.reason);
  assert.deepEqual(saved.town.coffee.cups, town.coffee.cups);
  assert(saved.town.coffee.routines.every((routine) => routine.status !== "active"));
  who(saved.town, "player").tile = { x: 7, y: 19 };
  const cupId = ok(action(saved.town, "collect", orderId)).value.cupId;
  ok(action(saved.town, "drink", cupId));
  assert.equal(total(saved.town), 90);
  assert.deepEqual(saved.town.identityRegistry, identity);
  assert.deepEqual(auditEconomy(saved.town), []);
});

test("reload and fork revoke human control while preserving partial attendance and its wage hold", () => {
  const town = cafeTown(959);
  const offer = playerActions(town, "kevin").find((item) =>
    item.label.startsWith("Accept cafe shift"),
  );
  assert(offer && !offer.disabledReason, offer?.disabledReason);
  ok(applyPlayerAction(town, "kevin", offer.id));
  advanceTown(town, 1);
  const agreement = town.economy.work.agreements.find(
    (item) => item.worker === "player" && item.status === "active",
  );
  ok(
    startCoffeeRoutine(
      town,
      makeCoffeeCommand(town, "player", "start", { targetId: agreement.id }),
    ),
  );
  advanceTown(town, 16);
  const accrued = town.economy.work.agreements.find(
    (item) => item.id === agreement.id,
  ).eligibleMinutes;
  assert(accrued > 0);
  const oldCommand = makeCoffeeCommand(town, "player", "pause", { targetId: agreement.id });
  const raw = exportTown(town),
    loaded = readTownFile(raw);
  assert.equal(loaded.status, "ready", loaded.reason);
  const restored = loaded.town;
  assert.equal(restored.paused, true);
  assert.equal(restored.coffee.routines.find((item) => item.worker === "player").status, "paused");
  const retained = restored.economy.work.agreements.find((item) => item.id === agreement.id);
  assert.equal(retained.status, "suspended");
  assert.equal(retained.eligibleMinutes, accrued);
  assert.equal(restored.economy.holds.find((hold) => hold.id === retained.holdId).remaining, 5);
  const again = readTownFile(exportTown(restored));
  assert.equal(again.status, "ready", again.reason);
  assert.equal(again.town.economy.commandReceipts.length, restored.economy.commandReceipts.length);
  const fork = forkTown(town);
  assert.notEqual(fork.identityRegistry.worldId, town.identityRegistry.worldId);
  assert.equal(fork.coffee.routines.find((item) => item.worker === "player").status, "paused");
  const before = JSON.stringify(fork);
  assert.equal(applyCoffeeAction(fork, { ...oldCommand, kind: "buy" }).ok, false);
  assert.equal(JSON.stringify(fork), before);
  assert.deepEqual(auditEconomy(fork), []);
  assert.equal(total(fork), 90);
  assert.equal(exportTown(town), raw, "Forking cannot change the original town");
});

test("malformed or missing coffee data retains complete raw import bytes", () => {
  const town = cafeTown();
  for (const modify of [
    (copy) => {
      delete copy.town.coffee;
    },
    (copy) => {
      copy.town.coffee = null;
    },
    (copy) => {
      copy.town.coffee.nextOrder = 999;
    },
    (copy) => {
      copy.town.coffee.version = 99;
    },
  ]) {
    const copy = JSON.parse(exportTown(town));
    modify(copy);
    const raw = JSON.stringify(copy),
      result = readTownFile(raw);
    assert.equal(result.status, "unreadable");
    assert.equal(result.raw, raw);
    assert.match(result.reason, /coffee/i);
  }
});

test("thirty actual offline days preserve the opt-in town and close new admission after seven", () => {
  let town = cafeTown();
  ok(requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")));
  const identity = structuredClone(town.identityRegistry);
  for (let day = 1; day <= 30; day++) {
    advanceTown(town, 1440 - town.minute);
    assert.equal(total(town), 90);
    assert.deepEqual(auditEconomy(town), []);
    assert.deepEqual(town.identityRegistry, identity);
    if (town.day >= 8) assert.match(coffeeAdmissionReason(town), /closed/);
    const raw = exportTown(town);
    assert(Buffer.byteLength(raw) < 8 * 1024 * 1024);
    const restored = readTownFile(raw);
    assert.equal(restored.status, "ready", restored.reason);
    town = restored.town;
  }
  assert.equal(town.day, 31);
  assert(town.coffee.orders.length <= 50);
  assert(town.coffee.routines.length <= 14);
});
