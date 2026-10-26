import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

// Disposable browser-only replacement of the development transport module.
// Product source, auth, server functions, keys and provider endpoints are untouched.
// Session recovery enables the auth boundary in the served browser module only
// and uses synthetic localhost get-session responses.
const target = new URL(process.env.GAME_AI_QA_URL || "http://127.0.0.1:8094/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const out = resolve(process.env.GAME_AI_QA_OUT || "artifacts/quality-ai-browser");
const recoveryOnly = process.env.GAME_AI_QA_RECOVERY_ONLY === "1";
const onlyViewport = process.env.GAME_AI_QA_VIEWPORT;
assert.ok(!onlyViewport || ["desktop", "phone"].includes(onlyViewport));
await mkdir(out, { recursive: true });
const report = {
  url: target.href,
  mockedTransport: true,
  liveProviderCalls: 0,
  recoveryOnly,
  journeys: [],
  failures: [],
};
const transportModule = `
const mock = globalThis.__qualityMindMock ??= {
  calls: [], pending: new Map(), availabilityCalls: 0,
  holdAvailability: false, availabilityPending: [],
  availability: { online: true, configured: true },
  availabilityRejects: Number(sessionStorage.getItem('__qualityAvailabilityRejects') || 0),
  resolve(id, response) { const pending = this.pending.get(id); if (pending) { this.pending.delete(id); pending.resolve(response); } },
  reject(id, message = 'Synthetic provider unavailable') { const pending = this.pending.get(id); if (pending) { this.pending.delete(id); pending.reject(new Error(message)); } }
};
sessionStorage.removeItem('__qualityAvailabilityRejects');
export function mindAvailability() {
  mock.availabilityCalls++;
  if (mock.availabilityRejects > 0) {
    mock.availabilityRejects--;
    throw new Error('Synthetic availability check unavailable');
  }
  if (mock.holdAvailability)
    return new Promise(resolve => mock.availabilityPending.push(resolve));
  return mock.availability;
}
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
async function checkHiddenWhileAvailabilityPending(page, viewport) {
  const line = `Keep this line when hidden ${viewport.name}`;
  const before = (await calls(page)).length;
  await page.evaluate(() => {
    window.__qualityMindMock.availability = { online: false, configured: false };
    window.dispatchEvent(new Event("focus"));
  });
  await page.locator('[data-ai-status="unavailable"]').waitFor();
  await page.evaluate(() => {
    window.__qualityMindMock.holdAvailability = true;
    window.__qualityMindMock.availability = { online: true, configured: true };
  });
  await send(page, line);
  await page.waitForFunction(() => window.__qualityMindMock.availabilityPending.length > 0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    const mock = window.__qualityMindMock;
    mock.holdAvailability = false;
    for (const resolve of mock.availabilityPending.splice(0)) resolve(mock.availability);
  });
  await page.waitForFunction(() =>
    /return.*tab|tab.*inactive|inactive.*tab|back.*tab/i.test(
      document.querySelector(".mind-send-note")?.textContent || "",
    ),
  );
  assert.equal(
    (await calls(page)).length,
    before,
    "A newly hidden tab cannot send after an awaited availability check",
  );
  assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), line);
  assert.equal(chatCount(await readTown(page), line), 0);
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator('[data-ai-status="ready"]').waitFor();
}
const isSessionRequest = (url) => /\/api\/auth\/get-session$/.test(new URL(url).pathname);
const syntheticSession = {
  session: {
    id: "quality-session",
    token: "synthetic-browser-only-token",
    userId: "quality-user",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  user: {
    id: "quality-user",
    name: "Synthetic session recovery",
    email: "quality@example.invalid",
    emailVerified: true,
    image: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};
async function checkExpiredSessionRecovery(page, viewport, result, authSession) {
  const line = `Keep my expired-session draft ${viewport.name}`;
  const id = (await calls(page)).length;
  const sessionCallsBefore = authSession.calls.length;
  await send(page, line);
  await requestCount(page, id + 1);
  await page.evaluate((id) => window.__qualityMindMock.reject(id, "Unauthorized"), id);
  const warning = page.locator("[data-ai-warning]");
  await warning.waitFor();
  assert.match(await warning.innerText(), /session.*expired|sign in/i);
  const signIn = page.getByRole("button", { name: "Sign in again", exact: true });
  await signIn.waitFor();
  await pause(page);

  const assertUnsentDraft = async () => {
    assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), line);
    assert.equal(chatCount(await readTown(page), line), 0);
    assert.equal(
      (await calls(page)).length,
      id + 1,
      "A session check cannot replay the failed message or request a model response",
    );
  };
  const checkSession = async ({ data, status = 200, expectedNotice }) => {
    authSession.data = data;
    authSession.status = status;
    authSession.hold = true;
    const observed = new Promise((resolve) => authSession.observers.push(resolve));
    await page.getByRole("button", { name: "Check AI connection", exact: true }).click();
    const request = await observed;
    assert.equal(request.disableCookieCache, "true", "Recovery must bypass stale session cookies");
    const checking = page.getByRole("button", { name: "Checking AI connection", exact: true });
    await checking.waitFor();
    assert.equal(await checking.isDisabled(), true);
    await assertUnsentDraft();
    authSession.hold = false;
    for (const release of authSession.pending.splice(0)) release();
    await page.locator("[data-ai-connection-note]").filter({ hasText: expectedNotice }).waitFor();
    await assertUnsentDraft();
  };

  await checkSession({ data: null, expectedNotice: /sign in again to reconnect/i });
  assert.match(await warning.innerText(), /session.*expired|sign in/i);
  await signIn.waitFor();
  await page.screenshot({ path: join(out, `${viewport.name}-session-expired.png`) });
  await checkSession({
    data: { message: "Synthetic session transport unavailable" },
    status: 503,
    expectedNotice: /sign-in check could not finish/i,
  });
  await warning.waitFor();
  await signIn.waitFor();
  await checkSession({
    data: syntheticSession,
    expectedNotice: /sign-in is working and AI is configured/i,
  });
  assert.equal(
    await warning.count(),
    0,
    "A confirmed session must clear the expired-session warning",
  );
  assert.equal(await signIn.count(), 0);
  assert.equal(authSession.calls.length - sessionCallsBefore, 3);
  result.expiredSessionRecovery = {
    missingSessionKeepsSignInAndDraft: true,
    transportFailureShowsRetryAndKeepsDraft: true,
    confirmedSessionClearsWarningWithoutReplay: true,
    sessionChecks: authSession.calls.slice(sessionCallsBefore),
  };
  await page.screenshot({ path: join(out, `${viewport.name}-session-reconnected.png`) });
  await page.getByRole("button", { name: "Dismiss AI connection message", exact: true }).click();
  assert.equal(await page.locator("[data-ai-connection-note]").count(), 0);
  await page.getByRole("button", { name: "Show AI connection details", exact: true }).click();
  await page.locator("[data-ai-connection-note]").waitFor();
  await assertUnsentDraft();
  result.expiredSessionRecovery.successNoticeCanBeDismissedAndReopened = true;
  await send(page, line);
  await requestCount(page, id + 2);
  await resolveRequest(page, id + 1, reply(`Session recovered ${viewport.name}`));
  await page.waitForFunction(() => document.querySelector("#mind-line")?.value === "");
  assert.equal(chatCount(await readTown(page), line), 1);
  result.expiredSessionRecovery.explicitResendSucceedsOnce = true;
}
async function checkDismissibleWarning(page, viewport, result, authSession) {
  const line = `Dismiss keeps my line ${viewport.name}`;
  const id = (await calls(page)).length;
  const warning = page.locator("[data-ai-warning]");
  const reopen = page.getByRole("button", { name: "Show AI connection details", exact: true });
  const dismiss = page.getByRole("button", { name: "Dismiss AI connection message", exact: true });
  const field = page.getByLabel("Your line to Kevin", { exact: true });
  await send(page, line);
  await requestCount(page, id + 1);
  await page.evaluate(id => window.__qualityMindMock.resolve(id, { ok: false, error: "slow" }), id);
  await warning.waitFor();
  await pause(page);
  const box = await dismiss.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44);
  assert.ok(box.y >= 0 && box.y + box.height <= viewport.height);
  await dismiss.click();
  assert.equal(await warning.count(), 0);
  await reopen.waitFor();
  const reopenBox = await reopen.boundingBox();
  assert.ok(reopenBox && reopenBox.height >= 44);
  await page.clock.fastForward(16_000);
  assert.equal(await warning.count(), 0, "Availability polling cannot reopen a dismissed warning");
  assert.equal(await field.inputValue(), line);
  assert.equal((await calls(page)).length, id + 1);
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  assert.equal(await warning.count(), 0, "Closing the card cannot reopen the banner over the town");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download town", exact: true }).click();
  const download = await downloaded;
  const exportPath = join(out, `${viewport.name}-dismissed-synthetic-town.json`);
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  assert.equal(exported.town.identityRegistry.worldId, (await readTown(page)).identityRegistry.worldId);
  result.exportWithDismissedWarningRetainsTown = true;
  await reopen.click();
  await warning.waitFor();
  await dismiss.click();
  await openKevin(page);
  assert.equal(await warning.count(), 0, "Reopening a card keeps the warning dismissed");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await reopen.click();
  await warning.waitFor();
  await dismiss.click();
  await page.getByRole("tab", { name: "Together", exact: true }).click();
  assert.equal(await warning.count(), 0);
  await reopen.click();

  authSession.data = syntheticSession;
  authSession.status = 200;
  authSession.hold = true;
  const observed = new Promise(resolve => authSession.observers.push(resolve));
  await page.getByRole("button", { name: "Check AI connection", exact: true }).click();
  await observed;
  await page.getByRole("button", { name: "Checking AI connection", exact: true }).waitFor();
  await dismiss.click();
  const settled = page.waitForResponse(response => isSessionRequest(response.url()));
  authSession.hold = false;
  for (const release of authSession.pending.splice(0)) release();
  await (await settled).finished();
  await page.waitForTimeout(150);
  assert.equal(await warning.count(), 0, "A late check result cannot reopen the dismissed banner");
  assert.equal(await page.locator("[data-ai-connection-note]").count(), 0);
  assert.equal(await field.inputValue(), line);
  assert.equal((await calls(page)).length, id + 1);
  await reopen.click();
  await page.locator("[data-ai-connection-note]").filter({
    hasText: /does not test a reply or available limits/i,
  }).waitFor();
  assert.match(await warning.innerText(), /limited|busy/i);
  await dismiss.click();
  await page.screenshot({ path: join(out, `${viewport.name}-dismissed-warning.png`) });

  // A genuinely new failure of the same kind must become visible again.
  await send(page, line);
  await requestCount(page, id + 2);
  await page.evaluate(id => window.__qualityMindMock.resolve(id, { ok: false, error: "slow" }), id + 1);
  await warning.waitFor();
  assert.equal(chatCount(await readTown(page), line), 0);
  await send(page, line);
  await requestCount(page, id + 3);
  await resolveRequest(page, id + 2, reply(`Dismissal recovered ${viewport.name}`));
  await page.waitForFunction(() => document.querySelector("#mind-line")?.value === "");
  assert.equal(chatCount(await readTown(page), line), 1);
  assert.equal(await warning.count(), 0);
  result.dismissibleWarning = {
    touchTargetReachable: true,
    pollingAndLateCheckStayDismissed: true,
    townAndCardReopenStayDismissed: true,
    detailsCanBeReopened: true,
    checkDoesNotClaimProviderReadiness: true,
    newFailureResurfaces: true,
    draftRetainedAndExplicitRetryLandsOnce: true,
  };
}
async function checkSupersededSessionRecovery(page, viewport, result, authSession) {
  for (const outcome of ["accepted", "limited"]) {
    const earlierLine = `Earlier expired request before ${outcome} ${viewport.name}`;
    const newerLine = `Newer ${outcome} request ${viewport.name}`;
    const id = (await calls(page)).length;
    await send(page, earlierLine);
    await requestCount(page, id + 1);
    await page.evaluate((id) => window.__qualityMindMock.reject(id, "Unauthorized"), id);
    await page.getByRole("button", { name: "Sign in again", exact: true }).waitFor();
    authSession.data = null;
    authSession.status = 200;
    authSession.hold = true;
    const observed = new Promise((resolve) => authSession.observers.push(resolve));
    await page.getByRole("button", { name: "Check AI connection", exact: true }).click();
    await observed;
    await page.getByRole("button", { name: "Checking AI connection", exact: true }).waitFor();
    await send(page, newerLine);
    await requestCount(page, id + 2);
    if (outcome === "accepted") {
      await resolveRequest(page, id + 1, reply(`The newer line landed ${viewport.name}`));
      await page.locator('[data-ai-status="responded"]').waitFor();
      assert.equal(await page.locator("[data-ai-warning]").count(), 0);
    } else {
      await page.evaluate(
        (id) => window.__qualityMindMock.resolve(id, { ok: false, error: "slow" }),
        id + 1,
      );
      await page
        .locator("[data-ai-warning]")
        .filter({ hasText: /limited|busy/i })
        .waitFor();
    }
    const settled = page.waitForResponse((response) => isSessionRequest(response.url()));
    authSession.hold = false;
    for (const release of authSession.pending.splice(0)) release();
    await (await settled).finished();
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByRole("button", { name: "Sign in again", exact: true }).count(),
      0,
      "An older session check cannot replace a newer player request outcome",
    );
    assert.equal((await calls(page)).length, id + 2);
    assert.equal(chatCount(await readTown(page), earlierLine), 0);
    if (outcome === "accepted") {
      assert.equal(await page.locator("[data-ai-warning]").count(), 0);
      assert.equal(chatCount(await readTown(page), newerLine), 1);
      assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), "");
    } else {
      assert.match(await page.locator("[data-ai-warning]").innerText(), /limited|busy/i);
      assert.equal(chatCount(await readTown(page), newerLine), 0);
      assert.equal(
        await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
        newerLine,
      );
    }
  }
  authSession.data = syntheticSession;
  result.supersededSessionCheckPreservesNewerSuccessAndFailure = true;
}
async function checkSignInDraftReturn(page, viewport, result) {
  const line = `My line after sign-in ${viewport.name}`;
  const original = await readTown(page);
  const worldId = original.identityRegistry.worldId;
  const moduleUrl = new URL("/src/components/town/sign-in-drafts.ts", target.origin).href;
  const saveSnapshot = (savedWorldId, text) =>
    page.evaluate(
      async ({ moduleUrl, worldId, text }) => {
        const { saveSignInDrafts } = await import(moduleUrl);
        saveSignInDrafts(worldId, { kevin: text }, sessionStorage);
      },
      { moduleUrl, worldId: savedWorldId, text },
    );
  const returnToTown = async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__game && !!window.__qualityMindMock);
    await openKevin(page);
    assert.equal((await readTown(page)).identityRegistry.worldId, worldId);
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("the-game-sign-in-drafts")),
      null,
      "A sign-in return consumes its draft snapshot once",
    );
    assert.equal((await calls(page)).length, 0, "Restoring a draft cannot send an AI request");
  };
  await page.getByLabel("Your line to Kevin", { exact: true }).fill(line);
  // Simulate only the browser's return from OAuth using the production snapshot
  // writer and a reload. No sign-in provider, credentials or server is contacted.
  await saveSnapshot(worldId, line);
  await returnToTown();
  assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), line);
  assert.equal(chatCount(await readTown(page), line), 0);
  await page.screenshot({ path: join(out, `${viewport.name}-sign-in-return.png`) });
  await saveSnapshot(`${worldId}-another-town`, "A line belonging to another town");
  await returnToTown();
  assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), "");
  result.signInReturnDrafts = {
    sameWorldRestoresUnsentDraft: true,
    snapshotConsumedOnce: true,
    differentWorldDoesNotRestoreDraft: true,
    zeroModelCallsOnReturn: true,
  };
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
  ].filter((viewport) => !onlyViewport || viewport.name === onlyViewport)) {
    const result = {
      viewport,
      moduleReplacements: 0,
      authModuleReplacements: 0,
      networkLeaks: [],
      expectedSessionErrors: [],
      errors: [],
    };
    report.journeys.push(result);
    const context = await browser.newContext({ viewport, hasTouch: viewport.name === "phone" });
    const authSession = {
      data: syntheticSession,
      status: 200,
      hold: false,
      calls: [],
      pending: [],
      observers: [],
    };
    await context.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== target.origin)
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      if (isSessionRequest(requestUrl.href)) {
        const request = {
          disableCookieCache: requestUrl.searchParams.get("disableCookieCache"),
          method: route.request().method(),
        };
        authSession.calls.push(request);
        const { data, status } = authSession;
        const held = authSession.hold
          ? new Promise((resolve) => authSession.pending.push(resolve))
          : Promise.resolve();
        for (const notify of authSession.observers.splice(0)) notify(request);
        await held;
        return route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      }
      if (requestUrl.pathname.includes("/api/auth/")) {
        result.networkLeaks.push({ path: requestUrl.pathname, method: route.request().method() });
        return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      }
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
    await context.route("**/src/lib/auth/client.ts*", async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const authFlag =
        /export const authEnabled = import\.meta\.env\.VITE_AUTH_ENABLED !== "false";/;
      assert.ok(authFlag.test(original), "The real browser auth client must expose its auth flag");
      result.authModuleReplacements++;
      return route.fulfill({
        response,
        contentType: "application/javascript",
        body: original.replace(authFlag, "export const authEnabled = true;"),
      });
    });
    const page = (activePage = await context.newPage());
    await page.clock.install();
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const url = message.location().url;
      if (url && isSessionRequest(url) && /\b503\b/.test(message.text()))
        result.expectedSessionErrors.push(message.text());
      else result.errors.push(message.text());
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
    assert.ok(
      result.authModuleReplacements > 0,
      "The browser-only auth flag must exercise real session validation",
    );
    const initialMove = await step(page, viewport.name === "phone");
    await page.waitForFunction(({ x, y }) => {
      const player = JSON.parse(localStorage.getItem("the-game-town-v2")).town.agents.find(
        (agent) => agent.id === "player",
      );
      return player.tile.x === x && player.tile.y === y;
    }, initialMove.after);
    await page.evaluate(() => sessionStorage.setItem("__qualityAvailabilityRejects", "100"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__controlsTest && !!window.__qualityMindMock);
    assert.deepEqual(await position(page), initialMove.after);
    result.pausedMovementAutosavesWithoutAnotherAction = initialMove;
    await page.locator('[data-ai-status="unavailable"]').waitFor();
    await page.locator("[data-ai-warning]").waitFor();
    const availabilityAtFailure = await page.evaluate(
      () => window.__qualityMindMock.availabilityCalls,
    );
    await page.evaluate(() => {
      window.__qualityMindMock.availabilityRejects = 0;
      window.dispatchEvent(new Event("focus"));
    });
    await page.locator('[data-ai-status="ready"]').waitFor();
    assert.ok(
      (await page.evaluate(() => window.__qualityMindMock.availabilityCalls)) >
        availabilityAtFailure,
      "Refocusing must retry an initial failed availability check without reloading",
    );
    assert.equal((await calls(page)).length, 0, "Connection recovery must not generate AI replies");
    result.startupFailureRecoversOnFocusWithoutReload = true;
    await page.evaluate(() => {
      window.__qualityMindMock.availability = { online: false, configured: false };
      window.dispatchEvent(new Event("focus"));
    });
    await page.locator('[data-ai-status="unavailable"]').waitFor();
    await page.evaluate(() => {
      window.__qualityMindMock.availability = { online: true, configured: true };
    });
    await page.clock.fastForward(16_000);
    await page.locator('[data-ai-status="ready"]').waitFor();
    assert.equal((await calls(page)).length, 0, "Periodic recovery must only check availability");
    result.unavailableConfigurationRecoversAutomatically = true;
    const base = await readTown(page);
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
    if (recoveryOnly) {
      await importTown(page, near);
      await openKevin(page);
      await checkHiddenWhileAvailabilityPending(page, viewport);
      result.hiddenDuringAvailabilityKeepsDraftWithoutRequest = true;
      const line = `Focused failure ${viewport.name}`;
      await send(page, line);
      await requestCount(page, 1);
      await page.evaluate(() => window.__qualityMindMock.resolve(0, { ok: false, error: "slow" }));
      await page.locator("[data-ai-warning]").waitFor();
      assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), line);
      assert.equal(chatCount(await readTown(page), line), 0);
      await pause(page);
      const warningBox = await page.locator("[data-ai-warning]").boundingBox();
      const composerBox = await page.locator(".mind-say").boundingBox();
      assert.ok(warningBox && composerBox && warningBox.y + warningBox.height <= composerBox.y + 1,
        "The warning must have its own space above the composer, without covering it");
      assert.ok(warningBox.y + warningBox.height <= viewport.height);
      const close = page.getByRole("button", { name: "Close conversation", exact: true });
      const closeBox = await close.boundingBox();
      assert.ok(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= viewport.height);
      await page.screenshot({ path: join(out, `${viewport.name}-ai-warning.png`) });
      await close.click();
      await openKevin(page);
      await page.getByRole("button", { name: "Check AI connection", exact: true }).click();
      await send(page, line);
      await requestCount(page, 2);
      await resolveRequest(page, 1, reply(`Focused recovered ${viewport.name}`));
      await page.locator('[data-ai-status="responded"]').waitFor();
      assert.equal(await page.locator("[data-ai-warning]").count(), 0);
      assert.equal(chatCount(await readTown(page), line), 1);
      result.failureWarningControlsAndResend = true;
      await checkDismissibleWarning(page, viewport, result, authSession);
      await checkExpiredSessionRecovery(page, viewport, result, authSession);
      await checkSupersededSessionRecovery(page, viewport, result, authSession);
      await checkSignInDraftReturn(page, viewport, result);
      assert.deepEqual(result.networkLeaks, []);
      assert.deepEqual(result.errors, []);
      await page.screenshot({ path: join(out, `${viewport.name}-recovery.png`) });
      await context.close();
      activePage = undefined;
      console.log(
        JSON.stringify({ viewport: viewport.name, ok: true, scenarios: result }, null, 2),
      );
      continue;
    }
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
    assert.notEqual(
      await page.locator("[data-ai-status]").getAttribute("data-ai-status"),
      "unavailable",
      "An ambient result or timeout must not report that player AI has failed",
    );
    result.ambientFailureDoesNotDisablePlayerAI = true;
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
    await checkHiddenWhileAvailabilityPending(page, viewport);
    result.hiddenDuringAvailabilityKeepsDraftWithoutRequest = true;
    const first = `First pending ${viewport.name}`;
    await send(page, first);
    await requestCount(page, 2);
    await page.getByRole("button", { name: "Cancel AI request", exact: true }).click();
    assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), first);
    await pause(page);
    assert.equal(chatCount(await readTown(page), first), 0);
    const second = `Second pending ${viewport.name}`;
    await send(page, second);
    assert.equal(
      (await calls(page)).length,
      2,
      "A cancelled request still in transport must settle before another model call starts",
    );
    assert.equal(
      await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
      second,
      "A blocked send retains its draft for explicit resend",
    );
    await resolveRequest(page, 1, reply(`LATE-FIRST-${viewport.name}`));
    await send(page, second);
    await requestCount(page, 3);
    await resolveRequest(page, 2, reply(`Second accepted ${viewport.name}`));
    await page.waitForFunction(() => document.querySelector("#mind-line")?.value === "");
    await pause(page);
    const reordered = await readTown(page);
    assert.equal(chatCount(reordered, first), 0);
    assert.equal(chatCount(reordered, second), 1);
    assert.equal(JSON.stringify(reordered).includes(`LATE-FIRST-${viewport.name}`), false);
    result.sharedTransportLockSerializesCancelledRequest = true;
    result.cancellationPreservesDraftAndRejectsLateReply = true;
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
        () => document.querySelector("[data-ai-warning]") !== null,
        undefined,
        { timeout: 18_000 },
      );
      assert.equal(
        await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
        missing,
      );
      await pause(page);
      assert.equal(chatCount(await readTown(page), missing), 0);
      await resolveRequest(page, 4, reply("LATE-TIMEOUT"));
      await pause(page);
      assert.equal(chatCount(await readTown(page), missing), 0);
      assert.equal(JSON.stringify(await readTown(page)).includes("LATE-TIMEOUT"), false);
      result.timeoutPreservesDraftWithoutLocalReply = true;
    }
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await importTown(page, near);
    await openKevin(page);
    const failureScenarios = [
      { name: "limited", response: { ok: false, error: "slow" }, reason: /limited|busy/i },
      {
        name: "timeout-body",
        response: { ok: false, error: "unreachable", diagnostics: { outcome: "timeout", status: 200 } },
        reason: /too long/i,
      },
      {
        name: "invalid",
        response: { ok: true, text: "not JSON" },
        reason: /invalid|usable|safely use|understand|incomplete/i,
      },
      { name: "connection", response: null, reason: /reach|connection|connect|unavailable/i },
    ];
    for (const scenario of failureScenarios) {
      const line = `${scenario.name} request ${viewport.name}`;
      const id = (await calls(page)).length;
      await send(page, line);
      await requestCount(page, id + 1);
      await page.evaluate(
        ({ id, response }) => {
          if (response) window.__qualityMindMock.resolve(id, response);
          else window.__qualityMindMock.reject(id);
        },
        { id, response: scenario.response },
      );
      await page.locator("[data-ai-warning]").waitFor();
      assert.match(await page.locator("[data-ai-warning]").innerText(), scenario.reason);
      assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), line);
      await pause(page);
      assert.equal(
        chatCount(await readTown(page), line),
        0,
        "A failed AI request cannot author a local exchange",
      );
      await page.clock.fastForward(5000);
      assert.ok(
        await page.locator("[data-ai-warning]").isVisible(),
        "The warning must not disappear after four seconds",
      );
      assert.equal(
        (await calls(page)).length,
        id + 1,
        "Connection checks must not automatically resend a player message",
      );
      if (scenario.name === "limited")
        await page.screenshot({ path: join(out, `${viewport.name}-ai-warning.png`) });
      await page.getByRole("button", { name: "Check AI connection", exact: true }).click();
      await send(page, line);
      await requestCount(page, id + 2);
      await resolveRequest(page, id + 1, reply(`Recovered ${scenario.name} ${viewport.name}`));
      await page.waitForFunction(() => document.querySelector("#mind-line")?.value === "");
      await page.locator('[data-ai-status="responded"]').waitFor();
      assert.equal(await page.locator("[data-ai-warning]").count(), 0);
      await pause(page);
      assert.equal(chatCount(await readTown(page), line), 1);
    }
    result.failedAIKeepsDraftAndRecoversWithoutReload = failureScenarios.map(({ name }) => name);
    await checkDismissibleWarning(page, viewport, result, authSession);
    await checkExpiredSessionRecovery(page, viewport, result, authSession);
    await checkSupersededSessionRecovery(page, viewport, result, authSession);
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
      .getByRole("button", { name: "Cancel AI request", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      chatCount(await readTown(page), replayManual),
      0,
      "Cancellation must not apply a new exchange from replay",
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
    result.replayCancelsPendingAndHidesCancellation = true;
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
    const fallbackClosed = `Cancelled with card closed ${viewport.name}`;
    const fallbackClosedId = (await calls(page)).length;
    await send(page, fallbackClosed);
    await requestCount(page, fallbackClosedId + 1);
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await page.getByRole("button", { name: "Cancel AI request", exact: true }).click();
    await resolveRequest(page, fallbackClosedId, reply(`LATE-CLOSED-FALLBACK-${viewport.name}`));
    await openKevin(page);
    assert.equal(
      await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
      fallbackClosed,
    );
    assert.equal(chatCount(await readTown(page), fallbackClosed), 0);
    assert.equal(
      JSON.stringify(await readTown(page)).includes(`LATE-CLOSED-FALLBACK-${viewport.name}`),
      false,
    );
    result.cancellationWithClosedCardKeepsDraft = true;
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
    await checkSignInDraftReturn(page, viewport, result);
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
