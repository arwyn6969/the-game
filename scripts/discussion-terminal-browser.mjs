import assert from "node:assert/strict";
import { advanceDiscussionWindow, discussionTransportReceipt } from "./discussion-auto-browser.mjs";

/** Import a labelled synthetic retained history, then use the real React controls. */
async function prepareTerminalFixture(page, kind) {
  await page.evaluate(async (kind) => {
    const d = await import("/src/game/discussions.ts");
    const { exportTown, parseTownFile } = await import("/src/game/save.ts");
    const { planFromBlocks } = await import("/src/game/plan.ts");
    const economy = await import("/src/game/economy.ts");
    const { initializeFundedEconomy } = await import("/src/game/economy-migration.ts");
    let town = JSON.parse(localStorage.getItem("the-game-town-v2")).town;
    const initialized = initializeFundedEconomy(town);
    if (!initialized.ok) throw new Error(initialized.reason);
    town.favors.push({
      id: "terminal-fixture-debt",
      from: "player",
      to: "kevin",
      amount: 2,
      text: "Synthetic retained debt",
      status: "owed",
      day: town.day,
    });
    const terms = { from: "agent:player", to: "agent:kevin", amount: 1 };
    const payment = economy.runEconomyCommand(
      town,
      {
        id: "terminal-fixture-payment",
        kind: "fixture-transfer",
        actor: "player",
        authority: "ui",
        terms,
      },
      (draft, context) => {
        economy.transferFunds(draft, context, {
          id: "terminal-fixture-payment:transfer",
          ...terms,
          purpose: "Synthetic prior payment",
        });
        return terms;
      },
    );
    if (!payment.ok) throw new Error(payment.reason);
    for (const person of town.agents.filter((a) => ["northern", "arwyn", "sub"].includes(a.id)))
      person.plan = planFromBlocks(town.day, "Synthetic library-day fixture", [
        {
          from: 0,
          to: 24,
          place: "library",
          spot: "out",
          status: "Synthetic library fixture",
        },
      ]);
    const check = (result) => {
      if (!result.ok) throw new Error(result.message);
    };
    check(d.createLibraryDiscussion(town, "SYNTHETIC terminal-failure history"));
    const meeting = () => town.discussions.sessions.at(-1);
    let sequence = 0;
    const command = (actor, decision) =>
      d.applyDiscussionCommand(town, actor, {
        ...decision,
        meetingId: meeting().id,
        expectedRevision: meeting().members.find((m) => m.id === actor).revision,
        commandId: `terminal-fixture:${++sequence}`,
      });
    for (const id of ["northern", "arwyn", "sub"]) {
      check(command("player", { kind: "invite", invitee: id }));
      check(command(id, { kind: "accept" }));
      check(command(id, { kind: id === "northern" ? "participate" : "listen" }));
    }
    check(command("northern", { kind: "speak", text: "SYNTHETIC prior statement, preserved." }));
    // Complete the listeners' existing cues so Northern holds the next real
    // speaking floor. These are fixture choices, not manufactured AI output.
    if (["valid-final-speech", "cancel-final-speech"].includes(kind))
      for (const id of ["arwyn", "sub"]) check(command(id, { kind: "listen" }));
    for (let index = 0; index < (kind === "below-cap" ? 14 : 15); index++) {
      const job = d.nextDiscussionJob(town);
      if (!d.markDiscussionRequest(town, job))
        throw new Error("Cannot construct prior fixture history");
      d.recordDiscussionUsage(town, job, {
        success: false,
        attempts: 1,
        totalTokens: 42,
        elapsedMs: 0,
      });
      d.pauseDiscussion(town, "Synthetic earlier failure.");
      check(d.resumeDiscussion(town));
    }
    // Establish the ordinary save-loader defaults before comparing retained
    // memories. Leave legacy exhaustion itself for the actual browser reload.
    town = parseTownFile(exportTown(town));
    if (!town) throw new Error("Synthetic terminal history must be a valid saved town");
    if (kind === "legacy-exhausted") {
      d.markDiscussionRequest(town, d.nextDiscussionJob(town));
      meeting().status = "paused";
      meeting().pending = null;
      meeting().epoch++;
      meeting().reason = "Historical synthetic exhausted pause.";
    }
    localStorage.setItem("the-game-town-v2", exportTown(town));
    localStorage.setItem("the-game-library-meeting-prototype", "true");
  }, kind);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__game && window.__discussionMock));
}

const protectedState = (town) => ({
  identity: town.identityRegistry,
  money: town.agents.map((agent) => [agent.id, agent.money]),
  tills: town.tills,
  favors: town.favors,
  economy: town.economy,
});
const lastMeeting = (town) => town.discussions.sessions.at(-1);

export async function runTerminalMeetingJourneys(helpers, viewport) {
  const {
    createJourney,
    openMeeting,
    savedTown,
    meeting,
    availableDecision,
    draftField,
    auditMeeting,
    capture,
  } = helpers;
  for (const kind of [
    "empty",
    "manual-empty",
    "draft-retention",
    "malformed",
    "unavailable-action",
    "provider-failure",
    "quota-denied",
    "client-timeout",
    "cancel-late",
    "reload-in-flight",
    "legacy-exhausted",
    "valid-final",
    "valid-final-speech",
    "cancel-final-speech",
    "below-cap",
  ]) {
    const { context, page, result } = await createJourney(viewport, `terminal ${kind}`);
    await prepareTerminalFixture(page, kind);
    await openMeeting(page);
    const before = await savedTown(page),
      original = lastMeeting(before);
    let draft;
    if (kind !== "legacy-exhausted") {
      draft = await draftField(page);
      await draft.fill("SYNTHETIC retained terminal draft");
      await page
        .getByRole("button", {
          name: kind === "manual-empty" ? "Request next AI decision" : "Start automatic meeting",
          exact: true,
        })
        .click();
      await page.waitForFunction(() => window.__discussionMock.calls.length === 1);
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
            .pending !== null,
      );
      const offered = await availableDecision(page);
      const speaking = ["valid-final-speech", "cancel-final-speech"].includes(kind);
      assert.equal(offered.actor, speaking ? "northern" : "arwyn");
      assert.equal(
        offered.observation.availableActions.some((action) => action.kind === "speak"),
        speaking,
      );
      if (!speaking)
        assert.ok(offered.observation.availableActions.some((action) => action.kind === "listen"));
      const reply = (decision) => ({
        ok: true,
        text: JSON.stringify({ task: "discussion", decision }),
        diagnostics: { mode: "pool", attempts: 1, totalTokens: 42 },
      });
      let response;
      if (["cancel-late", "cancel-final-speech"].includes(kind)) {
        await page.getByRole("button", { name: "Stop automatic meeting", exact: true }).click();
        await page.waitForFunction(
          () =>
            JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
              .status === "closed",
        );
        assert.match(
          await page.locator(".discussion-feedback").innerText(),
          /previous AI request is still settling/,
        );
        response = speaking
          ? reply({ kind: "speak", text: "SYNTHETIC_REJECTED_TERMINAL_LINE" })
          : reply({ kind: "listen" });
      } else if (kind === "client-timeout") {
        await page.clock.fastForward(45_100);
        await page.waitForFunction(
          () =>
            JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
              .status === "closed",
        );
        assert.match(
          await page.locator(".discussion-feedback").innerText(),
          /previous AI request is still settling/,
        );
        response = reply({ kind: "listen" });
      } else if (kind === "reload-in-flight") {
        result.transportBeforeReload = await discussionTransportReceipt(page);
        // Freeze only the synthetic save's clock, retaining its real in-flight
        // request and unknown counters. Reload must recover that pending request
        // without unrelated ordinary payroll/talk ticks during the assertion.
        await page.evaluate(() => {
          const file = JSON.parse(localStorage.getItem("the-game-town-v2"));
          file.town.paused = true;
          localStorage.setItem("the-game-town-v2", JSON.stringify(file));
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(window.__game && window.__discussionMock));
        await openMeeting(page);
      } else if (kind === "provider-failure") {
        await page.evaluate(() => window.__discussionMock.reject(0));
      } else if (kind === "quota-denied") {
        response = { ok: false, error: "slow", diagnostics: { attempts: 0, totalTokens: null } };
      } else if (kind === "valid-final") response = reply({ kind: "listen" });
      else if (kind === "valid-final-speech")
        response = reply({ kind: "speak", text: "SYNTHETIC final permitted statement." });
      else if (kind === "unavailable-action")
        response = reply({ kind: "speak", text: "SYNTHETIC_REJECTED_TERMINAL_LINE" });
      else
        response = {
          ok: true,
          text: kind === "malformed" ? '{"task":' : "",
          diagnostics: { mode: "pool", attempts: 1, totalTokens: 42 },
        };
      if (response)
        await page.evaluate((response) => window.__discussionMock.resolve(0, response), response);
    }
    const expectedStatus = kind === "below-cap" ? "paused" : "closed";
    const recoveredOnLoad = ["reload-in-flight", "legacy-exhausted"].includes(kind);
    if (recoveredOnLoad) {
      // Loading recovers the live town while preserving the original raw save
      // until an ordinary save action. Observe recovery, then use Pause to save
      // that recovered state before asserting the stored round-trip receipt.
      await page.waitForFunction(() =>
        document.querySelector(".discussion-state")?.textContent.includes("Meeting finished"),
      );
      await page.getByRole("button", { name: "Pause", exact: true }).click();
    }
    await page.waitForFunction((status) => {
      const current = JSON.parse(
        localStorage.getItem("the-game-town-v2"),
      ).town.discussions.sessions.at(-1);
      return current.status === status && current.pending === null;
    }, expectedStatus);
    if (!recoveredOnLoad) await page.getByRole("button", { name: "Pause", exact: true }).click();
    await advanceDiscussionWindow(page, 62_100);
    const after = await savedTown(page),
      completed = lastMeeting(after);
    assert.equal(completed.decisions, kind === "below-cap" ? 15 : 16);
    assert.deepEqual(protectedState(after), protectedState(before));
    const validFinal = ["valid-final", "valid-final-speech"].includes(kind);
    if (kind === "valid-final-speech") {
      assert.deepEqual(completed.utterances.slice(0, -1), original.utterances);
      const spoken = completed.utterances.at(-1);
      assert.equal(spoken.speaker, "northern");
      assert.equal(spoken.text, "SYNTHETIC final permitted statement.");
      assert.deepEqual([...spoken.recipientIds].sort(), ["arwyn", "sub"]);
      for (const person of after.agents)
        assert.equal(
          person.memories.filter((entry) => entry.text.includes(spoken.text)).length,
          Number(["northern", "arwyn", "sub"].includes(person.id)),
          `${person.id} remembers the final speech only as its speaker or actual listener`,
        );
    } else assert.deepEqual(completed.utterances, original.utterances);
    for (const person of after.agents) {
      const old = before.agents.find((agent) => agent.id === person.id);
      for (const memory of old.memories)
        assert.deepEqual(
          person.memories.find((entry) => entry.id === memory.id),
          memory,
        );
      assert.ok(
        !person.memories.some((memory) => memory.text.includes("SYNTHETIC_REJECTED_TERMINAL_LINE")),
      );
    }
    const calls = await page.evaluate(() => window.__discussionMock.calls.length);
    assert.equal(calls, ["legacy-exhausted", "reload-in-flight"].includes(kind) ? 0 : 1);
    if (kind === "below-cap") {
      assert.equal(await draft.inputValue(), "SYNTHETIC retained terminal draft");
      await page.getByRole("button", { name: "Resume meeting", exact: true }).click();
      assert.equal((await meeting(page)).decisions, 15);
      assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 1);
      result.assertions.push(
        "Below-cap empty result pauses, keeps the draft, and resumes only explicitly without resetting the count",
      );
    } else {
      const feedback = await page.locator(".discussion-feedback").innerText();
      assert.match(
        feedback,
        validFinal ? /meeting is complete/ : /stopped at its sixteen-decision limit/,
      );
      assert.doesNotMatch(feedback, /Resume|start again/i);
      assert.equal(
        await page.getByRole("button", { name: "Resume meeting", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "Start automatic meeting", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "Request next AI decision", exact: true }).count(),
        0,
      );
      if (!["legacy-exhausted", "reload-in-flight"].includes(kind)) {
        assert.equal(completed.usage.failures, original.usage.failures + Number(!validFinal));
        assert.equal(completed.commands.length, original.commands.length + Number(validFinal));
      }
      if (
        [
          "cancel-late",
          "cancel-final-speech",
          "client-timeout",
          "reload-in-flight",
          "legacy-exhausted",
        ].includes(kind)
      )
        assert.equal(completed.usage.attemptsUnknown, 1);
      await auditMeeting(page, result, `terminal ${kind}`);
      if (["empty", "valid-final"].includes(kind)) {
        await page.locator(".discussion-state").scrollIntoViewIfNeeded();
        await capture(page, `${viewport.name}-terminal-${kind}.png`);
      }
      if (kind === "draft-retention") {
        await page.getByRole("button", { name: "Propose another meeting", exact: true }).click();
        await page.getByLabel("Propose one topic", { exact: true }).fill("Invalid\u0001topic");
        await page.getByRole("button", { name: "Propose library meeting", exact: true }).click();
        await page.waitForFunction(() =>
          document
            .querySelector(".discussion-feedback")
            ?.textContent.includes("Give the meeting a topic"),
        );
        assert.deepEqual(lastMeeting(await savedTown(page)), completed);
        await page
          .getByLabel("Propose one topic", { exact: true })
          .fill("SYNTHETIC explicit next proposal");
        await page.getByRole("button", { name: "Propose library meeting", exact: true }).click();
        assert.equal(
          await (await draftField(page)).inputValue(),
          "SYNTHETIC retained terminal draft",
        );
        const next = await savedTown(page);
        assert.deepEqual(
          next.discussions.sessions.find((session) => session.id === completed.id),
          completed,
        );
        assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 1);
        result.assertions.push(
          "A new explicit proposal retains the unsent draft and old closed receipt without restarting AI",
        );
      } else {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(window.__game && window.__discussionMock));
        await openMeeting(page);
        const reloaded = await savedTown(page);
        assert.deepEqual(
          lastMeeting(reloaded),
          completed,
          "Reload retains terminal reason, counters and complete history",
        );
        assert.deepEqual(protectedState(reloaded), protectedState(before));
        assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
        assert.match(
          await page.locator(".discussion-feedback").innerText(),
          validFinal ? /meeting is complete/ : /stopped at its sixteen-decision limit/,
        );
      }
      result.assertions.push(
        "Final result/interruption stops honestly, retains history/accounts/knowledge and unknown charges, exposes no resume, rejects further requests and survives reload",
      );
    }
    result.syntheticFinalStatus = expectedStatus;
    result.transport = await discussionTransportReceipt(page);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.unexpectedServerRequests, []);
    assert.ok(result.mockedModules > 0);
    await context.close();
  }
}
