import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Ordinary controls only; storage is read solely to assert synthetic results. */
export async function runLibraryChecks(browser, url, out) {
  await mkdir(out, { recursive: true });
  const results = [];
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800, room: "Cedar" },
    { name: "phone", width: 390, height: 844, room: "Birch" },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.name === "phone", acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
    const tools = page.getByRole("navigation", { name: "Your town tools" });
    async function action(name) {
      const before = (await saved()).economy?.projects?.library?.actionRevision ?? -1;
      const button = page.getByRole("button", { name, exact: typeof name === "string" });
      await button.click();
      await page.waitForFunction(previous => {
        const town = JSON.parse(localStorage.getItem("the-game-town-v2")).town;
        return (town.economy?.projects?.library?.actionRevision ?? -1) > previous;
      }, before);
    }
    async function group(text) {
      const summary = page.locator(".library-choice-group > summary").filter({ hasText: text });
      const open = await summary.evaluate(element => element.parentElement.open);
      if (!open) await summary.click();
    }
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.getByLabel("What do they call you?", { exact: true }).fill(`Library ${viewport.name}`);
      await page.getByLabel("Use local dialogue only", { exact: true }).check();
      await page.getByRole("button", { name: "Walk in", exact: true }).click();
      await tools.getByRole("button", { name: "Library project", exact: true }).waitFor();
      await tools.getByRole("button", { name: "Library project", exact: true }).click();
      await action("Accept reference check · 2");
      let current = await saved();
      const custody = () => current.economy.projectBalances["project:library-index"];
      assert.equal(custody(), 8);
      assert.equal(current.economy.holds.filter(hold => hold.account === "project:library-index").reduce((n, hold) => n + hold.remaining, 0), 6);
      await page.getByRole("button", { name: "Close Library project", exact: true }).click();
      await tools.getByRole("button", { name: "Go somewhere", exact: true }).click();
      await page.locator(".player-tools").getByRole("button", { name: "Library", exact: true }).click();
      await page.waitForFunction(() => {
        const town = JSON.parse(localStorage.getItem("the-game-town-v2")).town;
        const player = town.agents.find(agent => agent.id === "player");
        return window.__game.tile(player.tile.x, player.tile.y)?.zone === "library";
      }, null, { timeout: 15_000 });
      await tools.getByRole("button", { name: "Library project", exact: true }).click();
      for (const name of ["Read the equipment source card", "Read the dormitory source card", "Read the loose access card", "Read Kevin's reference card", "Inspect Birch", "Inspect Alder", "Inspect Cedar"]) await action(name);
      await group("Written reports");
      await action("Submit reference check · earn 2");
      await group("Written reports");
      await action("Request source check · pay Arwyn 2");
      await group("Prepare the index");
      for(const [label,box] of [["Hobbs equipment register","Birch"],["Dormitory repair request","Alder"],["Community room access note",viewport.room]]) {
        const before=(await saved()).economy.projects.library.actionRevision;
        await page.getByLabel(`Box for ${label}`,{exact:true}).selectOption(box);
        await page.waitForFunction(previous=>JSON.parse(localStorage.getItem("the-game-town-v2")).town.economy.projects.library.actionRevision>previous,before);
      }
      await action("Submit your index");
      current = await saved();
      assert.equal(current.agents.find(agent => agent.id === "player").money, 6);
      assert.equal(current.economy.projects.library.revisions[0].mappings["room-access"], viewport.room);
      await action("Test this index · Northern earns 2");
      assert.equal((await saved()).economy.projects.library.lookup.status, "routing");
      await action(/^Wait for lookup · \d+ game minutes$/);
      current = await saved();
      assert.equal(current.economy.projects.library.lookup.status, "done");
      assert.equal(current.economy.projects.library.lookup.result, viewport.room === "Cedar" ? "success" : "failure");
      assert.equal(current.agents.find(agent => agent.id === "northern").money, 4, "failed search earns the same fee");
      assert.equal(custody(), 2);
      assert.equal(current.economy.work.receipts.filter(receipt => receipt.payer === "project:library-index").length, 3);
      await action("Find a record · Community room access note");
      assert.match((await saved()).economy.projects.library.finds.at(-1).result, viewport.room === "Cedar" ? /Found/ : /did not locate/);
      const total = current.agents.reduce((sum, agent) => sum + agent.money, 0) + current.tills.cafe + current.tills.grocery + custody();
      assert.equal(total, 90);
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download town", exact: true }).click();
      const stream = await (await download).createReadStream();
      const chunks = []; for await (const chunk of stream) chunks.push(chunk);
      const portable = Buffer.concat(chunks);
      await page.getByRole("button", { name: "Close Library project", exact: true }).click();
      await page.getByLabel("Import a town file", { exact: true }).setInputFiles({ name: "synthetic-library.json", mimeType: "application/json", buffer: portable });
      await page.getByRole("button", { name: "Replace", exact: true }).click();
      await page.waitForFunction(expected => JSON.parse(localStorage.getItem("the-game-town-v2")).town.economy?.projects?.library?.lookup?.result === expected, viewport.room === "Cedar" ? "success" : "failure");
      await page.reload({ waitUntil: "domcontentloaded" });
      await tools.getByRole("button", { name: "Library project", exact: true }).click();
      await page.getByRole("heading", { name: "The index", exact: true }).waitFor();
      assert.equal((await saved()).economy.projects.library.lookup.revision, 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.locator(".mind-body").evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: join(out, `${viewport.name}-library.png`) });
      await page.getByRole("heading", { name: "Independent lookup", exact: true }).scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: join(out, `${viewport.name}-lookup.png`) });
      assert.deepEqual(errors, []);
      results.push({ viewport: viewport.name, result: viewport.room === "Cedar" ? "success" : "failure", feesPaid: 6, custody: 2, totalCoins: 90, ordinaryControls: true, portableRoundTrip: true, reload: true, errors });
    } catch (error) {
      await page.screenshot({ path: join(out, `${viewport.name}-failure.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  return results;
}
