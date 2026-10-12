#!/usr/bin/env node
// Explicit opt-in only. Uses synthetic towns in isolated Chromium contexts.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
if (!process.argv.includes("--run")) {
  console.log(
    "Run with --run against a configured local preview. Up to 13 live requests; no automatic retries. Results: artifacts/live-seven/.",
  );
  process.exit(0);
}
const url = process.env.LIVE_TOWN_URL || "http://127.0.0.1:8082/";
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/);
const out = process.env.LIVE_TOWN_OUT || "artifacts/live-seven";
assert.ok(out.startsWith("artifacts/") && !out.split("/").includes(".."));
await mkdir(out, { recursive: true });
const scenarios = {
  kevin: ["Have I been paid my wages today?", "What about yesterday?"],
  arwyn: [
    "Could I help you sort some library records?",
    "No thanks. I do not want to take on a task.",
  ],
  northern: ["Could I give you a hand with something?", "How long would that take?"],
  baba: ["What stock do you have in the shop?", "How would we check it?"],
  sub: ["Could I help you with a story?"],
  data: ["Could you help me check whether an idea would work?", "What would a small test involve?"],
  amelia: [
    "Hi, would you like to have coffee with me?",
    "I just hoped we could get to know each other better.",
  ],
};
const report = {
  url,
  startedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  screenshots: [],
};
const browser = await chromium.launch({ headless: true });
let lastStarted = 0;
const townOf = (page) =>
  page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("the-game-town-v2"));
    return value.town ?? value;
  });
const actor = (town, id) => town.agents.find((a) => a.id === id);
async function importTown(page, town) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-live-town.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(town)),
  });
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
}
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByLabel("What do they call you?", { exact: true }).fill("Synthetic QA");
  await page.getByRole("button", { name: "Walk in", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__game));
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator(".status-strip .badge").waitFor();
  assert.notEqual(
    (await page.locator(".status-strip .badge").innerText()).toLowerCase(),
    "local replies",
    "provider must be configured",
  );
  let town = await townOf(page);
  town.paused = true;
  town.day = 2;
  town.minute = 20 * 60 + 58;
  town.guide = 3;
  town.sawHint = true;
  for (const day of [1, 2])
    actor(town, "player").memories.push({
      id: `m${town.nextId++}`,
      day,
      minute: 18 * 60 + 59,
      type: "favor",
      source: "event",
      text: "Hobbs Cafe paid me 5 for a shift I actually worked.",
      importance: 9,
      keywords: ["paid", "shift"],
      protected: true,
    });
  await importTown(page, town);
  const selected = process.env.LIVE_TOWN_AGENTS?.split(",") || Object.keys(scenarios);
  assert.ok(selected.every((id) => Object.hasOwn(scenarios, id)));
  for (const [id, questions] of Object.entries(scenarios).filter(([id]) => selected.includes(id))) {
    town = await townOf(page);
    const resident = actor(town, id);
    actor(town, "player").tile = await page.evaluate(
      ({ tile, occupied }) =>
        [
          { x: tile.x + 1, y: tile.y },
          { x: tile.x - 1, y: tile.y },
          { x: tile.x, y: tile.y + 1 },
          { x: tile.x, y: tile.y - 1 },
        ].find(
          (p) =>
            window.__game.tile(p.x, p.y)?.block === false &&
            !occupied.some((q) => q.x === p.x && q.y === p.y),
        ),
      {
        tile: resident.tile,
        occupied: town.agents.filter((a) => a.id !== "player").map((a) => a.tile),
      },
    );
    assert.ok(actor(town, "player").tile);
    await importTown(page, town);
    await page.evaluate((id) => window.__game.open(id), id);
    const input = page.getByLabel(`Your line to ${resident.name}`, { exact: true });
    await input.waitFor();
    for (const question of questions) {
      // Respect conservative shared-account allocation rather than bypassing it.
      const delay = Math.max(0, 32000 - (Date.now() - lastStarted));
      if (delay) await page.waitForTimeout(delay);
      const before = await townOf(page),
        priorIds = new Set(actor(before, id).memories.map((m) => m.id));
      const responses = [];
      const listener = async (response) => {
        try {
          const value = await response.json();
          if (value && JSON.stringify(value).includes("diagnostics")) responses.push(value);
        } catch {
          /* Non-JSON assets are not diagnostics. */
        }
      };
      page.on("response", listener);
      await input.fill(question);
      lastStarted = Date.now();
      await page.getByRole("button", { name: "Say it", exact: true }).click();
      await page.waitForFunction(
        ({ id, ids }) => {
          const t = JSON.parse(localStorage.getItem("the-game-town-v2")).town;
          return t.agents
            .find((a) => a.id === id)
            .memories.some((m) => m.type === "chat" && m.with === "player" && !ids.includes(m.id));
        },
        { id, ids: [...priorIds] },
        { timeout: 45000 },
      );
      const after = await townOf(page);
      const memory = actor(after, id).memories.find(
        (m) => m.type === "chat" && m.with === "player" && !priorIds.has(m.id),
      );
      const reply = memory.turns.findLast((t) => t.speaker === id)?.text;
      page.off("response", listener);
      const row = {
        id,
        question,
        reply,
        source: memory.mind,
        elapsedMs: Date.now() - lastStarted,
        rpcDiagnostics: responses,
      };
      report.checks.push(row);
      console.log(JSON.stringify({ id, source: row.source, elapsedMs: row.elapsedMs, reply }));
      assert.equal(memory.mind, "grok", "every baseline answer must be applied live AI");
      assert.ok(reply);
      assert.deepEqual(after.favors, before.favors);
      assert.deepEqual(
        after.agents.map((a) => a.money),
        before.agents.map((a) => a.money),
      );
      assert.deepEqual(actor(after, "player").projects, actor(before, "player").projects);
      if (id === "kevin")
        assert.match(reply, question.includes("yesterday") ? /day 1|yesterday/i : /day 2|today/i);
      assert.ok((await page.locator(".mind-body").innerText()).includes(reply));
      await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
    }
    const shot = `${out}/${id}.png`;
    await page.screenshot({ path: shot });
    report.screenshots.push(shot);
    await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  }
  const before = await townOf(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__game));
  const after = await townOf(page);
  for (const a of before.agents)
    assert.deepEqual(
      actor(after, a.id).memories.filter((m) => m.type === "chat"),
      a.memories.filter((m) => m.type === "chat"),
    );
  report.reloadPreserved = true;
  report.success = true;
  assert.equal(report.errors.length, 0);
  await context.close();
} catch (error) {
  report.success = false;
  report.failure = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
}
