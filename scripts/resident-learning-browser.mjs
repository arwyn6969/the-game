import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { residentLearningFixture } from "./fixtures/resident-learning.mjs";

// Disposable synthetic towns, real current helpers and built React components.
// All changes enter through ordinary import controls; runtime hooks are read-only.
const target = new URL(process.env.GAME_LEARNING_QA_URL || "http://127.0.0.1:8198/");
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
const out = resolve(process.env.GAME_LEARNING_QA_OUT || "artifacts/resident-learning-browser");
await mkdir(out, { recursive: true });
const report = {
  node: process.version,
  url: target.href,
  builtPreview: !process.env.GAME_LEARNING_QA_URL,
  journeys: [],
  failures: [],
};
const cacheDir = await mkdtemp(join(tmpdir(), "learning-browser-source-"));
let source, preview, browser, activePage;
let serverOutput = "";
try {
  source = await createServer({
    configFile: false,
    cacheDir,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  const { resident, state, testedIndex, reviewFailure, correct } =
    await residentLearningFixture(source);
  const { advanceLibraryProject } = await source.ssrLoadModule("/src/game/community.ts");
  const { publicLearningHistory } = await source.ssrLoadModule("/src/game/learning.ts");
  const { exportTown, parseTownFile } = await source.ssrLoadModule("/src/game/save.ts");
  const { createTown } = await source.ssrLoadModule("/src/game/town.ts");
  const { makeMemory, pushMemory } = await source.ssrLoadModule("/src/game/memory.ts");
  const { formatClock } = await source.ssrLoadModule("/src/game/text.ts");
  const fixtures = {};
  const town = testedIndex();
  reviewFailure(town, true);
  fixtures.failure = structuredClone(town);
  correct(town);
  fixtures.correction = structuredClone(town);
  town.minute++;
  advanceLibraryProject(town);
  fixtures.demonstration = structuredClone(town);
  fixtures.empty = createTown("Learning visitor");
  fixtures.partial = structuredClone(town);
  fixtures.absent = structuredClone(town);
  fixtures.laterOnly = structuredClone(town);
  for (const [name, keep] of [
    ["partial", (event) => !event.id.includes("method-reuse")],
    ["absent", () => false],
    ["laterOnly", (event) => event.id.includes("method-reuse")],
  ]) {
    const fixture = fixtures[name];
    for (const event of state(fixture).events.filter((event) => !keep(event))) {
      event.participants = event.participants.filter((id) => id !== "player");
      event.witnesses = event.witnesses.filter((id) => id !== "player");
    }
    resident(fixture, "player").memories = resident(fixture, "player").memories.filter(
      (memory) =>
        !state(fixture).events.some((event) => !keep(event) && event.text === memory.text),
    );
  }
  for (const fixture of Object.values(fixtures)) {
    fixture.paused = true;
    fixture.sawHint = true;
    for (const agent of fixture.agents) agent.path = [];
    // Keep a walkable nearby conversation available after the history check.
    resident(fixture, "player").tile = { x: 42, y: 20 };
    resident(fixture, "arwyn").tile = { x: 43, y: 20 };
    resident(fixture, "arwyn").identity = "PRIVATE_IDENTITY_SENTINEL";
    resident(fixture, "arwyn").want = "PRIVATE_WANT_SENTINEL";
    resident(fixture, "arwyn").selfSentence = "PRIVATE_SELF_SENTINEL";
    resident(fixture, "arwyn").relationships.player = {
      score: 0,
      note: "PRIVATE_RELATION_SENTINEL",
    };
    pushMemory(resident(fixture, "arwyn"), {
      ...makeMemory(
        fixture,
        fixture.day,
        fixture.minute,
        "reflect",
        "PRIVATE_REASON_SENTINEL evidence:internal-reference-sentinel",
        7,
      ),
      id: "plan-self-private-reference-sentinel",
    });
    assert.ok(
      parseTownFile(exportTown(fixture)),
      "Every browser fixture must pass actual save validation",
    );
  }
  if (!process.env.GAME_LEARNING_QA_URL) {
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
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          VITE_AUTH_ENABLED: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    for (const stream of [preview.stdout, preview.stderr])
      stream.on("data", (data) => {
        serverOutput = (serverOutput + data.toString()).slice(-6000);
      });
    let started = false;
    for (let i = 0; i < 120; i++) {
      if (preview.exitCode !== null) throw new Error(`Built preview exited: ${serverOutput}`);
      try {
        if ((await fetch(target.href, { signal: AbortSignal.timeout(1000) })).ok) {
          started = true;
          break;
        }
      } catch {
        /* Local preview warming. */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(started, `Built preview did not start: ${serverOutput}`);
  }
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = { viewport, errors: [], providerRequests: [], stages: [], screenshots: [] };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== target.origin)
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      if (request.method() === "POST" && url.pathname.includes("_serverFn")) {
        result.providerRequests.push(url.pathname);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"ok":false}',
        });
      }
      return route.continue();
    });
    const page = (activePage = await context.newPage());
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push(message.text());
    });
    const saved = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
    const learning = page.locator(".character-learning");
    const summary = learning.locator("summary");
    const close = () =>
      page.getByRole("button", { name: "Close conversation", exact: true }).click();
    async function screenshot(name) {
      const file = `${viewport.name}-${name}.png`;
      await page.screenshot({ path: join(out, file) });
      result.screenshots.push(file);
    }
    async function importTown(raw) {
      await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
        name: "synthetic-learning.json",
        mimeType: "application/json",
        buffer: Buffer.from(raw),
      });
      await page.getByRole("button", { name: "Replace", exact: true }).click();
      await page
        .getByRole("heading", { name: "Replace the live town?", exact: true })
        .waitFor({ state: "hidden" });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    }
    async function openCard(id = "arwyn") {
      const name = id === "arwyn" ? "Arwyn" : "Data";
      await page
        .getByRole("button", { name: `View ${name}'s character card`, exact: true })
        .click();
      await summary.waitFor();
      await summary.focus();
      assert.equal(await summary.evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press("Enter");
      assert.equal(await learning.evaluate((element) => element.open), true);
    }
    async function assertHistory(fixture, id = "arwyn") {
      const expected = publicLearningHistory(fixture, id);
      assert.deepEqual(
        await learning.locator("li > p:last-child").allTextContents(),
        expected.map(({ summary }) => summary),
        "Built React rows match the current real helper",
      );
      assert.deepEqual(
        await learning.locator("small").allTextContents(),
        expected.map((entry) => `Day ${entry.day} · ${formatClock(entry.minute)}`),
      );
      if (!expected.length)
        assert.match(await learning.innerText(), /No shared learning evidence yet/);
      assert.doesNotMatch(
        await page.locator("body").textContent(),
        /PRIVATE_\w+_SENTINEL|plan-self-|internal-reference-sentinel|library:method-reuse|library:correction|library:tomorrow/,
      );
      assert.doesNotMatch(
        await page.locator("body").ariaSnapshot(),
        /PRIVATE_\w+_SENTINEL|plan-self-|internal-reference-sentinel|library:method-reuse|library:correction|library:tomorrow/,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      return expected;
    }
    await page.goto(target.href, { waitUntil: "domcontentloaded" });
    await page
      .getByLabel("What do they call you?", { exact: true })
      .fill(`Learning ${viewport.name}`);
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    for (const name of [
      "empty",
      "failure",
      "correction",
      "demonstration",
      "partial",
      "absent",
      "laterOnly",
    ]) {
      await importTown(exportTown(fixtures[name]));
      const before = await saved();
      await openCard();
      const expected = await assertHistory(fixtures[name]);
      assert.deepEqual(
        await saved(),
        before,
        "Opening and reading the profile must not mutate the town",
      );
      result.stages.push({
        fixture: name,
        rows: expected.length,
        stage: expected.at(-1)?.stage ?? "empty",
      });
      await summary.evaluate((element) => element.scrollIntoView({ block: "start" }));
      await screenshot(name);
      if (name === "demonstration") {
        await learning.locator("li").last().scrollIntoViewIfNeeded();
        await screenshot("demonstration-result");
      }
      if (name === "absent") {
        await page.getByRole("button", { name: "Watch character", exact: true }).click();
        await page
          .getByRole("button", { name: "Watching Arwyn · Return to me", exact: true })
          .click();
        await openCard();
        await page.getByText("Latest recorded reflections", { exact: true }).waitFor();
        await assertHistory(fixtures.absent);
        assert.deepEqual(await saved(), before, "Watch must not teach the player hidden evidence");
        result.watchPrivacy = true;
      }
      await close();
    }
    await importTown(exportTown(fixtures.demonstration));
    await openCard("data");
    await assertHistory(fixtures.demonstration, "data");
    assert.match(await learning.innerText(), /Observed a test/);
    assert.doesNotMatch(await learning.innerText(), /Demonstrated once/);
    await screenshot("observed");
    await close();
    await openCard();
    if (viewport.name === "phone") {
      const body = page.locator(".mind-body");
      await summary.evaluate((element) => element.scrollIntoView({ block: "start" }));
      const beforeScroll = await body.evaluate((element) => element.scrollTop);
      const bounds = await body.boundingBox();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 20, id: 1 }],
      });
      for (let i = 1; i <= 5; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 20 - i * 40, id: 1 },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
      result.touchHistoryScroll =
        (await body.evaluate((element) => element.scrollTop)) > beforeScroll;
      assert.equal(result.touchHistoryScroll, true, "A real touch swipe must scroll the history");
      await learning.getByText(/one successful lookup/).scrollIntoViewIfNeeded();
      await screenshot("history-scrolled");
    }
    const slider = page.getByRole("slider", { name: "Replay minute", exact: true });
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await page.getByRole("button", { name: "Back to now", exact: true }).waitFor();
    assert.equal(await learning.count(), 0, "Replay hides current learning evidence");
    await screenshot("replay");
    await page.getByRole("button", { name: "Back to now", exact: true }).click();
    // Returning to now closes the replay profile; reopen through the resident strip.
    await openCard();
    await assertHistory(fixtures.demonstration);
    result.replayPrivacy = true;
    await page.getByRole("button", { name: "Talk with Arwyn", exact: true }).click();
    await page.getByLabel("Your line to Arwyn", { exact: true }).fill("Who are you?");
    await page.getByRole("button", { name: "Say it", exact: true }).click();
    await page.waitForFunction(() =>
      /They answered with local dialogue/.test(
        document.querySelector(".mind-send-note")?.textContent || "",
      ),
    );
    result.offlineConversation = true;
    await close();
    await page.getByRole("button", { name: "Town controls", exact: true }).click();
    await page.waitForFunction(
      () => document.activeElement === document.querySelector("canvas.town-canvas"),
    );
    const beforeMove = await page.evaluate(() => ({
      x: window.__controlsTest.getX(),
      y: window.__controlsTest.getY(),
    }));
    const direction = await page.evaluate(({ x, y }) => {
      const people = JSON.parse(localStorage.getItem("the-game-town-v2")).town.agents;
      return [
        { key: "ArrowLeft", label: "West", x: x - 1, y },
        { key: "ArrowDown", label: "South", x, y: y + 1 },
        { key: "ArrowUp", label: "North", x, y: y - 1 },
        { key: "ArrowRight", label: "East", x: x + 1, y },
      ].find(
        (point) =>
          window.__game.tile(point.x, point.y)?.block === false &&
          !people.some(
            (person) =>
              person.id !== "player" && person.tile.x === point.x && person.tile.y === point.y,
          ),
      );
    }, beforeMove);
    assert.ok(direction, "The synthetic player needs a free adjacent tile");
    if (viewport.name === "phone") {
      const control = page.getByRole("button", { name: direction.label, exact: true });
      const bounds = await control.boundingBox();
      assert.ok(bounds, "The touch movement pad must be visible");
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 }],
      });
      await page.waitForTimeout(100);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else await page.keyboard.press(direction.key);
    await page.waitForFunction(
      ({ x, y }) => window.__controlsTest.getX() !== x || window.__controlsTest.getY() !== y,
      beforeMove,
    );
    result.movement = {
      input: viewport.name === "phone" ? "touch" : "keyboard",
      before: beforeMove,
      after: await page.evaluate(() => ({
        x: window.__controlsTest.getX(),
        y: window.__controlsTest.getY(),
      })),
    };
    await page.getByRole("button", { name: "1×", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("the-game-town-v2")).town.paused === true,
    );
    assert.equal((await saved()).paused, true);
    result.pause = true;
    const beforeExport = await saved();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download town", exact: true }).click(),
    ]);
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const portable = Buffer.concat(chunks).toString();
    const expectedHistory = publicLearningHistory(beforeExport, "arwyn");
    await importTown(portable);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
    const loaded = await saved();
    assert.deepEqual(publicLearningHistory(loaded, "arwyn"), expectedHistory);
    assert.deepEqual(
      loaded.economy,
      beforeExport.economy,
      "Import/reload must preserve original financial and trial records",
    );
    assert.deepEqual(
      loaded.agents.map(({ money }) => money),
      beforeExport.agents.map(({ money }) => money),
    );
    assert.equal(
      state(loaded).events.filter((event) => event.id.includes("method-reuse")).length,
      1,
    );
    await openCard();
    await assertHistory(loaded);
    await screenshot("reloaded");
    result.portableRoundTrip = result.reload = true;
    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      result.providerRequests,
      [],
      "No inference request, including synthetic fallback",
    );
    await context.close();
  }
} catch (error) {
  report.failures.push(error.stack || String(error));
  if (activePage) {
    await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => {});
    await writeFile(
      join(out, "failure-body.txt"),
      await activePage
        .locator("body")
        .innerText()
        .catch(() => "Unavailable"),
    );
  }
  process.exitCode = 1;
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  preview?.kill("SIGTERM");
  await source?.close();
  await rm(cacheDir, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
