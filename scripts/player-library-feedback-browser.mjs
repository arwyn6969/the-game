import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Isolated local-only players exercise public controls and inspect rendered feedback. */
export async function runPlayerLibraryFeedbackChecks(browser, url, out) {
  await mkdir(out, { recursive: true });
  const results = [];
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const tools = page.getByRole("navigation", { name: "Your town tools" });
    const openLibrary = () =>
      tools.getByRole("button", { name: "Library project", exact: true }).click();
    const action = (name) =>
      page.getByRole("button", { name, exact: typeof name === "string" }).click();
    const group = async (text) => {
      const summary = page.locator(".library-choice-group > summary").filter({ hasText: text });
      if (!(await summary.evaluate((element) => element.parentElement.open))) await summary.click();
    };
    const summary = () => page.getByLabel("Project budget summary", { exact: true });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page
        .getByLabel("What do they call you?", { exact: true })
        .fill(`Feedback ${viewport.name}`);
      await page.getByLabel("Use local dialogue only", { exact: true }).check();
      await action("Walk in");
      await openLibrary();
      assert.match(await summary().innerText(), /0 coins funded · 0 paid · 0 remaining/);
      assert.equal(await page.getByText(/AI request cancelled/).count(), 0);
      await action("Accept source check · 2");
      await page
        .getByText("Accepted and funded · your agreed fee is 2 coins.", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Accept source check · 2", exact: true }).count(),
        0,
      );
      assert.match(await summary().innerText(), /8 coins funded · 0 paid · 8 remaining/);
      assert.equal(
        await page.getByRole("button", { name: "Inspect Cedar", exact: true }).isDisabled(),
        true,
      );
      await page.getByText(/Inspection buttons become available when you arrive/).waitFor();
      await action("Close Library project");
      await tools.getByRole("button", { name: "Go somewhere", exact: true }).click();
      await page
        .locator(".player-tools")
        .getByRole("button", { name: "Library", exact: true })
        .click();
      await openLibrary();
      assert.equal(
        await page.getByRole("button", { name: "Inspect Cedar", exact: true }).isDisabled(),
        true,
        "opening the project while travelling must still leave inspections unavailable outside the library",
      );
      await page.getByText("You reached Library.", { exact: true }).waitFor({ timeout: 20_000 });
      assert.equal(
        await page.getByRole("heading", { name: "Library project", exact: true }).isVisible(),
        true,
        "the chosen walk completes without closing the project panel",
      );
      assert.equal(
        await page.getByRole("button", { name: "Inspect Cedar", exact: true }).isEnabled(),
        true,
        "arrival enables the existing inspection controls in the open panel",
      );
      for (const name of [
        "Read the equipment source card",
        "Read the dormitory source card",
        "Inspect Cedar",
      ])
        await action(name);
      await group("Written reports");
      await action("Submit source check · earn 2");
      await page.getByText("2 coins paid to you · check completed", { exact: true }).waitFor();
      assert.match(await summary().innerText(), /8 coins funded · 2 paid · 6 remaining/);
      await group("Inspect the records");
      await action("Inspect Birch");
      await action("Inspect Alder");
      await group("Written reports");
      await action("Request reference check · pay Kevin 2");
      await group("Prepare the index");
      const review = page.locator(".library-draft-review");
      await review.locator("summary").click();
      const box = page.getByLabel("Box for Community room access note", { exact: true });
      await box.waitFor({ state: "visible" });
      await action("1×");
      await page.waitForTimeout(1200);
      assert.equal(
        await review.evaluate((element) => element.open),
        true,
        "draft review stays expanded during clock updates",
      );
      await action("Pause");
      await box.selectOption("Birch");
      await box.selectOption("Cedar");
      assert.equal(
        await review.evaluate((element) => element.open),
        true,
        "editing a mapping retains the review controls",
      );
      await action("Submit your index");
      await group("Test the index");
      await action("Test this index · Northern earns 2");
      await action(/^Wait for lookup · \d+ game minutes$/);
      await page
        .getByRole("heading", { name: "Optional next activity: a reading", exact: true })
        .waitFor();
      assert.match(await summary().innerText(), /8 coins funded · 6 paid · 2 remaining/);
      await page.getByText(/Northern tested the community room access entry/).waitFor();
      const receipts = page.getByText("Payment receipts & ownership · 8-coin budget", {
        exact: true,
      });
      await receipts.click();
      assert.equal(
        await page.getByLabel("Project payment receipts", { exact: true }).locator("li").count(),
        3,
      );
      await summary().scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(out, `${viewport.name}-project-budget.png`) });
      await action("Close Library project");
      await page.reload({ waitUntil: "domcontentloaded" });
      await openLibrary();
      assert.match(await summary().innerText(), /8 coins funded · 6 paid · 2 remaining/);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      assert.deepEqual(errors, []);
      results.push({
        viewport: viewport.name,
        localOnly: true,
        acceptance: true,
        arrivalWithPanelOpen: true,
        paid: 6,
        remaining: 2,
        draftReview: true,
        reload: true,
      });
    } catch (error) {
      await page.screenshot({ path: join(out, `${viewport.name}-failure.png`) }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  return results;
}
