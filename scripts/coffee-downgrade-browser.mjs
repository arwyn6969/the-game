import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createCoffeeRecoveryFixture } from "./fixtures/coffee-recovery.mjs";
import { COFFEE_ROLLBACK_SHA, startCoffeeRollbackPreview } from "./coffee-rollback-preview.mjs";

const currentUrl = process.env.GAME_COFFEE_DOWNGRADE_QA_URL || "http://127.0.0.1:8201/";
const out = resolve(process.env.GAME_COFFEE_DOWNGRADE_QA_OUT || "artifacts/coffee-downgrade");
await mkdir(out, { recursive: true });
const report = {
  node: process.version,
  rollbackSource: COFFEE_ROLLBACK_SHA,
  liveInferenceCalls: 0,
  productionChanged: false,
  fixture:
    "Synthetic opening/time/poses followed by actual source work and transfers; 2081 opening coins",
  limitations: [
    "Only the pinned c183e32 rollback is qualified; not arbitrary historical builds",
    "Built HTTP previews on a disposable root-base origin; service workers blocked and HTTP cache bypassed",
    "Chromium desktop/phone emulation; not a deployed Worker rollback or physical-device acceptance",
    "Final purse-capacity transfers and claim settlement use source APIs, not ordinary UI payouts",
  ],
  journeys: [],
  failures: [],
};
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy.projectBalances).reduce((sum, amount) => sum + amount, 0);
// Keep the complete books and coffee projection, including claims and progress.
// Only physical poses and other transient presentation fields are omitted.
const facts = (town) => ({
  version: town.version,
  day: town.day,
  minute: town.minute,
  identities: town.identityRegistry,
  agents: town.agents.map(({ id, name, identity, money, memories, projects, threads }) => ({
    id,
    name,
    identity,
    money,
    memories,
    projects,
    threads,
  })),
  favors: town.favors,
  notices: town.notices,
  tills: town.tills,
  economy: town.economy,
  coffee: town.coffee,
  physicalItems: town.physicalItems,
  discussions: town.discussions,
});
const raw = (page) => page.evaluate(() => localStorage.getItem("the-game-town-v2"));
const stored = async (page) => JSON.parse(await raw(page)).town;
let source, browser, preview, activePage;
async function closePanels(page) {
  const close = page.getByRole("button", { name: "Close Hobbs café", exact: true });
  if (await close.isVisible()) await close.click();
}
async function cafe(page) {
  if (await page.getByRole("dialog", { name: "Hobbs café", exact: true }).isVisible()) return;
  await page
    .getByRole("navigation", { name: "Your town tools", exact: true })
    .getByRole("button", { name: "Café", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Hobbs café", exact: true }).waitFor();
}
async function importTown(page, text, recovery = false) {
  await page
    .getByLabel(recovery ? "Import a town backup" : "Import a town file", { exact: true })
    .setInputFiles({
      name: "synthetic-recovery.json",
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
  if (recovery) {
    await page
      .getByLabel("Unreadable town save preview", { exact: true })
      .waitFor({ state: "hidden" });
  } else {
    await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    await page
      .getByRole("heading", { name: "Replace the live town?", exact: true })
      .waitFor({ state: "hidden" });
  }
  await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
}
async function download(page, name, unreadable = false) {
  await closePanels(page);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", {
        name: unreadable ? "Download the full unreadable save" : "Download town",
        exact: true,
      })
      .click(),
  ]);
  const path = join(out, name);
  await file.saveAs(path);
  return readFile(path, "utf8");
}
async function assertPaused(page) {
  assert.equal(
    await page.getByRole("button", { name: "Pause café shift now", exact: true }).count(),
    0,
  );
  const live = JSON.parse(await download(page, "last-live-snapshot.json")).town;
  assert.equal(live.paused, true);
  assert.ok(live.coffee.routines.every((routine) => routine.status !== "active"));
  return live;
}
async function ordinarySave(page) {
  await closePanels(page);
  const before = await stored(page);
  const direction = await page.evaluate(
    (occupied) => {
      const here = { x: window.__controlsTest.getX(), y: window.__controlsTest.getY() };
      return [
        { key: "ArrowDown", x: here.x, y: here.y + 1 },
        { key: "ArrowLeft", x: here.x - 1, y: here.y },
        { key: "ArrowUp", x: here.x, y: here.y - 1 },
        { key: "ArrowRight", x: here.x + 1, y: here.y },
      ].find(
        (tile) =>
          window.__game.tile(tile.x, tile.y)?.block === false &&
          !occupied.some((other) => other.x === tile.x && other.y === tile.y),
      );
    },
    before.agents.filter((actor) => actor.id !== "player").map((actor) => actor.tile),
  );
  assert.ok(direction, "An adjacent free tile permits an ordinary save without advancing time");
  await page.locator("canvas.town-canvas").focus();
  await page.keyboard.down(direction.key);
  try {
    await page.waitForFunction(
      (tile) => window.__controlsTest.getX() !== tile.x || window.__controlsTest.getY() !== tile.y,
      person(before, "player").tile,
    );
  } finally {
    await page.keyboard.up(direction.key);
  }
  await page.waitForFunction((tile) => {
    const now = JSON.parse(localStorage.getItem("the-game-town-v2")).town.agents.find(
      (actor) => actor.id === "player",
    ).tile;
    return now.x !== tile.x || now.y !== tile.y;
  }, person(before, "player").tile);
  const after = await stored(page);
  assert.deepEqual(
    facts(after),
    facts(before),
    "Ordinary movement saves every durable claim without advancing the paused clock",
  );
  return after;
}
try {
  source = await createServer({
    configFile: false,
    envDir: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  const load = (name) => source.ssrLoadModule(`/src/game/${name}.ts`);
  const { exportTown, readTownFile } = await load("save");
  const { auditEconomy, runEconomyCommand, transferFunds } = await load("economy");
  const { settleCoffeeRefunds } = await load("coffee");
  const { settleWorkPayable } = await load("funded-work");
  const fixture = await createCoffeeRecoveryFixture(load);
  report.openingCoins = fixture.openingCoins;
  report.fixtureIds = fixture.ids;
  preview = await startCoffeeRollbackPreview({ currentUrl, outDir: out });
  report.builds = preview.receipt;
  assert.notDeepEqual(
    preview.receipt.currentBuild.assets,
    preview.receipt.rollbackBuild.assets,
    "Distinct built assets identify current and historical source",
  );
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    for (const enabled of [true, false]) {
      const result = {
        viewport,
        enabled,
        checks: [],
        assets: [],
        errors: [],
        providerRequests: [],
        screenshots: [],
      };
      report.journeys.push(result);
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.name === "phone",
        acceptDownloads: true,
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        if (location.protocol === "http:")
          localStorage.setItem("the-game-local-dialogue-only", "true");
      });
      const origin = new URL(preview.url).origin;
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin)
          return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        if (url.pathname.includes("_serverFn") && route.request().method() === "POST") {
          result.providerRequests.push(url.pathname);
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"ok":false}',
          });
        }
        return route.continue();
      });
      const watch = (page) => {
        page.on("pageerror", (error) => result.errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") result.errors.push(message.text());
        });
      };
      const page = (activePage = await context.newPage());
      watch(page);
      let livePage = page;
      let loadedScripts = new Set();
      page.on("response", (response) => {
        if (response.request().resourceType() === "script")
          loadedScripts.add(new URL(response.url()).pathname);
      });
      const visit = async (version, recovery = false) => {
        preview.select(version);
        loadedScripts = new Set();
        const response = await page.goto(`${preview.url}?qa-build=${version}`, {
          waitUntil: "networkidle",
          timeout: 45000,
        });
        assert.equal(response.headers()["x-game-qa-version"], version);
        if (version === "rollback")
          assert.equal(response.headers()["x-the-game-qa-source"], COFFEE_ROLLBACK_SHA);
        if (recovery)
          await page.getByLabel("Unreadable town save preview", { exact: true }).waitFor();
        else if (await page.getByLabel("What do they call you?", { exact: true }).isVisible()) {
          await page.getByLabel("What do they call you?", { exact: true }).fill("Recovery visitor");
          await page.getByRole("button", { name: "Walk in", exact: true }).click();
        }
        if (!recovery)
          await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
        const expected =
          version === "rollback" ? preview.receipt.rollbackBuild : preview.receipt.currentBuild;
        const expectedScripts = expected.assets.filter((asset) => asset.path.endsWith(".js"));
        assert.ok(
          expectedScripts.length && expectedScripts.every((asset) => loadedScripts.has(asset.path)),
          "The page actually loaded this build's pinned entry assets",
        );
        result.assets.push({ version, scripts: [...loadedScripts].sort() });
      };
      await visit("current");
      const initial = structuredClone(fixture.town);
      initial.coffee.enabled = enabled; // Labelled feature configuration, preserving the full extension.
      await importTown(page, exportTown(initial));
      const baseline = await assertPaused(page);
      await ordinarySave(page);
      await visit("rollback");
      const downgraded = await assertPaused(page);
      assert.deepEqual(
        facts(downgraded),
        facts(baseline),
        "The actual rollback build retains the full current coffee town",
      );
      await ordinarySave(page);
      const rollbackRaw = await download(
        page,
        `${viewport.name}-${enabled ? "on" : "off"}-rollback.json`,
      );
      assert.deepEqual(facts(JSON.parse(rollbackRaw).town), facts(baseline));
      await visit("current");
      const restored = await assertPaused(page);
      assert.deepEqual(
        facts(restored),
        facts(baseline),
        "Re-upgrade retains all books, cups, refund and wage claims after an old-build save/export",
      );
      await ordinarySave(page);
      result.checks.push(
        "Current → pinned c183e32 → current on the same origin preserves complete books, identities, memories, debts, ready cup, 12-minute pending refund, 20-minute partial wage and 180-minute earned payable through ordinary saves and exports",
      );
      await cafe(page);
      if (!enabled) {
        assert.equal(
          await page.getByRole("button", { name: "Start café trial", exact: true }).count(),
          0,
        );
        assert.equal(
          await page.getByRole("button", { name: "Buy coffee — 2 coins", exact: true }).count(),
          0,
        );
        await page
          .getByText(
            "New coffee orders are closed. Existing tickets, cups and wage reservations remain.",
            { exact: false },
          )
          .waitFor();
        assert.equal(await page.getByText(/Try seven game days of café service/).count(), 0);
        result.checks.push(
          "Feature-off recovery retains tickets/cups and never presents a new trial or purchase",
        );
      }
      const shot = join(out, `${viewport.name}-${enabled ? "on" : "off"}-recovered.png`);
      await page.screenshot({ path: shot, fullPage: true });
      result.screenshots.push(shot);
      await closePanels(page);

      // Settlement is a source API follow-up to the actual old-build export.
      // Create capacity by moving existing fixture coins, never editing balances.
      const recoveredFile = readTownFile(rollbackRaw);
      assert.equal(recoveredFile.status, "ready", recoveredFile.reason);
      const town = recoveredFile.town;
      const originalHolds = structuredClone(town.economy.holds);
      const transfer = (actor, to, amount) => {
        const command = {
          id: `recovery-capacity:${actor}`,
          kind: "recovery-capacity",
          actor,
          authority: "simulation",
          terms: { from: `agent:${actor}`, to, amount },
        };
        const result = runEconomyCommand(town, command, (draft, accounting) => {
          transferFunds(draft, accounting, {
            id: `${command.id}:transfer`,
            ...command.terms,
            purpose: "Disclosed existing fixture cash creates capacity after downgrade recovery",
          });
          return command.terms;
        });
        assert.equal(result.ok, true, result.reason);
      };
      transfer("sub", "agent:baba", 2);
      settleCoffeeRefunds(town);
      transfer("northern", "agent:kevin", 5);
      const wageCommand = {
        id: "recovery-settle-earned-wage",
        kind: "settle-work-payable",
        actor: "kevin",
        authority: "simulation",
        terms: { payableId: fixture.ids.earnedPayableId },
      };
      assert.equal(settleWorkPayable(town, wageCommand, fixture.ids.earnedPayableId).ok, true);
      assert.equal(person(town, "sub").money, 999);
      assert.equal(person(town, "northern").money, 999);
      assert.equal(
        town.coffee.orders.find((order) => order.id === fixture.ids.refundOrderId).phase,
        "refunded",
      );
      assert.equal(
        town.economy.work.payables.find((payable) => payable.id === fixture.ids.earnedPayableId)
          .status,
        "settled",
      );
      for (const hold of originalHolds)
        if (![fixture.ids.refundHoldId, fixture.ids.earnedHoldId].includes(hold.id))
          assert.deepEqual(
            town.economy.holds.find((item) => item.id === hold.id),
            hold,
          );
      assert.equal(
        town.economy.work.agreements.find((item) => item.id === fixture.ids.partialShiftId)
          .eligibleMinutes,
        20,
      );
      const settled = exportTown(town);
      settleCoffeeRefunds(town);
      assert.equal(
        settleWorkPayable(town, wageCommand, fixture.ids.earnedPayableId).replayed,
        true,
      );
      assert.equal(exportTown(town), settled);
      assert.equal(total(town), fixture.openingCoins);
      assert.deepEqual(auditEconomy(town), []);
      const refund = town.coffee.orders.find((order) => order.id === fixture.ids.refundOrderId);
      const wage = town.economy.work.payables.find(
        (payable) => payable.id === fixture.ids.earnedPayableId,
      );
      assert.equal(
        town.economy.transactions.filter((transaction) => transaction.id === refund.refundId)
          .length,
        1,
      );
      assert.equal(
        town.economy.transactions.filter((transaction) => transaction.id === wage.transactionId)
          .length,
        1,
      );
      assert.deepEqual(
        town.coffee.cups.find((cup) => cup.id === fixture.ids.readyCupId),
        baseline.coffee.cups.find((cup) => cup.id === fixture.ids.readyCupId),
      );
      result.checks.push(
        "Actual old-build export reopens with current source; existing-cash capacity transfers settle the original refund and earned wage once while preserving the partial wage hold",
      );

      if (!enabled) {
        const validBackup = await download(page, `${viewport.name}-off-valid-backup.json`);
        await page.goto("about:blank");
        const unsupported = JSON.parse(validBackup);
        unsupported.town.coffee.version = 99;
        const unsupportedRaw = JSON.stringify(unsupported);
        await page.addInitScript(
          ({ value, origin }) => {
            if (location.origin === origin && !sessionStorage.getItem("coffee-qa-future-seeded")) {
              localStorage.setItem("the-game-town-v2", value);
              sessionStorage.setItem("coffee-qa-future-seeded", "true");
            }
          },
          { value: unsupportedRaw, origin },
        );
        for (const version of ["rollback", "current"]) {
          await visit(version, true);
          assert.equal(
            await raw(page),
            unsupportedRaw,
            "Unsupported data cannot be normalized or overwritten",
          );
          assert.equal(
            await download(page, `${viewport.name}-${version}-unsupported-original.txt`, true),
            unsupportedRaw,
          );
        }
        // Remove the test fault injector before recovering a supported backup.
        const recoveryPage = (activePage = await context.newPage());
        watch(recoveryPage);
        livePage = recoveryPage;
        await recoveryPage.goto(preview.url, { waitUntil: "networkidle" });
        await recoveryPage.getByLabel("Unreadable town save preview", { exact: true }).waitFor();
        await importTown(recoveryPage, validBackup, true);
        const live = await assertPaused(recoveryPage);
        assert.deepEqual(facts(live), facts(JSON.parse(validBackup).town));
        assert.ok(
          await recoveryPage.evaluate(
            (original) =>
              Object.entries(localStorage).some(
                ([key, value]) =>
                  key.startsWith("the-game-town-backup-v1:replaced:") && value === original,
              ),
            unsupportedRaw,
          ),
          "Explicit recovery retains the complete unsupported original in a replacement backup",
        );
        result.checks.push(
          "Both pinned and current builds refuse future café data without changing its bytes; full raw download and explicit supported-backup recovery retain the original",
        );
        const recoveryShot = join(out, `${viewport.name}-unsupported-recovered.png`);
        await recoveryPage.screenshot({ path: recoveryShot, fullPage: true });
        result.screenshots.push(recoveryShot);
      }

      // Ordinary UI lets the former worker leave the counter, then collects
      // and consumes the original cup after the actual historical round trip.
      await closePanels(livePage);
      const hour = livePage.getByRole("button", { name: "Hour", exact: true });
      await hour.click();
      await hour.and(livePage.locator('[aria-busy="false"]')).waitFor({ timeout: 30000 });
      await cafe(livePage);
      await livePage
        .getByRole("button", { name: "Walk to the coffee counter", exact: true })
        .click();
      await livePage.waitForFunction(
        () => window.__controlsTest.getX() === 7 && window.__controlsTest.getY() === 19,
      );
      await cafe(livePage);
      const beforeUse = await stored(livePage);
      await livePage.getByRole("button", { name: "Collect my coffee", exact: true }).click();
      await livePage.waitForFunction(
        (id) =>
          JSON.parse(localStorage.getItem("the-game-town-v2")).town.coffee.cups.some(
            (cup) => cup.id === id && cup.custody === "inventory",
          ),
        fixture.ids.readyCupId,
      );
      await livePage.getByRole("button", { name: /^Drink coffee / }).click();
      await livePage.waitForFunction(
        (id) =>
          JSON.parse(localStorage.getItem("the-game-town-v2")).town.coffee.cups.some(
            (cup) => cup.id === id && cup.custody === "consumed",
          ),
        fixture.ids.readyCupId,
      );
      const used = await stored(livePage);
      assert.equal(
        used.coffee.cups.filter((cup) => cup.orderId === fixture.ids.readyOrderId).length,
        1,
      );
      assert.deepEqual(used.economy.work, beforeUse.economy.work);
      assert.deepEqual(used.economy.holds, beforeUse.economy.holds);
      assert.deepEqual(used.economy.transactions, beforeUse.economy.transactions);
      assert.deepEqual(used.tills, beforeUse.tills);
      assert.equal(total(used), fixture.openingCoins);
      await closePanels(livePage);
      await livePage.reload({ waitUntil: "networkidle" });
      const consumed = await assertPaused(livePage);
      assert.equal(
        consumed.coffee.cups.find((cup) => cup.id === fixture.ids.readyCupId).custody,
        "consumed",
      );
      await cafe(livePage);
      assert.equal(await livePage.getByRole("button", { name: /^Drink coffee / }).count(), 0);
      const consumedShot = join(out, `${viewport.name}-${enabled ? "on" : "off"}-consumed.png`);
      await livePage.screenshot({ path: consumedShot, fullPage: true });
      result.screenshots.push(consumedShot);
      result.checks.push(
        "Ordinary clock, travel, collect and drink controls use the original recovered cup once; wage/refund books stay unchanged during use and reload retains its consumption tombstone",
      );
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.providerRequests, []);
      console.log(
        JSON.stringify({
          viewport: viewport.name,
          enabled,
          ok: true,
          checks: result.checks.length,
        }),
      );
      await context.close();
      activePage = undefined;
    }
  }
} catch (error) {
  report.failures.push(String(error.stack || error));
  if (activePage)
    await activePage.screenshot({ path: join(out, "failure.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
  console.error(report.failures[0]);
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  await preview?.close();
  await source?.close();
}
