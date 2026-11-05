import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { followingFixture } from "./fixtures/following.mjs";

const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const load = (name) => server.ssrLoadModule(`/src/game/${name}.ts`);
const [following, learning, validation, practice, discussion, save, history] = await Promise.all(
  [
    "following-runtime",
    "learning-runtime",
    "learning-validation",
    "learning-practice",
    "discussions",
    "save",
    "learning",
  ].map(load),
);
const who = (town, id) => town.agents.find((a) => a.id === id);
const ok = (result) => {
  assert.equal(result.ok, true, result.message);
  return result;
};
const lesson = (town) => town.followerLearning.sessions.at(-1);
function apply(town, purpose, decision) {
  const request = ok(learning.learningRequest(town, purpose));
  const parsed = validation.parseLearningDecision(JSON.stringify(decision));
  assert.ok(parsed);
  ok(learning.applyLearningDecision(town, request.job, parsed));
  assert.deepEqual(validation.validateFollowerLearning(town), []);
  return request;
}
async function lessonTown(target = "arwyn") {
  const { town, command } = await followingFixture(load, { meeting: target === "arwyn" });
  if (target !== "arwyn") {
    const replaced = target === "socrates" ? "northern" : "arwyn";
    who(town, target).tile = { ...who(town, replaced).tile };
    who(town, target).plan = structuredClone(who(town, replaced).plan);
    who(town, replaced).tile = { ...who(town, replaced).home };
    ok(discussion.createLibraryDiscussion(town, "Checking a useful reference", target));
    for (const member of town.discussions.sessions
      .at(-1)
      .members.filter((m) => m.id !== "player")) {
      command(member.id, "read-invitation");
      command(member.id, "accept");
      command(member.id, member.id === target ? "participate" : "listen");
      if (member.id !== target) member.decisionNeeded = false;
    }
  }
  ok(following.startFollowing(town, target));
  ok(learning.enableLearning(town));
  apply(town, "baseline-plan", { kind: "inspect", boxes: ["Birch", "Alder", "Cedar"] });
  const trial = lesson(town).trials[0];
  const observation = practice.practiceObservation(trial);
  const found = trial.observations.find((row) =>
    row.text.includes(`contains ${observation.recordId}.`),
  );
  apply(town, "baseline-submit", {
    kind: "submit",
    box: found.id.split(":").at(-1),
    historicalDate: "confirmed",
    evidenceIds: [found.id],
  });
  return town;
}

for (const target of ["socrates", "estee"]) {
  test(`${target} can voluntarily teach in the combined cast without fabricated library mastery`, async () => {
    const town = await lessonTown(target);
    const economy = structuredClone(town.economy);
    const relationships = structuredClone(town.agents.map((a) => a.relationships));
    const invitation = apply(town, "invite", {
      kind: "accept",
      text: "Let us check the reference before trusting the label.",
      sourceIds: [practice.LIBRARY_METHOD_CARD.id],
    });
    assert.equal(invitation.job.actor, target);
    apply(town, "question", {
      kind: "question",
      text: "What would establish which box holds the record?",
      sourceIds: [`${lesson(town).id}:method-card`],
    });
    apply(town, "answer", {
      kind: "answer",
      text: "Inspect the current box contents and retain the record identifier.",
      sourceIds: [`${lesson(town).id}:question:1`],
    });
    apply(town, "reflection", {
      kind: "reflect",
      text: "I heard a method; I have not demonstrated it yet.",
      sourceIds: [`${lesson(town).id}:method-card`],
    });
    assert.deepEqual(history.publicLearningHistory(town, target), []);
    assert.deepEqual(town.economy, economy);
    assert.deepEqual(
      town.agents.map((a) => a.relationships),
      relationships,
    );
    const restored = save.parseTownFile(save.exportTown(town));
    assert.ok(restored);
    assert.equal(restored.agents.length, 10);
    assert.deepEqual(lesson(restored).receipts, lesson(town).receipts);
    assert.equal(restored.following.sessions.at(-1).state, "paused");
    assert.deepEqual(history.publicLearningHistory(restored, target), []);
  });
}

test("eight-person towns retain teaching receipts and identities through newcomer arrival", async () => {
  // Exported with the original eight-person F2 implementation, not a current
  // town with residents deleted after events have already named them.
  const raw = await readFile(
    new URL("./fixtures/legacy-eight-teaching-town.json", import.meta.url),
    "utf8",
  );
  const old = JSON.parse(raw);
  const identities = structuredClone(old.town.identityRegistry);
  const receipts = structuredClone(lesson(old.town).receipts);
  const restored = save.parseTownFile(raw);
  assert.ok(restored);
  assert.equal(restored.agents.length, 10);
  assert.deepEqual(lesson(restored).receipts, receipts);
  assert.equal(lesson(restored).consent, "declined");
  assert.equal(restored.following.sessions.at(-1).state, "paused");
  for (const agent of old.town.agents)
    assert.deepEqual(
      restored.identityRegistry.characters[agent.id],
      identities.characters[agent.id],
    );
  assert.deepEqual(restored.economy.transactions, old.town.economy.transactions);
  assert.deepEqual(
    save.parseTownFile(save.exportTown(restored)).identityRegistry,
    restored.identityRegistry,
  );
});

test("old-town arrival preserves the exact witnessed failure, correction and reuse history", async () => {
  const raw = await readFile(
    new URL("./fixtures/legacy-eight-history-town.json", import.meta.url),
    "utf8",
  );
  const old = JSON.parse(raw);
  const before = history.publicLearningHistory(old.town, "arwyn");
  assert.deepEqual(
    before.map((row) => row.stage),
    ["needs-correction", "ready-to-try", "demonstrated-reuse"],
  );
  const restored = save.parseTownFile(raw);
  assert.ok(restored);
  assert.deepEqual(history.publicLearningHistory(restored, "arwyn"), before);
  assert.deepEqual(history.publicLearningHistory(restored, "socrates"), []);
  assert.deepEqual(history.publicLearningHistory(restored, "estee"), []);
  assert.deepEqual(restored.economy.transactions, old.town.economy.transactions);
});
