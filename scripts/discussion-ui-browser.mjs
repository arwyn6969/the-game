import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import axe from "axe-core";
import { chromium } from "playwright";
import {
  advanceDiscussionWindow,
  assertOfferedDecision,
  discussionMockModule,
  offeredKinds,
  runAutomaticMeetingJourneys,
} from "./discussion-auto-browser.mjs";

// Disposable towns and intercepted browser transport only. Never attach to a
// personal browser/account or send a request to a model provider.
const target = new URL(process.env.DISCUSSION_QA_URL || "http://127.0.0.1:8134/");
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
const out = resolve(process.env.DISCUSSION_QA_OUT || "artifacts/discussion-ui");
await mkdir(out, { recursive: true });
const report = {
  target: target.href,
  syntheticTransport: true,
  liveCalls: 0,
  journeys: [],
  failures: [],
};
const browser = await chromium.launch({ headless: true });
let active;
const savedTown = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("the-game-town-v2")).town);
const meeting = async (page) => (await savedTown(page)).discussions?.sessions.at(-1);
async function seed(page, backgroundDue = false) {
  await page.goto(target.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.__discussionMock));
  await page.evaluate(async (backgroundDue) => {
    const { createTown } = await import("/src/game/town.ts");
    const { exportTown } = await import("/src/game/save.ts");
    const value = createTown("Meeting QA");
    value.paused = true;
    value.sawHint = true;
    value.guide = 3;
    // A labelled next-day fixture leaves uninvolved residents' plans stale.
    // The invitees have normal current-day library schedules, so the real
    // minute tick cannot send an uninvited sleeper home before they can read.
    // These plans choose no meeting invitation, attention mode or response.
    if (backgroundDue) {
      value.day = 2;
      const { planFromBlocks } = await import("/src/game/plan.ts");
      for (const id of ["arwyn", "northern", "sub"]) {
        value.agents.find((agent) => agent.id === id).plan = planFromBlocks(
          value.day,
          "SYNTHETIC fixture: spend the day at the library.",
          [
            {
              from: 0,
              to: 24,
              place: "library",
              spot: "out",
              status: "spending the day at the library (synthetic fixture)",
            },
          ],
        );
      }
    }
    const positions = {
      player: [43, 22],
      northern: [42, 21],
      arwyn: [44, 21],
      sub: [43, 20],
      baba: [42, 22],
    };
    for (const [id, [x, y]] of Object.entries(positions)) {
      const actor = value.agents.find((agent) => agent.id === id);
      actor.tile = { x, y };
      actor.path = [];
    }
    localStorage.setItem("the-game-town-v2", exportTown(value));
    localStorage.setItem("the-game-local-dialogue-only", "false");
  }, backgroundDue);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__game && window.__discussionMock));
}
async function openMeeting(page) {
  const tab = page.getByRole("button", { name: "Library meeting", exact: true });
  if (!(await tab.count())) await page.getByRole("button", { name: /^Town life/ }).click();
  await tab.click();
}
async function requestDecision(page) {
  await advanceDiscussionWindow(page);
  const count = await page.evaluate(() => window.__discussionMock.calls.length);
  await page.getByRole("button", { name: "Request next AI decision", exact: true }).click();
  await page.waitForFunction((before) => window.__discussionMock.calls.length > before, count);
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1).pending,
  );
  return count;
}
async function requestNpcFloor(page) {
  for (let step = 0; step < 4; step++) {
    const id = await requestDecision(page);
    const state = await availableDecision(page);
    if (offeredKinds(state).includes("speak")) {
      assertOfferedDecision(state, { kind: "speak" });
      return id;
    }
    assert.equal(
      state.session.members.find((member) => member.id === state.actor).mode,
      "listening",
    );
    assertOfferedDecision(state, { kind: "listen" });
    await respond(page, id, { kind: "listen" });
  }
  assert.fail("A current NPC floor must follow the bounded attentive-listener cues");
}
async function respond(page, id, decision) {
  await page.evaluate(
    ({ id, decision }) =>
      window.__discussionMock.resolve(id, {
        ok: true,
        text: JSON.stringify({ task: "discussion", decision }),
        diagnostics: { mode: "pool", attempts: 1, totalTokens: 44 },
      }),
    { id, decision },
  );
  await page.waitForFunction(
    () =>
      !JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
        .pending,
  );
}
async function availableDecision(page) {
  return page.evaluate(async () => {
    const value = JSON.parse(localStorage.getItem("the-game-town-v2")).town;
    const session = value.discussions.sessions.at(-1);
    const { discussionObservation } = await import("/src/game/discussions.ts");
    return {
      actor: session.pending.actor,
      observation: discussionObservation(value, session.pending.actor),
      session,
    };
  });
}
async function capture(page, name) {
  await page.screenshot({ path: join(out, name), fullPage: false });
}
async function auditMeeting(page, result, name) {
  if (!(await page.evaluate(() => Boolean(window.axe))))
    await page.addScriptTag({ content: axe.source });
  const audit = await page.evaluate(async () => {
    const panel = document.querySelector(".discussion-panel");
    if (!panel) throw new Error("The meeting panel must be present for its accessibility audit");
    const result = await window.axe.run(panel, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      },
      resultTypes: ["violations", "incomplete"],
    });
    const compact = (rule) => ({
      id: rule.id,
      impact: rule.impact,
      nodes: rule.nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    });
    return {
      violations: result.violations.map(compact),
      incomplete: result.incomplete.map(compact),
    };
  });
  (result.audits ??= []).push({ name, ...audit });
  assert.deepEqual(audit.violations, [], `${name} accessibility`);
}
async function draftField(page) {
  const field = page.getByLabel("Your line to this library discussion", { exact: true });
  if (!(await field.isVisible()))
    await page.getByRole("button", { name: "Prepare a line", exact: true }).click();
  return field;
}

async function createJourney(viewport, kind, options = {}) {
  const result = {
    kind,
    viewport,
    assertions: [],
    errors: [],
    unexpectedServerRequests: [],
    externalRequests: [],
    mockedModules: 0,
  };
  report.journeys.push(result);
  const context = await browser.newContext({ viewport, hasTouch: viewport.name === "phone" });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== target.origin) {
      result.externalRequests.push(url.origin);
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    }
    if (url.pathname.includes("_serverFn")) {
      result.unexpectedServerRequests.push(url.pathname);
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' });
    }
    return route.continue();
  });
  await context.route("**/src/lib/mind.functions.ts*", (route) => {
    result.mockedModules++;
    return route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: discussionMockModule,
    });
  });
  const page = (active = await context.newPage());
  page.on("pageerror", (error) => result.errors.push(error.message));
  await seed(page, options.backgroundDue === true);
  // Install after the fixture has loaded; advancing time never means waiting
  // 31 real seconds or transmitting a real provider request.
  await page.clock.install({ time: new Date("2026-10-24T12:00:00.000Z") });
  return { result, context, page };
}

try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const { result, context, page } = await createJourney(viewport, "manual");
    await openMeeting(page);
    await page.getByLabel("Enable library meetings (experimental)", { exact: true }).check();
    await page
      .getByLabel("Propose one topic", { exact: true })
      .fill("A shared library activity — synthetic test");
    await page.getByLabel("Proposed facilitator", { exact: true }).selectOption("northern");
    await auditMeeting(page, result, "meeting proposal");
    await page.getByRole("button", { name: "Propose library meeting", exact: true }).click();
    await page.waitForFunction(() =>
      Boolean(
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions?.sessions.length,
      ),
    );
    const initial = await savedTown(page);
    const baseline = {
      money: initial.agents.map((a) => [a.id, a.money]),
      favors: initial.favors,
      economy: initial.economy,
    };
    assert.equal((await meeting(page)).utterances.length, 0);
    assert.equal((await meeting(page)).members.find((m) => m.id === "player").mode, "off");
    result.assertions.push(
      "Normal proposal creates no authored NPC dialogue and does not make the player listen",
    );
    // Normal nearby invitations save three read decisions in this regression
    // journey, leaving its unchanged sixteen-decision cap for recovery checks.
    await page.getByText("Your invitations", { exact: true }).click();
    for (const name of ["Northern", "Arwyn", "Sub"])
      await page.getByRole("button", { name: `Invite ${name}`, exact: true }).click();
    await page.getByText("Your invitations", { exact: true }).click();

    await page.evaluate(() =>
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      }),
    );
    await page.getByRole("button", { name: "Request next AI decision", exact: true }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    await page.evaluate(() => {
      delete document.visibilityState;
    });
    result.assertions.push(
      "Hidden tabs dispatch no meeting decision and visibility restoration never auto-starts one",
    );

    // The scenario below is completed against the frozen engine observation
    // contract: test-only choices always come from current offered actions.
    const choices = [];
    for (let step = 0; step < 14 && !(await meeting(page)).utterances.length; step++) {
      const id = await requestDecision(page);
      const state = await availableDecision(page);
      const options = state.observation.availableActions;
      assert.ok(
        Array.isArray(options) && options.length,
        "Selected NPC must receive actual legal actions",
      );
      const kinds = options.map((option) => (typeof option === "string" ? option : option.kind));
      const preference = [
        "read-invitation",
        "accept",
        state.actor === "sub" ? "listen" : "participate",
        "request-turn",
        "speak",
        "pass",
      ];
      const kind = preference.find((value) => kinds.includes(value));
      assert.ok(kind, `No test action for ${state.actor}: ${JSON.stringify(options)}`);
      const decision = kind === "speak" ? { kind, text: "SYNTHETIC_FIRST_MEETING_LINE" } : { kind };
      choices.push({ actor: state.actor, kind });
      await respond(page, id, decision);
    }
    assert.equal((await meeting(page)).utterances.length, 1, JSON.stringify(choices));
    const first = (await meeting(page)).utterances[0];
    assert.ok(!first.recipientIds.includes("player"), "Viewing does not deliver speech to player");
    assert.ok(
      !first.recipientIds.includes("baba"),
      "Nearby uninterested bystander is not a recipient",
    );
    result.assertions.push(
      "Mocked NPC decisions use the actual protocol/executor; nearby inattentive player and Baba do not hear",
    );
    await auditMeeting(page, result, "recorded meeting transcript");
    await capture(page, `${viewport.name}-first-meeting.png`);

    await page.getByRole("button", { name: "Join and listen", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2"))
          .town.discussions.sessions.at(-1)
          .members.find((m) => m.id === "player").mode === "listening",
    );
    assert.ok(
      !(await savedTown(page)).agents
        .find((a) => a.id === "player")
        .memories.some((m) => m.text.includes("SYNTHETIC_FIRST_MEETING_LINE")),
      "Late join must not copy the first utterance",
    );
    const draft = await draftField(page);
    await draft.fill("Could we consider a short public reading?");
    await auditMeeting(page, result, "expanded meeting composer");
    const second = await requestNpcFloor(page);
    await page.getByRole("button", { name: "Stop listening", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2"))
          .town.discussions.sessions.at(-1)
          .members.find((m) => m.id === "player").mode === "off",
    );
    await respond(page, second, { kind: "speak", text: "SYNTHETIC_AFTER_STOP" });
    assert.equal((await meeting(page)).utterances.length, 2);
    assert.ok(!(await meeting(page)).utterances[1].recipientIds.includes("player"));
    assert.equal(await draft.inputValue(), "Could we consider a short public reading?");
    result.assertions.push(
      "Late listening grants no earlier words; stopping while a reply is pending excludes the eventual line without invalidating its speaker",
    );

    await page.getByRole("button", { name: "Join as a speaker", exact: true }).click();
    for (let step = 0; step < 3 && (await meeting(page)).floor?.actor !== "player"; step++) {
      const id = await requestNpcFloor(page);
      await respond(page, id, { kind: "pass" });
    }
    assert.equal((await meeting(page)).floor.actor, "player");
    await page.getByRole("button", { name: "Say to meeting", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
          .utterances.length === 3,
    );
    await draftField(page);
    assert.equal(await draft.inputValue(), "");
    const playerLine = (await meeting(page)).utterances[2];
    assert.equal(playerLine.speaker, "player");
    assert.deepEqual([...playerLine.recipientIds].sort(), ["arwyn", "northern", "sub"]);
    await draft.fill("A newer unsent draft");
    const failure = await requestDecision(page);
    await page.evaluate((id) => window.__discussionMock.reject(id), failure);
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
          .status === "paused",
    );
    assert.equal((await meeting(page)).utterances.length, 3);
    assert.equal(await draft.inputValue(), "A newer unsent draft");
    await page.getByRole("button", { name: "Stop listening", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2"))
          .town.discussions.sessions.at(-1)
          .members.find((m) => m.id === "player").mode === "off",
    );
    assert.equal((await meeting(page)).status, "paused");
    result.assertions.push(
      "Player can take a fair turn; accepted speech clears only its draft; failed inference invents no reply and paused meetings still allow stopping listening",
    );

    await page.getByRole("button", { name: "Resume meeting", exact: true }).click();
    const cancelled = await requestNpcFloor(page);
    await page.getByRole("button", { name: "Pause meeting decisions", exact: true }).click();
    await page.getByRole("button", { name: "Resume meeting", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Request next AI decision", exact: true })
        .isDisabled(),
      true,
    );
    const beforeLate = (await meeting(page)).utterances.length;
    await page.evaluate(
      (id) =>
        window.__discussionMock.resolve(id, {
          ok: true,
          text: JSON.stringify({
            task: "discussion",
            decision: { kind: "speak", text: "STALE_CANCELLED_WORDS" },
          }),
          diagnostics: { mode: "pool", attempts: 1, totalTokens: 44 },
        }),
      cancelled,
    );
    await page.getByRole("button", { name: "Request next AI decision", exact: true }).waitFor();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent.trim() === "Request next AI decision" && !button.disabled,
      ),
    );
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), cancelled + 1);
    assert.equal((await meeting(page)).utterances.length, beforeLate);
    assert.equal(await draft.inputValue(), "A newer unsent draft");
    result.assertions.push(
      "Cancellation never permits a second underlying request before settlement; its delayed response cannot add speech or erase the draft",
    );

    const pending = await requestDecision(page);
    assert.ok(Number.isInteger(pending));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game && window.__discussionMock));
    await openMeeting(page);
    assert.equal(
      await page.getByRole("button", { name: "Resume meeting", exact: true }).isVisible(),
      true,
    );
    assert.match(await page.locator(".discussion-state").innerText(), /Meeting paused/);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    // Loading recovers the live copy without overwriting the original recovery
    // bytes. A normal subsequent action persists that recovered state.
    await page.getByRole("button", { name: "Leave discussion", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("the-game-town-v2"))
          .town.discussions.sessions.at(-1)
          .members.find((m) => m.id === "player").choice === "left",
    );
    assert.equal((await meeting(page)).status, "paused");
    assert.equal((await meeting(page)).pending, null);
    assert.equal((await meeting(page)).utterances.length, 3);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    result.assertions.push(
      "Reload preserves committed history, restores an in-flight request as paused/unknown and never automatically resends it",
    );

    await page.evaluate(() => {
      window.__discussionAvailable = false;
    });
    await page.getByRole("button", { name: "Check AI availability", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Request next AI decision", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal((await meeting(page)).utterances.length, 3);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    await page.getByText("Recorded discussion", { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(
      (await page.locator(".discussion-body").evaluate((element) => element.clientHeight)) >= 180,
      "Collapsed draft must leave readable discussion space",
    );
    await capture(page, `${viewport.name}-verified-meeting.png`);
    result.assertions.push(
      "Unavailable background action capability creates no substitute dialogue or provider call",
    );

    const final = await savedTown(page);
    assert.deepEqual(
      {
        money: final.agents.map((a) => [a.id, a.money]),
        favors: final.favors,
        economy: final.economy,
      },
      baseline,
    );
    assert.ok(result.mockedModules > 0);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.unexpectedServerRequests, []);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await context.close();
    await runAutomaticMeetingJourneys(
      {
        createJourney,
        openMeeting,
        savedTown,
        meeting,
        availableDecision,
        respond,
        draftField,
        auditMeeting,
        capture,
      },
      viewport,
    );
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
