import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

// Disposable synthetic towns and browser-only transport. Never attach to a
// personal browser or call a provider. Product auth/server modules stay intact.
const target = new URL(process.env.MANUSCRIPT_QA_URL || "http://127.0.0.1:8126/");
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const out = resolve(process.env.MANUSCRIPT_QA_OUT || "artifacts/manuscript-ui");
await mkdir(out, { recursive: true });
const report = {
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  target: target.href,
  syntheticTransport: true,
  liveCalls: 0,
  journeys: [],
  failures: [],
};
const mockModule = `
export async function mindAvailability() { return { online: true, configured: true, actions: globalThis.__physicalActionsAvailable !== false }; }
const mock = globalThis.__manuscriptMindMock ??= { calls: [], pending: new Map(), resolve(id, response) { const row=this.pending.get(id); if(row) {this.pending.delete(id);row.resolve(response);} }, reject(id) { const row=this.pending.get(id);if(row){this.pending.delete(id);row.reject(new Error('Synthetic unavailable'));}} };
export function thinkTown({data}) { if(data.kind !== 'act') return Promise.resolve({ok:false,error:'synthetic-offline'}); const id=mock.calls.length;mock.calls.push({id,user:data.user});return new Promise((resolve,reject)=>mock.pending.set(id,{resolve,reject})); }
`;
const browser = await chromium.launch({ headless: true });
let active;
const town = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
async function waitTown(page, predicate) {
  await page.waitForFunction(predicate);
}
async function seed(page, { item = false, near = true } = {}) {
  await page.goto(target.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.__manuscriptMindMock));
  await page.evaluate(
    async ({ item, near }) => {
      const { createTown } = await import("/src/game/town.ts");
      const { exportTown } = await import("/src/game/save.ts");
      const { initializePhysicalItems } = await import("/src/game/physical-items.ts");
      const value = createTown("Manuscript QA");
      value.paused = true;
      value.sawHint = true;
      value.guide = 3;
      value.agents.find((a) => a.id === "player").tile = { x: 40, y: 21 };
      value.agents.find((a) => a.id === "northern").tile = near ? { x: 39, y: 20 } : { x: 9, y: 7 };
      value.scrub = [
        {
          d: value.day,
          m: value.minute - 1,
          p: value.agents.flatMap((a) => [a.tile.x, a.tile.y]),
          ids: value.agents.map((a) => a.id),
        },
      ];
      if (item) initializePhysicalItems(value);
      localStorage.setItem("the-game-town-v2", exportTown(value));
      localStorage.setItem("the-game-local-dialogue-only", "false");
    },
    { item, near },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    Boolean(window.__game && window.__controlsTest && window.__manuscriptMindMock),
  );
}
async function closeInventory(page) {
  await page.getByRole("button", { name: "Close What you carry", exact: true }).click();
}
async function seedGroundRead(page, layout) {
  await page.goto(target.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.__manuscriptMindMock));
  await page.evaluate(async (layout) => {
    const { createTown } = await import("/src/game/town.ts");
    const { exportTown } = await import("/src/game/save.ts");
    const { initializePhysicalItems, applyPhysicalCommand } =
      await import("/src/game/physical-items.ts");
    const value = createTown("Ground reader QA");
    value.paused = true;
    value.sawHint = true;
    value.guide = 3;
    initializePhysicalItems(value);
    const actor = value.agents.find((person) => person.id === "northern");
    const player = value.agents.find((person) => person.id === "player");
    actor.tile = { x: 40, y: 20 };
    const item = () => value.physicalItems.items[0];
    if (
      !applyPhysicalCommand(value, "northern", {
        kind: "pick-up",
        itemId: item().id,
        itemRevision: item().revision,
      }).ok
    )
      throw new Error("Synthetic pickup failed");
    if (
      !applyPhysicalCommand(value, "northern", {
        kind: "write",
        itemId: item().id,
        itemRevision: item().revision,
        title: "Ground reading fixture",
        text: "FICTION: A small paper boat decides to stay exactly where it is.",
      }).ok
    )
      throw new Error("Synthetic writing failed");
    if (layout !== "other-held") {
      if (
        !applyPhysicalCommand(value, "northern", {
          kind: "put-down",
          itemId: item().id,
          itemRevision: item().revision,
        }).ok
      )
        throw new Error("Synthetic placement failed");
      actor.tile = { x: 39, y: 20 };
    }
    player.tile =
      layout === "same"
        ? { x: 40, y: 20 }
        : layout === "far"
          ? { x: 40, y: 23 }
          : layout === "diagonal"
            ? { x: 41, y: 21 }
            : { x: 40, y: 21 };
    localStorage.setItem("the-game-town-v2", exportTown(value));
    localStorage.setItem("the-game-local-dialogue-only", "false");
  }, layout);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__game && window.__controlsTest));
  await page.evaluate(() => document.fonts.ready);
}
async function openInventory(page) {
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
}
async function calls(page, count) {
  await page.waitForFunction((count) => window.__manuscriptMindMock.calls.length >= count, count);
}
async function respond(page, id, decision, known = true) {
  await page.evaluate(
    ({ id, decision, known }) =>
      window.__manuscriptMindMock.resolve(id, {
        ok: true,
        text: JSON.stringify({ decision }),
        ...(known ? { diagnostics: { mode: "pool", attempts: 1, totalTokens: 44 } } : {}),
      }),
    { id, decision, known },
  );
  await page.waitForTimeout(150);
}
async function capture(page, filename) {
  await page.screenshot({ path: join(out, filename), fullPage: false });
}
try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = { viewport, assertions: [], errors: [], externalRequests: [], mockedModules: 0 };
    report.journeys.push(result);
    const context = await browser.newContext({ viewport, hasTouch: viewport.name === "phone" });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== target.origin) {
        result.externalRequests.push(url.origin);
        return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      }
      if (url.pathname.includes("_serverFn"))
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"ok":false}',
        });
      return route.continue();
    });
    await context.route("**/src/lib/mind.functions.ts*", (route) => {
      result.mockedModules++;
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: mockModule,
      });
    });
    const page = (active = await context.newPage());
    page.on("pageerror", (error) => result.errors.push(error.message));
    for (const layout of ["same", "adjacent", "diagonal", "far", "other-held"]) {
      await seedGroundRead(page, layout);
      await openInventory(page);
      await page
        .locator(".manuscript-tools")
        .getByText("Inspect manuscript", { exact: true })
        .click();
      const read = page.getByRole("button", { name: "Read manuscript", exact: true });
      if (layout === "same" || layout === "adjacent") {
        assert.equal(await read.isEnabled(), true);
        const before = (await town(page)).physicalItems.items[0];
        const beforeCanvas = await page
          .locator("canvas[data-camx]")
          .evaluate((canvas) => canvas.toDataURL());
        await read.click();
        await page
          .getByText("FICTION: A small paper boat decides to stay exactly where it is.", {
            exact: true,
          })
          .waitFor();
        await page.waitForFunction(() =>
          JSON.parse(localStorage.getItem("the-game-town-v2"))
            .town.agents.find((person) => person.id === "player")
            .memories.some((memory) => memory.text.includes("read “Ground reading fixture”")),
        );
        assert.deepEqual((await town(page)).physicalItems.items[0], before);
        assert.equal(
          await page.locator("canvas[data-camx]").evaluate((canvas) => canvas.toDataURL()),
          beforeCanvas,
          "Ground reading must not draw a held manuscript or change the paused world image",
        );
        await closeInventory(page);
        await capture(page, `${viewport.name}-ground-read-${layout}.png`);
        if (layout === "adjacent") {
          await page.locator("canvas[data-camx]").focus();
          await page.keyboard.press("Enter");
          await page
            .getByLabel("Your line to Northern", { exact: true })
            .fill("May I read this here?");
          await page.getByRole("button", { name: "Close conversation", exact: true }).click();
          await page.locator("canvas[data-camx]").focus();
          await page.keyboard.press("Enter");
          assert.equal(
            await page.getByLabel("Your line to Northern", { exact: true }).inputValue(),
            "May I read this here?",
          );
          await page.getByRole("button", { name: "Close conversation", exact: true }).click();
          assert.deepEqual((await town(page)).physicalItems.items[0], before);
        }
      } else {
        assert.equal(await read.isDisabled(), true);
        assert.equal(
          await page
            .getByText("FICTION: A small paper boat decides to stay exactly where it is.", {
              exact: true,
            })
            .count(),
          0,
        );
        await closeInventory(page);
      }
    }
    result.assertions.push(
      "Same/cardinal-adjacent ground reads reveal actual text without transfer, item revision or paused canvas changes; diagonal/distant/other-held reads are disabled; conversation entry preserves its draft and item custody",
    );
    await seed(page, { near: false });
    await openInventory(page);
    await page.getByRole("button", { name: "Introduce manuscript", exact: true }).click();
    await waitTown(page, () =>
      Boolean(JSON.parse(localStorage.getItem("the-game-town-v2")).town.physicalItems),
    );
    assert.equal((await town(page)).physicalItems.items.length, 1);
    assert.equal((await town(page)).physicalItems.items[0].text, "");
    assert.equal(
      await page.getByRole("button", { name: "Watch Northern try", exact: true }).isDisabled(),
      true,
    );
    await page.getByText(/Invite Northern when they are beside or holding/).waitFor();
    result.assertions.push("Blank introduction once; distant resident invitation is disabled");
    await closeInventory(page);
    const canvas = page.locator("canvas[data-camx]");
    const point = await canvas.evaluate((canvas) => ({
      x: 40 * 32 + 16 - Number(canvas.dataset.camx),
      y: 20 * 32 + 18 - Number(canvas.dataset.camy),
    }));
    await canvas.click({ position: point });
    await page.getByRole("button", { name: "Pick up manuscript", exact: true }).click();
    await waitTown(
      page,
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.physicalItems.items[0].location
          .holder === "player",
    );
    await page.getByRole("button", { name: "Read manuscript", exact: true }).click();
    await page
      .getByText("The pages are blank. Nobody has written in it yet.", { exact: true })
      .waitFor();
    await closeInventory(page);
    for (const [key, direction] of [
      ["ArrowRight", "east"],
      ["ArrowLeft", "west"],
      ["ArrowUp", "north"],
      ["ArrowDown", "south"],
    ]) {
      await canvas.focus();
      if (viewport.name === "phone") {
        const label = direction[0].toUpperCase() + direction.slice(1);
        const box = await page.getByRole("button", { name: label, exact: true }).boundingBox();
        assert.ok(box);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
        });
        await page.waitForTimeout(95);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
      } else {
        await page.keyboard.down(key);
        await page.waitForTimeout(95);
        await page.keyboard.up(key);
      }
      await page.waitForTimeout(220);
      assert.equal((await town(page)).physicalItems.items[0].location.holder, "player");
      await capture(page, `${viewport.name}-carry-${direction}.png`);
    }
    await page.getByRole("slider", { name: "Replay minute", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await page.getByRole("button", { name: "Back to now", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Inspect manuscript", exact: true }).isDisabled(),
      true,
    );
    await capture(page, `${viewport.name}-replay.png`);
    await page.getByRole("button", { name: "Back to now", exact: true }).click();
    await openInventory(page);
    await page.getByRole("button", { name: "Put down manuscript", exact: true }).click();
    await waitTown(
      page,
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.physicalItems.items[0].location
          .kind === "ground",
    );
    await closeInventory(page);
    await page.getByRole("button", { name: "Inspect manuscript", exact: true }).click();
    await page.getByRole("button", { name: "Pick up manuscript", exact: true }).waitFor();
    await closeInventory(page);
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download town", exact: true }).click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = Buffer.concat(chunks).toString();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game));
    assert.equal((await town(page)).physicalItems.items[0].location.kind, "ground");
    await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
      name: "synthetic-manuscript.json",
      mimeType: "application/json",
      buffer: Buffer.from(exported),
    });
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    await page
      .getByRole("heading", { name: "Replace the live town?", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal((await town(page)).physicalItems.items.length, 1);
    result.assertions.push(
      "Canvas and accessible inspection; pickup/read/place; all four facing directions; reload/export/import preserve one item",
    );

    await seed(page, { item: true, near: true });
    await openInventory(page);
    await page.getByRole("button", { name: "Watch Northern try", exact: true }).click();
    await calls(page, 1);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    let item = (await town(page)).physicalItems.items[0];
    await respond(page, 0, { kind: "pick-up", itemId: item.id, itemRevision: item.revision });
    await waitTown(
      page,
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.physicalItems.items[0].location
          .holder === "northern",
    );
    await page.getByRole("button", { name: "1×", exact: true }).click();
    await calls(page, 2);
    const beforeMovement = await page.evaluate(() => ({
      minute: JSON.parse(localStorage.getItem("the-game-town-v2")).town.minute,
      x: window.__controlsTest.getX(),
    }));
    await canvas.focus();
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(95);
    await page.keyboard.up("ArrowRight");
    await page.waitForFunction((minute) => {
      const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      return !document.querySelector(".hud-clock")?.textContent.includes(clock);
    }, beforeMovement.minute);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(
      (minute) => JSON.parse(localStorage.getItem("the-game-town-v2")).town.minute !== minute,
      beforeMovement.minute,
    );
    assert.notEqual((await town(page)).minute, beforeMovement.minute);
    assert.notEqual(await page.evaluate(() => window.__controlsTest.getX()), beforeMovement.x);
    item = (await town(page)).physicalItems.items[0];
    await respond(
      page,
      1,
      {
        kind: "write",
        itemId: item.id,
        itemRevision: item.revision,
        title: "Synthetic programme",
        text: "A synthetic scene written to exercise the physical command boundary.",
      },
      false,
    );
    await waitTown(
      page,
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.physicalItems.items[0].author ===
        "northern",
    );
    await page.getByRole("button", { name: "1×", exact: true }).click();
    await calls(page, 3);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    item = (await town(page)).physicalItems.items[0];
    await respond(page, 2, { kind: "read", itemId: item.id, itemRevision: item.revision });
    await capture(page, `${viewport.name}-resident-read.png`);
    await page.getByRole("button", { name: "1×", exact: true }).click();
    await calls(page, 4);
    await respond(page, 3, { kind: "wait" });
    await page.waitForTimeout(1250);
    assert.equal(await page.evaluate(() => window.__manuscriptMindMock.calls.length), 4);
    const usage = (await town(page)).physicalItems.session.usage;
    assert.equal(usage.requests, 4);
    assert.equal(usage.tokenSamples, 3);
    assert.equal(usage.tokensUnknown, 1);
    assert.equal(usage.knownTokens, 132);
    result.assertions.push(
      "Actual act parser/executor through synthetic transport: pickup, original write, read, wait parks; unknown usage remains unknown",
    );
    await openInventory(page);
    await page.evaluate(() =>
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      }),
    );
    await page.getByRole("button", { name: "Start another bounded trial", exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__manuscriptMindMock.calls.length), 4);
    await page.evaluate(() => {
      delete document.visibilityState;
    });
    await calls(page, 5);
    await openInventory(page);
    await page.getByRole("button", { name: "Stop resident trial", exact: true }).click();
    const stopped = (await town(page)).physicalItems.items[0];
    await respond(page, 4, {
      kind: "put-down",
      itemId: stopped.id,
      itemRevision: stopped.revision,
    });
    assert.deepEqual((await town(page)).physicalItems.items[0], stopped);
    result.assertions.push(
      "Stopped trial rejects its delayed response without changing custody/content",
    );
    await capture(page, `${viewport.name}-stopped.png`);
    await page.getByRole("button", { name: "Start another bounded trial", exact: true }).click();
    await calls(page, 6);
    const beforeFailure = (await town(page)).physicalItems.items[0];
    await page.evaluate(() => window.__manuscriptMindMock.reject(5));
    await waitTown(
      page,
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.physicalItems.session.enabled ===
        false,
    );
    assert.deepEqual((await town(page)).physicalItems.items[0], beforeFailure);
    assert.equal((await town(page)).physicalItems.session.usage.failures, 1);
    result.assertions.push(
      "Touch/keyboard carrying and replay exclusion; valid delayed action survives player/time changes; hidden tabs dispatch no new request; unavailable inference pauses without fallback",
    );
    assert.ok(result.mockedModules > 0);
    assert.deepEqual(result.errors, []);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await context.close();
  }
} catch (error) {
  report.failures.push(error.stack || String(error));
  if (active) await capture(active, "failure.png").catch(() => {});
} finally {
  await writeFile(join(out, "browser-results.json"), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
