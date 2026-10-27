import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

// Disposable local-browser checks. Every model response is synthetic; no
// account, provider, local inference server or production game is contacted.
const target = new URL(process.env.GAME_PERSONAL_QA_URL || "http://127.0.0.1:8096/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const out = resolve(process.env.GAME_PERSONAL_QA_OUT || "artifacts/personal-model-browser");
await mkdir(out, { recursive: true });
const secret = "synthetic-personal-key-never-transmitted";
const report = {
  url: target.href,
  mockedModelCalls: true,
  liveModelCalls: 0,
  journeys: [],
  failures: [],
};
const hostedModule = `
globalThis.__personalHostedCalls ??= [];
export function mindAvailability() { return { online:false, configured:false, actions:false }; }
export function thinkTown({data}) {
  globalThis.__personalHostedCalls.push(data.kind);
  return Promise.resolve({ok:false,error:'offline'});
}
`;
const reply = (text) => ({
  reply: text,
  delta: 0,
  note: "",
  favor: null,
  thread: null,
  notice: null,
  project: null,
});
const town = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const position = (page) =>
  page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));
const heard = (saved, text) =>
  saved.agents
    .find((person) => person.id === "kevin")
    .memories.some((memory) => memory.type === "chat" && memory.text.includes(text));

async function help(page) {
  await page
    .getByRole("navigation", { name: "Your town tools", exact: true })
    .getByRole("button", { name: "Help & privacy", exact: true })
    .click();
  await page.getByRole("heading", { name: "AI source", exact: true }).waitFor();
}
async function closeHelp(page) {
  await page.getByRole("button", { name: "Close Help & privacy", exact: true }).click();
}
async function openKevin(page) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await page.locator("canvas.town-canvas").focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your line to Kevin", { exact: true }).waitFor();
}
async function send(page, text) {
  await page.getByLabel("Your line to Kevin", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Say it", exact: true }).click();
}
async function importTown(page, value) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "personal-model-synthetic-town.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 2, town: value })),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
}
async function move(page, touch) {
  const before = await position(page);
  const options = await page.evaluate(
    ({ x, y }) =>
      [
        { key: "ArrowRight", label: "East", x: x + 1, y },
        { key: "ArrowLeft", label: "West", x: x - 1, y },
        { key: "ArrowDown", label: "South", x, y: y + 1 },
        { key: "ArrowUp", label: "North", x, y: y - 1 },
      ].filter((point) => window.__game.tile(point.x, point.y)?.block === false),
    before,
  );
  for (const direction of options) {
    await page.evaluate(() => document.activeElement?.blur());
    if (touch) {
      const box = await page
        .getByRole("button", { name: direction.label, exact: true })
        .boundingBox();
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
      await page.keyboard.down(direction.key);
      await page.waitForTimeout(100);
      await page.keyboard.up(direction.key);
    }
    const after = await position(page);
    if (after.x !== before.x || after.y !== before.y)
      return { before, after, input: touch ? "touch" : "keyboard" };
  }
  throw new Error("Player did not move on an adjacent walkable tile");
}

const browser = await chromium.launch({ headless: true });
let activePage;
try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = { viewport, requests: [], networkLeaks: [], errors: [], expectedHttpErrors: [] };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
    });
    let modelResponse = { status: 200, text: `Personal cloud reply ${viewport.name}` };
    let hold = false;
    let releases = [];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        (url.origin === "https://api.openai.com" || url.origin === "http://127.0.0.1:11434") &&
        url.pathname === "/v1/chat/completions"
      ) {
        const headers = {
          "access-control-allow-origin": target.origin,
          "access-control-allow-headers": "authorization,content-type",
          "access-control-allow-methods": "POST,OPTIONS",
        };
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
        assert.equal(request.method(), "POST");
        const body = request.postDataJSON();
        assert.equal(body.messages[0].role, "system");
        assert.equal(body.messages[1].role, "user");
        const auth = request.headers().authorization;
        if (url.protocol === "https:") assert.equal(auth, `Bearer ${secret}`);
        else
          assert.equal(auth, undefined, "Local mode cannot retain the previous cloud credential");
        result.requests.push({
          source: url.protocol === "https:" ? "api-key" : "local",
          model: body.model,
          maxTokens: body.max_tokens,
          authorized: !!auth,
        });
        const response = { ...modelResponse };
        if (hold) await new Promise((release) => releases.push(release));
        return route.fulfill({
          status: response.status,
          headers,
          contentType: "application/json",
          body:
            response.status === 200
              ? JSON.stringify({
                  choices: [{ message: { content: JSON.stringify(reply(response.text)) } }],
                  usage: { prompt_tokens: 20, completion_tokens: 12 },
                })
              : JSON.stringify({ error: "Synthetic unavailable" }),
        });
      }
      if (url.origin !== target.origin) {
        if (request.method() !== "GET")
          result.networkLeaks.push({ origin: url.origin, method: request.method() });
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      }
      if (url.pathname.includes("_serverFn") || url.pathname.includes("/api/auth/")) {
        result.networkLeaks.push({ path: url.pathname, method: request.method() });
        return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      }
      return route.continue();
    });
    await context.route("**/src/lib/mind.functions.ts*", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: hostedModule }),
    );
    const page = (activePage = await context.newPage());
    page.setDefaultTimeout(10_000);
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (
        /api\.openai\.com|127\.0\.0\.1:11434/.test(message.location().url) &&
        /503/.test(message.text())
      )
        result.expectedHttpErrors.push(message.text());
      else result.errors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page
      .getByLabel("What do they call you?", { exact: true })
      .fill(`Personal QA ${viewport.name}`);
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
    await page.waitForFunction(
      () =>
        !!window.__game && !!window.__controlsTest && !!localStorage.getItem("the-game-town-v2"),
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    result.movement = await move(page, viewport.name === "phone");
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("the-game-town-v2")).town.paused === true,
    );
    const fixture = await town(page);
    const originalWorld = fixture.identityRegistry.worldId;
    const kevin = fixture.agents.find((person) => person.id === "kevin");
    fixture.agents.find((person) => person.id === "player").tile = await page.evaluate(
      ({ x, y }) =>
        [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 },
        ].find((point) => window.__game.tile(point.x, point.y)?.block === false),
      kevin.tile,
    );
    await importTown(page, fixture);

    await help(page);
    await page.getByLabel("Use AI from", { exact: true }).selectOption("api-key");
    await page.getByLabel("API base URL", { exact: true }).fill("https://api.openai.com/v1");
    await page.getByLabel("Model name", { exact: true }).fill("synthetic-cloud-model");
    await page.getByLabel("API key", { exact: true }).fill(secret);
    await page.getByRole("button", { name: "Save AI source", exact: true }).click();
    assert.equal(result.requests.length, 0, "Saving source settings cannot make an inference call");
    await page.getByLabel("Use local dialogue only", { exact: true }).uncheck();
    await page.getByLabel("Use AI from", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${viewport.name}-api-settings.png`) });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "Settings fit the viewport",
    );
    await closeHelp(page);
    await page.locator('[data-ai-status="ready"]').waitFor();
    await openKevin(page);
    hold = true;
    await send(page, `My personal cloud question ${viewport.name}`);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-ai-status="thinking"]') !== null ||
        document.querySelector(".mind-send-note")?.textContent.includes("Waiting"),
    );
    for (let i = 0; i < 50 && result.requests.length < 1; i++) await page.waitForTimeout(20);
    assert.equal(result.requests.length, 1);
    await help(page);
    assert.equal(
      await page.getByRole("button", { name: "Save AI source", exact: true }).isDisabled(),
      true,
      "Source cannot change while its transport is settling",
    );
    result.sourceSwitchBlockedWhilePending = true;
    hold = false;
    for (const release of releases.splice(0)) release();
    await page.waitForFunction(
      (text) =>
        JSON.parse(localStorage.getItem("the-game-town-v2"))
          .town.agents.find((person) => person.id === "kevin")
          .memories.some((memory) => memory.type === "chat" && memory.text.includes(text)),
      modelResponse.text,
    );
    await page
      .getByRole("button", { name: "Save AI source", exact: true })
      .waitFor({ state: "visible" });
    assert.equal(
      await page.getByRole("button", { name: "Save AI source", exact: true }).isEnabled(),
      true,
    );
    await closeHelp(page);
    assert.ok(heard(await town(page), modelResponse.text));

    const localStorageText = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    assert.equal(
      localStorageText.includes(secret),
      false,
      "Neither browser storage area persists credentials",
    );
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download town", exact: true }).click();
    const download = await downloadEvent;
    const exportPath = join(out, `${viewport.name}-synthetic-town.json`);
    await download.saveAs(exportPath);
    const exported = await readFile(exportPath, "utf8");
    assert.equal(
      exported.includes(secret),
      false,
      "Town download cannot contain the personal credential",
    );
    assert.equal(JSON.parse(exported).town.identityRegistry.worldId, originalWorld);
    result.keyExcludedFromStorageAndExport = true;

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
    await help(page);
    assert.equal(await page.getByLabel("Use AI from", { exact: true }).inputValue(), "api-key");
    assert.equal(
      await page.getByLabel("API key", { exact: true }).inputValue(),
      "",
      "Reload forgets the secret",
    );
    assert.equal(result.requests.length, 1, "Reload cannot send a model request");
    result.reloadForgetsKeyAndPreservesTown =
      (await town(page)).identityRegistry.worldId === originalWorld;

    await page.getByLabel("Use AI from", { exact: true }).selectOption("local");
    await page.getByLabel("API base URL", { exact: true }).fill("http://127.0.0.1:11434/v1");
    await page.getByLabel("Model name", { exact: true }).fill("synthetic-local-model");
    await page.getByRole("button", { name: "Save AI source", exact: true }).click();
    await page.getByLabel("Use AI from", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${viewport.name}-local-settings.png`) });
    await closeHelp(page);
    await page.locator('[data-ai-status="ready"]').waitFor();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
    });
    await page.locator('[data-ai-status="ready"]').waitFor();
    await openKevin(page);
    modelResponse = { status: 200, text: `Personal local reply ${viewport.name}` };
    await send(page, `My local model question ${viewport.name}`);
    await page.waitForFunction(
      (text) =>
        JSON.parse(localStorage.getItem("the-game-town-v2"))
          .town.agents.find((person) => person.id === "kevin")
          .memories.some((memory) => memory.type === "chat" && memory.text.includes(text)),
      modelResponse.text,
    );
    assert.equal(result.requests.length, 2);
    assert.equal(result.requests[1].source, "local");
    assert.equal(result.requests[1].model, "synthetic-local-model");
    result.localModelReplyLanded = true;
    result.localModelWorksWithoutInternetFlag = true;
    await page.evaluate(() => {
      delete navigator.onLine;
      window.dispatchEvent(new Event("online"));
    });
    await page.screenshot({ path: join(out, `${viewport.name}-local-reply.png`) });

    const failedLine = `Keep my failed personal line ${viewport.name}`;
    modelResponse = { status: 503, text: "" };
    await send(page, failedLine);
    await page.locator("[data-ai-warning]").waitFor();
    assert.equal(
      await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
      failedLine,
    );
    assert.equal(heard(await town(page), failedLine), false);
    assert.equal(
      result.requests.length,
      3,
      "A failed personal request is never automatically retried",
    );
    assert.equal(await page.evaluate(() => globalThis.__personalHostedCalls.length), 0);
    result.personalFailureKeepsDraftWithoutHostedFallback = true;
    await page.getByRole("button", { name: "Check AI connection", exact: true }).click();
    await page
      .locator("[data-ai-connection-note]")
      .filter({ hasText: /settings are complete.*makes no model request/i })
      .waitFor();
    await page.locator("[data-ai-warning]").waitFor();
    await page.locator('[data-ai-status="unavailable"]').waitFor();
    assert.equal(
      result.requests.length,
      3,
      "A configuration-only check cannot transmit or clear the failed reply",
    );
    assert.equal(
      await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
      failedLine,
    );
    result.configurationCheckPreservesFailureWithoutReplay = true;

    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
    await help(page);
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await closeHelp(page);
    await openKevin(page);
    await send(page, "Who are you?");
    await page.waitForFunction(() =>
      /They answered with local dialogue/.test(
        document.querySelector(".mind-send-note")?.textContent || "",
      ),
    );
    assert.equal(
      result.requests.length,
      3,
      "Authored local dialogue sends no personal-model request",
    );
    result.offlineDialogueSuppressesPersonalRequests = true;
    assert.equal(
      await page.evaluate(() => globalThis.__personalHostedCalls.length),
      0,
      "Personal sources never fall back to hosted AI",
    );
    assert.deepEqual(result.networkLeaks, []);
    assert.deepEqual(result.errors, []);
    await context.close();
  }
} catch (error) {
  report.failures.push(error.stack || String(error));
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: join(out, "failure.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
