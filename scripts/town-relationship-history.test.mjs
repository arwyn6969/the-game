import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const community = await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const { sharedActivities, hasSharedHistory } = await server.ssrLoadModule(
  "/src/components/town/relationship-history.ts",
);
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const library = (town) => town.economy.projects.library;

function act(town, kind, arg) {
  const choice = community.libraryActions(town).find((item) => {
    const [actualKind, actualArg] = JSON.parse(item.id);
    return actualKind === kind && (arg === undefined || actualArg === arg);
  });
  assert.ok(choice, `Missing ${kind}:${arg ?? ""}`);
  assert.equal(choice.disabledReason, undefined, choice.disabledReason);
  const result = community.applyLibraryAction(town, choice.id);
  assert.equal(result.ok, true, result.reply);
}

function completedReading(venue = "library") {
  const town = createTown("Mira");
  act(town, "accept", "reference");
  person(town, "player").tile = { ...ANCHORS.library };
  for (const key of [
    "card:kevin",
    "box:Birch",
    "box:Alder",
    "box:Cedar",
    "card:equipment",
    "card:dorm",
  ])
    act(town, "inspect", key);
  act(town, "report", "reference");
  act(town, "request", "source");
  act(town, "submit", "player");
  act(town, "test", "");
  for (let minute = 0; minute < 120 && library(town).lookup.status !== "done"; minute++)
    advanceTown(town, 1);
  assert.equal(library(town).lookup.status, "done");
  act(town, "evening-plan", venue);
  if (venue === "library") act(town, "evening-wait-note");
  person(town, "player").tile = { ...community.libraryView(town).story.gathering.tile };
  for (let minute = 0; minute < 180 && library(town).evening.status !== "ready"; minute++)
    advanceTown(town, 1);
  assert.equal(library(town).evening.status, "ready");
  act(town, "evening-join", "listen");
  assert.deepEqual(community.validateLibraryState(town), []);
  return town;
}

const completedLibrary = completedReading();

test("a witnessed reading counts as shared history without inventing chat or changing rapport", () => {
  const town = structuredClone(completedLibrary);
  const before = exportTown(town);
  for (const id of ["northern", "arwyn", "sub"]) {
    assert.equal(
      person(town, id).memories.some((m) => m.type === "chat" && m.with === "player"),
      false,
    );
    assert.equal(hasSharedHistory(town, id), true);
    assert.equal(sharedActivities(town, id).length, 1);
    assert.equal(sharedActivities(town, id)[0].title, "Northern's first reading");
    assert.match(sharedActivities(town, id)[0].text, /Mira joined Northern's first reading/);
  }
  assert.equal(hasSharedHistory(town, "kevin"), false);
  assert.deepEqual(sharedActivities(town, "kevin"), []);
  assert.equal(exportTown(town), before, "Reading presentation must leave every saved fact intact");
});

test("actual reading history survives save export and import with the same audience", () => {
  const restored = parseTownFile(exportTown(completedLibrary));
  assert.ok(restored);
  for (const id of ["northern", "arwyn", "sub", "kevin", "player"])
    assert.deepEqual(sharedActivities(restored, id), sharedActivities(completedLibrary, id));
});

test("a park reading does not invent shared attendance for the library's other guest", () => {
  const town = completedReading("park");
  assert.equal(hasSharedHistory(town, "sub"), true);
  assert.equal(hasSharedHistory(town, "northern"), true);
  assert.deepEqual(sharedActivities(town, "arwyn"), []);
  assert.equal(hasSharedHistory(town, "arwyn"), false);
});

test("invitations, offscreen outcomes and remembered public notes do not claim attendance", () => {
  for (const status of ["invited", "waiting", "routing", "ready"]) {
    const town = structuredClone(completedLibrary);
    library(town).evening.status = status;
    assert.deepEqual(sharedActivities(town, "arwyn"), []);
  }
  const town = structuredClone(completedLibrary);
  library(town).evening.attendedByPlayer = false;
  assert.ok(person(town, "player").memories.some((memory) => memory.source === "event"));
  assert.deepEqual(sharedActivities(town, "arwyn"), []);
  assert.equal(hasSharedHistory(town, "arwyn"), false);
});

test("a shared reading requires its actual participant receipt at the recorded time", () => {
  const town = structuredClone(completedLibrary);
  const state = library(town);
  const scene = state.events.find((event) => event.id.endsWith(":scene"));
  scene.participants = scene.participants.filter((id) => id !== "arwyn");
  assert.deepEqual(sharedActivities(town, "arwyn"), []);
  assert.equal(sharedActivities(town, "sub").length, 1);
  scene.participants = scene.participants.filter((id) => id !== "player");
  assert.deepEqual(sharedActivities(town, "sub"), []);
  const future = structuredClone(completedLibrary);
  future.day = 1;
  future.minute = 0;
  assert.deepEqual(sharedActivities(future, "sub"), []);
});

test("discussion history includes only this resident's speech actually heard by the player", () => {
  const town = createTown("Mira");
  const at = { day: town.day, minute: town.minute };
  town.discussions = {
    version: 1,
    sessions: [
      {
        id: "audience-test",
        utterances: [
          { speaker: "arwyn", text: "Private line", at, recipientIds: ["sub"] },
          { speaker: "arwyn", text: "Heard line", at, recipientIds: ["player", "sub"] },
          { speaker: "northern", text: "Other speaker", at, recipientIds: ["player", "arwyn"] },
          {
            speaker: "arwyn",
            text: "Future line",
            at: { day: town.day + 1, minute: 0 },
            recipientIds: ["player"],
          },
        ],
      },
    ],
  };
  assert.deepEqual(sharedActivities(town, "arwyn"), [
    {
      id: "discussion:audience-test",
      title: "Library discussion",
      ...at,
      text: "Arwyn: Heard line",
    },
  ]);
  assert.equal(hasSharedHistory(town, "arwyn"), true);
  assert.deepEqual(sharedActivities(town, "sub"), [], "Hidden recipients are not a public roster");
  assert.equal(hasSharedHistory(town, "sub"), false);
  assert.doesNotMatch(JSON.stringify(sharedActivities(town, "player")), /Private line|Future line/);
});
