import assert from "node:assert/strict";

/**
 * A synthetic opening/time/pose fixture followed by genuine guarded service,
 * attendance and transfers. Both full purses are declared before the immutable
 * ledger snapshot; no progress, hold, payable, cup or coin is injected later.
 */
export async function createCoffeeRecoveryFixture(load) {
  const { createTown } = await load("town");
  const { advanceTown } = await load("sim");
  const { applyCoffeeAction, makeCoffeeCommand } = await load("coffee");
  const { validateCoffee } = await load("coffee-validation");
  const { requestCoffeeStaff } = await load("coffee-residents");
  const { startCoffeeRoutine, pauseCoffeeRoutine } = await load("coffee-runtime");
  const { activateFundedTown } = await load("payroll-runtime");
  const { playerActions, applyPlayerAction } = await load("effects");
  const { auditEconomy, runEconomyCommand, transferFunds } = await load("economy");
  const { findPath } = await load("path");
  const { walkable } = await load("world");
  const who = (town, id) => town.agents.find((actor) => actor.id === id);
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
  const town = createTown("Recovery visitor");
  town.minute = 960;
  for (const actor of town.agents) {
    actor.tile = { ...actor.home };
    actor.path = [];
  }
  who(town, "player").tile = { x: 7, y: 19 };
  who(town, "kevin").tile = { x: 9, y: 19 };
  who(town, "northern").tile = { x: 8, y: 18 };
  who(town, "sub").tile = { x: 7, y: 20 };
  who(town, "northern").money = 999;
  who(town, "sub").money = 999;
  const openingCoins = total(town);
  assert.equal(openingCoins, 2081, "Disclosed full-purse opening, not ordinary 90-coin play");
  ok(activateFundedTown(town));
  const coffee = (actor, kind, targetId) =>
    applyCoffeeAction(town, makeCoffeeCommand(town, actor, kind, targetId ? { targetId } : {}));
  const healthy = () => {
    assert.deepEqual(auditEconomy(town), []);
    assert.deepEqual(validateCoffee(town), []);
    assert.equal(total(town), openingCoins);
    assert.equal(new Set(town.agents.map(({ tile }) => `${tile.x},${tile.y}`)).size, 10);
  };
  const tick = () => {
    advanceTown(town, 1);
    healthy();
  };
  const until = (predicate, limit, reason) => {
    for (let elapsed = 0; elapsed < limit && !predicate(); elapsed++) tick();
    assert.ok(predicate(), `${reason}: minute ${town.minute}`);
  };
  // Labelled adjacent source input exchanges the counter. This does not claim
  // actual keyboard/touch coverage and never teleports through an occupied tile.
  const walk = (actor, target) => {
    const resident = who(town, actor);
    const occupied = new Set(
      town.agents.filter((item) => item.id !== actor).map(({ tile }) => `${tile.x},${tile.y}`),
    );
    for (const next of findPath(resident.tile, target, occupied)) {
      assert.equal(Math.abs(next.x - resident.tile.x) + Math.abs(next.y - resident.tile.y), 1);
      assert.equal(walkable(next.x, next.y), true);
      assert.equal(occupied.has(`${next.x},${next.y}`), false);
      resident.tile = { ...next };
      resident.path = [];
    }
    assert.deepEqual(resident.tile, target);
  };
  ok(coffee("player", "enable"));
  ok(requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")));
  const earnedShiftId = town.coffee.routines.find((item) => item.worker === "northern").agreementId;
  const offer = playerActions(town, "kevin").find((item) =>
    item.label.startsWith("Accept cafe shift"),
  );
  assert.ok(offer && !offer.disabledReason, offer?.disabledReason);
  ok(applyPlayerAction(town, "kevin", offer.id));
  const partialShiftId = town.economy.work.agreements.find(
    (item) => item.worker === "player" && item.kind === "cafe-shift",
  ).id;
  ok(
    startCoffeeRoutine(
      town,
      makeCoffeeCommand(town, "player", "start", { targetId: partialShiftId }),
    ),
  );
  const readyOrderId = ok(coffee("player", "buy")).value.orderId;
  for (let minute = 0; minute < 20; minute++) tick();
  ok(
    pauseCoffeeRoutine(
      town,
      makeCoffeeCommand(town, "player", "pause", { targetId: partialShiftId }),
    ),
  );
  const partialMinutes = agreement(town, partialShiftId).eligibleMinutes;
  assert.equal(partialMinutes, 20);
  until(() => order(town, readyOrderId).phase === "ready", 80, "A real 20/10 cup is prepared");
  walk("player", { x: 8, y: 19 });
  walk("sub", { x: 7, y: 19 });
  const refundOrderId = ok(
    applyCoffeeAction(town, makeCoffeeCommand(town, "sub", "buy", { acceptLaterPickup: true })),
  ).value.orderId;
  const roomFill = {
    id: "recovery-fixture:fill-refund-purse",
    kind: "recovery-fixture-transfer",
    actor: "baba",
    authority: "simulation",
    terms: { from: "agent:baba", to: "agent:sub", amount: 2 },
  };
  ok(
    runEconomyCommand(town, roomFill, (draft, context) => {
      transferFunds(draft, context, {
        id: `${roomFill.id}:transfer`,
        from: "agent:baba",
        to: "agent:sub",
        amount: 2,
        purpose: "Disclosed existing fixture coins fill the buyer's purse before cancellation",
      });
      return { amount: 2 };
    }),
  );
  until(
    () => order(town, refundOrderId).brewMinutes === 12,
    60,
    "The second real order accrues twelve brewing minutes",
  );
  const cancellation = makeCoffeeCommand(town, "sub", "cancel", { targetId: refundOrderId });
  ok(applyCoffeeAction(town, cancellation));
  assert.equal(order(town, refundOrderId).phase, "refund-pending");
  until(
    () => agreement(town, earnedShiftId).status === "completed",
    180,
    "Northern actually completes all 180 attendance minutes",
  );
  const earnedPayable = town.economy.work.payables.find(
    (item) => item.agreementId === earnedShiftId,
  );
  assert.equal(earnedPayable.status, "earned");
  assert.equal(agreement(town, earnedShiftId).eligibleMinutes, 180);
  assert.equal(agreement(town, partialShiftId).status, "suspended");
  assert.equal(agreement(town, partialShiftId).eligibleMinutes, partialMinutes);
  assert.equal(order(town, readyOrderId).phase, "ready");
  assert.equal(town.coffee.cups.find((item) => item.orderId === readyOrderId).custody, "counter");
  assert.equal(who(town, "sub").money, 999);
  assert.equal(who(town, "northern").money, 999);
  assert.equal(town.coffee.orders.length, 2);
  town.paused = true;
  healthy();
  return {
    town,
    ids: {
      readyOrderId,
      readyCupId: town.coffee.cups.find((item) => item.orderId === readyOrderId).id,
      refundOrderId,
      refundHoldId: order(town, refundOrderId).holdId,
      partialShiftId,
      partialHoldId: agreement(town, partialShiftId).holdId,
      earnedShiftId,
      earnedPayableId: earnedPayable.id,
      earnedHoldId: earnedPayable.holdId,
    },
    openingCoins,
    partialMinutes,
    cancellation,
  };
}
