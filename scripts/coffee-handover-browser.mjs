import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

// Pose-only synthetic towns; ordinary imports, choices, clock and movement after setup.
const target = new URL(process.env.GAME_COFFEE_HANDOVER_QA_URL || "http://127.0.0.1:8201/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const out = resolve(process.env.GAME_COFFEE_HANDOVER_QA_OUT || "artifacts/coffee-handover");
await mkdir(out, { recursive: true });
const report = {
  node: process.version,
  url: target.href,
  liveInferenceCalls: 0,
  journeys: [],
  failures: [],
};
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const routine = (town, worker) => town.coffee.routines.find((item) => item.worker === worker);
const agreement = (town, worker) =>
  town.economy.work.agreements.find((item) => item.id === routine(town, worker)?.agreementId);
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const total = (town) =>
  town.agents.reduce((sum, actor) => sum + actor.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const contributionMinutes = (order, worker) =>
  order.contributions
    .filter((part) => part.worker === worker)
    .reduce((sum, part) => sum + part.end - part.start, 0);
let source, browser, active;
async function waitStored(page, predicate) {
  await page.waitForFunction((code) => {
    const raw = localStorage.getItem("the-game-town-v2");
    return raw && Function("town", `return (${code})(town)`)(JSON.parse(raw).town);
  }, predicate.toString());
}
async function closePanels(page) {
  for (const name of ["Close conversation", "Close Hobbs café"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible()) await button.click();
  }
}
async function cafe(page) {
  await closePanels(page);
  await page
    .getByRole("navigation", { name: "Your town tools", exact: true })
    .getByRole("button", { name: "Café", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Hobbs café", exact: true }).waitFor();
}
async function importTown(page, raw) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-handover.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
}
async function until(page, predicate, limit = 150) {
  await page.getByRole("button", { name: "4×", exact: true }).click();
  for (let step = 0; step < limit; step++) {
    if (predicate(await stored(page))) break;
    await page.clock.runFor(250);
  }
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await waitStored(page, (town) => town.paused);
  const state = await stored(page);
  assert.ok(predicate(state), "Expected handover state from ordinary 4× clock controls");
  return state;
}
async function stepAside(page, touch) {
  await closePanels(page);
  const state = await stored(page);
  const before = await page.evaluate(() => ({
    x: window.__controlsTest.getX(),
    y: window.__controlsTest.getY(),
  }));
  const direction = await page.evaluate(
    ({ before, occupied }) =>
      [
        { key: "ArrowLeft", label: "West", x: before.x - 1, y: before.y },
        { key: "ArrowDown", label: "South", x: before.x, y: before.y + 1 },
        { key: "ArrowUp", label: "North", x: before.x, y: before.y - 1 },
        { key: "ArrowRight", label: "East", x: before.x + 1, y: before.y },
      ].find(
        (point) =>
          window.__game.tile(point.x, point.y)?.block === false &&
          !occupied.some((tile) => tile.x === point.x && tile.y === point.y) &&
          ![
            { x: 5, y: 18 },
            { x: 6, y: 18 },
            { x: 7, y: 19 },
          ].some((tile) => tile.x === point.x && tile.y === point.y),
      ),
    {
      before,
      occupied: state.agents.filter((actor) => actor.id !== "player").map((actor) => actor.tile),
    },
  );
  assert.ok(direction, "A free non-station tile permits ordinary manual override");
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
    await page.clock.runFor(100);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await page.keyboard.down(direction.key);
    await page.clock.runFor(100);
    await page.keyboard.up(direction.key);
  }
  await page.clock.runFor(100);
  const after = await page.evaluate(() => ({
    x: window.__controlsTest.getX(),
    y: window.__controlsTest.getY(),
  }));
  assert.notDeepEqual(
    after,
    before,
    "Manual movement must clear the stopped worker from the brew station",
  );
  assert.notDeepEqual(after, { x: 5, y: 18 });
  assert.notDeepEqual(after, { x: 6, y: 18 });
  return { before, after, input: touch ? "touch" : "keyboard" };
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
  const { activateFundedTown } = await source.ssrLoadModule("/src/game/payroll-runtime.ts");
  const { exportTown, readTownFile } = await source.ssrLoadModule("/src/game/save.ts");
  const { auditEconomy } = await source.ssrLoadModule("/src/game/economy.ts");
  const { validateCoffee } = await source.ssrLoadModule("/src/game/coffee-validation.ts");
  function fixture(name) {
    const town = createTown(name);
    town.minute = 959;
    town.paused = true;
    town.guide = 3;
    town.sawHint = true;
    for (const actor of town.agents) {
      actor.tile = { ...actor.home };
      actor.path = [];
    }
    person(town, "player").tile = { x: 8, y: 19 };
    person(town, "kevin").tile = { x: 9, y: 19 };
    person(town, "sub").tile = { x: 7, y: 19 };
    person(town, "northern").tile = { x: 8, y: 18 };
    assert.equal(activateFundedTown(town).ok, true);
    const raw = exportTown(town);
    assert.equal(readTownFile(raw).status, "ready");
    return raw;
  }
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = { viewport, errors: [], blockedProviderRequests: [], checks: [] };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
    });
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
    const page = (active = await context.newPage());
    await page.clock.install({ time: new Date("2026-11-04T12:00:00.000Z") });
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded" });
    const name = `Handover ${viewport.name}`;
    await page.getByLabel("What do they call you?", { exact: true }).fill(name);
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
    await importTown(page, fixture(name));
    await page.clock.pauseAt(new Date("2026-11-04T13:00:00.000Z"));
    await cafe(page);
    await page.getByRole("button", { name: "Start café trial", exact: true }).click();
    await waitStored(page, (town) => town.coffee?.enabled);
    await closePanels(page);
    await page.getByRole("button", { name: "View Kevin's character card", exact: true }).click();
    await page.getByRole("button", { name: "Review choices with Kevin", exact: true }).click();
    await page.getByRole("button", { name: "Accept cafe shift · 5", exact: true }).click();
    await waitStored(page, (town) =>
      town.agents
        .find((actor) => actor.id === "player")
        .projects.some((project) => project.kind === "shift" && project.status === "open"),
    );
    await closePanels(page);
    await until(page, (town) => town.minute >= 960, 8);
    await cafe(page);
    await page.getByRole("button", { name: "Start serving", exact: true }).click();
    await waitStored(page, (town) =>
      town.coffee.routines.some((item) => item.worker === "player" && item.status === "active"),
    );
    await closePanels(page);
    const partial = await until(
      page,
      (town) => town.coffee.orders.some((order) => order.buyer === "sub" && order.brewMinutes >= 5),
      50,
    );
    const original = partial.coffee.orders.find((order) => order.buyer === "sub");
    assert.ok(original.brewMinutes > 0 && original.brewMinutes < 20);
    const orderId = original.id;
    const identity = structuredClone(partial.identityRegistry);
    await page.getByRole("button", { name: "Pause café shift now", exact: true }).click();
    await waitStored(
      page,
      (town) => town.coffee.routines.find((item) => item.worker === "player").status === "paused",
    );
    let current = await stored(page),
      ticket = current.coffee.orders.find((order) => order.id === orderId);
    assert.equal(ticket.assignedAgreementId, null);
    assert.equal(ticket.brewMinutes, original.brewMinutes);
    assert.equal(ticket.pickupSlot, original.pickupSlot);
    result.manualOverride = await stepAside(page, viewport.name === "phone");
    await cafe(page);
    await page.getByRole("button", { name: "Ask Kevin for staffed service", exact: true }).click();
    await waitStored(page, (town) =>
      town.coffee.routines.some((item) => item.worker === "northern" && item.status === "active"),
    );
    await closePanels(page);
    const successor = await until(
      page,
      (town) =>
        town.coffee.orders.some(
          (order) =>
            order.id === orderId && order.contributions.some((part) => part.worker === "northern"),
        ),
      40,
    );
    const successorOrder = successor.coffee.orders.find((order) => order.id === orderId);
    assert.equal(successorOrder.assignedAgreementId, agreement(successor, "northern").id);
    assert.ok(successorOrder.assignmentRevision > original.assignmentRevision);
    await cafe(page);
    await page.getByRole("button", { name: "Resume serving", exact: true }).click();
    await waitStored(
      page,
      (town) => town.coffee.routines.filter((item) => item.status === "active").length === 2,
    );
    current = await stored(page);
    assert.equal(
      current.coffee.orders.find((order) => order.id === orderId).assignedAgreementId,
      agreement(current, "northern").id,
    );
    assert.equal(
      routine(current, "player").orderId,
      null,
      "Resuming the old worker cannot steal the successor's ticket",
    );
    await closePanels(page);
    current = await until(
      page,
      (town) => town.coffee.orders.some((order) => order.id === orderId && order.readyAt !== null),
      70,
    );
    ticket = current.coffee.orders.find((order) => order.id === orderId);
    assert.equal(ticket.buyer, "sub");
    assert.equal(ticket.holdId, original.holdId);
    assert.equal(ticket.saleId, original.saleId);
    assert.equal(ticket.brewMinutes, 20);
    assert.equal(ticket.placeMinutes, 10);
    assert.ok(contributionMinutes(ticket, "player") > 0);
    assert.ok(contributionMinutes(ticket, "northern") > 0);
    assert.equal(
      ticket.contributions.reduce((sum, part) => sum + part.end - part.start, 0),
      30,
    );
    assert.equal(
      current.coffee.cups.filter((cup) => cup.orderId === orderId && cup.owner === "sub").length,
      1,
    );
    assert.equal(current.economy.holds.find((hold) => hold.id === original.holdId).remaining, 0);
    for (const worker of ["player", "northern"]) {
      assert.equal(
        current.economy.holds.find((hold) => hold.id === agreement(current, worker).holdId)
          .remaining,
        5,
      );
      assert.ok(
        agreement(current, worker).eligibleMinutes > 0 &&
          agreement(current, worker).eligibleMinutes < 180,
      );
    }
    assert.equal(
      current.economy.transactions.filter((transaction) => transaction.agreementId === orderId)
        .length,
      1,
    );
    assert.equal(total(current), 90);
    assert.deepEqual(current.identityRegistry, identity);
    assert.deepEqual(auditEconomy(current), []);
    assert.deepEqual(validateCoffee(current), []);
    result.checks.push(
      "Partial brew keeps its original customer, payment hold and progress through ordinary Stop, manual override and funded successor consent",
      "Two live worker routines preserve assignment ownership; the same cup completes once with 20 brew and 10 placement minutes",
      "One customer payment releases once while both independent five-coin wage reservations remain intact",
    );
    result.order = {
      id: orderId,
      brewMinutes: ticket.brewMinutes,
      placeMinutes: ticket.placeMinutes,
      contributions: ticket.contributions,
      cup: current.coffee.cups.find((cup) => cup.orderId === orderId),
    };
    result.wages = ["player", "northern"].map((worker) => ({
      worker,
      minutes: agreement(current, worker).eligibleMinutes,
      hold: agreement(current, worker).holdId,
    }));
    await cafe(page);
    await page
      .locator("p")
      .filter({ hasText: /^\d+\/180 eligible minutes/ })
      .first()
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${viewport.name}-handover-complete.png`) });
    await closePanels(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download town", exact: true }).click(),
    ]);
    const downloadPath = join(out, `${viewport.name}-synthetic-handover.json`);
    await download.saveAs(downloadPath);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game));
    assert.equal(
      await page.getByRole("button", { name: "Pause café shift now", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await waitStored(page, (town) =>
      town.coffee.routines.every((item) => item.status !== "active"),
    );
    const restored = await stored(page);
    const expectedOrders = structuredClone(current.coffee.orders);
    for (const order of expectedOrders) {
      if (["queued", "brewing", "placing"].includes(order.phase) && order.assignedAgreementId) {
        order.assignedAgreementId = null;
        order.assignmentRevision++;
        order.revision++;
      }
    }
    assert.deepEqual(
      restored.coffee.orders,
      expectedOrders,
      "Reload clears unfinished leases without rewriting any cup progress or payment facts",
    );
    assert.deepEqual(restored.coffee.cups, current.coffee.cups);
    assert.deepEqual(restored.economy.holds, current.economy.holds);
    assert.deepEqual(restored.economy.transactions, current.economy.transactions);
    assert.deepEqual(auditEconomy(restored), []);
    assert.deepEqual(validateCoffee(restored), []);
    result.checks.push(
      "Reload revokes both service grants while preserving completed cup, contribution provenance and wage holds",
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.blockedProviderRequests, []);
    console.log(
      JSON.stringify({ viewport: viewport.name, checks: result.checks.length, ok: true }),
    );
    await context.close();
    active = undefined;
  }
} catch (error) {
  report.failures.push(String(error.stack || error));
  process.exitCode = 1;
  if (active) await active.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  console.error(report.failures[0]);
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  await source?.close();
}
