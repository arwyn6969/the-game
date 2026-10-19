import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

// Disposable synthetic towns and ordinary controls only. No runtime imports,
// personal browser profile, provider calls, or direct storage writes.
export async function runUiEdgeChecks(browser, url, outputDirectory) {
  const target = new URL(url);
  assert.equal(target.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  const out = resolve(outputDirectory);
  await mkdir(out, { recursive: true });
  const report = { url: target.href, node: process.version, journeys: [], failures: [] };
  let activePage;
  const position = (page) =>
    page.evaluate(() => ({
      x: window.__controlsTest.getX(),
      y: window.__controlsTest.getY(),
    }));
  const saved = (page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
  try {
    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "phone", width: 390, height: 844 },
    ]) {
      const result = { viewport, errors: [], blockedProviderRequests: [] };
      report.journeys.push(result);
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.name === "phone",
        acceptDownloads: true,
      });
      await context.route("**/*", (route) => {
        const request = route.request(),
          requestUrl = new URL(request.url());
        if (requestUrl.origin !== target.origin)
          return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        if (request.method() === "POST" && requestUrl.pathname.includes("_serverFn")) {
          result.blockedProviderRequests.push(requestUrl.pathname);
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"ok":false}',
          });
        }
        return route.continue();
      });
      const page = (activePage = await context.newPage());
      page.on("pageerror", (error) => result.errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") result.errors.push(message.text());
      });
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page
        .getByLabel("What do they call you?", { exact: true })
        .fill(`UI edges ${viewport.name}`);
      await page.getByLabel("Use local dialogue only", { exact: true }).check();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      const tools = page.getByRole("navigation", { name: "Your town tools", exact: true });
      await tools.waitFor();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      async function assertFocus(locator, message) {
        await locator.waitFor();
        await page.waitForFunction(
          (element) => element === document.activeElement,
          await locator.elementHandle(),
        );
        assert.equal(
          await locator.evaluate((element) => element === document.activeElement),
          true,
          message,
        );
      }
      async function travel(place) {
        await tools.getByRole("button", { name: "Go somewhere", exact: true }).click();
        const before = await position(page);
        await page
          .locator(".player-tools")
          .getByRole("button", { name: place, exact: true })
          .click();
        await page.waitForFunction(
          ({ x, y }) => window.__controlsTest.getX() !== x || window.__controlsTest.getY() !== y,
          before,
        );
      }
      async function upload(raw, name = "synthetic-town.json") {
        const [chooser] = await Promise.all([
          page.waitForEvent("filechooser"),
          page.getByRole("button", { name: "Import", exact: true }).click(),
        ]);
        await chooser.setFiles({ name, mimeType: "application/json", buffer: Buffer.from(raw) });
        await page.getByRole("dialog", { name: "Replace the live town?", exact: true }).waitFor();
      }
      async function download() {
        const [file] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Download town", exact: true }).click(),
        ]);
        const chunks = [],
          stream = await file.createReadStream();
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks).toString("utf8");
      }
      async function libraryAction(name) {
        const button = page.getByRole("button", { name, exact: true, includeHidden: true });
        for (let attempt = 0; attempt < 5 && !(await button.isVisible()); attempt++) {
          const disclosure = button.locator("xpath=ancestor::details[not(@open)]").first();
          assert.ok(await disclosure.count());
          await disclosure.locator(":scope > summary").click();
        }
        await button.click();
      }

      // Escape must restore the same opener as the visible Close button does.
      for (const name of ["Journal", "Inventory", "Help & privacy"]) {
        const opener = tools.getByRole("button", { name, exact: true });
        await opener.click();
        await page.locator(".player-tools").waitFor();
        await page.keyboard.press("Escape");
        await page.locator(".player-tools").waitFor({ state: "hidden" });
        await assertFocus(opener, `${name}: Escape should restore its opener`);
      }
      result.escapeFocus = true;

      // Neither a single step nor a held direction may leak out of replay.
      const beforeReplay = await position(page);
      await page.getByLabel("Replay minute", { exact: true }).focus();
      await page.keyboard.press("ArrowLeft");
      await page.getByRole("button", { name: "Back to now", exact: true }).waitFor();
      await tools.getByRole("button", { name: "Go somewhere", exact: true }).click();
      const map = page.locator(".player-tools");
      assert.match(await map.innerText(), /Replay is view-only/);
      for (const name of ["North", "South", "East", "West", "Library"])
        assert.equal(await map.getByRole("button", { name, exact: true }).isDisabled(), true);
      assert.equal(
        await page
          .locator(".dpad")
          .getByRole("button", { name: "East", exact: true, includeHidden: true })
          .isDisabled(),
        true,
      );
      await page.screenshot({ path: join(out, `${viewport.name}-replay-tools.png`) });
      await page.getByRole("button", { name: "Close Go somewhere", exact: true }).click();
      await page.locator(".town-canvas").focus();
      await page.keyboard.down("ArrowRight");
      await page.getByRole("button", { name: "Back to now", exact: true }).click();
      await page.waitForTimeout(350);
      await page.keyboard.up("ArrowRight");
      assert.deepEqual(
        await position(page),
        beforeReplay,
        "Replay input must not move the live player later",
      );
      result.replayMovement = true;

      await travel("Library");
      await page.keyboard.press("Escape");
      const stopped = await position(page);
      await page.waitForTimeout(500);
      assert.deepEqual(
        await position(page),
        stopped,
        "Escape must stop the active destination route",
      );
      result.routeCancellation = true;
      const portable = await download();

      // Import is a real keyboard dialog: non-destructive initial focus, trapped
      // Tab navigation, Escape cancellation, and no continuing hidden route.
      await travel("Grocery");
      await upload(portable);
      const dialog = page.getByRole("dialog", { name: "Replace the live town?", exact: true });
      const keep = dialog.getByRole("button", { name: "Keep this town", exact: true });
      const replace = dialog.getByRole("button", { name: "Replace", exact: true });
      await assertFocus(keep, "Import should initially focus Keep this town");
      await page.keyboard.press("Tab");
      await assertFocus(replace, "Tab must remain inside the import dialog");
      await page.keyboard.press("Shift+Tab");
      await assertFocus(keep, "Reverse Tab must remain inside the import dialog");
      const reviewing = await position(page);
      await page.waitForTimeout(500);
      assert.deepEqual(await position(page), reviewing, "A route must stop before import review");
      await page.screenshot({ path: join(out, `${viewport.name}-import-dialog.png`) });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await assertFocus(
        page.getByRole("button", { name: "Import", exact: true }),
        "Cancel must restore Import focus",
      );
      await page.waitForTimeout(350);
      assert.deepEqual(await position(page), reviewing, "Cancelled import must not restart travel");
      const identity = (await saved(page)).playerName;
      await upload(portable);
      await page
        .getByRole("dialog", { name: "Replace the live town?", exact: true })
        .getByRole("button", { name: "Replace", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Replace the live town?", exact: true })
        .waitFor({ state: "hidden" });
      await assertFocus(
        page.getByRole("button", { name: "Import", exact: true }),
        "Confirmed import should return focus",
      );
      assert.equal((await saved(page)).playerName, identity);
      const importedPosition = await position(page);
      await page.waitForTimeout(350);
      assert.deepEqual(
        await position(page),
        importedPosition,
        "Import must not retain the old route",
      );
      result.importDialog = true;

      // A closed, unpaid project and an older save without a reading extension
      // must not acquire an invented fee, invitation or attendance on display.
      await tools.getByRole("button", { name: "Library project", exact: true }).click();
      await libraryAction("Accept source check · 2");
      await libraryAction("Close project and refund unspent funds");
      await page.getByText("Check not completed · no fee earned", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Close Library project", exact: true }).click();
      const old = JSON.parse(await download());
      delete old.town.economy.projects.library.evening;
      await upload(JSON.stringify(old), "synthetic-old-closed-project.json");
      await page
        .getByRole("dialog", { name: "Replace the live town?", exact: true })
        .getByRole("button", { name: "Replace", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Replace the live town?", exact: true })
        .waitFor({ state: "hidden" });
      await tools.getByRole("button", { name: "Library project", exact: true }).click();
      await page.getByText("Check not completed · no fee earned", { exact: true }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Go to the reading", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "Join the reading", exact: true }).count(),
        0,
      );
      await page.screenshot({ path: join(out, `${viewport.name}-closed-project.png`) });
      assert.equal((await saved(page)).agents.find((agent) => agent.id === "player").money, 4);
      assert.equal((await saved(page)).economy.projects.library.phase, "closed");
      result.oldClosedProject = true;
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      assert.equal(
        await page
          .locator(".player-tools")
          .evaluate((element) => element.scrollWidth > element.clientWidth + 1),
        false,
      );
      assert.deepEqual(result.blockedProviderRequests, []);
      assert.deepEqual(result.errors, []);
      await context.close();
    }
  } catch (error) {
    report.failures.push(error instanceof Error ? error.stack : String(error));
    if (activePage) await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  }
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const report = await runUiEdgeChecks(
      browser,
      process.env.GAME_UI_QA_URL || "http://127.0.0.1:8095/",
      process.env.GAME_UI_QA_OUT || "artifacts/quality-ui-edges",
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}
