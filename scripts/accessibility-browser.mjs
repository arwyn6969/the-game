import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import axe from "axe-core";
import { chromium } from "playwright";

// Run against an already started local dev server or built preview. Every town,
// browser profile and import below is disposable; no personal browser is used.
const target = new URL(process.env.GAME_A11Y_QA_URL || "http://127.0.0.1:8170/");
assert.equal(target.protocol, "http:", "Accessibility QA only targets a local HTTP server");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(Number(process.versions.node.split(".")[0]), 24, "Use Node 24");
const out = resolve(process.env.GAME_A11Y_QA_OUT || "artifacts/accessibility-browser");
await mkdir(out, { recursive: true });
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const report = {
  url: target.href,
  node: process.version,
  axeVersion: axe.version,
  generatedAt: new Date().toISOString(),
  scope: "Disposable local towns; authored local dialogue; no external wallet, account or provider",
  wcagTags,
  journeys: [],
  failures: [],
  manualLimits: [
    "Automated WCAG checks cover detectable rules only; zero violations is not WCAG conformance.",
    "Axe incomplete results require human review, including any contrast, canvas and hidden-content limits.",
    "Screen-reader usability of the visual world, orientation, resident discovery, conversation and consequences requires a human playtest.",
    "Real VoiceOver/NVDA output, touch assistive technology, physical keyboards, native browser/device zoom, whole-app text spacing and high-contrast modes are not established by this script. The text-200-spacing journey covers only Help and Library using its recorded CSS enlargement and spacing technique.",
    "Wallet/account panels are audited disconnected only; extension signing, authenticated operator tools, receiving/recovery and funding remain separate acceptance work.",
    "Reduced-motion preference, computed CSS and paused canvas stability are checked; vestibular comfort still requires human review.",
  ],
};
let browser;
const message = (error) => (error instanceof Error ? error.message : String(error)).slice(0, 2400);
const tools = (page) => page.getByRole("navigation", { name: "Your town tools", exact: true });
const townCanvas = (page) => page.locator("canvas.town-canvas");
const focusedIn = (locator) =>
  locator.evaluate((element) => element.contains(document.activeElement));
const frames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
const position = (page) =>
  page.evaluate(() => ({ x: window.__controlsTest.getX(), y: window.__controlsTest.getY() }));
const snapshot = (page) => page.evaluate(() => localStorage.getItem("the-game-town-v2"));
function issue(item) {
  return {
    id: item.id,
    impact: item.impact,
    description: item.description,
    help: item.help,
    helpUrl: item.helpUrl,
    tags: item.tags,
    nodes: item.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
      any: node.any.map(({ id, message }) => ({ id, message })),
      all: node.all.map(({ id, message }) => ({ id, message })),
      none: node.none.map(({ id, message }) => ({ id, message })),
    })),
  };
}
async function check(journey, name, operation) {
  const entry = { name, status: "running" };
  journey.checks.push(entry);
  try {
    const observations = await operation();
    entry.status = "passed";
    if (observations !== undefined) entry.observations = observations;
  } catch (error) {
    entry.status = "failed";
    entry.error = message(error);
    report.failures.push(`${journey.viewport.name}: ${name}: ${entry.error}`);
  }
}
async function audit(page, journey, name) {
  await frames(page);
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(
    async (tags) =>
      window.axe.run(document, {
        runOnly: { type: "tag", values: [...tags, "best-practice"] },
        resultTypes: ["violations", "incomplete", "passes", "inapplicable"],
      }),
    wcagTags,
  );
  const wcag = result.violations.filter((item) => item.tags.some((tag) => wcagTags.includes(tag)));
  const bestPractice = result.violations.filter(
    (item) => !item.tags.some((tag) => wcagTags.includes(tag)),
  );
  const shot = `${journey.viewport.name}-${name}.png`;
  await page.screenshot({ path: join(out, shot), fullPage: true });
  const layout = await page.evaluate(() => {
    const focused = document.activeElement;
    let focusedControl = null;
    if (focused?.matches("button, input:not([type='file']), select, textarea, summary, a[href]")) {
      const box = focused.getBoundingClientRect();
      const left = Math.max(0, box.left),
        right = Math.min(innerWidth, box.right);
      const top = Math.max(0, box.top),
        bottom = Math.min(innerHeight, box.bottom);
      const points = [
        [0.5, 0.5],
        [0.15, 0.15],
        [0.85, 0.15],
        [0.15, 0.85],
        [0.85, 0.85],
      ];
      const exposed =
        right > left &&
        bottom > top &&
        points.some(([x, y]) =>
          focused.contains(
            document.elementFromPoint(left + (right - left) * x, top + (bottom - top) * y),
          ),
        );
      focusedControl = {
        tag: focused.tagName,
        name: focused.getAttribute("aria-label") || focused.textContent.trim().slice(0, 100),
        exposed,
      };
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      panelHorizontalOverflow: [
        ...document.querySelectorAll(".mind, .mind-body, [role='tabpanel']"),
      ]
        .filter(
          (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
        )
        .map((element) => ({
          tag: element.tagName,
          id: element.id,
          className: element.className,
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      focusedControl,
    };
  });
  journey.audits.push({
    name,
    screenshot: shot,
    layout,
    wcagViolations: wcag.map(issue),
    bestPracticeViolations: bestPractice.map(issue),
    incomplete: result.incomplete.map(issue),
    counts: {
      wcagViolations: wcag.length,
      bestPracticeViolations: bestPractice.length,
      incomplete: result.incomplete.length,
      passedRules: result.passes.length,
      inapplicableRules: result.inapplicable.length,
    },
  });
  for (const item of wcag)
    report.failures.push(`${journey.viewport.name}/${name}: axe ${item.id} (${item.impact})`);
  if (layout.horizontalOverflow)
    report.failures.push(`${journey.viewport.name}/${name}: horizontal document overflow`);
  if (layout.panelHorizontalOverflow.length)
    report.failures.push(
      `${journey.viewport.name}/${name}: reading panel requires horizontal scrolling`,
    );
  if (layout.focusedControl && !layout.focusedControl.exposed)
    report.failures.push(
      `${journey.viewport.name}/${name}: focused control is entirely obscured: ${layout.focusedControl.name}`,
    );
}
async function surface(page, journey, name, open, close) {
  try {
    await open();
    await audit(page, journey, name);
  } catch (error) {
    report.failures.push(`${journey.viewport.name}/${name}: ${message(error)}`);
    const geometry = await page
      .evaluate(() =>
        [
          ...document.querySelectorAll(
            ".mind, .mind-body, .world-frame, .hud, .town-tools, .social-toolbar",
          ),
        ].map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            className: element.className,
            width: box.width,
            height: box.height,
            top: box.top,
            bottom: box.bottom,
            overflow: style.overflow,
            position: style.position,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          };
        }),
      )
      .catch(() => []);
    journey.surfaceErrors.push({ name, error: message(error), geometry });
    await page
      .screenshot({
        path: join(out, `${journey.viewport.name}-${name}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
  } finally {
    try {
      await close?.();
    } catch (error) {
      report.failures.push(`${journey.viewport.name}/${name}/close: ${message(error)}`);
    }
  }
}
async function openTool(page, button, title) {
  await tools(page).getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("dialog", { name: title, exact: true }).waitFor();
}
async function closePanel(page) {
  await page.keyboard.press("Escape");
  await page.locator(".mind").waitFor({ state: "hidden" });
  await frames(page);
}
async function openImport(page, raw) {
  const opener = page.getByRole("button", { name: "Import", exact: true });
  await opener.focus();
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "accessibility-synthetic-town.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("dialog", { name: "Replace the live town?", exact: true }).waitFor();
  await frames(page);
}
async function importNear(page, id) {
  const fixture = JSON.parse(await snapshot(page));
  const resident = fixture.town.agents.find((agent) => agent.id === id);
  const adjacent = await page.evaluate(
    ({ x, y }) =>
      [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ].find((point) => window.__game.tile(point.x, point.y)?.block === false),
    resident.tile,
  );
  assert.ok(adjacent, `Synthetic town has a walkable tile beside ${id}`);
  fixture.town.agents.find((agent) => agent.id === "player").tile = adjacent;
  fixture.town.paused = true;
  await openImport(page, JSON.stringify(fixture));
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
  await frames(page);
}
async function startTown(page, journey) {
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByLabel("What do they call you?", { exact: true }).waitFor();
  await audit(page, journey, "entry");
  await page
    .getByLabel("What do they call you?", { exact: true })
    .fill(`A11y ${journey.viewport.name}`);
  await page.getByLabel("Use local dialogue only", { exact: true }).check();
  await page.getByRole("button", { name: "Walk in", exact: true }).click();
  await page.waitForFunction(
    () => !!window.__game && !!window.__controlsTest && !!localStorage.getItem("the-game-town-v2"),
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}
async function focusVisibility(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const box = element.getBoundingClientRect();
    const left = Math.max(0, box.left),
      right = Math.min(innerWidth, box.right);
    const top = Math.max(0, box.top),
      bottom = Math.min(innerHeight, box.bottom);
    const points = [
      [0.5, 0.5],
      [0.15, 0.15],
      [0.85, 0.15],
      [0.15, 0.85],
      [0.85, 0.85],
    ];
    const exposed =
      right > left &&
      bottom > top &&
      points.some(([x, y]) =>
        element.contains(
          document.elementFromPoint(left + (right - left) * x, top + (bottom - top) * y),
        ),
      );
    return {
      tag: element.tagName,
      name: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 100),
      exposed,
      insidePane: Boolean(element.closest(".mind")),
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}
async function traversalChecks(page, journey, { extraPanes = true } = {}) {
  await check(
    journey,
    "Tab and Shift+Tab preserve visible focus outside nonmodal Help",
    async () => {
      await openTool(page, "Help & privacy", "Help & privacy");
      let forward;
      for (let index = 0; index < 20; index++) {
        await page.keyboard.press("Tab");
        await frames(page);
        forward = await focusVisibility(page);
        if (!forward.insidePane && forward.tag !== "BODY") break;
      }
      assert.equal(forward.insidePane, false);
      assert.equal(
        forward.exposed,
        true,
        `The footer destination must remain visible after Tab leaves Help: ${JSON.stringify(forward)}`,
      );
      const textTraversal = [];
      if (journey.viewport.name === "text-200-spacing") {
        textTraversal.push(forward);
        for (let index = 0; index < 5 && (await page.locator(".mind").count()); index++) {
          await page.keyboard.press("Tab");
          await frames(page);
          const focused = await focusVisibility(page);
          assert.equal(focused.insidePane, false);
          assert.equal(
            focused.exposed,
            true,
            `Every footer focus must stay exposed: ${JSON.stringify(focused)}`,
          );
          textTraversal.push(focused);
        }
        assert.equal(
          await page.locator(".mind").count(),
          0,
          "Enlarged Help dismisses by the genuinely covered Download or Import footer control",
        );
      }
      if (await page.locator(".mind").count()) await closePanel(page);
      await openTool(page, "Help & privacy", "Help & privacy");
      await page.getByRole("button", { name: "Close Help & privacy", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      await frames(page);
      const backward = await focusVisibility(page);
      assert.equal(backward.insidePane, false);
      assert.equal(backward.exposed, true, "Shift+Tab preserves a visible background destination");
      return { forward, backward, textTraversal };
    },
  );
  if (await page.locator(".mind").count()) await closePanel(page);
  if (!extraPanes) return;
  await check(
    journey,
    "character pane preserves visible background focus and resident pin",
    async () => {
      const resident = page.getByRole("button", {
        name: "View Kevin's character card",
        exact: true,
      });
      await resident.click();
      await page.getByRole("button", { name: "Pin", exact: true }).click();
      await page.getByRole("button", { name: "Unpin", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      await frames(page);
      assert.equal(
        await resident.locator('svg[aria-label="Pinned"]').count(),
        1,
        "Focus dismissal preserves the resident strip pin",
      );
      const focused = await focusVisibility(page);
      assert.equal(focused.exposed, true);
      assert.equal(focused.insidePane, false);
      return focused;
    },
  );
  if (await page.locator(".mind").count()) await closePanel(page);
  await check(
    journey,
    "Town life preserves visible background focus without stealing destination",
    async () => {
      await page.getByRole("button", { name: /^Town life / }).click();
      await page.getByRole("button", { name: "Close town life", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      await frames(page);
      const focused = await focusVisibility(page);
      assert.equal(focused.exposed, true);
      assert.equal(focused.insidePane, false);
      assert.notEqual(focused.name, "Close town life");
      return focused;
    },
  );
  if (await page.locator(".mind").count()) await closePanel(page);
  await check(
    journey,
    "Town life pointer toggle, Close and Escape preserve the opener",
    async () => {
      const opener = page.getByRole("button", { name: /^Town life / });
      if (journey.viewport.name === "desktop") {
        await opener.click();
        await page.getByRole("button", { name: "Close town life", exact: true }).waitFor();
        assert.equal(await opener.getAttribute("aria-expanded"), "true");
        await opener.click();
        await frames(page);
        assert.equal(
          await page.locator(".mind").count(),
          0,
          "A second pointer click closes Town life rather than reopening it after focus dismissal",
        );
        assert.equal(await opener.getAttribute("aria-expanded"), "false");
        assert.equal(await opener.evaluate((element) => document.activeElement === element), true);
      }
      for (const action of ["Close", "Escape"]) {
        await opener.click();
        const close = page.getByRole("button", { name: "Close town life", exact: true });
        await close.focus();
        if (action === "Close") await close.click();
        else await page.keyboard.press("Escape");
        await frames(page);
        assert.equal(await page.locator(".mind").count(), 0);
        assert.equal(
          await opener.evaluate((element) => document.activeElement === element),
          true,
          `${action} returns keyboard focus to Town life`,
        );
      }
    },
  );
  if (await page.locator(".mind").count()) await closePanel(page);
}
async function walletTraversalChecks(page, journey) {
  for (const [button, title, closeName] of [
    [/Stamp identity$/, "Your stamp appearance", "Close stamp appearance"],
    ["Agent wallets", "Agent wallets", "Close agent wallets"],
  ]) {
    await check(
      journey,
      `${title}: keyboard traversal preserves visible destination focus`,
      async () => {
        await openTool(page, button, title);
        await page.getByRole("button", { name: closeName, exact: true }).focus();
        await page.keyboard.press("Shift+Tab");
        await frames(page);
        assert.equal(
          await townCanvas(page).evaluate((element) => document.activeElement === element),
          true,
          "Wallet cleanup must not steal the newly focused canvas destination",
        );
        const focused = await focusVisibility(page);
        assert.equal(focused.insidePane, false);
        assert.equal(focused.exposed, true, JSON.stringify(focused));
        return focused;
      },
    );
    if (await page.locator(".mind").count()) await closePanel(page);
  }
}
async function keyboardChecks(page, journey) {
  await check(journey, "nonmodal tools initial focus, Escape and Close return", async () => {
    await openTool(page, "Help & privacy", "Help & privacy");
    const help = page.getByRole("dialog", { name: "Help & privacy", exact: true });
    assert.equal(await focusedIn(help), true, "Opening Help moves keyboard focus into its panel");
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "hidden" });
    await frames(page);
    assert.equal(
      await tools(page)
        .getByRole("button", { name: "Help & privacy", exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
      "Escape returns to the Help opener",
    );
    await openTool(page, "Journal", "Your journal");
    await page.getByRole("button", { name: "Close Your journal", exact: true }).click();
    await frames(page);
    assert.equal(
      await tools(page)
        .getByRole("button", { name: "Journal", exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
      "Close returns to the Journal opener",
    );
  });
  if (await page.locator(".mind").count()) await closePanel(page);
  await check(journey, "clock selection is exposed to assistive technology", async () => {
    const controls = page.getByRole("group", { name: "Town clock controls", exact: true });
    const states = [];
    for (const name of ["1×", "4×", "Pause"]) {
      await controls.getByRole("button", { name, exact: true }).click();
      const buttons = await controls.getByRole("button").evaluateAll((elements) =>
        elements.map((element) => ({
          name: element.getAttribute("aria-label") || element.textContent.trim(),
          pressed: element.getAttribute("aria-pressed"),
          current: element.getAttribute("aria-current"),
        })),
      );
      const selected = buttons.filter(
        (button) => button.pressed === "true" || (button.current && button.current !== "false"),
      );
      assert.equal(selected.length, 1, "Exactly one clock state must be programmatically selected");
      assert.equal(selected[0].name, name);
      states.push({ selected: name, buttons });
    }
    return states;
  });
  // A failed selection-semantic assertion must not leave time running.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await check(journey, "import modal initial focus, wrap, Escape and opener restore", async () => {
    await openImport(page, await snapshot(page));
    const dialog = page.getByRole("dialog", { name: "Replace the live town?", exact: true });
    const keep = dialog.getByRole("button", { name: "Keep this town", exact: true });
    assert.equal(
      await keep.evaluate((element) => document.activeElement === element),
      true,
      "Import initially focuses Keep this town",
    );
    const tabbables = dialog
      .locator("button:not(:disabled), input:not(:disabled)")
      .filter({ visible: true });
    const controls = await tabbables.elementHandles();
    const eligible = [];
    for (const element of controls) {
      if (await element.evaluate((node) => node.type !== "radio" || node.checked))
        eligible.push(element);
    }
    assert.ok(eligible.length >= 2);
    await eligible.at(-1).focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await eligible[0].evaluate((element) => document.activeElement === element),
      true,
      "Tab wraps from last to first",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await eligible.at(-1).evaluate((element) => document.activeElement === element),
      true,
      "Shift+Tab wraps from first to last",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await frames(page);
    assert.equal(
      await page
        .getByRole("button", { name: "Import", exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
      "Escape restores the Import opener",
    );
  });
  // Recover from a failed modal check before continuing independent surfaces.
  if (await page.getByRole("dialog", { name: "Replace the live town?", exact: true }).count())
    await page.keyboard.press("Escape");
  await check(
    journey,
    "character tabs rove, reading content scrolls and arrows do not walk",
    async () => {
      await page.getByRole("button", { name: "View Kevin's character card", exact: true }).click();
      const tabs = page.getByRole("tablist", { name: "Kevin card sections", exact: true });
      const overview = tabs.getByRole("tab", { name: "Overview", exact: true });
      await overview.focus();
      for (const [key, expected] of [
        ["ArrowRight", "Strengths"],
        ["End", "Progress"],
        ["Home", "Overview"],
      ]) {
        await page.keyboard.press(key);
        const chosen = tabs.getByRole("tab", { name: expected, exact: true });
        assert.equal(await chosen.getAttribute("aria-selected"), "true");
        assert.equal(await chosen.evaluate((element) => document.activeElement === element), true);
        assert.equal(await tabs.locator('[role="tab"][tabindex="0"]').count(), 1);
      }
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Tab");
      const reading = page.locator(".mind .mind-body");
      assert.equal(
        await focusedIn(reading),
        true,
        "Tab must reach the visible reading content before leaving the card",
      );
      const before = await position(page);
      const beforeScroll = await reading.evaluate((element) => ({
        top: element.scrollTop,
        overflow: element.scrollHeight > element.clientHeight + 1,
      }));
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(200);
      assert.deepEqual(await position(page), before, "Reading keys must not move the player");
      const afterScroll = await reading.evaluate((element) => element.scrollTop);
      if (beforeScroll.overflow)
        assert.ok(
          afterScroll > beforeScroll.top,
          "Overflowing reading content must scroll from the keyboard",
        );
      return { before, after: await position(page), beforeScroll, afterScroll };
    },
  );
  if (await page.locator(".mind").count()) await closePanel(page);
  await check(journey, "one-use conversation choice keeps focus in conversation", async () => {
    await importNear(page, "baba");
    await page.getByRole("button", { name: "Talk with Baba", exact: true }).click();
    const choices = page.locator(".mind-actions");
    await choices.locator("summary").click();
    const accept = choices.getByRole("button", { name: "Accept bread tab · 2", exact: true });
    await accept.focus();
    await page.keyboard.press("Enter");
    await page
      .getByText(
        "You received one loaf and accepted a tab of 2 with Baba. No money moved. Inventory lets you eat or share the loaf once.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await focusedIn(page.locator(".mind")),
      true,
      "Replaced choice must not drop focus to body",
    );
    const pay = choices.getByRole("button", { name: "Pay 2", exact: true });
    await pay.focus();
    await page.keyboard.press("Enter");
    await pay.waitFor({ state: "hidden" });
    await frames(page);
    assert.equal(
      await focusedIn(page.locator(".mind")),
      true,
      "Removed payment choice must keep focus in the conversation",
    );
    return page.evaluate(() => ({
      tag: document.activeElement.tagName,
      text: document.activeElement.textContent?.trim().slice(0, 120),
      role: document.activeElement.getAttribute("role"),
    }));
  });
  if (await page.locator(".mind").count()) await closePanel(page);
  if (journey.viewport.name === "desktop") {
    await check(
      journey,
      "visible clock Pause preserves the open conversation and draft",
      async () => {
        await page
          .getByRole("button", { name: "View Kevin's character card", exact: true })
          .click();
        await page.getByRole("tab", { name: "Together", exact: true }).click();
        const line = page.getByLabel("Your line to Kevin", { exact: true });
        await line.fill("Keep this conversation while paused.");
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await frames(page);
        assert.equal(
          await line.isVisible(),
          true,
          "A visible global Pause button must not dismiss the conversation",
        );
        assert.equal(await line.inputValue(), "Keep this conversation while paused.");
        const focused = await focusVisibility(page);
        assert.equal(focused.name, "Pause");
        assert.equal(focused.exposed, true);
      },
    );
    if (await page.locator(".mind").count()) await closePanel(page);
  }
  await traversalChecks(page, journey);
  await walletTraversalChecks(page, journey);
}
async function runViewport(
  viewport,
  { narrow = false, reducedMotion = "no-preference", enlargedText = false } = {},
) {
  const journey = {
    viewport,
    reducedMotion,
    audits: [],
    checks: [],
    surfaceErrors: [],
    pageErrors: [],
    consoleErrors: [],
    blockedExternalRequests: [],
  };
  report.journeys.push(journey);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.width <= 390,
    reducedMotion,
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === target.origin) return route.continue();
    journey.blockedExternalRequests.push({
      origin: url.origin,
      resourceType: route.request().resourceType(),
    });
    return route.fulfill({
      status: 200,
      contentType: route.request().resourceType() === "stylesheet" ? "text/css" : "text/plain",
      body: "",
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => journey.pageErrors.push(error.message));
  page.on("console", (entry) => {
    if (entry.type() === "error") journey.consoleErrors.push(entry.text());
  });
  try {
    await startTown(page, journey);
    await audit(page, journey, "town");
    if (enlargedText) {
      journey.textTechnique = {
        fontSize: "html { font-size: 200% } (CSS text enlargement; not native browser zoom)",
        spacing:
          "All elements: line-height 1.5, letter-spacing .12em, word-spacing .16em; paragraphs: margin-bottom 2em",
      };
      await page.addStyleTag({
        content:
          "html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }",
      });
      for (const [button, title, name] of [
        ["Help & privacy", "Help & privacy", "help-enlarged-text-spacing"],
        ["Library project", "Library project", "library-enlarged-text-spacing"],
      ]) {
        await surface(
          page,
          journey,
          name,
          () => openTool(page, button, title),
          async () => {
            await check(
              journey,
              `${name}: reading area remains visible and keyboard-scrollable`,
              async () => {
                assert.equal(
                  await page.locator(".mind").isVisible(),
                  true,
                  "Enlarged panel itself must remain visible, including clipping ancestors",
                );
                const reading = page.locator(".mind .mind-body");
                const geometry = await reading.evaluate((element) => ({
                  width: element.clientWidth,
                  height: element.clientHeight,
                  scrollHeight: element.scrollHeight,
                  top: element.getBoundingClientRect().top,
                  bottom: element.getBoundingClientRect().bottom,
                  viewportHeight: innerHeight,
                }));
                assert.ok(
                  geometry.height > 0 &&
                    geometry.top < geometry.viewportHeight &&
                    geometry.bottom > 0,
                  "Enlarged text must leave a visible reading area",
                );
                for (let index = 0; index < 12 && !(await focusedIn(reading)); index++)
                  await page.keyboard.press("Tab");
                assert.equal(
                  await focusedIn(reading),
                  true,
                  "Keyboard must reach enlarged panel content",
                );
                await page.keyboard.press("End");
                await page.waitForTimeout(200);
                const scroll = await reading.evaluate((element) => ({
                  top: element.scrollTop,
                  height: element.clientHeight,
                  scrollHeight: element.scrollHeight,
                }));
                if (scroll.scrollHeight > scroll.height + 1)
                  assert.ok(
                    scroll.top + scroll.height >= scroll.scrollHeight - 2,
                    "Keyboard must reach the end of enlarged reading content",
                  );
                return { geometry, scroll };
              },
            );
            await closePanel(page);
          },
        );
      }
      await traversalChecks(page, journey, { extraPanes: false });
      return;
    }
    for (const [button, title, name] of [
      ["Help & privacy", "Help & privacy", "help"],
      ["Journal", "Your journal", "journal"],
      ["Inventory", "What you carry", "inventory"],
      ["Go somewhere", "Go somewhere", "destinations"],
      ["Library project", "Library project", "library"],
    ]) {
      if (narrow && ["journal", "inventory"].includes(name)) continue;
      await surface(
        page,
        journey,
        name,
        () => openTool(page, button, title),
        () => closePanel(page),
      );
    }
    if (!narrow) {
      for (const [button, title, name] of [
        [/Stamp identity$/, "Your stamp appearance", "stamp-disconnected"],
        ["Agent wallets", "Agent wallets", "agent-wallets-disconnected"],
      ])
        await surface(
          page,
          journey,
          name,
          () => openTool(page, button, title),
          () => closePanel(page),
        );
      await surface(
        page,
        journey,
        "town-life",
        async () => {
          await page.getByRole("button", { name: /^Town life / }).click();
          await page.getByRole("complementary", { name: "Town life", exact: true }).waitFor();
        },
        () => closePanel(page),
      );
    }
    for (const tab of ["Overview", "Strengths", "Together", "Progress"]) {
      await surface(page, journey, `character-${tab.toLowerCase()}`, async () => {
        if (
          !(await page.getByRole("tablist", { name: "Kevin card sections", exact: true }).count())
        )
          await page
            .getByRole("button", { name: "View Kevin's character card", exact: true })
            .click();
        await page.getByRole("tab", { name: tab, exact: true }).click();
      });
    }
    if (await page.locator(".mind").count()) await closePanel(page);
    await surface(
      page,
      journey,
      "import-confirmation",
      async () => openImport(page, await snapshot(page)),
      async () => {
        await page.keyboard.press("Escape");
        await frames(page);
      },
    );
    if (!narrow) await keyboardChecks(page, journey);
    if (reducedMotion === "reduce")
      await check(journey, "reduced motion CSS and paused canvas stability", async () => {
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await frames(page);
        const preference = await page.evaluate(() => ({
          requested: matchMedia("(prefers-reduced-motion: reduce)").matches,
          transition: getComputedStyle(document.querySelector(".btn")).transitionDuration,
          animation: getComputedStyle(document.querySelector(".btn")).animationName,
        }));
        assert.equal(preference.requested, true);
        assert.ok(preference.transition.split(",").every((duration) => parseFloat(duration) === 0));
        assert.equal(preference.animation, "none");
        const first = await townCanvas(page).evaluate((canvas) => canvas.toDataURL());
        await page.waitForTimeout(350);
        const second = await townCanvas(page).evaluate((canvas) => canvas.toDataURL());
        assert.equal(first, second, "Paused reduced-motion town must not animate between frames");
        return preference;
      });
    assert.deepEqual(journey.pageErrors, [], "App page errors must be reported");
  } catch (error) {
    report.failures.push(`${viewport.name}: journey could not finish: ${message(error)}`);
    await page
      .screenshot({ path: join(out, `${viewport.name}-failure.png`), fullPage: true })
      .catch(() => {});
  } finally {
    await context.close();
  }
}
try {
  browser = await chromium.launch({ headless: true });
  const variants = [
    { viewport: { name: "desktop", width: 1280, height: 800 } },
    { viewport: { name: "phone", width: 390, height: 844 } },
    {
      viewport: { name: "zoom-equivalent-200", width: 640, height: 400 },
      options: { narrow: true },
    },
    {
      viewport: { name: "text-200-spacing", width: 1280, height: 800 },
      options: { enlargedText: true },
    },
    {
      viewport: { name: "narrow-320-reduced", width: 320, height: 844 },
      options: { narrow: true, reducedMotion: "reduce" },
    },
  ];
  // Optional exact names support a targeted rerun after a reported failure.
  const selected = process.env.GAME_A11Y_QA_VIEWS?.split(",").filter(Boolean);
  if (selected)
    assert.ok(
      selected.every((name) => variants.some(({ viewport }) => viewport.name === name)),
      "Unknown GAME_A11Y_QA_VIEWS entry",
    );
  report.selectedViewports = selected || variants.map(({ viewport }) => viewport.name);
  for (const { viewport, options } of variants) {
    if (selected && !selected.includes(viewport.name)) continue;
    await runViewport(viewport, options);
    if (viewport.name === "zoom-equivalent-200")
      report.journeys.at(-1).reflowTechnique =
        "640×400 CSS viewport simulates the layout area of a 1280×800 viewport at 200% zoom; this does not operate native browser zoom.";
  }
} catch (error) {
  report.failures.push(message(error));
} finally {
  await browser?.close();
  report.summary = {
    auditedSurfaces: report.journeys.reduce((sum, journey) => sum + journey.audits.length, 0),
    wcagViolations: report.journeys
      .flatMap((journey) => journey.audits)
      .reduce((sum, audit) => sum + audit.counts.wcagViolations, 0),
    bestPracticeViolations: report.journeys
      .flatMap((journey) => journey.audits)
      .reduce((sum, audit) => sum + audit.counts.bestPracticeViolations, 0),
    incompleteRuleResults: report.journeys
      .flatMap((journey) => journey.audits)
      .reduce((sum, audit) => sum + audit.counts.incomplete, 0),
    essentialChecks: report.journeys.reduce((sum, journey) => sum + journey.checks.length, 0),
    failedChecks: report.journeys
      .flatMap((journey) => journey.checks)
      .filter((check) => check.status === "failed").length,
    failures: report.failures.length,
    externalBrowserNetworkRequests: 0,
  };
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: report.failures.length === 0,
        summary: report.summary,
        failures: report.failures,
        report: join(out, "results.json"),
      },
      null,
      2,
    ),
  );
  if (report.failures.length) process.exitCode = 1;
}
