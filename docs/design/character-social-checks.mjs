import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../..", import.meta.url));
const out = join(root, "artifacts/social-ui");
await mkdir(out, { recursive: true });
const url = process.env.SOCIAL_QA_URL || "http://127.0.0.1:8093/";
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/);
const source = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { createTown } = await source.ssrLoadModule("/src/game/town.ts");
const { applyResult } = await source.ssrLoadModule("/src/game/effects.ts");
const { ANCHORS } = await source.ssrLoadModule("/src/game/world.ts");
const { exportTown } = await source.ssrLoadModule("/src/game/save.ts");
const town = createTown("QA resident");
const person = (id) => town.agents.find((a) => a.id === id);
town.minute = 735;
town.paused = true;
town.guide = 4;
town.sawHint = true;
person("kevin").tile = { ...ANCHORS.cafe };
person("amelia").tile = { x: ANCHORS.cafe.x + 1, y: ANCHORS.cafe.y };
person("player").tile = { x: ANCHORS.cafe.x, y: ANCHORS.cafe.y + 1 };
applyResult(town, {
  kind: "talk",
  mind: "offline",
  a: "kevin",
  b: "amelia",
  lines: [
    { speaker: "kevin", text: "Can the cafe help with the library?" },
    { speaker: "amelia", text: "Let us name the cost before promising money." },
  ],
  relationships: [
    { owner: "kevin", about: "amelia", delta: 1, note: "Amelia made the terms clear." },
  ],
});
town.scrub = [
  {
    d: 1,
    m: 735,
    p: town.agents.flatMap((a) => [a.tile.x, a.tile.y]),
    ids: town.agents.map((a) => a.id),
  },
];
town.minute = 740;
person("arwyn").tile = { ...ANCHORS.library };
person("data").tile = { x: ANCHORS.library.x + 1, y: ANCHORS.library.y };
applyResult(town, {
  kind: "talk",
  mind: "offline",
  a: "arwyn",
  b: "data",
  lines: [
    { speaker: "arwyn", text: "The catalogue gives two different dates." },
    { speaker: "data", text: "Let us check the source before choosing one." },
  ],
  relationships: [
    { owner: "arwyn", about: "data", delta: 1, note: "Data proposed checking the source." },
  ],
  replan: [
    {
      id: "data",
      blocks: [
        { from: 0, to: 24, place: "library", spot: "out", status: "checking the original source" },
      ],
    },
  ],
});
town.minute = 1080;
applyResult(town, {
  kind: "reflect",
  mind: "offline",
  agents: [
    {
      id: "arwyn",
      reflections: [
        "Data suggested checking the original source. I still need to verify the date.",
      ],
    },
  ],
});
const seed = exportTown(town);
await source.close();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [label, width, height, touch] of [
    ["desktop", 1280, 800, false],
    ["mobile", 390, 844, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      acceptDownloads: true,
    });
    await context.addInitScript((text) => {
      if (!localStorage.getItem("the-game-town-v2")) localStorage.setItem("the-game-town-v2", text);
    }, seed);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole("navigation", { name: "Town residents" }).waitFor();
    const strip = page.getByRole("navigation", { name: "Town residents" });
    assert.equal(await strip.getByRole("button").count(), 8);
    const canvas = page.locator(".town-canvas");
    await page.waitForFunction(
      () => document.querySelector(".town-canvas")?.dataset.camx !== undefined,
    );
    const point = await canvas.evaluate((element) => {
      const raw = JSON.parse(localStorage.getItem("the-game-town-v2"));
      const current = raw.town ?? raw;
      const kevin = current.agents.find((a) => a.id === "kevin");
      return {
        x: kevin.tile.x * 32 + 16 - Number(element.dataset.camx),
        y: kevin.tile.y * 32 + 16 - Number(element.dataset.camy),
      };
    });
    await canvas.click({ position: point });
    const crowd = page.getByRole("group", { name: "Who is here" });
    if (await crowd.isVisible())
      await crowd.getByRole("button", { name: "Talk with Kevin", exact: true }).click();
    await page.getByRole("complementary", { name: "Talk with Kevin" }).waitFor();
    await page.getByRole("button", { name: "Close conversation" }).click();
    await page.locator(".conversation-caption").waitFor();
    await page
      .locator(".conversation-caption")
      .getByRole("button", { name: "Next", exact: true })
      .click();
    assert.match(await page.locator(".conversation-caption > p").textContent(), /name the cost/);
    await page.screenshot({ path: join(out, `${label}-captions.png`) });
    await page.getByRole("button", { name: /Town life/ }).click();
    const social = page.getByRole("complementary", { name: "Town life" });
    assert.match(await social.textContent(), /Amelia made the terms clear/);
    assert.match(await social.textContent(), /0 → 1/);
    const watch = social.getByRole("checkbox", { name: "Watch town conversations" });
    await watch.check();
    await social.getByRole("button", { name: /Arwyn ↔ Data/ }).click();
    assert.match(
      await social.locator(".social-exchange").textContent(),
      /check the source before choosing/,
    );
    assert.match(await social.locator(".social-exchange").textContent(), /Plans updated/);
    await social.getByRole("checkbox", { name: "Show later reflections" }).check();
    assert.match(
      await social.locator(".social-reflection").textContent(),
      /need to verify the date/,
    );
    await page.screenshot({ path: join(out, `${label}-reflections.png`) });
    await social.locator(".mind-body").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: join(out, `${label}-town-life.png`) });
    const before = await page.evaluate(() => ({
      x: window.__controlsTest.getX(),
      y: window.__controlsTest.getY(),
    }));
    await social.getByRole("button", { name: "Follow", exact: true }).first().click();
    await page.getByRole("button", { name: /Following Arwyn/ }).waitFor();
    await page.waitForTimeout(100);
    assert.deepEqual(
      await page.evaluate(() => ({
        x: window.__controlsTest.getX(),
        y: window.__controlsTest.getY(),
      })),
      before,
    );
    await page.getByRole("button", { name: /Return to me/ }).click();
    await social.getByRole("button", { name: "Close town life" }).click();
    await strip.getByRole("button", { name: "View Amelia's character card" }).click();
    let card = page.getByRole("complementary", { name: "Talk with Amelia" });
    await card.getByRole("button", { name: "Pin", exact: true }).click();
    assert.equal(
      await strip.getByRole("button").first().getAttribute("aria-label"),
      "View Amelia's character card",
    );
    assert.equal(await card.getByRole("button", { name: "Unpin", exact: true }).count(), 1);
    await card.getByRole("tab", { name: "Strengths" }).click();
    assert.match(await card.getByRole("tabpanel", { name: "Strengths" }).textContent(), /budgets/);
    await card.getByRole("tab", { name: "Progress" }).click();
    await card.getByRole("tab", { name: "Together" }).click();
    await card.getByLabel("Your line to Amelia").fill("Keep this Amelia draft.");
    await strip.getByRole("button", { name: "View Data's character card" }).click();
    let data = page.getByRole("complementary", { name: "Talk with Data" });
    await data.getByRole("tab", { name: "Together" }).click();
    assert.equal(await data.getByLabel("Your line to Data").inputValue(), "");
    await data.getByLabel("Your line to Data").fill("Keep this Data draft.");
    await strip.getByRole("button", { name: "View Amelia's character card" }).click();
    card = page.getByRole("complementary", { name: "Talk with Amelia" });
    await card.getByRole("tab", { name: "Together" }).click();
    assert.equal(
      await card.getByLabel("Your line to Amelia").inputValue(),
      "Keep this Amelia draft.",
    );
    await card.getByRole("tab", { name: "Overview" }).click();
    await page.screenshot({ path: join(out, `${label}-character-card.png`) });
    await strip.getByRole("button", { name: "View Kevin's character card" }).click();
    const kevin = page.getByRole("complementary", { name: "Talk with Kevin" });
    await kevin.getByRole("tab", { name: "Together" }).click();
    await kevin.getByLabel("Your line to Kevin").fill("Hello");
    await kevin.getByRole("button", { name: "Say it", exact: true }).click();
    await page.getByText("They answered with local dialogue.", { exact: true }).waitFor();
    await page.screenshot({ path: join(out, `${label}-conversation.png`) });
    await kevin.getByRole("button", { name: "Close conversation" }).click();
    if (await page.getByRole("complementary", { name: "Town life" }).isVisible())
      await page.getByRole("button", { name: "Close town life" }).click();
    await page.locator(".brand").click();
    const old = await page.evaluate(() => ({
      x: window.__controlsTest.getX(),
      y: window.__controlsTest.getY(),
    }));
    if (touch) {
      const east = page.getByRole("button", { name: "East", exact: true });
      const box = await east.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(240);
      await page.mouse.up();
    } else {
      await page.keyboard.down("ArrowDown");
      await page.waitForTimeout(240);
      await page.keyboard.up("ArrowDown");
    }
    const moved = await page.evaluate(() => ({
      x: window.__controlsTest.getX(),
      y: window.__controlsTest.getY(),
    }));
    assert.notDeepEqual(moved, old);
    await page.getByRole("button", { name: "1×", exact: true }).click();
    await page.waitForTimeout(160);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "Pause", exact: true }).getAttribute("data-on"),
      "true",
    );
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download town/ }).click();
    const download = await downloadEvent;
    const file = join(out, `${label}-synthetic-town.json`);
    await download.saveAs(file);
    await page.locator("input[type=file]").setInputFiles(file);
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    await strip.waitFor();
    await page.reload();
    await strip.waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")));
    assert.ok((saved.town ?? saved).social.length >= 3);
    const scrub = page.locator("#scrub");
    await scrub.focus();
    await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Back to now" }).waitFor();
    assert.ok(
      await strip.getByRole("button", { name: "View Kevin's character card" }).isDisabled(),
    );
    assert.equal(await page.locator(".conversation-caption").count(), 0);
    await page.getByRole("button", { name: "Back to now" }).click();
    const geometry = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      canvasHeight: document.querySelector("canvas.town-canvas").getBoundingClientRect().height,
    }));
    assert.ok(geometry.scroll <= width);
    assert.ok(geometry.canvasHeight > 150);
    assert.deepEqual(errors, []);
    results.push({
      label,
      geometry,
      errors,
      checks:
        "canvas selection, captions, NPC transcript, changes, intentions, reflections, camera, cards, drafts, local reply, movement, pause, import/export, reload, replay",
    });
    await context.close();
  }
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const welcome = await fresh.newPage();
  await welcome.goto(url);
  await welcome.getByLabel("What do they call you?").fill("New resident");
  await welcome.getByRole("button", { name: "Walk in" }).click();
  await welcome.getByRole("navigation", { name: "Town residents" }).waitFor();
  assert.equal(
    await welcome.getByRole("button", { name: "Pause", exact: true }).getAttribute("data-on"),
    "true",
  );
  await welcome.screenshot({ path: join(out, "mobile-new-town.png") });
  await fresh.close();
  await writeFile(join(out, "browser-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
