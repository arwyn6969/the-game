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
const { activateFundedTown, advanceFundedPayroll } = await load("payroll-runtime");
const { auditEconomy, availableFunds } = await load("economy");
const { makeCoffeeCommand, applyCoffeeAction, validateCoffee, coffeeActionReason } =
  await load("coffee");
const { requestCoffeeStaff, coffeeStaffRequestReason } = await load("coffee-residents");
const {
  startCoffeeRoutine,
  pauseCoffeeRoutine,
  suspendPlayerCoffeeRoutine,
  recoverCoffeeControl,
  beforeCoffeePayroll,
  afterCoffeePayroll,
  hasActivePlayerCoffeeRoutine,
  coffeeWorkView,
} = await load("coffee-runtime");
const { stepMinute } = await load("sim");
const { applyPlayerAction, playerActions, applyResult } = await load("effects");
const { offlineResult } = await load("offline");
const { exportTown, readTownFile } = await load("save");
const { walkable } = await load("world");
const who = (town, id) => town.agents.find((actor) => actor.id === id);
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) + town.tills.cafe + town.tills.grocery;
const command = (town, actor, kind, options = {}) => makeCoffeeCommand(town, actor, kind, options);
const order = (town, id) => town.coffee.orders.find((candidate) => candidate.id === id);
const agreement = (town, id) =>
  town.economy.work.agreements.find((candidate) => candidate.id === id);

function fixture(northernMoney = 2) {
  const town = createTown("Coffee resident");
  // Optional full-purse fixture is established before the immutable opening
  // snapshot. It is not an in-game transfer or a proposed coin source.
  who(town, "northern").money = northernMoney;
  town.minute = 960;
  for (const actor of town.agents) {
    actor.tile = { ...actor.home };
    actor.path = [];
  }
  who(town, "kevin").tile = { x: 9, y: 19 };
  who(town, "player").tile = { x: 7, y: 19 };
  who(town, "northern").tile = { x: 8, y: 18 };
  assert.equal(activateFundedTown(town).ok, true);
  const enabled = applyCoffeeAction(town, command(town, "player", "enable"));
  assert.equal(enabled.ok, true, enabled.reason);
  return town;
}

function staffing(town) {
  const request = requestCoffeeStaff(town, command(town, "player", "staff-request"));
  assert.equal(request.ok, true, request.message);
  return town.coffee.routines.find((routine) => routine.worker === "northern").agreementId;
}

function playerShift(town) {
  const action = playerActions(town, "kevin").find((action) =>
    action.label.startsWith("Accept cafe shift"),
  );
  assert.ok(action && !action.disabledReason, action?.disabledReason);
  const accepted = applyPlayerAction(town, "kevin", action.id);
  assert.equal(accepted.ok, true, accepted.reply);
  const id = town.economy.work.agreements.find(
    (candidate) => candidate.worker === "player" && candidate.status === "active",
  ).id;
  const started = startCoffeeRoutine(town, command(town, "player", "start", { targetId: id }), id);
  assert.equal(started.ok, true, started.message);
  assert.equal(coffeeWorkView(town).fee, 5);
  return id;
}

function ticks(town, count) {
  for (let n = 0; n < count; n++) {
    stepMinute(town, false);
    assert.deepEqual(auditEconomy(town), []);
    assert.deepEqual(validateCoffee(town), []);
    assert.equal(total(town), 90);
    assert.equal(new Set(town.agents.map((actor) => `${actor.tile.x},${actor.tile.y}`)).size, 8);
  }
}

test("one explicit staffed-service request prepares a human's actual cup and protects future wages", () => {
  const town = fixture();
  const shift = staffing(town);
  const free = availableFunds(town, "till:cafe");
  const bought = applyCoffeeAction(town, command(town, "player", "buy"));
  assert.equal(bought.ok, true, bought.reason);
  assert.equal(availableFunds(town, "till:cafe"), free);
  const id = bought.value.orderId;
  ticks(town, 45);
  assert.equal(order(town, id).phase, "ready");
  assert.equal(order(town, id).brewMinutes, 20);
  assert.equal(order(town, id).placeMinutes, 10);
  assert.equal(availableFunds(town, "till:cafe"), free + 2);
  assert.equal(who(town, "northern").money, 2, "no per-cup wage");
  const collected = applyCoffeeAction(town, command(town, "player", "collect", { targetId: id }));
  assert.equal(collected.ok, true, collected.reason);
  const cup = town.coffee.cups.find((candidate) => candidate.orderId === id);
  assert.equal(cup.owner, "player");
  assert.equal(cup.custody, "inventory");
  ticks(town, 1140 - town.minute);
  assert.equal(agreement(town, shift).eligibleMinutes, 180);
  assert.equal(agreement(town, shift).status, "completed");
  assert.equal(who(town, "northern").money, 7);
  assert.equal(
    town.coffee.routines.find((routine) => routine.agreementId === shift).status,
    "ended",
  );
});

test("a human starts once; Sub chooses, pays, collects and clears the counter without automatic drinking", () => {
  const town = fixture();
  who(town, "player").tile = { x: 8, y: 19 };
  const shift = playerShift(town);
  who(town, "sub").tile = { x: 7, y: 19 };
  const openingSub = who(town, "sub").money;
  ticks(town, 55);
  const subOrder = town.coffee.orders.find((candidate) => candidate.buyer === "sub");
  assert.ok(subOrder, "authored optional café visit orders coffee");
  assert.equal(subOrder.phase, "collected");
  assert.equal(who(town, "sub").money, openingSub - 2);
  assert.equal(town.coffee.cups.find((cup) => cup.orderId === subOrder.id).custody, "inventory");
  assert.notDeepEqual(who(town, "sub").tile, { x: 7, y: 19 });
  assert.equal(hasActivePlayerCoffeeRoutine(town), true);
  assert.ok(agreement(town, shift).eligibleMinutes >= 50);
  assert.equal(
    who(town, "player").money,
    4,
    "a short coffee task does not award the full shift early",
  );
});

test("immediate player override revokes assignment and attendance, preserving a partial brew and full wage", () => {
  const town = fixture();
  who(town, "player").tile = { x: 8, y: 19 };
  const shift = playerShift(town);
  who(town, "sub").tile = { x: 7, y: 19 };
  ticks(town, 12);
  const id = town.coffee.orders.find((candidate) => candidate.buyer === "sub").id;
  const progress = order(town, id).brewMinutes;
  assert.ok(progress > 0 && progress < 20);
  const attendance = agreement(town, shift).eligibleMinutes;
  const stopped = suspendPlayerCoffeeRoutine(town, "Manual movement.");
  assert.equal(stopped.ok, true, stopped.message);
  assert.equal(hasActivePlayerCoffeeRoutine(town), false);
  assert.equal(order(town, id).assignedAgreementId, null);
  assert.equal(agreement(town, shift).status, "suspended");
  assert.equal(
    town.economy.holds.find((hold) => hold.id === agreement(town, shift).holdId).remaining,
    5,
  );
  ticks(town, 10);
  assert.equal(order(town, id).brewMinutes, progress);
  assert.equal(agreement(town, shift).eligibleMinutes, attendance);
  const resumed = startCoffeeRoutine(
    town,
    command(town, "player", "resume", { targetId: shift }),
    shift,
  );
  assert.equal(resumed.ok, true, resumed.message);
  ticks(town, 40);
  assert.equal(order(town, id).phase, "collected");
});

test("finish-current keeps the final coffee interval's payroll, then stops without overtime or partial wage", () => {
  const town = fixture();
  who(town, "player").tile = { x: 8, y: 19 };
  const shift = playerShift(town);
  who(town, "sub").tile = { x: 7, y: 19 };
  ticks(town, 12);
  const finish = pauseCoffeeRoutine(
    town,
    command(town, "player", "finish-current", { targetId: shift }),
    shift,
    true,
  );
  assert.equal(finish.ok, true, finish.message);
  let last = -1;
  for (let n = 0; n < 45 && hasActivePlayerCoffeeRoutine(town); n++) {
    last = town.minute;
    ticks(town, 1);
  }
  assert.equal(hasActivePlayerCoffeeRoutine(town), false);
  assert.equal(agreement(town, shift).status, "suspended");
  assert.ok(agreement(town, shift).attendance.includes(`1:${last}`));
  assert.equal(who(town, "player").money, 4);
  const accrued = agreement(town, shift).eligibleMinutes;
  ticks(town, 10);
  assert.equal(agreement(town, shift).eligibleMinutes, accrued);
});

test("repeated pre-payroll calls do not double work or grant travel after that interval's work", () => {
  const town = fixture();
  staffing(town);
  const bought = applyCoffeeAction(town, command(town, "player", "buy"));
  const id = bought.value.orderId;
  ticks(town, 2);
  const first = beforeCoffeePayroll(town);
  assert.ok(first.worked.has("northern"));
  const before = JSON.stringify(town);
  const repeated = beforeCoffeePayroll(town);
  assert.equal(JSON.stringify(town), before);
  assert.ok(repeated.worked.has("northern"));
  advanceFundedPayroll(town);
  assert.equal(afterCoffeePayroll(town), true);
  assert.equal(
    order(town, id).contributions.reduce(
      (sum, contribution) => sum + contribution.end - contribution.start,
      0,
    ),
    order(town, id).brewMinutes,
  );
});

test("recovery pauses active grants and preserves work; replaying Stop adds no receipts", () => {
  const town = fixture();
  const shift = staffing(town);
  applyCoffeeAction(town, command(town, "player", "buy"));
  ticks(town, 8);
  const work = town.coffee.orders[0].brewMinutes;
  assert.equal(recoverCoffeeControl(town, "Reload requires explicit Resume.").ok, true);
  assert.equal(agreement(town, shift).status, "suspended");
  assert.equal(town.coffee.orders[0].assignedAgreementId, null);
  const receipts = town.economy.commandReceipts.length;
  recoverCoffeeControl(town, "Reload requires explicit Resume.");
  assert.equal(town.economy.commandReceipts.length, receipts);
  ticks(town, 4);
  assert.equal(town.coffee.orders[0].brewMinutes, work);
  assert.equal(requestCoffeeStaff(town, command(town, "player", "staff-request")).ok, true);
  ticks(town, 40);
  assert.equal(town.coffee.orders[0].phase, "ready");
});

test("stale and foreign worker control cannot take over a shift or append empty records", () => {
  const town = fixture();
  const shift = staffing(town);
  const wrong = pauseCoffeeRoutine(
    town,
    command(town, "player", "pause", { targetId: shift }),
    shift,
  );
  assert.equal(wrong.ok, false);
  const valid = command(town, "northern", "pause", { targetId: shift });
  const before = JSON.stringify(town);
  assert.equal(pauseCoffeeRoutine(town, { ...valid, worldId: "world_foreign" }, shift).ok, false);
  assert.equal(JSON.stringify(town), before);
  assert.equal(pauseCoffeeRoutine(town, valid, shift).ok, true);
  const stopped = JSON.stringify(town);
  assert.equal(pauseCoffeeRoutine(town, valid, shift).replayed, true);
  assert.equal(JSON.stringify(town), stopped);
});

test("new staffing respects existing commitments and willingness without rewriting plans", () => {
  const town = fixture();
  who(town, "northern").plan.beats[16] = {
    hour: 16,
    place: "library",
    spot: "out",
    status: "reading for an earlier promise",
  };
  const before = JSON.stringify(town);
  assert.match(coffeeStaffRequestReason(town), /not chosen/);
  assert.equal(requestCoffeeStaff(town, command(town, "player", "staff-request")).ok, false);
  assert.equal(JSON.stringify(town), before);
});

test("a stationary human blocks pickup without being pushed or giving a buyer a phantom cup", () => {
  const town = fixture();
  staffing(town);
  who(town, "sub").tile = { x: 8, y: 19 };
  const tile = { ...who(town, "player").tile };
  ticks(town, 20);
  assert.deepEqual(who(town, "player").tile, tile);
  assert.equal(
    town.coffee.orders.some((candidate) => candidate.buyer === "sub"),
    false,
  );
  assert.equal(town.coffee.cups.length, 0);
  assert.ok(town.agents.every((actor) => walkable(actor.tile.x, actor.tile.y)));
  assert.equal(
    coffeeActionReason(town, "sub", "buy"),
    "Stand at the café pickup counter to order.",
  );
});

test("the last valid service interval can finish a cup and earn the 180th wage minute exactly once", () => {
  const town = fixture();
  const shift = staffing(town);
  ticks(town, 148);
  assert.equal(town.minute, 1108);
  const bought = applyCoffeeAction(
    town,
    command(town, "player", "buy", { acceptLaterPickup: true }),
  );
  assert.equal(bought.ok, true, bought.reason);
  const id = bought.value.orderId;
  ticks(town, 32);
  assert.equal(town.minute, 1140);
  assert.equal(order(town, id).phase, "ready");
  assert.equal(order(town, id).readyAt, 1140);
  assert.equal(agreement(town, shift).eligibleMinutes, 180);
  assert.equal(who(town, "northern").money, 7);
  assert.equal(
    town.economy.commandReceipts.filter((receipt) => receipt.kind === "coffee.ready").length,
    1,
  );
  ticks(town, 2);
  assert.equal(order(town, id).placeMinutes, 10);
});

test("late coffee retains partial resources at window end and remains fully refundable after the wage pays", () => {
  const town = fixture();
  const shift = staffing(town);
  ticks(town, 170);
  const bought = applyCoffeeAction(
    town,
    command(town, "player", "buy", { acceptLaterPickup: true }),
  );
  assert.equal(bought.ok, true, bought.reason);
  const id = bought.value.orderId;
  ticks(town, 10);
  assert.equal(agreement(town, shift).status, "completed");
  assert.equal(order(town, id).phase, "brewing");
  assert.ok(order(town, id).brewMinutes > 0 && order(town, id).brewMinutes < 20);
  assert.equal(order(town, id).assignedAgreementId, null);
  assert.notEqual(order(town, id).pickupSlot, null);
  const brew = order(town, id).brewMinutes;
  ticks(town, 5);
  assert.equal(order(town, id).brewMinutes, brew);
  const refund = applyCoffeeAction(town, command(town, "player", "cancel", { targetId: id }));
  assert.equal(refund.ok, true, refund.reason);
  assert.equal(order(town, id).phase, "refunded");
  assert.equal(order(town, id).pickupSlot, null);
  assert.equal(who(town, "player").money, 4);
  assert.equal(
    who(town, "northern").money,
    7,
    "the accepted wage is not reversed with the customer's refund",
  );
  assert.deepEqual(auditEconomy(town), []);
});

test("explicit player service uses at most three adjacent legal steps and cannot move while brewing", () => {
  const town = fixture();
  who(town, "player").tile = { x: 8, y: 19 };
  playerShift(town);
  who(town, "sub").tile = { x: 7, y: 19 };
  let tile = who(town, "player").tile;
  let moves = 0;
  Object.defineProperty(who(town, "player"), "tile", {
    enumerable: true,
    configurable: true,
    get: () => tile,
    set: (next) => {
      const distance = Math.abs(next.x - tile.x) + Math.abs(next.y - tile.y);
      if (distance) {
        assert.equal(distance, 1);
        assert.equal(walkable(next.x, next.y), true);
        assert.equal(
          town.agents.some(
            (actor) => actor.id !== "player" && actor.tile.x === next.x && actor.tile.y === next.y,
          ),
          false,
        );
        assert.ok(++moves <= 3);
      }
      tile = next;
    },
  });
  for (let n = 0; n < 40; n++) {
    moves = 0;
    const progress = town.coffee.orders.reduce(
      (sum, item) => sum + item.brewMinutes + item.placeMinutes,
      0,
    );
    ticks(town, 1);
    const nextProgress = town.coffee.orders.reduce(
      (sum, item) => sum + item.brewMinutes + item.placeMinutes,
      0,
    );
    if (nextProgress > progress)
      assert.equal(moves, 0, "work and movement cannot share the same service interval");
  }
});

test("a saved interval between coffee work and payroll recovers its one attendance minute before pausing", () => {
  const town = fixture();
  const shift = staffing(town);
  applyCoffeeAction(town, command(town, "player", "buy"));
  ticks(town, 2);
  const beforeAttendance = agreement(town, shift).eligibleMinutes;
  const interval = beforeCoffeePayroll(town);
  assert.ok(interval.worked.has("northern"));
  const brewed = town.coffee.orders[0].brewMinutes;
  const restored = readTownFile(exportTown(town));
  assert.equal(restored.status, "ready", restored.reason);
  assert.equal(agreement(restored.town, shift).eligibleMinutes, beforeAttendance + 1);
  assert.equal(agreement(restored.town, shift).status, "suspended");
  assert.equal(restored.town.coffee.orders[0].brewMinutes, brewed);
  const afterRecovery = JSON.stringify(restored.town);
  recoverCoffeeControl(restored.town, "Repeated recovery.");
  assert.equal(JSON.stringify(restored.town), afterRecovery);
  ticks(restored.town, 1);
  assert.equal(agreement(restored.town, shift).eligibleMinutes, beforeAttendance + 1);
});

test("Northern's real earned wage can fund a later voluntary coffee after his initial spending was exhausted", () => {
  const town = fixture();
  who(town, "player").tile = { x: 8, y: 19 };
  playerShift(town);
  ticks(town, 180);
  const firstNorthernOrder = town.coffee.orders.find((item) => item.buyer === "northern");
  assert.ok(firstNorthernOrder);
  assert.equal(firstNorthernOrder.phase, "collected");
  assert.equal(
    who(town, "northern").money,
    0,
    "the initial two existing coins were spent, not reset",
  );

  const nextDay = () => {
    // Controlled source fixture: exercise real midnight and authored local plan
    // renewal, then choose next shift's initial poses. No money is edited.
    town.minute = 1439;
    stepMinute(town, false);
    const job = {
      kind: "plan",
      day: town.day,
      minute: town.minute,
      weekly: false,
      agents: town.agents.filter((actor) => actor.id !== "player").map((actor) => actor.id),
    };
    applyResult(town, offlineResult(town, job));
    town.minute = 960;
    who(town, "player").tile = { x: 7, y: 19 };
    who(town, "kevin").tile = { x: 9, y: 19 };
    who(town, "northern").tile = { x: 8, y: 18 };
    who(town, "sub").tile = { x: 11, y: 22 };
  };
  nextDay();
  const paidShift = staffing(town);
  const bought = applyCoffeeAction(town, command(town, "player", "buy"));
  assert.equal(bought.ok, true, bought.reason);
  ticks(town, 45);
  assert.equal(
    applyCoffeeAction(town, command(town, "player", "collect", { targetId: bought.value.orderId }))
      .ok,
    true,
  );
  ticks(town, 1140 - town.minute);
  assert.equal(agreement(town, paidShift).status, "completed");
  assert.equal(who(town, "northern").money, 5);

  nextDay();
  who(town, "player").tile = { x: 8, y: 19 };
  playerShift(town);
  ticks(town, 60);
  const purchases = town.coffee.orders.filter((item) => item.buyer === "northern");
  assert.equal(purchases.length, 2);
  assert.equal(purchases[1].phase, "collected");
  assert.equal(who(town, "northern").money, 3, "the new purchase spent real settled wages");
  assert.equal(total(town), 90);
  assert.ok(
    town.coffee.cups
      .filter((cup) => cup.owner === "northern")
      .every((cup) => cup.custody === "inventory"),
  );
});

test("save-capacity continuation is bounded and disclosed, while Stop preserves the wage even after its grant is used", () => {
  const town = fixture();
  const shift = staffing(town);
  // Synthetic serialization pressure exercises the actual byte guard; this is
  // not ordinary story content or a claim that browser quota equals export size.
  town.syntheticStorageStress = "x".repeat(3 * 1024 * 1024);
  assert.equal(recoverCoffeeControl(town, "Stop at capacity.").ok, true);
  assert.equal(town.coffee.routines[0].drainResumeUsed, undefined);
  assert.match(coffeeWorkView(town, "northern").drainNotice, /One final uninterrupted/);
  const wrong = pauseCoffeeRoutine(
    town,
    command(town, "player", "pause", { targetId: shift }),
    shift,
  );
  assert.equal(wrong.ok, false, "wrong actor cannot claim a no-op Stop succeeded");
  const resumed = startCoffeeRoutine(
    town,
    command(town, "northern", "resume", { targetId: shift }),
    shift,
  );
  assert.equal(resumed.ok, true, resumed.message);
  assert.equal(town.coffee.routines[0].drainResumeUsed, true);
  assert.equal(recoverCoffeeControl(town, "Stop is always available.").ok, true);
  const before = JSON.stringify(town);
  assert.equal(
    startCoffeeRoutine(town, command(town, "northern", "resume", { targetId: shift }), shift).ok,
    false,
  );
  assert.equal(JSON.stringify(town), before);
  assert.equal(agreement(town, shift).status, "suspended");
  assert.equal(
    town.economy.holds.find((hold) => hold.id === agreement(town, shift).holdId).remaining,
    5,
  );
  const forged = structuredClone(town);
  delete forged.coffee.routines[0].drainResumeUsed;
  assert.ok(validateCoffee(forged).some((issue) => /drain|continuation|resume/i.test(issue)));
  const oversized = structuredClone(town);
  oversized.syntheticStorageStress = "x".repeat(7.9 * 1024 * 1024);
  // A separate paused agreement with its grant still available must also fail
  // closed if unrelated history has already consumed the measured drain margin.
  const fresh = fixture();
  const freshShift = staffing(fresh);
  recoverCoffeeControl(fresh, "Pause before the capacity guard.");
  fresh.syntheticStorageStress = oversized.syntheticStorageStress;
  const untouched = JSON.stringify(fresh);
  const tooLarge = startCoffeeRoutine(
    fresh,
    command(fresh, "northern", "resume", { targetId: freshShift }),
    freshShift,
  );
  assert.equal(tooLarge.ok, false);
  assert.match(tooLarge.message, /headroom/);
  assert.equal(JSON.stringify(fresh), untouched);
});

test("service closure refunds an unready buyer whose only remaining funded worker would be themselves", () => {
  const town = fixture();
  const northernShift = staffing(town);
  assert.equal(
    pauseCoffeeRoutine(
      town,
      command(town, "northern", "pause", { targetId: northernShift }),
      northernShift,
    ).ok,
    true,
  );
  who(town, "player").tile = { x: 8, y: 19 };
  const humanShift = playerShift(town);
  ticks(town, 179);
  who(town, "northern").tile = { x: 7, y: 19 };
  const paid = applyCoffeeAction(
    town,
    command(town, "northern", "buy", { acceptLaterPickup: true }),
  );
  assert.equal(paid.ok, true, paid.reason);
  town.coffee.enabled = false; // Feature-off admission switch, preserving existing obligations.
  ticks(town, 1);
  assert.equal(agreement(town, humanShift).status, "completed");
  assert.equal(order(town, paid.value.orderId).phase, "refunded");
  assert.equal(agreement(town, northernShift).status, "suspended");
  assert.equal(
    town.economy.holds.find((hold) => hold.id === agreement(town, northernShift).holdId).remaining,
    5,
  );
  assert.equal(who(town, "northern").money, 2);
  assert.equal(total(town), 90);
});

test("storage continuation reserves settlement space for already-earned imported wage obligations", () => {
  let town = fixture(999);
  const opening = total(town);
  const humanShift = playerShift(town);
  assert.equal(
    suspendPlayerCoffeeRoutine(town, "Keep this funded shift for a later session.").ok,
    true,
  );
  const northernShift = staffing(town);
  for (let minute = 0; minute < 180; minute++) stepMinute(town, false);
  const payable = town.economy.work.payables.find((item) => item.agreementId === northernShift);
  assert.equal(payable.status, "earned", "the full purse retains a genuine earned wage");
  assert.equal(agreement(town, northernShift).eligibleMinutes, 180);
  assert.equal(total(town), opening);
  assert.deepEqual(auditEconomy(town), []);

  const imported = readTownFile(exportTown(town));
  assert.equal(imported.status, "ready", imported.reason);
  town = imported.town;
  assert.equal(
    town.economy.work.payables.find((item) => item.agreementId === northernShift).status,
    "earned",
  );

  town.minute = 1439;
  stepMinute(town, false); // Real midnight preserves both obligations.
  town.minute = 960;
  const pendingMinutes = town.economy.work.agreements
    .filter((item) => item.kind === "cafe-shift" && ["active", "suspended"].includes(item.status))
    .reduce((sum, item) => sum + item.requiredMinutes - item.eligibleMinutes, 0);
  const pendingOrders = town.coffee.orders.filter(
    (item) => !["collected", "consumed", "refunded"].includes(item.phase),
  ).length;
  const oldReserve = pendingMinutes * 2048 + pendingOrders * 8192 + 128 * 1024;
  const targetBytes = 8 * 1024 * 1024 - oldReserve - 4096;
  town.syntheticStorageStress = "";
  town.syntheticStorageStress = "x".repeat(targetBytes - Buffer.byteLength(JSON.stringify(town)));
  assert.equal(Buffer.byteLength(JSON.stringify(town)), targetBytes);
  const before = JSON.stringify(town);
  const denied = startCoffeeRoutine(
    town,
    command(town, "player", "resume", { targetId: humanShift }),
    humanShift,
  );
  assert.equal(denied.ok, false);
  assert.match(denied.message, /headroom/);
  assert.equal(JSON.stringify(town), before, "refusal neither spends nor releases an earned claim");

  // Restoring the reserved settlement tail permits the existing funded routine
  // to use its one continuation; no obligation is deleted to make it fit.
  town.syntheticStorageStress = town.syntheticStorageStress.slice(8192);
  const resumed = startCoffeeRoutine(
    town,
    command(town, "player", "resume", { targetId: humanShift }),
    humanShift,
  );
  assert.equal(resumed.ok, true, resumed.message);
  const retained = town.economy.work.payables.find((item) => item.agreementId === northernShift);
  assert.equal(retained.status, "earned");
  assert.equal(town.economy.holds.find((hold) => hold.id === retained.holdId).remaining, 5);
  assert.equal(total(town), opening);
  assert.deepEqual(auditEconomy(town), []);
});
