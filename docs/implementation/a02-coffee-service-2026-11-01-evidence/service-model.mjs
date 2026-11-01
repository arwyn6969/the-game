// Independent synthetic design experiment. NOT THE GAME runtime or UI evidence.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const initial = { kevin: 11, arwyn: 8, sub: 5, northern: 2, baba: 9, player: 4, data: 6, amelia: 7, cafe: 22, grocery: 16 };
const actors = Object.keys(initial).filter((id) => !["cafe", "grocery"].includes(id));
const seed = readFileSync(new URL("../../../src/game/town.ts", import.meta.url), "utf8");
for (const id of actors) {
  const match = seed.match(new RegExp(`id: "${id}"(?: as const)?,[\\s\\S]*?money: (\\d+)`));
  assert(match, `Missing source identity: ${id}`);
  assert.equal(initial[id], Number(match[1]), `Source seed mismatch: ${id}`);
}
assert.match(seed, /tills: \{ cafe: 22, grocery: 16 \}/);

const PRICE = 2;
const WORKERS = ["sub", "northern"];
const DEMAND = Object.freeze([
  { at: 0, buyer: "kevin" }, { at: 0, buyer: "arwyn" },
  { at: 0, buyer: "baba" }, { at: 0, buyer: "player" },
  { at: 40, buyer: "data" }, { at: 40, buyer: "amelia" },
].map(Object.freeze));
const active = (o) => !["refunded", "collected", "consumed"].includes(o.status);
const assigned = (o) => ["waiting-brewer", "brewing", "placing"].includes(o.status);
const total = (s) => Object.values(s.accounts).reduce((a, b) => a + b, 0);
const held = (s, account) => Object.values(s.holds).filter((h) => h.account === account).reduce((a, b) => a + b.amount, 0);
const available = (s, account) => s.accounts[account] - held(s, account);
const shelfUsed = (s) => Object.values(s.orders).filter((o) => assigned(o) || o.status === "ready").length;
const workOrder = (s, worker) => Object.values(s.orders).find((o) => o.worker === worker && assigned(o));
const carried = (s, actor) => Object.values(s.cups).filter((cup) => cup.custody === actor).length;
const futureInventory = (s, actor) => Object.values(s.inventoryReservations).filter((owner) => owner === actor).length;
let auditCount = 0;
let commandCount = 0;
const tests = [];

function fresh({ placementMinutes = 10 } = {}) {
  const s = {
    version: 1, time: 0, revision: 0, accounts: structuredClone(initial),
    holds: { legacyCafe: { account: "cafe", amount: 5 }, legacyGrocery: { account: "grocery", amount: 4 } },
    orders: {}, cups: {}, inventoryReservations: {}, journal: [], receipts: {}, events: [], nextWorkerIndex: 0,
    config: { prepMinutes: 20, placementMinutes, brewerCapacity: 1, shelfCapacity: 2, queueCapacity: 6, carriedCapacity: 4 },
    pausedWorkers: [], conflictingWork: [], declaredWorkers: [...WORKERS],
  };
  audit(s);
  return s;
}

function audit(s) {
  auditCount++;
  assert.equal(total(s), 90);
  assert.deepEqual(Object.keys(s.accounts), Object.keys(initial));
  const expected = structuredClone(initial);
  for (const t of s.journal) {
    assert.equal(t.amount, PRICE);
    expected[t.from] -= t.amount;
    expected[t.to] += t.amount;
  }
  assert.deepEqual(s.accounts, expected);
  assert.equal(new Set(s.journal.map((t) => t.id)).size, s.journal.length);
  assert.deepEqual(s.holds.legacyCafe, { account: "cafe", amount: 5 });
  assert.deepEqual(s.holds.legacyGrocery, { account: "grocery", amount: 4 });
  for (const [account, amount] of Object.entries(s.accounts)) {
    assert(Number.isInteger(amount) && amount >= 0);
    assert(available(s, account) >= 0);
  }
  assert(shelfUsed(s) <= s.config.shelfCapacity);
  assert(Object.values(s.orders).filter((o) => ["waiting-brewer", "brewing"].includes(o.status)).length <= s.config.brewerCapacity);
  assert(Object.values(s.orders).filter(active).length <= s.config.queueCapacity);
  for (const worker of WORKERS) assert(Object.values(s.orders).filter((o) => o.worker === worker && assigned(o)).length <= 1);
  for (const buyer of actors) {
    assert(Object.values(s.orders).filter((o) => o.buyer === buyer && active(o)).length <= 1);
    assert(carried(s, buyer) + futureInventory(s, buyer) <= s.config.carriedCapacity);
  }
  assert.deepEqual(Object.keys(s.inventoryReservations).sort(), Object.values(s.orders).filter(active).map((o) => o.id).sort());
  for (const o of Object.values(s.orders)) {
    const paid = ["ready", "collected", "consumed"].includes(o.status);
    const obligation = !paid && o.status !== "refunded";
    assert.equal(s.inventoryReservations[o.id] ?? null, active(o) ? o.buyer : null);
    assert.equal(s.holds[o.id]?.amount ?? 0, obligation ? PRICE : 0);
    assert.equal(s.journal.filter((t) => t.id === `wage:${o.id}`).length, paid ? 1 : 0);
    assert.equal(s.journal.filter((t) => t.id === `refund:${o.id}`).length, o.status === "refunded" ? 1 : 0);
    assert.equal(Object.values(s.cups).filter((c) => c.orderId === o.id).length, paid ? 1 : 0);
    if (paid) {
      const cup = s.cups[`cup:${o.id}`];
      assert.equal(cup.owner, o.buyer);
      assert.equal(cup.custody, o.status === "ready" ? "cafe-counter" : o.status === "collected" ? o.buyer : "consumed");
      assert.equal(cup.consumeCount, o.status === "consumed" ? 1 : 0);
      assert(o.prepProgress >= s.config.prepMinutes);
      assert(o.placementProgress >= s.config.placementMinutes);
    }
  }
}

function fail(reason) { throw new Error(reason); }
function event(s, type, fields = {}) {
  s.events.push({ time: s.time, type, ...fields, accounts: structuredClone(s.accounts), holds: structuredClone(s.holds), inventoryReservations: structuredClone(s.inventoryReservations) });
}
function transfer(s, from, to, id, useHold = null) {
  if (useHold) {
    if (s.holds[useHold]?.account !== from || s.holds[useHold].amount !== PRICE) fail("hold-mismatch");
    delete s.holds[useHold];
  } else if (available(s, from) < PRICE) fail("insufficient-funds");
  s.accounts[from] -= PRICE;
  s.accounts[to] += PRICE;
  s.journal.push({ id, time: s.time, from, to, amount: PRICE });
}

function command(s, id, kind, payload, mutate, revision = s.revision, authority = "ui") {
  commandCount++;
  const before = JSON.stringify(s);
  const fingerprint = JSON.stringify({ kind, payload, authority });
  let result;
  if (s.receipts[id]) result = s.receipts[id].fingerprint === fingerprint
    ? { ok: true, replayed: true, value: s.receipts[id].value }
    : { ok: false, reason: "command-id-conflict" };
  else if (authority === "model") result = { ok: false, reason: "model-cannot-authorize" };
  else if (revision !== s.revision) result = { ok: false, reason: "stale-revision" };
  else {
    const d = structuredClone(s);
    try {
      const value = mutate(d) ?? null;
      d.revision++;
      d.receipts[id] = { fingerprint, value };
      audit(d);
      Object.assign(s, d);
      result = { ok: true, replayed: false, value };
    } catch (error) { result = { ok: false, reason: error.message }; }
  }
  if (!result.ok || result.replayed) assert.equal(JSON.stringify(s), before, "Rejected/replayed action mutated state");
  audit(s);
  return result;
}

function buy(s, buyer, orderId, options = {}) {
  return command(s, options.id ?? `buy:${orderId}`, "buy", { buyer, orderId }, (d) => {
    if (!actors.includes(buyer)) fail("unknown-buyer");
    if (d.orders[orderId]) fail("duplicate-order");
    if (carried(d, buyer) + futureInventory(d, buyer) >= d.config.carriedCapacity) fail("inventory-full");
    if (!d.declaredWorkers.some((worker) => worker !== buyer && !d.conflictingWork.includes(worker))) fail("no-declared-worker");
    if (Object.values(d.orders).filter((o) => o.status === "ready").length >= d.config.shelfCapacity) fail("pickup-shelf-full");
    if (Object.values(d.orders).some((o) => o.buyer === buyer && active(o))) fail("buyer-has-uncollected-order");
    if (Object.values(d.orders).filter(active).length >= d.config.queueCapacity) fail("queue-full");
    transfer(d, buyer, "cafe", `sale:${orderId}`);
    d.holds[orderId] = { account: "cafe", amount: PRICE };
    d.inventoryReservations[orderId] = buyer;
    d.orders[orderId] = { id: orderId, buyer, status: "queued", worker: null, orderedAt: d.time, prepProgress: 0, placementProgress: 0 };
    event(d, "paid-order", { orderId, buyer });
    return orderId;
  }, options.revision, options.authority);
}

function accept(s, worker, orderId, id = `accept:${orderId}`) {
  return command(s, id, "accept", { worker, orderId }, (d) => {
    const o = d.orders[orderId];
    if (!WORKERS.includes(worker)) fail("ineligible-worker");
    if (d.conflictingWork.includes(worker)) fail("existing-work-conflict");
    if (workOrder(d, worker)) fail("worker-busy");
    if (o?.status !== "queued") fail("not-queued");
    if (o.buyer === worker) fail("self-purchase-work-not-in-prototype");
    const oldest = Object.values(d.orders).find((candidate) => candidate.status === "queued" && candidate.buyer !== worker);
    if (oldest?.id !== orderId) fail("older-eligible-order");
    if (shelfUsed(d) >= d.config.shelfCapacity) fail("shelf-full");
    if (Object.values(d.orders).some((x) => ["waiting-brewer", "brewing"].includes(x.status))) fail("brewer-busy");
    if (d.holds[orderId]?.amount !== PRICE) fail("unfunded-order");
    o.status = "waiting-brewer";
    o.worker = worker;
    o.acceptedAt = d.time;
    event(d, "accepted", { orderId, worker });
    return orderId;
  });
}

function start(s, orderId) {
  return command(s, `start:${orderId}`, "start", { orderId }, (d) => {
    const o = d.orders[orderId];
    if (o?.status !== "waiting-brewer") fail("not-waiting");
    if (d.pausedWorkers.includes(o.worker)) fail("worker-paused");
    if (Object.values(d.orders).some((x) => x.status === "brewing")) fail("brewer-busy");
    o.status = "brewing";
    o.startedAt = d.time;
    event(d, "brew-started", { orderId, worker: o.worker });
    return orderId;
  }, s.revision, "engine");
}

function tick(s) {
  return command(s, `tick:${s.time + 1}`, "tick", { minute: s.time + 1 }, (d) => {
    d.time++;
    for (const o of Object.values(d.orders)) {
      if (d.pausedWorkers.includes(o.worker)) continue;
      if (o.status === "brewing") {
        o.prepProgress++;
        if (o.prepProgress === d.config.prepMinutes) {
          o.status = "placing";
          event(d, "brew-finished", { orderId: o.id });
        }
      } else if (o.status === "placing") o.placementProgress++;
    }
    return d.time;
  }, s.revision, "engine");
}

function place(s, orderId, id = `place:${orderId}`) {
  return command(s, id, "place", { orderId }, (d) => {
    const o = d.orders[orderId];
    if (o?.status !== "placing") fail("not-placing");
    if (d.pausedWorkers.includes(o.worker)) fail("worker-paused");
    if (o.placementProgress < d.config.placementMinutes) fail("placement-incomplete");
    transfer(d, "cafe", o.worker, `wage:${orderId}`, orderId);
    o.status = "ready";
    o.readyAt = d.time;
    d.cups[`cup:${orderId}`] = { id: `cup:${orderId}`, orderId, owner: o.buyer, custody: "cafe-counter", consumeCount: 0 };
    d.nextWorkerIndex = (WORKERS.indexOf(o.worker) + 1) % WORKERS.length;
    event(d, "ready-and-paid", { orderId, worker: o.worker, buyer: o.buyer });
    return `cup:${orderId}`;
  }, s.revision, "engine");
}

function collect(s, buyer, orderId, options = {}) {
  return command(s, options.id ?? `collect:${orderId}`, "collect", { buyer, orderId }, (d) => {
    const o = d.orders[orderId];
    if (o?.buyer !== buyer) fail("wrong-buyer");
    if (o.status !== "ready") fail("not-ready");
    if (d.inventoryReservations[orderId] !== buyer || carried(d, buyer) >= d.config.carriedCapacity) fail("inventory-entitlement-missing");
    o.status = "collected";
    o.collectedAt = d.time;
    d.cups[`cup:${orderId}`].custody = buyer;
    delete d.inventoryReservations[orderId];
    event(d, "collected", { orderId, buyer });
    return orderId;
  }, options.revision);
}

function consume(s, buyer, orderId, id = `consume:${orderId}`) {
  return command(s, id, "consume", { buyer, orderId }, (d) => {
    const o = d.orders[orderId];
    if (o?.buyer !== buyer) fail("wrong-buyer");
    if (o.status !== "collected") fail("not-held");
    o.status = "consumed";
    o.consumedAt = d.time;
    const cup = d.cups[`cup:${orderId}`];
    cup.custody = "consumed";
    cup.consumeCount++;
    event(d, "consumed", { orderId, buyer });
    return orderId;
  });
}

function refund(s, actor, orderId, mode = "customer-cancel", id = `${mode}:${orderId}`) {
  return command(s, id, mode, { actor, orderId }, (d) => {
    const o = d.orders[orderId];
    if (mode === "customer-cancel") {
      if (o?.buyer !== actor) fail("wrong-buyer");
      if (o.status !== "queued") fail("already-accepted");
    } else {
      if (!assigned(o) || o.worker !== actor) fail("no-abandonable-work");
    }
    transfer(d, "cafe", o.buyer, `refund:${orderId}`, orderId);
    o.status = "refunded";
    delete d.inventoryReservations[orderId];
    o.refundedAt = d.time;
    event(d, "refunded", { orderId, mode, actor });
    return orderId;
  });
}

function pause(s, worker, paused) {
  return command(s, `pause:${worker}:${s.revision}`, "pause", { worker, paused }, (d) => {
    d.pausedWorkers = d.pausedWorkers.filter((x) => x !== worker);
    if (paused) d.pausedWorkers.push(worker);
    event(d, paused ? "worker-paused" : "worker-resumed", { worker });
  });
}
function reload(s) { const d = JSON.parse(JSON.stringify(s)); audit(d); assert.deepEqual(d, s); return d; }
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result; }
function blocked(result, reason) { assert.deepEqual(result, { ok: false, reason }); }
function advance(s, minutes) { for (let i = 0; i < minutes; i++) ok(tick(s)); }
function readyOne() {
  const s = fresh();
  ok(buy(s, "kevin", "o1")); ok(accept(s, "sub", "o1")); ok(start(s, "o1"));
  advance(s, 30); ok(place(s, "o1"));
  return s;
}

function dispatch(s, workers, pickup) {
  for (const o of Object.values(s.orders)) if (o.status === "placing" && o.placementProgress >= s.config.placementMinutes && !s.pausedWorkers.includes(o.worker)) ok(place(s, o.id));
  if (pickup) for (const o of Object.values(s.orders)) if (o.status === "ready") ok(collect(s, o.buyer, o.id));
  const candidates = [...workers].sort((a, b) =>
    ((WORKERS.indexOf(a) - s.nextWorkerIndex + WORKERS.length) % WORKERS.length) -
    ((WORKERS.indexOf(b) - s.nextWorkerIndex + WORKERS.length) % WORKERS.length));
  for (const worker of candidates) {
    if (workOrder(s, worker) || shelfUsed(s) >= s.config.shelfCapacity) continue;
    if (Object.values(s.orders).some((o) => ["waiting-brewer", "brewing"].includes(o.status))) continue;
    const next = Object.values(s.orders).find((o) => o.status === "queued" && o.buyer !== worker);
    if (next) { ok(accept(s, worker, next.id)); ok(start(s, next.id)); }
  }
  if (!Object.values(s.orders).some((o) => o.status === "brewing")) {
    const next = Object.values(s.orders).find((o) => o.status === "waiting-brewer" && !s.pausedWorkers.includes(o.worker));
    if (next) ok(start(s, next.id));
  }
}

function run({ name, workerCount, placementMinutes = 10, demand = DEMAND, pickup = true, horizon = 240 }) {
  const s = fresh({ placementMinutes });
  const workers = WORKERS.slice(0, workerCount);
  for (let minute = 0; minute <= horizon; minute++) {
    if (minute > 0) ok(tick(s));
    demand.forEach((d, i) => { if (d.at === minute) ok(buy(s, d.buyer, `o${i + 1}`)); });
    dispatch(s, workers, pickup);
  }
  const orders = Object.values(s.orders);
  const ready = orders.filter((o) => o.readyAt !== undefined);
  const waits = ready.map((o) => o.readyAt - o.orderedAt);
  return {
    name, workerCount, placementMinutes, horizon, demand, pickup,
    completed: ready.length, paidAt: ready.map((o) => o.readyAt), waits,
    lastReady: ready.length ? Math.max(...ready.map((o) => o.readyAt)) : null,
    meanWait: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
    balances: s.accounts, holds: s.holds, shelfUsed: shelfUsed(s), inventoryReservations: s.inventoryReservations,
    orders, cups: s.cups, journal: s.journal, events: s.events,
  };
}

function test(name, body) { body(); tests.push({ name, passed: true }); }

test("Before-acceptance cancellation refunds exactly; replay cannot repeat refund", () => {
  const s = fresh(); ok(buy(s, "kevin", "o1")); ok(refund(s, "kevin", "o1"));
  assert.deepEqual(s.accounts, initial); assert.equal(ok(refund(s, "kevin", "o1")).replayed, true);
  blocked(accept(s, "sub", "o1"), "not-queued");
});
test("Customer cannot unilaterally refund accepted work; incomplete voluntary abandonment refunds fully", () => {
  const s = fresh(); ok(buy(s, "kevin", "o1")); ok(accept(s, "sub", "o1")); ok(start(s, "o1")); advance(s, 12);
  blocked(refund(s, "kevin", "o1"), "already-accepted");
  ok(refund(s, "sub", "o1", "worker-abandon")); assert.deepEqual(s.accounts, initial);
  assert.equal(Object.keys(s.cups).length, 0); assert.equal(shelfUsed(s), 0);
});
test("Ready placement pays once and creates one cup; completed wage cannot be abandoned/refunded", () => {
  const s = readyOne(); assert.equal(s.accounts.sub, 7); assert.equal(s.accounts.cafe, 22);
  assert.equal(ok(place(s, "o1")).replayed, true); blocked(place(s, "o1", "new-place"), "not-placing");
  blocked(refund(s, "sub", "o1", "worker-abandon"), "no-abandonable-work");
  blocked(refund(s, "kevin", "o1"), "already-accepted"); assert.equal(s.accounts.sub, 7);
});
test("Wrong-buyer, stale collection and changed command payload reject atomically", () => {
  const s = readyOne();
  blocked(collect(s, "arwyn", "o1", { id: "wrong" }), "wrong-buyer");
  blocked(collect(s, "kevin", "o1", { revision: s.revision - 1 }), "stale-revision");
  blocked(buy(s, "arwyn", "o2", { id: "buy:o1" }), "command-id-conflict");
  assert.equal(s.orders.o1.status, "ready");
});
test("Collection and consumption are distinct, repeat-safe and never alter earned wages", () => {
  const s = readyOne(); const balances = structuredClone(s.accounts);
  blocked(consume(s, "kevin", "o1"), "not-held"); ok(collect(s, "kevin", "o1"));
  assert.equal(ok(collect(s, "kevin", "o1")).replayed, true);
  blocked(collect(s, "kevin", "o1", { id: "collect-again" }), "not-ready");
  advance(s, 3); assert.equal(s.orders.o1.status, "collected"); assert.equal(s.cups["cup:o1"].consumeCount, 0);
  ok(consume(s, "kevin", "o1")); assert.equal(ok(consume(s, "kevin", "o1")).replayed, true);
  blocked(consume(s, "kevin", "o1", "consume-again"), "not-held");
  assert.deepEqual(s.accounts, balances); assert.equal(s.cups["cup:o1"].consumeCount, 1);
});
test("Paused preparation survives reload and advances only with resumed worker", () => {
  let s = fresh(); ok(buy(s, "kevin", "o1")); ok(accept(s, "sub", "o1")); ok(start(s, "o1")); advance(s, 7);
  ok(pause(s, "sub", true)); s = reload(s); advance(s, 10); assert.equal(s.orders.o1.prepProgress, 7);
  ok(pause(s, "sub", false)); advance(s, 13); assert.equal(s.orders.o1.status, "placing");
  s = reload(s); advance(s, 10); ok(place(s, "o1")); s = reload(s);
  assert.equal(s.orders.o1.readyAt, 40); assert.equal(s.accounts.sub, 7); assert.equal(s.holds.o1, undefined);
});
test("Brewing alone is not completed paid service; incomplete counter placement survives reload", () => {
  let s = fresh(); ok(buy(s, "kevin", "o1")); ok(accept(s, "sub", "o1")); ok(start(s, "o1"));
  advance(s, 20); blocked(place(s, "o1"), "placement-incomplete");
  assert.equal(s.accounts.sub, 5); assert.equal(s.holds.o1.amount, 2);
  advance(s, 4); s = reload(s); assert.equal(s.orders.o1.placementProgress, 4);
  advance(s, 6); ok(place(s, "o1")); assert.equal(s.accounts.sub, 7);
});
test("Worker holds brewer while paused; explicit incomplete abandonment releases it", () => {
  const s = fresh(); ok(buy(s, "kevin", "o1")); ok(buy(s, "arwyn", "o2"));
  ok(accept(s, "sub", "o1")); ok(start(s, "o1"));
  ok(pause(s, "sub", true)); blocked(accept(s, "northern", "o2"), "brewer-busy");
  ok(refund(s, "sub", "o1", "worker-abandon")); ok(accept(s, "northern", "o2")); ok(start(s, "o2"));
});
test("One active uncollected order per buyer, bounded queue and duplicate purchase", () => {
  const s = fresh(); ok(buy(s, "kevin", "o1")); assert.equal(ok(buy(s, "kevin", "o1")).replayed, true);
  blocked(buy(s, "kevin", "o2"), "buyer-has-uncollected-order");
  for (const [i, buyer] of ["arwyn", "baba", "player", "data", "amelia"].entries()) ok(buy(s, buyer, `extra${i}`));
  blocked(buy(s, "sub", "overflow"), "queue-full");
});
test("Model proposals cannot purchase and workers cannot double-book existing work", () => {
  const s = fresh(); blocked(buy(s, "kevin", "fake", { authority: "model" }), "model-cannot-authorize");
  ok(buy(s, "kevin", "o1")); s.conflictingWork = ["sub"];
  blocked(accept(s, "sub", "o1"), "existing-work-conflict");
  assert.equal(s.orders.o1.status, "queued"); audit(s);
});
test("Admission requires declared staff and declines new sales when both pickup slots are full", () => {
  const s = fresh(); s.declaredWorkers = [];
  blocked(buy(s, "kevin", "o1"), "no-declared-worker");
  s.declaredWorkers = ["sub"];
  blocked(buy(s, "sub", "own-with-no-other-worker"), "no-declared-worker");
  s.declaredWorkers = [...WORKERS];
  ok(buy(s, "kevin", "o1")); ok(accept(s, "sub", "o1")); ok(start(s, "o1"));
  advance(s, 30); ok(place(s, "o1"));
  ok(buy(s, "arwyn", "o2")); ok(accept(s, "sub", "o2")); ok(start(s, "o2"));
  advance(s, 30); ok(place(s, "o2"));
  blocked(buy(s, "baba", "o3"), "pickup-shelf-full");
});
test("Retained cups permit repeat demand but never bypass an empty customer purse", () => {
  const s = fresh();
  for (let i = 1; i <= 2; i++) {
    ok(buy(s, "player", `p${i}`)); ok(accept(s, "sub", `p${i}`)); ok(start(s, `p${i}`));
    advance(s, 30); ok(place(s, `p${i}`)); ok(collect(s, "player", `p${i}`));
  }
  assert.equal(s.accounts.player, 0); assert.equal(s.accounts.sub, 9);
  blocked(buy(s, "player", "p3"), "insufficient-funds");
  assert.equal(Object.keys(s.cups).length, 2); assert(Object.values(s.cups).every((c) => c.consumeCount === 0));
});
test("Four carried cups stop checkout; drinking frees capacity and a paid order reserves the next slot", () => {
  let s = fresh();
  for (let i = 1; i <= 4; i++) {
    ok(buy(s, "kevin", `k${i}`)); ok(accept(s, "sub", `k${i}`)); ok(start(s, `k${i}`));
    advance(s, 30); ok(place(s, `k${i}`));
    assert.equal(futureInventory(s, "kevin"), 1);
    ok(collect(s, "kevin", `k${i}`)); assert.equal(futureInventory(s, "kevin"), 0);
  }
  assert.equal(carried(s, "kevin"), 4); blocked(buy(s, "kevin", "k5"), "inventory-full");
  ok(consume(s, "kevin", "k1")); assert.equal(carried(s, "kevin"), 3);
  ok(buy(s, "kevin", "k5")); s = reload(s);
  assert.equal(carried(s, "kevin") + futureInventory(s, "kevin"), 4);
  blocked(buy(s, "kevin", "k6"), "inventory-full");
  ok(refund(s, "kevin", "k5")); assert.equal(futureInventory(s, "kevin"), 0);
  ok(buy(s, "kevin", "k6")); ok(refund(s, "kevin", "k6"));
});
test("Oldest eligible order wins and a worker cannot fulfil their own purchase", () => {
  const s = fresh(); ok(buy(s, "kevin", "o1")); ok(buy(s, "arwyn", "o2"));
  blocked(accept(s, "sub", "o2"), "older-eligible-order"); ok(accept(s, "sub", "o1"));
  const own = fresh(); ok(buy(own, "sub", "own"));
  blocked(accept(own, "sub", "own"), "self-purchase-work-not-in-prototype"); ok(accept(own, "northern", "own"));
});
test("Reload preserves queued, assigned, ready, retained and consumed item states", () => {
  let s = fresh(); ok(buy(s, "kevin", "o1")); s = reload(s); ok(accept(s, "sub", "o1")); s = reload(s);
  ok(start(s, "o1")); advance(s, 30); ok(place(s, "o1")); s = reload(s);
  ok(collect(s, "kevin", "o1")); s = reload(s); ok(consume(s, "kevin", "o1")); reload(s);
});

const comparisons = [
  run({ name: "One worker, one brewer", workerCount: 1 }),
  run({ name: "Two workers, same one brewer", workerCount: 2 }),
  run({ name: "Machine-bound one worker", workerCount: 1, placementMinutes: 0 }),
  run({ name: "Machine-bound two workers", workerCount: 2, placementMinutes: 0 }),
];
assert.deepEqual(comparisons[0].paidAt, [30, 60, 90, 120, 150, 180]);
assert.deepEqual(comparisons[1].paidAt, [30, 50, 70, 90, 110, 130]);
assert.deepEqual(comparisons[2].paidAt, [20, 40, 60, 80, 100, 120]);
assert.deepEqual(comparisons[3].paidAt, comparisons[2].paidAt);
assert.equal(comparisons[0].balances.sub, 17);
assert.equal(comparisons[1].balances.sub, 11);
assert.equal(comparisons[1].balances.northern, 8);
test("Worker tie priority rotates after completion without changing machine-bound throughput", () => {
  assert.equal(comparisons[3].balances.sub, 11); assert.equal(comparisons[3].balances.northern, 8);
  assert.deepEqual(comparisons[3].orders.map((o) => o.worker), ["sub", "northern", "sub", "northern", "sub", "northern"]);
  assert.deepEqual(comparisons[3].paidAt, comparisons[2].paidAt);
});

const edgeScenarios = [
  run({ name: "No demand, two willing workers", workerCount: 2, demand: [] }),
  run({ name: "Six orders, both workers decline", workerCount: 0 }),
  run({ name: "Second worker declines", workerCount: 1 }),
  run({ name: "One order, two willing workers", workerCount: 2, demand: DEMAND.slice(0, 1) }),
  run({ name: "Customers absent, two-slot shelf fills", workerCount: 2, pickup: false }),
];
test("Low/no demand and refusal create no wages or implicit customers", () => {
  assert.equal(edgeScenarios[0].completed, 0); assert.deepEqual(edgeScenarios[0].balances, initial);
  assert.equal(edgeScenarios[1].completed, 0); assert.equal(edgeScenarios[1].balances.cafe, 34);
  assert.equal(Object.values(edgeScenarios[1].holds).reduce((sum, h) => sum + (h.account === "cafe" ? h.amount : 0), 0), 17);
  assert.deepEqual(edgeScenarios[2].paidAt, comparisons[0].paidAt);
  assert.equal(edgeScenarios[3].completed, 1); assert.equal(edgeScenarios[3].balances.northern, 2);
});
test("Absent buyers fill shelf; paid staff keep wages while future work waits", () => {
  const r = edgeScenarios[4]; assert.equal(r.completed, 2); assert.equal(r.shelfUsed, 2);
  assert.equal(r.orders.filter((o) => o.status === "queued").length, 4);
  assert.equal(r.balances.sub, 7); assert.equal(r.balances.northern, 4); assert.equal(r.balances.cafe, 30);
  assert.equal(Object.values(r.holds).reduce((sum, h) => sum + (h.account === "cafe" ? h.amount : 0), 0), 13);
});

const output = {
  kind: "Independent synthetic design model; not implementation, engine, navigation, UI, save compatibility or enjoyment proof",
  date: "2026-11-01", node: process.version,
  sourceBase: "a26714e03192a17acaa963d7d2681e74a1ac425b", initial,
  assumptions: [
    "Town-coin prototype: price 2, entire price reserved for completed preparation plus named counter placement wage. No retained margin.",
    "Only new café order/cup transfers modeled. Existing café 5/grocery 4 payroll reservations remain protected; their attendance, payouts, debts and library flow are not simulated here.",
    "20-minute brew + 10-minute counter placement are illustrative game-time parameters, not measured gameplay timing. One brewer and two pickup slots.",
    "A worker remains occupied for both stages. Acceptance requires a free brewer and reserves it until the engine starts brewing; brewer is released for placement. A paused brewer retains its station until resume or explicit abandonment.",
    "One active uncollected order per buyer; maximum six active orders. Shelf slot is reserved at acceptance until collection. Cup ownership belongs to buyer; café has custody while ready.",
    "Four carried cups maximum per actor; buy reserves a future inventory slot until collect or refund. Consumption frees a carried slot. Oldest eligible order first, no self-fulfillment, rotating worker tie priority after completion.",
    "Internal waiting-brewer state means an accepted brewer lease awaiting an engine start, not waiting for another worker to release it. It translates to the spec's brewing phase including approach. The model assumes immediate approach.",
    "Arrival, worker acceptance, immediate ready-cup pickup and all presence are scripted. Pathing, geometry, traffic, actual consent and order freshness are not simulated.",
    "No ingredient, maintenance, recruiting, fixed-shift or equipment cost is modeled. Extra staff are available willing residents; no new resident is created.",
    "No circulation forecast: six purchases are a fixed demand input, not generated by increased staffing or recycled wages.",
    "Admission needs at least one declared available worker and fewer than two ready cups. Availability is not binding acceptance: the refusal case scripts workers declining actual offers after they had declared availability.",
    "Full worker-purse/earned-payable fallback is not modeled: no purse can reach the engine cap 999 from these conserved source balances totaling 90. Production must preserve earned obligations if a recipient cannot accept payment.",
    "The model records identity, state and receipts across JSON reload only. Production save migration, invalid imported saves and external-asset double-claim protection remain separate tests.",
    "Engine placement helper authority is hardwired in this private model. It does not prove production authorization, caller authentication or resistance to forged served output.",
  ],
  auditCount, commandCount, tests, comparisons, edgeScenarios,
};
writeFileSync(new URL("service-model-results.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
const rows = comparisons.map((r) => `| ${r.name} | ${r.completed} | ${r.paidAt.join(", ")} | ${r.meanWait.toFixed(1)} | ${r.balances.sub} / ${r.balances.northern} |`).join("\n");
const markdown = `# Coffee service: synthetic staffing experiment\n\nIndependent reference model, **not game implementation or UI proof**. Source-bound opening identity balances match town.ts at ${output.sourceBase}. Node ${output.node}.\n\n## Parameters and demand\n\nPrice and per-order wage are both **2 town coins**. The café receives the sale and reserves its entire price until preparation and labelled counter placement finish. This is a proposed new piecework agreement, separate from existing 5-coin café shifts. A cup is buyer-owned at readiness, held at the counter, explicitly collected, then optionally consumed once. Buying coffee therefore funds actual work; consuming it is not a condition of earned pay.\n\nFour scripted buyers arrive at minute 0 (Kevin, Arwyn, Baba, player); Data and Amelia arrive at minute 40. They each buy once. Same six customers, same 12 coins of sales, same brewer, same two shelf slots in each comparison. Immediate pickup is a declared simplifying assumption. One worker remains assigned through 20 game minutes of brewing and 10 of placement. Acceptance needs a free brewer and shelf slot. The machine is free during placement, allowing two workers to overlap stages. Purchase admission needs declared staff and a pickup shelf that is not already full of ready cups; declaration is not binding agreement to each order. Oldest eligible orders are served first and worker tie priority rotates after completion; nobody fulfils their own order. Checkout reserves a future inventory slot against the four-carried-cup ceiling, releasing that reservation on collection or refund. These timings are illustrative, not observed.\n\n| Case | Completed | Ready minutes | Mean wait, minutes | Ending Sub / Northern |\n|---|---:|---|---:|---|\n${rows}\n\nThe second worker finishes the fixed six orders 50 minutes sooner (180 → 130) and lowers mean wait by 25 minutes (91.7 → 66.7). It creates no extra demand or sales: both variants pay 12 coins in wages. In the deliberately machine-bound variant (placement time zero), both worker counts finish at minute 120: additional labor has no effect when the single brewer is the entire bottleneck. Rotating selection shares the machine-bound work between the two workers without improving its throughput. Route congestion, slower collection or different stage timings can erase the modeled gain.\n\nFinal ordinary customer balances are Kevin 9, Arwyn 6, Baba 7, player 2, Data 4, Amelia 5. Café ends 22, grocery 16; total stays 90. With one worker Sub earns 12 and ends 17, Northern stays 2. With two workers each earns 6; Sub ends 11 and Northern 8. Original café 5 and grocery 4 payroll reservations remain intact throughout. The new per-order reservations all settle. The café retains zero margin: this model supports per-order labor only, not unmodeled operating costs or idle payroll.\n\n## Refusal, absence and conservation\n\n- No customers: two willing workers earn nothing; all opening accounts remain unchanged.\n- Both workers declare availability but then decline actual offers: all six orders remain cancellable; café holds 34 coins including 12 of new wage/refund obligations plus its existing 5 reservation. No work is invented.\n- One order and two willing workers: one completion, one wage; willingness alone does not fund the second person.\n- Buyers absent: two cups become ready and their workers are paid. Both pickup slots then remain occupied, so the other four orders wait. Café 30 includes 8 reserved for those orders and the existing 5 payroll hold; Sub 7, Northern 4. A buyer can collect later to free capacity. There is no auto-drink, expiry, theft or unpaid wage reversal.\n- Paused in-progress work retains its progress and reservation across JSON reload. A paused brewer also occupies the brewer in this deliberately simple policy; abandonment of incomplete work explicitly releases it and refunds the whole sale, with no partial wage. A production design may instead add a validated pause/release policy.\n\n## Tests and boundaries\n\n${tests.length} scenario tests pass; ${auditCount} invariant audits across ${commandCount} command attempts. Every rejected or replayed command asserts exact unchanged state. Every accepted mutation audits 90 total coins, identity accounts, reconciliation against unique journal entries, preserved legacy reservations, funding, bounded queue/shelf/brewer/worker use, one cup per completed order and exactly one wage/consumption.\n\n${tests.map((t) => `- ${t.name}.`).join("\n")}\n\nModel acceptance cases do not replace engine tests. Recipient-purse overflow and retained earned-payable handling are not modeled: the conserved 90-coin fixture cannot fill the engine purse cap of 999. Production must retain a completed wage obligation if its recipient cannot accept settlement. The internal waiting-brewer state is an accepted exclusive brewer lease awaiting engine start; it maps to the specification's brewing phase including approach, not a second worker queued behind an occupied brewer. Approach is immediate in this model. The placement helper hardwires engine authority; it does not prove caller authentication or rejection of forged service output in production. Production must also verify physical presence and reachable counter geometry, interruption/speed/offline scheduling, authored voluntary decisions, signed action/revision authority, v1/v2 save compatibility, existing payroll and debts, accessibility and human comprehension/enjoyment. This packet does not validate external settlement, token export, NFT minting or replay prevention across separate copied saves.\n\n## Reproduce\n\nRun from the isolated checkout with Node 24:\n\n\`\`\`sh\n/Users/arwynhughes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node docs/implementation/a02-coffee-service-2026-11-01-evidence/service-model.mjs\n\`\`\`\n\nThe script regenerates service-model-results.json and this report. The JSON retains every order, cup, money journal entry and service event (with account/hold/inventory-reservation snapshots) for the comparative and refusal/absence cases. There are no runtime imports, network calls, real towns or credentials.\n`;
writeFileSync(new URL("service-model.md", import.meta.url), markdown);
console.log(JSON.stringify({ tests: tests.length, audits: auditCount, commands: commandCount, cases: comparisons.map(({ name, paidAt, meanWait }) => ({ name, paidAt, meanWait })), outputs: ["service-model-results.json", "service-model.md"] }, null, 2));
