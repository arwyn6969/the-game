import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

// Disposable synthetic towns, imported through the normal UI. No personal
// browser, credentials, hosted endpoints or runtime state injection is used.
const target = new URL(process.env.GAME_COFFEE_QA_URL || "http://127.0.0.1:8198/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const baseOut = resolve(process.env.GAME_COFFEE_QA_OUT || "artifacts/a02-cafe/browser");
const out = join(baseOut, `run-${process.pid}-${Date.now()}`);
await mkdir(out, { recursive: true });
const report = {
  date: "2026-11-02",
  target: target.href,
  node: process.version,
  builtPreview: true,
  liveInferenceCalls: 0,
  authChanged: false,
  fixtureScope:
    "Source-created 15:59 towns with synthetic actor positions, imported normally. All subsequent coffee choices/movement/time advancement use ordinary UI controls. Existing window helpers are read-only.",
  syntheticFaults: ["held browser save lock", "storage quota failure", "visibilitychange event"],
  limitations: [
    "Headless emulated desktop/phone, not physical devices or human enjoyment",
    "AI-pending Stop is not qualified: authentication/transport remains untouched; pending-save Stop is exercised",
  ],
  journeys: [],
  failures: [],
};
let browser;
let preview;
let source;
let activePage;
let previewOutput = "";
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const position = (page) =>
  page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const sum = (town) =>
  town.agents.reduce((value, actor) => value + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery;
const playerRoutine = (town) =>
  town.coffee?.routines.find((routine) => routine.worker === "player");
const playerAgreement = (town) =>
  town.economy.work.agreements.find(
    (agreement) => agreement.id === playerRoutine(town)?.agreementId,
  );
const ownOrder = (town) => town.coffee.orders.find((order) => order.buyer === "player");
const nav = (page) => page.getByRole("navigation", { name: "Your town tools", exact: true });
async function coffeePanel(page) {
  await nav(page).getByRole("button", { name: "Café", exact: true }).click();
  await page.getByRole("dialog", { name: "Hobbs café", exact: true }).waitFor();
}
async function closePanel(page) {
  const close = page.getByRole("button", { name: "Close Hobbs café", exact: true });
  if (await close.isVisible()) await close.click();
}
async function waitStored(page, predicate, arg) {
  await page.waitForFunction(
    ({ code, arg }) => {
      const raw = localStorage.getItem("the-game-town-v2");
      return (
        raw && Function("town", "arg", `return (${code})(town,arg)`)(JSON.parse(raw).town, arg)
      );
    },
    { code: predicate.toString(), arg },
    { timeout: 15000 },
  );
}
async function importTown(page, raw, name) {
  await page
    .getByLabel("Import a town file", { exact: true })
    .setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(raw) });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
}
async function exported(page, name) {
  await closePanel(page);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: "Download town", exact: true }).click(),
  ]);
  const path = join(out, name);
  await download.saveAs(path);
  return JSON.parse(await readFile(path, "utf8")).town;
}
async function advanceHour(page) {
  await closePanel(page);
  const hour = page.getByRole("button", { name: "Hour", exact: true });
  await hour.click();
  await hour.and(page.locator('[aria-busy="false"]')).waitFor({ timeout: 20000 });
}
async function advanceUntil(page, predicate, max = 8) {
  for (let index = 0; index < max; index++) {
    if (predicate(await stored(page))) return;
    await advanceHour(page);
  }
  assert.ok(predicate(await stored(page)), "Expected coffee state after ordinary Hour advancement");
}
async function reachWindow(page) {
  await closePanel(page);
  await page.getByRole("button", { name: "4×", exact: true }).click();
  await waitStored(page, (town) => town.minute >= 960);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await waitStored(page, (town) => town.paused);
  assert.ok(
    (await stored(page)).minute < 970,
    "Window setup must not skip a meaningful service period",
  );
}
async function move(page, touch = false) {
  await closePanel(page);
  const before = await position(page);
  const choices = await page.evaluate(
    ({ x, y }) =>
      [
        { key: "ArrowUp", label: "North", x, y: y - 1 },
        { key: "ArrowRight", label: "East", x: x + 1, y },
        { key: "ArrowDown", label: "South", x, y: y + 1 },
        { key: "ArrowLeft", label: "West", x: x - 1, y },
      ].filter((next) => window.__game.tile(next.x, next.y)?.block === false),
    before,
  );
  for (const direction of choices) {
    await page.locator("canvas.town-canvas").focus();
    if (touch) {
      const button = page.getByRole("button", { name: direction.label, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert.ok(box);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
      });
      await page.waitForTimeout(120);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else {
      await page.keyboard.down(direction.key);
      await page.waitForTimeout(120);
      await page.keyboard.up(direction.key);
    }
    const after = await position(page);
    if (after.x !== before.x || after.y !== before.y)
      return { before, after, input: touch ? "touch" : "keyboard" };
  }
  throw new Error("No adjacent movement succeeded");
}
async function saveLock(page) {
  await page.evaluate(async () => {
    const acquired = new Promise((resolve) => {
      window.__coffeeLockAcquired = resolve;
    });
    void navigator.locks.request("the-game-town-save", async () => {
      window.__coffeeLockAcquired();
      await new Promise((resolve) => {
        window.__coffeeUnlock = resolve;
      });
    });
    await acquired;
  });
}
async function releaseSaveLock(page) {
  await page.evaluate(() => window.__coffeeUnlock?.());
}
async function faultStorage(page, enabled) {
  await page.evaluate((value) => {
    if (value) {
      window.__coffeeOriginalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, data) {
        if (key.startsWith("the-game-town"))
          throw new DOMException("Synthetic full storage", "QuotaExceededError");
        return window.__coffeeOriginalSetItem.call(this, key, data);
      };
    } else {
      Storage.prototype.setItem = window.__coffeeOriginalSetItem;
      delete window.__coffeeOriginalSetItem;
    }
  }, enabled);
}
async function assertAccessible(page, result, name) {
  await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
  const audit = await page.evaluate(async () => {
    const root = document.querySelector('[role="dialog"][aria-labelledby="tools-title"]');
    const result = await window.axe.run(root || document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    return {
      violations: result.violations,
      incomplete: result.incomplete.map((row) => ({ id: row.id, nodes: row.nodes.length })),
      passes: result.passes.length,
    };
  });
  result.accessibility ??= [];
  result.accessibility.push({ name, ...audit });
  assert.deepEqual(audit.violations, [], `${name}: no axe violations on the café surface`);
}
try {
  source = await createServer({
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  const { createTown } = await source.ssrLoadModule("/src/game/town.ts");
  const { activateFundedTown } = await source.ssrLoadModule("/src/game/payroll-runtime.ts");
  const { exportTown, readTownFile } = await source.ssrLoadModule("/src/game/save.ts");
  const { auditEconomy } = await source.ssrLoadModule("/src/game/economy.ts");
  function fixture(name, worker = false) {
    const town = createTown(name);
    town.minute = 959;
    town.paused = true;
    for (const actor of town.agents) {
      actor.tile = { ...actor.home };
      actor.path = [];
    }
    person(town, "kevin").tile = { x: 9, y: 19 };
    person(town, "player").tile = worker ? { x: 8, y: 19 } : { x: 7, y: 19 };
    person(town, "northern").tile = { x: 8, y: 18 };
    if (worker) person(town, "sub").tile = { x: 7, y: 19 };
    assert.equal(activateFundedTown(town).ok, true);
    const raw = exportTown(town);
    assert.equal(readTownFile(raw).status, "ready");
    assert.equal(sum(town), 90);
    return raw;
  }
  if (!process.env.GAME_COFFEE_QA_URL) {
    preview = spawn(
      process.execPath,
      [
        "scripts/with-app-env.mjs",
        process.execPath,
        "node_modules/vite/bin/vite.js",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        target.port,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: "", XAI_API_KEY: "", MIND_PROVIDER_MODE: "legacy" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    for (const stream of [preview.stdout, preview.stderr])
      stream.on("data", (data) => {
        previewOutput = (previewOutput + data.toString()).slice(-6000);
      });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (preview.exitCode !== null) throw new Error(`Built preview exited: ${previewOutput}`);
      try {
        if ((await fetch(target, { signal: AbortSignal.timeout(1000) })).ok) {
          ready = true;
          break;
        }
      } catch {
        /* warming */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, `Built preview not ready: ${previewOutput}`);
  }
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = {
      viewport,
      checks: [],
      errors: [],
      consoleErrors: [],
      externalRequestsBlocked: [],
      serverFunctionsBlocked: [],
      screenshots: [],
    };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => localStorage.setItem("the-game-local-dialogue-only", "true"));
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== target.origin) {
        result.externalRequestsBlocked.push(url.origin);
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      }
      if (url.pathname.includes("_serverFn") || url.pathname.startsWith("/api/auth/")) {
        result.serverFunctionsBlocked.push({
          path: url.pathname,
          method: route.request().method(),
        });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ online: false, configured: false, actions: false }),
        });
      }
      return route.continue();
    });
    const page = (activePage = await context.newPage());
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.consoleErrors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page
      .getByLabel("What do they call you?", { exact: true })
      .fill(`Coffee ${viewport.name}`);
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(
      () =>
        !!window.__game && !!window.__controlsTest && !!localStorage.getItem("the-game-town-v2"),
    );
    await coffeePanel(page);
    await page.getByRole("button", { name: "Start café trial", exact: true }).click();
    await waitStored(page, (town) => town.coffee?.enabled);
    const enabled = await stored(page);
    assert.equal(enabled.coffee.orders.length, 0);
    assert.equal(enabled.coffee.routines.length, 0);
    assert.equal(sum(enabled), 90);
    result.checks.push("Normal new town enables café without purchase, hire or coin issuance");

    const customerRaw = fixture(`Customer ${viewport.name}`);
    await writeFile(join(out, `${viewport.name}-customer-fixture.json`), customerRaw);
    await importTown(page, customerRaw, "synthetic-customer-1559.json");
    const customerIdentity = (await stored(page)).identityRegistry;
    await coffeePanel(page);
    await page.getByRole("button", { name: "Start café trial", exact: true }).click();
    await waitStored(page, (town) => town.coffee?.enabled);
    await reachWindow(page);
    await coffeePanel(page);
    await page.getByRole("button", { name: "Ask Kevin for staffed service", exact: true }).click();
    await waitStored(page, (town) =>
      town.coffee.routines.some(
        (routine) => routine.worker === "northern" && routine.status === "active",
      ),
    );
    await page.getByRole("button", { name: "Buy coffee — 2 coins", exact: true }).click();
    await waitStored(page, (town) => town.coffee.orders.some((order) => order.buyer === "player"));
    let current = await stored(page);
    const humanOrder = ownOrder(current);
    assert.equal(person(current, "player").money, 2);
    assert.equal(current.economy.holds.find((hold) => hold.id === humanOrder.holdId).remaining, 2);
    result.customerMovement = await move(page, viewport.name === "phone");
    await advanceUntil(page, (town) => ownOrder(town)?.phase === "ready");
    current = await stored(page);
    assert.equal(
      current.coffee.cups.find((cup) => cup.orderId === humanOrder.id).custody,
      "counter",
    );
    assert.equal(current.economy.holds.find((hold) => hold.id === humanOrder.holdId).remaining, 0);
    assert.equal(sum(current), 90);
    result.checks.push(
      "Purchase holds full refund; actual funded NPC work creates one owned ready cup while customer leaves",
    );
    const readyImage = join(out, `${viewport.name}-ready-counter.png`);
    await page.screenshot({ path: readyImage });
    result.screenshots.push(readyImage);
    await coffeePanel(page);
    await page.getByRole("button", { name: "Walk to the coffee counter", exact: true }).click();
    await page.waitForFunction(
      () => window.__controlsTest.getX() === 7 && window.__controlsTest.getY() === 19,
    );
    await coffeePanel(page);
    await page.getByRole("button", { name: "Collect my coffee", exact: true }).click();
    await waitStored(
      page,
      (town) => town.coffee.orders.find((order) => order.buyer === "player")?.phase === "collected",
    );
    await assertAccessible(page, result, "collected coffee panel");
    const ticketImage = join(out, `${viewport.name}-coffee-ticket.png`);
    await page.screenshot({ path: ticketImage });
    result.screenshots.push(ticketImage);
    await nav(page).getByRole("button", { name: "Inventory", exact: true }).click();
    await page.getByRole("dialog", { name: "What you carry", exact: true }).waitFor();
    assert.ok(
      !(await page.getByRole("heading", { name: "Your bag is empty", exact: true }).isVisible()),
    );
    await page.getByRole("button", { name: /^Drink coffee \d+$/ }).click();
    await waitStored(
      page,
      (town) => town.coffee.orders.find((order) => order.buyer === "player")?.phase === "consumed",
    );
    assert.equal(await page.getByRole("button", { name: /^Drink coffee \d+$/ }).count(), 0);
    assert.equal(
      await page.evaluate(() => document.activeElement?.matches("[data-tool-feedback]")),
      true,
    );
    current = await stored(page);
    assert.deepEqual(current.identityRegistry, customerIdentity);
    assert.equal(sum(current), 90);
    assert.deepEqual(auditEconomy(current), []);
    result.checks.push(
      "Return by actual route, collect exact cup, inventory Drink once, and keyboard focus retained",
    );

    const workerRaw = fixture(`Worker ${viewport.name}`, true);
    await writeFile(join(out, `${viewport.name}-worker-fixture.json`), workerRaw);
    await importTown(page, workerRaw, "synthetic-worker-1559.json");
    const workerIdentity = (await stored(page)).identityRegistry;
    await coffeePanel(page);
    await page.getByRole("button", { name: "Start café trial", exact: true }).click();
    await waitStored(page, (town) => town.coffee?.enabled);
    await closePanel(page);
    await page.getByRole("button", { name: "View Kevin's character card", exact: true }).click();
    await page.getByRole("button", { name: "Review choices with Kevin", exact: true }).click();
    assert.equal(
      await page.locator("details").filter({ hasText: "Choices with Kevin" }).getAttribute("open"),
      "",
      "Review choices opens the current terms instead of toggling them closed",
    );
    await page.getByRole("button", { name: "Accept cafe shift · 5", exact: true }).click();
    await waitStored(page, (town) =>
      town.economy.work.agreements.some(
        (agreement) => agreement.worker === "player" && agreement.status === "active",
      ),
    );
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await reachWindow(page);
    await coffeePanel(page);
    await page.getByRole("button", { name: "Start serving", exact: true }).click();
    await waitStored(page, (town) =>
      town.coffee.routines.some(
        (routine) => routine.worker === "player" && routine.status === "active",
      ),
    );
    await advanceUntil(page, (town) =>
      town.coffee.orders.some((order) => order.buyer === "sub" && order.phase === "collected"),
    );
    current = await stored(page);
    assert.equal(
      person(current, "player").money,
      4,
      "Coffee task does not pay an extra piecework wage",
    );
    assert.equal(current.coffee.orders.filter((order) => order.buyer === "sub").length, 1);
    assert.ok(
      current.coffee.orders
        .find((order) => order.buyer === "sub")
        .contributions.every((entry) => entry.worker === "player"),
    );
    assert.equal(playerRoutine(current).status, "active");
    result.checks.push(
      "Kevin shift accepted normally; one Start serves Sub through collection without repeated cup clicks or per-cup pay",
    );
    await coffeePanel(page);
    await assertAccessible(page, result, "working controls");
    const workImage = join(out, `${viewport.name}-working-shift.png`);
    await page.screenshot({ path: workImage });
    result.screenshots.push(workImage);
    const attendance = playerAgreement(current).eligibleMinutes;
    result.workerManualOverride = await move(page, viewport.name === "phone");
    await waitStored(
      page,
      (town) =>
        town.coffee.routines.find((routine) => routine.worker === "player")?.status === "paused",
    );
    current = await stored(page);
    assert.equal(playerAgreement(current).status, "suspended");
    assert.equal(playerAgreement(current).eligibleMinutes, attendance);
    assert.equal(
      current.economy.holds.find((hold) => hold.id === playerAgreement(current).holdId).remaining,
      5,
    );
    result.checks.push(
      "Genuine manual keyboard/touch input suspends routine and attendance before displacement, retaining full wage hold",
    );

    await coffeePanel(page);
    await saveLock(page);
    await page.getByRole("button", { name: "Resume serving", exact: true }).click();
    await page.getByRole("button", { name: "Pause café shift now", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Pause café shift now", exact: true }).isEnabled(),
      true,
    );
    await page.getByRole("button", { name: "Pause café shift now", exact: true }).click();
    const whilePending = await exported(page, `${viewport.name}-pending-save-stopped.json`);
    assert.equal(playerRoutine(whilePending).status, "paused");
    assert.equal(playerAgreement(whilePending).status, "suspended");
    await releaseSaveLock(page);
    await waitStored(
      page,
      (town) =>
        town.coffee.routines.find((routine) => routine.worker === "player")?.status === "paused",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
    await coffeePanel(page);
    assert.equal(
      await page.getByRole("button", { name: "Resume serving", exact: true }).isVisible(),
      true,
    );
    assert.equal(
      await page.getByRole("button", { name: "Pause café shift now", exact: true }).count(),
      0,
    );
    result.checks.push(
      "Immediate Stop works while browser save lock is held; paused work survives actual reload without automatic control",
    );

    await page.getByRole("button", { name: "Resume serving", exact: true }).click();
    await waitStored(
      page,
      (town) =>
        town.coffee.routines.find((routine) => routine.worker === "player")?.status === "active",
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitStored(
      page,
      (town) =>
        town.paused &&
        town.coffee.routines.find((routine) => routine.worker === "player")?.status === "paused",
    );
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await coffeePanel(page);
    await page.getByRole("button", { name: "Resume serving", exact: true }).click();
    await waitStored(
      page,
      (town) =>
        town.coffee.routines.find((routine) => routine.worker === "player")?.status === "active",
    );
    result.checks.push(
      "Synthetic browser hide event suspends work and clock; returning requires explicit Resume",
    );

    const beforeFailure = await stored(page);
    await faultStorage(page, true);
    await advanceHour(page);
    await page.getByRole("button", { name: "Retry saving this town", exact: true }).waitFor();
    const retained = await exported(page, `${viewport.name}-retained-unsaved-town.json`);
    assert.equal(playerRoutine(retained).status, "paused");
    assert.equal(playerAgreement(retained).status, "suspended");
    assert.ok(
      playerAgreement(retained).eligibleMinutes >= playerAgreement(beforeFailure).eligibleMinutes,
    );
    assert.equal(sum(retained), 90);
    assert.deepEqual(retained.identityRegistry, workerIdentity);
    assert.deepEqual(auditEconomy(retained), []);
    const unchangedSaved = await stored(page);
    assert.deepEqual(
      unchangedSaved.economy,
      beforeFailure.economy,
      "Quota failure cannot replace last stored ledger",
    );
    await faultStorage(page, false);
    await page.getByRole("button", { name: "Retry saving this town", exact: true }).click();
    await page
      .getByRole("button", { name: "Retry saving this town", exact: true })
      .waitFor({ state: "hidden" });
    const recovered = await stored(page);
    assert.deepEqual(
      recovered.economy,
      retained.economy,
      "Recovery persists the retained ledger without duplicate outcomes",
    );
    assert.deepEqual(recovered.coffee, retained.coffee);
    assert.equal(playerRoutine(recovered).status, "paused");
    result.checks.push(
      "Quota failure retains complete exportable live state; explicit retry saves it once and does not resume automation",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "No horizontal overflow",
    );
    await coffeePanel(page);
    const finalImage = join(out, `${viewport.name}-recovered-paused.png`);
    await page.screenshot({ path: finalImage });
    result.screenshots.push(finalImage);
    assert.deepEqual(result.errors, [], "No uncaught browser errors");
    assert.deepEqual(result.consoleErrors, [], "No browser console errors");
    assert.equal(
      result.serverFunctionsBlocked.filter((request) => request.method === "POST").length,
      0,
      "Coffee never requests inference",
    );
    result.final = {
      day: recovered.day,
      minute: recovered.minute,
      total: sum(recovered),
      playerMinutes: playerAgreement(recovered).eligibleMinutes,
      coffeeOrders: recovered.coffee.orders.length,
    };
    await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
    await context.close();
  }
  report.passed = true;
  console.log(
    JSON.stringify(
      {
        passed: true,
        journeys: report.journeys.map((journey) => ({
          viewport: journey.viewport.name,
          checks: journey.checks.length,
          final: journey.final,
        })),
        report: join(out, "results.json"),
      },
      null,
      2,
    ),
  );
} catch (error) {
  report.passed = false;
  report.failures.push(error.stack || String(error));
  if (activePage && !activePage.isClosed()) {
    try {
      await activePage.screenshot({ path: join(out, "failure.png") });
    } catch {
      /* preserve other evidence */
    }
    try {
      await writeFile(join(out, "failure-body.txt"), await activePage.locator("body").innerText());
    } catch {
      /* preserve other evidence */
    }
  }
  console.error(
    JSON.stringify(
      { passed: false, error: error.message, report: join(out, "results.json") },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await writeFile(
    join(baseOut, "latest.json"),
    JSON.stringify({ report: join(out, "results.json"), passed: report.passed }, null, 2),
  );
  await browser?.close();
  preview?.kill("SIGTERM");
  await source?.close();
}
