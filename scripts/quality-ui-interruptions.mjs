import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

// Only isolated synthetic towns and ordinary controls. Storage and test
// positions are read for assertions; no game imports, writes, or paid requests.
export async function runUiInterruptionChecks(browser, url, outputDirectory) {
  const target = new URL(url);
  assert.equal(target.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  const out = resolve(outputDirectory);
  await mkdir(out, { recursive: true });
  const report = { url: target.href, node: process.version, journeys: [], failures: [] };
  let activePage;
  try {
    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "phone", width: 390, height: 844 },
    ]) {
      const result = { viewport, errors: [], blockedProviderRequests: [] };
      report.journeys.push(result);
      const context = await browser.newContext({ viewport, hasTouch: viewport.name === "phone" });
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
        .fill(`Interruption ${viewport.name}`);
      await page.getByLabel("Use local dialogue only", { exact: true }).check();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      const nav = page.getByRole("navigation", { name: "Your town tools", exact: true });
      await nav.waitFor();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const position = () =>
        page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));
      async function focused(locator) {
        await page.waitForFunction(
          (element) => element === document.activeElement,
          await locator.elementHandle(),
        );
      }
      async function onePanel(locator) {
        await locator.waitFor();
        assert.equal(
          await page.locator(".mind").count(),
          1,
          "An opened view must replace its predecessor",
        );
      }
      const kevin = page.getByRole("button", { name: "View Kevin's character card", exact: true });
      const card = page.getByRole("complementary", { name: "Talk with Kevin", exact: true });
      await nav.getByRole("button", { name: "Inventory", exact: true }).click();
      await kevin.click();
      await onePanel(card);
      assert.equal(await page.locator(".player-tools").count(), 0);
      result.residentReplacesTool = true;

      const beforeTabs = await position();
      const overview = page.getByRole("tab", { name: "Overview", exact: true });
      await overview.focus();
      for (const [key, name] of [
        ["ArrowRight", "Strengths"],
        ["ArrowRight", "Together"],
        ["End", "Progress"],
        ["Home", "Overview"],
        ["ArrowLeft", "Progress"],
      ]) {
        await page.keyboard.press(key);
        const tab = page.getByRole("tab", { name, exact: true });
        await focused(tab);
        assert.equal(await tab.getAttribute("aria-selected"), "true");
        assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
      }
      assert.deepEqual(
        await position(),
        beforeTabs,
        "Card arrow navigation must not walk the player",
      );
      await page.screenshot({ path: join(out, `${viewport.name}-keyboard-card.png`) });
      result.keyboardTabs = true;

      await nav.getByRole("button", { name: "Library project", exact: true }).click();
      await onePanel(page.getByRole("dialog", { name: "Library project", exact: true }));
      assert.equal(await card.count(), 0);
      await page.getByRole("button", { name: "Accept source check · 2", exact: true }).click();
      const boardButton = page.getByRole("button", { name: /^Board ·/ });
      // Keyboard activation also covers a footer control that may sit below
      // the open panel on a small viewport.
      await boardButton.focus();
      await page.keyboard.press("Enter");
      const board = page.getByRole("dialog", { name: "Noticeboard", exact: true });
      await onePanel(board);
      await focused(page.getByRole("button", { name: "Close board", exact: true }));
      const boardBox = await board.boundingBox();
      const navBox = await nav.boundingBox();
      assert.ok(
        boardBox.y >= navBox.y + navBox.height,
        "The board must leave town navigation visible",
      );
      await page.screenshot({ path: join(out, `${viewport.name}-noticeboard.png`) });
      await nav.getByRole("button", { name: "Help & privacy", exact: true }).click();
      await onePanel(page.getByRole("dialog", { name: "Help & privacy", exact: true }));
      assert.equal(await board.count(), 0);
      const helpClose = page.getByRole("button", { name: "Close Help & privacy", exact: true });
      assert.equal(
        await helpClose.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
        true,
        "Newly selected tools must not be covered by an old board",
      );
      await helpClose.click();
      await boardButton.click();
      await focused(page.getByRole("button", { name: "Close board", exact: true }));
      await page.keyboard.press("Escape");
      await focused(boardButton);
      await boardButton.click();
      await page.getByRole("button", { name: "Close board", exact: true }).click();
      await focused(boardButton);
      await boardButton.click();
      await kevin.click();
      await onePanel(card);
      assert.equal(await board.count(), 0);
      await nav.getByRole("button", { name: "Journal", exact: true }).click();
      await page.getByRole("button", { name: "Close Your journal", exact: true }).click();
      assert.equal(
        await page.locator(".mind").count(),
        0,
        "Closing a replacement view must not reveal a hidden predecessor",
      );
      const snapshot = await page.evaluate(
        () => JSON.parse(localStorage.getItem("the-game-town-v2")).town,
      );
      assert.equal(snapshot.agents.find((agent) => agent.id === "player").money, 4);
      assert.equal(snapshot.economy.projectBalances["project:library-index"], 8);
      result.exclusivePanels = true;
      result.boardFocus = true;
      result.moneyUnchangedByPanels = true;

      if (viewport.name === "phone") {
        const button = page.locator(".dpad").getByRole("button", { name: "East", exact: true });
        const box = await button.boundingBox();
        assert.ok(box);
        const before = await position();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
        });
        await page.waitForTimeout(250);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
        const cancelled = await position();
        assert.notDeepEqual(cancelled, before, "A real held touch should move before cancellation");
        await page.waitForTimeout(400);
        assert.deepEqual(
          await position(),
          cancelled,
          "Cancelled touch must not leave a held direction",
        );
        await cdp.detach();
        result.touchCancellation = true;
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.blockedProviderRequests, []);
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
    const report = await runUiInterruptionChecks(
      browser,
      process.env.GAME_UI_QA_URL || "http://127.0.0.1:8095/",
      process.env.GAME_UI_QA_OUT || "artifacts/quality-ui-interruptions",
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}
