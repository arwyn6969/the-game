import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

// This development-only harness intercepts the mind transport module in fresh
// localhost browser contexts. Auth modules, product source and providers are
// untouched. Town fixtures use real game commands and the ordinary import UI.
const target = new URL(process.env.GAME_COFFEE_AI_QA_URL || "http://127.0.0.1:8094/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const out = resolve(process.env.GAME_COFFEE_AI_QA_OUT || "artifacts/coffee-ai-interruptions");
await mkdir(out, { recursive: true });
const report = {
  url: target.href,
  mockedTransport: true,
  authModulesChanged: false,
  liveInferenceCalls: 0,
  limitations: [
    "Synthetic development transport and emulated sizes; no live provider or physical-device acceptance",
  ],
  journeys: [],
  failures: [],
};
const transport = `
const mock=globalThis.__coffeeMindMock??={calls:[],pending:new Map(),resolve(id,result){const row=this.pending.get(id);if(row){this.pending.delete(id);row.resolve(result);}},reject(id){const row=this.pending.get(id);if(row){this.pending.delete(id);row.reject(new Error('Synthetic unavailable'));}}};
export async function mindAvailability(){return {online:true,configured:true,actions:true};}
export function thinkTown({data}){const id=mock.calls.length;mock.calls.push({id,kind:data.kind});return new Promise((resolve,reject)=>mock.pending.set(id,{resolve,reject}));}
`;
const syntheticSession = {
  session: {
    id: "coffee-session",
    token: "synthetic-local-session",
    userId: "coffee-user",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  user: {
    id: "coffee-user",
    name: "Synthetic café tester",
    email: "coffee@example.invalid",
    emailVerified: true,
    image: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const routine = (town) => town.coffee.routines.find((item) => item.worker === "player");
const agreement = (town) =>
  town.economy.work.agreements.find(
    (item) => item.worker === "player" && item.kind === "cafe-shift",
  );
const stamp = (town) => (town.day - 1) * 1440 + town.minute;
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const wageFacts = (town) => ({
  identity: town.identityRegistry,
  balances: town.agents.map(({ id, money }) => ({ id, money })),
  tills: town.tills,
  favors: town.favors,
  projectBalances: town.economy.projectBalances,
  transactions: town.economy.transactions,
  holds: town.economy.holds,
  payables: town.economy.work.payables,
  receipts: town.economy.work.receipts,
  agreement: { ...agreement(town), status: undefined },
});
const serviceAssets = (town) => ({ orders: town.coffee.orders, cups: town.coffee.cups });
const personalFacts = (town) =>
  town.agents.map(({ id, memories, projects, threads, relationships }) => ({
    id,
    memories,
    projects,
    threads,
    relationships,
  }));
const chatCount = (town, line) =>
  person(town, "kevin").memories.filter(
    (memory) => memory.type === "chat" && memory.with === "player" && memory.text.includes(line),
  ).length;
const reply = (text) => ({
  reply: text,
  delta: 0,
  note: "",
  favor: null,
  thread: null,
  notice: null,
  project: null,
});
let browser;
let source;
let activePage;
async function waitStored(page, predicate) {
  await page.waitForFunction((code) => {
    const raw = localStorage.getItem("the-game-town-v2");
    return raw && Function("town", `return (${code})(town)`)(JSON.parse(raw).town);
  }, predicate.toString());
}
async function importTown(page, raw) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-cafe-interruption.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
}
async function closePanels(page) {
  for (const name of ["Close conversation", "Close Hobbs café"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible()) await button.click();
  }
}
async function resumeService(page) {
  await closePanels(page);
  await page
    .getByRole("navigation", { name: "Your town tools", exact: true })
    .getByRole("button", { name: "Café", exact: true })
    .click();
  const resume = page.getByRole("button", { name: "Resume serving", exact: true });
  await resume.waitFor();
  assert.equal(await resume.isEnabled(), true);
  await resume.click();
  await waitStored(page, (town) =>
    town.coffee.routines.some((item) => item.worker === "player" && item.status === "active"),
  );
  await page.getByRole("button", { name: "Close Hobbs café", exact: true }).click();
}
async function sendHeld(page, text) {
  await page.getByRole("button", { name: "View Kevin's character card", exact: true }).click();
  await page.getByRole("tab", { name: "Together", exact: true }).click();
  await page.getByLabel("Your line to Kevin", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Say it", exact: true }).click();
  await page.waitForFunction(() =>
    window.__coffeeMindMock.calls.some((call) => call.kind === "player"),
  );
  await page.getByText("Waiting for your AI reply", { exact: true }).waitFor();
  const calls = await page.evaluate(() => window.__coffeeMindMock.calls);
  assert.equal(calls.length, 1, "Only the explicit player request may start");
  return calls[0].id;
}
async function resolveHeld(page, id, response) {
  await page.evaluate(({ id, response }) => window.__coffeeMindMock.resolve(id, response), {
    id,
    response,
  });
  await page.clock.runFor(100);
  await page.waitForFunction(() => window.__coffeeMindMock.pending.size === 0);
  await page
    .getByRole("button", { name: "Cancel AI request", exact: true })
    .waitFor({ state: "hidden" });
}
async function screenshot(page, result, name) {
  const file = join(out, `${result.viewport.name}-${result.scenario}-${name}.png`);
  await page.screenshot({ path: file });
  result.screenshots.push(file);
}
async function walkOutOfEarshot(page) {
  await closePanels(page);
  for (let step = 0; step < 8; step++) {
    const state = await stored(page);
    const player = person(state, "player").tile;
    const kevin = person(state, "kevin").tile;
    if (Math.abs(player.x - kevin.x) + Math.abs(player.y - kevin.y) > 2) return;
    const direction = await page.evaluate(
      ({ player, kevin, occupied }) => {
        const distance = (point) => Math.abs(point.x - kevin.x) + Math.abs(point.y - kevin.y);
        return [
          { key: "ArrowLeft", x: player.x - 1, y: player.y },
          { key: "ArrowRight", x: player.x + 1, y: player.y },
          { key: "ArrowUp", x: player.x, y: player.y - 1 },
          { key: "ArrowDown", x: player.x, y: player.y + 1 },
        ]
          .filter(
            (point) =>
              window.__game.tile(point.x, point.y)?.block === false &&
              !occupied.some((tile) => tile.x === point.x && tile.y === point.y),
          )
          .sort((a, b) => distance(b) - distance(a))[0];
      },
      {
        player,
        kevin,
        occupied: state.agents.filter((actor) => actor.id !== "player").map((actor) => actor.tile),
      },
    );
    assert.ok(direction, "An ordinary unoccupied tile is available for manual control");
    await page.locator("canvas.town-canvas").focus();
    await page.keyboard.down(direction.key);
    await page.clock.runFor(200);
    await page.keyboard.up(direction.key);
    await page.clock.runFor(100);
  }
  throw new Error("Manual movement did not leave Kevin's hearing range");
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
  const { playerActions, applyPlayerAction } = await source.ssrLoadModule("/src/game/effects.ts");
  const { makeCoffeeCommand, applyCoffeeAction } =
    await source.ssrLoadModule("/src/game/coffee.ts");
  const { startCoffeeRoutine, suspendPlayerCoffeeRoutine } = await source.ssrLoadModule(
    "/src/game/coffee-runtime.ts",
  );
  const { advanceTown } = await source.ssrLoadModule("/src/game/sim.ts");
  const { exportTown, readTownFile } = await source.ssrLoadModule("/src/game/save.ts");
  const { auditEconomy } = await source.ssrLoadModule("/src/game/economy.ts");
  const { validateCoffee } = await source.ssrLoadModule("/src/game/coffee-validation.ts");
  function fixture(name) {
    const town = createTown(name);
    town.minute = 960;
    town.paused = true;
    town.guide = 3;
    town.sawHint = true;
    person(town, "player").tile = { x: 8, y: 19 };
    person(town, "kevin").tile = { x: 9, y: 19 };
    for (const actor of town.agents) actor.callUsed = true;
    assert.equal(activateFundedTown(town).ok, true);
    const shift = playerActions(town, "kevin").find(
      (action) => JSON.parse(action.id)[0] === "shift-start",
    );
    assert.ok(shift && !shift.disabledReason);
    assert.equal(applyPlayerAction(town, "kevin", shift.id).ok, true);
    assert.equal(applyCoffeeAction(town, makeCoffeeCommand(town, "player", "enable")).ok, true);
    const id = agreement(town).id;
    assert.equal(
      startCoffeeRoutine(town, makeCoffeeCommand(town, "player", "start", { targetId: id }), id).ok,
      true,
    );
    advanceTown(town, 3);
    assert.equal(suspendPlayerCoffeeRoutine(town, "Synthetic saved partial shift").ok, true);
    assert.ok(agreement(town).eligibleMinutes > 0);
    person(town, "player").tile = { x: 8, y: 19 };
    person(town, "kevin").tile = { x: 9, y: 19 };
    for (const actor of town.agents) {
      actor.path = [];
      actor.callUsed = true;
    }
    town.paused = true;
    assert.deepEqual(auditEconomy(town), []);
    const raw = exportTown(town);
    assert.equal(readTownFile(raw).status, "ready");
    return raw;
  }
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    for (const scenario of ["stop-valid", "stop-unavailable", "restore-stale", "movement-stale"]) {
      const result = {
        viewport,
        scenario,
        errors: [],
        blockedProviderRequests: [],
        moduleReplacements: 0,
        checks: [],
        screenshots: [],
      };
      report.journeys.push(result);
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.name === "phone",
        acceptDownloads: true,
      });
      await context.route("**/*", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== target.origin)
          return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        if (url.pathname.endsWith("/api/auth/get-session"))
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(syntheticSession),
          });
        if (url.pathname.includes("_serverFn")) {
          result.blockedProviderRequests.push(url.pathname);
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"ok":false}',
          });
        }
        return route.continue();
      });
      await context.route("**/src/lib/mind.functions.ts*", (route) => {
        result.moduleReplacements++;
        return route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: transport,
        });
      });
      const page = (activePage = await context.newPage());
      await page.clock.install();
      page.on("pageerror", (error) => result.errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") result.errors.push(message.text());
      });
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      const name = `AI café ${viewport.name}`;
      await page.getByLabel("What do they call you?", { exact: true }).fill(name);
      await page.getByLabel("Use local dialogue only", { exact: true }).uncheck();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      await page.waitForFunction(() => Boolean(window.__game && window.__coffeeMindMock));
      assert.ok(
        result.moduleReplacements > 0,
        "This test needs the intercepted development transport",
      );
      const raw = fixture(name);
      await importTown(page, raw);
      await page.locator('[data-ai-status="ready"]').waitFor();
      await resumeService(page);
      const baseline = await stored(page);
      const line = `Synthetic ${scenario} question`;
      const responseLine = `Synthetic ${scenario} reply`;
      const id = await sendHeld(page, line);
      assert.equal(
        routine(await stored(page)).status,
        "active",
        "Dialogue must not itself stop the independent service routine",
      );
      await page.getByRole("button", { name: "4×", exact: true }).click();
      await page.clock.runFor(1000);
      let current = await stored(page);
      assert.equal(stamp(current), stamp(baseline));
      assert.deepEqual(wageFacts(current), wageFacts(baseline));
      result.checks.push(
        "Foreground AI wait freezes town minutes, service progress and accounts even with 4× selected",
      );
      if (scenario.startsWith("stop-")) {
        const stop = page.getByRole("button", { name: "Pause café shift now", exact: true });
        assert.equal(await stop.isEnabled(), true);
        await stop.scrollIntoViewIfNeeded();
        await stop.click();
        await waitStored(page, (town) =>
          town.coffee.routines.some((item) => item.worker === "player" && item.status === "paused"),
        );
        assert.equal(
          await page.evaluate(() => window.__coffeeMindMock.pending.has(0)),
          true,
          "Stop takes local effect without waiting for transport",
        );
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        const stopped = await stored(page);
        assert.equal(agreement(stopped).status, "suspended");
        assert.deepEqual(wageFacts(stopped), wageFacts(baseline));
        await screenshot(page, result, "pending-stop");
        await resolveHeld(
          page,
          id,
          scenario === "stop-valid"
            ? { ok: true, text: JSON.stringify(reply(responseLine)) }
            : { ok: false, error: "unreachable" },
        );
        if (scenario === "stop-valid")
          await waitStored(page, (town) =>
            town.agents
              .find((actor) => actor.id === "kevin")
              .memories.some((memory) => memory.text.includes("Synthetic stop-valid reply")),
          );
        current = await stored(page);
        assert.equal(chatCount(current, responseLine), scenario === "stop-valid" ? 1 : 0);
        assert.equal(routine(current).status, "paused");
        assert.deepEqual(wageFacts(current), wageFacts(stopped));
        assert.deepEqual(serviceAssets(current), serviceAssets(stopped));
        if (scenario === "stop-unavailable") {
          assert.deepEqual(personalFacts(current), personalFacts(stopped));
          assert.equal(
            await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
            line,
          );
        }
        assert.equal(stamp(current), stamp(stopped));
        await page.clock.runFor(1500);
        assert.equal(stamp(await stored(page)), stamp(stopped));
        result.checks.push(
          scenario === "stop-valid"
            ? "Unrelated valid late dialogue lands once, without reviving café service or changing wages"
            : "Unavailable late dialogue adds no chat, payment or renewed service",
        );
        await resumeService(page);
        assert.equal(
          agreement(await stored(page)).eligibleMinutes,
          agreement(stopped).eligibleMinutes,
        );
        await page.getByRole("button", { name: "1×", exact: true }).click();
        await page.clock.runFor(1500);
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await waitStored(page, (town) => town.paused);
        const progressed = await stored(page);
        const elapsed = stamp(progressed) - stamp(stopped);
        assert.ok(elapsed > 0 && elapsed <= 2);
        assert.equal(
          agreement(progressed).eligibleMinutes - agreement(stopped).eligibleMinutes,
          elapsed,
        );
        assert.equal(
          new Set(agreement(progressed).attendance).size,
          agreement(progressed).attendance.length,
        );
        assert.equal(
          progressed.economy.holds.find((hold) => hold.id === agreement(progressed).holdId)
            .remaining,
          5,
        );
        assert.deepEqual(progressed.economy.transactions, stopped.economy.transactions);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(window.__game && window.__coffeeMindMock));
        assert.equal(
          await page.getByRole("button", { name: "Pause café shift now", exact: true }).count(),
          0,
          "Reload must revoke the live routine's automatic service authority",
        );
        await page
          .getByRole("navigation", { name: "Your town tools", exact: true })
          .getByRole("button", { name: "Café", exact: true })
          .click();
        assert.equal(
          await page.getByRole("button", { name: "Resume serving", exact: true }).isEnabled(),
          true,
        );
        // Loading recovers the live town while preserving the original stored
        // bytes. Save the recovered state through an ordinary clock control.
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await waitStored(page, (town) =>
          town.coffee.routines.some((item) => item.worker === "player" && item.status === "paused"),
        );
        current = await stored(page);
        assert.equal(
          routine(current).status,
          "paused",
          "Reload revokes service authority until an explicit resume",
        );
        assert.equal(agreement(current).eligibleMinutes, agreement(progressed).eligibleMinutes);
        assert.deepEqual(current.economy.holds, progressed.economy.holds);
        assert.deepEqual(current.economy.transactions, progressed.economy.transactions);
        assert.deepEqual(serviceAssets(current), serviceAssets(progressed));
        assert.equal(await page.evaluate(() => window.__coffeeMindMock.calls.length), 0);
        result.checks.push(
          "Explicit resume advances each attendance minute once; reload retains progress/full hold and requires another resume",
        );
      } else {
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        if (scenario === "restore-stale") await importTown(page, raw);
        else await walkOutOfEarshot(page);
        const interrupted = await stored(page);
        assert.equal(routine(interrupted).status, "paused");
        assert.equal(agreement(interrupted).status, "suspended");
        assert.deepEqual(wageFacts(interrupted), wageFacts(baseline));
        await resolveHeld(page, id, { ok: true, text: JSON.stringify(reply(responseLine)) });
        await page.clock.runFor(1000);
        current = await stored(page);
        assert.equal(chatCount(current, responseLine), 0);
        assert.equal(routine(current).status, "paused");
        assert.equal(stamp(current), stamp(interrupted));
        assert.deepEqual(wageFacts(current), wageFacts(interrupted));
        assert.deepEqual(serviceAssets(current), serviceAssets(interrupted));
        assert.deepEqual(personalFacts(current), personalFacts(interrupted));
        result.checks.push(
          scenario === "restore-stale"
            ? "Restoring the checkpoint revokes service and rejects the previous town's late AI result while retaining earned minutes and funds"
            : "Manual movement immediately takes control and rejects an out-of-earshot late reply without restarting work",
        );
      }
      current = await stored(page);
      assert.deepEqual(auditEconomy(current), []);
      assert.deepEqual(validateCoffee(current), []);
      await screenshot(page, result, "final");
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
}
