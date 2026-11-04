import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";

// Real pairs of tabs share localStorage and Web Locks. Initial time/poses are
// synthetic; all café choices, money movements and work use ordinary controls.
const target = new URL(process.env.GAME_COFFEE_TABS_QA_URL || "http://127.0.0.1:8201/");
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
const out = resolve(process.env.GAME_COFFEE_TABS_QA_OUT || "artifacts/coffee-concurrent-tabs");
await mkdir(out, { recursive: true });
const report = {
  url: target.href,
  previewManagedByHarness: !process.env.GAME_COFFEE_TABS_QA_URL,
  liveInferenceCalls: 0,
  authChanged: false,
  syntheticFaults: ["A labelled held Web Lock queues two actual tabs' service-save attempts"],
  limitations: [
    "One Chromium browser context per journey; emulated sizes, no physical devices or human acceptance",
  ],
  journeys: [],
  failures: [],
};
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const ownOrder = (town) => town.coffee.orders.find((order) => order.buyer === "player");
const ownRoutine = (town) => town.coffee.routines.find((routine) => routine.worker === "player");
const ownAgreement = (town) =>
  town.economy.work.agreements.find(
    (agreement) => agreement.worker === "player" && agreement.kind === "cafe-shift",
  );
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const storedRaw = (page) => page.evaluate(() => localStorage.getItem("the-game-town-v2"));
const stored = async (page) => JSON.parse(await storedRaw(page)).town;
const durableFacts = (town) => ({
  identities: town.identityRegistry,
  balances: town.agents.map(({ id, money }) => ({ id, money })),
  tills: town.tills,
  favors: town.favors,
  projects: town.agents.map(({ id, projects }) => ({ id, projects })),
  transactions: town.economy.transactions,
  holds: town.economy.holds,
  projectBalances: town.economy.projectBalances,
  agreements: town.economy.work.agreements.map((agreement) => ({
    ...agreement,
    status: undefined,
  })),
  payables: town.economy.work.payables,
  receipts: town.economy.work.receipts,
  orders: town.coffee.orders,
  cups: town.coffee.cups,
});
let browser;
let source;
let preview;
let activePage;
let readSnapshot;
let previewOutput = "";
async function ready(page) {
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
}
async function waitStored(page, predicate) {
  await page.waitForFunction((code) => {
    const raw = localStorage.getItem("the-game-town-v2");
    return raw && Function("town", `return (${code})(town)`)(JSON.parse(raw).town);
  }, predicate.toString());
}
async function coffeePanel(page) {
  if (await page.getByRole("dialog", { name: "Hobbs café", exact: true }).isVisible()) return;
  await page
    .getByRole("navigation", { name: "Your town tools", exact: true })
    .getByRole("button", { name: "Café", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Hobbs café", exact: true }).waitFor();
}
async function closePanel(page) {
  const button = page.getByRole("button", { name: "Close Hobbs café", exact: true });
  if (await button.isVisible()) await button.click();
}
async function importTown(page, raw) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-concurrent-cafe.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
}
async function downloaded(page, name, conflict = false) {
  await closePanel(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: conflict ? "Download this copy" : "Download town", exact: true })
      .click(),
  ]);
  const file = join(out, name);
  await download.saveAs(file);
  const raw = await readFile(file, "utf8");
  return { raw, town: JSON.parse(raw).town };
}
async function hour(page) {
  await closePanel(page);
  const button = page.getByRole("button", { name: "Hour", exact: true });
  await button.click();
  await button.and(page.locator('[aria-busy="false"]')).waitFor({ timeout: 20000 });
}
async function conflict(page, winnerRaw, result, name) {
  await page.getByRole("button", { name: "Load saved town", exact: true }).waitFor();
  assert.equal(
    await storedRaw(page),
    winnerRaw,
    "The losing tab must preserve the winner's exact saved bytes",
  );
  assert.equal(
    await page.getByRole("button", { name: "Pause café shift now", exact: true }).count(),
    0,
  );
  const copy = await downloaded(
    page,
    `${result.viewport.name}-${result.scenario}-${name}-losing-copy.json`,
    true,
  );
  assert.ok(
    copy.town.identityRegistry,
    "The losing live town remains downloadable with its identities",
  );
  const backups = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith("the-game-town-backup-v1:conflict:"))
      .map(([, raw]) => raw),
  );
  assert.ok(
    backups.some((raw) => {
      // Backups store the complete pre-suspension save envelope. Apply the
      // documented load recovery before comparing it with the paused download.
      const backup = readSnapshot(raw);
      return (
        backup.status === "ready" &&
        isDeepStrictEqual(durableFacts(backup.town), durableFacts(copy.town))
      );
    }),
    "A complete, valid conflict backup retains the downloadable losing town's identities, money, holds, orders and work progress",
  );
  const retry = page.getByRole("button", { name: "Retry saving this town", exact: true });
  await retry.click();
  // The conflict alert was already visible. Wait for the retry's pending save
  // to settle before checking that it preserved the winner's shared bytes.
  await retry.and(page.locator(":enabled")).waitFor();
  await page.getByRole("button", { name: "Load saved town", exact: true }).waitFor();
  assert.equal(
    await storedRaw(page),
    winnerRaw,
    "Retrying a stale candidate cannot replace the newer saved town",
  );
  const screenshot = join(out, `${result.viewport.name}-${result.scenario}-${name}-conflict.png`);
  await page.screenshot({ path: screenshot });
  result.screenshots.push(screenshot);
  return copy.town;
}
async function recover(page, expected, result, name) {
  await page.getByRole("button", { name: "Load saved town", exact: true }).click();
  await page
    .getByRole("button", { name: "Load saved town", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.getByRole("button", { name: "Pause café shift now", exact: true }).count(),
    0,
    "Loading a saved town cannot restore automatic player service authority",
  );
  const restored = await downloaded(
    page,
    `${result.viewport.name}-${result.scenario}-${name}-recovered.json`,
  );
  assert.deepEqual(
    durableFacts(restored.town),
    durableFacts(expected),
    "Recovery retains every financial, cup, work-progress and identity fact",
  );
  assert.equal(
    restored.town.coffee.routines.some((routine) => routine.status === "active"),
    false,
    "Recovery revokes all automatic café service grants",
  );
  return restored.town;
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
  readSnapshot = readTownFile;
  const { auditEconomy } = await source.ssrLoadModule("/src/game/economy.ts");
  function fixture(name, worker) {
    const town = createTown(name);
    town.minute = 960;
    town.paused = true;
    for (const actor of town.agents) {
      actor.tile = { ...actor.home };
      actor.path = [];
    }
    person(town, "player").tile = worker ? { x: 8, y: 19 } : { x: 7, y: 19 };
    person(town, "kevin").tile = { x: 9, y: 19 };
    person(town, "northern").tile = { x: 8, y: 18 };
    assert.equal(town.economy, undefined);
    const raw = exportTown(town);
    assert.equal(readTownFile(raw).status, "ready");
    return raw;
  }
  if (!process.env.GAME_COFFEE_TABS_QA_URL) {
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
    let available = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${previewOutput}`);
      try {
        if ((await fetch(target, { signal: AbortSignal.timeout(1000) })).ok) {
          available = true;
          break;
        }
      } catch {
        /* warming */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(available, `Built preview not available: ${previewOutput}`);
  }
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    for (const scenario of ["refund-and-owned-cup", "queued-service-control"]) {
      const result = {
        viewport,
        scenario,
        checks: [],
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
      await context.addInitScript(() =>
        localStorage.setItem("the-game-local-dialogue-only", "true"),
      );
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
      const watch = (page) => {
        page.on("pageerror", (error) => result.errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") result.errors.push(message.text());
        });
      };
      const first = (activePage = await context.newPage());
      watch(first);
      await first.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      await first
        .getByLabel("What do they call you?", { exact: true })
        .fill(`Tabs ${viewport.name}`);
      await first.getByRole("button", { name: "Walk in", exact: true }).click();
      await first.waitForFunction(() =>
        Boolean(window.__game && localStorage.getItem("the-game-town-v2")),
      );
      assert.equal(
        await first.evaluate(() => typeof navigator.locks?.request),
        "function",
        "Real browser Web Locks are required for this concurrency packet",
      );
      await importTown(
        first,
        fixture(`Tabs ${viewport.name}`, scenario === "queued-service-control"),
      );
      await coffeePanel(first);
      await first.getByRole("button", { name: "Start café trial", exact: true }).click();
      await waitStored(first, (town) => town.coffee?.enabled);
      if (scenario === "refund-and-owned-cup") {
        await first
          .getByRole("button", { name: "Ask Kevin for staffed service", exact: true })
          .click();
        await waitStored(first, (town) =>
          town.coffee.routines.some(
            (routine) => routine.worker === "northern" && routine.status === "active",
          ),
        );
        await first.getByRole("button", { name: "Buy coffee — 2 coins", exact: true }).click();
        await waitStored(first, (town) =>
          town.coffee.orders.some((order) => order.buyer === "player"),
        );
        const purchased = await stored(first);
        const orderId = ownOrder(purchased).id;
        const staffAgreement = purchased.economy.work.agreements.find(
          (agreement) => agreement.worker === "northern" && agreement.kind === "cafe-shift",
        );
        assert.ok(
          staffAgreement,
          "The ordinary staffing choice created Northern's funded agreement",
        );
        const staffHoldId = staffAgreement.holdId;
        assert.equal(purchased.economy.holds.find((hold) => hold.id === staffHoldId).remaining, 5);
        assert.equal(person(purchased, "player").money, 2);
        assert.equal(
          purchased.economy.holds.find((hold) => hold.id === ownOrder(purchased).holdId).remaining,
          2,
        );
        const second = (activePage = await context.newPage());
        watch(second);
        await ready(second);
        await coffeePanel(second);
        await first.bringToFront();
        await coffeePanel(first);
        await first
          .getByRole("button", { name: "Cancel for a full refund — 2 coins", exact: true })
          .click();
        await waitStored(first, (town) =>
          town.coffee.orders.some((order) => order.phase === "refunded"),
        );
        await second.bringToFront();
        const refundedRaw = await storedRaw(second);
        const refunded = JSON.parse(refundedRaw).town;
        assert.equal(ownOrder(refunded).id, orderId);
        assert.equal(ownOrder(refunded).phase, "refunded");
        assert.equal(person(refunded, "player").money, 4);
        assert.equal(
          refunded.economy.transactions.filter(
            (transaction) => transaction.id === ownOrder(refunded).refundId,
          ).length,
          1,
        );
        await second
          .getByRole("button", { name: "Cancel for a full refund — 2 coins", exact: true })
          .click();
        await conflict(second, refundedRaw, result, "stale-refund");
        assert.equal((await stored(second)).coffee.cups.length, 0);
        await recover(second, refunded, result, "refund");
        result.checks.push(
          "Two real tabs cannot refund the same pending ticket twice; the rejected tab retains a full downloadable copy and explicit recovery",
        );
        await first.bringToFront();
        await coffeePanel(first);
        const staff = first.getByRole("button", {
          name: "Ask Kevin for staffed service",
          exact: true,
        });
        if (await staff.isEnabled()) await staff.click();
        await first.getByRole("button", { name: "Buy coffee — 2 coins", exact: true }).click();
        await waitStored(
          first,
          (town) => town.coffee.orders.filter((order) => order.buyer === "player").length === 2,
        );
        await second.bringToFront();
        const secondOrderRaw = await storedRaw(second);
        const secondOrder = JSON.parse(secondOrderRaw).town;
        await coffeePanel(second);
        await second
          .getByRole("button", { name: "Ask Kevin for staffed service", exact: true })
          .click();
        const losingService = await conflict(second, secondOrderRaw, result, "stale-service");
        assert.deepEqual(
          losingService.coffee.orders
            .filter((order) => order.buyer === "player")
            .map((order) => ({
              id: order.id,
              phase: order.phase,
            })),
          [{ id: orderId, phase: "refunded" }],
          "The downloadable losing town keeps its own older ticket history",
        );
        assert.equal(person(losingService, "player").money, 4);
        assert.equal(
          secondOrder.coffee.orders.filter((order) => order.buyer === "player").length,
          2,
        );
        assert.equal(person(secondOrder, "player").money, 2);
        result.checks.push(
          "A stale staffing write and retry cannot erase the winning tab's new paid ticket or its protected refund hold",
        );
        await first.bringToFront();
        await coffeePanel(first);
        const staffing = first.getByRole("button", {
          name: "Ask Kevin for staffed service",
          exact: true,
        });
        if (await staffing.isEnabled()) await staffing.click();
        for (let attempt = 0; attempt < 8; attempt++) {
          const state = await stored(first);
          if (
            state.coffee.orders.some((order) => order.buyer === "player" && order.phase === "ready")
          )
            break;
          await hour(first);
        }
        const prepared = await stored(first);
        const readyOrder = prepared.coffee.orders.find(
          (order) => order.buyer === "player" && order.phase === "ready",
        );
        assert.ok(readyOrder, "Ordinary NPC service must prepare the second owned cup");
        await coffeePanel(first);
        await first.getByRole("button", { name: "Collect my coffee", exact: true }).click();
        await waitStored(first, (town) =>
          town.coffee.cups.some((cup) => cup.owner === "player" && cup.custody === "inventory"),
        );
        await second.bringToFront();
        const ownedRaw = await storedRaw(second);
        const owned = JSON.parse(ownedRaw).town;
        assert.equal(
          owned.coffee.cups.filter((cup) => cup.owner === "player" && cup.custody === "inventory")
            .length,
          1,
        );
        assert.equal(person(owned, "player").money, 2);
        const retainedStaffHolds = owned.economy.holds.filter((hold) => hold.id === staffHoldId);
        assert.equal(retainedStaffHolds.length, 1, "Northern's original wage hold remains unique");
        assert.equal(retainedStaffHolds[0].account, "till:cafe");
        assert.equal(retainedStaffHolds[0].remaining, 5);
        assert.equal(
          owned.economy.work.agreements.filter((agreement) => agreement.id === staffAgreement.id)
            .length,
          1,
          "The original funded staffing agreement cannot be duplicated",
        );
        assert.equal(
          owned.economy.transactions.filter((transaction) => transaction.id === readyOrder.saleId)
            .length,
          1,
        );
        const recovered = await recover(second, owned, result, "owned-cup");
        assert.equal(
          recovered.coffee.cups.filter((cup) => cup.orderId === readyOrder.id).length,
          1,
        );
        assert.equal(
          recovered.coffee.orders.filter(
            (order) => order.id === orderId && order.phase === "refunded",
          ).length,
          1,
        );
        assert.deepEqual(auditEconomy(recovered), []);
        assert.equal(total(recovered), 90);
        assert.deepEqual(secondOrder.identityRegistry, recovered.identityRegistry);
        result.checks.push(
          "A real prepared/collected cup, one refund, one later sale and the nonempty five-coin staff wage hold survive stale-tab recovery with conserved money",
        );
      } else {
        await closePanel(first);
        await first
          .getByRole("button", { name: "View Kevin's character card", exact: true })
          .click();
        await first.getByRole("button", { name: "Review choices with Kevin", exact: true }).click();
        await first.getByRole("button", { name: "Accept cafe shift · 5", exact: true }).click();
        await first.getByRole("button", { name: "Close conversation", exact: true }).click();
        await waitStored(first, (town) =>
          town.economy.work.agreements.some((agreement) => agreement.worker === "player"),
        );
        const second = (activePage = await context.newPage());
        watch(second);
        await ready(second);
        await coffeePanel(first);
        await coffeePanel(second);
        result.visibilityAtQueue = await Promise.all([
          first.evaluate(() => document.visibilityState),
          second.evaluate(() => document.visibilityState),
        ]);
        await first.evaluate(async () => {
          const acquired = new Promise((resolve) => {
            window.__coffeeTabsLockAcquired = resolve;
          });
          void navigator.locks.request("the-game-town-save", async () => {
            window.__coffeeTabsLockAcquired();
            await new Promise((resolve) => {
              window.__coffeeTabsUnlock = resolve;
            });
          });
          await acquired;
        });
        await first.getByRole("button", { name: "Start serving", exact: true }).click();
        await first.waitForFunction(
          async () =>
            (await navigator.locks.query()).pending.filter(
              (lock) => lock.name === "the-game-town-save",
            ).length >= 1,
        );
        await second.getByRole("button", { name: "Start serving", exact: true }).click();
        await first.waitForFunction(
          async () =>
            (await navigator.locks.query()).pending.filter(
              (lock) => lock.name === "the-game-town-save",
            ).length >= 2,
        );
        await first.evaluate(() => window.__coffeeTabsUnlock());
        await second.getByRole("button", { name: "Load saved town", exact: true }).waitFor();
        const winnerRaw = await storedRaw(first);
        const winner = JSON.parse(winnerRaw).town;
        assert.equal(
          winner.coffee.routines.filter((routine) => routine.worker === "player").length,
          1,
        );
        assert.equal(
          winner.economy.commandReceipts.filter((receipt) => receipt.kind === "coffee.start")
            .length,
          1,
        );
        await conflict(second, winnerRaw, result, "overlapping-start");
        result.checks.push(
          "Two actual tab writers queued behind one Web Lock produce one service-start receipt and one rejected candidate; stale retry never overwrites the winner",
        );
        await first.bringToFront();
        await coffeePanel(first);
        const resume = first.getByRole("button", { name: "Resume serving", exact: true });
        if (await resume.isVisible()) await resume.click();
        await closePanel(first);
        await hour(first);
        const progressed = await stored(first);
        assert.ok(ownAgreement(progressed).eligibleMinutes > 0);
        assert.equal(
          progressed.economy.holds.find((hold) => hold.id === ownAgreement(progressed).holdId)
            .remaining,
          5,
        );
        assert.equal(person(progressed, "player").money, 4);
        assert.equal(
          progressed.economy.work.payables.filter((payable) => payable.worker === "player").length,
          0,
        );
        await second.bringToFront();
        const progressedRaw = await storedRaw(second);
        const retained = JSON.parse(progressedRaw).town;
        await conflict(second, progressedRaw, result, "progress-protected");
        const recovered = await recover(second, retained, result, "progress");
        assert.equal(ownRoutine(recovered).status, "paused");
        assert.equal(ownAgreement(recovered).status, "suspended");
        assert.equal(
          ownAgreement(recovered).eligibleMinutes,
          ownAgreement(retained).eligibleMinutes,
        );
        assert.deepEqual(auditEconomy(recovered), []);
        assert.equal(total(recovered), 90);
        result.checks.push(
          "Real winning-tab attendance and its complete wage reservation survive losing-tab retry/recovery; loading requires explicit service authorization again",
        );
      }
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.blockedProviderRequests, []);
      console.log(
        JSON.stringify({
          viewport: viewport.name,
          scenario,
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
  if (activePage) await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  process.exitCode = 1;
  console.error(report.failures[0]);
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  await source?.close();
  preview?.kill("SIGTERM");
}
