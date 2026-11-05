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
const { ANCHORS, walkable } = await load("world");
const { applyCoffeeAction, makeCoffeeCommand, coffeeAdmissionReason, coffeeEligibleWorkers } =
  await load("coffee");
const { validateCoffee } = await load("coffee-validation");
const { requestCoffeeStaff } = await load("coffee-residents");
const { startCoffeeRoutine, pauseCoffeeRoutine, coffeeCommitmentReason } =
  await load("coffee-runtime");
const { playerActions, applyPlayerAction } = await load("effects");
const { auditEconomy } = await load("economy");
const { exportTown, readTownFile } = await load("save");
const library = await load("community");
const physical = await load("physical-items");
const discussion = await load("discussions");
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const order = (town, id) => town.coffee.orders.find((item) => item.id === id);
const agreement = (town, id) => town.economy.work.agreements.find((item) => item.id === id);
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const ok = (result) => {
  assert.equal(result.ok, true, result.reason ?? result.message ?? result.reply);
  return result;
};
const coffee = (town, kind, targetId) =>
  applyCoffeeAction(town, makeCoffeeCommand(town, "player", kind, targetId ? { targetId } : {}));

function healthy(town) {
  assert.equal(total(town), 90, "Coins include project custody; holds are not extra money");
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateCoffee(town), []);
  assert.deepEqual(library.validateLibraryState(town), []);
  assert.deepEqual(physical.validatePhysicalItems(town), []);
  assert.deepEqual(discussion.validateDiscussions(town), []);
  for (const records of [
    town.economy.transactions,
    town.economy.commandReceipts,
    town.economy.work.payables,
    town.coffee.orders,
    town.coffee.cups,
  ])
    assert.equal(new Set(records.map((item) => item.id)).size, records.length);
}

function tick(town, minutes) {
  advanceTown(town, minutes);
  healthy(town);
}

function until(town, predicate, limit, reason) {
  for (let elapsed = 0; elapsed < limit && !predicate(); elapsed++) advanceTown(town, 1);
  assert.ok(predicate(), `${reason} (day ${town.day}, minute ${town.minute})`);
  healthy(town);
}

function at(town, minute) {
  assert.ok(town.minute <= minute, `Cannot rewind ${town.minute} to ${minute}`);
  tick(town, minute - town.minute);
}

// React owns ordinary manual movement. These are labelled synthetic adjacent
// player inputs, not browser qualification or teleports. NPC/item/service
// movement, preparation, attendance and settlement use the actual core loop.
function walk(town, destination) {
  const steps = findPath(person(town, "player").tile, destination);
  for (const next of steps) {
    const player = person(town, "player");
    assert.equal(Math.abs(next.x - player.tile.x) + Math.abs(next.y - player.tile.y), 1);
    assert.equal(walkable(next.x, next.y), true);
    player.tile = { ...next };
    advanceTown(town, 1);
  }
  assert.deepEqual(person(town, "player").tile, destination);
  healthy(town);
}

function lib(town, kind, argument) {
  const quoted = library.libraryActions(town).find((item) => {
    const [actualKind, actualArgument] = JSON.parse(item.id);
    return actualKind === kind && (argument === undefined || actualArgument === argument);
  });
  assert.ok(quoted, `Missing library action ${kind}:${argument ?? ""}`);
  assert.equal(quoted.disabledReason, undefined, quoted.disabledReason);
  ok(library.applyLibraryAction(town, quoted.id));
  healthy(town);
}

function acceptShift(town) {
  const quoted = playerActions(town, "kevin").find((item) =>
    item.label.startsWith("Accept cafe shift"),
  );
  assert.ok(quoted, "An ordinary funded shift offer is available");
  assert.equal(quoted.disabledReason, undefined, quoted.disabledReason);
  ok(applyPlayerAction(town, "kevin", quoted.id));
  const shift = town.economy.work.agreements.find(
    (item) => item.worker === "player" && ["active", "suspended"].includes(item.status),
  );
  assert.ok(shift);
  healthy(town);
  return shift.id;
}

function serve(town, id, kind = "start") {
  ok(startCoffeeRoutine(town, makeCoffeeCommand(town, "player", kind, { targetId: id })));
  healthy(town);
}

function meetingAction(town, actor, kind) {
  const session = town.discussions.sessions.at(-1);
  const member = session.members.find((item) => item.id === actor);
  ok(
    discussion.applyDiscussionCommand(town, actor, {
      kind,
      meetingId: session.id,
      expectedRevision: member.revision,
      commandId: `coffee-week:${session.id}:${actor}:${kind}:${member.revision}`,
    }),
  );
  healthy(town);
}

function reload(town) {
  const retained = (value) => ({
    identity: value.identityRegistry,
    favors: value.favors,
    money: value.agents.map(({ id, money }) => ({ id, money })),
    tills: value.tills,
    economy: value.economy,
    orders: value.coffee.orders,
    cups: value.coffee.cups,
    manuscript: value.physicalItems?.items,
  });
  const before = structuredClone(retained(town));
  const restored = readTownFile(exportTown(town));
  assert.equal(restored.status, "ready", restored.reason);
  assert.deepEqual(retained(restored.town), before, "Reload preserves every financial/item record");
  assert.ok(restored.town.coffee.routines.every((routine) => routine.status !== "active"));
  healthy(restored.town);
  return restored.town;
}

test("seven-day mixed town reconciles real work, refunds, witnessed reading and retained cups through daily reload", (t) => {
  let town = createTown("Week visitor");
  // Only the initial placement is a teleport; later human movement is
  // synthetic adjacent input. No progress, coins or receipts are injected.
  person(town, "player").tile = { ...ANCHORS.library };
  ok(coffee(town, "enable"));
  ok(physical.initializePhysicalItems(town));
  const identity = structuredClone(town.identityRegistry);
  const checkpoints = [];
  const finishDay = () => {
    at(town, 1439);
    town = reload(town);
    checkpoints.push({
      day: town.day,
      playerCoins: person(town, "player").money,
      orders: town.coffee.orders.length,
      cups: town.coffee.cups.length,
      debts: town.favors.length,
      paidWages: town.economy.work.payables.filter((item) => item.status === "settled").length,
    });
    const retainedDebts = structuredClone(town.favors);
    tick(town, 1);
    assert.deepEqual(town.identityRegistry, identity);
    assert.deepEqual(
      town.favors,
      retainedDebts,
      "Midnight preserves the actual town's recorded debts",
    );
  };

  // Day one: useful paid work, Northern's actual lookup and manuscript journey,
  // then a witnessed park reading before the already-funded human café shift.
  lib(town, "accept", "reference");
  for (const key of [
    "card:kevin",
    "box:Birch",
    "box:Alder",
    "box:Cedar",
    "card:equipment",
    "card:dorm",
  ])
    lib(town, "inspect", key);
  lib(town, "report", "reference");
  lib(town, "request", "source");
  lib(town, "submit", "player");
  lib(town, "test", "");
  until(
    town,
    () => town.economy.projects.library.lookup.status === "done",
    150,
    "Real lookup finishes",
  );
  assert.equal(town.economy.projects.library.lookup.result, "success");
  assert.equal(person(town, "player").money, 6, "Library pay comes from its funded project");
  ok(physical.startPhysicalSession(town, "northern"));
  let manuscript = town.physicalItems.items[0];
  ok(
    physical.applyPhysicalCommand(town, "northern", {
      kind: "bring",
      itemId: manuscript.id,
      itemRevision: manuscript.revision,
      destination: "park",
    }),
  );
  const journeyStart = { ...person(town, "northern").tile };
  until(
    town,
    () => !town.physicalItems.session.intent,
    180,
    "Northern carries the manuscript to the park",
  );
  assert.notDeepEqual(person(town, "northern").tile, journeyStart);
  manuscript = town.physicalItems.items[0];
  assert.deepEqual(manuscript.location, { kind: "held", holder: "northern" });
  ok(
    physical.applyPhysicalCommand(town, "northern", {
      kind: "write",
      itemId: manuscript.id,
      itemRevision: manuscript.revision,
      title: "A week in town",
      text: "The cup can wait. The town remembers what we actually did.",
    }),
  );
  physical.stopPhysicalSession(town);
  lib(town, "evening-plan", "park");
  const gathering = library.libraryView(town).story.gathering;
  walk(town, gathering.tile);
  until(
    town,
    () => town.economy.projects.library.evening.status === "ready",
    180,
    "Invited readers actually arrive",
  );
  lib(town, "evening-join");
  assert.equal(town.economy.projects.library.evening.attendedByPlayer, true);
  const witnessedReading = structuredClone(town.economy.projects.library.evening);
  walk(town, { x: 9, y: 20 });
  at(town, 959);
  const firstShift = acceptShift(town);
  at(town, 960);
  const firstWageOpening = person(town, "player").money;
  serve(town, firstShift);
  at(town, 1140);
  assert.equal(agreement(town, firstShift).eligibleMinutes, 180);
  assert.equal(person(town, "player").money, firstWageOpening + 5);
  assert.equal(
    town.economy.work.payables.filter((item) => item.agreementId === firstShift).length,
    1,
  );
  finishDay();

  // Day two: cancel twelve real preparation minutes, preserving the separately
  // funded wage. A second actual cup remains owned on the counter overnight.
  walk(town, { x: 7, y: 19 });
  at(town, 960);
  ok(requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")));
  until(
    town,
    () => coffeeEligibleWorkers(town, "player").includes("northern"),
    60,
    "Consenting staff actually arrive at the café",
  );
  const beforeOrderMoney = person(town, "player").money;
  const cancelledId = ok(coffee(town, "buy")).value.orderId;
  walk(town, { x: 8, y: 20 });
  until(
    town,
    () => order(town, cancelledId).brewMinutes === 12,
    100,
    "Actual brew reaches twelve minutes",
  );
  const staffing = town.coffee.routines.find((item) => item.worker === "northern");
  const wageHold = agreement(town, staffing.agreementId).holdId;
  const wageBeforeRefund = structuredClone(agreement(town, staffing.agreementId));
  const refundCommand = makeCoffeeCommand(town, "player", "cancel", { targetId: cancelledId });
  ok(applyCoffeeAction(town, refundCommand));
  assert.equal(order(town, cancelledId).phase, "refunded");
  assert.equal(person(town, "player").money, beforeOrderMoney);
  assert.deepEqual(agreement(town, staffing.agreementId), wageBeforeRefund);
  assert.equal(town.economy.holds.find((hold) => hold.id === wageHold).remaining, 5);
  const afterRefund = exportTown(town);
  assert.equal(applyCoffeeAction(town, refundCommand).replayed, true);
  assert.equal(exportTown(town), afterRefund);
  walk(town, { x: 7, y: 19 });
  const keptOrderId = ok(coffee(town, "buy")).value.orderId;
  walk(town, { x: 8, y: 20 });
  until(
    town,
    () => order(town, keptOrderId).phase === "ready",
    120,
    "Actual replacement cup becomes ready",
  );
  const keptCupId = town.coffee.cups.find((cup) => cup.orderId === keptOrderId).id;
  walk(town, { x: 7, y: 19 });
  ok(coffee(town, "collect", keptOrderId));
  const finalOrderId = ok(coffee(town, "buy")).value.orderId;
  walk(town, { x: 8, y: 20 });
  until(
    town,
    () => order(town, finalOrderId).phase === "ready",
    1140 - town.minute,
    "A second owned cup is prepared while the original shift is still funded",
  );
  finishDay();

  // Day three: the collected cup and separate counter cup both survive. An
  // accepted meeting blocks service until closed; Stop preserves wage rights.
  assert.equal(town.coffee.cups.find((cup) => cup.id === keptCupId).custody, "inventory");
  walk(town, { x: 9, y: 20 });
  at(town, 959);
  const interruptedShift = acceptShift(town);
  ok(discussion.createLibraryDiscussion(town, "A voluntary visit after work", "arwyn"));
  at(town, 960);
  const beforeConflict = exportTown(town);
  const blocked = startCoffeeRoutine(
    town,
    makeCoffeeCommand(town, "player", "start", { targetId: interruptedShift }),
  );
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /meeting/i);
  assert.equal(exportTown(town), beforeConflict);
  meetingAction(town, "player", "close");
  serve(town, interruptedShift);
  tick(town, 12);
  ok(
    pauseCoffeeRoutine(
      town,
      makeCoffeeCommand(town, "player", "pause", { targetId: interruptedShift }),
    ),
  );
  const attendanceAtStop = agreement(town, interruptedShift).eligibleMinutes;
  tick(town, 7);
  assert.equal(agreement(town, interruptedShift).eligibleMinutes, attendanceAtStop);
  serve(town, interruptedShift, "resume");
  at(town, 1140);
  assert.ok(agreement(town, interruptedShift).eligibleMinutes < 180);
  assert.equal(
    town.economy.holds.find((hold) => hold.id === agreement(town, interruptedShift).holdId)
      .remaining,
    5,
  );
  finishDay();

  // Day four: a drink kept across two reloads remains usable exactly once.
  // Leave the human's interrupted wage reserved, and resume Northern's prior
  // late-start unit instead of manufacturing another funded staffing offer.
  const drinkCommand = makeCoffeeCommand(town, "player", "drink", { targetId: keptCupId });
  const beforeDrinkMoney = person(town, "player").money;
  ok(applyCoffeeAction(town, drinkCommand));
  const afterDrink = exportTown(town);
  assert.equal(applyCoffeeAction(town, drinkCommand).replayed, true);
  assert.equal(exportTown(town), afterDrink);
  assert.equal(coffee(town, "drink", keptCupId).ok, false);
  assert.equal(person(town, "player").money, beforeDrinkMoney);
  assert.equal(town.coffee.cups.find((cup) => cup.id === keptCupId).custody, "consumed");
  at(town, 960);
  ok(requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")));
  until(
    town,
    () => agreement(town, staffing.agreementId).status === "completed",
    180,
    "Northern finishes his original retained wage",
  );
  assert.equal(
    town.economy.work.payables.filter((item) => item.agreementId === staffing.agreementId).length,
    1,
  );
  assert.equal(person(town, "player").money, beforeDrinkMoney);
  finishDay();

  // A return visit uses the preserved useful result and manuscript; no repeat
  // payment, forced purchase, erased cup or artificial income fills quiet days.
  walk(town, ANCHORS.library);
  assert.equal(town.economy.projects.library.lookup.result, "success");
  assert.deepEqual(town.economy.projects.library.evening, witnessedReading);
  assert.match(town.physicalItems.items[0].text, /The cup can wait/);
  const completedPayments = structuredClone(town.economy.work.payables);
  finishDay();
  tick(town, 240);
  assert.deepEqual(town.economy.work.payables, completedPayments);
  finishDay();

  // Last admission day: return to the still-owned counter cup, with the
  // interrupted human wage retained. No automatic staffing or cup expiry
  // makes capacity or funds appear just because another day has elapsed.
  walk(town, { x: 7, y: 19 });
  at(town, 960);
  assert.equal(order(town, finalOrderId).phase, "ready");
  const noNewOrder = exportTown(town);
  assert.equal(coffee(town, "buy").ok, false);
  assert.equal(exportTown(town), noNewOrder);
  finishDay();
  assert.equal(town.day, 8);
  assert.match(coffeeAdmissionReason(town), /closed/);
  assert.equal(order(town, finalOrderId).phase, "ready");
  assert.equal(town.coffee.cups.find((cup) => cup.orderId === finalOrderId).custody, "counter");
  assert.ok(agreement(town, interruptedShift).eligibleMinutes > 0);
  assert.ok(agreement(town, interruptedShift).eligibleMinutes < 180);
  assert.equal(
    town.economy.holds.find((hold) => hold.id === agreement(town, interruptedShift).holdId)
      .remaining,
    5,
  );
  assert.equal(
    town.economy.work.payables.filter((item) => item.agreementId === interruptedShift).length,
    0,
  );
  const closed = exportTown(town);
  assert.equal(coffee(town, "buy").ok, false);
  assert.equal(exportTown(town), closed);
  town = reload(town);
  assert.equal(checkpoints.length, 7);
  t.diagnostic(JSON.stringify({ checkpoints, totalCoins: total(town), liveInferenceCalls: 0 }));
});

test("an earlier manuscript journey blocks café staffing and finishes without losing custody", () => {
  const town = createTown("Commitment visitor");
  town.minute = 960;
  person(town, "player").tile = { x: 8, y: 19 };
  person(town, "northern").tile = { ...ANCHORS.library };
  ok(coffee(town, "enable"));
  ok(physical.initializePhysicalItems(town));
  ok(physical.startPhysicalSession(town, "northern"));
  const manuscript = town.physicalItems.items[0];
  ok(
    physical.applyPhysicalCommand(town, "northern", {
      kind: "bring",
      itemId: manuscript.id,
      itemRevision: manuscript.revision,
      destination: "park",
    }),
  );
  assert.match(coffeeCommitmentReason(town, "northern"), /manuscript/i);
  const before = exportTown(town);
  const rejected = requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request"));
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /manuscript/i);
  assert.equal(exportTown(town), before);
  until(
    town,
    () => !town.physicalItems.session.intent,
    180,
    "Prior manuscript journey finishes normally",
  );
  assert.deepEqual(town.physicalItems.items[0].location, { kind: "held", holder: "northern" });
  healthy(town);
});
