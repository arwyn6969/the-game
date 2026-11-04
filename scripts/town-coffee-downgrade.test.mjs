import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createCoffeeRecoveryFixture } from "./fixtures/coffee-recovery.mjs";

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
const load = (name) => server.ssrLoadModule(`/src/game/${name}.ts`);
const { advanceTown, stepMinute } = await load("sim");
const { applyCoffeeAction, makeCoffeeCommand, settleCoffeeRefunds } = await load("coffee");
const { validateCoffee } = await load("coffee-validation");
const { requestCoffeeStaff } = await load("coffee-residents");
const { startCoffeeRoutine } = await load("coffee-runtime");
const { advanceFundedPayroll } = await load("payroll-runtime");
const { settleWorkPayable } = await load("funded-work");
const { auditEconomy, runEconomyCommand, transferFunds } = await load("economy");
const { exportTown, readTownFile } = await load("save");
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const order = (town, id) => town.coffee.orders.find((item) => item.id === id);
const agreement = (town, id) => town.economy.work.agreements.find((item) => item.id === id);
const hold = (town, id) => town.economy.holds.find((item) => item.id === id);
const payable = (town, id) => town.economy.work.payables.find((item) => item.id === id);
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const ok = (result) => {
  assert.equal(result.ok, true, result.reason ?? result.message ?? result.reply);
  return result;
};
const coffee = (town, actor, kind, targetId) =>
  applyCoffeeAction(town, makeCoffeeCommand(town, actor, kind, targetId ? { targetId } : {}));
const sim = (id, kind, actor, terms) => ({ id, kind, actor, authority: "simulation", terms });
const durableFacts = (town) => ({
  identities: town.identityRegistry,
  people: town.agents.map(({ id, name, money, projects, memories }) => ({
    id,
    name,
    money,
    projects,
    memories: memories.map((memory) => ({
      ...memory,
      // The documented load normalizer supplies these absent optional flags.
      // Compare their meaning without dropping any memory/provenance content.
      protected: Boolean(memory.protected),
      seed: Boolean(memory.seed),
      turns: memory.turns ?? [],
    })),
  })),
  favors: town.favors,
  notices: town.notices,
  tills: town.tills,
  economy: town.economy,
  coffee: town.coffee,
});

function healthy(town, opening) {
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateCoffee(town), []);
  assert.equal(total(town), opening, "Every obligation moves only existing fixture coins");
}
function reload(town, opening) {
  const facts = structuredClone(durableFacts(town));
  const loaded = readTownFile(exportTown(town));
  assert.equal(loaded.status, "ready", loaded.reason);
  assert.deepEqual(durableFacts(loaded.town), facts);
  assert.equal(
    loaded.town.coffee.routines.some((routine) => routine.status === "active"),
    false,
  );
  healthy(loaded.town, opening);
  return loaded.town;
}
function rejectUnchanged(town, attempt) {
  const before = exportTown(town);
  const rejected = attempt();
  assert.equal(rejected.ok, false);
  assert.equal(exportTown(town), before);
  return rejected;
}
function transfer(town, id, actor, to, amount) {
  const command = sim(id, "recovery-fixture-transfer", actor, { to, amount });
  ok(
    runEconomyCommand(town, command, (draft, context) => {
      transferFunds(draft, context, {
        id: `${id}:transfer`,
        from: `agent:${actor}`,
        to,
        amount,
        purpose: "Disclosed transfer of existing fixture cash creates settlement capacity",
      });
      return { to, amount };
    }),
  );
}
async function disabledFixture() {
  const fixture = await createCoffeeRecoveryFixture(load);
  // A deployment feature-off switch changes admission only, never deletes the
  // persisted café extension. This is not an in-game player toggle.
  fixture.town.coffee.enabled = false;
  fixture.town = reload(fixture.town, fixture.openingCoins);
  return fixture;
}
function pendingClaims(town, ids, partialMinutes) {
  assert.equal(order(town, ids.readyOrderId).phase, "ready");
  assert.equal(order(town, ids.refundOrderId).phase, "refund-pending");
  assert.equal(order(town, ids.refundOrderId).brewMinutes, 12);
  assert.equal(hold(town, ids.refundHoldId).remaining, 2);
  assert.equal(agreement(town, ids.partialShiftId).status, "suspended");
  assert.equal(agreement(town, ids.partialShiftId).eligibleMinutes, partialMinutes);
  assert.equal(hold(town, ids.partialHoldId).remaining, 5);
  assert.equal(payable(town, ids.earnedPayableId).status, "earned");
  assert.equal(agreement(town, ids.earnedShiftId).eligibleMinutes, 180);
  assert.equal(hold(town, ids.earnedHoldId).remaining, 5);
}

test("feature-off import preserves four independent café claims and the existing owner can still collect and drink once", async () => {
  let { town, ids, openingCoins, partialMinutes } = await disabledFixture();
  pendingClaims(town, ids, partialMinutes);
  const claims = structuredClone(town.economy.work);
  const holds = structuredClone(town.economy.holds);
  rejectUnchanged(town, () => coffee(town, "player", "enable"));
  const newPurchase = rejectUnchanged(town, () => coffee(town, "player", "buy"));
  assert.match(
    newPurchase.reason ?? newPurchase.message,
    /pilot.*(?:not open|closed)|disabled/i,
    "Feature-off admission rejects purchasing before time or existing-ticket guards",
  );
  rejectUnchanged(town, () =>
    requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")),
  );
  rejectUnchanged(town, () => coffee(town, "sub", "collect", ids.readyOrderId));
  rejectUnchanged(town, () => coffee(town, "player", "cancel", ids.readyOrderId));
  for (let minute = 0; minute < 61; minute++) {
    advanceTown(town, 1);
    healthy(town, openingCoins);
  }
  assert.equal(town.minute, 1201);
  assert.equal(town.coffee.orders.length, 2);
  pendingClaims(town, ids, partialMinutes);
  assert.deepEqual(town.economy.work, claims);
  assert.deepEqual(town.economy.holds, holds);
  assert.equal(
    town.agents.some((actor) => actor.id !== "player" && actor.tile.x === 7 && actor.tile.y === 19),
    false,
    "The ordinary former worker leaves the pickup counter after his plan changes",
  );
  // One labelled adjacent manual source input, after actual NPC departure.
  assert.deepEqual(person(town, "player").tile, { x: 8, y: 19 });
  person(town, "player").tile = { x: 7, y: 19 };
  const collect = makeCoffeeCommand(town, "player", "collect", { targetId: ids.readyOrderId });
  ok(applyCoffeeAction(town, collect));
  assert.equal(town.coffee.cups.find((cup) => cup.id === ids.readyCupId).custody, "inventory");
  town = reload(town, openingCoins);
  const drink = makeCoffeeCommand(town, "player", "drink", { targetId: ids.readyCupId });
  ok(applyCoffeeAction(town, drink));
  assert.equal(town.coffee.cups.find((cup) => cup.id === ids.readyCupId).custody, "consumed");
  const consumed = exportTown(town);
  assert.equal(applyCoffeeAction(town, collect).replayed, true);
  assert.equal(applyCoffeeAction(town, drink).replayed, true);
  assert.equal(exportTown(town), consumed);
  rejectUnchanged(town, () => coffee(town, "player", "drink", ids.readyCupId));
  assert.deepEqual(town.economy.holds, holds);
  assert.deepEqual(town.economy.work, claims);
  assert.equal(town.coffee.cups.filter((cup) => cup.orderId === ids.readyOrderId).length, 1);
  assert.equal(
    town.coffee.cups.some((cup) => cup.orderId === ids.refundOrderId),
    false,
  );
  reload(town, openingCoins);
});

for (const first of ["refund", "wage"])
  test(`feature-off reload keeps partial work and cup while ${first} settles before the other full-purse liability`, async () => {
    let { town, ids, openingCoins, partialMinutes, cancellation } = await disabledFixture();
    pendingClaims(town, ids, partialMinutes);
    const partial = structuredClone(agreement(town, ids.partialShiftId));
    const partialHold = structuredClone(hold(town, ids.partialHoldId));
    const ready = structuredClone(order(town, ids.readyOrderId));
    const cup = structuredClone(town.coffee.cups.find((item) => item.id === ids.readyCupId));
    const legacy = structuredClone(town.economy.work.legacyClaims);
    const pending = exportTown(town);
    settleCoffeeRefunds(town);
    advanceFundedPayroll(town);
    assert.equal(
      exportTown(town),
      pending,
      "Full purses preserve both liabilities without empty retries",
    );
    const settlement = sim("recovery:settle-earned-wage", "settle-work-payable", "kevin", {
      payableId: ids.earnedPayableId,
    });
    const settle = (kind) => {
      if (kind === "refund") {
        transfer(town, "recovery:buyer-space", "sub", "agent:baba", 2);
        settleCoffeeRefunds(town);
        assert.equal(order(town, ids.refundOrderId).phase, "refunded");
        assert.equal(hold(town, ids.refundHoldId).remaining, 0);
        assert.equal(person(town, "sub").money, 999);
      } else {
        transfer(town, "recovery:worker-space", "northern", "agent:kevin", 5);
        ok(settleWorkPayable(town, settlement, ids.earnedPayableId));
        assert.equal(payable(town, ids.earnedPayableId).status, "settled");
        assert.equal(hold(town, ids.earnedHoldId).remaining, 0);
        assert.equal(person(town, "northern").money, 999);
      }
      assert.deepEqual(agreement(town, ids.partialShiftId), partial);
      assert.deepEqual(hold(town, ids.partialHoldId), partialHold);
      assert.deepEqual(order(town, ids.readyOrderId), ready);
      assert.deepEqual(
        town.coffee.cups.find((item) => item.id === ids.readyCupId),
        cup,
      );
      assert.deepEqual(town.economy.work.legacyClaims, legacy);
      healthy(town, openingCoins);
    };
    settle(first);
    assert.equal(
      first === "refund"
        ? payable(town, ids.earnedPayableId).status
        : order(town, ids.refundOrderId).phase,
      first === "refund" ? "earned" : "refund-pending",
    );
    town = reload(town, openingCoins);
    settle(first === "refund" ? "wage" : "refund");
    const done = exportTown(town);
    assert.equal(applyCoffeeAction(town, cancellation).replayed, true);
    assert.equal(settleWorkPayable(town, settlement, ids.earnedPayableId).replayed, true);
    settleCoffeeRefunds(town);
    advanceFundedPayroll(town);
    assert.equal(exportTown(town), done);
    assert.equal(
      town.economy.transactions.filter(
        (item) => item.id === order(town, ids.refundOrderId).refundId,
      ).length,
      1,
    );
    assert.equal(
      town.economy.transactions.filter(
        (item) => item.id === payable(town, ids.earnedPayableId).transactionId,
      ).length,
      1,
    );
    reload(town, openingCoins);
  });

test("feature-off recovery permits only explicit completion of the existing partial routine and pays its original wage once", async () => {
  let { town, ids, openingCoins, partialMinutes } = await disabledFixture();
  const oldHolds = [ids.refundHoldId, ids.earnedHoldId].map((id) =>
    structuredClone(hold(town, id)),
  );
  const existingOrders = structuredClone(town.coffee.orders);
  const existingRoutines = town.coffee.routines.map((routine) => routine.agreementId);
  // Controlled time setup crosses a real midnight before the next authored
  // service window. Existing recorded intervals are never edited or replayed.
  town.minute = 1439;
  stepMinute(town, false);
  town.minute = 960;
  person(town, "player").tile = { x: 8, y: 19 };
  town = reload(town, openingCoins);
  const unchanged = exportTown(town);
  advanceFundedPayroll(town);
  assert.equal(
    exportTown(town),
    unchanged,
    "Loading/clock setup cannot authorize automatic attendance",
  );
  const newStaff = rejectUnchanged(town, () =>
    requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")),
  );
  assert.match(
    newStaff.message,
    /pilot.*(?:not open|closed)|disabled/i,
    "New staffing is refused by feature-off admission inside the actual service window",
  );
  ok(
    startCoffeeRoutine(
      town,
      makeCoffeeCommand(town, "player", "resume", { targetId: ids.partialShiftId }),
    ),
  );
  const beforeMoney = person(town, "player").money;
  for (let minute = partialMinutes; minute < 180; minute++) {
    advanceTown(town, 1);
    healthy(town, openingCoins);
  }
  assert.equal(agreement(town, ids.partialShiftId).eligibleMinutes, 180);
  assert.equal(agreement(town, ids.partialShiftId).status, "completed");
  const earned = town.economy.work.payables.find((item) => item.agreementId === ids.partialShiftId);
  assert.equal(earned.status, "settled");
  assert.equal(person(town, "player").money, beforeMoney + 5);
  assert.equal(hold(town, ids.partialHoldId).remaining, 0);
  assert.deepEqual(
    town.coffee.routines.map((routine) => routine.agreementId),
    existingRoutines,
  );
  assert.deepEqual(town.coffee.orders, existingOrders);
  for (const original of oldHolds) assert.deepEqual(hold(town, original.id), original);
  assert.equal(town.coffee.enabled, false);
  assert.equal(
    town.economy.transactions.filter((item) => item.agreementId === ids.partialShiftId).length,
    1,
  );
  const paid = exportTown(town);
  advanceFundedPayroll(town);
  assert.equal(exportTown(town), paid);
  town = reload(town, openingCoins);
  assert.equal(person(town, "player").money, beforeMoney + 5);
});

test("a lossy downgrade projection is rejected with complete original import bytes rather than silently discarding café rights", async () => {
  const { town, ids } = await disabledFixture();
  const original = exportTown(town);
  for (const erase of [
    (copy) => delete copy.town.coffee,
    (copy) => {
      copy.town.coffee.cups = [];
    },
    (copy) => {
      copy.town.economy.holds = copy.town.economy.holds.filter(
        (item) => item.id !== ids.refundHoldId,
      );
    },
  ]) {
    const copy = JSON.parse(original);
    erase(copy);
    const raw = JSON.stringify(copy);
    const rejected = readTownFile(raw);
    assert.equal(rejected.status, "unreadable");
    assert.equal(
      rejected.raw,
      raw,
      "The precise lossy input remains recoverable, never normalized away",
    );
    assert.match(rejected.reason, /coffee|hold|ledger|economy/i);
    assert.equal(
      exportTown(town),
      original,
      "A failed import cannot mutate the original valid town",
    );
  }
});
