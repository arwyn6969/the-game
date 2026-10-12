import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "../../node_modules/playwright/index.mjs";

// New, isolated browser contexts only. Every saved/exported town below is created
// by this script through the name-entry UI, never read from a personal browser.
const url = process.env.GRAPHICS_QA_URL || "http://127.0.0.1:8083/";
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/);
const out = process.env.GRAPHICS_QA_OUT || "/private/tmp/game-graphics-qa";
await mkdir(out, { recursive: true });
const results = { url, node: process.version, checks: {}, screenshots: [], failures: [] };
const browser = await chromium.launch({ headless: true });
const savedTown = (page) =>
  page.evaluate(() => {
    const value = JSON.parse(
      localStorage.getItem("the-game-town-v2") ?? localStorage.getItem("the-game-town-v1"),
    );
    return value.town ?? value;
  });
const xy = (page) =>
  page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));

async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const path = join(out, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  results.screenshots.push(path);
  return path;
}

async function geometry(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const e = document.querySelector(selector);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const c = getComputedStyle(document.documentElement);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      colorScheme: c.colorScheme,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      tokens: {
        bg: c.getPropertyValue("--color-bg").trim(),
        primary: c.getPropertyValue("--color-primary").trim(),
        accent: c.getPropertyValue("--color-moss").trim(),
      },
      hud: box(".hud"),
      canvas: box(".town-canvas"),
      footer: box(".foot"),
      conversation: box(".mind"),
      conversationBar: box(".mind-bar"),
      composer: box(".mind-say"),
    };
  });
}

async function buttonTextLayout(button) {
  return button.evaluate((element) => {
    const tops = new Set();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
    }
    const r = element.getBoundingClientRect();
    return {
      text: element.textContent.trim(),
      lines: tops.size,
      lineTops: [...tops],
      width: r.width,
      height: r.height,
    };
  });
}

async function keyboardStep(page) {
  const from = await xy(page);
  const directions = await page.evaluate(
    ({ x, y }) =>
      [
        { key: "ArrowRight", label: "East", x: x + 1, y },
        { key: "ArrowLeft", label: "West", x: x - 1, y },
        { key: "ArrowDown", label: "South", x, y: y + 1 },
        { key: "ArrowUp", label: "North", x, y: y - 1 },
      ].filter((d) => window.__game.tile(d.x, d.y)?.block === false),
    from,
  );
  for (const d of directions) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down(d.key);
    await page.waitForTimeout(75);
    await page.keyboard.up(d.key);
    const to = await xy(page);
    if (to.x !== from.x || to.y !== from.y) return { key: d.key, from, to };
  }
  throw new Error("Keyboard movement did not change player position on a walkable adjacent tile");
}

async function pointerStep(page) {
  const cdp = await page.context().newCDPSession(page);
  const from = await xy(page);
  const dirs = await page.evaluate(
    ({ x, y }) =>
      [
        { label: "East", x: x + 1, y },
        { label: "West", x: x - 1, y },
        { label: "South", x, y: y + 1 },
        { label: "North", x, y: y - 1 },
      ].filter((d) => window.__game.tile(d.x, d.y)?.block === false),
    from,
  );
  for (const d of dirs) {
    const pad = page.getByRole("button", { name: d.label, exact: true });
    if (!(await pad.isVisible())) continue;
    const rect = await pad.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1 }],
    });
    await page.waitForTimeout(75);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const to = await xy(page);
    if (to.x !== from.x || to.y !== from.y) {
      await cdp.detach();
      return { label: d.label, input: "touch", from, to };
    }
  }
  await cdp.detach();
  throw new Error("Mobile pointer pad movement did not change player position");
}

async function downloadTown(page, name) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download town", exact: true }).click();
  const download = await pending;
  const path = join(out, `${name}.json`);
  await download.saveAs(path);
  const value = JSON.parse(await readFile(path, "utf8"));
  const town = value.town ?? value;
  assert.equal(town.version, 2);
  assert.deepEqual(
    town.agents.map((a) => a.id).sort(),
    (await savedTown(page)).agents.map((a) => a.id).sort(),
  );
  return {
    town,
    filename: download.suggestedFilename(),
    bytes: Buffer.byteLength(JSON.stringify(town)),
  };
}

async function importTown(page, town, name) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: `${name}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(town)),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal((await savedTown(page)).playerName, town.playerName);
}

try {
  for (const vp of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const check = (results.checks[vp.name] = {
      viewport: { width: vp.width, height: vp.height },
      consoleErrors: [],
      pageErrors: [],
    });
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.name === "mobile",
      colorScheme: "light",
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") check.consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => check.pageErrors.push(e.message));
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.getByLabel("What do they call you?", { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      check.onboardingGeometry = await geometry(page);
      await screenshot(page, `${vp.name}-onboarding`);
      await page.getByLabel("What do they call you?", { exact: true }).fill(`QA ${vp.name}`);
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
      await page.locator(".badge").waitFor();
      assert.equal(
        await page.locator(".badge").getAttribute("data-off"),
        "true",
        "Use a local server with XAI_API_KEY unset to verify offline conversation without provider calls",
      );
      assert.equal((await savedTown(page)).playerName, `QA ${vp.name}`);
      check.nameEntry = true;
      assert.equal(
        await page.getByRole("button", { name: "Pause", exact: true }).getAttribute("data-on"),
        "true",
      );
      check.keyboardMovement = await keyboardStep(page);
      if (vp.name === "mobile") check.mobilePointerMovement = await pointerStep(page);
      await page.getByRole("button", { name: "1×", exact: true }).click();
      await page.waitForTimeout(1250);
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const minute = (await savedTown(page)).minute;
      await page.waitForTimeout(1150);
      assert.equal((await savedTown(page)).minute, minute);
      assert.equal(
        await page.getByRole("button", { name: "Pause", exact: true }).getAttribute("data-on"),
        "true",
      );
      check.pause = { minute, stable: true };
      check.townGeometry = await geometry(page);
      assert.equal(check.townGeometry.horizontalOverflow, false);
      assert.ok(
        check.townGeometry.canvas.height > 100,
        "Town canvas should remain usefully visible",
      );
      await screenshot(page, `${vp.name}-town`);
      const exported = await downloadTown(page, `${vp.name}-synthetic-export`);
      check.export = { filename: exported.filename, bytes: exported.bytes };
      // Move only this freshly-created synthetic town beside Kevin, using normal
      // backup import, then open the conversation through the actual Enter key.
      const town = exported.town;
      const kevin = town.agents.find((a) => a.id === "kevin");
      const player = town.agents.find((a) => a.id === "player");
      player.tile = await page.evaluate(
        ({ x, y }) =>
          [
            { x: x + 1, y },
            { x: x - 1, y },
            { x, y: y + 1 },
            { x, y: y - 1 },
          ].find((p) => window.__game.tile(p.x, p.y)?.block === false),
        kevin.tile,
      );
      assert.ok(player.tile);
      town.paused = true;
      town.sawHint = true;
      town.guide = 3;
      await importTown(page, town, `${vp.name}-synthetic-near-kevin`);
      check.import = { playerName: town.playerName, day: town.day };
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Enter");
      await page.getByLabel("Your line to Kevin", { exact: true }).waitFor();
      check.conversationEntry = "Enter beside Kevin";
      const pin = page.getByRole("button", { name: "Pin Kevin", exact: true });
      check.pinButtonText = await buttonTextLayout(pin);
      assert.equal(check.pinButtonText.lines, 1, "Pin Kevin button text should stay on one line");
      await pin.click();
      const unpin = page.getByRole("button", { name: "Unpin", exact: true });
      check.activePinButtonText = await buttonTextLayout(unpin);
      assert.equal(
        check.activePinButtonText.lines,
        1,
        "Active Unpin button text should stay on one line",
      );
      await unpin.click();
      await page
        .getByLabel("Your line to Kevin", { exact: true })
        .fill("Hello Kevin, nice morning.");
      check.activeSendButtonText = await buttonTextLayout(
        page.getByRole("button", { name: "Say it", exact: true }),
      );
      assert.equal(
        check.activeSendButtonText.lines,
        1,
        "Enabled Say it button text should stay on one line",
      );
      await screenshot(page, `${vp.name}-conversation-active`);
      await page.getByRole("button", { name: "Say it", exact: true }).click();
      await page.waitForFunction(() =>
        /They answered with local dialogue\./.test(
          document.querySelector(".mind-send-note")?.textContent || "",
        ),
      );
      assert.equal(await page.getByLabel("Your line to Kevin", { exact: true }).inputValue(), "");
      assert.ok(
        (await page.locator(".mind-body").innerText()).includes("Hello Kevin, nice morning."),
      );
      check.offlineConversation = true;
      check.conversationGeometry = await geometry(page);
      const g = check.conversationGeometry;
      assert.equal(g.horizontalOverflow, false);
      assert.ok(
        g.conversationBar.y >= -1 && g.conversationBar.bottom <= vp.height + 1,
        "Conversation heading and close controls should fit",
      );
      assert.ok(
        g.composer.y >= -1 && g.composer.bottom <= vp.height + 1,
        "Conversation input and submit should fit",
      );
      await screenshot(page, `${vp.name}-conversation`);
      await page.getByRole("button", { name: "Close conversation", exact: true }).click();
      await page.locator(".mind").waitFor({ state: "hidden" });
      await screenshot(page, `${vp.name}-hobbs`);
      check.specialists = {};
      for (const id of ["data", "amelia"]) {
        const next = await savedTown(page);
        const resident = next.agents.find((a) => a.id === id);
        const player = next.agents.find((a) => a.id === "player");
        player.tile = await page.evaluate(
          ({ target, occupied }) =>
            [
              { x: target.x + 1, y: target.y },
              { x: target.x - 1, y: target.y },
              { x: target.x, y: target.y + 1 },
              { x: target.x, y: target.y - 1 },
            ].find(
              (p) =>
                window.__game.tile(p.x, p.y)?.block === false &&
                !occupied.some((t) => t.x === p.x && t.y === p.y),
            ),
          {
            target: resident.tile,
            occupied: next.agents.filter((a) => a.id !== "player").map((a) => a.tile),
          },
        );
        assert.ok(player.tile);
        const finances = {
          money: next.agents.map((a) => a.money),
          favors: next.favors,
          projects: player.projects,
        };
        await importTown(page, next, `${vp.name}-near-${id}`);
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press("Enter");
        const input = page.getByLabel(`Your line to ${resident.name}`, { exact: true });
        await input.fill("What kind of work matters to you?");
        await page.getByRole("button", { name: "Say it", exact: true }).click();
        await page.waitForFunction(() =>
          /They answered with local dialogue\./.test(
            document.querySelector(".mind-send-note")?.textContent || "",
          ),
        );
        const after = await savedTown(page);
        assert.deepEqual(
          {
            money: after.agents.map((a) => a.money),
            favors: after.favors,
            projects: after.agents.find((a) => a.id === "player").projects,
          },
          finances,
        );
        assert.ok(
          after.agents
            .find((a) => a.id === id)
            .memories.some(
              (memory) =>
                memory.with === "player" &&
                memory.turns?.some((turn) => turn.speaker === id && turn.text.length > 0),
            ),
        );
        await screenshot(page, `${vp.name}-${id}-conversation`);
        check.specialists[id] = { offlineReply: true, financesUnchanged: true };
        await page.getByRole("button", { name: "Close conversation", exact: true }).click();
      }
      const beforeReload = await savedTown(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
      const afterReload = await savedTown(page);
      for (const id of ["kevin", "data", "amelia"]) {
        assert.deepEqual(
          afterReload.agents.find((a) => a.id === id).memories.filter((m) => m.type === "chat"),
          beforeReload.agents.find((a) => a.id === id).memories.filter((m) => m.type === "chat"),
          `${id} conversation survives reload`,
        );
      }
      assert.equal(afterReload.playerName, beforeReload.playerName);
      assert.deepEqual(
        afterReload.agents.find((a) => a.id === "player").tile,
        beforeReload.agents.find((a) => a.id === "player").tile,
      );
      assert.equal(
        afterReload.agents.find((a) => a.id === "kevin").memories.filter((m) => m.type === "chat")
          .length,
        beforeReload.agents.find((a) => a.id === "kevin").memories.filter((m) => m.type === "chat")
          .length,
      );
      check.reloadPersistence = true;
      assert.equal(check.pageErrors.length, 0);
      assert.equal(check.consoleErrors.length, 0);
      check.ok = true;
    } catch (error) {
      check.ok = false;
      check.error = error.message;
      results.failures.push(`${vp.name}: ${error.message}`);
      await screenshot(page, `${vp.name}-failure`).catch(() => {});
    } finally {
      await context.close();
    }
  }

  const synthetic = JSON.parse(await readFile(join(out, "desktop-synthetic-export.json"), "utf8"));
  const fixture = synthetic.town ?? synthetic;
  const renderContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const renderPage = await renderContext.newPage();
  await renderPage.goto(url, { waitUntil: "domcontentloaded" });
  await renderPage.evaluate(() => document.fonts.ready);
  const renderResult = await renderPage.evaluate(async (fixture) => {
    const r = await import("/src/game/render.ts");
    const town = structuredClone(fixture);
    const original = JSON.stringify(town);
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const ctx = c.getContext("2d");
    const positions = Object.fromEntries(
      town.agents.map((a) => [a.id, { ...a.tile, face: a.face }]),
    );
    positions.player = { x: 10, y: 21, face: "s" };
    let opts = {
      viewW: 800,
      viewH: 600,
      town,
      minute: town.minute,
      day: town.day,
      ...r.cameraFor(10, 21, 800, 600),
      positions,
      names: Object.fromEntries(town.agents.map((a) => [a.id, a.name])),
    };
    const pixels = () => ctx.getImageData(0, 0, c.width, c.height).data;
    const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    r.resetGlide(town);
    town.paused = true;
    r.paint(ctx, opts);
    await document.fonts.ready;
    await document.fonts.load("400 11px Silkscreen");
    await document.fonts.load("600 11px Space Grotesk");
    r.paint(ctx, opts);
    const paused = pixels();
    await new Promise((resolve) => setTimeout(resolve, 80));
    r.paint(ctx, opts);
    const pauseFreezesArt = equal(paused, pixels());
    town.paused = false;
    r.paint(ctx, opts);
    const running = pixels();
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 35));
      r.paint(ctx, opts);
    }
    const ambientAnimates = !equal(running, pixels());
    opts.replay = true;
    r.paint(ctx, opts);
    const replay = pixels();
    await new Promise((resolve) => setTimeout(resolve, 80));
    r.paint(ctx, opts);
    const replayFreezesArt = equal(replay, pixels());
    delete opts.replay;
    // Place the player on actual walkable cells north/south of the park tree.
    town.paused = true;
    opts = { ...opts, ...r.cameraFor(20, 34, 800, 600) };
    const pixelAt = (x, y) =>
      Array.from(ctx.getImageData(Math.round(x - opts.camX), Math.round(y - opts.camY), 1, 1).data);
    const player = positions.player;
    delete positions.player;
    r.paint(ctx, opts);
    const northBaseline = pixelAt(20 * 32 + 16, 33 * 32 + 24 - 20);
    const southBaseline = pixelAt(20 * 32 + 16, 35 * 32 + 24 - 39);
    positions.player = { x: 20, y: 33, face: "s" };
    r.paint(ctx, opts);
    const behindTree = equal(northBaseline, pixelAt(20 * 32 + 16, 33 * 32 + 24 - 20));
    positions.player = { x: 20, y: 35, face: "s" };
    r.paint(ctx, opts);
    const inFrontOfTree = !equal(southBaseline, pixelAt(20 * 32 + 16, 35 * 32 + 24 - 39));
    positions.player = player;
    town.paused = fixture.paused;
    const saveUnchanged = JSON.stringify(town) === original;
    const timing = [];
    opts = { ...opts, minute: 1260 };
    for (let i = 0; i < 320; i++) {
      const start = performance.now();
      r.paint(ctx, opts);
      if (i >= 20) timing.push(performance.now() - start);
    }
    timing.sort((a, b) => a - b);
    return {
      pauseFreezesArt,
      ambientAnimates,
      replayFreezesArt,
      behindTree,
      inFrontOfTree,
      saveUnchanged,
      renderMs: {
        median: timing[Math.floor(timing.length * 0.5)],
        p95: timing[Math.floor(timing.length * 0.95)],
        samples: timing.length,
      },
    };
  }, fixture);
  await renderPage.emulateMedia({ reducedMotion: "reduce" });
  renderResult.reducedMotionStable = await renderPage.evaluate(async (fixture) => {
    const r = await import("/src/game/render.ts");
    const town = structuredClone(fixture);
    town.paused = false;
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const g = c.getContext("2d");
    const opts = {
      viewW: 800,
      viewH: 600,
      town,
      minute: town.minute,
      day: town.day,
      ...r.cameraFor(10, 21, 800, 600),
      positions: Object.fromEntries(town.agents.map((a) => [a.id, { ...a.tile, face: a.face }])),
      names: Object.fromEntries(town.agents.map((a) => [a.id, a.name])),
    };
    r.resetGlide(town);
    r.paint(g, opts);
    const before = g.getImageData(0, 0, 800, 600).data;
    await new Promise((resolve) => setTimeout(resolve, 100));
    r.paint(g, opts);
    const after = g.getImageData(0, 0, 800, 600).data;
    return before.every((v, i) => v === after[i]);
  }, fixture);

  for (const key of [
    "pauseFreezesArt",
    "ambientAnimates",
    "replayFreezesArt",
    "behindTree",
    "inFrontOfTree",
    "saveUnchanged",
    "reducedMotionStable",
  ])
    assert.equal(renderResult[key], true, key);
  results.renderer = renderResult;
  await renderContext.close();
} finally {
  await browser.close();
  await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
if (results.failures.length) process.exitCode = 1;
