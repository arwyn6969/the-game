import assert from "node:assert/strict";

// Imported by the existing CI browser entry point. This module never launches a
// browser itself; every response is a labelled synthetic transport fixture.
export const discussionMockModule = `
export async function mindAvailability() { return { online:true, configured:true, actions:globalThis.__discussionAvailable !== false }; }
const mock=globalThis.__discussionMock??={calls:[],allInvocations:[],pending:new Map(),resolve(id,res){const row=this.pending.get(id);if(row){this.pending.delete(id);row.resolve(res);}},reject(id){const row=this.pending.get(id);if(row){this.pending.delete(id);row.reject(new Error('Synthetic unavailable'));}}};
export function thinkTown({data}) { mock.allInvocations.push({kind:data.kind,startedAt:performance.now()});if(data.kind!=='act')return Promise.resolve({ok:false,error:'synthetic-offline'});const id=mock.calls.length;mock.calls.push({id,user:data.user,startedAt:performance.now()});return new Promise((resolve,reject)=>mock.pending.set(id,{resolve,reject})); }
`;

export function offeredKinds(state) {
  const options = state.observation.availableActions;
  assert.ok(Array.isArray(options) && options.length, "The pending resident has actual offers");
  return options.map((option) => (typeof option === "string" ? option : option.kind));
}

export function assertOfferedDecision(state, decision) {
  assert.ok(
    offeredKinds(state).includes(decision.kind),
    `${state.actor} must be offered ${decision.kind}`,
  );
  if (decision.kind === "speak") assert.equal(state.session.floor?.actor, state.actor);
}

export async function advanceDiscussionWindow(page, elapsedMs = 31_100) {
  const elapsed = await page.evaluate(() => {
    const last = window.__discussionMock.allInvocations.at(-1);
    return last ? performance.now() - last.startedAt : null;
  });
  if (elapsed !== null) await page.clock.fastForward(Math.max(0, elapsedMs - elapsed));
}

export async function discussionTransportReceipt(page) {
  return page.evaluate(() => {
    const mock = window.__discussionMock;
    if (!mock) return null;
    return {
      allInvocations: mock.allInvocations.map(({ kind, startedAt }) => ({ kind, startedAt })),
      actCalls: mock.calls.map(({ id, startedAt }) => ({ id, startedAt })),
      pendingCallIds: [...mock.pending.keys()],
      observedAt: performance.now(),
    };
  });
}

export async function discussionFailureReceipt(page) {
  const transport = await discussionTransportReceipt(page);
  const state = await page.evaluate(() => {
    let town;
    try {
      town = JSON.parse(localStorage.getItem("the-game-town-v2"))?.town;
    } catch {
      /* A missing/unreadable synthetic save is itself useful evidence. */
    }
    const meeting = town?.discussions?.sessions.at(-1);
    return {
      visibility: document.visibilityState,
      clock: document.querySelector(".hud-clock")?.textContent,
      feedback: document.querySelector(".discussion-feedback")?.textContent,
      town: town ? { day: town.day, minute: town.minute, paused: town.paused } : null,
      // Deliberately omit prompts, response bodies, topic, player drafts,
      // memories, identity records and all other private character fields.
      meeting: meeting
        ? {
            id: meeting.id,
            status: meeting.status,
            reason: meeting.reason,
            epoch: meeting.epoch,
            decisions: meeting.decisions,
            usage: meeting.usage,
            pending: meeting.pending,
            floor: meeting.floor,
            queue: meeting.queue,
            members: meeting.members.map((member) => ({
              id: member.id,
              choice: member.choice,
              invitation: member.invitation,
              mode: member.mode,
              arrived: member.arrived,
              decisionNeeded: member.decisionNeeded,
              revision: member.revision,
              tile: town.agents.find((agent) => agent.id === member.id)?.tile,
            })),
            utterances: meeting.utterances.map(({ id, speaker, recipientIds }) => ({
              id,
              speaker,
              recipientIds,
            })),
          }
        : null,
    };
  });
  return { transport, ...state };
}

async function assertStartSpacing(page) {
  const { allInvocations, actCalls } = await discussionTransportReceipt(page);
  const starts = actCalls.map((call) => call.startedAt);
  for (let index = 1; index < starts.length; index++)
    assert.ok(starts[index] - starts[index - 1] >= 31_000, "All act starts retain free pacing");
  for (let index = 1; index < allInvocations.length; index++)
    if (allInvocations[index].kind === "act")
      assert.ok(
        allInvocations[index].startedAt - allInvocations[index - 1].startedAt >= 31_000,
        "Every act start retains free pacing after the immediately preceding AI request of any kind",
      );
}

async function assertOnlyArmedDiscussion(page, since) {
  const invocations = await page.evaluate(
    (since) => window.__discussionMock.allInvocations.slice(since),
    since,
  );
  assert.ok(invocations.length > 0, "This armed window includes a real synthetic request");
  assert.deepEqual(
    invocations.filter((invocation) => invocation.kind !== "act"),
    [],
    "An armed meeting must never dispatch background plan/talk/reflect requests",
  );
}

async function automaticRequest(page, expectedCount) {
  const calls = await page.evaluate(() => window.__discussionMock.calls.length);
  if (calls < expectedCount && calls > 0) await advanceDiscussionWindow(page);
  await page.waitForFunction(
    (count) => window.__discussionMock.calls.length >= count,
    expectedCount,
  );
  assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), expectedCount);
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1).pending,
  );
  await assertStartSpacing(page);
  return expectedCount - 1;
}

async function setHidden(page, hidden) {
  await page.evaluate((hidden) => {
    if (hidden)
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
    else delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function assertNoWords(town, text) {
  assert.ok(!town.discussions.sessions.at(-1).utterances.some((line) => line.text.includes(text)));
  for (const agent of town.agents)
    assert.ok(!agent.memories.some((memory) => memory.text.includes(text)));
}

async function assertStopped(page, meeting) {
  await page.waitForFunction(() => {
    const stop = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Stop automatic meeting",
    );
    // Stop updates the controls before its Web Locks save has committed. Wait
    // for the durable state too; disappearance alone can still expose the old save.
    const saved = JSON.parse(localStorage.getItem("the-game-town-v2"));
    return !stop && saved.town.discussions.sessions.at(-1).status === "paused";
  });
  assert.equal((await meeting(page)).status, "paused");
}

export async function runAutomaticMeetingJourneys(helpers, viewport) {
  const {
    createJourney,
    openMeeting,
    savedTown,
    meeting,
    availableDecision,
    respond,
    draftField,
    auditMeeting,
    capture,
  } = helpers;
  async function propose(page, topic) {
    await openMeeting(page);
    await page.getByLabel("Enable library meetings (experimental)", { exact: true }).check();
    const selector = page.getByLabel("Proposed facilitator", { exact: true });
    assert.equal(await selector.inputValue(), "arwyn");
    assert.deepEqual(
      await selector.locator("option").evaluateAll((options) => options.map((o) => o.value).sort()),
      ["arwyn", "northern"],
    );
    await page.getByLabel("Propose one topic", { exact: true }).fill(topic);
    await page.getByRole("button", { name: "Propose library meeting", exact: true }).click();
    await page.waitForFunction(() =>
      Boolean(
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions?.sessions.length,
      ),
    );
    assert.equal((await meeting(page)).facilitator, "arwyn");
    assert.match(
      await page.locator(".discussion-panel").innerText(),
      /Proposed facilitator: Arwyn/,
    );
  }
  async function finish(result, context, page) {
    result.transport = await discussionTransportReceipt(page);
    assert.ok(result.mockedModules > 0);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.unexpectedServerRequests, []);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await context.close();
  }

  for (const interruption of ["global Pause", "hidden then visible"]) {
    const { context, page, result } = await createJourney(
      viewport,
      `automatic durable Start interrupted by ${interruption}`,
    );
    await propose(page, `SYNTHETIC durable Start race — ${interruption}`);
    const baseline = await meeting(page);
    await page.evaluate(() => {
      if (!navigator.locks?.request || !navigator.locks?.query)
        throw new Error("The durable Start race requires the actual browser Web Locks API");
      const hold = (window.__discussionSaveLock = {
        acquired: false,
        released: false,
      });
      hold.task = navigator.locks.request("the-game-town-save", async () => {
        hold.acquired = true;
        await new Promise((resolve) => {
          hold.release = resolve;
        });
        hold.released = true;
      });
    });
    await page.waitForFunction(() => window.__discussionSaveLock.acquired);
    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
    await page.waitForFunction(async () => {
      const start = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent.trim() === "Start automatic meeting",
      );
      const locks = await navigator.locks.query();
      return start?.disabled && locks.pending.some((lock) => lock.name === "the-game-town-save");
    });
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    if (interruption === "global Pause") {
      await page
        .getByRole("group", { name: "Town clock controls", exact: true })
        .getByRole("button", { name: "Pause", exact: true })
        .click();
    } else {
      await setHidden(page, true);
      assert.match(await page.locator(".discussion-state").innerText(), /Meeting paused/);
      // Becoming visible before the durable save resolves must not revive Start.
      await setHidden(page, false);
    }
    assert.match(await page.locator(".discussion-state").innerText(), /Meeting paused/);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    await page.evaluate(() => window.__discussionSaveLock.release());
    await page.waitForFunction(async () => {
      const locks = await navigator.locks.query();
      const start = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent.trim() === "Start automatic meeting",
      );
      const saved = JSON.parse(localStorage.getItem("the-game-town-v2")).town;
      return (
        window.__discussionSaveLock.released &&
        !locks.pending.some((lock) => lock.name === "the-game-town-save") &&
        start &&
        !start.disabled &&
        saved.discussions.sessions.at(-1).status === "paused"
      );
    });
    await page.clock.fastForward(62_100);
    const interrupted = await meeting(page);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    assert.equal(interrupted.status, "paused");
    assert.equal(interrupted.pending, null);
    assert.equal(interrupted.decisions, baseline.decisions);
    assert.deepEqual(interrupted.usage, baseline.usage);
    assert.deepEqual(interrupted.utterances, baseline.utterances);
    assert.equal(
      await page.getByRole("button", { name: "Stop automatic meeting", exact: true }).count(),
      0,
    );
    result.assertions.push(
      `A real held save lock delays Start; ${interruption} cancels its authorization before release, consumes no request or accounting and cannot restart on visibility/time alone`,
    );
    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
    const explicitlyRestarted = await automaticRequest(page, 1);
    const offered = await availableDecision(page);
    assertOfferedDecision(offered, { kind: "read-invitation" });
    await page.getByRole("button", { name: "Stop automatic meeting", exact: true }).click();
    await assertStopped(page, meeting);
    await respond(page, explicitlyRestarted, { kind: "read-invitation" });
    assert.equal((await meeting(page)).utterances.length, 0);
    result.assertions.push("Only a fresh explicit Start can authorize the first actual request");
    await auditMeeting(page, result, `durable Start cancelled by ${interruption}`);
    await capture(
      page,
      `${viewport.name}-automatic-start-${interruption === "global Pause" ? "pause" : "hidden"}-race.png`,
    );
    await finish(result, context, page);
  }

  {
    const { context, page, result } = await createJourney(viewport, "automatic lifecycle", {
      backgroundDue: true,
    });
    await propose(page, "SYNTHETIC automatic library discussion");
    await auditMeeting(page, result, "automatic Arwyn proposal");
    await page.getByRole("button", { name: "Pause meeting decisions", exact: true }).click();
    assert.equal((await meeting(page)).status, "paused");
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    const armedFrom = await page.evaluate(() => window.__discussionMock.allInvocations.length);
    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
    const firstId = await automaticRequest(page, 1);
    await assertOnlyArmedDiscussion(page, armedFrom);
    const firstState = await availableDecision(page);
    assert.equal(firstState.actor, "arwyn");
    assertOfferedDecision(firstState, { kind: "read-invitation" });
    assert.equal(
      await page
        .getByRole("button", { name: "Request next AI decision", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page.getByRole("button", { name: "Stop automatic meeting", exact: true }).isEnabled(),
      true,
    );
    await respond(page, firstId, { kind: "read-invitation" });
    const afterFirst = await meeting(page);
    const dueTown = await savedTown(page);
    const involved = ["arwyn", "northern", "sub"];
    for (const id of involved) {
      const plan = dueTown.agents.find((agent) => agent.id === id).plan;
      assert.equal(plan.day, dueTown.day);
      assert.ok(plan.beats.every((beat) => beat.place === "library" && beat.spot === "out"));
    }
    assert.ok(
      dueTown.agents.some(
        (agent) =>
          agent.id !== "player" && !involved.includes(agent.id) && agent.plan.day < dueTown.day,
      ),
      "The pacing window has an uninvolved resident's stale plan due on the next normal tick",
    );
    const beforeNormalTick = await page.locator(".hud-clock").innerText();
    // Exercise the real minute loop while there is no pending meeting request.
    // A jump alone would not run enough animation frames to test takeJob.
    await page.clock.runFor(1_100);
    assert.notEqual(await page.locator(".hud-clock").innerText(), beforeNormalTick);
    await assertOnlyArmedDiscussion(page, armedFrom);
    await advanceDiscussionWindow(page, 5_000);
    const waiting = await meeting(page);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 1);
    assert.equal(waiting.decisions, afterFirst.decisions);
    assert.deepEqual(waiting.usage, afterFirst.usage);
    assert.equal(waiting.pending, null);
    await assertOnlyArmedDiscussion(page, armedFrom);
    result.assertions.push(
      "A real normal town tick with stale plans dispatches no background AI while the automatic meeting is armed or pacing",
    );
    result.assertions.push(
      "Paused Start resumes once; manual stepping is excluded, and pacing wait consumes no request or accounting",
    );

    const choices = [{ actor: firstState.actor, kind: "read-invitation" }];
    while (!(await meeting(page)).utterances.length && choices.length < 16) {
      const id = await automaticRequest(page, choices.length + 1);
      const state = await availableDecision(page);
      const kinds = offeredKinds(state);
      const preference = [
        "read-invitation",
        "accept",
        state.actor === "arwyn" ? "participate" : "listen",
        "request-turn",
        "speak",
      ];
      const kind = preference.find((candidate) => kinds.includes(candidate));
      assert.ok(kind, `No legal synthetic choice for ${state.actor}: ${JSON.stringify(kinds)}`);
      const decision = kind === "speak" ? { kind, text: "SYNTHETIC_AUTO_FIRST_LINE" } : { kind };
      assertOfferedDecision(state, decision);
      choices.push({ actor: state.actor, kind });
      await respond(page, id, decision);
      await assertOnlyArmedDiscussion(page, armedFrom);
    }
    const spoken = await meeting(page);
    assert.equal(spoken.utterances.length, 1, JSON.stringify(choices));
    assert.equal(spoken.utterances[0].speaker, "arwyn");
    assert.deepEqual([...spoken.utterances[0].recipientIds].sort(), ["northern", "sub"]);
    assert.equal(spoken.members.find((m) => m.id === "player").mode, "off");
    for (const id of ["northern", "sub"])
      assert.equal(
        spoken.members.find((m) => m.id === id).decisionNeeded,
        true,
        "Actually heard speech cues an attentive NPC listener once",
      );
    for (const id of ["player", "baba"])
      assert.ok(
        !(await savedTown(page)).agents
          .find((a) => a.id === id)
          .memories.some((m) => m.text.includes("SYNTHETIC_AUTO_FIRST_LINE")),
      );
    result.assertions.push(
      "One Start drives actual offered synthetic invitation/attention/speech choices; only actual NPC listeners receive the line and its reconsideration cue",
    );

    for (const actor of ["northern", "sub"]) {
      const id = await automaticRequest(page, choices.length + 1);
      const state = await availableDecision(page);
      assert.equal(state.actor, actor);
      assertOfferedDecision(state, { kind: "listen" });
      await respond(page, id, { kind: "listen" });
      await assertOnlyArmedDiscussion(page, armedFrom);
      choices.push({ actor, kind: "listen" });
      assert.equal((await meeting(page)).members.find((m) => m.id === actor).decisionNeeded, false);
    }
    const pending = await automaticRequest(page, choices.length + 1);
    await assertOnlyArmedDiscussion(page, armedFrom);
    result.armedInvocationRanges = [
      {
        from: armedFrom,
        until: (await discussionTransportReceipt(page)).allInvocations.length,
      },
    ];
    assertOfferedDecision(await availableDecision(page), { kind: "speak" });
    const field = await draftField(page);
    await field.fill("SYNTHETIC retained player draft");
    await page.getByRole("button", { name: "Stop automatic meeting", exact: true }).click();
    await assertStopped(page, meeting);
    assert.equal(
      await page.getByRole("button", { name: "Start automatic meeting", exact: true }).isDisabled(),
      true,
      "A cancelled underlying transport must still settle",
    );
    await respond(page, pending, { kind: "speak", text: "SYNTHETIC_AUTO_LATE_STOP" });
    await assertNoWords(await savedTown(page), "SYNTHETIC_AUTO_LATE_STOP");
    assert.equal(await field.inputValue(), "SYNTHETIC retained player draft");
    const stoppedCount = await page.evaluate(() => window.__discussionMock.calls.length);
    await advanceDiscussionWindow(page, 62_100);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), stoppedCount);
    result.assertions.push(
      "Heard-word cues are consumed once; explicit Stop rejects a late legal speech result, retains the draft and never restarts on time alone",
    );

    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
    const hiddenId = await automaticRequest(page, stoppedCount + 1);
    assertOfferedDecision(await availableDecision(page), { kind: "speak" });
    await setHidden(page, true);
    await assertStopped(page, meeting);
    await respond(page, hiddenId, { kind: "speak", text: "SYNTHETIC_AUTO_LATE_HIDDEN" });
    await setHidden(page, false);
    await advanceDiscussionWindow(page, 62_100);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), hiddenId + 1);
    await assertNoWords(await savedTown(page), "SYNTHETIC_AUTO_LATE_HIDDEN");
    assert.equal(await field.inputValue(), "SYNTHETIC retained player draft");
    result.assertions.push(
      "Hidden tabs stop the run and reject its late legal result; visibility restoration does not resume generation",
    );

    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
    await automaticRequest(page, hiddenId + 2);
    result.transportBeforeReload = await discussionTransportReceipt(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__game && window.__discussionMock));
    await openMeeting(page);
    assert.match(await page.locator(".discussion-state").innerText(), /Meeting paused/);
    assert.equal(
      await page.getByRole("button", { name: "Start automatic meeting", exact: true }).isVisible(),
      true,
    );
    await page.clock.fastForward(62_100);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
    assert.equal((await meeting(page)).utterances.length, 1);
    result.assertions.push(
      "Reload preserves the committed transcript but never restores automatic authorization or resends a pending request",
    );
    await auditMeeting(page, result, "automatic meeting stopped after reload");
    await capture(page, `${viewport.name}-automatic-meeting.png`);
    result.choices = choices;
    await finish(result, context, page);
  }

  {
    const { context, page, result } = await createJourney(viewport, "automatic failure and quota");
    await propose(page, "SYNTHETIC automatic failure boundaries");
    const field = await draftField(page);
    await field.fill("SYNTHETIC failure draft");
    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
    const failed = await automaticRequest(page, 1);
    await page.evaluate((id) => window.__discussionMock.reject(id), failed);
    await assertStopped(page, meeting);
    await advanceDiscussionWindow(page, 62_100);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 1);
    assert.equal((await meeting(page)).utterances.length, 0);
    assert.equal(await field.inputValue(), "SYNTHETIC failure draft");

    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
    const quota = await automaticRequest(page, 2);
    await page.evaluate(
      (id) =>
        window.__discussionMock.resolve(id, {
          ok: false,
          error: "slow",
          diagnostics: {
            mode: "pool",
            attempts: 0,
            elapsedMs: 0,
            totalTokens: null,
            outcome: null,
            status: null,
          },
        }),
      quota,
    );
    await assertStopped(page, meeting);
    await advanceDiscussionWindow(page, 62_100);
    assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 2);
    assert.equal((await meeting(page)).utterances.length, 0);
    assert.equal(await field.inputValue(), "SYNTHETIC failure draft");
    result.assertions.push(
      "Synthetic transport failure and quota refusal each stop automatic mode without retry, fallback dialogue or draft loss",
    );
    await auditMeeting(page, result, "automatic failure and quota stop");
    await capture(page, `${viewport.name}-automatic-failure.png`);
    await finish(result, context, page);
  }
}
