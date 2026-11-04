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
const { applyCoffeeAction, makeCoffeeCommand, settleCoffeeRefunds } = await load("coffee");
const { validateCoffee } = await load("coffee-validation");
const { requestCoffeeStaff } = await load("coffee-residents");
const { beforeCoffeePayroll, afterCoffeePayroll } = await load("coffee-runtime");
const { activateFundedTown, advanceFundedPayroll } = await load("payroll-runtime");
const { approveLibraryContribution, fundLibraryProject, settleWorkPayable } =
  await load("funded-work");
const { auditEconomy, availableFunds, runEconomyCommand, transferFunds } = await load("economy");
const { exportTown, readTownFile } = await load("save");
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const order = (town, id) => town.coffee.orders.find((item) => item.id === id);
const hold = (town, id) => town.economy.holds.find((item) => item.id === id);
const payable = (town, id) => town.economy.work.payables.find((item) => item.id === id);
const agreement = (town, id) => town.economy.work.agreements.find((item) => item.id === id);
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const sim = (id, kind, actor, terms = {}) => ({ id, kind, actor, authority: "simulation", terms });
const ok = (result) => {
  assert.equal(result.ok, true, result.reason ?? result.message ?? result.reply);
  return result;
};
const coffee = (town, kind, targetId) =>
  applyCoffeeAction(town, makeCoffeeCommand(town, "player", kind, targetId ? { targetId } : {}));

function healthy(town) {
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateCoffee(town), []);
  const opening = Object.values(town.economy.openingBalances).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  assert.equal(total(town), opening, "Only existing fixture coins move between accounts");
  assert.ok(town.economy.transactions.every((item) => item.kind === "transfer"));
}

function tick(town, count = 1) {
  for (let minute = 0; minute < count; minute++) {
    advanceTown(town, 1);
    healthy(town);
  }
}

function until(town, predicate, limit, description) {
  for (let minute = 0; minute < limit && !predicate(); minute++) tick(town);
  assert.ok(predicate(), `${description}: day ${town.day}, minute ${town.minute}`);
}

// Synthetic opening balances and labelled legacy records are set before the
// immutable ledger snapshot. They are test conditions, not ordinary income or
// a proposed subsidy. All later work/progress/payments use actual source APIs.
function fixture({ fullPurses = false, oldKevin = false, cafe = 22 } = {}) {
  const town = createTown("Payroll visitor");
  town.minute = 960;
  town.tills.cafe = cafe;
  for (const actor of town.agents) {
    actor.tile = { ...actor.home };
    actor.path = [];
  }
  person(town, "player").tile = { x: 7, y: 19 };
  person(town, "kevin").tile = { x: 9, y: 19 };
  person(town, "northern").tile = { x: 8, y: 18 };
  if (fullPurses) {
    person(town, "player").money = 999;
    person(town, "northern").money = 999;
  }
  if (oldKevin) {
    person(town, "kevin").shiftHours = 3;
    person(town, "kevin").paidToday = false;
    if (oldKevin === "full-purse") person(town, "kevin").money = 999;
  }
  ok(activateFundedTown(town));
  ok(coffee(town, "enable"));
  healthy(town);
  return town;
}

function staff(town) {
  ok(requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")));
  const routine = town.coffee.routines.find((item) => item.worker === "northern");
  assert.ok(routine);
  healthy(town);
  return routine.agreementId;
}

function transfer(town, id, actor, from, to, amount) {
  const request = sim(id, "test-fixture-transfer", actor, { from, to, amount });
  ok(
    runEconomyCommand(town, request, (draft, context) => {
      transferFunds(draft, context, {
        id: `${id}:transfer`,
        from,
        to,
        amount,
        purpose: "Disclosed transfer of existing fixture cash to create actual purse capacity",
      });
      return { from, to, amount };
    }),
  );
  healthy(town);
  return request;
}

function rejectUnchanged(town, attempt, description) {
  const before = exportTown(town);
  const rejected = attempt();
  assert.equal(rejected.ok, false, description);
  assert.equal(exportTown(town), before, description);
  healthy(town);
  return rejected;
}

function priorHolds(town, before, changed = []) {
  for (const item of before)
    if (!changed.includes(item.id)) assert.deepEqual(hold(town, item.id), item);
}

function reload(town) {
  const projection = (value) => ({
    opening: value.economy.openingBalances,
    identity: value.identityRegistry,
    money: value.agents.map(({ id, money }) => ({ id, money })),
    tills: value.tills,
    transactions: value.economy.transactions,
    holds: value.economy.holds,
    claims: value.economy.work.legacyClaims,
    payables: value.economy.work.payables,
    receipts: value.economy.work.receipts,
    attendance: value.economy.work.agreements.map(({ id, eligibleMinutes, attendance }) => ({
      id,
      eligibleMinutes,
      attendance,
    })),
    orders: value.coffee.orders,
    cups: value.coffee.cups,
  });
  const before = structuredClone(projection(town));
  const result = readTownFile(exportTown(town));
  assert.equal(result.status, "ready", result.reason);
  assert.deepEqual(projection(result.town), before);
  assert.ok(result.town.coffee.routines.every((item) => item.status !== "active"));
  healthy(result.town);
  return result.town;
}

function projectApprovals(town, projectId) {
  return [
    ["kevin", "till:cafe"],
    ["baba", "till:grocery"],
  ].map(([donor, account]) => {
    const approval = {
      id: `${projectId}:${donor}`,
      projectId,
      donor,
      account,
      amount: 4,
      expires: { day: town.day + 1, minute: town.minute },
    };
    ok(
      approveLibraryContribution(
        town,
        sim(`${approval.id}:approve`, "approve-library-contribution", donor, approval),
        approval,
      ),
    );
    return approval.id;
  });
}

function fundProject(town, id, projectId, approvalIds) {
  return fundLibraryProject(
    town,
    sim(id, "fund-library-project", "kevin", { projectId, approvalIds }),
    projectId,
    approvalIds,
  );
}

test("ready release and an interleaved library commit preserve an older blocked wage and the final coffee attendance interval", () => {
  let town = fixture({ oldKevin: "full-purse", cafe: 13 });
  const oldClaim = town.economy.work.legacyClaims.find((item) => item.worker === "kevin");
  assert.equal(oldClaim.classification, "completed-unpaid");
  assert.equal(oldClaim.resolution, "protected");
  const oldClaimBefore = structuredClone(oldClaim);
  const oldHold = structuredClone(hold(town, oldClaim.holdId));
  const shiftId = staff(town);
  const wageHold = structuredClone(hold(town, agreement(town, shiftId).holdId));
  const orderId = ok(coffee(town, "buy")).value.orderId;
  const approvals = projectApprovals(town, "interleaved-library");
  assert.equal(availableFunds(town, "till:cafe"), 3);
  rejectUnchanged(
    town,
    () => fundProject(town, "library-before-ready", "interleaved-library", approvals),
    "Refundable coffee cannot finance a discretionary library contribution",
  );
  until(
    town,
    () => order(town, orderId).placeMinutes === 9,
    70,
    "Real navigation, brewing and nine placement minutes complete",
  );
  assert.equal(order(town, orderId).phase, "placing");
  const before = {
    minute: town.minute,
    attended: agreement(town, shiftId).eligibleMinutes,
    cash: town.tills.cafe,
    transactions: town.economy.transactions.length,
  };
  const finalStamp = `${town.day}:${town.minute}`;

  // Deliberately split the documented core interval at its actual API seam:
  // coffee work -> unrelated ledger commit -> payroll -> normal clock step.
  // No contribution, progress or attendance record is written by the fixture.
  const worked = beforeCoffeePayroll(town);
  assert.equal(worked.ok, true);
  assert.ok(worked.worked.has("northern"));
  assert.equal(order(town, orderId).phase, "ready");
  assert.equal(availableFunds(town, "till:cafe"), 5);
  assert.equal(
    town.tills.cafe,
    before.cash,
    "Ready releases its existing hold, without another sale",
  );
  assert.equal(town.economy.transactions.length, before.transactions);
  ok(fundProject(town, "library-after-ready", "interleaved-library", approvals));
  advanceFundedPayroll(town);
  assert.equal(afterCoffeePayroll(town), true);
  tick(town);
  assert.equal(town.minute, before.minute + 1);
  assert.equal(agreement(town, shiftId).eligibleMinutes, before.attended + 1);
  assert.equal(
    agreement(town, shiftId).attendance.filter((stamp) => stamp === finalStamp).length,
    1,
  );
  assert.equal(order(town, orderId).brewMinutes, 20);
  assert.equal(order(town, orderId).placeMinutes, 10);
  assert.equal(town.coffee.cups.filter((item) => item.orderId === orderId).length, 1);
  assert.equal(
    order(town, orderId).contributions.reduce((sum, part) => sum + part.end - part.start, 0),
    30,
  );
  assert.equal(town.economy.transactions.filter((item) => item.agreementId === orderId).length, 1);
  assert.deepEqual(hold(town, oldHold.id), oldHold);
  assert.deepEqual(hold(town, wageHold.id), wageHold);
  assert.deepEqual(
    town.economy.work.legacyClaims.find((item) => item.id === oldClaim.id),
    oldClaimBefore,
  );
  assert.equal(payable(town, `payable:${oldClaim.id}`).status, "earned");
  assert.equal(town.economy.projectBalances["project:interleaved-library"], 8);
  assert.equal(availableFunds(town, "till:cafe"), 1);
  const funded = exportTown(town);
  assert.equal(
    fundProject(town, "library-after-ready", "interleaved-library", approvals).replayed,
    true,
  );
  assert.equal(exportTown(town), funded);
  town = reload(town);
  assert.deepEqual(hold(town, oldHold.id), oldHold);
});

test("an underfunded older wage rejects new coffee and takes newly contributed existing cash first", () => {
  let town = fixture({ oldKevin: true, cafe: 4 });
  const claim = () => town.economy.work.legacyClaims.find((item) => item.worker === "kevin");
  assert.equal(claim().classification, "completed-unpaid");
  assert.equal(claim().resolution, "underfunded");
  const evidence = structuredClone(claim().evidence);
  const unchangedHolds = structuredClone(town.economy.holds);
  rejectUnchanged(
    town,
    () => requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")),
    "Old underfunded payroll blocks new staffing",
  );
  rejectUnchanged(town, () => coffee(town, "buy"), "Old underfunded payroll blocks new coffee");
  town = reload(town);
  const before = person(town, "kevin").money;
  transfer(town, "one-existing-employer-coin", "kevin", "agent:kevin", "till:cafe", 1);
  ok(activateFundedTown(town));
  assert.equal(claim().resolution, "protected");
  assert.equal(hold(town, claim().holdId).remaining, 5);
  assert.equal(availableFunds(town, "till:cafe"), 0);
  priorHolds(town, unchangedHolds);
  advanceFundedPayroll(town);
  assert.equal(claim().resolution, "settled");
  assert.equal(person(town, "kevin").money, before - 1 + 5);
  assert.equal(town.tills.cafe, 0);
  assert.deepEqual(claim().evidence, evidence);
  assert.equal(
    town.economy.transactions.filter((item) => item.agreementId === claim().id).length,
    1,
  );
  rejectUnchanged(
    town,
    () => requestCoffeeStaff(town, makeCoffeeCommand(town, "player", "staff-request")),
    "Settling old work does not create money for a new shift",
  );
  const settled = exportTown(town);
  advanceFundedPayroll(town);
  assert.equal(exportTown(town), settled);
  reload(town);
});

for (const first of ["refund", "wage"])
  test(`full purses retain separate earned wage and refund through reload; ${first} settles first`, () => {
    let town = fixture({ fullPurses: true });
    const opening = total(town);
    assert.equal(
      opening,
      2082,
      "This deliberately enlarged opening is a synthetic capacity fixture",
    );
    const shiftId = staff(town);
    const orderId = ok(coffee(town, "buy")).value.orderId;
    const staleCancel = makeCoffeeCommand(town, "player", "cancel", { targetId: orderId });
    // Filling the purchaser uses two existing Baba coins, not a balance edit.
    transfer(town, "fill-buyer-purse", "baba", "agent:baba", "agent:player", 2);
    person(town, "player").tile = { x: 8, y: 19 }; // labelled synthetic manual adjacent input
    until(
      town,
      () => order(town, orderId).brewMinutes === 12,
      60,
      "Twelve actual preparation minutes accrue",
    );
    rejectUnchanged(
      town,
      () => applyCoffeeAction(town, staleCancel),
      "An old cancellation revision cannot mutate progress or money",
    );
    const cancellation = makeCoffeeCommand(town, "player", "cancel", { targetId: orderId });
    ok(applyCoffeeAction(town, cancellation));
    assert.equal(order(town, orderId).phase, "refund-pending");
    assert.equal(order(town, orderId).assignedAgreementId, null);
    const refundHoldId = order(town, orderId).holdId;
    assert.equal(hold(town, refundHoldId).remaining, 2);
    assert.equal(
      town.coffee.cups.some((item) => item.orderId === orderId),
      false,
    );
    until(
      town,
      () => agreement(town, shiftId).status === "completed",
      180,
      "The actual 180-minute funded shift finishes",
    );
    const wage = town.economy.work.payables.find((item) => item.agreementId === shiftId);
    const wageId = wage.id;
    const wageHoldId = wage.holdId;
    assert.equal(wage.status, "earned");
    assert.equal(agreement(town, shiftId).eligibleMinutes, 180);
    assert.equal(hold(town, wageHoldId).remaining, 5);
    assert.equal(person(town, "northern").money, 999);
    assert.equal(person(town, "player").money, 999);
    town = reload(town);
    const allHolds = structuredClone(town.economy.holds);
    const claims = structuredClone(town.economy.work.legacyClaims);
    const pending = exportTown(town);
    settleCoffeeRefunds(town);
    advanceFundedPayroll(town);
    assert.equal(
      exportTown(town),
      pending,
      "Repeated full-purse retries do not append empty accounting",
    );
    rejectUnchanged(
      town,
      () =>
        settleWorkPayable(
          town,
          sim("wrong-wage-issuer", "settle-work-payable", "baba", { payableId: wageId }),
          wageId,
        ),
      "A different issuer cannot spend the wage hold",
    );

    const settlement = sim("settle-original-wage", "settle-work-payable", "kevin", {
      payableId: wageId,
    });
    const settle = (kind) => {
      if (kind === "refund") {
        transfer(town, "buyer-creates-room", "player", "agent:player", "agent:baba", 2);
        settleCoffeeRefunds(town);
        assert.equal(order(town, orderId).phase, "refunded");
        assert.equal(person(town, "player").money, 999);
        assert.equal(hold(town, refundHoldId).remaining, 0);
        assert.equal(
          town.economy.transactions.filter((item) => item.id === order(town, orderId).refundId)
            .length,
          1,
        );
      } else {
        transfer(town, "worker-creates-room", "northern", "agent:northern", "agent:kevin", 5);
        ok(settleWorkPayable(town, settlement, wageId));
        assert.equal(payable(town, wageId).status, "settled");
        assert.equal(person(town, "northern").money, 999);
        assert.equal(hold(town, wageHoldId).remaining, 0);
        assert.equal(
          town.economy.transactions.filter(
            (item) => item.id === payable(town, wageId).transactionId,
          ).length,
          1,
        );
      }
      healthy(town);
      assert.deepEqual(town.economy.work.legacyClaims, claims);
    };
    settle(first);
    const settledHold = first === "refund" ? refundHoldId : wageHoldId;
    priorHolds(town, allHolds, [settledHold]);
    assert.equal(
      first === "refund" ? payable(town, wageId).status : order(town, orderId).phase,
      first === "refund" ? "earned" : "refund-pending",
    );
    town = reload(town);
    settle(first === "refund" ? "wage" : "refund");
    priorHolds(town, allHolds, [refundHoldId, wageHoldId]);
    const completed = exportTown(town);
    assert.equal(applyCoffeeAction(town, cancellation).replayed, true);
    assert.equal(settleWorkPayable(town, settlement, wageId).replayed, true);
    settleCoffeeRefunds(town);
    advanceFundedPayroll(town);
    assert.equal(
      exportTown(town),
      completed,
      "Both independently settled liabilities replay without another payment",
    );
    rejectUnchanged(
      town,
      () =>
        settleWorkPayable(
          town,
          { ...settlement, terms: { payableId: "different-payable" } },
          "different-payable",
        ),
      "A reused wage command cannot target another payable",
    );
    rejectUnchanged(
      town,
      () => applyCoffeeAction(town, { ...cancellation, targetId: "different-order" }),
      "A reused refund command cannot target another ticket",
    );
    assert.equal(
      town.economy.transactions.filter((item) => item.agreementId === orderId).length,
      2,
      "One purchase and one full refund, with no cup",
    );
    assert.equal(
      town.coffee.cups.some((item) => item.orderId === orderId),
      false,
    );
    assert.equal(total(town), opening);
    reload(town);
  });
