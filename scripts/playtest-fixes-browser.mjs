import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

// Disposable localhost towns and synthetic transport; never a player's save or provider.
const target = new URL(process.env.GAME_FIXES_QA_URL || "http://127.0.0.1:8126/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
target.searchParams.set("skin", "library-ink");
const out = resolve(process.env.GAME_FIXES_QA_OUT || "artifacts/playtest-fixes");
await mkdir(out, { recursive: true });
const report = { liveProviderCalls: 0, journeys: [], failures: [] };
const transport = `
export async function mindAvailability() { return { online: true, configured: true, actions: true }; }
const mock = globalThis.__playtestMind ??= { calls: [], pending: new Map(), resolve(id, result) { this.pending.get(id)?.(result); this.pending.delete(id); } };
export function thinkTown({data}) {
  if(data.kind !== 'act') return Promise.resolve({ok:false,error:'synthetic-offline'});
  const id=mock.calls.length; mock.calls.push({id,kind:data.kind});
  return new Promise(resolve=>mock.pending.set(id,resolve));
}`;
const browser = await chromium.launch({ headless: true });
let active;
const town = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const stamp = (value) => (value.day - 1) * 1440 + value.minute;
const words = "I would like to read the manuscript before offering a page.";
try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = { viewport, errors: [], networkLeaks: [] };
    report.journeys.push(result);
    const context = await browser.newContext({ viewport, hasTouch: viewport.name === "phone" });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== target.origin)
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      if (url.pathname.includes("_serverFn")) {
        result.networkLeaks.push(url.pathname);
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      return route.continue();
    });
    await context.route("**/src/lib/mind.functions.ts*", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: transport }),
    );
    const page = (active = await context.newPage());
    await page.clock.install();
    page.on("pageerror", (error) => result.errors.push(error.message));
    await page.goto(target.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__playtestMind));
    await page.evaluate(async (words) => {
      const { createTown } = await import("/src/game/town.ts");
      const { exportTown } = await import("/src/game/save.ts");
      const { initializePhysicalItems, applyPhysicalCommand } =
        await import("/src/game/physical-items.ts");
      const value = createTown("Playtest fixes");
      value.paused = true;
      value.guide = 3;
      value.sawHint = true;
      value.agents.find((agent) => agent.id === "player").tile = { x: 40, y: 21 };
      value.agents.find((agent) => agent.id === "arwyn").tile = { x: 40, y: 20 };
      initializePhysicalItems(value);
      applyPhysicalCommand(value, "arwyn", { kind: "speak", text: words });
      value.scrub = [
        {
          d: value.day,
          m: 0,
          ids: value.agents.map((agent) => agent.id),
          p: value.agents.flatMap((agent) => [agent.tile.x, agent.tile.y]),
        },
      ];
      localStorage.setItem("the-game-town-v2", exportTown(value));
      localStorage.setItem("the-game-local-dialogue-only", "false");
    }, words);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game && window.__playtestMind));
    const tools = page.getByRole("navigation", { name: "Your town tools", exact: true });
    const openInventory = () =>
      tools.getByRole("button", { name: "Inventory", exact: true }).click();
    const closeInventory = () =>
      page.getByRole("button", { name: "Close What you carry", exact: true }).click();
    await openInventory();
    await page
      .locator(".manuscript-tools summary")
      .filter({ hasText: "Inspect manuscript" })
      .click();
    await page.getByRole("button", { name: "Pick up manuscript", exact: true }).click();
    assert.equal(await page.getByText(/Eating or sharing uses one whole loaf/).count(), 0);
    const selector = page.getByRole("combobox", { name: "Invite a resident to try", exact: true });
    await selector.selectOption("arwyn");
    await closeInventory();
    await openInventory();
    assert.equal(await selector.inputValue(), "arwyn");
    result.recipientSurvivesPanelReopen = true;
    await page.getByRole("button", { name: "Watch Arwyn try", exact: true }).click();
    await page.waitForFunction(() => window.__playtestMind.calls.length === 1);
    const stop = page.getByRole("button", { name: "Stop manuscript trial", exact: true });
    await stop.waitFor();
    const stopBox = await stop.boundingBox();
    assert.ok(stopBox && stopBox.y >= 0 && stopBox.y + stopBox.height <= viewport.height);
    assert.equal(
      await page.getByRole("dialog", { name: "What you carry", exact: true }).count(),
      0,
    );
    await page.screenshot({ path: join(out, `${viewport.name}-visible-stop.png`) });
    await openInventory();
    assert.equal(await selector.inputValue(), "arwyn");
    assert.equal(await selector.isDisabled(), true);
    assert.equal(await page.getByText(/Invite Northern when/).count(), 0);
    await stop.click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const beforeLate = structuredClone((await town(page)).physicalItems.items);
    await page.evaluate(() => window.__playtestMind.resolve(0, { ok: true, text: "{}" }));
    await page.clock.runFor(100);
    assert.deepEqual((await town(page)).physicalItems.items, beforeLate);
    const status = await page.locator(".status-strip").innerText();
    assert.doesNotMatch(status, /trial stopped|resident is deciding|Residents are thinking/i);
    result.activeActorAndImmediateStop = true;
    result.lateReplyCannotChangeStoppedTrial = true;
    result.completedNoticeStaysInManuscriptPanel = true;
    await closeInventory();
    await page.getByRole("button", { name: /^Town life/ }).click();
    await page.getByRole("checkbox", { name: "Watch town conversations", exact: true }).check();
    await page.getByRole("button", { name: /^Arwyn spoke/ }).click();
    const conversation = page.getByRole("region", { name: "Town life conversations", exact: true });
    assert.equal(
      await conversation.getByRole("button", { name: "View Arwyn", exact: true }).count(),
      1,
    );
    assert.equal(
      await conversation.getByRole("button", { name: "Follow", exact: true }).count(),
      1,
    );
    assert.match(await conversation.innerText(), new RegExp(words));
    assert.doesNotMatch(await conversation.innerText(), /Arwyn ↔ Arwyn/);
    await page.screenshot({ path: join(out, `${viewport.name}-speech.png`) });
    result.singleSpeakerWithoutInventedListener = true;
    await page.getByRole("button", { name: "Close town life", exact: true }).click();
    const beforeReplay = await town(page);
    await page.getByRole("slider", { name: "Replay minute", exact: true }).focus();
    await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Back to now", exact: true }).waitFor();
    for (const name of ["Pause", "1×", "4×", "Hour"])
      assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true);
    await page.clock.runFor(1000);
    assert.equal(stamp(await town(page)), stamp(beforeReplay));
    await page.screenshot({ path: join(out, `${viewport.name}-replay.png`) });
    await page.getByRole("button", { name: "Back to now", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Hour", exact: true }).isEnabled(), true);
    result.replayCannotAdvanceLiveClock = true;
    const beforeHour = stamp(await town(page));
    await page.getByRole("button", { name: "Hour", exact: true }).click();
    const explanation = page.locator(".status-message").filter({ hasText: /^Advanced / });
    await explanation.waitFor();
    const minutes = stamp(await town(page)) - beforeHour;
    assert.ok(minutes > 0 && minutes <= 60);
    assert.match(await explanation.innerText(), new RegExp(`Advanced ${minutes} game minute`));
    if (minutes < 60) assert.match(await explanation.innerText(), /stopped because/);
    result.hourExplainsActualAdvance = { minutes, message: await explanation.innerText() };
    const inspect = tools.getByRole("button", { name: "Inspect manuscript", exact: true });
    const dimensions = await inspect.evaluate((button) => ({
      client: button.clientWidth,
      scroll: button.scrollWidth,
    }));
    assert.ok(dimensions.scroll <= dimensions.client + 1, JSON.stringify(dimensions));
    result.manuscriptLabelFits = dimensions;
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game));
    await openInventory();
    assert.equal(await selector.inputValue(), "arwyn");
    assert.equal((await town(page)).physicalItems.items[0].location.holder, "player");
    assert.equal((await town(page)).physicalItems.items[0].text, "");
    result.reloadRetainsActorAndItem = true;
    await page.screenshot({ path: join(out, `${viewport.name}-inventory.png`) });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.networkLeaks, []);
    await context.close();
    active = undefined;
    console.log(JSON.stringify(result));
  }
} catch (error) {
  report.failures.push(String(error.stack || error));
  if (active) await active.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  process.exitCode = 1;
  console.error(report.failures[0]);
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
