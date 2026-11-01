// A02 policy reference experiment. This is NOT an implementation of THE GAME.
// Uses no runtime modules, real towns, inference, credentials, network or new coins.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const identities = ["kevin", "arwyn", "sub", "baba", "northern", "player", "data", "amelia"];
const initial = {
  kevin: 11,
  arwyn: 8,
  sub: 5,
  baba: 9,
  northern: 2,
  player: 4,
  data: 6,
  amelia: 7,
  cafe: 22,
  grocery: 16,
  library: 0,
};
// Source-bind every fixture identity, not merely its aggregate total. This reads
// literal seed declarations; it does not execute createTown or model the engine.
const seedSource = readFileSync(new URL("../../../src/game/town.ts", import.meta.url), "utf8");
for (const id of identities) {
  const match = seedSource.match(new RegExp(`id: "${id}"(?: as const)?,[\\s\\S]*?money: (\\d+)`));
  assert(match, `Cannot locate source seed for ${id}`);
  assert.equal(initial[id], Number(match[1]), `Source balance mismatch for ${id}`);
}
assert.match(seedSource, /tills: \{ cafe: 22, grocery: 16 \}/);
const output = {
  kind: "independent policy reference; not engine or UI proof",
  node: process.version,
  assumptions: [
    "All demand/worker consent schedules are synthetic, not predicted resident behaviour.",
    "Only new service transfers are simulated; existing payroll is held but attendance is not simulated.",
    "Material inputs use the current tray abstraction; zero retained margin is an explicit proposed policy.",
    "One active order; one earned preparation per game day; 2 coin price and fee; all consent optional.",
  ],
  comparisons: [],
  scenarios: [],
  sweep: null,
};
let scenario;
function fresh(opening = initial) {
  return {
    day: 1,
    revision: 0,
    accounts: structuredClone(opening),
    opening: structuredClone(opening),
    holds: {},
    orders: {},
    active: null,
    earnedDays: [],
    journal: [],
    receipts: {},
    debts: [],
    recommendedPolicy: false,
  };
}
const total = (s) => Object.values(s.accounts).reduce((a, b) => a + b, 0);
const held = (s, a) =>
  Object.values(s.holds)
    .filter((h) => h.account === a)
    .reduce((n, h) => n + h.remaining, 0);
const available = (s, a) => s.accounts[a] - held(s, a);
const roster = ["sub", "player", "northern"];
function npcBudget(s, id) {
  const earned = s.journal
    .filter((t) => t.to === id && t.id.startsWith("wage:"))
    .reduce((n, t) => n + t.amount, 0);
  const spent =
    Object.values(s.orders).filter((o) => o.customer === id && o.status !== "refunded").length * 2;
  return Math.min(2, Math.max(0, 2 + earned - spent));
}
function audit(s) {
  assert.equal(
    total(s),
    Object.values(s.opening).reduce((a, b) => a + b, 0),
  );
  const expected = structuredClone(s.opening);
  for (const t of s.journal) {
    assert(t.amount > 0 && Number.isInteger(t.amount));
    expected[t.from] -= t.amount;
    expected[t.to] += t.amount;
  }
  assert.deepEqual(s.accounts, expected);
  for (const [a, b] of Object.entries(s.accounts)) {
    assert(Number.isInteger(b) && b >= 0 && b <= 999);
    assert(available(s, a) >= 0);
  }
  for (const h of Object.values(s.holds)) assert(Number.isInteger(h.remaining) && h.remaining >= 0);
  assert.equal(new Set(s.journal.map((t) => t.id)).size, s.journal.length);
  assert.equal(new Set(s.earnedDays).size, s.earnedDays.length);
  if (s.active) assert(!["paid", "refunded"].includes(s.orders[s.active].status));
}
function fail(reason) {
  throw new Error(reason);
}
function transfer(s, from, to, amount, id, purpose, holdId = null) {
  const hold = holdId ? s.holds[holdId] : null;
  if (holdId && (!hold || hold.account !== from || hold.remaining < amount)) fail("hold-mismatch");
  if ((hold ? hold.remaining : available(s, from)) < amount) fail("insufficient-funds");
  if (s.accounts[to] + amount > 999) fail("recipient-capacity");
  if (hold) hold.remaining -= amount;
  s.accounts[from] -= amount;
  s.accounts[to] += amount;
  s.journal.push({ id, day: s.day, from, to, amount, purpose, holdId });
}
function command(s, id, kind, terms, mutate, expected = s.revision, authority = "ui") {
  const payload = JSON.stringify({ kind, terms, authority });
  const before = JSON.stringify(s);
  let result;
  if (s.receipts[id])
    result =
      s.receipts[id].payload === payload
        ? { ok: true, replayed: true, value: s.receipts[id].value }
        : { ok: false, reason: "id-reused-with-changed-payload" };
  else if (authority === "model") result = { ok: false, reason: "model-cannot-authorize" };
  else if (expected !== s.revision) result = { ok: false, reason: "stale-revision" };
  else {
    const d = structuredClone(s);
    try {
      const value = mutate(d);
      d.revision++;
      d.receipts[id] = { payload, value };
      audit(d);
      Object.assign(s, d);
      result = { ok: true, replayed: false, value };
    } catch (error) {
      result = { ok: false, reason: error.message };
    }
  }
  if (!result.ok || result.replayed)
    assert.equal(JSON.stringify(s), before, "failure/replay must be atomic");
  audit(s);
  if (scenario) {
    if (s.day <= 7 || !result.ok || result.replayed)
      scenario.attempts.push({ day: s.day, id, kind, terms, result, revision: s.revision });
    else scenario.suppressedSuccessfulAttempts = (scenario.suppressedSuccessfulAttempts ?? 0) + 1;
  }
  return result;
}
function reserveLegacy(s, amount = 5) {
  return command(s, "legacy-hold", "protect-existing-payroll", { amount }, (d) => {
    if (available(d, "cafe") < amount) fail("underfunded-legacy");
    d.holds.legacy = { account: "cafe", remaining: amount };
    return { protected: amount };
  });
}
function order(
  s,
  customer,
  id,
  { consent = true, expected = s.revision, authority = "ui", unresolvedPayroll = false } = {},
) {
  return command(
    s,
    `order:${id}`,
    "preorder",
    { customer, id, price: 2, consent },
    (d) => {
      if (!identities.includes(customer)) fail("unknown-customer");
      if (!consent) fail("customer-refused");
      if (d.recommendedPolicy) {
        if (!roster.includes(customer)) fail("outside-bounded-roster");
        if (customer !== "player") {
          if (npcBudget(d, customer) < 2) fail("npc-discretionary-budget-exhausted");
          const debtDue = d.debts
            .filter((t) => t.from === customer && t.status === "owed")
            .reduce((n, t) => n + t.amount, 0);
          if (available(d, customer) - debtDue < 2) fail("npc-existing-liabilities-first");
        }
      }
      if (unresolvedPayroll) fail("unresolved-prior-payroll");
      if (d.active) fail("order-already-active");
      if (d.earnedDays.includes(d.day)) fail("daily-cap");
      transfer(d, customer, "cafe", 2, `sale:${id}`, "Optional tea-table preparation");
      d.holds[id] = { account: "cafe", remaining: 2 };
      d.orders[id] = {
        id,
        customer,
        worker: null,
        status: "funded",
        progress: [],
        createdDay: d.day,
      };
      d.active = id;
      return { orderId: id };
    },
    expected,
    authority,
  );
}
function accept(s, id, worker, consent = true, expected = s.revision) {
  return command(
    s,
    `accept:${id}:${worker}`,
    "accept",
    { id, worker, consent },
    (d) => {
      const o = d.orders[id];
      if (!o || o.status !== "funded") fail("order-unavailable");
      if (!consent) fail("worker-refused");
      if (!identities.includes(worker)) fail("unknown-worker");
      if (d.recommendedPolicy && !roster.includes(worker)) fail("outside-bounded-roster");
      if (worker === o.customer) fail("self-order-job");
      o.worker = worker;
      o.status = "working";
      return { worker };
    },
    expected,
  );
}
function progress(s, id, step, worker) {
  return command(s, `progress:${id}:${step}`, "progress", { id, step, worker }, (d) => {
    const o = d.orders[id];
    if (!o || o.status !== "working" || o.worker !== worker) fail("wrong-worker-or-state");
    if (!["prepare", "match", "deliver"].includes(step)) fail("unsupported-evidence");
    if (o.progress.includes(step)) fail("duplicate-evidence");
    if (step !== ["prepare", "match", "deliver"][o.progress.length])
      fail("wrong-preparation-stage");
    o.progress.push(step);
    return { progress: [...o.progress] };
  });
}
function complete(s, id, worker, expected = s.revision) {
  return command(
    s,
    `complete:${id}`,
    "complete",
    { id, worker },
    (d) => {
      const o = d.orders[id];
      if (!o || o.status !== "working" || o.worker !== worker) fail("wrong-worker-or-state");
      if (o.progress.length !== 3) fail("preparation-incomplete");
      if (d.earnedDays.includes(d.day)) fail("daily-cap");
      o.status = "payable";
      o.earnedDay = d.day;
      d.earnedDays.push(d.day);
      if (d.accounts[worker] + 2 <= 999) {
        transfer(d, "cafe", worker, 2, `wage:${id}`, "Completed bounded preparation", id);
        o.status = "paid";
        d.active = null;
      }
      return { status: o.status, worker, fee: 2 };
    },
    expected,
  );
}
function settle(s, id) {
  return command(s, `settle:${id}`, "settle", { id }, (d) => {
    const o = d.orders[id];
    if (o?.status !== "payable") fail("not-payable");
    transfer(d, "cafe", o.worker, 2, `wage:${id}`, "Delayed earned preparation fee", id);
    o.status = "paid";
    d.active = null;
    return { status: o.status };
  });
}
function refund(d, id, reason) {
  const o = d.orders[id];
  o.refundReason = reason;
  o.status = "refund-due";
  if (d.accounts[o.customer] + 2 <= 999) {
    transfer(d, "cafe", o.customer, 2, `refund:${id}`, reason, id);
    o.status = "refunded";
    d.active = null;
  }
  return { status: o.status };
}
function cancel(s, id, customer) {
  return command(s, `cancel:${id}`, "cancel-before-acceptance", { id, customer }, (d) => {
    const o = d.orders[id];
    if (!o || o.status !== "funded" || o.customer !== customer)
      fail("no-unearned-unaccepted-refund");
    return refund(d, id, "Unaccepted order refund");
  });
}
function abandon(s, id, worker) {
  return command(s, `abandon:${id}`, "worker-abandons-unfinished-unit", { id, worker }, (d) => {
    const o = d.orders[id];
    if (!o || o.status !== "working" || o.worker !== worker || o.progress.length >= 3)
      fail("not-worker-or-unfinished");
    return refund(d, id, "Worker explicitly accepts disclosed no-partial-fee cancellation");
  });
}
function settleRefund(s, id) {
  return command(s, `settle-refund:${id}`, "settle-refund", { id }, (d) => {
    const o = d.orders[id];
    if (o?.status !== "refund-due") fail("not-refund-due");
    transfer(d, "cafe", o.customer, 2, `refund:${id}`, o.refundReason, id);
    o.status = "refunded";
    d.active = null;
    return { status: o.status };
  });
}
function day(s, n = s.day + 1) {
  assert(n > s.day);
  s.day = n;
  audit(s);
}
function checkpoint(s, label) {
  scenario.checkpoints.push({
    day: s.day,
    label,
    accounts: structuredClone(s.accounts),
    holds: structuredClone(s.holds),
    availableCafe: available(s, "cafe"),
    total: total(s),
    active: s.active,
    debts: structuredClone(s.debts),
    orderCount: Object.keys(s.orders).length,
    recentOrders: structuredClone(Object.values(s.orders).slice(-3)),
    recentTransfers: structuredClone(s.journal.slice(-4)),
  });
}
function run(name, fn) {
  scenario = { name, attempts: [], checkpoints: [], passed: false };
  output.scenarios.push(scenario);
  fn();
  scenario.passed = true;
}
function perform(s, customer, worker, id) {
  let r = order(s, customer, id);
  if (!r.ok) return r;
  r = accept(s, id, worker);
  if (!r.ok) return r;
  for (const step of ["prepare", "match", "deliver"]) {
    r = progress(s, id, step, worker);
    if (!r.ok) return r;
  }
  return complete(s, id, worker);
}
function yes(r) {
  assert.equal(r.ok, true, JSON.stringify(r));
}
function no(r, reason) {
  assert.equal(r.ok, false);
  assert.equal(r.reason, reason);
}

// Deliberately simplified arithmetic alternatives, not claims of implemented NPC commerce.
for (const alternative of [
  { name: "Generic daily cafe sale plus old 5-coin wage", sales: [1, 2, 3, 4, 5, 6, 7] },
  { name: "Two optional reading occasions plus old 5-coin wage", sales: [2, 5] },
  { name: "Preordered bounded service: 2 price, 2 fee", sales: [1, 2, 3, 4, 5, 6, 7] },
]) {
  let till = 22,
    heldPayroll = 5,
    paid = 0;
  const rows = [];
  for (let d = 1; d <= 7; d++) {
    const sale = alternative.sales.includes(d) ? 2 : 0;
    till += sale;
    const fee = alternative.name.startsWith("Preordered") ? (sale ? 2 : 0) : 5;
    const wage = fee && till - heldPayroll >= fee ? fee : 0;
    till -= wage;
    if (wage) paid++;
    rows.push({
      day: d,
      sale,
      wage,
      till,
      heldPayroll,
      available: till - heldPayroll,
      opportunity: wage ? "funded-and-paid" : fee ? "blocked-insufficient-funds" : "no-order",
    });
  }
  output.comparisons.push({
    ...alternative,
    rows,
    paidUnits: paid,
    explanation: alternative.name.startsWith("Preordered")
      ? "Incoming 2 is entirely reserved; each completion leaves till unchanged."
      : "Patron balances/demand are assumed for this comparison. A 2 sale cannot finance a 5 wage indefinitely.",
  });
}

run("recommended three-person voluntary ring, seven days and 300-day circulation", () => {
  const s = fresh();
  s.recommendedPolicy = true;
  yes(reserveLegacy(s));
  for (let d = 1; d <= 300; d++) {
    if (d > 1) day(s);
    yes(perform(s, roster[(d - 1) % 3], roster[d % 3], `bounded-${d}`));
    if (d <= 7 || d === 300) checkpoint(s, `explicitly consenting round ${d}`);
    assert.equal(s.accounts.cafe, 22);
    assert.equal(held(s, "cafe"), 5);
  }
  assert.deepEqual(s.accounts, initial);
  assert.equal(s.journal.length, 600);
});
run("recommended policy stops NPC spending after two hoarded player fees", () => {
  const s = fresh();
  s.recommendedPolicy = true;
  yes(reserveLegacy(s));
  yes(perform(s, "sub", "player", "bounded-hoard-1"));
  checkpoint(s, "Sub buys once");
  day(s);
  yes(perform(s, "northern", "player", "bounded-hoard-2"));
  checkpoint(s, "Northern buys once");
  day(s);
  no(order(s, "sub", "bounded-hoard-3"), "npc-discretionary-budget-exhausted");
  no(order(s, "northern", "bounded-hoard-4"), "npc-discretionary-budget-exhausted");
  no(order(s, "player", "player-declines", { consent: false }), "customer-refused");
  assert.equal(s.accounts.player, 8);
  assert.equal(s.accounts.northern, 0);
  assert.equal(s.accounts.sub, 3);
  assert.equal(npcBudget(s, "sub"), 0);
  assert.equal(npcBudget(s, "northern"), 0);
  day(s, 300);
  no(order(s, "northern", "time-is-not-income"), "npc-discretionary-budget-exhausted");
  checkpoint(s, "inactivity protects remaining NPC savings; time does not reset budget");
});
run("recommended policy protects NPC existing liabilities and limits roster", () => {
  const s = fresh();
  s.recommendedPolicy = true;
  yes(reserveLegacy(s));
  s.debts = [{ id: "north-personal", from: "northern", to: "baba", amount: 4, status: "owed" }];
  no(order(s, "northern", "debt-before-treat"), "npc-existing-liabilities-first");
  no(order(s, "kevin", "wrong-customer"), "outside-bounded-roster");
  yes(order(s, "player", "player-order"));
  no(accept(s, "player-order", "kevin"), "outside-bounded-roster");
  yes(cancel(s, "player-order", "player"));
  checkpoint(s, "no forced debt repayment or changed creditor");
});
run(
  "mathematical sensitivity only: all-eight ring, 56 days; NOT proposed production roster",
  () => {
    const s = fresh();
    yes(reserveLegacy(s));
    for (let d = 1; d <= 56; d++) {
      if (d > 1) day(s);
      yes(perform(s, identities[(d - 1) % 8], identities[d % 8], `ring-${d}`));
      if (d <= 8 || d === 56) checkpoint(s, `completed round ${d}`);
      assert.equal(s.accounts.cafe, 22);
      assert.equal(held(s, "cafe"), 5);
    }
    assert.deepEqual(s.accounts, initial);
    assert.equal(s.journal.length, 112);
  },
);
run("low demand: one Day 2 order, then idle through Day 7", () => {
  const s = fresh();
  yes(reserveLegacy(s));
  for (let d = 1; d <= 7; d++) {
    if (d > 1) day(s);
    if (d === 2) yes(perform(s, "northern", "player", "low"));
    checkpoint(s, d === 2 ? "one paid order" : "no buyer; no opportunity; no loss");
  }
  assert.equal(s.journal.length, 2);
});
run("no demand and explicit customer/worker refusal", () => {
  const s = fresh();
  yes(reserveLegacy(s));
  no(order(s, "northern", "refused", { consent: false }), "customer-refused");
  yes(order(s, "northern", "pending"));
  no(accept(s, "pending", "player", false), "worker-refused");
  no(accept(s, "pending", "northern"), "self-order-job");
  yes(cancel(s, "pending", "northern"));
  for (let d = 2; d <= 7; d++) day(s);
  checkpoint(s, "refunded; idle; no penalty");
  assert.deepEqual(s.accounts, initial);
});
run("worker hoards: all seven NPC purses fund player until affordable orders stop", () => {
  const s = fresh();
  yes(reserveLegacy(s));
  let count = 0;
  while (true) {
    const buyer = identities.find((id) => id !== "player" && available(s, id) >= 2);
    if (!buyer) break;
    if (count) day(s);
    yes(perform(s, buyer, "player", `hoard-${++count}`));
  }
  assert.equal(count, 22);
  assert.equal(s.accounts.player, 48);
  day(s);
  no(order(s, "kevin", "unaffordable"), "insufficient-funds");
  checkpoint(s, "Day 23 stalled; buyer purses total 4; player keeps 48");
});
run("concentrated holdings: lawful transfers leave only hoarding player with personal cash", () => {
  const s = fresh();
  yes(reserveLegacy(s));
  for (const id of identities.filter((id) => id !== "player"))
    yes(
      command(s, `fixture-concentrate:${id}`, "synthetic-approved-transfer", { id }, (d) => {
        transfer(
          d,
          id,
          "player",
          d.accounts[id],
          `concentration:${id}`,
          "Explicit synthetic concentration fixture",
        );
        return true;
      }),
    );
  no(order(s, "northern", "poor"), "insufficient-funds");
  no(order(s, "player", "rich", { consent: false }), "customer-refused");
  checkpoint(s, "cafe cash does not create customer demand");
  assert.equal(s.accounts.player, 52);
});
run("old payroll protected; unresolved claims block; existing debt pays Baba personally", () => {
  const s = fresh();
  yes(reserveLegacy(s));
  s.debts = [{ id: "bread-tab", from: "player", to: "baba", amount: 2, status: "owed" }];
  no(order(s, "northern", "blocked", { unresolvedPayroll: true }), "unresolved-prior-payroll");
  yes(perform(s, "northern", "player", "debt-work"));
  yes(
    command(s, "repay-bread", "repay-debt", { id: "bread-tab" }, (d) => {
      transfer(d, "player", "baba", 2, "debt:bread-tab", "Old personal bread tab");
      d.debts[0].status = "paid";
      return true;
    }),
  );
  assert.equal(s.accounts.baba, 11);
  assert.equal(s.accounts.grocery, 16);
  assert.equal(held(s, "cafe"), 5);
  checkpoint(s, "service does not garnish debt or redirect creditor");
});
run(
  "library participation: 8 funded, 6 in fees, 2 returned; service remains independently funded",
  () => {
    const s = fresh();
    yes(reserveLegacy(s));
    yes(
      command(s, "library-grant", "synthetic-library-grant", {}, (d) => {
        transfer(d, "cafe", "library", 4, "library:cafe", "Explicit existing-money contribution");
        transfer(
          d,
          "grocery",
          "library",
          4,
          "library:grocery",
          "Explicit existing-money contribution",
        );
        return true;
      }),
    );
    checkpoint(s, "library custody8");
    for (const id of ["player", "arwyn", "northern"])
      yes(
        command(s, `library-fee:${id}`, "synthetic-completed-library-check", { id }, (d) => {
          transfer(
            d,
            "library",
            id,
            2,
            `library:fee:${id}`,
            "Separate honestly completed library unit",
          );
          return true;
        }),
      );
    yes(
      command(s, "library-refund", "synthetic-library-close", {}, (d) => {
        transfer(d, "library", "cafe", 1, "library:refund:cafe", "Unused library reserve");
        transfer(d, "library", "grocery", 1, "library:refund:grocery", "Unused library reserve");
        return true;
      }),
    );
    yes(perform(s, "northern", "player", "with-library"));
    checkpoint(s, "separate service funded by customer");
    assert.equal(s.accounts.cafe, 19);
    assert.equal(s.accounts.grocery, 13);
    assert.equal(total(s), 90);
  },
);
run("interrupted work, midnight, stale and duplicate actions, save/reload", () => {
  let s = fresh();
  yes(reserveLegacy(s));
  yes(order(s, "northern", "interrupted"));
  yes(accept(s, "interrupted", "player"));
  no(complete(s, "interrupted", "player"), "preparation-incomplete");
  no(progress(s, "interrupted", "match", "player"), "wrong-preparation-stage");
  yes(progress(s, "interrupted", "prepare", "player"));
  no(progress(s, "interrupted", "match", "sub"), "wrong-worker-or-state");
  no(cancel(s, "interrupted", "northern"), "no-unearned-unaccepted-refund");
  no(order(s, "baba", "second"), "order-already-active");
  checkpoint(s, "interrupted; 2 held in addition to prior5");
  const revision = s.revision;
  day(s, 7);
  const encoded = JSON.stringify(s);
  s = JSON.parse(encoded);
  audit(s);
  assert.equal(JSON.stringify(s), encoded);
  yes(progress(s, "interrupted", "match", "player"));
  yes(progress(s, "interrupted", "deliver", "player"));
  no(complete(s, "interrupted", "player", revision), "stale-revision");
  yes(complete(s, "interrupted", "player"));
  assert.equal(complete(s, "interrupted", "player").replayed, true);
  assert.equal(order(s, "northern", "interrupted").replayed, true);
  no(order(s, "baba", "interrupted"), "id-reused-with-changed-payload");
  no(order(s, "baba", "same-day"), "daily-cap");
  checkpoint(s, "Day7 resumes and pays once");
  assert.equal(s.accounts.player, 6);
  assert.equal(s.journal.length, 2);
  assert.equal(held(s, "cafe"), 5);
});
run(
  "worker-authorized abandonment preserves observations and refunds; customer cannot confiscate accepted work",
  () => {
    const s = fresh();
    s.recommendedPolicy = true;
    yes(reserveLegacy(s));
    yes(order(s, "sub", "abandon"));
    yes(accept(s, "abandon", "player"));
    yes(progress(s, "abandon", "prepare", "player"));
    yes(progress(s, "abandon", "match", "player"));
    no(cancel(s, "abandon", "sub"), "no-unearned-unaccepted-refund");
    no(abandon(s, "abandon", "sub"), "not-worker-or-unfinished");
    yes(abandon(s, "abandon", "player"));
    assert.equal(abandon(s, "abandon", "player").replayed, true);
    assert.deepEqual(s.accounts, initial);
    assert.deepEqual(s.orders.abandon.progress, ["prepare", "match"]);
    assert.equal(npcBudget(s, "sub"), 2);
    assert.equal(held(s, "cafe"), 5);
    no(complete(s, "abandon", "player"), "wrong-worker-or-state");
    checkpoint(s, "explicit worker consent refunds2; observations archived; no partial fee");
  },
);
run(
  "full refund recipient retains refund payable and hold, then settles once after capacity frees",
  () => {
    const s = fresh({ ...initial, player: 999 });
    yes(reserveLegacy(s));
    yes(order(s, "player", "refund-cap"));
    yes(
      command(
        s,
        "fill-refund-recipient",
        "synthetic-approved-transfer",
        { from: "kevin", to: "player", amount: 2 },
        (d) => {
          transfer(
            d,
            "kevin",
            "player",
            2,
            "refund-cap:fill",
            "Explicit transfer fills original customer purse",
          );
          return true;
        },
      ),
    );
    yes(cancel(s, "refund-cap", "player"));
    assert.equal(s.orders["refund-cap"].status, "refund-due");
    assert.equal(held(s, "cafe"), 7);
    assert.equal(s.active, "refund-cap");
    no(settleRefund(s, "refund-cap"), "recipient-capacity");
    no(order(s, "sub", "blocked-by-refund"), "order-already-active");
    checkpoint(s, "refund payable retained at capacity");
    yes(
      command(s, "refund-cap-spend", "synthetic-approved-purchase", { amount: 2 }, (d) => {
        transfer(
          d,
          "player",
          "grocery",
          2,
          "refund-cap:spend",
          "Explicit purchase frees refund capacity",
        );
        return true;
      }),
    );
    yes(settleRefund(s, "refund-cap"));
    assert.equal(settleRefund(s, "refund-cap").replayed, true);
    assert.equal(s.accounts.player, 999);
    assert.equal(held(s, "cafe"), 5);
    assert.equal(s.active, null);
    checkpoint(s, "refund settles exactly once without losing original liability");
  },
);
run("model proposal cannot create an obligation; stale quote charges nothing", () => {
  const s = fresh();
  const quoteRevision = s.revision;
  yes(reserveLegacy(s));
  no(order(s, "player", "model", { authority: "model" }), "model-cannot-authorize");
  no(order(s, "player", "stale", { expected: quoteRevision }), "stale-revision");
  checkpoint(s, "both rejected atomically");
});
run("recipient cap preserves earned payable and hold; settles after legitimate spend", () => {
  // Explicit imported opening of 1085 total; not a mutation/top-up of a 90-coin town.
  const s = fresh({ ...initial, player: 999 });
  yes(reserveLegacy(s));
  yes(perform(s, "northern", "player", "capped"));
  assert.equal(s.orders.capped.status, "payable");
  assert.equal(held(s, "cafe"), 7);
  no(settle(s, "capped"), "recipient-capacity");
  yes(
    command(s, "capacity-spend", "synthetic-authorized-spend", { amount: 2 }, (d) => {
      transfer(
        d,
        "player",
        "grocery",
        2,
        "capacity:spend",
        "Explicit purchase frees purse capacity",
      );
      return true;
    }),
  );
  yes(settle(s, "capped"));
  assert.equal(settle(s, "capped").replayed, true);
  checkpoint(s, "earned wage retained then paid once");
});

// 64 deterministic demand/refusal patterns × 30 days, including duplicates and reloads.
let completed = 0,
  rejected = 0;
scenario = null;
for (let pattern = 0; pattern < 64; pattern++) {
  let s = fresh();
  s.recommendedPolicy = true;
  yes(reserveLegacy(s));
  for (let d = 1; d <= 30; d++) {
    if (d > 1) day(s);
    const buyer = roster[(d + pattern) % 3],
      worker = roster[(d + pattern + 1) % 3],
      id = `sweep-${pattern}-${d}`;
    if ((pattern >> (d % 6)) & 1) {
      const r = order(s, buyer, id);
      if (r.ok) {
        if ((d + pattern) % 4 === 0) {
          no(accept(s, id, worker, false), "worker-refused");
          yes(cancel(s, id, buyer));
          rejected++;
        } else {
          yes(accept(s, id, worker));
          for (const step of ["prepare", "match", "deliver"]) yes(progress(s, id, step, worker));
          yes(complete(s, id, worker));
          assert.equal(complete(s, id, worker).replayed, true);
          completed++;
        }
      } else {
        assert(["insufficient-funds", "npc-discretionary-budget-exhausted"].includes(r.reason));
        rejected++;
      }
    }
    s = JSON.parse(JSON.stringify(s));
    audit(s);
  }
}
output.sweep = {
  policy: "recommended three-person roster and nonrenewing spending budget",
  patterns: 64,
  daysPerPattern: 30,
  completed,
  rejected,
  assertions:
    "conservation, account journal reconciliation, nonnegative available funds, preserved holds, daily cap, replay, atomic refusal, JSON roundtrip",
};
output.passed = output.scenarios.every((x) => x.passed);
writeFileSync(
  new URL("./cycle-model-results.json", import.meta.url),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      passed: output.passed,
      scenarios: output.scenarios.length,
      sweep: output.sweep,
      comparisons: output.comparisons.map((x) => ({
        name: x.name,
        paidUnits: x.paidUnits,
        lastDay: x.rows.at(-1),
      })),
    },
    null,
    2,
  ),
);
