import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { residentLearningFixture } from "./fixtures/resident-learning.mjs";

const cacheDir = await mkdtemp(join(tmpdir(), "town-public-learning-"));
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
const { publicLearningHistory, learningContext } =
  await server.ssrLoadModule("/src/game/learning.ts");
const { advanceLibraryProject, libraryView, validateLibraryState } =
  await server.ssrLoadModule("/src/game/community.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { makeMemory, pushMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { resident, state, testedIndex, reviewFailure, correct } =
  await residentLearningFixture(server);
const history = (town, id = "arwyn") => publicLearningHistory(town, id);
const stages = (town, id) => history(town, id).map((entry) => entry.stage);
const reuse = (town) => state(town).events.find((event) => event.id.includes("method-reuse"));
function journey() {
  const town = testedIndex();
  reviewFailure(town, true);
  correct(town);
  town.minute++;
  advanceLibraryProject(town);
  return town;
}
// Simulate an absent audience without disturbing the actual receipts or resident evidence.
function forget(town, id, keep = () => false) {
  const events = state(town).events;
  for (const event of events.filter((event) => !keep(event))) {
    event.participants = event.participants.filter((participant) => participant !== id);
    event.witnesses = event.witnesses.filter((witness) => witness !== id);
  }
  resident(town, id).memories = resident(town, id).memories.filter(
    (memory) => !events.some((event) => !keep(event) && event.text === memory.text),
  );
}

test("fresh and legacy towns have an honest empty history and no read mutation", async () => {
  const legacy = parseTownFile(
    await readFile(new URL("fixtures/legacy-six-resident-town.json", import.meta.url), "utf8"),
  );
  for (const town of [createTown("Mira"), legacy]) {
    assert.ok(town);
    const before = exportTown(town);
    for (const agent of town.agents) assert.deepEqual(history(town, agent.id), []);
    assert.equal(exportTown(town), before);
  }
});

test("real failure, correction and later different-record success have actual dated stages", () => {
  const town = testedIndex();
  reviewFailure(town);
  assert.deepEqual(stages(town), ["needs-correction"]);
  correct(town);
  assert.deepEqual(stages(town), ["needs-correction", "ready-to-try"]);
  town.minute++;
  advanceLibraryProject(town);
  assert.deepEqual(stages(town), ["needs-correction", "ready-to-try", "demonstrated-reuse"]);
  for (const entry of history(town)) {
    const event = state(town).events.find((event) => event.id === entry.id);
    assert.deepEqual([entry.day, entry.minute], [event.day, event.minute]);
  }
  assert.match(history(town).at(-1).summary, /Hobbs equipment register.*different record/);
  assert.match(history(town).at(-1).summary, /one successful lookup, not general mastery/);
});

test("a private complete story cannot leak final stage, dates, counts or summaries", () => {
  const town = journey();
  forget(town, "player");
  assert.equal(learningContext(town, "arwyn")[0].status, "demonstrated-reuse");
  assert.deepEqual(history(town), []);
  state(town).events = state(town).events.filter((event) => !event.id.includes("method-reuse"));
  assert.equal(learningContext(town, "arwyn")[0].status, "ready-to-try");
  assert.deepEqual(
    history(town),
    [],
    "the two private stages yield the identical empty projection",
  );
});

test("missing the later trial leaves the last supported correction state", () => {
  const town = journey();
  forget(town, "player", (event) => !event.id.includes("method-reuse"));
  assert.equal(learningContext(town, "arwyn")[0].status, "demonstrated-reuse");
  assert.deepEqual(stages(town), ["needs-correction", "ready-to-try"]);
  assert.doesNotMatch(JSON.stringify(history(town)), /Hobbs|demonstrated|08:01/);
});

test("later-only and incomplete evidence never invent a prior change or motive", () => {
  for (const keep of ["reuse", "failure-reuse", "correction-reuse"]) {
    const town = journey();
    forget(
      town,
      "player",
      (event) =>
        event.id.includes("method-reuse") ||
        (keep === "failure-reuse" && event.id.startsWith("library:tomorrow:")) ||
        (keep === "correction-reuse" && event.id === "library:correction"),
    );
    assert.equal(history(town).at(-1).stage, "lookup-succeeded");
    assert.match(history(town).at(-1).summary, /Arwyn found the Hobbs equipment register/);
    assert.doesNotMatch(
      history(town).at(-1).summary,
      /revised|different|learned|chose|invented|failed/,
    );
  }
});

test("observation never grants another resident Arwyn's personal demonstration", () => {
  const town = journey();
  assert.deepEqual(stages(town, "data"), ["needs-correction", "ready-to-try", "observed-reuse"]);
  assert.match(history(town, "data").at(-1).summary, /not demonstrated the method themselves/);
  assert.deepEqual(history(town, "amelia"), []);
  forget(town, "data", (event) => event.id.includes("method-reuse"));
  assert.equal(history(town, "data").at(-1).stage, "lookup-succeeded");
  assert.doesNotMatch(history(town, "data").at(-1).summary, /revised|different/);
});

test("the player's evidence cannot supply a resident's missing earlier evidence", () => {
  const town = journey();
  forget(town, "data", (event) => event.id === "library:correction");
  assert.deepEqual(stages(town, "data"), ["ready-to-try"]);
  assert.equal(history(town).at(-1).stage, "demonstrated-reuse");
});

test("posted notices, project view, self-praise and matching chat/reflection are insufficient", () => {
  const town = journey();
  forget(town, "player");
  const failure = state(town).events.find((event) => event.id.startsWith("library:tomorrow:"));
  assert.ok(town.notices.length);
  assert.ok(libraryView(town).events.length);
  for (const [type, source] of [
    ["chat", "statement"],
    ["reflect", "reflection"],
    ["observe", "statement"],
    ["chat", "event"],
    ["reflect", "event"],
  ]) {
    pushMemory(
      resident(town, "player"),
      makeMemory(town, town.day, town.minute, type, failure.text, 8, { source }),
    );
    assert.deepEqual(history(town), [], `${type}/${source} is not a verified observation receipt`);
  }
});

test("an exact event-source observation can establish knowledge but not an unmatched claim", () => {
  const town = journey();
  forget(town, "player");
  const failure = state(town).events.find((event) => event.id.startsWith("library:tomorrow:"));
  pushMemory(
    resident(town, "player"),
    makeMemory(town, town.day, town.minute, "observe", `${failure.text} Allegedly.`, 8, {
      source: "event",
    }),
  );
  assert.deepEqual(history(town), []);
  pushMemory(
    resident(town, "player"),
    makeMemory(town, town.day, town.minute, "observe", failure.text, 8, { source: "event" }),
  );
  assert.deepEqual(stages(town), ["needs-correction"]);
});

test("a read receipt cannot predate its event, come from the future or be a secret seed", () => {
  const town = journey();
  forget(town, "player");
  const failure = state(town).events.find((event) => event.id.startsWith("library:tomorrow:"));
  for (const extra of [
    { day: 1, minute: 0 },
    { day: town.day + 1, minute: town.minute },
    { seed: true },
  ]) {
    resident(town, "player").memories = [];
    pushMemory(resident(town, "player"), {
      ...makeMemory(town, town.day, town.minute, "observe", failure.text, 8, { source: "event" }),
      ...extra,
    });
    assert.deepEqual(history(town), []);
  }
});

test("repeated projection and save/import keep unique legitimate rows, balances and trial", () => {
  let town = journey();
  const before = exportTown(town);
  const visible = history(town);
  for (let i = 0; i < 5; i++) assert.deepEqual(history(town), visible);
  assert.equal(exportTown(town), before);
  const books = structuredClone(town.economy);
  const balances = town.agents.map(({ money }) => money);
  town = parseTownFile(before);
  assert.ok(town);
  assert.deepEqual(history(town), visible);
  town.minute++;
  advanceLibraryProject(town);
  assert.deepEqual(history(town), visible);
  assert.equal(new Set(visible.map(({ id }) => id)).size, 3);
  assert.deepEqual(town.economy, books);
  assert.deepEqual(
    town.agents.map(({ money }) => money),
    balances,
  );
});

test("unsupported and corrupt reuse chronology is rejected and never projected", () => {
  for (const damage of [
    (town) => {
      reuse(town).minute = state(town).revisions.at(-1).minute;
    },
    (town) => {
      state(town).revisions.at(-1).mappings["room-access"] = "Birch";
    },
    (town) => {
      reuse(town).text = "I am an expert now";
    },
    (town) => {
      state(town).events.push(structuredClone(reuse(town)));
    },
  ]) {
    const town = journey();
    damage(town);
    assert.ok(validateLibraryState(town).length);
    assert.deepEqual(history(town), []);
    assert.equal(parseTownFile(exportTown(town)), null);
  }
});
