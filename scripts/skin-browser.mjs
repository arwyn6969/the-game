import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const SKINS = [
  { id: "plaza-cream", label: "Plaza Cream" },
  { id: "hobbs-hearth", label: "Hobbs Hearth" },
  { id: "library-ink", label: "Library Ink" },
  { id: "original", label: "Original" },
];
const SAVE_KEY = "the-game-town-v2";
// Same bounded browser-only transport approach as quality-ai-browser.mjs.
// The real parser, orchestration, validation and UI still process its result.
const transportModule = `
const mock = globalThis.__skinQaMindTransport ??= {
  calls: [], pending: new Map(), availability: { online: false, configured: false },
  resolve(id, response) {
    const pending = this.pending.get(id);
    if (pending) { this.pending.delete(id); pending.resolve(response); }
  }
};
export function mindAvailability() { return mock.availability; }
export function thinkTown({ data }) {
  const id = mock.calls.length;
  mock.calls.push({ id, kind: data.kind });
  return new Promise((resolve, reject) => mock.pending.set(id, { resolve, reject }));
}
`;
const tools = (page) => page.getByRole("navigation", { name: "Your town tools", exact: true });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
const position = (page) =>
  page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));
const frames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

async function pause(page) {
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key) || "null")?.town?.paused === true,
    SAVE_KEY,
  );
}

async function move(page, touch) {
  const before = await position(page);
  const directions = await page.evaluate(
    ({ x, y }) =>
      [
        { key: "ArrowRight", label: "East", x: x + 1, y },
        { key: "ArrowLeft", label: "West", x: x - 1, y },
        { key: "ArrowDown", label: "South", x, y: y + 1 },
        { key: "ArrowUp", label: "North", x, y: y - 1 },
      ].filter((direction) => window.__game.tile(direction.x, direction.y)?.block === false),
    before,
  );
  for (const direction of directions) {
    await page.locator("canvas.town-canvas").focus();
    if (touch) {
      const control = page.locator(".dpad").getByRole("button", {
        name: direction.label,
        exact: true,
      });
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      assert.ok(box, "A touch movement control must have a visible box");
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
      });
      await page.waitForTimeout(140);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else {
      await page.keyboard.down(direction.key);
      await page.waitForTimeout(140);
      await page.keyboard.up(direction.key);
    }
    const after = await position(page);
    if (after.x !== before.x || after.y !== before.y) {
      await page.waitForFunction(
        ({ key, x, y }) => {
          const player = JSON.parse(localStorage.getItem(key) || "null")?.town?.agents?.find(
            (agent) => agent.id === "player",
          );
          return player?.tile.x === x && player?.tile.y === y;
        },
        { key: SAVE_KEY, ...after },
      );
      return { before, after, input: touch ? "touch" : "keyboard" };
    }
  }
  throw new Error("No adjacent walkable direction moved the player");
}

async function importTown(page, raw, filename) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: filename,
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
  await frames(page);
}

async function chooseSkin(page, skin) {
  const button = page.locator(".appearance-toolbar").getByRole("button", {
    name: skin.label,
    exact: true,
  });
  await button.click();
  await page.waitForFunction(
    (id) => document.querySelector(".game-appearance")?.getAttribute("data-ui-skin") === id,
    skin.id,
  );
  await frames(page);
  assert.equal(
    await button.evaluate((element) => document.activeElement === element),
    true,
    "Changing appearance must leave focus on the activated comparison button",
  );
}

async function layout(page) {
  return page.evaluate(() => {
    const boxOf = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const prose = document.querySelector(".mind-body p");
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      canvas: boxOf("canvas.town-canvas"),
      panel: boxOf(".mind"),
      residents: boxOf(".social-toolbar"),
      tools: boxOf(".town-tools"),
      proseSize: prose ? Number.parseFloat(getComputedStyle(prose).fontSize) : null,
    };
  });
}

async function exposed(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const left = Math.max(0, box.left);
    const right = Math.min(innerWidth, box.right);
    const top = Math.max(0, box.top);
    const bottom = Math.min(innerHeight, box.bottom);
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    return (
      right - left >= 44 &&
      bottom - top >= 44 &&
      x >= 0 &&
      x < innerWidth &&
      y >= 0 &&
      y < innerHeight &&
      element.contains(document.elementFromPoint(x, y))
    );
  });
}

/**
 * Real game components in disposable local browser contexts. This never attaches
 * to a personal browser/profile, calls a provider or changes server auth flags.
 * The only imported town is a synthetic town created through the normal UI.
 */
export async function runSkinChecks(browser, url, outputDirectory) {
  assert.equal(Number(process.versions.node.split(".")[0]), 24, "Use Node 24");
  const target = new URL(url);
  assert.equal(target.protocol, "http:", "Skin QA only targets local HTTP previews");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  target.searchParams.set("uiPreview", "1");
  target.searchParams.set("skin", "plaza-cream");
  const out = resolve(outputDirectory);
  await mkdir(out, { recursive: true });
  const report = {
    url: target.href,
    node: process.version,
    generatedAt: new Date().toISOString(),
    scope:
      "Synthetic local towns; original plus three real UI layouts; no external provider/wallet calls",
    journeys: [],
    failures: [],
    limits: [
      "Emulated phone touch is not a physical-device or software-keyboard acceptance result.",
      "These assertions cover appearance/state isolation and common real controls, not all game mechanics.",
      "Unavailable and delayed AI use browser-only synthetic transport; provider quality and live signed-in sessions are not tested.",
    ],
  };
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const journey = {
      viewport,
      checks: [],
      errors: [],
      consoleErrors: [],
      blockedServerCalls: [],
      blockedExternalRequests: [],
      transportModuleReplacements: 0,
      screenshots: [],
    };
    report.journeys.push(journey);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
    });
    await context.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      window.__skinQaTownWrites = [];
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && /^the-game-town-v[12]$/.test(key))
          window.__skinQaTownWrites.push(key);
        return originalSetItem.call(this, key, value);
      };
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (requestUrl.origin !== target.origin) {
        journey.blockedExternalRequests.push(requestUrl.origin);
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      }
      if (requestUrl.pathname.includes("_serverFn")) {
        journey.blockedServerCalls.push({ method: request.method(), path: requestUrl.pathname });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"online":false,"ok":false}',
        });
      }
      return route.continue();
    });
    await context.route("**/src/lib/mind.functions.ts*", (route) => {
      journey.transportModuleReplacements++;
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: transportModule,
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => journey.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") journey.consoleErrors.push(message.text());
    });
    async function check(name, work) {
      const item = { name, status: "running" };
      journey.checks.push(item);
      try {
        const observations = await work();
        item.status = "passed";
        if (observations !== undefined) item.observations = observations;
      } catch (error) {
        item.status = "failed";
        item.error = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }
    async function shot(name) {
      const filename = `${viewport.name}-${name}.png`;
      await page.screenshot({ path: join(out, filename), fullPage: true });
      journey.screenshots.push(filename);
    }
    try {
      await check("normal onboarding in a fresh isolated context", async () => {
        await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page
          .getByLabel("What do they call you?", { exact: true })
          .fill(`Skin ${viewport.name}`);
        await page.getByLabel("Use local dialogue only", { exact: true }).check();
        await shot("onboarding");
        await page.getByRole("button", { name: "Walk in", exact: true }).click();
        await page.waitForFunction(
          () =>
            !!window.__game &&
            !!window.__controlsTest &&
            !!localStorage.getItem("the-game-town-v2"),
        );
        await pause(page);
      });
      await check("keyboard or real emulated touch movement while paused", async () =>
        move(page, viewport.name === "phone"),
      );
      await check("export and import preserve synthetic town identities", async () => {
        const event = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download town", exact: true }).click();
        const download = await event;
        const filename = join(out, `${viewport.name}-synthetic-town.json`);
        await download.saveAs(filename);
        const exported = JSON.parse(await readFile(filename, "utf8"));
        const identities = exported.town.identityRegistry;
        const kevin = exported.town.agents.find((agent) => agent.id === "kevin");
        const occupied = exported.town.agents
          .filter((agent) => agent.id !== "player")
          .map((agent) => `${agent.tile.x},${agent.tile.y}`);
        const nearby = await page.evaluate(
          ({ tile, occupiedTiles }) =>
            [
              { x: tile.x + 1, y: tile.y },
              { x: tile.x - 1, y: tile.y },
              { x: tile.x, y: tile.y + 1 },
              { x: tile.x, y: tile.y - 1 },
            ].find(
              (point) =>
                window.__game.tile(point.x, point.y)?.block === false &&
                !occupiedTiles.includes(`${point.x},${point.y}`),
            ),
          { tile: kevin.tile, occupiedTiles: occupied },
        );
        assert.ok(nearby, "Synthetic fixture needs a walkable adjacent Kevin tile");
        exported.town.agents.find((agent) => agent.id === "player").tile = nearby;
        exported.town.paused = true;
        await importTown(page, JSON.stringify(exported), "synthetic-near-kevin.json");
        assert.deepEqual(JSON.parse(await saved(page)).town.identityRegistry, identities);
      });
      await check("real authored conversation and retained unsent draft", async () => {
        await page.locator("canvas.town-canvas").focus();
        await page.keyboard.press("Enter");
        await page
          .getByLabel("Your line to Kevin", { exact: true })
          .fill("Hello. What is on your mind?");
        await page.getByRole("button", { name: "Say it", exact: true }).click();
        await page.waitForFunction(() =>
          /They answered with local dialogue/.test(
            document.querySelector(".mind-send-note")?.textContent || "",
          ),
        );
        await page.waitForFunction(() =>
          JSON.parse(localStorage.getItem("the-game-town-v2"))
            .town.agents.find((agent) => agent.id === "kevin")
            .memories.some((memory) => memory.type === "chat" && memory.with === "player"),
        );
        await page
          .getByLabel("Your line to Kevin", { exact: true })
          .fill("I am keeping this draft while I compare the interfaces.");
        const choices = page.locator(".mind-actions");
        if (await choices.count()) await choices.locator("summary").click();
        await frames(page);
      });
      const baseline = await saved(page);
      const canvas = await page.locator("canvas.town-canvas").elementHandle();
      const panel = await page.locator(".mind").elementHandle();
      const writes = await page.evaluate(() => window.__skinQaTownWrites.length);
      const calls = journey.blockedServerCalls.length;
      for (const skin of SKINS) {
        await check(
          `${skin.label}: switch keeps state, nodes, draft, tab and Choices`,
          async () => {
            await chooseSkin(page, skin);
            assert.equal(
              await saved(page),
              baseline,
              "Appearance must leave paused town save byte-identical",
            );
            assert.equal(
              await page.evaluate(() => window.__skinQaTownWrites.length),
              writes,
              "Appearance must not invoke town saving",
            );
            assert.equal(
              journey.blockedServerCalls.length,
              calls,
              "Appearance must not dispatch provider/server calls",
            );
            assert.equal(
              await canvas.evaluate(
                (element) => element === document.querySelector("canvas.town-canvas"),
              ),
              true,
              "The existing canvas must stay mounted",
            );
            assert.equal(
              await panel.evaluate((element) => element === document.querySelector(".mind")),
              true,
              "The existing resident panel must stay mounted",
            );
            assert.equal(
              await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
              "I am keeping this draft while I compare the interfaces.",
            );
            assert.equal(
              await page
                .getByRole("tab", { name: "Together", exact: true })
                .getAttribute("aria-selected"),
              "true",
            );
            const choices = page.locator(".mind-actions");
            if (await choices.count()) assert.equal(await choices.getAttribute("open"), "");
            assert.equal(
              await exposed(page.getByLabel("Your line to Kevin", { exact: true })),
              true,
              "The reply field must remain reachable with Choices expanded",
            );
            assert.equal(
              await exposed(page.getByRole("button", { name: "Say it", exact: true })),
              true,
              "The send button must remain reachable with Choices expanded",
            );
            const observed = await layout(page);
            assert.equal(observed.overflow, false, "No horizontal document overflow");
            assert.ok(
              observed.canvas.width > 0 && observed.canvas.height > 0,
              "A useful town canvas must remain",
            );
            await shot(`${skin.id}-choices`);
            if (await choices.count()) {
              await choices.locator("summary").click();
              await page.getByLabel("Your line to Kevin", { exact: true }).scrollIntoViewIfNeeded();
              await shot(`${skin.id}-conversation`);
              await choices.locator("summary").click();
            } else await shot(`${skin.id}-conversation`);
            return observed;
          },
        );
      }
      await check("typing after a skin switch stays in the message field", async () => {
        const input = page.getByLabel("Your line to Kevin", { exact: true });
        const before = await position(page);
        await input.focus();
        await page.keyboard.press("End");
        await page.keyboard.type(" A");
        assert.deepEqual(await position(page), before, "Typing WASD in a draft must not walk");
        assert.match(await input.inputValue(), / A$/);
      });
      await page.getByRole("button", { name: "Close conversation", exact: true }).click();
      for (const skin of SKINS) {
        await check(`${skin.label}: real Library, Journal and travel panels`, async () => {
          await chooseSkin(page, skin);
          await tools(page).getByRole("button", { name: "Library project", exact: true }).click();
          await page.getByRole("dialog", { name: "Library project", exact: true }).waitFor();
          assert.equal(await page.locator(".mind").count(), 1);
          await shot(`${skin.id}-library`);
          await page.getByRole("button", { name: "Close Library project", exact: true }).click();
          await tools(page).getByRole("button", { name: "Journal", exact: true }).click();
          await page.getByRole("dialog", { name: "Your journal", exact: true }).waitFor();
          await shot(`${skin.id}-journal`);
          await page.getByRole("button", { name: "Close Your journal", exact: true }).click();
          await tools(page).getByRole("button", { name: "Go somewhere", exact: true }).click();
          await page.getByRole("dialog", { name: "Go somewhere", exact: true }).waitFor();
          await page.getByRole("button", { name: "Close Go somewhere", exact: true }).click();
          assert.equal((await layout(page)).overflow, false);
          await shot(`${skin.id}-town`);
        });
      }
      await check("chosen appearance and town survive reload without a URL override", async () => {
        await chooseSkin(page, SKINS[1]);
        const before = JSON.parse(await saved(page)).town;
        const cleanUrl = new URL(page.url());
        cleanUrl.searchParams.delete("skin");
        await page.goto(cleanUrl.href, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
        assert.equal(
          await page.locator(".game-appearance").getAttribute("data-ui-skin"),
          "hobbs-hearth",
        );
        assert.deepEqual(JSON.parse(await saved(page)).town, before);
      });
      await check("unavailable AI keeps warning and draft through skin changes", async () => {
        await tools(page).getByRole("button", { name: "Help & privacy", exact: true }).click();
        await page.getByLabel("Use local dialogue only", { exact: true }).uncheck();
        await page.getByRole("button", { name: "Close Help & privacy", exact: true }).click();
        await page
          .getByRole("button", { name: "View Kevin's character card", exact: true })
          .click();
        await page.getByRole("tab", { name: "Together", exact: true }).click();
        await page
          .getByLabel("Your line to Kevin", { exact: true })
          .fill("Keep this failed message for retry.");
        await page.getByRole("button", { name: "Say it", exact: true }).click();
        await page.waitForFunction(() =>
          /AI is unavailable/.test(document.querySelector(".mind-send-note")?.textContent || ""),
        );
        const before = await saved(page);
        for (const skin of SKINS.slice(0, 3)) {
          await chooseSkin(page, skin);
          assert.equal(
            await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
            "Keep this failed message for retry.",
          );
          assert.match(
            await page.locator(".mind-send-note").innerText(),
            /no local reply was substituted/,
          );
          assert.equal(await saved(page), before);
        }
        await shot("library-ink-ai-unavailable");
      });
      await check("delayed AI request survives all layout switches and applies once", async () => {
        assert.ok(
          journey.transportModuleReplacements > 0,
          "Delayed transport check requires the local Vite development preview",
        );
        await page.evaluate(() => {
          window.__skinQaMindTransport.availability = { online: true, configured: true };
          window.dispatchEvent(new Event("focus"));
        });
        await page.locator('[data-ai-status="ready"]').waitFor();
        const line = `Keep this pending request across layouts ${viewport.name}.`;
        const answer = `Synthetic delayed answer for ${viewport.name}.`;
        await page.getByLabel("Your line to Kevin", { exact: true }).fill(line);
        await page.getByRole("button", { name: "Say it", exact: true }).click();
        await page.waitForFunction(() => window.__skinQaMindTransport.pending.size === 1);
        const before = await saved(page);
        const requestId = await page.evaluate(() => window.__skinQaMindTransport.calls.at(-1).id);
        for (const skin of SKINS) {
          await chooseSkin(page, skin);
          assert.equal(
            await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(),
            line,
          );
          assert.equal(
            await page.getByRole("button", { name: "Saying it", exact: true }).isDisabled(),
            true,
          );
          assert.equal(await page.evaluate(() => window.__skinQaMindTransport.pending.size), 1);
          assert.equal(await page.evaluate(() => window.__skinQaMindTransport.calls.length), 1);
          assert.equal(
            await saved(page),
            before,
            "Switching must not apply or cancel a pending response",
          );
        }
        await chooseSkin(page, SKINS[0]);
        await shot("plaza-cream-ai-pending");
        await page.evaluate(
          ({ id, answer }) =>
            window.__skinQaMindTransport.resolve(id, {
              ok: true,
              text: JSON.stringify({
                reply: answer,
                delta: 0,
                note: "",
                favor: null,
                thread: null,
                notice: null,
                project: null,
              }),
            }),
          { id: requestId, answer },
        );
        await page.waitForFunction(
          (answer) =>
            JSON.parse(localStorage.getItem("the-game-town-v2"))
              .town.agents.find((agent) => agent.id === "kevin")
              .memories.filter(
                (memory) =>
                  memory.type === "chat" &&
                  memory.with === "player" &&
                  memory.text.includes(answer),
              ).length === 1,
          answer,
        );
        assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), "");
        assert.equal(await page.evaluate(() => window.__skinQaMindTransport.pending.size), 0);
        assert.equal(await page.evaluate(() => window.__skinQaMindTransport.calls.length), 1);
        assert.equal(
          journey.blockedServerCalls.length,
          0,
          "The synthetic transport must not leak into server functions",
        );
      });
      if (viewport.name === "desktop") {
        await check(
          "Hearth enlarged text and spacing keep reply and close controls reachable",
          async () => {
            await chooseSkin(page, SKINS[1]);
            const style = await page.addStyleTag({
              content:
                "html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }",
            });
            try {
              await frames(page);
              const choices = page.locator(".mind-actions");
              if ((await choices.count()) && (await choices.getAttribute("open")) === null)
                await choices.locator("summary").click();
              assert.equal(
                await exposed(page.getByLabel("Your line to Kevin", { exact: true })),
                true,
              );
              assert.equal(
                await exposed(page.getByRole("button", { name: "Say it", exact: true })),
                true,
              );
              assert.equal(
                await exposed(
                  page.getByRole("button", { name: "Close conversation", exact: true }),
                ),
                true,
              );
              assert.equal((await layout(page)).overflow, false);
              await shot("hobbs-hearth-enlarged-text-spacing");
              return {
                method: "200% CSS root text plus line/letter/word spacing; not native browser zoom",
              };
            } finally {
              await style.evaluate((element) => element.remove());
            }
          },
        );
        await check(
          "wide presentation captures use the real paused conversation fixture",
          async () => {
            await page.setViewportSize({ width: 1600, height: 1000 });
            await frames(page);
            await page.getByRole("button", { name: "Close conversation", exact: true }).click();
            await tools(page).getByRole("button", { name: "Help & privacy", exact: true }).click();
            await page.getByLabel("Use local dialogue only", { exact: true }).check();
            await page.getByRole("button", { name: "Close Help & privacy", exact: true }).click();
            await importTown(page, baseline, "synthetic-wide-presentation.json");
            await page.locator("canvas.town-canvas").focus();
            await page.keyboard.press("Enter");
            await page
              .getByLabel("Your line to Kevin", { exact: true })
              .fill("I am keeping this draft while I compare the interfaces.");
            const choices = page.locator(".mind-actions");
            if ((await choices.count()) && (await choices.getAttribute("open")) !== null)
              await choices.locator("summary").click();
            journey.presentationCaptures = [];
            for (const skin of SKINS.slice(0, 3)) {
              await chooseSkin(page, skin);
              await page
                .getByRole("heading", { name: "What you heard", exact: true })
                .scrollIntoViewIfNeeded();
              await page.locator(".mind-body").evaluate((element) => {
                element.scrollTop = 0;
              });
              await frames(page);
              const filename = `wide-${skin.id}.png`;
              await page.screenshot({ path: join(out, filename), fullPage: false });
              journey.screenshots.push(filename);
              journey.presentationCaptures.push({
                file: filename,
                viewport: { width: 1600, height: 1000 },
                skin: skin.id,
                content:
                  "Real Kevin Together panel with authored dialogue, collapsed Choices and retained unsent draft",
              });
            }
            await tools(page).getByRole("button", { name: "Library project", exact: true }).click();
            await page.getByRole("dialog", { name: "Library project", exact: true }).waitFor();
            await page.locator(".mind-body").evaluate((element) => {
              element.scrollTop = 0;
            });
            await frames(page);
            await page.screenshot({ path: join(out, "wide-library-project.png"), fullPage: false });
            journey.screenshots.push("wide-library-project.png");
            journey.presentationCaptures.push({
              file: "wide-library-project.png",
              viewport: { width: 1600, height: 1000 },
              skin: "library-ink",
              content: "Real Library project panel, unaccepted source/reference offers",
            });
          },
        );
      }
      await check("no browser exceptions", async () => {
        assert.deepEqual(journey.errors, []);
      });
    } catch (error) {
      report.failures.push(
        `${viewport.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await shot("failure").catch(() => {});
    } finally {
      await context.close();
      await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
    }
  }
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const report = await runSkinChecks(
      browser,
      process.env.GAME_SKIN_QA_URL || "http://127.0.0.1:8186/?uiPreview=1&skin=plaza-cream",
      process.env.GAME_SKIN_QA_OUT || "artifacts/ui-skins",
    );
    console.log(
      JSON.stringify(
        {
          ok: report.failures.length === 0,
          failures: report.failures,
          report: resolve(process.env.GAME_SKIN_QA_OUT || "artifacts/ui-skins", "report.json"),
        },
        null,
        2,
      ),
    );
    if (report.failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
