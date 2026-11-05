import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Ordinary controls in disposable contexts; no hosted inference or personal town. */
export async function runCharacterChecks(browser, target, out) {
  await mkdir(out, { recursive: true });
  const oldRaw = await readFile(
    new URL("./fixtures/legacy-eight-resident-town.json", import.meta.url),
    "utf8",
  );
  const oldTown = JSON.parse(oldRaw).town;
  const report = [];
  const saved = (page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
  async function importTown(page, town) {
    await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
      name: "synthetic-character-review.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 2, town })),
    });
    await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    await page
      .getByRole("heading", { name: "Replace the live town?", exact: true })
      .waitFor({ state: "hidden" });
    await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
  }
  for (const viewport of [
    { width: 1280, height: 800, name: "desktop" },
    { width: 390, height: 844, name: "phone" },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      acceptDownloads: true,
    });
    const result = {
      viewport: viewport.name,
      legacyArrival: false,
      conversations: [],
      facilitators: [],
      errors: [],
      screenshots: [],
    };
    report.push(result);
    try {
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === new URL(target).origin
          ? route.continue()
          : route.fulfill({ status: 200, contentType: "text/css", body: "" }),
      );
      await context.addInitScript((raw) => {
        if (!localStorage.getItem("the-game-town-v2"))
          localStorage.setItem("the-game-town-v2", raw);
        localStorage.setItem("the-game-local-dialogue-only", "true");
      }, oldRaw);
      const page = await context.newPage();
      page.on("pageerror", (error) => result.errors.push(error.message));
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
      // Loading preserves the original bytes until an ordinary save-triggering
      // action. Pause persists the arrivals without waiting for the hourly save.
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.waitForFunction(
        () =>
          !!window.__game &&
          !!window.__controlsTest &&
          JSON.parse(localStorage.getItem("the-game-town-v2")).town.agents.length === 10,
      );
      let town = await saved(page);
      assert.equal(town.identityRegistry.worldId, oldTown.identityRegistry.worldId);
      for (const previous of oldTown.agents)
        assert.deepEqual(
          town.identityRegistry.characters[previous.id],
          oldTown.identityRegistry.characters[previous.id],
        );
      assert.ok(
        await page.evaluate(
          (raw) =>
            Object.keys(localStorage).some(
              (key) =>
                key.startsWith("the-game-town-backup-v1:") && localStorage.getItem(key) === raw,
            ),
          oldRaw,
        ),
      );
      assert.equal(
        await page
          .getByRole("navigation", { name: "Town residents", exact: true })
          .getByRole("button")
          .count(),
        10,
      );
      result.legacyArrival = true;
      for (const [id, name, question, answer] of [
        ["socrates", "Socrates", "Can you help me examine fairness?", "concrete case"],
        ["estee", "Estée", "How could I market something?", "one person and one useful benefit"],
      ]) {
        town = await saved(page);
        town.paused = true;
        town.agents.find((a) => a.id === "player").tile = { x: 26, y: 22 };
        town.agents.find((a) => a.id === id).tile = { x: 26, y: 23 };
        for (const a of town.agents) a.path = [];
        await importTown(page, town);
        await page
          .getByRole("button", { name: `View ${name}'s character card`, exact: true })
          .click();
        await page.getByRole("tab", { name: "Together", exact: true }).click();
        await page.getByLabel(`Your line to ${name}`, { exact: true }).fill(question);
        await page.getByRole("button", { name: "Say it", exact: true }).click();
        await page.waitForFunction(
          ({ id, answer }) =>
            JSON.parse(localStorage.getItem("the-game-town-v2"))
              .town.agents.find((a) => a.id === id)
              .memories.some((m) =>
                m.turns?.some((t) => t.speaker === id && t.text.includes(answer)),
              ),
          { id, answer },
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
        );
        const path = join(out, `${viewport.name}-${id}.png`);
        await page.screenshot({ path });
        result.screenshots.push(path);
        await page.getByRole("button", { name: "Close conversation", exact: true }).click();
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!window.__game && !!window.__controlsTest);
        const restored = await saved(page);
        assert.ok(
          restored.agents
            .find((a) => a.id === id)
            .memories.some((m) =>
              m.turns?.some((t) => t.speaker === id && t.text.includes(answer)),
            ),
        );
        assert.deepEqual(restored.economy.transactions, oldTown.economy.transactions);
        result.conversations.push({
          id,
          localDialogue: true,
          reloadRetained: true,
          noTransactions: true,
        });
      }
      const baseline = await saved(page);
      for (const facilitator of ["socrates", "estee"]) {
        await importTown(page, baseline);
        const life = page.getByRole("button", { name: /Town life/ });
        if ((await life.getAttribute("aria-expanded")) !== "true") await life.click();
        await page.getByRole("button", { name: "Library meeting", exact: true }).click();
        await page.getByLabel("Enable library meetings (experimental)", { exact: true }).check();
        await page.getByLabel("Proposed facilitator", { exact: true }).selectOption(facilitator);
        await page
          .getByLabel("Propose one topic", { exact: true })
          .fill("What makes a useful invitation?");
        await page.getByRole("button", { name: "Propose library meeting", exact: true }).click();
        await page.waitForFunction(
          (id) =>
            JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions?.sessions.at(-1)
              ?.facilitator === id,
          facilitator,
        );
        const meeting = (await saved(page)).discussions.sessions.at(-1);
        assert.equal(meeting.members.length, 4);
        assert.equal(meeting.members.find((m) => m.id === facilitator).choice, "pending");
        result.facilitators.push({ id: facilitator, proposed: true, attendanceUnpromised: true });
        await page.getByRole("button", { name: "Close town life", exact: true }).click();
      }
      assert.deepEqual(result.errors, []);
    } finally {
      await context.close();
    }
  }
  return report;
}
