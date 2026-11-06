import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { followingFixture } from "./fixtures/following.mjs";
const target = new URL(process.env.GAME_LEARNING_QA_URL || "http://127.0.0.1:8097/");
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
const out = resolve(process.env.GAME_LEARNING_QA_OUT || "artifacts/follower-learning");
await mkdir(out, { recursive: true });
const report = {
  syntheticTransport: true,
  liveInferenceCalls: 0,
  journeys: [],
  failures: [],
  limits: [
    "Scripted decisions test execution and accounting; they do not qualify live-model learning or provider behaviour",
    "Chromium emulated sizes; F1 human/device acceptance remains open",
  ],
};
const transport = `
export async function mindAvailability(){return {online:true,configured:true,actions:true};}
const mock=globalThis.__learningMock??={calls:[],pending:new Map(),resolve(id,result){const row=this.pending.get(id);if(row){this.pending.delete(id);row.resolve(result);}}};
export function thinkTown({data}){const id=mock.calls.length;let packet;try{packet=JSON.parse(data.user.slice(data.user.lastIndexOf('\\n')+1));}catch{}mock.calls.push({id,kind:data.kind,packet});globalThis.__recordLearningCall({kind:data.kind,purpose:packet?.purpose,actor:packet?.attribution?.actor,privateLeak:data.user.includes('PRIVATE_LEARNING_CANARY')});return new Promise(resolve=>mock.pending.set(id,{resolve}));}
`;
const source = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const load = (n) => source.ssrLoadModule(`/src/game/${n}.ts`);
const save = await load("save");
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const session = (t) => t.followerLearning?.sessions.at(-1);
async function importTown(page, raw) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-learning.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(() => !!window.__game);
}
async function openLesson(page) {
  const d = page.locator(".learning-panel");
  if (!(await d.evaluate((e) => e.open))) await d.locator(":scope > summary").click();
  return d;
}
async function begin(page) {
  await page.getByRole("button", { name: "View Arwyn's character card", exact: true }).click();
  assert.equal(await page.getByLabel("Time together", { exact: true }).inputValue(), "60");
  await page.getByRole("button", { name: "Spend time with Arwyn", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("the-game-town-v2")).town.following?.sessions.at(-1).state ===
      "listening",
  );
  assert.equal(await page.evaluate(() => window.__learningMock.calls.length), 0);
  await openLesson(page);
  await page.getByRole("button", { name: "Enable Ask and learn", exact: true }).click();
  await page.waitForFunction(
    () => !!JSON.parse(localStorage.getItem("the-game-town-v2")).town.followerLearning,
  );
  assert.equal((await stored(page)).paused, true);
}
const labels = {
  "baseline-plan": "Inspect before instruction",
  "baseline-submit": "Submit before-instruction attempt",
  invite: "Ask about teaching",
  question: "Generate next question",
  answer: "Request the resident’s answer",
  "after-plan": "Inspect fresh practice case",
  "after-submit": "Submit fresh practice attempt",
  "transfer-plan": "Inspect changed case",
  "transfer-submit": "Submit changed-case attempt",
  reflection: "End lesson and reflect",
};
async function held(page, purpose) {
  await page.clock.fastForward(31100);
  const count = await page.evaluate(() => window.__learningMock.calls.length);
  await page.getByRole("button", { name: labels[purpose], exact: true }).click();
  await page.waitForFunction((count) => window.__learningMock.calls.length > count, count);
  const call = await page.evaluate(() => window.__learningMock.calls.at(-1));
  assert.equal(call.kind, "act");
  assert.equal(call.packet.purpose, purpose);
  return call;
}
function decision(call, options = {}) {
  const packet = call.packet,
    purpose = packet.purpose;
  if (purpose.endsWith("-plan")) return { kind: "inspect", boxes: ["Birch", "Alder", "Cedar"] };
  if (purpose.endsWith("-submit")) {
    const obs = packet.practice,
      found = obs.observations.find((o) => o.text.includes(`contains ${obs.recordId}.`));
    assert.ok(found);
    const correct =
      purpose === "baseline-submit"
        ? false
        : purpose === "transfer-submit"
          ? !options.failTransfer
          : true;
    return {
      kind: "submit",
      box: found.id.split(":").at(-1),
      historicalDate: correct ? "unconfirmed" : "confirmed",
      evidenceIds: [found.id],
    };
  }
  if (purpose === "invite")
    return {
      kind: options.refuse ? "decline" : "accept",
      text: options.refuse
        ? "I am not taking on teaching today."
        : "I can show you how to verify a stable box reference and keep dates uncertain.",
      sourceIds: [packet.publicCardVisibleHere.id],
    };
  if (purpose === "question") {
    const n = packet.previousQuestions.length;
    const source = packet.sources.find((s) => s.id.endsWith(n ? ":answer:1" : ":method-card"));
    assert.ok(source);
    return {
      kind: "question",
      text: n
        ? "What independent evidence would establish a historical date?"
        : "How should I check a current reference before using it?",
      sourceIds: [source.id],
    };
  }
  if (purpose === "answer") {
    const q = packet.sources.filter((s) => s.id.includes(":question:")).at(-1);
    assert.ok(q);
    return {
      kind: "answer",
      text: "Inspect the stable box contents; an uncertain date still needs independent dated evidence.",
      sourceIds: [q.id],
    };
  }
  const source = packet.sources.find((s) => s.id.endsWith(":method-card")) ?? packet.sources.at(-1);
  assert.ok(source);
  return {
    kind: "reflect",
    text: "These practice outcomes are limited evidence. I cannot claim general mastery.",
    sourceIds: [source.id],
  };
}
async function respond(page, call, options = {}) {
  const response = options.unavailable
    ? { ok: false, error: "slow" }
    : {
        ok: true,
        text: JSON.stringify({ task: "follower-learning", decision: decision(call, options) }),
        diagnostics: {
          attempts: 1,
          totalTokens: 24,
          mode: "synthetic",
          provider: "synthetic",
          model: "synthetic-reference-v1",
          maxOutputTokens: 900,
        },
      };
  await page.evaluate(({ id, response }) => window.__learningMock.resolve(id, response), {
    id: call.id,
    response,
  });
  await page.clock.runFor(100);
  await page.waitForFunction(() => {
    const s = JSON.parse(
      localStorage.getItem("the-game-town-v2"),
    ).town.followerLearning?.sessions.at(-1);
    return s && !s.calls.some((c) => c.status === "pending");
  });
}
async function perform(page, purpose, options) {
  const call = await held(page, purpose);
  await respond(page, call, options);
  return call;
}
async function baseline(page) {
  await perform(page, "baseline-plan");
  await perform(page, "baseline-submit");
}
async function shot(page, result, name, selector) {
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
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
    for (const scenario of [
      "complete",
      "decline",
      "exhaustion",
      "late-takeover",
      "practice-failure",
      "reload-pending",
    ]) {
      const result = {
        viewport: viewport.name,
        scenario,
        checks: [],
        calls: [],
        errors: [],
        providerRequests: [],
        screenshots: [],
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
        route.fulfill({ status: 200, contentType: "application/javascript", body: transport }),
      );
      const page = (active = await context.newPage());
      await page.exposeFunction("__recordLearningCall", (call) => result.calls.push(call));
      page.on("pageerror", (e) => result.errors.push(e.message));
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.getByLabel("What do they call you?", { exact: true }).fill("Learning visitor");
      await page.getByLabel("Use local dialogue only", { exact: true }).uncheck();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      await page.waitForFunction(() => !!window.__game && !!window.__learningMock);
      const { town } = await followingFixture(load, { name: "Learning visitor" });
      const { makeMemory, pushMemory } = await load("memory");
      for (const id of ["player", "arwyn"]) {
        const actor = town.agents.find((a) => a.id === id);
        pushMemory(
          actor,
          makeMemory(town, town.day, town.minute, "observe", `PRIVATE_LEARNING_CANARY_${id}`, 5, {
            source: "reflection",
          }),
        );
      }
      await importTown(page, save.exportTown(town));
      await page.clock.install();
      await begin(page);
      assert.equal(result.calls.length, 0);
      result.checks.push(
        "F1 starts and listens with zero inference; Ask and learn is a separate explicit grant",
      );
      if (scenario === "complete" || scenario === "practice-failure") {
        await shot(page, result, "setup", ".learning-panel > summary");
        await baseline(page);
        await perform(page, "invite");
        if (scenario === "complete")
          for (let n = 0; n < 2; n++) {
            await perform(page, "question");
            await perform(page, "answer");
          }
        await perform(page, "after-plan");
        await perform(page, "after-submit");
        await perform(page, "transfer-plan");
        await perform(page, "transfer-submit", { failTransfer: scenario === "practice-failure" });
        const before = session(await stored(page));
        assert.equal(before.trials[0].result.correct, false);
        assert.equal(before.trials[1].result.correct, true);
        assert.equal(before.trials[2].result.correct, scenario === "complete");
        assert.ok(before.trials.every((t) => t.attempts === 2));
        await perform(page, "reflection");
        const completed = session(await stored(page));
        assert.equal(completed.status, "ended");
        assert.equal(completed.reflected, true);
        assert.equal(completed.questions, scenario === "complete" ? 2 : 0);
        assert.equal(result.calls.length, scenario === "complete" ? 12 : 8);
        await page.getByRole("heading", { name: "Practice comparison", exact: true }).waitFor();
        const text = await page.locator('[aria-label="Practice comparison"]').innerText();
        assert.match(text, scenario === "complete" ? /This run improved/ : /did not demonstrate/);
        assert.equal(await page.locator("body").evaluate((e) => e.scrollWidth > innerWidth), false);
        await shot(page, result, "comparison", '[aria-label="Practice comparison"]');
        const retained = completed.receipts;
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!window.__game);
        await page.getByRole("button", { name: "Resume spending time", exact: true }).waitFor();
        await openLesson(page);
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Download town", exact: true }).click(),
        ]);
        const raw = await readFile(await download.path(), "utf8");
        const restored = save.parseTownFile(raw);
        assert.ok(restored);
        assert.deepEqual(session(restored).receipts, retained);
        assert.equal(restored.following.sessions.at(-1).state, "paused");
        await importTown(page, raw);
        await page.getByRole("button", { name: "Resume spending time", exact: true }).waitFor();
        result.checks.push(
          "Distinct before/after/changed cases use two requests each; deterministic inspections score actual submissions; interpretation stays separate; reload/export/import retain the same evidence without authority",
        );
      } else if (scenario === "decline") {
        await baseline(page);
        await perform(page, "invite", { refuse: true });
        const s = session(await stored(page));
        assert.equal(s.consent, "declined");
        assert.equal(s.method, undefined);
        assert.equal(
          await page.getByRole("button", { name: "Generate next question", exact: true }).count(),
          0,
        );
        assert.equal(result.calls.length, 3);
        await shot(page, result, "refusal", ".learning-panel > summary");
        result.checks.push(
          "Resident refusal creates one attributed line and no teaching method, question, practice permission or rapport reward",
        );
      } else if (scenario === "exhaustion") {
        const call = await held(page, "baseline-plan");
        await respond(page, call, { unavailable: true });
        const s = session(await stored(page));
        assert.equal(s.status, "paused");
        assert.equal(s.calls[0].status, "unavailable");
        assert.equal(s.calls[0].usage.attemptsUnknown, 1);
        await page.clock.fastForward(120000);
        assert.equal(result.calls.length, 1);
        await shot(page, result, "capacity", ".learning-panel > summary");
        result.checks.push(
          "Synthetic capacity denial pauses without invented results, refunds or retries; attempt uncertainty remains visible",
        );
      } else if (scenario === "late-takeover") {
        await baseline(page);
        await perform(page, "invite");
        const call = await held(page, "question");
        const prior = (await stored(page)).discussions.sessions.at(-1).utterances.length;
        if (viewport.name === "phone")
          await page.getByRole("button", { name: "West", exact: true }).tap();
        else {
          await page.locator("canvas.town-canvas").focus();
          await page.keyboard.press("ArrowLeft");
        }
        await page.clock.runFor(200);
        await page.getByRole("button", { name: "Resume spending time", exact: true }).waitFor();
        await respond(page, call);
        const s = session(await stored(page));
        assert.equal(s.questions, 0);
        assert.equal(s.status, "paused");
        assert.equal(s.calls.at(-1).status, "interrupted");
        assert.equal((await stored(page)).discussions.sessions.at(-1).utterances.length, prior);
        await openLesson(page);
        await shot(page, result, "late-rejected", ".learning-panel > summary");
        await page.getByRole("button", { name: "Resume spending time", exact: true }).click();
        await page.getByRole("button", { name: "Resume Ask and learn", exact: true }).click();
        await page.clock.runFor(100);
        assert.equal(result.calls.length, 4);
        const second = await held(page, "question");
        await page.getByRole("button", { name: "Go somewhere", exact: true }).click();
        await page.getByRole("button", { name: "Library", exact: true }).click();
        await page.clock.runFor(200);
        await respond(page, second);
        assert.equal(session(await stored(page)).questions, 0);
        assert.equal(result.calls.length, 5);
        result.checks.push(
          "Keyboard (desktop), touch (phone) and clicked destination revoke pending player participation immediately; late questions add no speech; Resume is explicit and never dispatches",
        );
      } else {
        await held(page, "baseline-plan");
        assert.equal(result.calls.length, 1);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!window.__game);
        await page.getByRole("button", { name: "Resume spending time", exact: true }).waitFor();
        await openLesson(page);
        await page.getByRole("button", { name: "Resume Ask and learn", exact: true }).waitFor();
        await page.clock.fastForward(120000);
        assert.equal(result.calls.length, 1);
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Download town", exact: true }).click(),
        ]);
        const restored = save.parseTownFile(await readFile(await download.path(), "utf8"));
        assert.ok(restored);
        assert.equal(session(restored).calls[0].status, "interrupted");
        assert.equal(session(restored).calls[0].usage.attemptsUnknown, 1);
        await shot(page, result, "pending-restored", ".learning-panel > summary");
        result.checks.push(
          "Reload of a pending learner action keeps unknown usage and the used slot; neither movement nor inference resumes",
        );
      }
      assert.ok(result.calls.every((c) => c.kind === "act" && !c.privateLeak));
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.providerRequests, []);
      result.attribution = {
        speaker: result.calls.filter((c) => c.actor !== "player").length,
        learner: result.calls.filter((c) => c.actor === "player").length,
      };
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
