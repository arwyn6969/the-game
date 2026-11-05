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
const load = (name) => server.ssrLoadModule(`/src/game/${name}.ts`);
const { createTown } = await load("town");
const { advanceTown } = await load("sim");
const { findPath } = await load("path");
const { walkable } = await load("world");
const { applyCoffeeAction, makeCoffeeCommand, completeCoffeeOrder } = await load("coffee");
const { validateCoffee } = await load("coffee-validation");
const { requestCoffeeStaff } = await load("coffee-residents");
const { startCoffeeRoutine, pauseCoffeeRoutine } = await load("coffee-runtime");
const { playerActions, applyPlayerAction } = await load("effects");
const { auditEconomy, availableFunds } = await load("economy");
const { exportTown, readTownFile } = await load("save");
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const order = (town, id) => town.coffee.orders.find((item) => item.id === id);
const agreement = (town, id) => town.economy.work.agreements.find((item) => item.id === id);
const routine = (town, id) => town.coffee.routines.find((item) => item.agreementId === id);
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const ok = (result) => {
  assert.equal(result.ok, true, result.reason ?? result.message ?? result.reply);
  return result;
};
const command = (town, actor, kind, targetId) =>
  makeCoffeeCommand(town, actor, kind, targetId ? { targetId } : {});

function healthy(town) {
  assert.equal(total(town), 90, "Existing coins include all project custody; holds are not money");
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateCoffee(town), []);
  assert.equal(new Set(town.agents.map(({ tile }) => `${tile.x},${tile.y}`)).size, 10);
}

function tick(town, count = 1) {
  for (let elapsed = 0; elapsed < count; elapsed++) {
    const positions = new Map(town.agents.map(({ id, tile }) => [id, { ...tile }]));
    const interval = (town.day - 1) * 1440 + town.minute;
    advanceTown(town, 1);
    healthy(town);
    for (const actor of town.agents) {
      const before = positions.get(actor.id);
      assert.ok(
        Math.abs(actor.tile.x - before.x) + Math.abs(actor.tile.y - before.y) <= 3,
        "Station yielding shares the existing movement budget",
      );
      if (
        town.coffee.orders.some((item) =>
          item.contributions.some(
            (part) => part.worker === actor.id && part.start <= interval && part.end > interval,
          ),
        )
      )
        assert.deepEqual(actor.tile, before, "A preparation interval never also moves its worker");
    }
  }
}

function until(town, predicate, limit, description) {
  for (let elapsed = 0; elapsed < limit && !predicate(); elapsed++) tick(town);
  assert.ok(predicate(), `${description} (day ${town.day}, minute ${town.minute})`);
}

// Source-created dates and initial poses are synthetic. Later human steps are
// adjacent manual inputs; service, NPC purchases, routes and payroll all run
// through the core loop. No progress, orders, receipts or money are injected.
function fixture(playerAtCounter = false) {
  const town = createTown("Handover visitor");
  town.minute = 960;
  for (const actor of town.agents) {
    actor.tile = { ...actor.home };
    actor.path = [];
  }
  person(town, "player").tile = playerAtCounter ? { x: 7, y: 19 } : { x: 8, y: 19 };
  person(town, "kevin").tile = { x: 9, y: 19 };
  person(town, "northern").tile = { x: 8, y: 18 };
  person(town, "sub").tile = playerAtCounter ? { x: 7, y: 20 } : { x: 7, y: 19 };
  ok(applyCoffeeAction(town, command(town, "player", "enable")));
  healthy(town);
  return town;
}

function playerShift(town) {
  const quote = playerActions(town, "kevin").find((item) =>
    item.label.startsWith("Accept cafe shift"),
  );
  assert.ok(quote, "Kevin has an ordinary funded shift quote");
  assert.equal(quote.disabledReason, undefined, quote.disabledReason);
  ok(applyPlayerAction(town, "kevin", quote.id));
  const accepted = town.economy.work.agreements.find(
    (item) => item.worker === "player" && item.status === "active",
  );
  assert.ok(accepted);
  ok(startCoffeeRoutine(town, command(town, "player", "start", accepted.id)));
  healthy(town);
  return accepted.id;
}

function northernShift(town) {
  ok(requestCoffeeStaff(town, command(town, "player", "staff-request")));
  const accepted = town.coffee.routines.find((item) => item.worker === "northern");
  assert.ok(accepted, "Northern accepted his own fully funded service terms");
  healthy(town);
  return accepted.agreementId;
}

function walk(town, destination) {
  let steps = 0;
  while (
    (person(town, "player").tile.x !== destination.x ||
      person(town, "player").tile.y !== destination.y) &&
    steps++ < 60
  ) {
    const blocked = new Set(
      town.agents.filter((item) => item.id !== "player").map(({ tile }) => `${tile.x},${tile.y}`),
    );
    const next = findPath(person(town, "player").tile, destination, blocked)[0];
    assert.ok(next, "Manual player input has an actual walkable route off the work station");
    const before = person(town, "player").tile;
    assert.equal(Math.abs(next.x - before.x) + Math.abs(next.y - before.y), 1);
    assert.equal(walkable(next.x, next.y), true);
    assert.equal(blocked.has(`${next.x},${next.y}`), false);
    person(town, "player").tile = { ...next };
    tick(town);
  }
  assert.deepEqual(person(town, "player").tile, destination);
}

function protectedWork(town, id) {
  const item = agreement(town, id);
  return {
    id: item.id,
    worker: item.worker,
    fee: item.fee,
    eligibleMinutes: item.eligibleMinutes,
    attendance: item.attendance,
    hold: town.economy.holds.find((hold) => hold.id === item.holdId),
    payables: town.economy.work.payables.filter((payable) => payable.agreementId === id),
  };
}

function reload(town, ids) {
  const prior = structuredClone({
    identity: town.identityRegistry,
    money: town.agents.map(({ id, money }) => ({ id, money })),
    tills: town.tills,
    transactions: town.economy.transactions,
    orders: town.coffee.orders,
    cups: town.coffee.cups,
    work: ids.map((id) => protectedWork(town, id)),
  });
  const loaded = readTownFile(exportTown(town));
  assert.equal(loaded.status, "ready", loaded.reason);
  const next = loaded.town;
  assert.deepEqual(
    {
      identity: next.identityRegistry,
      money: next.agents.map(({ id, money }) => ({ id, money })),
      tills: next.tills,
      transactions: next.economy.transactions,
      orders: next.coffee.orders,
      cups: next.coffee.cups,
      work: ids.map((id) => protectedWork(next, id)),
    },
    prior,
  );
  assert.ok(next.coffee.routines.every((item) => item.status !== "active"));
  healthy(next);
  return next;
}

function contributions(town) {
  const equipment = { brewing: new Map(), placing: new Map() };
  const workers = new Set();
  let parallelMinutes = 0;
  for (const item of town.coffee.orders) {
    let brew = 0;
    let place = 0;
    for (const part of item.contributions) {
      assert.ok(part.end > part.start);
      const owner = agreement(town, part.agreementId);
      assert.equal(owner.worker, part.worker);
      for (let minute = part.start; minute < part.end; minute++) {
        const stamp = `${Math.floor(minute / 1440) + 1}:${minute % 1440}`;
        assert.ok(
          owner.attendance.includes(stamp),
          "Every contribution has its own paid-work attendance evidence",
        );
        const workerMinute = `${part.worker}:${minute}`;
        assert.equal(
          workers.has(workerMinute),
          false,
          "One worker cannot contribute to two cups in the same interval",
        );
        workers.add(workerMinute);
        assert.equal(
          equipment[part.phase].has(minute),
          false,
          "Only one worker uses each physical station per interval",
        );
        equipment[part.phase].set(minute, part.worker);
      }
      if (part.phase === "brewing") brew += part.end - part.start;
      else place += part.end - part.start;
    }
    assert.equal(brew, item.brewMinutes);
    assert.equal(place, item.placeMinutes);
    if (["ready", "collected", "consumed"].includes(item.phase)) {
      assert.equal(brew, 20);
      assert.equal(place, 10);
      assert.equal(town.coffee.cups.filter((cup) => cup.orderId === item.id).length, 1);
    }
  }
  for (const [minute, worker] of equipment.brewing)
    if (equipment.placing.has(minute)) {
      assert.notEqual(worker, equipment.placing.get(minute));
      parallelMinutes++;
    }
  return { parallelMinutes };
}

function rejectOldCompletion(town, orderId, oldWorker, revision) {
  const before = exportTown(town);
  assert.equal(completeCoffeeOrder(town, orderId, oldWorker, revision).ok, false);
  assert.equal(
    exportTown(town),
    before,
    "A revoked assignment cannot release money or duplicate a cup",
  );
}

test("a partially brewed cup passes between consenting funded workers without duplicating work, cups or wages", () => {
  let town = fixture();
  const original = playerShift(town);
  until(
    town,
    () => town.coffee.orders.some((item) => item.buyer === "sub" && item.brewMinutes >= 8),
    40,
    "Sub buys normally and the human actually begins brewing",
  );
  const targetId = town.coffee.orders.find((item) => item.buyer === "sub").id;
  const partial = structuredClone(order(town, targetId));
  assert.ok(partial.brewMinutes > 0 && partial.brewMinutes < 20);
  assert.equal(partial.assignedAgreementId, original);
  ok(pauseCoffeeRoutine(town, command(town, "player", "pause", original)));
  const stopped = structuredClone(protectedWork(town, original));
  assert.equal(order(town, targetId).assignedAgreementId, null);
  assert.ok(order(town, targetId).assignmentRevision > partial.assignmentRevision);
  rejectOldCompletion(town, targetId, original, partial.assignmentRevision);
  const successor = northernShift(town);
  const manualPosition = { ...person(town, "player").tile };
  tick(town, 3);
  assert.deepEqual(
    person(town, "player").tile,
    manualPosition,
    "Service cannot move a paused human out of its way",
  );
  assert.equal(order(town, targetId).brewMinutes, partial.brewMinutes);
  walk(town, { x: 9, y: 20 });
  assert.deepEqual(protectedWork(town, original), stopped);
  until(
    town,
    () => order(town, targetId).brewMinutes > partial.brewMinutes,
    40,
    "Northern acquires the existing partial brew and contributes real minutes",
  );
  assert.equal(order(town, targetId).assignedAgreementId, successor);
  rejectOldCompletion(town, targetId, original, partial.assignmentRevision);
  ok(startCoffeeRoutine(town, command(town, "player", "resume", original)));
  tick(town);
  assert.equal(
    order(town, targetId).assignedAgreementId,
    successor,
    "Resuming an old worker cannot steal a current lease",
  );
  ok(pauseCoffeeRoutine(town, command(town, "player", "pause", original)));
  walk(town, { x: 9, y: 20 });
  const pausedAgain = structuredClone(protectedWork(town, original));
  until(
    town,
    () => ["ready", "collected"].includes(order(town, targetId).phase),
    70,
    "The successor completes the same cup",
  );
  assert.deepEqual(protectedWork(town, original), pausedAgain);
  const completed = order(town, targetId);
  assert.deepEqual(
    new Set(completed.contributions.map((part) => part.worker)),
    new Set(["player", "northern"]),
  );
  assert.deepEqual(
    completed.contributions.slice(0, partial.contributions.length),
    partial.contributions,
  );
  assert.equal(town.coffee.cups.find((cup) => cup.orderId === targetId).owner, "sub");
  assert.equal(town.economy.transactions.filter((item) => item.agreementId === targetId).length, 1);
  assert.equal(town.economy.holds.find((hold) => hold.id === completed.holdId).remaining, 0);
  rejectOldCompletion(town, targetId, original, partial.assignmentRevision);
  contributions(town);
  for (const id of [original, successor]) {
    assert.equal(protectedWork(town, id).hold.remaining, 5);
    assert.equal(protectedWork(town, id).payables.length, 0);
  }
  town = reload(town, [original, successor]);
  tick(town, 3);
  assert.equal(order(town, targetId).brewMinutes, 20);
  assert.equal(order(town, targetId).placeMinutes, 10);
  assert.equal(town.coffee.cups.filter((cup) => cup.orderId === targetId).length, 1);
  assert.equal(routine(town, original).status, "paused");
  assert.equal(routine(town, successor).status, "paused");
  assert.deepEqual(protectedWork(town, original), pausedAgain);
  contributions(town);
});

test("matched two-ticket arrivals measure one versus two funded workers and physical station capacity", (t) => {
  const common = fixture(true);
  const northern = northernShift(common);
  const buyerCoins = person(common, "player").money;
  ok(applyCoffeeAction(common, command(common, "player", "buy")));
  assert.equal(person(common, "player").money, buyerCoins - 2);
  // Controlled, synthetic arrivals within the same paused 16:00 minute keep
  // the human's ordinary shift quote valid in both alternatives. Every order
  // still goes through the exact actor/counter/budget/refund guards and pays
  // existing coins. This is a demand comparison, not observed voluntary play.
  const arrive = (actor, tile) => {
    const before = person(common, actor).tile;
    assert.equal(Math.abs(before.x - tile.x) + Math.abs(before.y - tile.y), 1);
    assert.equal(walkable(tile.x, tile.y), true);
    assert.ok(
      common.agents.every(
        (item) => item.id === actor || item.tile.x !== tile.x || item.tile.y !== tile.y,
      ),
    );
    person(common, actor).tile = { ...tile };
  };
  arrive("player", { x: 8, y: 19 });
  arrive("sub", { x: 7, y: 19 });
  const subCoins = person(common, "sub").money;
  ok(applyCoffeeAction(common, command(common, "sub", "buy")));
  assert.equal(person(common, "sub").money, subCoins - 2);
  arrive("sub", { x: 7, y: 20 });
  assert.equal(common.minute, 960);
  healthy(common);
  assert.equal(common.coffee.orders.length, 2);
  const demand = structuredClone(
    common.coffee.orders.map(({ id, buyer, createdAt, price }) => ({
      id,
      buyer,
      createdAt,
      price,
    })),
  );
  const opening = common.minute;
  // These are alternative runs of one local source snapshot, not two clients
  // sharing balances and not restoration of a browser's old control grant.
  const runs = [
    { staffCount: 1, reverse: false },
    { staffCount: 2, reverse: false },
    { staffCount: 2, reverse: true },
  ].map(({ staffCount, reverse }) => {
    const town = structuredClone(common);
    const ids = [northern];
    if (staffCount === 2) ids.push(playerShift(town));
    // Routine order is a valid serialized ordering, not progress or authority.
    // Reverse it in one extra variant to exercise player placement with an
    // incoming NPC brewer as well as the default opposite-role exchange.
    if (reverse) town.coffee.routines.reverse();
    const unreservedAtStart = availableFunds(town, "till:cafe");
    tick(town, 100);
    assert.equal(town.minute, opening + 100);
    assert.deepEqual(
      town.coffee.orders.map(({ id, buyer, createdAt, price }) => ({
        id,
        buyer,
        createdAt,
        price,
      })),
      demand,
      "No extra purchases are injected into the two-worker comparison",
    );
    assert.ok(
      town.coffee.orders.every((item) => ["ready", "collected"].includes(item.phase)),
      JSON.stringify({
        staffCount,
        orders: town.coffee.orders,
        routines: town.coffee.routines,
        positions: town.agents.map(({ id, tile }) => ({ id, tile })),
      }),
    );
    assert.equal(town.coffee.cups.length, 2);
    const { parallelMinutes } = contributions(town);
    const result = {
      workers: staffCount,
      routineOrder: town.coffee.routines.map((item) => item.worker),
      windowMinutes: 100,
      completedCups: town.coffee.cups.length,
      readyWaitMinutes: town.coffee.orders.map((item) => ({
        buyer: item.buyer,
        minutes: item.readyAt - item.createdAt,
      })),
      promisedWages: ids.reduce((sum, id) => sum + agreement(town, id).fee, 0),
      paidWages: ids.reduce(
        (sum, id) =>
          sum +
          protectedWork(town, id)
            .payables.filter((item) => item.status === "settled")
            .reduce((paid, item) => paid + item.amount, 0),
        0,
      ),
      protectedWages: ids.reduce((sum, id) => sum + protectedWork(town, id).hold.remaining, 0),
      eligibleMinutes: ids.map((id) => ({
        worker: agreement(town, id).worker,
        minutes: agreement(town, id).eligibleMinutes,
      })),
      parallelMinutes,
      unreservedAtStart,
      totalCoins: total(town),
    };
    reload(town, ids);
    return result;
  });
  assert.equal(runs[0].promisedWages, 5);
  assert.equal(runs[1].promisedWages, 10);
  assert.equal(runs[0].unreservedAtStart - runs[1].unreservedAtStart, 5);
  assert.equal(runs[0].parallelMinutes, 0);
  assert.ok(
    runs[1].parallelMinutes > 0,
    "Two staff actually overlap brewing and placement, never the same station",
  );
  assert.ok(
    runs[2].parallelMinutes > 0,
    "Both worker-role orientations use separate stations concurrently",
  );
  t.diagnostic(JSON.stringify({ syntheticInitialPoses: true, liveInferenceCalls: 0, runs }));
});
