// Read-only source qualification in disposable towns; no proposed coffee implementation.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const directory = fileURLToPath(new URL(".", import.meta.url));
const server = await createServer({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
try {
  const load = (name) => server.ssrLoadModule(`/src/game/${name}.ts`);
  const { createTown } = await load("town");
  const { activateFundedTown, advanceFundedPayroll } = await load("payroll-runtime");
  const { runEconomyCommand, auditEconomy } = await load("economy");
  const { playerActions, applyPlayerAction } = await load("effects");
  const { exportTown, readTownFile, MAX_TOWN_FILE_BYTES } = await load("save");
  const { ANCHORS } = await load("world");
  const { stepMinute } = await load("sim");
  const actor = (town, id) => town.agents.find((a) => a.id === id);
  const total = (town) =>
    town.agents.reduce((sum, a) => sum + a.money, 0) +
    Object.values(town.tills).reduce((a, b) => a + b, 0);
  const size = (town) => Buffer.byteLength(exportTown(town));
  const samples = [];

  let town = createTown("Synthetic audit resident");
  assert(activateFundedTown(town).ok);
  const identity = structuredClone(town.identityRegistry);
  for (let day = 1; day <= 3; day++) {
    if (day > 1) {
      town.minute = 1439;
      stepMinute(town, false); // Actual midnight clears paidToday; no invented reset.
    }
    assert.equal(town.day, day);
    town.minute = 959;
    actor(town, "player").tile = { ...actor(town, "kevin").tile };
    const offered = playerActions(town, "kevin").find((a) =>
      a.label.startsWith("Accept cafe shift"),
    );
    assert(offered && !offered.disabledReason, JSON.stringify({ day, offered }));
    const accepted = applyPlayerAction(town, "kevin", offered.id);
    assert(accepted.ok, accepted.reply);
    actor(town, "player").tile = { ...ANCHORS.cafe };
    const agreementId = town.economy.work.agreements.find(
      (a) => a.worker === "player" && a.status === "active",
    ).id;
    const startBytes = size(town);
    const startingMoney = actor(town, "player").money;
    advanceFundedPayroll(town);
    assert.equal(town.economy.work.agreements.find((a) => a.id === agreementId).eligibleMinutes, 0);
    for (let minute = 960; minute < 1140; minute++) {
      town.minute = minute;
      advanceFundedPayroll(town);
      const agreement = town.economy.work.agreements.find((a) => a.id === agreementId);
      assert.equal(agreement.eligibleMinutes, minute - 959);
      const beforeReplay = JSON.stringify(town.economy);
      advanceFundedPayroll(town);
      assert.equal(JSON.stringify(town.economy), beforeReplay);
      assert.deepEqual(auditEconomy(town), []);
      assert.equal(total(town), 90);
    }
    const complete = town.economy.work.agreements.find((a) => a.id === agreementId);
    assert.equal(complete.status, "completed");
    assert.equal(actor(town, "player").money, startingMoney + 5);
    town.minute = 1140;
    advanceFundedPayroll(town);
    assert.equal(complete.eligibleMinutes, 180);
    const before = exportTown(town);
    const restored = readTownFile(before);
    assert.equal(restored.status, "ready");
    town = restored.town;
    assert.deepEqual(town.identityRegistry, identity);
    assert.deepEqual(auditEconomy(town), []);
    assert.equal(total(town), 90);
    samples.push({
      day,
      startBytes,
      endBytes: Buffer.byteLength(before),
      afterReloadBytes: size(town),
      receipts: town.economy.commandReceipts.length,
      transactions: town.economy.transactions.length,
      player: actor(town, "player").money,
      cafe: town.tills.cafe,
      agreementId,
      eligibleMinutes: 180,
    });
  }

  const projectionTown = createTown("Synthetic projection audit");
  assert(activateFundedTown(projectionTown).ok);
  // A throwaway untyped additive field, deliberately NOT an adopted coffee schema.
  projectionTown.auditProjection = { order: { progress: 0 } };
  const oldProjection = projectionTown.auditProjection;
  const oldActor = actor(projectionTown, "player");
  const noOp = runEconomyCommand(
    projectionTown,
    {
      id: "a02:projection-probe",
      kind: "a02-projection-probe",
      actor: "player",
      authority: "ui",
      terms: {},
    },
    () => ({ observed: true }),
  );
  assert(noOp.ok);
  assert.notEqual(projectionTown.auditProjection, oldProjection);
  assert.equal(actor(projectionTown, "player"), oldActor);
  oldProjection.order.progress = 99;
  assert.equal(projectionTown.auditProjection.order.progress, 0);
  assert.deepEqual(auditEconomy(projectionTown), []);

  const result = {
    status: "passed",
    node: process.version,
    sourceBase: "a26714e03192a17acaa963d7d2681e74a1ac425b",
    attendance: {
      shifts: 3,
      eligibleMinutes: 540,
      duplicateMinuteAttempts: 540,
      outsideWindowChecks: 6,
      allWithoutCoffee: true,
      openingTotal: 90,
      samples,
    },
    projection: {
      genericAdditiveProjectionReplaced: true,
      agentObjectRetained: true,
      staleReferenceMutationDetached: true,
    },
    save: {
      importExportLimitBytes: MAX_TOWN_FILE_BYTES,
      observedLargestBytes: Math.max(
        ...samples.flatMap((s) => [s.startBytes, s.endBytes, s.afterReloadBytes]),
      ),
      longTermExtrapolationQualified: false,
    },
    scope:
      "Actual existing engine APIs in disposable towns with synthetic date/player positioning and direct payroll ticks; not ordinary UI, continuous town scheduling, coffee integration, storage endurance or human play. No network or credentials.",
  };
  writeFileSync(directory + "source-probes.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  await server.close();
}
