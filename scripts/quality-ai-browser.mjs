import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

// Disposable browser-only replacement of the development transport module.
// Product source, auth, server functions, keys and provider endpoints are untouched.
const target = new URL(process.env.GAME_AI_QA_URL || "http://127.0.0.1:8094/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const out = resolve(process.env.GAME_AI_QA_OUT || "artifacts/quality-ai-browser");
await mkdir(out, { recursive: true });
const report = {
  url: target.href,
  mockedTransport: true,
  liveProviderCalls: 0,
  journeys: [],
  failures: [],
};
const transportModule = `
const mock = globalThis.__qualityMindMock ??= {
  calls: [], pending: new Map(),
  resolve(id, response) { const pending = this.pending.get(id); if (pending) { this.pending.delete(id); pending.resolve(response); } },
  reject(id) { const pending = this.pending.get(id); if (pending) { this.pending.delete(id); pending.reject(new Error('Synthetic provider unavailable')); } }
};
export async function mindAvailability() { return { online: true, configured: true }; }
export function thinkTown({data}) {
  const id = mock.calls.length;
  mock.calls.push({ id, kind: data.kind, started: Date.now() });
  return new Promise((resolve, reject) => mock.pending.set(id, { resolve, reject }));
}
`;
const browser = await chromium.launch({ headless: true });
let activePage;
const readTown = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const position = (page) =>
  page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));
const calls = (page) => page.evaluate(() => window.__qualityMindMock.calls);
const copy = (value) => structuredClone(value);
const chatCount = (value, line) =>
  value.agents
    .find((agent) => agent.id === "kevin")
    .memories.filter(
      (memory) => memory.type === "chat" && memory.with === "player" && memory.text.includes(line),
    ).length;
async function requestCount(page, count) {
  await page.waitForFunction(
    (expected) => window.__qualityMindMock?.calls.length >= expected,
    count,
  );
}
async function resolveRequest(page, id, body) {
  await page.evaluate(({ id, text }) => window.__qualityMindMock.resolve(id, { ok: true, text }), {
    id,
    text: JSON.stringify(body),
  });
  await page.waitForTimeout(150);
}
async function pause(page) {
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(120);
}
async function importTown(page, value) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-delayed-town.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 2, town: value })),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(
    (name) => JSON.parse(localStorage.getItem("the-game-town-v2")).town.playerName === name,
    value.playerName,
  );
}
async function step(page, touch = false, preferred) {
  const before = await position(page);
  const options = await page.evaluate(
    ({ before, preferred }) => {
      const directions = [
        { key: "ArrowRight", label: "East", x: before.x + 1, y: before.y },
        { key: "ArrowLeft", label: "West", x: before.x - 1, y: before.y },
        { key: "ArrowDown", label: "South", x: before.x, y: before.y + 1 },
        { key: "ArrowUp", label: "North", x: before.x, y: before.y - 1 },
      ].filter((option) => window.__game.tile(option.x, option.y)?.block === false);
      return preferred
        ? directions.sort((a, b) => Number(b.key === preferred) - Number(a.key === preferred))
        : directions;
    },
    { before, preferred },
  );
  for (const option of options) {
    await page.evaluate(() => document.activeElement?.blur());
    if (touch) {
      const box = await page.getByRole("button", { name: option.label, exact: true }).boundingBox();
      assert.ok(box);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
      });
      await page.waitForTimeout(100);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else {
      await page.keyboard.down(option.key);
      await page.waitForTimeout(100);
      await page.keyboard.up(option.key);
    }
    await page.waitForTimeout(100);
    const after = await position(page);
    if (after.x !== before.x || after.y !== before.y)
      return { before, after, key: option.key, input: touch ? "touch" : "keyboard" };
  }
  throw new Error("Movement stopped during a delayed provider request");
}
async function openKevin(page) {
  // Close/import actions restore their opener on the next animation frame.
  // Let that complete before placing focus on the town for this shortcut;
  // otherwise Enter can correctly reactivate Help on a slower CI phone.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.locator("canvas.town-canvas").focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your line to Kevin", { exact: true }).waitFor();
}
async function send(page, text) {
  await page.getByLabel("Your line to Kevin", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Say it", exact: true }).click();
}
async function startReplay(page) {
  await page.locator("#scrub").focus();
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "Back to now", exact: true }).waitFor();
}
const reply = (text) => ({
  reply: text,
  delta: 0,
  note: "",
  favor: null,
  thread: null,
  notice: null,
  project: null,
});
try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = { viewport, moduleReplacements: 0, networkLeaks: [], errors: [] };
    report.journeys.push(result);
    const context = await browser.newContext({ viewport, hasTouch: viewport.name === "phone" });
    await context.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== target.origin)
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      if (requestUrl.pathname.includes("_serverFn")) {
        result.networkLeaks.push({ path: requestUrl.pathname, method: route.request().method() });
        return route.fulfill({
          status: 503,
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
        body: transportModule,
      });
    });
    const page = (activePage = await context.newPage());
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // A town can appear in another tab while name entry is already open.
    await page.getByLabel("What do they call you?", { exact: true }).waitFor();
    const damaged = "{synthetic unreadable town from a competing tab";
    await page.evaluate((raw) => localStorage.setItem("the-game-town-v2", raw), damaged);
    await page.getByLabel("What do they call you?", { exact: true }).fill("Late entry");
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.getByRole("button", { name: "Open saved town", exact: true }).click();
    assert.equal(
      await page.getByLabel("Unreadable town save preview", { exact: true }).inputValue(),
      damaged,
    );
    assert.equal(await page.evaluate(() => localStorage.getItem("the-game-town-v2")), damaged);
    result.namingConflictOffersRecovery = true;
    // An existing zero-byte value is unreadable, rather than missing.
    await page.evaluate(() => localStorage.setItem("the-game-town-v2", ""));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Unreadable town save preview", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("What do they call you?", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("the-game-town-v2")), "");
    await page.getByRole("button", { name: "I have a copy. Start over.", exact: true }).click();
    result.emptySaveOffersRecovery = true;
    await page.getByLabel("What do they call you?", { exact: true }).fill(`AI QA ${viewport.name}`);
    await page.getByLabel("Use local dialogue only", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(
      () =>
        !!window.__game && !!window.__qualityMindMock && !!localStorage.getItem("the-game-town-v2"),
    );
    assert.ok(
      result.moduleReplacements > 0,
      "Development transport replacement must have been used",
    );
    const initialMove = await step(page, viewport.name === "phone");
    await page.waitForFunction(({ x, y }) => {
      const player = JSON.parse(localStorage.getItem("the-game-town-v2")).town.agents.find(
        (agent) => agent.id === "player",
      );
      return player.tile.x === x && player.tile.y === y;
    }, initialMove.after);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__controlsTest && !!window.__qualityMindMock);
    assert.deepEqual(await position(page), initialMove.after);
    result.pausedMovementAutosavesWithoutAnotherAction = initialMove;
    const base = await readTown(page);
    const ambient = copy(base);
    ambient.playerName = `Ambient ${viewport.name}`;
    ambient.day = 2;
    ambient.paused = true;
    await importTown(page, ambient);
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await requestCount(page, 1);
    assert.equal((await calls(page))[0].kind, "plan");
    const started = Date.now();
    result.ambientMovement = await step(page, viewport.name === "phone");
    await page
      .getByRole("navigation", { name: "Your town tools", exact: true })
      .getByRole("button", { name: "Journal", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Your journal", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close Your journal", exact: true }).click();
    const clockBefore = await page.locator(".hud-clock").innerText();
    await page.waitForTimeout(1000);
    const clockAfter = await page.locator(".hud-clock").innerText();
    assert.notEqual(
      clockAfter,
      clockBefore,
      "Game time must advance while ambient transport is pending",
    );
    await pause(page);
    assert.ok((await readTown(page)).minute > ambient.minute);
    if (viewport.name === "desktop") {
      // Hold the actual transport promise for 30 seconds, longer than the UI's
      // own bounded wait, without blocking controls or making a network call.
      const remaining = Math.max(0, 30_000 - (Date.now() - started));
      await page.waitForTimeout(remaining);
    }
    result.ambientUnresolvedMs = Date.now() - started;
    const near = copy(base);
    near.playerName = `Replies ${viewport.name}`;
    const kevin = near.agents.find((agent) => agent.id === "kevin");
    near.agents.find((agent) => agent.id === "player").tile = await page.evaluate(
      ({ x, y }) =>
        [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 },
        ].find((point) => window.__game.tile(point.x, point.y)?.block === false),
      kevin.tile,
    );
    await importTown(page, near);
    const staleMarker = `STALE-AMBIENT-${viewport.name}`;
    await resolveRequest(page, 0, {
      plans: [
        {
          id: "kevin",
          summary: staleMarker,
          blocks: [{ from: 0, to: 24, place: "cafe", spot: "out", status: staleMarker }],
        },
      ],
    });
    await pause(page);
    assert.equal(
      JSON.stringify(await readTown(page)).includes(staleMarker),
      false,
      "A pre-import result cannot alter the replacement town",
    );
    result.importRejectsStaleAmbient = true;
    await openKevin(page);
    const first = `First pending ${viewport.name}`;
    await send(page, first);
    await requestCount(page, 2);
    await page.getByRole("button", { name: "Use local reply now", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#mind-line")?.value === "");
    await pause(page);
    assert.equal(chatCount(await readTown(page), first), 1);
    const second = `Second pending ${viewport.name}`;
    await send(page, second);
    await requestCount(page, 3);
    await resolveRequest(page, 2, reply(`Second accepted ${viewport.name}`));
    await page.waitForFunction(() => document.querySelector("#mind-line")?.value === "");
    await resolveRequest(page, 1, reply(`LATE-FIRST-${viewport.name}`));
    await pause(page);
    const reordered = await readTown(page);
    assert.equal(chatCount(reordered, first), 1);
    assert.equal(chatCount(reordered, second), 1);
    assert.equal(JSON.stringify(reordered).includes(`LATE-FIRST-${viewport.name}`), false);
    result.manualFallbackAndReordering = true;
    const walkDraft = `Walk away ${viewport.name}`;
    await send(page, walkDraft);
    await requestCount(page, 4);
    let distance = 0;
    for (let move = 0; move < 8 && distance <= 2; move++) {
      await step(page, false, "ArrowRight");
      const current = await position(page);
      distance = Math.abs(current.x - kevin.tile.x) + Math.abs(current.y - kevin.tile.y);
    }
    assert.ok(distance > 2, "Foreground conversation must allow walking out of earshot");
    await resolveRequest(page, 3, reply(`LATE-WALK-${viewport.name}`));
    assert.equal(
      await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
      walkDraft,
    );
    await pause(page);
    assert.equal(chatCount(await readTown(page), walkDraft), 0);
    assert.equal(
      JSON.stringify(await readTown(page)).includes(`LATE-WALK-${viewport.name}`),
      false,
    );
    result.walkAwayRetainsDraft = true;
    if (viewport.name === "desktop") {
      await page.getByRole("button", { name: "Close conversation", exact: true }).click();
      await importTown(page, near);
      await openKevin(page);
      const missing = "No provider result";
      await send(page, missing);
      await requestCount(page, 5);
      await page.waitForFunction(
        () => document.querySelector("#mind-line")?.value === "",
        undefined,
        { timeout: 18_000 },
      );
      await pause(page);
      assert.equal(chatCount(await readTown(page), missing), 1);
      await resolveRequest(page, 4, reply("LATE-TIMEOUT"));
      await pause(page);
      assert.equal(chatCount(await readTown(page), missing), 1);
      assert.equal(JSON.stringify(await readTown(page)).includes("LATE-TIMEOUT"), false);
      result.missingResultFallsBackExactlyOnce = true;
    }
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    const replayTown = copy(near);
    const ids = replayTown.agents.map((agent) => agent.id);
    const positions = replayTown.agents.flatMap((agent) => [agent.tile.x, agent.tile.y]);
    replayTown.scrub = [
      { d: replayTown.day, m: replayTown.minute - 1, ids, p: positions },
      { d: replayTown.day, m: replayTown.minute, ids, p: positions },
    ];
    await importTown(page, replayTown);
    await openKevin(page);
    const replayManual = `Replay manual ${viewport.name}`;
    const replayManualId = (await calls(page)).length;
    await send(page, replayManual);
    await requestCount(page, replayManualId + 1);
    await startReplay(page);
    await page
      .getByRole("button", { name: "Use local reply now", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      chatCount(await readTown(page), replayManual),
      0,
      "Manual fallback must not apply a new exchange from replay",
    );
    await page.getByRole("button", { name: "Back to now", exact: true }).click();
    await resolveRequest(page, replayManualId, reply(`LATE-REPLAY-MANUAL-${viewport.name}`));
    await openKevin(page);
    assert.equal(
      await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
      replayManual,
    );
    assert.equal(
      chatCount(await readTown(page), replayManual),
      0,
      "Leaving replay cannot revive a cancelled response",
    );
    result.replayCancelsPendingAndHidesFallback = true;
    const replayPreference = `Replay preference ${viewport.name}`;
    const replayPreferenceId = (await calls(page)).length;
    await send(page, replayPreference);
    await requestCount(page, replayPreferenceId + 1);
    await startReplay(page);
    await page
      .getByRole("navigation", { name: "Your town tools", exact: true })
      .getByRole("button", { name: "Help & privacy", exact: true })
      .click();
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page.getByRole("button", { name: "Close Help & privacy", exact: true }).click();
    assert.equal(
      chatCount(await readTown(page), replayPreference),
      0,
      "Enabling local-only during replay must cancel without applying an exchange",
    );
    await page.getByRole("button", { name: "Back to now", exact: true }).click();
    await resolveRequest(
      page,
      replayPreferenceId,
      reply(`LATE-REPLAY-PREFERENCE-${viewport.name}`),
    );
    await openKevin(page);
    assert.equal(
      await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
      replayPreference,
    );
    assert.equal(chatCount(await readTown(page), replayPreference), 0);
    result.localOnlyCancelsWithoutApplyingInReplay = true;
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Your town tools", exact: true })
      .getByRole("button", { name: "Help & privacy", exact: true })
      .click();
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page.getByRole("button", { name: "Close Help & privacy", exact: true }).click();
    const beforeLocal = (await calls(page)).length;
    await importTown(page, ambient);
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await page.waitForTimeout(1500);
    await pause(page);
    assert.equal(
      (await calls(page)).length,
      beforeLocal,
      "Local-only must emit zero autonomous think calls",
    );
    await importTown(page, near);
    await openKevin(page);
    await send(page, "Local only words");
    await page.waitForFunction(() => document.querySelector("#mind-line")?.value === "");
    assert.equal(
      (await calls(page)).length,
      beforeLocal,
      "Local-only must emit zero foreground think calls",
    );
    result.localOnlyNoBackgroundOrPlayerCalls = true;
    await page.screenshot({ path: join(out, `${viewport.name}-local-only.png`) });
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Your town tools", exact: true })
      .getByRole("button", { name: "Help & privacy", exact: true })
      .click();
    await page.getByLabel("Use local dialogue only", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Close Help & privacy", exact: true }).click();
    await openKevin(page);
    const acceptedClosed = `Accepted with card closed ${viewport.name}`;
    const acceptedClosedId = (await calls(page)).length;
    await send(page, acceptedClosed);
    await requestCount(page, acceptedClosedId + 1);
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await resolveRequest(page, acceptedClosedId, reply("I heard you while the card was closed."));
    await openKevin(page);
    assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), "");
    assert.equal(chatCount(await readTown(page), acceptedClosed), 1);
    result.acceptedClosedCardClearsSentDraft = true;
    const fallbackClosed = `Local with card closed ${viewport.name}`;
    const fallbackClosedId = (await calls(page)).length;
    await send(page, fallbackClosed);
    await requestCount(page, fallbackClosedId + 1);
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await page.getByRole("button", { name: "Use local reply now", exact: true }).click();
    await resolveRequest(page, fallbackClosedId, reply(`LATE-CLOSED-FALLBACK-${viewport.name}`));
    await openKevin(page);
    assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), "");
    assert.equal(chatCount(await readTown(page), fallbackClosed), 1);
    assert.equal(
      JSON.stringify(await readTown(page)).includes(`LATE-CLOSED-FALLBACK-${viewport.name}`),
      false,
    );
    result.localClosedCardClearsSentDraftOnce = true;
    const acceptedWithNewDraft = `Sent before new draft ${viewport.name}`;
    const unsent = `Keep my newer words ${viewport.name}`;
    const newerId = (await calls(page)).length;
    await send(page, acceptedWithNewDraft);
    await requestCount(page, newerId + 1);
    await page.getByLabel("Your line to Kevin", { exact: true }).fill(unsent);
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await resolveRequest(page, newerId, reply("The sent line has landed."));
    await openKevin(page);
    assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), unsent);
    assert.equal(chatCount(await readTown(page), acceptedWithNewDraft), 1);
    result.acceptedReplyPreservesNewerUnsentDraft = true;
    const beforeImport = `Pending before replacement ${viewport.name}`;
    const importId = (await calls(page)).length;
    await send(page, beforeImport);
    await requestCount(page, importId + 1);
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    const replacement = copy(near);
    replacement.playerName = `Replaced ${viewport.name}`;
    await importTown(page, replacement);
    await resolveRequest(page, importId, reply(`LATE-PLAYER-IMPORT-${viewport.name}`));
    assert.equal(chatCount(await readTown(page), beforeImport), 0);
    assert.equal(
      JSON.stringify(await readTown(page)).includes(`LATE-PLAYER-IMPORT-${viewport.name}`),
      false,
    );
    await openKevin(page);
    assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), "");
    result.importCancelsForegroundAndResetsDrafts = true;
    result.transportCalls = (await calls(page)).map(({ id, kind }) => ({ id, kind }));
    assert.deepEqual(result.networkLeaks, []);
    assert.deepEqual(result.errors, []);
    await page.screenshot({ path: join(out, `${viewport.name}-complete.png`) });
    await context.close();
    activePage = undefined;
    console.log(JSON.stringify({ viewport: viewport.name, ok: true, scenarios: result }, null, 2));
  }
} catch (error) {
  report.failures.push(
    (error instanceof Error
      ? `${error.message}\n${error.stack?.split("\n").slice(1, 4).join("\n")}`
      : String(error)
    ).slice(0, 1800),
  );
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
  console.error(
    JSON.stringify(
      { ok: false, failures: report.failures, report: join(out, "results.json") },
      null,
      2,
    ),
  );
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
