import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

// Ordinary controls only. Every browser context and town is disposable, and
// storage is read only to assert results; no runtime imports or game hooks.
export async function runReadingEveningChecks(browser, url, outputDirectory) {
  const target = new URL(url);
  assert.equal(target.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
  const out = resolve(outputDirectory);
  await mkdir(out, { recursive: true });
  const report = {
    url: target.href,
    ordinaryControls: true,
    localOnly: true,
    journeys: [],
    failures: [],
  };
  let activePage;
  const total = (town) =>
    town.agents.reduce((sum, agent) => sum + agent.money, 0) +
    town.tills.cafe +
    town.tills.grocery +
    Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
  const player = (town) => town.agents.find((agent) => agent.id === "player");
  try {
    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "phone", width: 390, height: 844 },
    ]) {
      const result = { viewport, errors: [], blockedProviderRequests: [], readings: [] };
      report.journeys.push(result);
      const context = await browser.newContext({ viewport, hasTouch: viewport.name === "phone" });
      await context.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin !== target.origin)
          return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        if (request.method() === "POST" && url.pathname.includes("_serverFn")) {
          result.blockedProviderRequests.push(url.pathname);
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
      const saved = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
      const state = async () => (await saved()).economy?.projects?.library;
      const tools = page.getByRole("navigation", { name: "Your town tools", exact: true });
      const library = () =>
        tools.getByRole("button", { name: "Library project", exact: true }).click();
      const close = () =>
        page.getByRole("button", { name: "Close Library project", exact: true }).click();
      async function reveal(locator) {
        for (let attempt = 0; attempt < 6 && !(await locator.isVisible()); attempt++) {
          const disclosure = locator.locator("xpath=ancestor::details[not(@open)]").first();
          assert.ok(
            await disclosure.count(),
            "A hidden essential action needs an ordinary disclosure",
          );
          await disclosure.locator(":scope > summary").click();
        }
        assert.equal(await locator.isVisible(), true);
      }
      async function action(name) {
        const before = (await state())?.actionRevision ?? -1;
        const button = page.getByRole("button", {
          name,
          exact: typeof name === "string",
          includeHidden: true,
        });
        assert.equal(await button.count(), 1, `Expected one ordinary action ${String(name)}`);
        await reveal(button);
        assert.equal(await button.isEnabled(), true, await button.innerText());
        await button.click();
        await page.waitForFunction(
          (previous) =>
            (JSON.parse(localStorage.getItem("the-game-town-v2")).town.economy?.projects?.library
              ?.actionRevision ?? -1) > previous,
          before,
        );
      }
      async function arrived() {
        await page
          .locator(".status-message")
          .filter({ hasText: /^You reached / })
          .waitFor({ timeout: 20_000 });
      }
      async function checkpoint() {
        await close();
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Download town", exact: true }).click(),
        ]);
        const stream = await download.createReadStream(),
          chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
      }
      async function importCheckpoint(portable) {
        await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
          name: "synthetic-reading-checkpoint.json",
          mimeType: "application/json",
          buffer: portable,
        });
        await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
        await page.getByRole("button", { name: "Replace", exact: true }).click();
        await page
          .getByRole("heading", { name: "Replace the live town?", exact: true })
          .waitFor({ state: "hidden" });
        await page.waitForFunction(() => {
          const e = JSON.parse(localStorage.getItem("the-game-town-v2")).town.economy.projects
            .library.evening;
          return e.status === "invited" && e.choice === null;
        });
        await library();
      }
      async function finishGuests() {
        for (
          let attempt = 0;
          attempt < 20 && (await state()).evening.status === "routing";
          attempt++
        )
          await action("Wait for your guests · 10 game minutes");
        assert.equal(
          (await state()).evening.status,
          "ready",
          "Guests must arrive before the scene",
        );
        const guests = page.getByRole("list", { name: "Reading guests", exact: true });
        assert.equal(await guests.locator('li[data-arrived="false"]').count(), 0);
      }
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page
        .getByLabel("What do they call you?", { exact: true })
        .fill(`Reading ${viewport.name}`);
      await page.getByLabel("Use local dialogue only", { exact: true }).check();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      await library();
      await action("Accept reference check · 2");
      await close();
      await tools.getByRole("button", { name: "Go somewhere", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Go somewhere", exact: true })
        .getByRole("button", { name: "Library", exact: true })
        .click();
      await arrived();
      await library();
      for (const name of [
        "Read Kevin's reference card",
        "Inspect Birch",
        "Inspect Alder",
        "Inspect Cedar",
        "Read the equipment source card",
        "Read the dormitory source card",
      ])
        await action(name);
      await action("Submit reference check · earn 2");
      await action("Request source check · pay Arwyn 2");
      assert.deepEqual((await state()).draft, {
        "hobbs-equipment": "Birch",
        "dorm-repair": "Alder",
        "room-access": "Cedar",
      });
      await action("Submit your index");
      result.observedMappingsSubmittedWithoutTranscription = true;
      await action("Test this index · Northern earns 2");
      await action(/^Wait for lookup · \d+ game minutes$/);
      assert.equal((await state()).lookup.status, "done");
      assert.equal((await state()).lookup.result, "success");
      const prepared = await checkpoint();
      await writeFile(join(out, `${viewport.name}-synthetic-checkpoint.json`), prepared);
      await library();
      for (const venue of ["park", "library"]) {
        if (venue === "library") {
          await close();
          await importCheckpoint(prepared);
        }
        const before = await saved();
        const positions = before.agents.map(({ id, tile }) => ({ id, tile }));
        await action(venue === "park" ? "Plan a small park reading" : "Wait for a library reading");
        assert.deepEqual(
          (await saved()).agents.map(({ id, tile }) => ({ id, tile })),
          positions,
          "Accepting an invitation cannot teleport its guests",
        );
        if (venue === "library") {
          assert.equal((await state()).evening.status, "waiting");
          await action(/^Wait for Baba's note · \d+ game minutes$/);
          assert.equal((await state()).delivery, true);
        }
        await page.getByRole("button", { name: "Go to the reading", exact: true }).click();
        await arrived();
        assert.deepEqual(
          player(await saved()).tile,
          venue === "park" ? { x: 22, y: 35 } : { x: 43, y: 21 },
          "Reading navigation must reach the free player place rather than occupying a guest seat",
        );
        await library();
        const kind = venue === "park" ? "bread" : "tea";
        const beforeSale = await saved();
        await action(`Order ${kind} for the reading · 2`);
        const afterSale = await saved();
        assert.equal(player(afterSale).money, player(beforeSale).money - 2);
        const till = kind === "bread" ? "grocery" : "cafe";
        assert.equal(afterSale.tills[till], beforeSale.tills[till] + 2);
        assert.deepEqual(afterSale.favors, beforeSale.favors);
        assert.equal(total(afterSale), total(beforeSale));
        await finishGuests();
        await action(venue === "park" ? "Join the reading" : "Read a first line of your own");
        const completed = await state();
        assert.equal(completed.evening.status, "done");
        assert.equal(completed.evening.attendedByPlayer, true);
        assert.equal(completed.evening.participation, venue === "park" ? "listen" : "read");
        const scene = await page
          .getByRole("region", { name: "The first page", exact: true })
          .innerText();
        assert.match(scene, /Northern reads/);
        if (venue === "library") assert.match(scene, /I only moved here recently/);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
        );
        await page
          .getByRole("region", { name: "The first page", exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(out, `${viewport.name}-${venue}-scene.png`) });
        const portable = await checkpoint();
        await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
          name: "synthetic-completed-reading.json",
          mimeType: "application/json",
          buffer: portable,
        });
        await page.getByRole("button", { name: "Replace", exact: true }).click();
        await page
          .getByRole("heading", { name: "Replace the live town?", exact: true })
          .waitFor({ state: "hidden" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await library();
        assert.deepEqual((await state()).evening, completed.evening);
        assert.equal(
          await page.getByRole("region", { name: "The first page", exact: true }).innerText(),
          scene,
        );
        assert.equal(
          await page.getByRole("button", { name: "Join the reading", exact: true }).count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", { name: `Order ${kind} for the reading · 2`, exact: true })
            .count(),
          0,
        );
        assert.equal(total(await saved()), 90);
        result.readings.push({
          venue,
          guests: venue === "park" ? 2 : 3,
          participation: completed.evening.participation,
          optionalPurchase: kind,
          paid: 2,
          totalCoins: 90,
          portableImportReload: true,
          scene,
        });
      }
      assert.deepEqual(result.blockedProviderRequests, []);
      assert.deepEqual(result.errors, []);
      await context.close();
      activePage = undefined;
      console.log(
        JSON.stringify({ viewport: viewport.name, ok: true, readings: result.readings.length }),
      );
    }
  } catch (error) {
    report.failures.push(
      error instanceof Error
        ? `${error.message}\n${error.stack?.split("\n").slice(1, 4).join("\n")}`
        : String(error),
    );
    if (activePage) {
      await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => {});
      const raw = await activePage
        .evaluate(() => localStorage.getItem("the-game-town-v2"))
        .catch(() => null);
      if (raw) await writeFile(join(out, "failure-synthetic-town.json"), raw);
      await writeFile(
        join(out, "failure-body.txt"),
        await activePage
          .locator("body")
          .innerText()
          .catch(() => "Unavailable"),
      );
    }
    console.error(JSON.stringify({ ok: false, failures: report.failures }));
  } finally {
    await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  }
  if (report.failures.length) throw new Error(report.failures.join("\n"));
  return report.journeys;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const browser = await chromium.launch({ headless: true });
  try {
    await runReadingEveningChecks(
      browser,
      process.env.GAME_READING_QA_URL || "http://127.0.0.1:8095/",
      process.env.GAME_READING_QA_OUT || "artifacts/reading-evening-browser",
    );
  } catch {
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
