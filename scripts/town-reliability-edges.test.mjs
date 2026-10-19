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
const economy = await server.ssrLoadModule("/src/game/economy.ts");
const payroll = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const { playerActions, applyPlayerAction } = await server.ssrLoadModule("/src/game/effects.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const command = (id, kind, actor, terms) => ({ id, kind, actor, authority: "simulation", terms });
function healthy(town) {
  assert.deepEqual(economy.auditEconomy(town), []);
}
function reload(town) {
  const result = save.readTownFile(save.exportTown(town));
  assert.equal(result.status, "ready", result.reason);
  healthy(result.town);
  return result.town;
}
function deposit(town, amount) {
  const result = economy.runEconomyCommand(
    town,
    command(`restock:${town.day}:${town.minute}`, "fund-legacy-payroll", "kevin", { amount }),
    (draft, context) => {
      economy.transferFunds(draft, context, {
        id: `restock-transfer:${town.day}:${town.minute}`,
        from: "agent:kevin",
        to: "till:cafe",
        amount,
        purpose: "The employer contributes existing personal coins to the wage till",
      });
      return { amount };
    },
  );
  assert.equal(result.ok, true, result.reason);
  healthy(town);
}
function legacyPlayer(hours, { ownerPaid = true, cafe = 0 } = {}) {
  const town = createTown("Ada");
  town.tills.cafe = cafe;
  person(town, "kevin").paidToday = ownerPaid;
  const player = person(town, "player");
  player.shiftHours = hours;
  player.projects.push({
    id: "old-cafe-agreement",
    owner: "player",
    kind: "shift",
    place: "cafe",
    status: "open",
    day: 1,
    text: "Original cafe work with an unpaid full wage",
  });
  for (const beat of player.plan.beats)
    if (beat.hour >= 16 && beat.hour < 19)
      Object.assign(beat, { place: "cafe", spot: "out", status: "original paid work" });
  assert.equal(payroll.activateFundedTown(town).ok, true);
  healthy(town);
  return town;
}
function acceptPlayerShift(town) {
  person(town, "player").tile = { ...person(town, "kevin").tile };
  const offer = playerActions(town, "kevin").find((item) => item.label === "Accept cafe shift · 5");
  assert.ok(offer);
  const result = applyPlayerAction(town, "kevin", offer.id);
  assert.equal(result.ok, true, result.reply);
  healthy(town);
  return town.economy.work.agreements.find((item) => item.worker === "player");
}

test("an old completed unpaid wage is protected and settled when its till later receives real cash", () => {
  let town = legacyPlayer(3);
  const claim = () => town.economy.work.legacyClaims.find((item) => item.worker === "player");
  assert.equal(claim().classification, "completed-unpaid");
  assert.equal(claim().resolution, "underfunded");
  const evidence = structuredClone(claim().evidence);
  const before = person(town, "player").money;
  town = reload(town);
  deposit(town, 5);
  payroll.advanceFundedPayroll(town);
  assert.equal(person(town, "player").money, before + 5);
  assert.equal(town.tills.cafe, 0);
  assert.equal(claim().resolution, "settled");
  assert.deepEqual(claim().evidence, evidence);
  assert.equal(
    person(town, "player").projects.find((item) => item.id === "old-cafe-agreement").status,
    "done",
  );
  const paid = town.economy.transactions.filter((item) => item.agreementId === claim().id);
  assert.equal(paid.length, 1);
  const receipts = town.economy.commandReceipts.length;
  payroll.advanceFundedPayroll(town);
  town = reload(town);
  payroll.advanceFundedPayroll(town);
  assert.equal(person(town, "player").money, before + 5);
  assert.equal(
    town.economy.commandReceipts.length,
    receipts,
    "settled claims need no repeated empty accounting commands",
  );
  healthy(town);
});

test("newly funded old unworked player evidence remains an explicit choice without invented minutes", () => {
  const town = legacyPlayer(0);
  const before = person(town, "player").money;
  deposit(town, 5);
  payroll.advanceFundedPayroll(town);
  const claim = town.economy.work.legacyClaims.find((item) => item.worker === "player");
  assert.equal(claim.resolution, "protected");
  assert.equal(economy.availableFunds(town, "till:cafe"), 0);
  assert.equal(person(town, "player").money, before);
  assert.equal(
    town.economy.work.agreements.some((item) => item.worker === "player"),
    false,
  );
  assert.equal(
    town.economy.work.payables.some((item) => item.worker === "player"),
    false,
  );
  const recognition = playerActions(town, "kevin").find((item) =>
    item.label.startsWith("Recognise cafe work"),
  );
  assert.ok(recognition);
  assert.equal(recognition.disabledReason, undefined);
  reload(town);
});

test("scarce unreserved cash pays an already completed old wage before funding unworked commitments", () => {
  for (const cafe of [0, 5]) {
    const town = legacyPlayer(3, { ownerPaid: false, cafe });
    const before = person(town, "player").money;
    if (!cafe) deposit(town, 5);
    payroll.advanceFundedPayroll(town);
    assert.equal(
      person(town, "player").money,
      before + 5,
      "earned work takes priority over an unworked future unit",
    );
    assert.equal(town.tills.cafe, 0);
    assert.equal(
      town.economy.work.legacyClaims.find((item) => item.worker === "kevin").resolution,
      "underfunded",
    );
    assert.equal(town.economy.work.payables.filter((item) => item.worker === "player").length, 1);
    reload(town);
  }
});

test("an authored NPC wage that was initially underfunded can resume once its full existing wage is available", () => {
  const town = createTown("Ada");
  town.tills.cafe = 0;
  assert.equal(payroll.activateFundedTown(town).ok, true);
  const prior = person(town, "kevin").money;
  deposit(town, 5);
  town.minute = 8 * 60;
  person(town, "kevin").tile = { ...ANCHORS.cafe };
  payroll.advanceFundedPayroll(town);
  const agreement = town.economy.work.agreements.find((item) => item.worker === "kevin");
  assert.ok(
    agreement,
    "an earlier cash shortage must not permanently strand the existing NPC agreement",
  );
  assert.equal(agreement.eligibleMinutes, 1);
  assert.equal(agreement.status, "active");
  assert.equal(
    person(town, "kevin").money,
    prior - 5,
    "funding is an existing-cash contribution, not a wage advance",
  );
  assert.equal(economy.availableFunds(town, "till:cafe"), 0);
  reload(town);
});

test("imported wage minutes must match this agreement's trusted attendance commands", () => {
  const town = createTown("Ada");
  const agreement = acceptPlayerShift(town);
  town.minute = 18 * 60 + 58;
  const original = save.exportTown(town);
  for (const attendance of [
    ["not-a-minute"],
    ["999:0"],
    Array.from({ length: 179 }, (_, index) => `1:${960 + index}`),
  ]) {
    const file = JSON.parse(original);
    const altered = file.town.economy.work.agreements.find((item) => item.id === agreement.id);
    altered.attendance = attendance;
    altered.eligibleMinutes = attendance.length;
    const raw = JSON.stringify(file);
    const report = save.readTownFile(raw);
    assert.equal(
      report.status,
      "unreadable",
      "an array of unsupported minute labels cannot count as earned attendance",
    );
    assert.equal(report.raw, raw);
    assert.match(report.reason, /attendance|minute|work|accounts/i);
  }
});

test("real attendance survives reload but its recorded minute cannot be erased or relabelled", () => {
  let town = createTown("Ada");
  const id = acceptPlayerShift(town).id;
  town.minute = 960;
  person(town, "player").tile = { ...ANCHORS.cafe };
  payroll.advanceFundedPayroll(town);
  town = reload(town);
  assert.deepEqual(town.economy.work.agreements.find((item) => item.id === id).attendance, [
    "1:960",
  ]);
  const original = save.exportTown(town);
  for (const attendance of [[], ["1:959"]]) {
    const file = JSON.parse(original);
    const altered = file.town.economy.work.agreements.find((item) => item.id === id);
    altered.attendance = attendance;
    altered.eligibleMinutes = attendance.length;
    const raw = JSON.stringify(file);
    assert.equal(save.readTownFile(raw).status, "unreadable");
  }
  payroll.advanceFundedPayroll(town);
  assert.equal(town.economy.work.agreements.find((item) => item.id === id).eligibleMinutes, 1);
  healthy(town);
});
