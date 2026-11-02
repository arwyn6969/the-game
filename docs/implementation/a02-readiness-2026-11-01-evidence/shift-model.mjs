// Independent, source-bound design experiment. No game implementation or live services.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const OPENING = { kevin: 11, arwyn: 8, sub: 5, northern: 2, baba: 9, player: 4, data: 6, amelia: 7, cafe: 22, grocery: 16 };
const PEOPLE = Object.keys(OPENING).filter((id) => !["cafe", "grocery"].includes(id));
const WORKERS = ["player", "sub", "northern"];
const PRICE = 2, FEE = 5, REQUIRED = 180;
const townSource = readFileSync(new URL("../../../src/game/town.ts", import.meta.url), "utf8");
for (const id of PEOPLE) {
  const value = townSource.match(new RegExp(`id: "${id}"(?: as const)?,[\\s\\S]*?money: (\\d+)`));
  assert(value, `Missing source actor ${id}`);
  assert.equal(Number(value[1]), OPENING[id]);
}
assert.match(townSource, /tills: \{ cafe: 22, grocery: 16 \}/);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const total = (s) => sum(Object.values(s.accounts));
const held = (s, account) => sum(Object.values(s.holds).filter((h) => h.account === account).map((h) => h.amount));
const free = (s, account) => s.accounts[account] - held(s, account);
const unfinished = (o) => ["queued", "brewing", "placing"].includes(o.stage);
const unresolved = (o) => unfinished(o) || ["ready", "refund-pending"].includes(o.stage);
const usesSlot = (o) => ["brewing", "placing", "ready"].includes(o.stage);
const carried = (s, who) => Object.values(s.cups).filter((c) => c.custody === who).length;
const inventoryHeld = (s, who) => Object.values(s.orders).filter((o) => o.buyer === who && (unfinished(o) || o.stage === "ready")).length;
let audits = 0, commands = 0;
const tests = [];

function create(overrides = {}) {
  const accounts = { ...OPENING, ...overrides };
  const s = { version: 1, day: 1, minute: 0, revision: 0, accounts,
    opening: structuredClone(accounts), openingTotal: sum(Object.values(accounts)),
    holds: { legacyCafe: { account: "cafe", amount: 5 }, legacyGrocery: { account: "grocery", amount: 4 } },
    shifts: {}, orders: {}, cups: {}, receipts: {}, transactions: [], events: [],
    declaredWorkers: [...WORKERS], boundedNpcBuyers: [], nextWorker: 0, globalPaused: false };
  audit(s);
  return s;
}
function audit(s) {
  audits++;
  assert.equal(total(s), s.openingTotal);
  assert.deepEqual(Object.keys(s.accounts), Object.keys(OPENING));
  const expected = structuredClone(s.opening);
  for (const t of s.transactions) { assert(t.amount > 0); expected[t.from] -= t.amount; expected[t.to] += t.amount; }
  assert.deepEqual(s.accounts, expected);
  assert.equal(new Set(s.transactions.map((t) => t.id)).size, s.transactions.length);
  assert.deepEqual(s.holds.legacyCafe, { account: "cafe", amount: 5 });
  assert.deepEqual(s.holds.legacyGrocery, { account: "grocery", amount: 4 });
  for (const [id, value] of Object.entries(s.accounts)) {
    assert(Number.isSafeInteger(value) && value >= 0);
    assert(free(s, id) >= 0);
    if (PEOPLE.includes(id)) assert(value <= 999);
  }
  assert(Object.values(s.orders).filter(usesSlot).length <= 2);
  assert(Object.values(s.orders).filter((o) => o.stage === "brewing").length <= 1);
  assert(Object.values(s.orders).filter(unresolved).length <= 6);
  assert(Object.values(s.shifts).filter((w) => w.status === "active").length <= 2);
  for (const who of PEOPLE) {
    assert(carried(s, who) + inventoryHeld(s, who) <= 4);
    assert(Object.values(s.orders).filter((o) => o.buyer === who && unresolved(o)).length <= 1);
    assert(Object.values(s.shifts).filter((w) => w.worker === who && w.status === "active").length <= 1);
  }
  for (const w of Object.values(s.shifts)) {
    assert.equal(w.eligible, w.attendance.length);
    assert.equal(new Set(w.attendance).size, w.attendance.length);
    assert(w.eligible >= 0 && w.eligible <= REQUIRED);
    assert.equal(s.holds[w.id]?.amount ?? 0, w.status === "settled" ? 0 : FEE);
    assert.equal(s.transactions.filter((t) => t.id === `wage:${w.id}`).length, w.status === "settled" ? 1 : 0);
    if (w.status !== "active") assert.equal(w.eligible, REQUIRED);
    assert(Object.values(s.orders).filter((o) => o.assignedShift === w.id).length <= 1);
  }
  for (const o of Object.values(s.orders)) {
    assert.equal(s.transactions.filter((t) => t.id === `sale:${o.id}`).length, 1);
    const committed = ["ready", "collected", "consumed"].includes(o.stage);
    assert.equal(s.holds[o.id]?.amount ?? 0, unfinished(o) || o.stage === "refund-pending" ? PRICE : 0);
    assert.equal(s.transactions.filter((t) => t.id === `refund:${o.id}`).length, o.stage === "refunded" ? 1 : 0);
    assert.equal(Object.values(s.cups).filter((c) => c.order === o.id).length, committed ? 1 : 0);
    assert(o.brew >= 0 && o.brew <= 20 && o.place >= 0 && o.place <= 10);
    assert.equal(sum(o.contributions.filter((x) => x.phase === "brewing").map((x) => x.minutes)), o.brew);
    assert.equal(sum(o.contributions.filter((x) => x.phase === "placing").map((x) => x.minutes)), o.place);
    if (o.assignedShift) {
      const shift = s.shifts[o.assignedShift];
      assert(shift && shift.status === "active");
      assert.notEqual(shift.worker, o.buyer);
      assert(["brewing", "placing"].includes(o.stage));
    }
    if (committed) {
      assert.equal(o.brew, 20); assert.equal(o.place, 10);
      const cup = s.cups[`cup:${o.id}`];
      assert.equal(cup.owner, o.buyer);
      assert.equal(cup.custody, o.stage === "ready" ? "counter" : o.stage === "collected" ? o.buyer : "consumed");
      assert.equal(cup.consumed, o.stage === "consumed");
    }
  }
  // No order completion can create a piecework wage in the shift candidate.
  assert(s.transactions.filter((t) => t.kind === "wage").every((t) => s.shifts[t.ref]));
}
const fail = (why) => { throw new Error(why); };
function event(s, kind, data = {}) {
  s.events.push({ day: s.day, minute: s.minute, kind, ...data,
    accounts: structuredClone(s.accounts), holds: structuredClone(s.holds) });
}
function move(s, from, to, amount, id, kind, ref, hold = null) {
  if (PEOPLE.includes(to) && s.accounts[to] + amount > 999) return false;
  if (hold) {
    if (s.holds[hold]?.account !== from || s.holds[hold].amount !== amount) fail("hold-mismatch");
    delete s.holds[hold];
  } else if (free(s, from) < amount) fail("insufficient-unrestricted-funds");
  s.accounts[from] -= amount; s.accounts[to] += amount;
  s.transactions.push({ id, day: s.day, minute: s.minute, from, to, amount, kind, ref });
  return true;
}
function act(s, id, kind, payload, fn, options = {}) {
  commands++;
  const before = JSON.stringify(s), fp = JSON.stringify({ kind, payload, actor: options.actor ?? null });
  let out;
  if (s.receipts[id]) out = s.receipts[id].fp === fp ? { ok: true, replay: true, value: s.receipts[id].value } : { ok: false, reason: "conflicting-id" };
  else if (options.revision !== undefined && options.revision !== s.revision) out = { ok: false, reason: "stale-revision" };
  else if (options.authority === "model") out = { ok: false, reason: "model-cannot-authorize" };
  else {
    const d = structuredClone(s);
    try {
      const value = fn(d) ?? null;
      d.revision++; d.receipts[id] = { fp, value }; audit(d); Object.assign(s, d);
      out = { ok: true, value };
    } catch (e) { out = { ok: false, reason: e.message }; }
  }
  if (!out.ok || out.replay) assert.equal(JSON.stringify(s), before);
  audit(s); return out;
}
function startShift(s, worker, id, options = {}) {
  return act(s, `accept:${id}`, "accept-shift", { worker, id, fee: FEE, minutes: REQUIRED }, (d) => {
    if (!WORKERS.includes(worker) || !d.declaredWorkers.includes(worker)) fail("worker-not-consenting");
    if (d.shifts[id]) fail("existing-shift");
    if (Object.values(d.shifts).some((w) => w.worker === worker && w.status === "active")) fail("already-committed");
    if (Object.values(d.shifts).filter((w) => w.status === "active").length >= 2) fail("staff-ceiling");
    if (free(d, "cafe") < FEE) fail("unfunded-shift");
    d.holds[id] = { account: "cafe", amount: FEE };
    d.shifts[id] = { id, worker, eligible: 0, attendance: [], status: "active", paused: false };
    event(d, "shift-accepted", { id, worker }); return id;
  }, options);
}
function buy(s, buyer, id, options = {}) {
  return act(s, options.commandId ?? `buy:${id}`, "buy", { buyer, id }, (d) => {
    if (!PEOPLE.includes(buyer)) fail("unknown-buyer");
    if (d.orders[id]) fail("existing-order");
    if (!d.declaredWorkers.some((w) => w !== buyer)) fail("no-other-declared-worker");
    if (Object.values(d.orders).filter(unresolved).length >= 6) fail("queue-full");
    if (Object.values(d.orders).filter((o) => o.stage === "ready").length >= 2) fail("counter-full");
    if (Object.values(d.orders).some((o) => o.buyer === buyer && unresolved(o))) fail("existing-ticket");
    if (carried(d, buyer) + inventoryHeld(d, buyer) >= 4) fail("inventory-full");
    if (d.boundedNpcBuyers.includes(buyer)) {
      const earned = sum(d.transactions.filter((t) => t.kind === "wage" && t.to === buyer).map((t) => t.amount));
      const spent = sum(d.transactions.filter((t) => t.kind === "sale" && t.from === buyer).map((t) => t.amount));
      const refunded = sum(d.transactions.filter((t) => t.kind === "refund" && t.to === buyer).map((t) => t.amount));
      if (2 + earned - spent + refunded < PRICE) fail("npc-discretionary-limit");
    }
    move(d, buyer, "cafe", PRICE, `sale:${id}`, "sale", id);
    d.holds[id] = { account: "cafe", amount: PRICE };
    d.orders[id] = { id, buyer, day: d.day, minute: d.minute, stage: "queued", brew: 0, place: 0, assignedShift: null, contributions: [] };
    event(d, "order-paid-escrowed", { id, buyer }); return id;
  }, options);
}
function pauseShift(s, id, paused) {
  return act(s, `pause:${id}:${s.day}:${s.minute}:${paused}`, "pause-shift", { id, paused }, (d) => {
    const w = d.shifts[id]; if (w?.status !== "active") fail("not-active"); w.paused = paused;
    if (paused) for (const o of Object.values(d.orders)) if (o.assignedShift === id) o.assignedShift = null;
    event(d, paused ? "shift-paused" : "shift-resumed", { id });
  });
}
function tryWage(s, shift) {
  if (shift.status !== "earned") return;
  if (move(s, "cafe", shift.worker, FEE, `wage:${shift.id}`, "wage", shift.id, shift.id)) {
    shift.status = "settled"; event(s, "shift-paid", { id: shift.id, worker: shift.worker });
  }
}
function tryRefund(s, order) {
  if (order.stage !== "refund-pending") return;
  if (move(s, "cafe", order.buyer, PRICE, `refund:${order.id}`, "refund", order.id, order.id)) {
    order.stage = "refunded"; event(s, "refund-paid", { id: order.id });
  }
}
function cancel(s, buyer, id, options = {}) {
  return act(s, options.commandId ?? `cancel:${id}`, "cancel", { buyer, id }, (d) => {
    const o = d.orders[id]; if (o?.buyer !== buyer) fail("wrong-buyer");
    if (!unfinished(o)) fail("not-refundable");
    o.stage = "refund-pending"; o.assignedShift = null;
    event(d, "cancelled-refund-owed", { id }); tryRefund(d, o);
  }, options);
}
function collect(s, buyer, id, options = {}) {
  return act(s, options.commandId ?? `collect:${id}`, "collect", { buyer, id }, (d) => {
    const o = d.orders[id]; if (o?.buyer !== buyer) fail("wrong-buyer");
    if (o.stage !== "ready") fail("not-ready");
    o.stage = "collected"; d.cups[`cup:${id}`].custody = buyer;
    event(d, "collected", { id, buyer });
  }, options);
}
function drink(s, buyer, id, options = {}) {
  return act(s, options.commandId ?? `drink:${id}`, "drink", { buyer, id }, (d) => {
    const o = d.orders[id]; if (o?.buyer !== buyer) fail("wrong-buyer");
    if (o.stage !== "collected") fail("not-held");
    o.stage = "consumed"; d.cups[`cup:${id}`].custody = "consumed"; d.cups[`cup:${id}`].consumed = true;
    event(d, "consumed", { id, buyer });
  }, options);
}
function settle(s) {
  return act(s, `settle:${s.day}:${s.minute}:${s.revision}`, "settle", {}, (d) => {
    for (const w of Object.values(d.shifts)) tryWage(d, w);
    for (const o of Object.values(d.orders)) tryRefund(d, o);
  });
}
function assign(s) {
  if (s.minute >= REQUIRED || s.globalPaused) return;
  const workers = Object.values(s.shifts).filter((w) => w.status === "active" && !w.paused);
  workers.sort((a, b) => ((WORKERS.indexOf(a.worker) - s.nextWorker + 3) % 3) - ((WORKERS.indexOf(b.worker) - s.nextWorker + 3) % 3));
  for (const w of workers) {
    if (Object.values(s.orders).some((o) => o.assignedShift === w.id)) continue;
    const o = Object.values(s.orders).find((o) => unfinished(o) && !o.assignedShift && o.buyer !== w.worker &&
      (o.stage !== "queued" || (Object.values(s.orders).filter(usesSlot).length < 2 && !Object.values(s.orders).some((x) => x.stage === "brewing"))));
    if (!o) continue;
    if (o.stage === "queued") o.stage = "brewing";
    o.assignedShift = w.id; s.nextWorker = (WORKERS.indexOf(w.worker) + 1) % 3;
    event(s, "order-assigned", { id: o.id, shift: w.id, worker: w.worker, retainedBrew: o.brew, retainedPlacement: o.place });
  }
  audit(s);
}
function tick(s, requestedMinute = s.minute + 1) {
  const before = JSON.stringify(s);
  if (s.globalPaused || requestedMinute <= s.minute) { assert.equal(JSON.stringify(s), before); return false; }
  assert.equal(requestedMinute, s.minute + 1); assert(requestedMinute <= REQUIRED);
  s.minute = requestedMinute;
  for (const o of Object.values(s.orders)) {
    const w = s.shifts[o.assignedShift];
    if (!w || w.status !== "active" || w.paused) continue;
    const phase = o.stage;
    if (phase !== "brewing" && phase !== "placing") continue;
    const previous = o.contributions.at(-1);
    if (previous?.shift === w.id && previous.phase === phase) previous.minutes++;
    else o.contributions.push({ shift: w.id, worker: w.worker, phase, minutes: 1 });
    if (phase === "brewing") {
      o.brew++;
      if (o.brew === 20) { o.stage = "placing"; event(s, "brewing-finished", { id: o.id }); }
    } else {
      o.place++;
      if (o.place === 10) {
        o.stage = "ready"; o.assignedShift = null; o.readyDay = s.day; o.readyMinute = s.minute;
        delete s.holds[o.id];
        s.cups[`cup:${o.id}`] = { id: `cup:${o.id}`, order: o.id, owner: o.buyer, custody: "counter", consumed: false };
        event(s, "ready-revenue-released", { id: o.id, amount: PRICE });
      }
    }
  }
  for (const w of Object.values(s.shifts)) {
    if (w.status !== "active" || w.paused) continue;
    w.eligible++; w.attendance.push(`${s.day}:${s.minute}`);
    if (w.eligible === REQUIRED) {
      w.status = "earned";
      for (const o of Object.values(s.orders)) if (o.assignedShift === w.id) o.assignedShift = null;
      event(s, "shift-earned", { id: w.id }); tryWage(s, w);
    }
  }
  if (s.minute === REQUIRED) {
    for (const o of Object.values(s.orders)) o.assignedShift = null;
    event(s, "window-ended");
  }
  s.revision++; audit(s); return true;
}
function nextDay(s) {
  assert.equal(s.minute, REQUIRED);
  s.day++; s.minute = 0; s.revision++; event(s, "new-window"); audit(s);
}
function reload(s) { const result = JSON.parse(JSON.stringify(s)); assert.deepEqual(result, s); audit(result); return result; }
function must(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result; }
function mustFail(result, reason) { assert.equal(result.ok, false); if (reason) assert.equal(result.reason, reason); }
function pickupAll(s, consume = false) {
  for (const o of Object.values(s.orders).filter((o) => o.stage === "ready")) {
    must(collect(s, o.buyer, o.id)); if (consume) must(drink(s, o.buyer, o.id));
  }
}
function runWindow(s, purchases = [], { pickup = true, consume = false, afterTick = null } = {}) {
  const decisions = [];
  for (let minute = s.minute; minute <= REQUIRED; minute++) {
    for (const purchase of purchases.filter((x) => x.minute === minute)) {
      const result = buy(s, purchase.buyer, purchase.id); decisions.push({ ...purchase, ...result });
    }
    if (pickup) pickupAll(s, consume);
    if (afterTick) afterTick(s);
    assign(s);
    if (minute < REQUIRED) tick(s);
  }
  return decisions;
}
function snapshot(s) {
  return { day: s.day, accounts: structuredClone(s.accounts), holds: structuredClone(s.holds),
    unrestrictedCafe: free(s, "cafe"), total: total(s),
    shifts: Object.values(s.shifts).map((w) => ({ id: w.id, worker: w.worker, status: w.status, eligible: w.eligible })),
    orderStages: Object.fromEntries(Object.values(s.orders).map((o) => [o.id, o.stage])) };
}
function test(name, fn) { fn(); tests.push({ name, passed: true }); }
const comparison = [];
const demand = [{ buyer: "kevin", minute: 0 }, { buyer: "arwyn", minute: 0 }, { buyer: "baba", minute: 0 }, { buyer: "player", minute: 0 }, { buyer: "data", minute: 40 }, { buyer: "amelia", minute: 40 }];
for (const workers of [["sub"], ["sub", "northern"]]) {
  test(`${workers.length} funded shift(s), same six purchases`, () => {
    const s = create(); workers.forEach((who) => must(startShift(s, who, `s:${who}:1`)));
    const decisions = runWindow(s, demand.map((o, i) => ({ ...o, id: `o:${i}` })));
    assert(decisions.every((d) => d.ok));
    const ready = Object.values(s.orders).map((o) => o.readyMinute);
    assert.deepEqual(ready, workers.length === 1 ? [30, 60, 90, 120, 150, 180] : [30, 50, 70, 90, 110, 130]);
    assert.equal(s.accounts.cafe, 22 + 12 - FEE * workers.length);
    assert.equal(Object.values(s.cups).length, 6);
    assert.equal(s.transactions.filter((t) => t.kind === "wage").length, workers.length);
    comparison.push({ workers, ready, meanReadyWait: sum(Object.values(s.orders).map((o) => o.readyMinute - o.minute)) / 6,
      sales: 12, wages: workers.length * FEE, retainedReceiptLessWage: 12 - FEE * workers.length, end: snapshot(s), events: s.events });
  });
}

const sevenDay = [];
function week(name, days, choose) {
  let s = create(); const rows = [];
  for (let day = 1; day <= days; day++) {
    if (day > 1) nextDay(s);
    const plan = choose(day, s);
    const hires = (plan.workers ?? []).map((w) => ({ worker: w, ...startShift(s, w, `shift:${day}:${w}`) }));
    const decisions = runWindow(s, (plan.buyers ?? []).map((buyer, i) => ({ buyer, minute: i * 40, id: `order:${day}:${i}` })), { consume: true });
    s = reload(s);
    rows.push({ day, hires, purchases: decisions, ...snapshot(s) });
  }
  return { name, days, rows, final: snapshot(s), transactions: s.transactions };
}
test("Seven days: explicit cooperative circulation", () => {
  const x = week("Cooperative 2,2,3,3 purchase schedule", 7, (day) => {
    const worker = day % 2 ? "player" : "sub", buyer = day % 2 ? "sub" : "player";
    const cups = (day - 1) % 4 < 2 ? 2 : 3;
    return { workers: [worker], buyers: Array(cups).fill(buyer) };
  });
  assert(x.rows.every((r) => r.hires.every((h) => h.ok) && r.purchases.every((p) => p.ok)));
  assert.equal(x.final.accounts.cafe, 21); sevenDay.push(x);
});
test("28-day cooperative repetition returns every account to opening", () => {
  const x = week("Seven full four-day circulation cycles", 28, (day) => ({ workers: [day % 2 ? "player" : "sub"], buyers: Array((day - 1) % 4 < 2 ? 2 : 3).fill(day % 2 ? "sub" : "player") }));
  assert.deepEqual(x.final.accounts, OPENING); assert.equal(x.final.unrestrictedCafe, 17);
  assert(x.rows.every((r) => r.purchases.every((p) => p.ok)));
  sevenDay.push({ ...x, rows: x.rows.filter((r) => r.day % 4 === 0) });
});
test("Seven days: bounded NPC budget after a real funded bootstrap shift", () => {
  const x = week("NPC initial2 plus actual wages; one quiet Sub bootstrap shift", 7, (day, s) => {
    s.boundedNpcBuyers = ["sub", "northern"];
    if (day === 1) return { workers: ["sub"] };
    const cycleDay = day - 1;
    return { workers: [cycleDay % 2 ? "player" : "sub"], buyers: Array((cycleDay - 1) % 4 < 2 ? 2 : 3).fill(cycleDay % 2 ? "sub" : "player") };
  });
  assert(x.rows.every((r) => r.hires.every((h) => h.ok) && r.purchases.every((p) => p.ok)));
  assert.equal(x.rows[0].accounts.sub, 10); assert.equal(x.rows[0].accounts.cafe, 17);
  assert.equal(x.final.accounts.cafe, 15); sevenDay.push(x);
});
test("Initial NPC discretion is a spending ceiling, not new money", () => {
  const s = create(); s.boundedNpcBuyers = ["sub"];
  must(startShift(s, "player", "work")); must(buy(s, "sub", "first")); assign(s);
  for (let i = 0; i < 30; i++) tick(s); pickupAll(s, true);
  assert.equal(s.accounts.sub, 3);
  mustFail(buy(s, "sub", "second"), "npc-discretionary-limit");
  assert.equal(s.openingTotal, 90);
});
test("Seven days: no customers still honors accepted quiet shifts", () => {
  const x = week("No customers; willing player", 7, () => ({ workers: ["player"] }));
  assert.deepEqual(x.rows.map((r) => r.hires[0].ok), [true, true, true, false, false, false, false]);
  assert.equal(x.final.accounts.cafe, 7); assert.equal(x.final.accounts.player, 19); sevenDay.push(x);
});
test("Seven days: low demand and concentrated wages", () => {
  const x = week("One daily attempted coffee; player saves wages", 7, () => ({ workers: ["player"], buyers: ["sub"] }));
  assert.deepEqual(x.rows.map((r) => r.hires[0].ok), [true, true, true, true, false, false, false]);
  assert.equal(x.final.accounts.cafe, 6); assert.equal(x.final.accounts.player, 24); sevenDay.push(x);
});
test("Seven days: staff refuse, no financial obligations invented", () => {
  const x = week("No willing staff", 7, (_, s) => { s.declaredWorkers = []; return { workers: ["sub"], buyers: ["player"] }; });
  assert.deepEqual(x.final.accounts, OPENING); assert(x.rows.every((r) => !r.hires[0].ok && !r.purchases[0].ok)); sevenDay.push(x);
});
test("Seven days: finite outside buyers, worker hoards", () => {
  const buyers = ["kevin", "arwyn", "baba", "data", "amelia", "northern"];
  const x = week("Four attempted purchases daily; player never spends", 7, () => ({ workers: ["player"], buyers: buyers.slice(0, 4) }));
  assert(x.rows.some((r) => r.purchases.some((p) => !p.ok)));
  assert.equal(x.final.accounts.player, 39); sevenDay.push(x);
});
test("Customer escrow cannot bootstrap an unfunded shift", () => {
  const s = create({ cafe: 5 });
  must(buy(s, "player", "prepaid")); assert.equal(s.accounts.cafe, 7); assert.equal(free(s, "cafe"), 0);
  mustFail(startShift(s, "sub", "unfunded"), "unfunded-shift");
  must(cancel(s, "player", "prepaid")); assert.equal(s.accounts.player, 4); assert.equal(s.accounts.cafe, 5);
});
test("Sales release only on ready; shift-funded worker earns no per-cup wage", () => {
  const s = create(); must(startShift(s, "sub", "work"));
  const before = free(s, "cafe"); must(buy(s, "player", "coffee")); assert.equal(free(s, "cafe"), before);
  assign(s); for (let i = 0; i < 29; i++) tick(s);
  assert.equal(free(s, "cafe"), before); assert.equal(s.accounts.sub, 5);
  tick(s); assert.equal(free(s, "cafe"), before + 2); assert.equal(s.accounts.sub, 5);
  mustFail(cancel(s, "player", "coffee"), "not-refundable");
  runWindow(s); assert.equal(s.accounts.sub, 10);
});
test("Partial-work cancellation refunds fully, quiet shift wage survives", () => {
  const s = create(); must(startShift(s, "sub", "work")); must(buy(s, "player", "coffee"));
  assign(s); for (let i = 0; i < 12; i++) tick(s);
  must(cancel(s, "player", "coffee")); const again = cancel(s, "player", "coffee"); assert(again.replay);
  assert.equal(s.accounts.player, 4); assert.equal(s.orders.coffee.brew, 12);
  runWindow(s); assert.equal(s.accounts.sub, 10); assert.equal(s.accounts.cafe, 17);
});
test("Late order stops at shift end; another funded worker resumes provenance", () => {
  let s = create(); must(startShift(s, "sub", "first"));
  for (let i = 0; i < 170; i++) tick(s);
  must(buy(s, "player", "late")); assign(s); for (let i = 0; i < 10; i++) tick(s);
  assert.equal(s.orders.late.brew, 10); assert.equal(s.orders.late.assignedShift, null);
  assert.equal(s.shifts.first.status, "settled"); assert.equal(s.holds.late.amount, 2);
  s = reload(s); nextDay(s); must(startShift(s, "northern", "second")); assign(s);
  for (let i = 0; i < 20; i++) tick(s);
  assert.equal(s.orders.late.stage, "ready"); assert.equal(s.orders.late.readyMinute, 20);
  assert.deepEqual([...new Set(s.orders.late.contributions.map((x) => x.worker))], ["sub", "northern"]);
  assert.equal(s.accounts.sub, 10); assert.equal(s.accounts.northern, 2);
});
test("Pause, reload and duplicate minute preserve work and payroll", () => {
  let s = create(); must(startShift(s, "sub", "work")); must(buy(s, "player", "coffee")); assign(s);
  for (let i = 0; i < 10; i++) tick(s);
  must(pauseShift(s, "work", true)); for (let i = 0; i < 7; i++) tick(s);
  assert.equal(s.orders.coffee.brew, 10); assert.equal(s.shifts.work.eligible, 10);
  s = reload(s); must(pauseShift(s, "work", false)); assert.equal(tick(s, s.minute), false);
  runWindow(s); assert.equal(s.shifts.work.eligible, 173); assert.equal(s.shifts.work.status, "active");
  nextDay(s); for (let i = 0; i < 7; i++) tick(s);
  assert.equal(s.shifts.work.status, "settled"); assert.equal(s.accounts.sub, 10);
});
test("Pausing releases assignment for another funded worker without losing work", () => {
  const s = create(); must(startShift(s, "sub", "first")); must(startShift(s, "northern", "second"));
  must(buy(s, "player", "coffee")); assign(s);
  assert.equal(s.orders.coffee.assignedShift, "first");
  for (let i = 0; i < 8; i++) tick(s);
  must(pauseShift(s, "first", true));
  assert.equal(s.orders.coffee.assignedShift, null); assert.equal(s.orders.coffee.stage, "brewing");
  assert.equal(s.orders.coffee.brew, 8); assert.equal(s.holds.coffee.amount, 2);
  assign(s); assert.equal(s.orders.coffee.assignedShift, "second");
  for (let i = 0; i < 22; i++) tick(s);
  assert.equal(s.orders.coffee.stage, "ready");
  assert.deepEqual(s.orders.coffee.contributions, [
    { shift: "first", worker: "sub", phase: "brewing", minutes: 8 },
    { shift: "second", worker: "northern", phase: "brewing", minutes: 12 },
    { shift: "second", worker: "northern", phase: "placing", minutes: 10 },
  ]);
  assert.equal(s.shifts.first.eligible, 8); assert.equal(s.shifts.second.eligible, 30);
  must(pauseShift(s, "first", false)); runWindow(s);
  assert.equal(s.shifts.second.status, "settled"); assert.equal(s.shifts.first.eligible, 158);
  assert.equal(Object.values(s.cups).length, 1); assert.equal(s.transactions.filter((t) => t.kind === "wage").length, 1);
  assert.equal(s.holds.first.amount, 5);
});
test("Absent customers fill counter; contracted staff still paid", () => {
  const s = create(); must(startShift(s, "sub", "first")); must(startShift(s, "northern", "second"));
  runWindow(s, demand.map((o, i) => ({ ...o, id: `absent:${i}` })), { pickup: false });
  assert.equal(Object.values(s.cups).length, 2); assert.equal(s.accounts.sub, 10); assert.equal(s.accounts.northern, 7);
  assert.equal(s.accounts.cafe, 24); assert.equal(held(s, "cafe"), 13);
  assert.equal(Object.values(s.orders).filter((o) => o.stage === "queued").length, 4);
});
test("Replay/conflict/stale/wrong-owner and consumption cannot duplicate value", () => {
  let s = create(); must(startShift(s, "sub", "work")); must(buy(s, "player", "coffee"));
  assert(buy(s, "player", "coffee").replay);
  mustFail(buy(s, "arwyn", "different", { commandId: "buy:coffee" }), "conflicting-id");
  mustFail(buy(s, "arwyn", "forged", { authority: "model" }), "model-cannot-authorize");
  assign(s); for (let i = 0; i < 30; i++) tick(s);
  mustFail(collect(s, "arwyn", "coffee"), "wrong-buyer");
  mustFail(collect(s, "player", "coffee", { revision: 0 }), "stale-revision");
  must(collect(s, "player", "coffee")); s = reload(s); assert(collect(s, "player", "coffee").replay);
  must(drink(s, "player", "coffee")); assert(drink(s, "player", "coffee").replay);
  assert.equal(Object.values(s.cups).length, 1); assert.equal(s.transactions.filter((t) => t.kind === "sale").length, 1);
});
test("Full worker purse keeps earned wage after coffee consumption", () => {
  const s = create({ sub: 999 }); must(startShift(s, "sub", "work")); must(buy(s, "player", "coffee")); runWindow(s, [], { consume: true });
  assert.equal(s.shifts.work.status, "earned"); assert.equal(s.holds.work.amount, 5); assert.equal(s.orders.coffee.stage, "consumed");
  must(act(s, "other-spend", "other-spend", { from: "sub", amount: 5 }, (d) => move(d, "sub", "grocery", 5, "other-spend", "test-other-spend", "fixture")));
  must(settle(s)); assert.equal(s.shifts.work.status, "settled"); assert.equal(s.accounts.sub, 999);
});
test("Full refund recipient keeps separate pending liability through reload", () => {
  let s = create({ player: 998 }); must(buy(s, "player", "coffee"));
  must(act(s, "other-receipt", "other-receipt", {}, (d) => move(d, "baba", "player", 3, "other-receipt", "test-other-receipt", "fixture")));
  must(cancel(s, "player", "coffee")); assert.equal(s.orders.coffee.stage, "refund-pending"); assert.equal(s.holds.coffee.amount, 2);
  s = reload(s); mustFail(buy(s, "player", "another"), "existing-ticket");
  must(act(s, "other-spend", "other-spend", {}, (d) => move(d, "player", "grocery", 2, "other-spend", "test-other-spend", "fixture")));
  must(settle(s)); assert.equal(s.orders.coffee.stage, "refunded"); assert.equal(s.accounts.player, 999);
});
test("Global pause performs no hidden/offline work", () => {
  const s = create(); must(startShift(s, "sub", "work")); must(buy(s, "player", "coffee")); assign(s);
  s.globalPaused = true; const before = JSON.stringify(s); assert.equal(tick(s), false); assert.equal(JSON.stringify(s), before);
  s.globalPaused = false; tick(s); assert.equal(s.shifts.work.eligible, 1);
});
test("Twelve seeded mixed schedules exactly replay across mid-window reload", () => {
  function scheduled(seed, withReload) {
    let s = create(), random = seed;
    const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
    must(startShift(s, "sub", "sub-shift")); must(startShift(s, "northern", "northern-shift"));
    for (let minute = 0; minute <= REQUIRED; minute++) {
      if (minute % 7 === 0) {
        const op = next() % 6, buyer = PEOPLE[next() % PEOPLE.length];
        const orders = Object.values(s.orders), o = orders.length ? orders[next() % orders.length] : null;
        if (op === 0 || !o) buy(s, buyer, `seed:${seed}:${minute}`);
        else if (op === 1) cancel(s, next() % 3 ? o.buyer : buyer, o.id, { commandId: `cancel:${minute}` });
        else if (op === 2) collect(s, next() % 3 ? o.buyer : buyer, o.id, { commandId: `collect:${minute}` });
        else if (op === 3) drink(s, next() % 3 ? o.buyer : buyer, o.id, { commandId: `drink:${minute}` });
        else if (op === 4) pauseShift(s, next() % 2 ? "sub-shift" : "northern-shift", Boolean(next() % 2));
        else buy(s, buyer, `stale:${minute}`, { revision: 0 });
      }
      if (minute === 90 && withReload) s = reload(s);
      assign(s);
      if (minute < REQUIRED) tick(s);
    }
    audit(s); return s;
  }
  for (let seed = 1; seed <= 12; seed++) assert.deepEqual(scheduled(seed, false), scheduled(seed, true));
});

const summary = { scenarios: tests.length, invariantAudits: audits, commandAttempts: commands,
  comparisons: comparison.map(({ events: _events, ...rest }) => rest),
  sevenDay: sevenDay.map(({ transactions: _transactions, ...rest }) => rest) };
const output = { scope: "Independent synthetic reference model, not actual engine/authorization/UI evidence",
  fixtureNotes: "Ordinary fixtures open at 90. The unfunded-bootstrap fixture changes cafe from 22 to 5 and opens at 73. The worker-full fixture changes sub from 5 to 999 and opens at 1084; the refund-full fixture changes player from 4 to 998 and also opens at 1084. Each fixture conserves its own initially audited total; overrides are separate test inputs, not game transfers or issuance.", node: process.version,
  source: "a26714e03192a17acaa963d7d2681e74a1ac425b", opening: OPENING, tests, summary, comparison, sevenDay };
writeFileSync(new URL("shift-model-results.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
const rows = comparison.map((x) => `| ${x.workers.length} | ${x.ready.join(", ")} | ${x.meanReadyWait.toFixed(1)} | ${x.sales} | ${x.wages} | ${x.end.accounts.cafe} | ${x.end.unrestrictedCafe} |`).join("\n");
const weeks = sevenDay.filter((x) => x.days === 7).map((x) => `### ${x.name.replace("initial2", "initial 2")}\n\n| Day | New funded shifts | Paid coffee orders | Café cash / free | Player / Sub / Northern |\n| --- | ---: | ---: | --- | --- |\n${x.rows.map((r) => `| ${r.day} | ${r.hires.filter((h) => h.ok).length} | ${r.purchases.filter((p) => p.ok).length} | ${r.accounts.cafe} / ${r.unrestrictedCafe} | ${r.accounts.player} / ${r.accounts.sub} / ${r.accounts.northern} |`).join("\n")}\n`).join("\n");
const report = `# Funded café shifts: comparative synthetic study

This model tests a proposed connection between actual coffee sales and existing-style **5-coin / 180-eligible-minute funded shifts**. It does not execute the game engine or establish production readiness, spontaneous demand, comprehension or enjoyment. Source balances are asserted against town.ts at a26714e. Ordinary scenarios open at 90 coins. The unfunded-bootstrap fixture replaces the café's 22 coins with 5 and opens at 73; the worker-full fixture replaces Sub's 5 coins with 999, and the refund-full fixture replaces the player's 4 coins with 998, each opening at 1,084. Every fixture conserves its own initially audited total; these are separate test inputs, not in-game transfers or issuance. Node ${process.version}.

## Funding rule

Reserve the complete 5-coin shift wage from unrestricted café cash before acceptance. Preserve the existing café 5-coin and grocery 4-coin payroll holds. Each new 2-coin coffee payment enters the café with a matching full refund hold, so **prepayment changes unrestricted café cash by zero**. Create the unique buyer-owned ready cup and release its 2-coin refund hold together. That receipt then becomes available for future payroll. There is **no per-cup worker payment** in this candidate. Staff earn their protected wage from eligible attendance even on a quiet day; no later cancellation or lack of drinking reverses it.

This candidate permits full customer cancellation until ready, even after partial work, because its staff compensation is protected independently. Cancellation releases station/inventory resources and either transfers the refund once or retains a named refund-pending hold if the buyer's purse is full. After ready, the cup persists until collection; no refund/expiry is silently invented. Completion and customer collection are separate events.

## One and two workers, identical six orders

Four declared buyers arrive at minute 0; two at minute 40. Brewing occupies one brewer for 20 minutes; placement occupies its worker for 10 more while freeing the brewer. Two pickup slots are reserved from assignment until collection. Immediate collection, perfect attendance and instantaneous travel are explicit simplifying assumptions. Minutes are elapsed eligible intervals from the service-window start; 180 is the end of its last interval, not a claim that the existing 19:00 attendance API accepts a new minute. Work ends at 180; no hidden overtime.

| Funded workers | Ready minutes | Mean wait | Sales | Wages at 180 | Ending café | Unrestricted café |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows}

Two workers complete the same six orders 50 minutes sooner, but sales remain 12 and payroll rises from 5 to 10. Faster service alone does not create enough extra customers to pay for staffing. The previous 2-price/2-fee piecework model pays 12 total and retains 0; one shift retains 7 and two shifts retain 2 before any unmodeled costs. Neither figure is a free surplus: different work commitments and guaranteed quiet-time pay are being compared. The prior machine-bound variant remains evidence that another worker can add no throughput at all.

At this demand level, one shift already completes all six orders by 180. The second shift is therefore a wait-time purchase, not a measured revenue improvement. An additional staff offer needs a complete independent wage reservation and an explicit service decision; it must not trigger automatically from gross till balance or queue length alone.

## Seven-day traces

Every row retains all ten accounts and every hold in the JSON. The 9 coins reserved for legacy payroll remain protected rather than being paid by unrelated attendance invented in this experiment. Financial conservation does not demonstrate that inherited payroll should remain unsettled in the real game.

${weeks}

The cooperative schedule alternates player/Sub as the worker; the other voluntarily buys 2, 2, 3 and 3 cups over four days, one at a time with collection and consumption between. Four-day receipts of 20 equal wages of 20, restoring **every opening account** after each complete cycle. The 28-day test repeats seven cycles without issuance. Sub's initial 4-coin purchase exceeds the earlier authored NPC initial 2-coin spending ceiling, so this raw schedule is **explicit financial/preference input, not a shipping NPC policy**. A separate seven-day test enforces an initial 2-coin ceiling plus actually settled café wages: a real fully funded quiet Sub shift first costs the café 5 and pays Sub 5, after which the declared circulation sequence passes without new money. The bootstrap is an explicit business decision with a cost, not free initialization or a nightly subsidy. A negative test proves an NPC with remaining cash but exhausted discretion cannot buy again.

These schedules prove conditional circulation is possible; they do not prove that people want these purchases, that NPCs will choose them, or that any finite-money system sustains work under arbitrary refusal/hoarding. Purchases, collection and drinking are disclosed scripted choices. The raw seven-day cycle ends one day short of its next balanced reset.

The quiet and low-demand cases deliberately stop opening new shifts when unrestricted cash cannot reserve 5. Previously accepted wages remain honored. The concentrated-wages case exposes rejected customer purchases as their money runs out. Staff refusal creates no orders, wage obligations or fake work.

## Work, interruption and obligations

The model credits at most 180 eligible minutes under each shift and pays only that agreement. A late order can finish brewing partly before the daily window ends. The worker then stops without free overtime; order progress, contribution records and physical resource reservations remain. A later consenting funded worker can resume, and both workers retain their own wage terms. Resumable brewing occupies the existing brewer; the model does not assume an invisible extra storage/preparation station. Pausing a shift immediately stops its eligible attendance and relinquishes its order assignment, while preserving the order's resource/progress/money state. Another funded consenting worker can claim that same in-progress order. The two-worker pause/reassignment test records 8 brewing minutes from Sub, then 12 brewing plus 10 placement minutes from Northern, with one cup and independently preserved shift wages. Cancellation can free a blocked station before ready. Production still needs actual input/authority guards so a stale old control callback cannot continue the relinquished assignment.

Worker purse overflow leaves an earned 5-coin payable held even after the cup is collected/drunk. Refund recipient overflow leaves a separate 2-coin liability until settlement. Larger full-purse fixtures are labeled test inputs, never additions to the 90-coin experiment. Ordinary transfers used to free capacity move existing fixture money and are explicit test decisions, not proposed automatic spending.

## Executed checks and limits

**${tests.length} scenario tests; ${audits} invariant audits; ${commands} command attempts pass.** Tests cover exact account reconciliation, legacy holds, refusal/hoarding, quiet shifts, customer escrow, no per-cup/shift double pay, ready-only revenue release, cancellation after partial work, late-shift handoff, pause/reload, repeated tick, duplicate/conflicting/stale/wrong-owner actions, one-time collection/consumption, absent buyers, full worker/refund purses and global pause. Twelve seeded mixed schedules independently rerun with a mid-window JSON reload and produce identical complete final state. Rejected/replayed commands assert unchanged model state.

Action authority in this model is a fixture boundary, not proof of engine authorization. To test the funding invariant, model checkout allows a refundable preorder on declared worker willingness before a funded shift exists; a production UI can and should use a stricter availability gate rather than charge for unavailable service. Late acceptance is similarly exercised to prove recovery, not to recommend promising a 30-minute completion with 10 minutes left. Actual physical occupancy, travel, user input arbitration, NPC consent/purchase-budget policy beyond the explicit bounded-budget scenario, saved raw-data validators, v1 imports/forks, existing ledger integration, browser durability and accessible controls remain implementation acceptance. The model does not include ingredient/equipment costs, labor market expansion, real payments, external assets, claim bridges or wallets. The prior 20/10 timing is tuning, not measured café work. No test establishes enjoyment or retention.

Recommendation: the shift-funded candidate better matches a human accepting Kevin's familiar shift, provided ordinary routine service is an explicit bounded control permission and existing shift wages are never retroactively conditioned on cups. Keep the tested piecework alternative as a comparison; do not run both payment rules on the same labor. Gate new shifts on protected unrestricted cash and concrete intended availability. Honest idle/unfunded days remain possible.

## Reproduce

Run Node 24 from a02-economy: \`node docs/implementation/a02-readiness-2026-11-01-evidence/shift-model.mjs\`. This regenerates [JSON evidence](shift-model-results.json) and this report. No runtime source, live service, credential or actual town is used.
`;
writeFileSync(new URL("shift-model.md", import.meta.url), report);
console.log(JSON.stringify({ scenarios: tests.length, audits, commands, comparison: summary.comparisons.map((x) => ({ workers: x.workers.length, ready: x.ready, wages: x.wages, endingCafe: x.end.accounts.cafe })), sevenDay: sevenDay.map((x) => ({ name: x.name, days: x.days, final: x.final.accounts })) }, null, 2));
