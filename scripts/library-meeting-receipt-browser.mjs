import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

// Render an existing actual-AI trial receipt in a disposable browser. This does
// not generate decisions, edit the input town, attach to an account or publish.
const inputPath = resolve(process.argv[2] || process.env.MEETING_RECEIPT_TOWN || "");
assert.ok(
  process.argv[2] || process.env.MEETING_RECEIPT_TOWN,
  "Provide the actual final-town.json path",
);
const input = await readFile(inputPath, "utf8");
const digest = (text) => createHash("sha256").update(text).digest("hex");
const originalHash = digest(input);
const box = JSON.parse(input);
const town = box.town ?? box;
const session = town.discussions?.sessions.at(-1);
assert.ok(session, "The input must contain an actual saved meeting");
assert.equal(
  session.pending,
  null,
  "Capture only a settled final meeting, not an in-flight request",
);
const target = new URL(process.env.MEETING_RECEIPT_URL || "http://127.0.0.1:8134/");
assert.equal(target.protocol, "http:");
assert.ok(
  ["127.0.0.1", "localhost"].includes(target.hostname),
  "Only a loopback preview is supported",
);
const out = resolve(process.env.MEETING_RECEIPT_OUT || "artifacts/library-meeting-receipt");
await mkdir(out, { recursive: true });
const report = {
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  inputPath,
  inputSha256: originalHash,
  target: target.href,
  actualSavedDialogue: true,
  generatedDialogue: false,
  liveModelCalls: 0,
  meetingId: session.id,
  facilitator: session.facilitator,
  meetingStatus: session.status,
  utterances: session.utterances.map(({ id, seq, speaker, text, at }) => ({
    id,
    seq,
    speaker,
    text,
    at,
  })),
  journeys: [],
  failures: [],
};
const readonlyMind = `
globalThis.__meetingReceiptTransport={attempts:0,capabilityChecks:0};
export async function mindAvailability(){globalThis.__meetingReceiptTransport.capabilityChecks++;return {online:false,configured:false,actions:false};}
export async function thinkTown(){globalThis.__meetingReceiptTransport.attempts++;throw new Error('Receipt capture blocks all inference');}
`;
const browser = await chromium.launch({ headless: true });
let activePage;
try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = {
      viewport,
      blockedExternal: [],
      blockedRpc: [],
      blockedSockets: 0,
      errors: [],
      clockPausedThroughUi: false,
    };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== target.origin) {
        result.blockedExternal.push({ origin: url.origin, type: request.resourceType() });
        return route.abort("blockedbyclient");
      }
      if (
        url.pathname.includes("_serverFn") ||
        url.pathname.startsWith("/api/") ||
        !["GET", "HEAD"].includes(request.method()) ||
        ["fetch", "xhr"].includes(request.resourceType())
      ) {
        result.blockedRpc.push({ path: url.pathname, method: request.method() });
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"ok":false,"error":"receipt-readonly"}',
        });
      }
      return route.continue();
    });
    await context.route("**/src/lib/mind.functions.ts*", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: readonlyMind }),
    );
    await context.routeWebSocket("**/*", (socket) => {
      result.blockedSockets++;
      socket.close({ code: 1000, reason: "Read-only receipt capture" });
    });
    await context.addInitScript(
      ({ origin, raw }) => {
        if (location.origin !== origin) return;
        localStorage.setItem("the-game-town-v2", raw);
        localStorage.setItem("the-game-local-dialogue-only", "false");
        localStorage.setItem("the-game-library-meeting-prototype", "false");
      },
      { origin: target.origin, raw: input },
    );
    const page = (activePage = await context.newPage());
    page.on("pageerror", (error) => result.errors.push(error.message));
    await page.goto(target.href, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    result.clockPausedThroughUi = true;
    await page.waitForFunction(() =>
      Boolean(window.__game && globalThis.__meetingReceiptTransport),
    );
    await page.getByRole("button", { name: /^Town life/ }).click();
    await page.getByRole("button", { name: "Library meeting", exact: true }).click();
    await page.getByText(session.topic, { exact: true }).waitFor();
    const current = await page.evaluate(
      () => JSON.parse(localStorage.getItem("the-game-town-v2")).town,
    );
    assert.deepEqual(
      current.discussions,
      town.discussions,
      "Viewing and pausing the clock must preserve every meeting choice, utterance and recipient receipt",
    );
    const lines = await page
      .locator(".discussion-transcript ol li > p:last-child")
      .allTextContents();
    assert.deepEqual(
      lines,
      session.utterances.map((line) => line.text),
      "Only the actual saved words may appear",
    );
    result.playerState = session.members.find((member) => member.id === "player");
    result.explanation = await page.locator(".discussion-body > .character-note").allTextContents();
    result.visibleWordsMatchSaved = true;
    result.receiptsUnchanged = true;
    result.viewportWidth = await page.evaluate(() => innerWidth);
    result.documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(result.documentWidth, viewport.width, "Receipt must fit the viewport");
    await page.screenshot({ path: join(out, `${viewport.name}-overview.png`), fullPage: false });
    await page.getByText("Recorded discussion", { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(
      await page.locator(".discussion-body").evaluate((element) => element.clientHeight >= 180),
      "Collapsed composer must retain reading space",
    );
    await page.screenshot({ path: join(out, `${viewport.name}-transcript.png`), fullPage: false });
    if (session.utterances.length) {
      await page.locator(".discussion-transcript").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.screenshot({
        path: join(out, `${viewport.name}-latest-turn.png`),
        fullPage: false,
      });
    }
    const transport = await page.evaluate(() => globalThis.__meetingReceiptTransport);
    assert.equal(transport.attempts, 0, "Receipt capture must attempt no inference");
    result.transport = transport;
    assert.deepEqual(result.errors, []);
    await context.close();
  }
} catch (error) {
  report.failures.push(error.stack || String(error));
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => {});
} finally {
  report.inputUnchanged = digest(await readFile(inputPath, "utf8")) === originalHash;
  if (!report.inputUnchanged)
    report.failures.push("The source town changed during receipt capture");
  await writeFile(join(out, "browser-receipt.json"), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(
  JSON.stringify(
    {
      out,
      meetingId: session.id,
      turns: session.utterances.length,
      inputUnchanged: report.inputUnchanged,
      liveModelCalls: 0,
      failures: report.failures,
    },
    null,
    2,
  ),
);
if (report.failures.length) process.exitCode = 1;
