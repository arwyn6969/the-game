import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { residentLearningFixture } from "./fixtures/resident-learning.mjs";

const cacheDir = await mkdtemp(join(tmpdir(), "town-resident-learning-"));
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  cacheDir,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
});
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { advanceLibraryProject, validateLibraryState } =
  await server.ssrLoadModule("/src/game/community.ts");
const { learningContext } = await server.ssrLoadModule("/src/game/learning.ts");
const { buildPrompt } = await server.ssrLoadModule("/src/game/prompt.ts");
const { initializePhysicalItems, startPhysicalSession, stopPhysicalSession } =
  await server.ssrLoadModule("/src/game/physical-items.ts");
const { createLibraryDiscussion, applyDiscussionCommand } = await server.ssrLoadModule(
  "/src/game/discussions.ts",
);
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { makeMemory, pushMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { resident, state, act, testedIndex, reviewFailure, correct } =
  await residentLearningFixture(server);
const reuseEvents = (town) =>
  state(town).events.filter((event) => event.id.includes("method-reuse"));

test("a failed real lookup leads to a corrected method, different-task reuse and reload continuity", () => {
  let town = testedIndex();
  assert.equal(state(town).lookup.result, "failure");
  reviewFailure(town);
  const beforeCorrection = learningContext(town, "arwyn")[0];
  assert.equal(beforeCorrection.evidence.length, 1);
  correct(town);
  assert.equal(reuseEvents(town).length, 0, "correction alone is not demonstrated learning");
  const books = structuredClone(town.economy.work);
  const balances = town.agents.map(({ money }) => money);
  const oldLookup = structuredClone(state(town).lookup);
  town.minute++;
  advanceLibraryProject(town);
  const learned = learningContext(town, "arwyn")[0];
  assert.equal(learned.status, "demonstrated-reuse");
  assert.match(learned.evidence.at(-1).summary, /Hobbs equipment register.*Birch.*revision 2/);
  assert.match(learned.limit, /engine-guided.*not general mastery/);
  assert.deepEqual(state(town).lookup, oldLookup, "original failed trial is retained");
  assert.deepEqual(town.economy.work, books, "no invented reward or new funded work");
  assert.deepEqual(
    town.agents.map(({ money }) => money),
    balances,
  );
  assert.deepEqual(validateLibraryState(town), []);
  assert.deepEqual(auditEconomy(town), []);
  town = parseTownFile(exportTown(town));
  assert.deepEqual(learningContext(town, "arwyn")[0], learned);
  for (let repeat = 0; repeat < 3; repeat++) {
    town.minute++;
    advanceLibraryProject(town);
  }
  assert.equal(reuseEvents(town).length, 1, "the transfer trial cannot repeat after reload");
});

test("only witnessed/read evidence becomes context; observation does not grant competence", () => {
  const town = testedIndex();
  reviewFailure(town, true);
  correct(town);
  resident(town, "amelia").tile = { x: 6, y: 6 };
  town.minute++;
  advanceLibraryProject(town);
  assert.equal(learningContext(town, "arwyn")[0].status, "demonstrated-reuse");
  assert.equal(learningContext(town, "data")[0].status, "observed-reuse");
  assert.match(learningContext(town, "data")[0].limit, /does not demonstrate personal competence/);
  assert.deepEqual(learningContext(town, "amelia"), []);
});

test("a resident must reach the library and a later opportunity before applying the method", () => {
  const town = testedIndex();
  reviewFailure(town);
  correct(town);
  advanceLibraryProject(town);
  assert.equal(reuseEvents(town).length, 0, "no same-moment retrospective success");
  resident(town, "arwyn").tile = { ...ANCHORS.park };
  town.minute++;
  advanceLibraryProject(town);
  assert.equal(reuseEvents(town).length, 0, "a remote intention cannot perform a box search");
  resident(town, "arwyn").tile = { ...ANCHORS.library };
  advanceLibraryProject(town);
  assert.equal(reuseEvents(town).length, 1);
});

test("Arwyn's library home does not create a trial while asleep or reading privately", () => {
  let town = testedIndex();
  reviewFailure(town);
  correct(town);
  resident(town, "arwyn").tile = { ...resident(town, "arwyn").home };
  town.minute = 21 * 60;
  advanceLibraryProject(town);
  assert.equal(reuseEvents(town).length, 0);
  town = parseTownFile(exportTown(town));
  town.day++;
  town.minute = 7 * 60;
  advanceLibraryProject(town);
  assert.equal(reuseEvents(town).length, 0);
  assert.equal(learningContext(town, "arwyn")[0].status, "ready-to-try");
  town.minute = 8 * 60;
  resident(town, "arwyn").tile = { ...ANCHORS.library };
  advanceLibraryProject(town);
  assert.equal(reuseEvents(town).length, 1);
  assert.match(reuseEvents(town)[0].text, /he checked/);
});

test("an active manuscript trial or accepted meeting retains Arwyn's attention", () => {
  for (const control of ["manuscript", "meeting"]) {
    const town = testedIndex();
    reviewFailure(town);
    correct(town);
    if (control === "manuscript") {
      assert.equal(initializePhysicalItems(town).ok, true);
      assert.equal(startPhysicalSession(town, "arwyn").ok, true);
    } else {
      resident(town, "player").tile = { x: 43, y: 21 };
      assert.equal(createLibraryDiscussion(town, "Discuss the library checks", "arwyn").ok, true);
      const meeting = town.discussions.sessions.at(-1);
      const command = (id, kind, extra = {}) =>
        applyDiscussionCommand(town, id, {
          kind,
          meetingId: meeting.id,
          expectedRevision: meeting.members.find((member) => member.id === id).revision,
          commandId: `learning:${id}:${kind}`,
          ...extra,
        });
      assert.equal(command("player", "invite", { invitee: "arwyn" }).ok, true);
      assert.equal(command("arwyn", "accept").ok, true);
    }
    town.minute++;
    advanceLibraryProject(town);
    assert.equal(reuseEvents(town).length, 0, `${control} keeps control of the resident`);
    if (control === "manuscript") stopPhysicalSession(town);
    else {
      const meeting = town.discussions.sessions.at(-1);
      assert.equal(
        applyDiscussionCommand(town, "arwyn", {
          kind: "leave",
          meetingId: meeting.id,
          expectedRevision: meeting.members.find((member) => member.id === "arwyn").revision,
          commandId: "learning:arwyn:leave",
        }).ok,
        true,
      );
    }
    town.minute++;
    advanceLibraryProject(town);
    assert.equal(reuseEvents(town).length, 1);
  }
});

test("closing the paid project retains the free later method trial", () => {
  const town = testedIndex();
  reviewFailure(town);
  correct(town);
  act(town, "close");
  assert.equal(state(town).phase, "closed");
  const books = structuredClone(town.economy.work);
  const balances = town.agents.map(({ money }) => money);
  town.minute++;
  advanceLibraryProject(town);
  assert.equal(learningContext(town, "arwyn")[0].status, "demonstrated-reuse");
  assert.deepEqual(town.economy.work, books);
  assert.deepEqual(
    town.agents.map(({ money }) => money),
    balances,
  );
});

test("self-praise, successful first attempts and unsupported corrections do not create growth", () => {
  const untouched = createTown("Mira");
  const arwyn = resident(untouched, "arwyn");
  pushMemory(
    arwyn,
    makeMemory(untouched, 1, 480, "reflect", "I have mastered all library research.", 10),
  );
  assert.deepEqual(learningContext(untouched, "arwyn"), []);
  const successful = testedIndex("Cedar");
  assert.deepEqual(
    learningContext(successful, "northern"),
    [],
    "one success is not an improvement comparison",
  );
  const town = testedIndex();
  reviewFailure(town);
  correct(town);
  state(town).revisions.at(-1).mappings["room-access"] = "Birch";
  town.minute++;
  advanceLibraryProject(town);
  assert.equal(learningContext(town, "arwyn")[0].status, "needs-correction");
  assert.equal(reuseEvents(town).length, 0);
});

test("a forged reuse event cannot survive saved-state validation", () => {
  const town = testedIndex();
  reviewFailure(town);
  correct(town);
  town.minute++;
  advanceLibraryProject(town);
  reuseEvents(town)[0].text = "Arwyn became an expert without doing any work.";
  assert.ok(validateLibraryState(town).some((error) => /learned-method trial/.test(error)));
  assert.equal(learningContext(town, "arwyn")[0].status, "ready-to-try");
  assert.equal(parseTownFile(exportTown(town)), null);
});

test("a transfer result cannot precede the corrected revision or its completion receipt", () => {
  const town = testedIndex();
  reviewFailure(town);
  correct(town);
  town.minute++;
  advanceLibraryProject(town);
  town.minute += 5;
  state(town).revisions.at(-1).minute = town.minute;
  assert.ok(validateLibraryState(town).some((error) => /learned-method trial/.test(error)));
  assert.equal(learningContext(town, "arwyn")[0].status, "needs-correction");
  assert.equal(parseTownFile(exportTown(town)), null);
  state(town).events.find((event) => event.id === "library:correction").minute = town.minute;
  assert.equal(learningContext(town, "arwyn")[0].status, "needs-correction");
  assert.equal(parseTownFile(exportTown(town)), null);
});

test("learning context is read-only and absent from legacy towns without trial evidence", () => {
  const town = createTown("Mira");
  const before = exportTown(town);
  for (const agent of town.agents) assert.deepEqual(learningContext(town, agent.id), []);
  assert.equal(exportTown(town), before);
  const loaded = parseTownFile(before);
  assert.deepEqual(learningContext(loaded, "arwyn"), []);
});

test("later conversation and reflection receive saved learning evidence without informing absent residents", () => {
  let town = testedIndex();
  reviewFailure(town);
  correct(town);
  resident(town, "amelia").tile = { x: 6, y: 6 };
  town.minute++;
  advanceLibraryProject(town);
  town = parseTownFile(exportTown(town));
  for (const kind of ["player", "reflect", "plan"]) {
    const job = {
      kind,
      agentId: "arwyn",
      agents: ["arwyn"],
      text: "What did the failed library search teach you?",
      weekly: false,
      day: town.day,
      minute: town.minute,
    };
    const prompt = buildPrompt(town, job);
    assert.match(prompt, /"status":"demonstrated-reuse"/);
    assert.match(prompt, /library:method-reuse:2:hobbs-equipment/);
    assert.ok(prompt.length <= 14000, `${kind} prompt exceeded its context bound`);
    const absent = buildPrompt(town, { ...job, agentId: "amelia", agents: ["amelia"] });
    assert.doesNotMatch(absent, /"status":"demonstrated-reuse"|library:method-reuse/);
  }
});
