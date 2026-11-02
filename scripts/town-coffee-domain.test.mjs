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
const { activateFundedTown } = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const {
  approvePayrollAgreement,
  createFundedCafeAgreement,
  cafeAgreementTerms,
  CAFE_CANCELLATION,
  recordCafeAttendance,
} = await server.ssrLoadModule("/src/game/funded-work.ts");
const { auditEconomy, availableFunds, runEconomyCommand, transferFunds } =
  await server.ssrLoadModule("/src/game/economy.ts");
const {
  makeCoffeeCommand,
  applyCoffeeAction,
  completeCoffeeOrder,
  settleCoffeeRefunds,
  coffeeActionReason,
  coffeeNpcBudget,
  coffeeView,
  validateCoffee,
} = await server.ssrLoadModule("/src/game/coffee.ts");
const { exportTown, readTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { forkTown } = await server.ssrLoadModule("/src/game/identity.ts");
const { startCoffeeRoutine, pauseCoffeeRoutine } = await server.ssrLoadModule(
  "/src/game/coffee-runtime.ts",
);
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const person = (t, id) => t.agents.find((a) => a.id === id);
const cash = (t) =>
  t.agents.reduce((n, a) => n + a.money, 0) +
  t.tills.cafe +
  t.tills.grocery +
  Object.values(t.economy.projectBalances).reduce((n, v) => n + v, 0);
const command = (kind, actor, terms, id = kind) => ({
  id,
  kind,
  actor,
  authority: "simulation",
  terms,
});
const apply = (town, kind, targetId, options = {}) =>
  applyCoffeeAction(town, makeCoffeeCommand(town, "player", kind, { targetId, ...options }));
const assertOk = (r) => {
  assert.equal(r.ok, true, r.reason);
  return r.value;
};

// Finance/domain fixture: approvals and payroll use actual source APIs. The
// fixture sets physical poses directly; real navigation has its own suite.
function fixture({ buyerMoney = 4, cafeMoney = 22 } = {}) {
  const town = createTown("Coffee tester");
  person(town, "player").money = buyerMoney;
  town.tills.cafe = cafeMoney;
  town.minute = 960;
  person(town, "player").tile = { x: 7, y: 19 };
  person(town, "northern").tile = { x: 5, y: 18 };
  assert.equal(activateFundedTown(town).ok, true);
  assertOk(apply(town, "enable"));
  if (cafeMoney < 10) return town;
  const approval = {
    id: "test:coffee-approval",
    kind: "cafe-replacement",
    worker: "northern",
    payer: "till:cafe",
    issuer: "kevin",
    claimId: null,
    confirmedMinutes: 0,
    fee: 5,
    requiredMinutes: 180,
    expires: { day: 1, minute: 1139 },
    cancellation: CAFE_CANCELLATION,
  };
  assertOk(
    approvePayrollAgreement(
      town,
      command("approve-payroll-agreement", "kevin", approval),
      approval,
    ),
  );
  assertOk(
    createFundedCafeAgreement(
      town,
      command(
        "accept-funded-cafe-shift",
        "northern",
        cafeAgreementTerms("test:shift", "northern", approval.id),
      ),
      "test:shift",
      "northern",
      approval.id,
    ),
  );
  town.coffee.routines.push({
    worker: "northern",
    agreementId: "test:shift",
    status: "active",
    controlDay: 1,
    stopAfterCurrent: false,
    orderId: null,
    lastInterval: null,
    revision: 0,
    reason: null,
  });
  assert.deepEqual(auditEconomy(town), []);
  return town;
}
function buy(town, who = "player") {
  for (const other of town.agents)
    if (other.id !== who && other.tile.x === 7 && other.tile.y === 19) other.tile = { x: 8, y: 18 };
  person(town, who).tile = { x: 7, y: 19 };
  return assertOk(
    applyCoffeeAction(town, makeCoffeeCommand(town, who, "buy", { acceptLaterPickup: true })),
  ).orderId;
}
function work(town, orderId, count, { ready = true } = {}) {
  for (let index = 0; index < count; index++) {
    let order = town.coffee.orders.find((o) => o.id === orderId);
    const routine = town.coffee.routines.find((r) => r.agreementId === "test:shift");
    if (order.phase === "queued") {
      order.phase = "brewing";
      order.pickupSlot = town.coffee.orders.some((o) => o.pickupSlot === 0) ? 1 : 0;
      order.assignedAgreementId = "test:shift";
      order.assignmentRevision++;
      routine.orderId = orderId;
    }
    const phase = order.brewMinutes < 20 ? "brewing" : "placing";
    person(town, "northern").tile = phase === "brewing" ? { x: 5, y: 18 } : { x: 6, y: 18 };
    const now = (town.day - 1) * 1440 + town.minute;
    const last = order.contributions.at(-1);
    if (last?.phase === phase && last.end === now) last.end++;
    else
      order.contributions.push({
        worker: "northern",
        agreementId: "test:shift",
        phase,
        start: now,
        end: now + 1,
      });
    if (phase === "brewing") order.brewMinutes++;
    else order.placeMinutes++;
    if (order.brewMinutes === 20) order.phase = "placing";
    order.revision++;
    town.coffee.revision++;
    routine.lastInterval = now;
    if (order.placeMinutes === 10 && ready)
      assertOk(completeCoffeeOrder(town, orderId, "test:shift", order.assignmentRevision));
    assertOk(
      recordCafeAttendance(
        town,
        command(
          "record-cafe-attendance",
          "northern",
          { agreementId: "test:shift", day: town.day, minute: town.minute },
          `test:attendance:${town.day}:${town.minute}`,
        ),
        "test:shift",
      ),
    );
    town.minute++;
    assert.deepEqual(auditEconomy(town), []);
  }
}

test("ordinary coffee pays into café cash but cannot spend its separate refund reservation", () => {
  const town = fixture(),
    total = cash(town),
    free = availableFunds(town, "till:cafe"),
    wage = structuredClone(town.economy.work);
  const orderId = buy(town),
    order = town.coffee.orders.find((o) => o.id === orderId);
  assert.equal(town.tills.cafe, 24);
  assert.equal(person(town, "player").money, 2);
  assert.equal(availableFunds(town, "till:cafe"), free);
  assert.equal(town.economy.holds.find((h) => h.id === order.holdId).remaining, 2);
  assert.deepEqual(town.economy.work, wage);
  assert.equal(cash(town), total);
  assert.deepEqual(auditEconomy(town), []);
});

test("one actual ready transition releases receipt without new transfer; collect and drink each once", () => {
  const town = fixture(),
    total = cash(town),
    orderId = buy(town);
  const free = availableFunds(town, "till:cafe");
  work(town, orderId, 30);
  const order = town.coffee.orders.find((o) => o.id === orderId),
    cup = town.coffee.cups[0];
  assert.equal(order.phase, "ready");
  assert.equal(cup.owner, "player");
  assert.equal(cup.custody, "counter");
  assert.equal(availableFunds(town, "till:cafe"), free + 2);
  assert.equal(town.economy.transactions.filter((t) => t.agreementId === orderId).length, 1);
  assert.equal(town.economy.work.agreements.find((a) => a.id === "test:shift").eligibleMinutes, 30);
  const collect = makeCoffeeCommand(town, "player", "collect", { targetId: orderId });
  assertOk(applyCoffeeAction(town, collect));
  const afterCollect = JSON.stringify(town);
  assert.equal(applyCoffeeAction(town, collect).replayed, true);
  assert.equal(JSON.stringify(town), afterCollect);
  const drink = makeCoffeeCommand(town, "player", "drink", { targetId: cup.id });
  assertOk(applyCoffeeAction(town, drink));
  const afterDrink = JSON.stringify(town);
  assert.equal(applyCoffeeAction(town, drink).replayed, true);
  assert.equal(JSON.stringify(town), afterDrink);
  assert.equal(apply(town, "drink", cup.id).ok, false);
  assert.equal(town.coffee.cups[0].custody, "consumed");
  assert.equal(town.economy.holds.find((h) => h.id === "hold:test:shift").remaining, 5);
  assert.equal(cash(town), total);
  assert.deepEqual(auditEconomy(town), []);
});

test("partial preparation refunds all two coins and preserves accrued wage and all prior holds", () => {
  const town = fixture(),
    total = cash(town),
    orderId = buy(town);
  work(town, orderId, 12);
  assertOk(apply(town, "cancel", orderId));
  assert.equal(person(town, "player").money, 4);
  assert.equal(town.tills.cafe, 22);
  assert.equal(town.coffee.orders[0].phase, "refunded");
  assert.equal(town.coffee.orders[0].pickupSlot, null);
  assert.equal(town.coffee.routines[0].orderId, null);
  assert.equal(town.economy.work.agreements.find((a) => a.id === "test:shift").eligibleMinutes, 12);
  assert.equal(town.economy.holds.find((h) => h.id === "hold:test:shift").remaining, 5);
  assert.equal(town.coffee.cups.length, 0);
  assert.equal(cash(town), total);
  assert.equal(completeCoffeeOrder(town, orderId, "test:shift", 1).ok, false);
  assert.deepEqual(auditEconomy(town), []);
});

test("ready wins an old cancellation and stale/conflicting/wrong-world/model actions are unchanged", () => {
  const town = fixture(),
    orderId = buy(town);
  work(town, orderId, 29);
  const cancel = makeCoffeeCommand(town, "player", "cancel", { targetId: orderId });
  work(town, orderId, 1);
  const before = JSON.stringify(town);
  assert.equal(applyCoffeeAction(town, cancel).ok, false);
  const collect = makeCoffeeCommand(town, "player", "collect", { targetId: orderId });
  for (const bad of [
    { ...collect, worldId: "wrong-world" },
    { ...collect, authority: "model" },
    { ...collect, actor: "sub" },
    { ...collect, expectedRevision: 0 },
  ]) {
    assert.equal(applyCoffeeAction(town, bad).ok, false);
    assert.equal(JSON.stringify(town), before);
  }
  assertOk(applyCoffeeAction(town, collect));
  const after = JSON.stringify(town);
  assert.equal(applyCoffeeAction(town, { ...collect, targetId: "different" }).ok, false);
  assert.equal(JSON.stringify(town), after);
});

test("absent/full staff, self-service, debt and pending ticket prevent unsafe checkout", () => {
  const unfunded = fixture({ cafeMoney: 5 });
  assert.equal(apply(unfunded, "buy").ok, false);
  const town = fixture();
  person(town, "northern").tile = { x: 7, y: 19 };
  assert.equal(applyCoffeeAction(town, makeCoffeeCommand(town, "northern", "buy")).ok, false);
  person(town, "northern").tile = { x: 5, y: 18 };
  town.favors.push({
    id: "test:debt",
    from: "player",
    to: "baba",
    amount: 3,
    status: "owed",
    text: "Existing debt",
    day: 1,
  });
  assert.equal(apply(town, "buy").ok, false);
  town.favors.pop();
  buy(town);
  assert.equal(apply(town, "buy").ok, false);
  assert.deepEqual(auditEconomy(town), []);
});

test("full refund purse retains liability and retries only after real capacity changes", () => {
  const town = fixture({ buyerMoney: 999 }),
    total = cash(town),
    orderId = buy(town);
  const fill = {
    id: "test:fill",
    kind: "test:existing-transfer",
    actor: "baba",
    authority: "simulation",
    terms: {},
  };
  assertOk(
    runEconomyCommand(town, fill, (draft, context) => {
      transferFunds(draft, context, {
        id: "test:fill-transfer",
        from: "agent:baba",
        to: "agent:player",
        amount: 2,
        purpose: "Explicit test transfer of existing fixture cash",
      });
      return {};
    }),
  );
  assertOk(apply(town, "cancel", orderId));
  assert.equal(town.coffee.orders[0].phase, "refund-pending");
  assert.equal(town.economy.holds.find((h) => h.agreementId === orderId).remaining, 2);
  const before = JSON.stringify(town);
  settleCoffeeRefunds(town);
  settleCoffeeRefunds(town);
  assert.equal(JSON.stringify(town), before);
  assertOk(
    runEconomyCommand(town, { ...fill, id: "test:space", actor: "player" }, (draft, context) => {
      transferFunds(draft, context, {
        id: "test:space-transfer",
        from: "agent:player",
        to: "agent:baba",
        amount: 2,
        purpose: "Explicit test return of existing fixture cash",
      });
      return {};
    }),
  );
  settleCoffeeRefunds(town);
  assert.equal(town.coffee.orders[0].phase, "refunded");
  const after = JSON.stringify(town);
  settleCoffeeRefunds(town);
  assert.equal(JSON.stringify(town), after);
  assert.equal(cash(town), total);
  assert.deepEqual(auditEconomy(town), []);
});

test("actual save/import preserves cups and rejects missing or edited coffee ledger projection", () => {
  const town = fixture(),
    orderId = buy(town);
  work(town, orderId, 30);
  assertOk(apply(town, "collect", orderId));
  const raw = exportTown(town),
    loaded = readTownFile(raw);
  assert.equal(loaded.status, "ready", loaded.reason);
  assert.deepEqual(loaded.town.coffee.orders, town.coffee.orders);
  assert.deepEqual(loaded.town.coffee.cups, town.coffee.cups);
  const deleted = JSON.parse(raw);
  delete deleted.town.coffee;
  assert.notEqual(readTownFile(JSON.stringify(deleted)).status, "ready");
  const forged = JSON.parse(raw);
  forged.town.coffee.cups[0].custody = "consumed";
  forged.town.coffee.orders[0].phase = "consumed";
  forged.town.coffee.cups[0].revision = 2;
  assert(validateCoffee(forged.town).some((i) => i.includes("action receipt")));
  assert.notEqual(readTownFile(JSON.stringify(forged)).status, "ready");
  for (const corrupt of [
    null,
    {},
    { ...town.coffee, orders: [null] },
    { ...town.coffee, routines: [{}] },
  ])
    assert(validateCoffee({ ...town, coffee: corrupt }).length > 0);
});

test("world identity is checked before replay while fork keeps historical local coffee records", () => {
  const town = fixture(),
    buyCommand = makeCoffeeCommand(town, "player", "buy");
  assertOk(applyCoffeeAction(town, buyCommand));
  const fork = forkTown(town);
  const before = JSON.stringify(fork);
  assert.equal(applyCoffeeAction(fork, buyCommand).ok, false);
  assert.equal(JSON.stringify(fork), before);
  assert.deepEqual(validateCoffee(fork), []);
});

test("closed pilot refunds unready orders but keeps ready cups, wages and privacy", () => {
  const town = fixture(),
    orderId = buy(town);
  work(town, orderId, 12);
  town.coffee.enabled = false;
  settleCoffeeRefunds(town, true);
  assert.equal(town.coffee.orders[0].phase, "refunded");
  assert.equal(town.economy.holds.find((h) => h.id === "hold:test:shift").remaining, 5);
  const ready = fixture(),
    readyId = buy(ready);
  work(ready, readyId, 30);
  assert.equal(coffeeView(ready, "sub").counter.length, 0);
  ready.coffee.enabled = false;
  settleCoffeeRefunds(ready, true);
  assert.equal(ready.coffee.orders[0].phase, "ready");
  assertOk(apply(ready, "collect", readyId));
  assert.equal(coffeeView(ready, "sub").orders.length, 0);
  assert.equal(coffeeView(ready, "sub").cups.length, 0);
  assert.equal(coffeeActionReason(ready, "player", "buy"), "The coffee pilot is not open.");
  assert.deepEqual(auditEconomy(ready), []);
});

test("NPC discretionary allowance is existing money plus settled wages, never a daily reset", () => {
  const town = fixture();
  const orderId = buy(town, "sub");
  work(town, orderId, 30);
  assertOk(
    applyCoffeeAction(town, makeCoffeeCommand(town, "sub", "collect", { targetId: orderId })),
  );
  assert.equal(coffeeNpcBudget(town, "sub"), 0);
  town.day = 2;
  town.minute = 960;
  assert.equal(coffeeNpcBudget(town, "sub"), 0);
  assert.equal(applyCoffeeAction(town, makeCoffeeCommand(town, "sub", "buy")).ok, false);
});

test("fresh paused town can explicitly enable with staged payroll initialization; rejected enable is unchanged", () => {
  const town = createTown("Fresh coffee resident"),
    personRef = person(town, "player");
  assert.equal(coffeeView(town).canEnable, true);
  const invalid = { ...makeCoffeeCommand(town, "player", "enable"), authority: "model" };
  const before = JSON.stringify(town);
  assert.equal(applyCoffeeAction(town, invalid).ok, false);
  assert.equal(JSON.stringify(town), before);
  assertOk(apply(town, "enable"));
  assert(town.economy.work);
  assert.equal(town.coffee.openedDay, 1);
  assert.equal(person(town, "player"), personRef);
  assert.deepEqual(auditEconomy(town), []);
  assert.equal(cash(town), 90);
});

test("two uncollected cups block new orders without destroying cups or existing wage holds", () => {
  const town = fixture();
  const first = buy(town);
  work(town, first, 30);
  const second = buy(town, "sub");
  work(town, second, 30);
  assert.equal(town.coffee.orders.filter((o) => o.phase === "ready").length, 2);
  person(town, "arwyn").tile = { x: 7, y: 19 };
  const before = JSON.stringify(town);
  assert.equal(
    applyCoffeeAction(town, makeCoffeeCommand(town, "arwyn", "buy", { acceptLaterPickup: true }))
      .ok,
    false,
  );
  assert.equal(JSON.stringify(town), before);
  assert.equal(town.economy.holds.find((h) => h.id === "hold:test:shift").remaining, 5);
});

test("four collected cups reserve inventory capacity; drinking one frees exactly one space", () => {
  const town = fixture({ buyerMoney: 10 });
  for (let i = 0; i < 4; i++) {
    const id = buy(town);
    work(town, id, 30);
    assertOk(apply(town, "collect", id));
  }
  assert.equal(town.coffee.cups.filter((c) => c.custody === "inventory").length, 4);
  assert.equal(apply(town, "buy", undefined, { acceptLaterPickup: true }).ok, false);
  assertOk(apply(town, "drink", town.coffee.cups[0].id));
  buy(town);
  assert.equal(town.coffee.orders.length, 5);
  assert.deepEqual(auditEconomy(town), []);
});

test("late purchase requires disclosed later pickup and the seventh-day boundary admits no new order", () => {
  const town = fixture();
  town.minute = 1120;
  assert.match(coffeeActionReason(town, "player", "buy"), /later/);
  assert.equal(apply(town, "buy").ok, false);
  assertOk(apply(town, "buy", undefined, { acceptLaterPickup: true }));
  const boundary = fixture();
  boundary.day = 8;
  boundary.coffee.routines[0].controlDay = 8;
  assert.match(coffeeActionReason(boundary, "player", "buy"), /seven-day/);
  assert.equal(apply(boundary, "buy", undefined, { acceptLaterPickup: true }).ok, false);
});

test("forged old contribution or deleted order is rejected even when cash totals are unchanged", () => {
  const town = fixture(),
    id = buy(town);
  work(town, id, 12);
  const altered = structuredClone(town);
  altered.economy.work.agreements.find((a) => a.id === "test:shift").attendance.pop();
  assert(validateCoffee(altered).some((i) => i.includes("attendance")));
  const erased = structuredClone(town);
  erased.coffee.orders = [];
  erased.coffee.nextOrder = 1;
  erased.coffee.routines[0].orderId = null;
  assert(validateCoffee(erased).some((i) => i.includes("orphan") || i.includes("removed")));
  assert.deepEqual(auditEconomy(town), []);
  work(town, id, 8);
  const wrongPhase = structuredClone(town);
  wrongPhase.coffee.orders[0].phase = "brewing";
  assert(validateCoffee(wrongPhase).some((issue) => issue.includes("leave the brewer")));
});

test("counter proximity and occupancy are validated for purchase and exact-owner pickup", () => {
  const town = fixture();
  person(town, "player").tile = { x: 8, y: 19 };
  const outside = JSON.stringify(town);
  assert.equal(apply(town, "buy").ok, false);
  assert.equal(JSON.stringify(town), outside);
  const id = buy(town);
  work(town, id, 30);
  person(town, "sub").tile = { x: 7, y: 19 };
  const occupied = JSON.stringify(town);
  assert.equal(apply(town, "collect", id).ok, false);
  assert.equal(
    applyCoffeeAction(town, makeCoffeeCommand(town, "sub", "collect", { targetId: id })).ok,
    false,
  );
  assert.equal(JSON.stringify(town), occupied);
  person(town, "sub").tile = { x: 8, y: 18 };
  assertOk(apply(town, "collect", id));
});

test("forged extra price, recipient or hold terms and absent identity reject before any mutation", () => {
  const town = fixture(),
    good = makeCoffeeCommand(town, "player", "buy");
  const before = JSON.stringify(town);
  for (const forged of [
    { ...good, price: 0 },
    { ...good, recipient: "sub" },
    { ...good, holdId: "hold:test:shift" },
  ]) {
    assert.equal(applyCoffeeAction(town, forged).ok, false);
    assert.equal(JSON.stringify(town), before);
  }
  const missing = structuredClone(town);
  delete missing.identityRegistry;
  const missingBefore = JSON.stringify(missing);
  assert.equal(
    applyCoffeeAction(missing, { ...good, worldId: undefined, characterId: undefined }).ok,
    false,
  );
  assert.equal(JSON.stringify(missing), missingBefore);
});

test("maximum legal work IDs stay within the conservative attendance drain receipt allowance", (t) => {
  const town = createTown("Bounded history fixture");
  town.minute = 960;
  person(town, "northern").tile = { x: 5, y: 18 };
  assert.equal(activateFundedTown(town).ok, true);
  const agreementId = "w".repeat(120),
    approvalId = "a".repeat(120);
  const approval = {
    id: approvalId,
    kind: "cafe-replacement",
    worker: "northern",
    payer: "till:cafe",
    issuer: "kevin",
    claimId: null,
    confirmedMinutes: 0,
    fee: 5,
    requiredMinutes: 180,
    expires: { day: 1, minute: 1439 },
    cancellation: CAFE_CANCELLATION,
  };
  assertOk(
    approvePayrollAgreement(
      town,
      command("approve-payroll-agreement", "kevin", approval, "approve-maximum-id"),
      approval,
    ),
  );
  assertOk(
    createFundedCafeAgreement(
      town,
      command(
        "accept-funded-cafe-shift",
        "northern",
        cafeAgreementTerms(agreementId, "northern", approvalId),
        "accept-maximum-id",
      ),
      agreementId,
      "northern",
      approvalId,
    ),
  );
  let maximumOrdinary = 0,
    finalDelta = 0;
  for (let i = 0; i < 180; i++) {
    const before = Buffer.byteLength(JSON.stringify(town));
    assertOk(
      recordCafeAttendance(
        town,
        command(
          "record-cafe-attendance",
          "northern",
          { agreementId, day: town.day, minute: town.minute },
          `record-cafe-attendance:${agreementId}:${town.day}:${town.minute}`,
        ),
        agreementId,
      ),
    );
    const delta = Buffer.byteLength(JSON.stringify(town)) - before;
    if (i < 179) maximumOrdinary = Math.max(maximumOrdinary, delta);
    else finalDelta = delta;
    town.minute++;
  }
  assert(maximumOrdinary <= 2048, `Ordinary attendance grew ${maximumOrdinary} bytes`);
  assert(finalDelta <= 8192, `Final payable/settlement grew ${finalDelta} bytes`);
  assert.deepEqual(auditEconomy(town), []);
  assert.equal(readTownFile(exportTown(town)).status, "ready");
  for (const badId of [`payable:${"z".repeat(120)}`, `receipt2:${agreementId}`]) {
    const altered = structuredClone(town);
    altered.economy.work.payables.find((p) => p.agreementId === agreementId).id = badId;
    assert(auditEconomy(altered).some((issue) => issue.includes("invalid or duplicate record ID")));
  }
  const duplicate = structuredClone(town);
  duplicate.economy.work.payables.push(
    structuredClone(duplicate.economy.work.payables.find((p) => p.agreementId === agreementId)),
  );
  assert(auditEconomy(duplicate).some((issue) => issue.includes("invalid or duplicate record ID")));
  t.diagnostic(
    `Longest legal IDs: ordinary attendance max ${maximumOrdinary} bytes; final earned/payable delta ${finalDelta} bytes. This measures source records, not browser quota or arbitrary future schema growth.`,
  );
});

test("one bounded resume above the admission threshold finishes existing coffee and wages below the export ceiling", (t) => {
  const town = fixture(),
    total = cash(town),
    identity = structuredClone(town.identityRegistry),
    orderId = buy(town);
  work(town, orderId, 12);
  const paused = pauseCoffeeRoutine(
    town,
    makeCoffeeCommand(town, "northern", "pause", { targetId: "test:shift" }),
  );
  assert.equal(paused.ok, true, paused.message);
  // One lawful no-money source command retains synthetic pre-existing history.
  // Its payload deliberately reaches the threshold; it is not coffee output,
  // a user save, a new money source, or a claim that ordinary play emits this note.
  assertOk(
    runEconomyCommand(
      town,
      command(
        "test-retained-history",
        "kevin",
        { note: "x".repeat(3 * 1024 * 1024) },
        "test:capacity-padding",
      ),
      () => ({}),
    ),
  );
  const beforeBytes = Buffer.byteLength(JSON.stringify(town));
  assert(beforeBytes >= 3 * 1024 * 1024);
  assert(beforeBytes < 4 * 1024 * 1024);
  const beforeRejected = JSON.stringify(town),
    admission = apply(town, "buy");
  assert.equal(admission.ok, false);
  assert.match(admission.reason, /save space/);
  assert.equal(JSON.stringify(town), beforeRejected);
  const resumed = startCoffeeRoutine(
    town,
    makeCoffeeCommand(town, "northern", "resume", { targetId: "test:shift" }),
  );
  assert.equal(resumed.ok, true, resumed.message);
  assert.equal(town.coffee.routines[0].drainResumeUsed, true);
  for (let i = 0; i < 168; i++) {
    const job = stepMinute(town, false);
    if (job) applyResult(town, offlineResult(town, job));
  }
  const agreement = town.economy.work.agreements.find((a) => a.id === "test:shift");
  assert.equal(agreement.eligibleMinutes, 180);
  assert.equal(agreement.status, "completed");
  assert.equal(
    town.economy.work.payables.find((p) => p.agreementId === agreement.id).status,
    "settled",
  );
  assert.equal(town.coffee.orders.find((o) => o.id === orderId).phase, "ready");
  assert.equal(town.coffee.cups.length, 1);
  assert.equal(cash(town), total);
  assert.deepEqual(town.identityRegistry, identity);
  assert.deepEqual(auditEconomy(town), []);
  const exported = exportTown(town),
    exportBytes = Buffer.byteLength(exported);
  assert(exportBytes < 8 * 1024 * 1024);
  const restored = readTownFile(exported);
  assert.equal(restored.status, "ready", restored.reason);
  assert.equal(restored.town.coffee.cups.length, 1);
  assert.equal(cash(restored.town), total);
  t.diagnostic(
    `Synthetic retained-history drain: ${beforeBytes} bytes before final resume; ${exportBytes} bytes after 168 actual core intervals, one ready cup and the settled existing wage. Conditional finite path; no browser-quota or unlimited-toggle guarantee.`,
  );
});
