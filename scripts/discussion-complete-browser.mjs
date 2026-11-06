import assert from "node:assert/strict";
import {
  advanceDiscussionWindow,
  assertOfferedDecision,
  discussionTransportReceipt,
  offeredKinds,
} from "./discussion-auto-browser.mjs";

const saved = (page) =>
  page.evaluate(() => navigator.locks.request("the-game-town-save", () => undefined));

/** One fresh normal-controls activity; synthetic choices do not qualify a model. */
export async function runCompleteMeetingJourney(helpers, viewport) {
  const {
    createJourney,
    openMeeting,
    savedTown,
    meeting,
    availableDecision,
    respond,
    auditMeeting,
    capture,
  } = helpers;
  const { context, page, result } = await createJourney(viewport, "automatic complete activity", {
    backgroundDue: true,
  });
  await openMeeting(page);
  await page.getByLabel("Enable library meetings (experimental)", { exact: true }).check();
  await page
    .getByLabel("Propose one topic", { exact: true })
    .fill("SYNTHETIC complete library discussion");
  await page.getByRole("button", { name: "Propose library meeting", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions?.sessions.length === 1,
  );
  await saved(page);
  const before = await savedTown(page);
  const protectedState = (town) => ({
    identities: town.identityRegistry,
    balances: town.agents.map((actor) => [actor.id, actor.money]),
    tills: town.tills,
    debts: town.favors,
    transactions: town.economy?.transactions ?? [],
  });
  const baseline = protectedState(before);
  const armedFrom = await page.evaluate(() => window.__discussionMock.allInvocations.length);
  await page.getByRole("button", { name: "Start automatic meeting", exact: true }).click();
  const choices = [];
  while ((await meeting(page)).status !== "closed" && choices.length < 16) {
    if (choices.length) await advanceDiscussionWindow(page);
    await page.waitForFunction(
      (count) => window.__discussionMock.calls.length === count + 1,
      choices.length,
    );
    await page.waitForFunction(() =>
      Boolean(
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.discussions.sessions.at(-1)
          .pending,
      ),
    );
    const offered = await availableDecision(page);
    const kinds = offeredKinds(offered);
    const kind = ["read-invitation", "accept", "participate", "request-turn", "speak"].find(
      (candidate) => kinds.includes(candidate),
    );
    assert.ok(kind, `No legal synthetic complete-activity choice for ${offered.actor}`);
    const decision =
      kind === "speak"
        ? { kind, text: `SYNTHETIC_COMPLETE_LINE_${(await meeting(page)).utterances.length + 1}` }
        : { kind };
    assertOfferedDecision(offered, decision);
    choices.push({ actor: offered.actor, kind });
    // Check the armed interval before settling this decision. The final reply
    // closes the meeting and legitimately releases ordinary background AI;
    // slower runners may dispatch that work before the next browser round trip.
    const armed = await page.evaluate(
      (from) => window.__discussionMock.allInvocations.slice(from),
      armedFrom,
    );
    assert.ok(
      armed.every((call) => call.kind === "act"),
      "No background AI while the meeting is armed",
    );
    await respond(page, choices.length - 1, decision);
    const current = await savedTown(page);
    const errors = await page.evaluate(async (town) => {
      const { auditEconomy } = await import("/src/game/economy.ts");
      return auditEconomy(town);
    }, current);
    assert.deepEqual(errors, []);
  }
  const completed = await meeting(page);
  assert.equal(completed.status, "closed");
  assert.match(completed.reason, /six-turn meeting is complete/);
  assert.equal(completed.utterances.length, 6);
  assert.ok(new Set(completed.utterances.map((line) => line.speaker)).size >= 2);
  assert.equal(completed.decisions, choices.length);
  assert.ok(completed.decisions <= 16);
  assert.equal(completed.usage.requests, choices.length);
  assert.equal(completed.usage.providerAttempts, choices.length);
  assert.equal(completed.usage.failures, 0);
  assert.equal(completed.usage.attemptsUnknown, 0);
  assert.equal(completed.pending, null);
  // Give the automatic controller a real opportunity to dispatch after natural
  // closure before global Pause independently stops it.
  await advanceDiscussionWindow(page, 62_100);
  await page.clock.runFor(1_100);
  assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), choices.length);
  assert.equal(
    await page.getByRole("button", { name: "Stop automatic meeting", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Stop library meeting", exact: true }).count(),
    0,
    "The global toolbar must also reflect that automatic mode ended naturally",
  );
  assert.equal(
    await page.getByRole("button", { name: "Start automatic meeting", exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("button", { name: "Resume meeting", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await saved(page);
  const final = await savedTown(page);
  assert.deepEqual(protectedState(final), baseline);
  const checkKnowledge = async (town) => {
    const knowledge = await page.evaluate(async (town) => {
      const { discussionObservation } = await import("/src/game/discussions.ts");
      const session = town.discussions.sessions.at(-1);
      return town.agents.map((actor) => ({
        id: actor.id,
        heard: discussionObservation(town, actor.id, session.id).receivedTurns.map(
          (line) => line.id,
        ),
      }));
    }, town);
    for (const actor of town.agents) {
      const eligible = completed.utterances.filter(
        (line) => line.speaker === actor.id || line.recipientIds.includes(actor.id),
      );
      assert.deepEqual(
        knowledge.find((row) => row.id === actor.id).heard,
        eligible.map((line) => line.id),
      );
      for (const line of completed.utterances)
        assert.equal(
          actor.memories.filter((memory) => memory.text.includes(line.text)).length,
          Number(eligible.includes(line)),
        );
      for (const memory of before.agents.find((old) => old.id === actor.id).memories)
        assert.ok(
          actor.memories.some(
            (retained) => retained.id === memory.id && retained.text === memory.text,
          ),
        );
    }
  };
  await checkKnowledge(final);
  for (const line of completed.utterances) {
    assert.deepEqual(
      [...line.recipientIds].sort(),
      ["arwyn", "northern", "sub"].filter((id) => id !== line.speaker),
    );
    assert.ok(!line.recipientIds.includes("player"));
  }
  const transport = await discussionTransportReceipt(page);
  for (let index = 1; index < transport.actCalls.length; index++)
    assert.ok(
      transport.actCalls[index].startedAt - transport.actCalls[index - 1].startedAt >= 31_000,
    );
  result.choices = choices;
  result.completeActivity = {
    decisions: completed.decisions,
    spokenTurns: completed.utterances.length,
    speakers: [...new Set(completed.utterances.map((line) => line.speaker))],
    allEightAudiencesAudited: true,
  };
  await auditMeeting(page, result, "complete six-turn activity");
  await page.locator(".discussion-state").scrollIntoViewIfNeeded();
  await capture(page, `${viewport.name}-complete-activity.png`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__game && window.__discussionMock));
  await openMeeting(page);
  // A normal save action records the actual loaded town, rather than merely
  // rereading the preserved original raw file and assuming loading kept it.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await saved(page);
  const reloaded = await savedTown(page);
  assert.deepEqual(reloaded.discussions.sessions.at(-1), completed);
  assert.deepEqual(protectedState(reloaded), baseline);
  await checkKnowledge(reloaded);
  assert.equal(await page.evaluate(() => window.__discussionMock.calls.length), 0);
  result.assertions.push(
    "One Start drives a fresh legal six-turn activity to natural closure, with exact audiences, retained accounts, pacing and no additional meeting dispatch after closure or reload",
  );
  result.transport = transport;
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unexpectedServerRequests, []);
  await context.close();
}
