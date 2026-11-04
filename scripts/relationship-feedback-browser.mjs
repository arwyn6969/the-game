import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

// Source-created synthetic towns enter through the ordinary import controls.
// Every browser context is disposable; no personal town or provider is used.
const target = new URL(process.env.GAME_RELATIONSHIP_QA_URL || "http://127.0.0.1:8199/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
target.searchParams.set("skin", "library-ink");
const out = resolve(process.env.GAME_RELATIONSHIP_QA_OUT || "artifacts/relationship-feedback");
await mkdir(out, { recursive: true });
const report = {
  target: target.href,
  node: process.version,
  builtPreview: !process.env.GAME_RELATIONSHIP_QA_URL,
  liveInferenceCalls: 0,
  journeys: [],
  failures: [],
};
const person = (town, id) => town.agents.find((actor) => actor.id === id);
const library = (town) => town.economy.projects.library;
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const protectedState = (town) => ({
  identities: town.identityRegistry,
  people: town.agents.map(({ id, money, relationships, projects, memories }) => ({
    id,
    money,
    relationships,
    projects,
    memories,
  })),
  economy: town.economy,
  tills: town.tills,
  favors: town.favors,
});
const activationState = (town) => {
  const state = structuredClone(protectedState(town));
  // Enabling is a valid recorded command, but cannot change financial facts.
  delete state.economy.commandReceipts;
  delete state.economy.revision;
  return state;
};
let source;
let preview;
let browser;
let activePage;
let serverOutput = "";
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
async function closeCard(page) {
  const button = page.getByRole("button", { name: "Close conversation", exact: true });
  if (await button.isVisible()) await button.click();
}
async function card(page, name, tab = "Together") {
  await closeCard(page);
  await page
    .getByRole("button", {
      name: name.startsWith("Relations ")
        ? `View ${name}'s journal`
        : `View ${name}'s character card`,
      exact: true,
    })
    .click();
  await page.getByRole("tab", { name: tab, exact: true }).click();
  return page.locator(".mind");
}
async function downloadTown(page, name) {
  await closeCard(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download town", exact: true }).click(),
  ]);
  const file = join(out, name);
  await download.saveAs(file);
  return readFile(file, "utf8");
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
  const community = await source.ssrLoadModule("/src/game/community.ts");
  const { advanceTown } = await source.ssrLoadModule("/src/game/sim.ts");
  const { exportTown, readTownFile } = await source.ssrLoadModule("/src/game/save.ts");
  const { ANCHORS } = await source.ssrLoadModule("/src/game/world.ts");
  const { activateFundedTown } = await source.ssrLoadModule("/src/game/payroll-runtime.ts");
  const { auditEconomy } = await source.ssrLoadModule("/src/game/economy.ts");
  const act = (town, kind, argument) => {
    const action = community.libraryActions(town).find((item) => {
      const [actualKind, actualArgument] = JSON.parse(item.id);
      return actualKind === kind && (argument === undefined || actualArgument === argument);
    });
    assert.ok(
      action && !action.disabledReason,
      `Expected available ${kind}:${argument || ""}: ${action?.disabledReason || "missing action"}`,
    );
    const result = community.applyLibraryAction(town, action.id);
    assert.equal(result.ok, true, result.reply);
    assert.deepEqual(community.validateLibraryState(town), []);
  };
  function fixture(name, attended) {
    const town = createTown(name);
    act(town, "accept", "reference");
    person(town, "player").tile = { ...ANCHORS.library };
    for (const key of [
      "card:kevin",
      "box:Birch",
      "box:Alder",
      "box:Cedar",
      "card:equipment",
      "card:dorm",
    ])
      act(town, "inspect", key);
    act(town, "report", "reference");
    act(town, "request", "source");
    act(town, "submit", "player");
    act(town, "test", "");
    for (let minute = 0; minute < 120 && library(town).lookup.status === "routing"; minute++)
      advanceTown(town, 1);
    assert.equal(library(town).lookup.result, "success");
    act(town, "evening-plan", "library");
    if (library(town).evening.status === "waiting") act(town, "evening-wait-note");
    person(town, "player").tile = {
      ...(attended ? community.libraryView(town).story.gathering.tile : ANCHORS.park),
    };
    for (let minute = 0; minute < 180 && library(town).evening.status !== "ready"; minute++)
      advanceTown(town, 1);
    assert.equal(library(town).evening.status, "ready");
    if (attended) act(town, "evening-join", "listen");
    else advanceTown(town, 61);
    assert.equal(library(town).evening.status, "done");
    assert.equal(library(town).evening.attendedByPlayer, attended);
    assert.equal(person(town, "arwyn").relationships.player.score, 0);
    assert.equal(
      person(town, "arwyn").memories.some(
        (memory) => memory.type === "chat" && memory.with === "player",
      ),
      false,
    );
    assert.equal(activateFundedTown(town).ok, true);
    town.paused = true;
    town.guide = 3;
    town.sawHint = true;
    town.minute = 959;
    person(town, "player").tile = { x: 8, y: 19 };
    person(town, "kevin").tile = { x: 9, y: 19 };
    for (const actor of town.agents) actor.path = [];
    // A private resident conversation must never appear as a shared activity.
    (town.social ??= []).push({
      id: `private-relationship-canary-${town.nextId++}`,
      kind: "conversation",
      day: town.day,
      minute: town.minute,
      participants: ["arwyn", "sub"],
      place: "Library",
      turns: [{ speaker: "arwyn", text: "Private relationship canary." }],
      text: "Private relationship canary.",
      changes: [],
      memories: [],
      witnessed: false,
      secret: true,
    });
    assert.deepEqual(auditEconomy(town), []);
    const raw = exportTown(town);
    assert.equal(readTownFile(raw).status, "ready");
    return raw;
  }
  if (!process.env.GAME_RELATIONSHIP_QA_URL) {
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
        serverOutput = (serverOutput + data.toString()).slice(-6000);
      });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${serverOutput}`);
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
    assert.ok(ready, `Preview not ready: ${serverOutput}`);
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
      const request = route.request();
      const url = new URL(request.url());
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
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    const playerName = `Relations ${viewport.name}`;
    await page.getByLabel("What do they call you?", { exact: true }).fill(playerName);
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(() =>
      Boolean(window.__game && localStorage.getItem("the-game-town-v2")),
    );
    await importTown(page, fixture(playerName, false), "synthetic-absent-reading.json");
    let panel = await card(page, "Arwyn", "Overview");
    assert.match(await panel.innerText(), /No shared history yet/);
    await page.getByRole("tab", { name: "Together", exact: true }).click();
    assert.equal(
      await panel
        .getByRole("region", { name: "Shared activities with Arwyn", exact: true })
        .count(),
      0,
    );
    assert.doesNotMatch(await panel.innerText(), /Private relationship canary/);
    result.checks.push(
      "A public account of an unattended reading and private dialogue create no shared history",
    );
    await closeCard(page);
    await importTown(page, fixture(playerName, true), "synthetic-attended-reading.json");
    const beforeCards = protectedState(await stored(page));
    for (const name of ["Arwyn", "Sub"]) {
      panel = await card(page, name, "Overview");
      assert.equal(await panel.getByText("Neutral", { exact: true }).count(), 1);
      assert.doesNotMatch(await panel.innerText(), /No shared history yet/);
      await page.getByRole("tab", { name: "Together", exact: true }).click();
      const activities = panel.getByRole("region", {
        name: `Shared activities with ${name}`,
        exact: true,
      });
      await activities.waitFor();
      assert.match(await activities.innerText(), /Northern's first reading/);
      assert.match(await activities.innerText(), /joined Northern's first reading in the library/);
      assert.doesNotMatch(await panel.innerText(), /Private relationship canary/);
      await activities.locator("li").first().scrollIntoViewIfNeeded();
      const screenshot = join(out, `${viewport.name}-${name.toLowerCase()}-shared-history.png`);
      await page.screenshot({ path: screenshot });
      result.screenshots.push(screenshot);
    }
    assert.deepEqual(
      protectedState(await stored(page)),
      beforeCards,
      "Viewing history cannot create chats, money, obligations or rapport",
    );
    result.checks.push(
      "Witnessed reading appears for Arwyn and Sub without direct chats or rapport gains",
    );
    await card(page, "Kevin", "Overview");
    await page.getByRole("button", { name: "Review choices with Kevin", exact: true }).click();
    await page.getByRole("button", { name: "Accept cafe shift · 5", exact: true }).click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem("the-game-town-v2")).town.economy.work.agreements.some(
        (agreement) => agreement.worker === "player" && agreement.status === "active",
      ),
    );
    const beforeEnable = await stored(page);
    const shifts = person(beforeEnable, "player").projects.filter(
      (project) => project.status === "open" && project.kind === "shift",
    );
    assert.equal(shifts.length, 1);
    const shiftText = shifts[0].text;
    for (const name of ["Arwyn", "Sub"]) {
      panel = await card(page, name);
      assert.doesNotMatch(
        await panel.innerText(),
        new RegExp(shiftText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
    panel = await card(page, "Kevin");
    assert.ok((await panel.innerText()).includes(shiftText));
    panel = await card(page, playerName);
    assert.ok((await panel.innerText()).includes(shiftText));
    result.checks.push(
      "Kevin's accepted shift stays on Kevin's card and the player journal, outside Arwyn/Sub cards",
    );
    await closeCard(page);
    await page
      .getByRole("navigation", { name: "Your town tools", exact: true })
      .getByRole("button", { name: "Café", exact: true })
      .click();
    await page.getByRole("button", { name: "Start café trial", exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("the-game-town-v2")).town.coffee?.enabled,
    );
    const cafe = page.getByRole("dialog", { name: "Hobbs café", exact: true });
    assert.doesNotMatch(await cafe.innerText(), /have not bought coffee or accepted a shift/);
    assert.match(await cafe.innerText(), /Café trial started/);
    const afterEnable = await stored(page);
    assert.deepEqual(
      activationState(afterEnable),
      activationState(beforeEnable),
      "Activation retains the accepted shift, wage reservation and all balances",
    );
    assert.deepEqual(
      afterEnable.economy.commandReceipts.slice(0, -1),
      beforeEnable.economy.commandReceipts,
      "Activation appends its command receipt without rewriting prior receipts",
    );
    assert.equal(afterEnable.economy.commandReceipts.at(-1).kind, "coffee.enable");
    const cafeImage = join(out, `${viewport.name}-activation-existing-shift.png`);
    await page.screenshot({ path: cafeImage });
    result.screenshots.push(cafeImage);
    result.checks.push(
      "Starting the café trial acknowledges activation without denying the existing shift or changing accounts",
    );
    await page.getByRole("button", { name: "Close Hobbs café", exact: true }).click();
    const beforePortable = protectedState(await stored(page));
    const raw = await downloadTown(page, `${viewport.name}-synthetic-completed.json`);
    assert.deepEqual(
      protectedState(JSON.parse(raw).town),
      beforePortable,
      "Export retains every financial, identity and history fact",
    );
    const portable = readTownFile(raw);
    assert.equal(portable.status, "ready");
    // Match persisted JSON: loader-only undefined optional keys are not stored.
    const expectedPortable = protectedState(JSON.parse(JSON.stringify(portable.town)));
    const normalizedBefore = structuredClone(beforePortable);
    for (const actor of normalizedBefore.people)
      for (const memory of actor.memories) memory.seed ??= false;
    assert.deepEqual(
      expectedPortable,
      normalizedBefore,
      "Import only makes the absent memory seed flag explicitly false",
    );
    await importTown(page, raw, "synthetic-relationship-roundtrip.json");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game));
    assert.deepEqual(protectedState(await stored(page)), expectedPortable);
    panel = await card(page, "Arwyn");
    assert.match(
      await panel
        .getByRole("region", { name: "Shared activities with Arwyn", exact: true })
        .innerText(),
      /Northern's first reading/,
    );
    assert.ok(!(await panel.innerText()).includes(shiftText));
    assert.deepEqual(auditEconomy(await stored(page)), []);
    result.checks.push(
      "Export/import and reload preserve shared reading, scoped commitments, full wage reservation and identities",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.blockedProviderRequests, []);
    console.log(
      JSON.stringify({ viewport: viewport.name, checks: result.checks.length, ok: true }),
    );
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
