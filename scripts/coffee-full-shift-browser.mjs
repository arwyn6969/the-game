import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

// Only the initial time and actor poses are synthetic. All funding, service,
// attendance and payment occur through ordinary UI actions and clock controls.
const target = new URL(process.env.GAME_COFFEE_SHIFT_QA_URL || "http://127.0.0.1:8200/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const out = resolve(process.env.GAME_COFFEE_SHIFT_QA_OUT || "artifacts/coffee-full-shift");
await mkdir(out, { recursive: true });
const report = {
  url: target.href,
  builtPreview: !process.env.GAME_COFFEE_SHIFT_QA_URL,
  liveInferenceCalls: 0,
  fixtureScope:
    "New paused 15:59 towns with initial actor poses only; no injected economy, agreement, attendance, service, wages or progress",
  limitations: ["Emulated Chromium desktop/phone; no physical devices or human acceptance"],
  journeys: [],
  failures: [],
};
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const routine = (town) => town.coffee?.routines.find((item) => item.worker === "player");
const agreement = (town) =>
  town.economy?.work?.agreements.find(
    (item) => item.worker === "player" && item.kind === "cafe-shift",
  );
const stamp = (town) => (town.day - 1) * 1440 + town.minute;
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const wages = (town) =>
  town.economy.transactions.filter(
    (transaction) =>
      transaction.agreementId === agreement(town)?.id && transaction.to === "agent:player",
  );
const finalFacts = (town) => ({
  identities: town.identityRegistry,
  balances: town.agents.map(({ id, money }) => ({ id, money })),
  tills: town.tills,
  economy: town.economy,
  coffee: town.coffee,
  projects: person(town, "player").projects,
});
let browser;
let source;
let preview;
let activePage;
let previewOutput = "";
async function closePanel(page) {
  const button = page.getByRole("button", { name: "Close Hobbs café", exact: true });
  if (await button.isVisible()) await button.click();
}
async function coffeePanel(page) {
  await page
    .getByRole("navigation", { name: "Your town tools", exact: true })
    .getByRole("button", { name: "Café", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Hobbs café", exact: true }).waitFor();
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
  await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
}
async function exported(page, name) {
  await closePanel(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download town", exact: true }).click(),
  ]);
  const path = join(out, name);
  await download.saveAs(path);
  const raw = await readFile(path, "utf8");
  return { raw, town: JSON.parse(raw).town };
}
async function advanceHour(page) {
  await closePanel(page);
  const hour = page.getByRole("button", { name: "Hour", exact: true });
  await hour.click();
  await hour.and(page.locator('[aria-busy="false"]')).waitFor({ timeout: 20000 });
}
async function advanceOneMinute(page) {
  const before = stamp(await stored(page));
  for (let tick = 0; tick < 40; tick++) {
    // Browser time drives the real requestAnimationFrame loop; no game hook
    // advances state. Frozen wall time prevents an assertion racing minute180.
    await page.clock.runFor(64);
    const current = await stored(page);
    if (stamp(current) > before) {
      assert.equal(stamp(current), before + 1, "Advance exactly one ordinary game minute");
      return current;
    }
  }
  throw new Error("The ordinary clock did not advance one minute");
}
async function screen(page, result, name) {
  const progress = page
    .locator("p")
    .filter({ hasText: /^(179|180)\/180 eligible minutes/ })
    .first();
  await progress.scrollIntoViewIfNeeded();
  const file = join(out, `${result.viewport.name}-${name}.png`);
  await page.screenshot({ path: file });
  result.screenshots.push(file);
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
  const { createTown } = await source.ssrLoadModule("/src/game/town.ts");
  const { exportTown, readTownFile } = await source.ssrLoadModule("/src/game/save.ts");
  const { auditEconomy } = await source.ssrLoadModule("/src/game/economy.ts");
  function fixture(name) {
    const town = createTown(name);
    town.minute = 959;
    town.paused = true;
    for (const actor of town.agents) {
      actor.tile = { ...actor.home };
      actor.path = [];
    }
    person(town, "player").tile = { x: 8, y: 19 };
    person(town, "kevin").tile = { x: 9, y: 19 };
    person(town, "sub").tile = { x: 7, y: 19 };
    assert.equal(town.economy, undefined);
    assert.equal(town.coffee, undefined);
    assert.equal(person(town, "player").shiftHours, 0);
    assert.equal(total(town), 90);
    const raw = exportTown(town);
    assert.equal(readTownFile(raw).status, "ready");
    return raw;
  }
  if (!process.env.GAME_COFFEE_SHIFT_QA_URL) {
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
      hourAdvances: [],
      errors: [],
      blockedProviderRequests: [],
      screenshots: [],
    };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
    });
    await context.addInitScript(() => localStorage.setItem("the-game-local-dialogue-only", "true"));
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== target.origin)
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      if (url.pathname.includes("_serverFn") && request.method() === "POST") {
        result.blockedProviderRequests.push(url.pathname);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"ok":false}',
        });
      }
      return route.continue();
    });
    const page = (activePage = await context.newPage());
    await page.clock.install({ time: new Date("2026-11-04T12:00:00.000Z") });
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByLabel("What do they call you?", { exact: true }).fill(`Shift ${viewport.name}`);
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(() =>
      Boolean(window.__game && localStorage.getItem("the-game-town-v2")),
    );
    await importTown(page, fixture(`Shift ${viewport.name}`), "synthetic-unworked-1559.json");
    // Install before navigation and freeze after startup, as required by the
    // browser clock API. All later clock changes are explicit runFor calls.
    await page.clock.pauseAt(new Date("2026-11-04T13:00:00.000Z"));
    const opening = (await exported(page, `${viewport.name}-opening.json`)).town;
    const playerOpeningMoney = person(opening, "player").money;
    const openingIdentity = opening.identityRegistry;
    await coffeePanel(page);
    await page.getByRole("button", { name: "Start café trial", exact: true }).click();
    await closePanel(page);
    await page.getByRole("button", { name: "View Kevin's character card", exact: true }).click();
    await page.getByRole("button", { name: "Review choices with Kevin", exact: true }).click();
    await page.getByRole("button", { name: "Accept cafe shift · 5", exact: true }).click();
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    let current = (await exported(page, `${viewport.name}-accepted-zero.json`)).town;
    assert.equal(agreement(current).eligibleMinutes, 0);
    assert.equal(wages(current).length, 0);
    assert.equal(
      current.economy.holds.find((hold) => hold.id === agreement(current).holdId).remaining,
      5,
    );
    assert.equal(person(current, "player").money, playerOpeningMoney);
    assert.equal(total(current), 90);
    result.checks.push(
      "Normal enable and Kevin quote reserve the full wage with zero attendance and no advance payment",
    );
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await advanceOneMinute(page);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    assert.equal((await stored(page)).minute, 960);
    await coffeePanel(page);
    await page.getByRole("button", { name: "Start serving", exact: true }).click();
    await closePanel(page);
    current = (await exported(page, `${viewport.name}-service-start.json`)).town;
    assert.equal(routine(current).status, "active");
    assert.equal(agreement(current).eligibleMinutes, 0);
    for (let attempt = 0; agreement(current).eligibleMinutes < 119 && attempt < 30; attempt++) {
      const before = stamp(current);
      await advanceHour(page);
      current = await stored(page);
      const minutes = stamp(current) - before;
      assert.ok(minutes > 0 && minutes <= 60);
      assert.ok(agreement(current).eligibleMinutes < 180);
      assert.equal(wages(current).length, 0, "No Hour action may pay before 180 eligible minutes");
      assert.equal(person(current, "player").money, playerOpeningMoney);
      result.hourAdvances.push(minutes);
    }
    assert.ok(agreement(current).eligibleMinutes >= 119);
    assert.ok(agreement(current).eligibleMinutes <= 178);
    await page.getByRole("button", { name: "4×", exact: true }).click();
    while (agreement(current).eligibleMinutes < 179) current = await advanceOneMinute(page);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const penultimate = (await exported(page, `${viewport.name}-179-minutes.json`)).town;
    assert.equal(agreement(penultimate).eligibleMinutes, 179);
    assert.equal(agreement(penultimate).status, "active");
    assert.equal(wages(penultimate).length, 0);
    assert.equal(
      penultimate.economy.work.payables.filter(
        (item) => item.agreementId === agreement(penultimate).id,
      ).length,
      0,
    );
    assert.equal(person(penultimate, "player").money, playerOpeningMoney);
    assert.equal(
      penultimate.economy.holds.find((hold) => hold.id === agreement(penultimate).holdId).remaining,
      5,
    );
    assert.deepEqual(auditEconomy(penultimate), []);
    await coffeePanel(page);
    await screen(page, result, "179-unpaid");
    await closePanel(page);
    result.checks.push(
      "179 eligible minutes retain all five reserved coins and create neither payable nor wage payment",
    );
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await advanceOneMinute(page);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const paid = (await exported(page, `${viewport.name}-180-paid.json`)).town;
    const shift = agreement(paid);
    assert.equal(shift.eligibleMinutes, 180);
    assert.equal(shift.status, "completed");
    assert.equal(new Set(shift.attendance).size, 180);
    assert.equal(shift.attendance.length, 180);
    assert.deepEqual(
      new Set(shift.attendance),
      new Set(Array.from({ length: 180 }, (_, index) => `1:${960 + index}`)),
      "Each actual 16:00–18:59 interval is credited exactly once",
    );
    assert.equal(wages(paid).length, 1);
    assert.equal(wages(paid)[0].amount, 5);
    assert.equal(wages(paid)[0].from, "till:cafe");
    assert.equal(person(paid, "player").money, playerOpeningMoney + 5);
    assert.equal(paid.economy.holds.find((hold) => hold.id === shift.holdId).remaining, 0);
    assert.equal(
      paid.economy.work.payables.filter(
        (item) => item.agreementId === shift.id && item.status === "settled",
      ).length,
      1,
    );
    assert.equal(
      paid.economy.work.receipts.filter((item) => item.agreementId === shift.id).length,
      1,
    );
    assert.equal(routine(paid).status, "ended");
    assert.deepEqual(paid.identityRegistry, openingIdentity);
    assert.equal(total(paid), total(opening));
    assert.deepEqual(auditEconomy(paid), []);
    assert.equal(
      await page.getByRole("button", { name: "Pause café shift now", exact: true }).count(),
      0,
    );
    await coffeePanel(page);
    assert.match(
      await page.getByRole("dialog", { name: "Hobbs café", exact: true }).innerText(),
      /5 coins paid/,
    );
    assert.equal(await page.getByRole("button", { name: "Start serving", exact: true }).count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Resume serving", exact: true }).count(),
      0,
    );
    await screen(page, result, "180-paid-ended");
    await closePanel(page);
    result.checks.push(
      "The 180th minute pays exactly five existing café coins once and ends service control with no overtime grant",
    );
    const paidFacts = finalFacts(paid);
    await advanceHour(page);
    const afterHour = (await exported(page, `${viewport.name}-after-window.json`)).town;
    assert.ok(stamp(afterHour) > stamp(paid));
    assert.equal(agreement(afterHour).eligibleMinutes, 180);
    assert.equal(wages(afterHour).length, 1);
    assert.equal(person(afterHour, "player").money, playerOpeningMoney + 5);
    assert.deepEqual(afterHour.economy.holds, paidFacts.economy.holds);
    assert.equal(total(afterHour), 90);
    const portable = await exported(page, `${viewport.name}-completed-portable.json`);
    const portableFacts = finalFacts(portable.town);
    await importTown(page, portable.raw, "synthetic-completed-shift.json");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game));
    const restored = (await exported(page, `${viewport.name}-restored.json`)).town;
    assert.deepEqual(
      finalFacts(restored),
      portableFacts,
      "Export/import and reload cannot rewrite settled financial facts or issue another wage",
    );
    assert.equal(wages(restored).length, 1);
    assert.equal(agreement(restored).eligibleMinutes, 180);
    assert.equal(routine(restored).status, "ended");
    assert.deepEqual(auditEconomy(restored), []);
    result.checks.push(
      "Time after the window, export/import and reload preserve one settlement, all identities and conserved money",
    );
    result.final = {
      eligibleMinutes: 180,
      wagePayments: wages(restored).length,
      wage: wages(restored)[0].amount,
      playerMoney: person(restored, "player").money,
      totalCoins: total(restored),
    };
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.blockedProviderRequests, []);
    console.log(JSON.stringify({ viewport: viewport.name, ok: true, ...result.final }));
    await context.close();
    activePage = undefined;
  }
} catch (error) {
  report.failures.push(String(error.stack || error));
  if (activePage) await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  process.exitCode = 1;
  console.error(report.failures[0]);
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  await source?.close();
  preview?.kill("SIGTERM");
}
