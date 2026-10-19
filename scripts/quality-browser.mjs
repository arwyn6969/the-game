import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

// This gate only creates isolated synthetic contexts against a local built
// preview. It never attaches to a personal browser, account or hosted game.
const target = new URL(process.env.GAME_QA_URL || "http://127.0.0.1:8197/");
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
const out = resolve(process.env.GAME_QA_OUT || "artifacts/quality-browser");
await mkdir(out, { recursive: true });
const report = {
  url: target.href,
  node: process.version,
  builtPreview: !process.env.GAME_QA_URL,
  journeys: [],
  failures: [],
};
let preview;
let browser;
let serverOutput = "";
const town = (page) =>
  page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("the-game-town-v2") || localStorage.getItem("the-game-town-v1"),
      ).town,
  );
const position = (page) =>
  page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));
async function ready(page) {
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
}
async function changePosition(page, touch = false) {
  const before = await position(page);
  const directions = await page.evaluate(
    ({ x, y }) =>
      [
        { key: "ArrowRight", label: "East", x: x + 1, y },
        { key: "ArrowLeft", label: "West", x: x - 1, y },
        { key: "ArrowDown", label: "South", x, y: y + 1 },
        { key: "ArrowUp", label: "North", x, y: y - 1 },
      ].filter((item) => window.__game.tile(item.x, item.y)?.block === false),
    before,
  );
  for (const direction of directions) {
    await page.evaluate(() => document.activeElement?.blur());
    if (touch) {
      const control = page.getByRole("button", { name: direction.label, exact: true });
      const box = await control.boundingBox();
      assert.ok(box, "Touch movement control must be visible");
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
      });
      await page.waitForTimeout(100);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else {
      await page.keyboard.down(direction.key);
      await page.waitForTimeout(100);
      await page.keyboard.up(direction.key);
    }
    const after = await position(page);
    if (after.x !== before.x || after.y !== before.y)
      return { before, after, input: touch ? "touch" : "keyboard" };
  }
  throw new Error("Player did not move on any adjacent walkable tile");
}
async function importFile(page, text, name, { fork = false, screenshot } = {}) {
  await page
    .getByLabel("Import a town file", { exact: true })
    .setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  if (fork) await page.getByRole("radio", { name: /Create a separate town/ }).check();
  if (screenshot) await page.screenshot({ path: screenshot });
  await page
    .getByRole("button", { name: fork ? "Create separate town" : "Replace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
}
try {
  if (!process.env.GAME_QA_URL) {
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
        serverOutput = (serverOutput + data.toString()).slice(-6_000);
      });
    let started = false;
    for (let index = 0; index < 120; index++) {
      if (preview.exitCode !== null) throw new Error(`Built preview exited: ${serverOutput}`);
      try {
        const response = await fetch(target.href, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          started = true;
          break;
        }
      } catch {
        /* Server warming. */
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
    const result = { viewport, errors: [] };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
    });
    await context.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin === target.origin) return route.continue();
      // External fonts have no bearing on rules and are never fetched by CI.
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page
      .getByLabel("What do they call you?", { exact: true })
      .fill(`Quality ${viewport.name}`);
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(
      () =>
        !!window.__game && !!window.__controlsTest && !!localStorage.getItem("the-game-town-v2"),
    );
    result.movement = await changePosition(page, viewport.name === "phone");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("the-game-town-v2")).town.paused === true,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "No horizontal overflow",
    );
    const tools = page.getByRole("navigation", { name: "Your town tools", exact: true });
    for (const [button, title] of [
      ["Journal", "Your journal"],
      ["Inventory", "What you carry"],
      ["Help & privacy", "Help & privacy"],
    ]) {
      await tools.getByRole("button", { name: button, exact: true }).click();
      await page.getByRole("dialog", { name: title, exact: true }).waitFor();
      if (title === "Help & privacy")
        assert.equal(
          await page.getByLabel("Use local dialogue only", { exact: true }).isChecked(),
          true,
        );
      await page.getByRole("button", { name: `Close ${title}`, exact: true }).click();
    }
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download town", exact: true }).click();
    const download = await downloadEvent;
    const path = join(out, `${viewport.name}-synthetic.json`);
    await download.saveAs(path);
    const exported = await readFile(path, "utf8");
    const fixture = JSON.parse(exported).town;
    const kevin = fixture.agents.find((agent) => agent.id === "kevin");
    fixture.agents.find((agent) => agent.id === "player").tile = await page.evaluate(
      ({ x, y }) =>
        [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 },
        ].find((point) => window.__game.tile(point.x, point.y)?.block === false),
      kevin.tile,
    );
    await importFile(page, JSON.stringify({ version: 2, town: fixture }), "near-kevin.json");
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Enter");
    await page.getByLabel("Your line to Kevin", { exact: true }).fill("Who are you?");
    await page.getByRole("button", { name: "Say it", exact: true }).click();
    await page.waitForFunction(() =>
      /They answered with local dialogue/.test(
        document.querySelector(".mind-send-note")?.textContent || "",
      ),
    );
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await tools.getByRole("button", { name: "Help & privacy", exact: true }).click();
    await page.getByRole("button", { name: "Close Help & privacy", exact: true }).click();
    result.offlineConversation = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
    assert.equal((await town(page)).playerName, fixture.playerName);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("the-game-local-dialogue-only")),
      "true",
    );
    result.reload = true;
    const tab = await context.newPage();
    await ready(tab);
    await page.bringToFront();
    const changed = await changePosition(page);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(({ x, y }) => {
      const player = JSON.parse(localStorage.getItem("the-game-town-v2")).town.agents.find(
        (agent) => agent.id === "player",
      );
      return player.tile.x === x && player.tile.y === y;
    }, changed.after);
    const latest = await page.evaluate(() => localStorage.getItem("the-game-town-v2"));
    await tab.bringToFront();
    await tab.getByRole("button", { name: "1×", exact: true }).click();
    await tab.getByRole("button", { name: "Load saved town", exact: true }).waitFor();
    assert.ok(
      await tab.evaluate(
        (expected) => localStorage.getItem("the-game-town-v2") === expected,
        latest,
      ),
      "A stale tab must leave the current save byte-identical",
    );
    assert.ok(
      await tab.evaluate(() =>
        Object.keys(localStorage).some((key) =>
          key.startsWith("the-game-town-backup-v1:conflict:"),
        ),
      ),
    );
    await tab.getByRole("button", { name: "Load saved town", exact: true }).click();
    result.competingTabs = true;
    await tab.close();
    await page.bringToFront();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__game);
    const legacy = await readFile(
      new URL("./fixtures/legacy-six-resident-town.json", import.meta.url),
      "utf8",
    );
    await importFile(page, legacy, "legacy-six-resident-town.json");
    const migrated = await town(page);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.agents.length, 8);
    assert.ok(migrated.economy);
    result.v1Migration = true;
    const identities = migrated.identityRegistry;
    assert.ok(identities, "Old towns gain permanent identities");
    await importFile(page, legacy, "restore-the-same-legacy-town.json");
    assert.deepEqual((await town(page)).identityRegistry, identities);
    const sourceRaw = await page.evaluate(() => localStorage.getItem("the-game-town-v2"));
    const sourceTown = JSON.parse(sourceRaw).town;
    await importFile(page, sourceRaw, "separate-town.json", {
      fork: true,
      screenshot: join(out, `${viewport.name}-identity-import.png`),
    });
    const forked = await town(page);
    assert.notEqual(forked.identityRegistry.worldId, identities.worldId);
    assert.equal(forked.identityRegistry.parentWorldId, identities.worldId);
    assert.equal(forked.identityRegistry.rootWorldId, identities.rootWorldId);
    for (const [role, character] of Object.entries(identities.characters)) {
      const copied = forked.identityRegistry.characters[role];
      assert.notEqual(copied.characterId, character.characterId);
      assert.equal(copied.forkedFromCharacterId, character.characterId);
      assert.equal(copied.originWorldId, character.originWorldId);
    }
    assert.deepEqual(forked.favors, sourceTown.favors, "Fork preserves the copied local debts");
    assert.deepEqual(forked.economy, sourceTown.economy, "Fork preserves the copied game ledger");
    assert.ok(
      await page.evaluate(
        (raw) =>
          Object.keys(localStorage).some(
            (key) =>
              key.startsWith("the-game-town-backup-v1:") && localStorage.getItem(key) === raw,
          ),
        sourceRaw,
      ),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
    assert.deepEqual((await town(page)).identityRegistry, forked.identityRegistry);
    const currentRaw = await page.evaluate(() => localStorage.getItem("the-game-town-v2"));
    const damaged = JSON.parse(currentRaw);
    damaged.town.identityRegistry.characters.kevin.characterId =
      damaged.town.identityRegistry.characters.baba.characterId;
    await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
      name: "damaged-identities.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(damaged)),
    });
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    await page.getByText(/The saved permanent identities are invalid/).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("the-game-town-v2")), currentRaw);
    await page.getByRole("button", { name: "Keep this town", exact: true }).click();
    result.identities = {
      stableLegacyRestore: true,
      explicitFork: true,
      forkReload: true,
      corruptImportRejected: true,
    };
    assert.deepEqual(
      result.errors,
      [],
      "Browser errors must not be hidden by passing interaction assertions",
    );
    await page.screenshot({ path: join(out, `${viewport.name}.png`) });
    await context.close();
  }
  const { runLibraryChecks } = await import("./library-browser.mjs");
  report.library = await runLibraryChecks(browser, target.href, join(out, "library"));
  const { runReadingEveningChecks } = await import("./reading-evening-browser.mjs");
  report.readings = await runReadingEveningChecks(browser, target.href, join(out, "readings"));
  const { runUiEdgeChecks } = await import("./quality-ui-edges.mjs");
  report.uiEdges = await runUiEdgeChecks(browser, target.href, join(out, "ui-edges"));
  const { runUiInterruptionChecks } = await import("./quality-ui-interruptions.mjs");
  report.uiInterruptions = await runUiInterruptionChecks(
    browser,
    target.href,
    join(out, "ui-interruptions"),
  );
  console.log(
    JSON.stringify(
      { ok: true, journeys: report.journeys, report: join(out, "results.json") },
      null,
      2,
    ),
  );
} catch (error) {
  report.failures.push((error instanceof Error ? error.message : String(error)).slice(0, 2000));
  console.error(
    JSON.stringify(
      { ok: false, failures: report.failures, report: join(out, "results.json") },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  preview?.kill("SIGTERM");
}
