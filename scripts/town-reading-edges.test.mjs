import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const {
  libraryActions,
  applyLibraryAction,
  libraryView,
  validateLibraryState,
  residentLibraryReply,
  residentReadingReply,
} = await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const state = (town) => town.economy.projects.library;
const evening = (town) => state(town).evening;
const choice = (town, kind, arg) =>
  libraryActions(town).find((item) => {
    const [actualKind, actualArg] = JSON.parse(item.id);
    return actualKind === kind && actualArg === arg;
  });
function act(town, kind, arg = "") {
  const action = choice(town, kind, arg);
  assert.ok(action, `Missing ${kind}:${arg}`);
  assert.equal(action.disabledReason, undefined, action.disabledReason);
  const result = applyLibraryAction(town, action.id);
  assert.equal(result.ok, true, result.reply);
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateLibraryState(town), []);
  return action;
}
function prepared() {
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
  return town;
}
function lookedUp() {
  const town = prepared();
  act(town, "test");
  for (let minute = 0; minute < 120 && state(town).lookup.status !== "done"; minute++)
    advanceTown(town, 1);
  assert.equal(state(town).lookup.status, "done");
  return town;
}
function waitUntilReady(town) {
  for (let minute = 0; minute < 180 && evening(town).status !== "ready"; minute++)
    advanceTown(town, 1);
  assert.equal(
    evening(town).status,
    "ready",
    JSON.stringify(libraryView(town).story.gathering.guests),
  );
}

for (const [venue, seat] of [
  ["park", { x: 21, y: 35 }],
  ["library", { x: 42, y: 21 }],
])
  test(`a player standing on Northern's ${venue} seat can join after he physically approaches`, () => {
    const town = lookedUp();
    act(town, "evening-plan", venue);
    if (evening(town).status === "waiting") {
      const wait = libraryActions(town).find(
        (item) => JSON.parse(item.id)[0] === "evening-wait-note",
      );
      assert.ok(wait);
      assert.equal(applyLibraryAction(town, wait.id).ok, true);
    }
    person(town, "player").tile = { ...seat };
    const before = town.agents.map(({ money }) => money);
    waitUntilReady(town);
    assert.deepEqual(
      person(town, "player").tile,
      seat,
      "the player cannot be displaced or teleported",
    );
    assert.notDeepEqual(person(town, "northern").tile, seat);
    assert.equal(
      Math.abs(person(town, "northern").tile.x - seat.x) +
        Math.abs(person(town, "northern").tile.y - seat.y),
      1,
      "only a physically adjacent guest can use the occupied-seat fallback",
    );
    assert.ok(parseTownFile(exportTown(town)), "real nearby attendance must survive reload");
    person(town, "player").tile = { ...libraryView(town).story.gathering.tile };
    assert.ok(
      parseTownFile(exportTown(town)),
      "stepping off the occupied seat cannot invalidate a gathered reading",
    );
    act(town, "evening-join", "listen");
    assert.equal(evening(town).attendedByPlayer, true);
    assert.deepEqual(
      town.agents.map(({ money }) => money),
      before,
    );
    assert.ok(parseTownFile(exportTown(town)));
  });

test("each public confidence notice is offered once rather than a successful no-op after switching modes", () => {
  const town = prepared();
  const first = act(town, "publish", "verified");
  act(town, "publish", "marked");
  assert.equal(choice(town, "publish", "verified"), undefined);
  assert.equal(choice(town, "publish", "marked"), undefined);
  assert.deepEqual(state(town).notice, { revision: 1, mode: "marked" });
  const before = exportTown(town);
  assert.equal(applyLibraryAction(town, first.id).ok, false);
  assert.equal(exportTown(town), before);
  assert.equal(
    state(town).events.filter((event) => event.id.startsWith("library:notice:1:")).length,
    2,
  );
});

test("an unfinished reading rejects a corrupt paid-tray receipt instead of offering the paid item again", () => {
  const town = lookedUp();
  act(town, "evening-plan", "park");
  person(town, "player").tile = { ...libraryView(town).story.gathering.tile };
  act(town, "evening-refreshments", "bread");
  assert.ok(parseTownFile(exportTown(town)), "the honest paid gathering must load");
  const forged = JSON.parse(exportTown(town));
  const receipt = forged.town.economy.commandReceipts.find(
    (item) => item.kind === "commerce.buy-reading-refreshments",
  );
  receipt.value.amount = 1;
  assert.deepEqual(
    auditEconomy(forged.town),
    [],
    "the corruption need not change any real account balance",
  );
  assert.equal(parseTownFile(JSON.stringify(forged)) === null, true);
});

test("reading answers use actual reading knowledge without borrowing an old payment or a statement", () => {
  const town = lookedUp();
  person(town, "kevin").tile = { ...ANCHORS.cafe };
  person(town, "sub").tile = { ...ANCHORS.park };
  act(town, "evening-plan", "park");
  const invitation = state(town).events.find((event) => event.id.endsWith(":booked"));
  assert.ok(invitation);
  assert.ok(
    residentLibraryReply(town, "kevin"),
    "Kevin retains his actual earlier project knowledge",
  );
  assert.equal(residentReadingReply(town, "kevin"), null);
  assert.equal(residentReadingReply(town, "northern"), invitation.text);
  assert.equal(residentReadingReply(town, "sub"), invitation.text);
  person(town, "kevin").memories.push({
    id: "reading-statement",
    type: "chat",
    source: "statement",
    text: invitation.text,
    day: town.day,
    minute: town.minute,
    importance: 5,
    keywords: [],
  });
  assert.equal(residentReadingReply(town, "kevin"), null);
  person(town, "kevin").memories.push({
    ...person(town, "kevin").memories.at(-1),
    id: "reading-observation",
    type: "observe",
    source: "event",
  });
  const before = exportTown(town);
  assert.equal(residentReadingReply(town, "kevin"), invitation.text);
  assert.equal(exportTown(town), before, "knowledge retrieval cannot alter the saved event");
});
