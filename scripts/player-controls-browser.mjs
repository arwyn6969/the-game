import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

/** Ordinary inputs in disposable local towns; game hooks are read only. */
export async function runPlayerControlChecks(browser, url, outputDirectory) {
  const target = new URL(url);
  assert.equal(target.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
  const out = resolve(outputDirectory);
  await mkdir(out, { recursive: true });
  const report = { url: target.href, localOnly: true, journeys: [], failures: [] };
  let activePage;
  try {
    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "phone", width: 390, height: 844 },
    ]) {
      const result = { viewport, errors: [], blockedProviderRequests: [] };
      report.journeys.push(result);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.name === "phone",
      });
      await context.route("**/*", async (route) => {
        const request = route.request(),
          resource = new URL(request.url());
        if (resource.origin !== target.origin)
          return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        if (request.method() === "POST" && resource.pathname.includes("_serverFn")) {
          result.blockedProviderRequests.push(resource.pathname);
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
      const position = () =>
        page.evaluate(() => ({
          x: window.__controlsTest.getX(),
          y: window.__controlsTest.getY(),
        }));
      const saved = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
      const tools = page.getByRole("navigation", { name: "Your town tools", exact: true });
      const canvas = page.locator("canvas.town-canvas");
      async function focusedTown() {
        await page.getByRole("button", { name: "Town controls", exact: true }).click();
        await page.waitForFunction(
          () => document.activeElement === document.querySelector("canvas.town-canvas"),
        );
      }
      async function tapMovement(kind) {
        const before = await position();
        const direction = await page.evaluate(
          ({ before, kind }) => {
            const people = JSON.parse(localStorage.getItem("the-game-town-v2")).town.agents;
            return [
              { key: kind === "letter" ? "d" : "ArrowRight", x: before.x + 1, y: before.y },
              { key: kind === "letter" ? "a" : "ArrowLeft", x: before.x - 1, y: before.y },
              { key: kind === "letter" ? "s" : "ArrowDown", x: before.x, y: before.y + 1 },
              { key: kind === "letter" ? "w" : "ArrowUp", x: before.x, y: before.y - 1 },
            ].find(
              (point) =>
                window.__game.tile(point.x, point.y)?.block === false &&
                !people.some(
                  (person) =>
                    person.id !== "player" &&
                    person.tile.x === point.x &&
                    person.tile.y === point.y,
                ),
            );
          },
          { before, kind },
        );
        assert.ok(direction, "The synthetic player needs a free adjacent movement tile");
        // No artificial hold: a quick press can begin and end between animation frames.
        await page.keyboard.press(direction.key);
        await page.waitForFunction(
          ({ x, y }) => window.__controlsTest.getX() === x && window.__controlsTest.getY() === y,
          direction,
          { timeout: 3_000 },
        );
        return { before, after: await position(), input: direction.key };
      }
      async function go(place) {
        await tools.getByRole("button", { name: "Go somewhere", exact: true }).click();
        await page
          .getByRole("dialog", { name: "Go somewhere", exact: true })
          .getByRole("button", { name: place, exact: true })
          .click();
        await page
          .locator(".status-message")
          .filter({ hasText: `You reached ${place}` })
          .waitFor({ timeout: 20_000 });
      }

      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page
        .getByLabel("What do they call you?", { exact: true })
        .fill(`Controls ${viewport.name}`);
      await page.getByLabel("Use local dialogue only", { exact: true }).check();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const pausedMinute = (await saved()).minute;

      await tools.getByRole("button", { name: "Inventory", exact: true }).click();
      assert.equal(
        /AI request cancelled/.test(
          await page.getByRole("dialog", { name: "What you carry" }).innerText(),
        ),
        false,
        "Choosing local-only without an active request must not invent a cancellation",
      );
      await page.getByRole("button", { name: "Close What you carry", exact: true }).click();
      result.cleanLocalFeedback = true;

      // Empty scenery at the lower-left of the initial view, away from named map targets.
      const canvasSize = await canvas.boundingBox();
      assert.ok(canvasSize);
      await canvas.click({ position: { x: 12, y: canvasSize.height - 12 } });
      assert.equal(await canvas.evaluate((element) => document.activeElement === element), true);
      result.canvasClickFocus = true;

      await focusedTown();
      result.quickLetter = await tapMovement("letter");
      await focusedTown();
      result.quickArrow = await tapMovement("arrow");
      assert.equal(
        (await saved()).minute,
        pausedMinute,
        "Movement must work while town time stays paused",
      );

      const beforeControl = await position();
      await page.getByRole("button", { name: "Pause", exact: true }).focus();
      await page.keyboard.press("d");
      await page.waitForTimeout(120);
      assert.deepEqual(
        await position(),
        beforeControl,
        "Focused buttons must keep their keyboard semantics",
      );

      const slider = page.getByRole("slider", { name: "Replay minute", exact: true });
      await slider.focus();
      const latest = Number(await slider.inputValue());
      await page.keyboard.press("ArrowLeft");
      assert.equal(
        Number(await slider.inputValue()),
        latest - 1,
        "Arrow keys still operate the focused replay slider",
      );
      await page.getByRole("button", { name: "Back to now", exact: true }).waitFor();
      const beforeReplayKey = await position();
      await page.keyboard.press("w");
      await page.waitForTimeout(120);
      assert.deepEqual(await position(), beforeReplayKey, "Replay must not move the live player");
      await page.screenshot({ path: join(out, `${viewport.name}-replay.png`) });
      await page.getByRole("button", { name: "Back to now", exact: true }).click();
      await page.waitForFunction(
        () => document.activeElement === document.querySelector("canvas.town-canvas"),
      );
      result.afterReplay = await tapMovement("letter");
      result.focusAndReplay = true;

      await go("Hobbs Cafe");
      await page
        .getByRole("group", { name: "Talk nearby", exact: true })
        .getByRole("button", { name: "Talk with Kevin", exact: true })
        .click();
      const line = page.getByLabel("Your line to Kevin", { exact: true });
      await line.fill("Hello");
      const beforeTyping = await position();
      await line.press("d");
      await line.press("ArrowRight");
      await page.waitForTimeout(120);
      assert.deepEqual(await position(), beforeTyping, "Typing a line must not move the player");
      await line.fill("Hello");
      await page.getByRole("button", { name: "Say it", exact: true }).click();
      await page.waitForFunction(() =>
        /They answered with local dialogue/.test(
          document.querySelector(".mind-send-note")?.textContent || "",
        ),
      );
      await page.getByRole("button", { name: "Close conversation", exact: true }).click();
      await page.getByRole("region", { name: "Conversation captions", exact: true }).waitFor();
      await go("Library");
      const caption = page.getByRole("region", { name: "Conversation captions", exact: true });
      await caption.waitFor();
      const board = page.getByRole("button", { name: "Library board", exact: true });
      result.layouts = [];
      for (const skin of ["plaza-cream", "hobbs-hearth", "library-ink", "original"]) {
        await page.getByRole("combobox", { name: "Interface", exact: true }).selectOption(skin);
        await page.waitForFunction(
          (expected) => document.querySelector(".game-appearance")?.dataset.uiSkin === expected,
          skin,
        );
        const layout = await page.evaluate(() => {
          const controls = document.querySelector(".world-controls").getBoundingClientRect();
          const world = document.querySelector(".world-frame").getBoundingClientRect();
          return {
            width: controls.width,
            left: controls.left,
            right: controls.right,
            bottom: controls.bottom,
            worldTop: world.top,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            viewportWidth: innerWidth,
          };
        });
        assert.ok(layout.width >= 200, `${skin}: controls must have a usable row width`);
        assert.ok(layout.bottom <= layout.worldTop + 1, `${skin}: controls must precede the world`);
        assert.ok(
          layout.left >= -1 && layout.right <= layout.viewportWidth + 1,
          `${skin}: controls must fit the viewport`,
        );
        assert.equal(layout.horizontalOverflow, false, `${skin}: no horizontal overflow`);
        await board.scrollIntoViewIfNeeded();
        assert.equal(
          await board.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return top === element || element.contains(top);
          }),
          true,
          `${skin}: Library board must be reachable while an exchange caption is visible`,
        );
        result.layouts.push({ skin, ...layout });
        await page.screenshot({ path: join(out, `${viewport.name}-${skin}-caption-controls.png`) });
      }
      await board.click();
      await page.getByRole("dialog", { name: "Library project", exact: true }).waitFor();
      await page.getByRole("button", { name: "Close Library project", exact: true }).click();
      result.captionDoesNotCoverLibrary = true;

      assert.deepEqual(
        result.blockedProviderRequests,
        [],
        "The local-only journey must not request inference",
      );
      assert.deepEqual(result.errors, [], "The control journey must not hide browser errors");
      await context.close();
    }
  } catch (error) {
    report.failures.push(error instanceof Error ? error.stack || error.message : String(error));
    if (activePage) {
      await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => {});
      await writeFile(
        join(out, "failure-body.txt"),
        await activePage
          .locator("body")
          .innerText()
          .catch(() => "Unavailable"),
      );
    }
  } finally {
    await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  }
  if (report.failures.length) throw new Error(report.failures.join("\n"));
  return report.journeys;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const browser = await chromium.launch({ headless: true });
  try {
    await runPlayerControlChecks(
      browser,
      process.env.GAME_PLAYER_QA_URL || "http://127.0.0.1:8098/",
      process.env.GAME_PLAYER_QA_OUT || "artifacts/player-controls-browser",
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
