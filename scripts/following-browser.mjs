import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { followingFixture } from "./fixtures/following.mjs";
import { discussionMockModule } from "./discussion-auto-browser.mjs";
const target = new URL(process.env.GAME_FOLLOWING_QA_URL || "http://127.0.0.1:8096/");
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
const out = resolve(process.env.GAME_FOLLOWING_QA_OUT || "artifacts/following");
await mkdir(out, { recursive: true });
const report = {
  syntheticTransport: true,
  liveInferenceCalls: 0,
  followerInferenceCalls: 0,
  journeys: [],
  failures: [],
};
const source = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const load = (name) => source.ssrLoadModule(`/src/game/${name}.ts`);
const save = await load("save");
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const current = (t) => t.following?.sessions.at(-1);
const person = (t, id) => t.agents.find((a) => a.id === id);
async function waitState(page, state) {
  if (state === "paused") {
    await page.getByRole("button", { name: "Resume spending time", exact: true }).waitFor();
    return;
  }
  await page.waitForFunction(
    (state) =>
      JSON.parse(localStorage.getItem("the-game-town-v2")).town.following?.sessions.at(-1).state ===
      state,
    state,
  );
}
async function importTown(page, raw) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-following.json",
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
async function openCard(page, name) {
  await page.getByRole("button", { name: `View ${name}'s character card`, exact: true }).click();
}
async function closeCard(page) {
  const b = page.getByRole("button", { name: "Close conversation", exact: true });
  if (await b.isVisible()) await b.click();
}
async function start(page, name = "Arwyn", duration = "60", listen = true, result) {
  await openCard(page, name);
  assert.equal(await page.getByLabel("Time together", { exact: true }).inputValue(), "60");
  await page.getByLabel("Time together", { exact: true }).selectOption(duration);
  const box = page.getByLabel("Listen to public discussions they join", { exact: true });
  await box.setChecked(listen);
  const b = page.getByRole("button", { name: `Spend time with ${name}`, exact: true });
  assert.ok(await b.isEnabled());
  if (result) await shot(page, result, "start-controls");
  await b.click();
  await page.waitForFunction(
    () => !!JSON.parse(localStorage.getItem("the-game-town-v2")).town.following,
  );
}
async function resume(page) {
  await page.getByRole("button", { name: "Resume spending time", exact: true }).click();
  await page.waitForFunction(
    () =>
      !["paused", "ended"].includes(
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.following.sessions.at(-1).state,
      ),
  );
}
async function townLife(page) {
  await closeCard(page);
  const b = page.getByRole("button", { name: /Town life/ });
  if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
  await page.getByRole("button", { name: "Library meeting", exact: true }).click();
}
async function closeLife(page) {
  const b = page.getByRole("button", { name: "Close town life", exact: true });
  if (await b.isVisible()) await b.click();
}
async function heldSpeech(page) {
  await townLife(page);
  await page.getByLabel("Enable library meetings (experimental)", { exact: true }).check();
  const n = await page.evaluate(() => window.__discussionMock.calls.length);
  await page.getByRole("button", { name: "Request next AI decision", exact: true }).click();
  await page.waitForFunction((n) => window.__discussionMock.calls.length > n, n);
  return n;
}
async function respond(page, id, text) {
  await page.evaluate(
    ({ id, text }) =>
      window.__discussionMock.resolve(id, {
        ok: true,
        text: JSON.stringify({ task: "discussion", decision: { kind: "speak", text } }),
        diagnostics: { mode: "synthetic", attempts: 1, totalTokens: 12 },
      }),
    { id, text },
  );
  await page.clock.runFor(100);
  await page.waitForFunction(
    () =>
      !JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
        .pending,
  );
}
async function shot(page, result, name) {
  await page.clock.runFor(100);
  if (name === "retained-journal")
    await page.locator(".following-journal").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
  const path = join(out, `${result.viewport}-${result.scenario}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  result.screenshots.push(path);
}
const browser = await chromium.launch({ headless: true });
let active;
try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    for (const scenario of ["library", "leave-pending", "quiet", "save-recovery"]) {
      const result = {
        viewport: viewport.name,
        scenario,
        checks: [],
        screenshots: [],
        errors: [],
        providerRequests: [],
        transportKinds: [],
      };
      report.journeys.push(result);
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.name === "phone",
        acceptDownloads: true,
      });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== target.origin)
          return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        if (url.pathname.includes("_serverFn")) {
          result.providerRequests.push(url.pathname);
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"ok":false}',
          });
        }
        return route.continue();
      });
      await context.route("**/src/lib/mind.functions.ts*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: discussionMockModule.replace(
            "export function thinkTown({data}) {",
            "export function thinkTown({data}) { globalThis.__followingRecordTransport(data.kind);",
          ),
        }),
      );
      const page = (active = await context.newPage());
      await page.exposeFunction("__followingRecordTransport", (kind) =>
        result.transportKinds.push(kind),
      );
      page.on("pageerror", (e) => result.errors.push(e.message));
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.getByLabel("What do they call you?", { exact: true }).fill("Follow visitor");
      await page.getByLabel("Use local dialogue only", { exact: true }).uncheck();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      await page.waitForFunction(() => !!window.__game && !!window.__discussionMock);
      const { town } = await followingFixture(load, {
        meeting: scenario !== "quiet",
        target: scenario === "quiet" ? "sub" : "arwyn",
        late: scenario === "library",
      });
      if (scenario === "library") {
        const d = await load("discussions");
        const m = town.discussions.sessions.at(-1);
        const actor = m.members.find((a) => a.id === "arwyn");
        assert.equal(
          d.applyDiscussionCommand(town, "arwyn", {
            kind: "speak",
            text: "SYNTHETIC_BEFORE_ARRIVAL",
            meetingId: m.id,
            expectedRevision: actor.revision,
            commandId: "fixture-earlier",
          }).ok,
          true,
        );
        for (const member of m.members) if (member.id !== "arwyn") member.decisionNeeded = false;
      }
      await importTown(page, save.exportTown(town));
      await page.clock.install();
      await start(
        page,
        scenario === "quiet" ? "Sub" : "Arwyn",
        scenario === "quiet" ? "30" : "60",
        scenario !== "quiet",
        scenario === "library" ? result : undefined,
      );
      assert.equal(await page.evaluate(() => window.__discussionMock.allInvocations.length), 0);
      assert.equal(await page.locator("body").evaluate((e) => e.scrollWidth > innerWidth), false);
      const geometry = await page.evaluate(() => ({
        panel: document.querySelector(".following-panel").getBoundingClientRect().width,
        canvas: document.querySelector("canvas.town-canvas").getBoundingClientRect().width,
        viewport: innerWidth,
      }));
      assert.ok(geometry.panel > geometry.viewport * 0.7, JSON.stringify(geometry));
      assert.ok(geometry.canvas > geometry.viewport * 0.5, JSON.stringify(geometry));
      result.geometry = geometry;
      if (scenario === "library") {
        result.skinGeometry = [];
        for (const skin of ["original", "plaza-cream", "library-ink", "hobbs-hearth"]) {
          await page.getByLabel("Interface", { exact: true }).selectOption(skin);
          await page.clock.runFor(100);
          const geometry = await page.evaluate(() => ({
            panel: document.querySelector(".following-panel").getBoundingClientRect().width,
            height: document.querySelector(".following-panel").getBoundingClientRect().height,
            canvas: document.querySelector("canvas.town-canvas").getBoundingClientRect().width,
            viewport: innerWidth,
          }));
          assert.ok(
            geometry.panel > geometry.viewport * 0.7 &&
              geometry.height < 400 &&
              geometry.canvas > geometry.viewport * 0.5,
            JSON.stringify({ skin, ...geometry }),
          );
          result.skinGeometry.push({ skin, ...geometry });
        }
        const before = person(await stored(page), "player").tile;
        await page.getByRole("button", { name: "1×", exact: true }).click();
        await page.clock.runFor(1200);
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        const after = person(await stored(page), "player").tile;
        assert.notDeepEqual(after, before);
        assert.ok(Math.abs(before.x - after.x) + Math.abs(before.y - after.y) <= 3);
        await waitState(page, "listening");
        const id = await heldSpeech(page);
        await respond(page, id, "SYNTHETIC_WITNESSED_SOURCE_CHECK");
        await closeLife(page);
        const heard = current(await stored(page)).evidence.filter((e) => e.kind === "speech");
        assert.deepEqual(
          heard.map((e) => e.text),
          ["SYNTHETIC_WITNESSED_SOURCE_CHECK"],
        );
        result.checks.push(
          "Actual 1× movement reaches the discussion; journal excludes the pre-arrival line and retains the committed attributed reply",
        );
        await page.locator("canvas.town-canvas").focus();
        await page.keyboard.press("ArrowLeft");
        await page.clock.runFor(220);
        await waitState(page, "paused");
        await resume(page);
        if (viewport.name === "phone") {
          await page.getByRole("button", { name: "East", exact: true }).tap();
          await page.clock.runFor(180);
          await waitState(page, "paused");
          await resume(page);
        }
        await townLife(page);
        await page.getByRole("button", { name: "Go to library", exact: true }).click();
        await page.clock.runFor(200);
        await waitState(page, "paused");
        result.checks.push(
          "Keyboard and clicked destination revoke movement immediately; the phone also uses a real touch tap; explicit Resume is required each time",
        );
        await resume(page);
        const journal = current(await stored(page)).evidence;
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!window.__game);
        await waitState(page, "paused");
        assert.deepEqual(current(await stored(page)).evidence, journal);
        await page.getByText(/Companion journal \(/).click();
        await shot(page, result, "retained-journal");
        await resume(page);
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Download town", exact: true }).click(),
        ]);
        const { readFile } = await import("node:fs/promises");
        const bytes = await readFile(await download.path(), "utf8");
        await importTown(page, bytes);
        await waitState(page, "paused");
        assert.deepEqual(current(await stored(page)).evidence, journal);
        await page.getByRole("button", { name: "Stop spending time", exact: true }).click();
        await waitState(page, "ended");
        result.checks.push(
          "Reload and ordinary export/import preserve excerpts and revoke authority; Stop ends locally with history",
        );
      } else if (scenario === "leave-pending") {
        const id = await heldSpeech(page);
        await closeLife(page);
        await page.getByRole("button", { name: "Stop spending time", exact: true }).click();
        await waitState(page, "ended");
        assert.equal(
          await page.evaluate((id) => window.__discussionMock.pending.has(id), id),
          true,
        );
        await respond(page, id, "SYNTHETIC_AFTER_STOP");
        const t = await stored(page);
        assert.equal(current(t).evidence.filter((e) => e.kind === "speech").length, 0);
        assert.equal(
          t.discussions.sessions.at(-1).utterances.at(-1).recipientIds.includes("player"),
          false,
        );
        result.checks.push(
          "Stop works while speaker transport is pending; committed reply excludes the former follower and enters no journal",
        );
        await shot(page, result, "stopped-pending");
      } else if (scenario === "quiet") {
        await page.getByRole("button", { name: "4×", exact: true }).click();
        await page.clock.runFor(8000);
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await waitState(page, "ended");
        assert.equal(current(await stored(page)).duration, 30);
        assert.equal(
          current(await stored(page)).evidence.filter((e) => e.kind === "speech").length,
          0,
        );
        assert.equal(await page.evaluate(() => window.__discussionMock.allInvocations.length), 0);
        await page.getByText(/Companion journal \(/).click();
        await page
          .getByText("No discussion words were received during this session.", { exact: true })
          .waitFor();
        await shot(page, result, "honest-quiet-journal");
        result.checks.push(
          "Second target Sub completes a 30-minute quiet visit with an honest journal and zero inference",
        );
      } else {
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await waitState(page, "paused");
        await page.evaluate(() => {
          delete document.visibilityState;
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.clock.runFor(200);
        await waitState(page, "paused");
        await resume(page);
        const raw = await page.evaluate(() => localStorage.getItem("the-game-town-v2"));
        await page.evaluate((raw) => localStorage.setItem("the-game-town-v2", raw + " "), raw);
        await page.getByRole("button", { name: "Stop spending time", exact: true }).click();
        await page.getByRole("button", { name: "Load saved town", exact: true }).waitFor();
        assert.equal(
          await page.evaluate(() => localStorage.getItem("the-game-town-v2")),
          raw + " ",
        );
        await shot(page, result, "conflict");
        await page.getByRole("button", { name: "Load saved town", exact: true }).click();
        await waitState(page, "paused");
        const corrupt = JSON.parse(raw);
        corrupt.town.following.version = 99;
        const corruptRaw = JSON.stringify(corrupt);
        await page.evaluate((raw) => localStorage.setItem("the-game-town-v2", raw), corruptRaw);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page
          .getByRole("button", { name: "Download the full unreadable save", exact: true })
          .waitFor();
        assert.equal(
          await page.evaluate(() => localStorage.getItem("the-game-town-v2")),
          corruptRaw,
        );
        await shot(page, result, "malformed-recovery");
        result.checks.push(
          "Page hiding suspends and stays suspended after restore; save conflict and malformed extension preserve exact canonical recovery bytes",
        );
      }
      const expectedSpeakerCalls = ["library", "leave-pending"].includes(scenario) ? 1 : 0;
      assert.deepEqual(result.transportKinds, Array(expectedSpeakerCalls).fill("act"));
      result.syntheticSpeakerCalls = result.transportKinds.length;
      report.followerInferenceCalls += result.transportKinds.length - expectedSpeakerCalls;
      assert.deepEqual(result.providerRequests, []);
      assert.deepEqual(result.errors, []);
      await context.close();
      active = null;
    }
  }
} catch (error) {
  report.failures.push(error.stack ?? String(error));
  if (active) {
    await active.screenshot({ path: join(out, "failure.png"), fullPage: true }).catch(() => {});
    await writeFile(join(out, "failure.html"), await active.content());
  }
  process.exitCode = 1;
} finally {
  await writeFile(join(out, "browser.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await source.close();
}
