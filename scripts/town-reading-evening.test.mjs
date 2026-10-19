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
const community = await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { exportTown, parseTownFile, readTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { ANCHORS, zoneAt, walkable } = await server.ssrLoadModule("/src/game/world.ts");

const person = (town, id) => town.agents.find((agent) => agent.id === id);
const state = (town) => town.economy?.projects?.library;
const evening = (town) => state(town)?.evening;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const total = (town) =>
  town.agents.reduce((sum, agent) => sum + agent.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const action = (town, kind, argument) =>
  community.libraryActions(town).find((item) => {
    const [actualKind, actualArgument] = JSON.parse(item.id);
    return actualKind === kind && (argument === undefined || actualArgument === argument);
  });
function healthy(town) {
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(community.validateLibraryState(town), []);
}
function act(town, kind, argument) {
  const quoted = action(town, kind, argument);
  assert.ok(quoted, `Missing ${kind}:${argument ?? ""}`);
  assert.equal(quoted.disabledReason, undefined, quoted.disabledReason);
  const result = community.applyLibraryAction(town, quoted.id);
  assert.equal(result.ok, true, result.reply);
  healthy(town);
  return { quoted, result };
}
function reject(town, quoted) {
  const before = exportTown(town);
  assert.equal(community.applyLibraryAction(town, quoted.id).ok, false);
  assert.equal(exportTown(town), before, "rejected actions must leave the complete town intact");
}
function reload(town) {
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored, "a saved reading must load without discarding its books or event");
  healthy(restored);
  assert.equal(total(restored), total(town));
  return restored;
}
function project({ room = "Cedar", work = false, lookupMinute } = {}) {
  const town = createTown("Mira");
  if (work)
    person(town, "northern").projects.push({
      id: "existing-northern-work",
      owner: "northern",
      kind: "shift",
      text: "An existing agreed cafe shift",
      place: "cafe",
      status: "open",
      day: 1,
    });
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
  if (room !== "Cedar") act(town, "map", `room-access:${room}`);
  act(town, "submit", "player");
  if (lookupMinute !== undefined) town.minute = lookupMinute;
  act(town, "test", "");
  for (let minutes = 0; minutes < 120 && state(town).lookup.status === "routing"; minutes++)
    advanceTown(town, 1);
  assert.equal(state(town).lookup.status, "done");
  assert.equal(state(town).lookup.result, room === "Cedar" ? "success" : "failure");
  healthy(town);
  return town;
}
function playerAtVenue(town, venue) {
  const gathering = community.libraryView(town).story.gathering;
  assert.equal(gathering.place, venue);
  person(town, "player").tile = { ...gathering.tile };
}
function ready(town, limit = 180) {
  for (let minute = 0; minute < limit && evening(town).status !== "ready"; minute++) {
    assert.notEqual(evening(town).status, "done", "a pending reading cannot finish before arrival");
    advanceTown(town, 1);
  }
  assert.equal(evening(town).status, "ready");
  healthy(town);
}

test("directly inspected locations carry into the index without treating a loose card as proof", () => {
  const town = createTown("Mira");
  act(town, "accept", "reference");
  person(town, "player").tile = { ...ANCHORS.library };
  act(town, "inspect", "card:room");
  assert.equal(state(town).draft["room-access"], null);
  act(town, "inspect", "box:Cedar");
  assert.equal(state(town).draft["room-access"], "Cedar");
  assert.equal(state(town).draft["hobbs-equipment"], null);
  act(town, "inspect", "box:Birch");
  assert.equal(state(town).draft["hobbs-equipment"], "Birch");
  assert.equal(state(town).draft["dorm-repair"], null);
  reload(town);
});

test("a park reading is a real voluntary journey, with seated named residents and one witnessed scene", () => {
  let town = project();
  const before = town.agents.map(({ id, tile }) => ({ id, tile: { ...tile } }));
  const balance = total(town);
  const paid = person(town, "player").money;
  const { quoted } = act(town, "evening-plan", "park");
  assert.equal(evening(town).choice, "park");
  assert.equal(evening(town).status, "routing");
  assert.deepEqual(
    town.agents.map(({ id, tile }) => ({ id, tile })),
    before,
    "booking cannot teleport",
  );
  assert.equal(evening(town).completedAt, null);
  reject(town, quoted);
  const goals = structuredClone(community.libraryMovementGoals(town));
  assert.deepEqual(Object.keys(goals).sort(), ["northern", "sub"]);
  for (const goal of Object.values(goals)) {
    assert.equal(walkable(goal.x, goal.y), true);
    assert.equal(zoneAt(goal.x, goal.y), "park");
  }
  community.advanceLibraryProject(town);
  assert.notEqual(evening(town).status, "ready", "a clock check cannot substitute for walking");
  advanceTown(town, 1);
  for (const id of Object.keys(goals))
    assert.ok(distance(before.find((agent) => agent.id === id).tile, person(town, id).tile) <= 3);
  town = reload(town);
  ready(town);
  for (const [id, goal] of Object.entries(goals)) assert.deepEqual(person(town, id).tile, goal);
  const farJoin = action(town, "evening-join");
  assert.ok(farJoin?.disabledReason, "being elsewhere must not create attendance");
  reject(town, farJoin);
  playerAtVenue(town, "park");
  const { quoted: join } = act(town, "evening-join");
  assert.equal(evening(town).status, "done");
  assert.equal(evening(town).attendedByPlayer, true);
  assert.ok(evening(town).scene.length >= 2);
  assert.ok(evening(town).completedAt);
  assert.equal(person(town, "player").money, paid, "joining does not require refreshments");
  assert.equal(total(town), balance);
  const scene = structuredClone(evening(town));
  reject(town, join);
  town = reload(town);
  advanceTown(town, 20);
  assert.deepEqual(evening(town), scene, "a completed reading cannot rerun or rewrite its scene");
});

test("waiting for the dated note leads to a distinct indoor reading and keeps its proof", () => {
  let town = project();
  assert.equal(state(town).delivery, false);
  act(town, "evening-plan", "library");
  assert.equal(evening(town).status, "waiting");
  assert.ok(evening(town).noteDueAt);
  assert.equal(community.libraryMovementGoals(town), undefined);
  const noteWait = action(town, "evening-wait-note");
  assert.ok(noteWait);
  assert.match(noteWait.terms, /game minutes|commitment/i);
  const balances = total(town);
  act(town, "evening-wait-note");
  assert.equal(state(town).delivery, true);
  assert.ok(state(town).events.some((item) => item.id === "library:delivery"));
  assert.notEqual(evening(town).status, "done");
  reject(town, noteWait);
  town = reload(town);
  playerAtVenue(town, "library");
  ready(town);
  const goals = community.libraryMovementGoals(town);
  assert.deepEqual(Object.keys(goals).sort(), ["arwyn", "northern", "sub"]);
  for (const [id, goal] of Object.entries(goals)) assert.deepEqual(person(town, id).tile, goal);
  act(town, "evening-join");
  assert.equal(evening(town).choice, "library");
  assert.equal(evening(town).attendedByPlayer, true);
  assert.match(JSON.stringify(evening(town).scene), /Arwyn|Baba|dated|delivery/i);
  assert.equal(total(town), balances);
  reload(town);
});

test("an unverified room reference permits a provisional park meeting but not an indoor claim", () => {
  const town = project({ room: "Birch" });
  const indoors = action(town, "evening-plan", "library");
  assert.ok(indoors?.disabledReason);
  reject(town, indoors);
  act(town, "evening-plan", "park");
  playerAtVenue(town, "park");
  ready(town);
  act(town, "evening-join");
  assert.match(JSON.stringify(evening(town)), /provisional|outside|park/i);
  assert.equal(state(town).lookup.result, "failure");
  assert.equal(state(town).revisions[0].mappings["room-access"], "Birch");
  reload(town);
});

test("missing the reading records an offscreen outcome without invented player attendance or a penalty", () => {
  let town = project();
  act(town, "evening-plan", "park");
  person(town, "player").tile = { ...ANCHORS.library };
  const debt = structuredClone(town.favors);
  const money = person(town, "player").money;
  ready(town);
  advanceTown(town, 61);
  assert.equal(evening(town).status, "done");
  assert.equal(evening(town).attendedByPlayer, false);
  assert.ok(evening(town).outcome);
  assert.equal(person(town, "player").money, money);
  assert.deepEqual(town.favors, debt);
  town = reload(town);
  assert.equal(evening(town).attendedByPlayer, false);
  assert.equal(action(town, "evening-join"), undefined);
});

test("a player already beside the guests is not marked absent while choosing how to participate", () => {
  const town = project();
  act(town, "evening-plan", "park");
  playerAtVenue(town, "park");
  ready(town);
  advanceTown(town, 61);
  assert.equal(evening(town).status, "ready");
  assert.equal(evening(town).completedAt, null);
  assert.equal(evening(town).attendedByPlayer, false);
  act(town, "evening-join", "read");
  assert.equal(evening(town).participation, "read");
  assert.equal(evening(town).attendedByPlayer, true);
  assert.match(evening(town).scene.join(" "), /Mira:.*I only moved here recently/);
  reload(town);
});

test("reading commitments preserve paid work and changes to unrelated timetable beats", () => {
  const town = project({ work: true });
  const northern = person(town, "northern");
  Object.assign(northern.plan.beats[9], { place: "cafe", spot: "out", status: "my paid work" });
  town.minute = 9 * 60;
  act(town, "evening-plan", "park");
  Object.assign(person(town, "northern").plan.beats[17], {
    place: "plaza",
    spot: "out",
    status: "a later plan chosen after the invitation",
  });
  community.prepareLibraryAppointment(town);
  assert.equal(person(town, "northern").plan.beats[9].status, "my paid work");
  assert.equal(community.libraryMovementGoals(town)?.northern, undefined);
  community.advanceLibraryProject(town);
  assert.notEqual(evening(town).status, "ready");
  assert.notEqual(evening(town).status, "done");
  town.minute = 10 * 60;
  playerAtVenue(town, "park");
  ready(town);
  act(town, "evening-join");
  assert.equal(person(town, "northern").plan.beats[9].status, "my paid work");
  assert.equal(
    person(town, "northern").plan.beats[17].status,
    "a later plan chosen after the invitation",
  );
  reload(town);
});

test("a reading booked before midnight preserves replacement next-day plans after its scene", () => {
  const town = project({ lookupMinute: 23 * 60 + 10 });
  const bookedDay = town.day;
  act(town, "evening-plan", "library");
  assert.equal(evening(town).status, "waiting");
  act(town, "evening-wait-note");
  assert.ok(town.day > bookedDay, "the ordinary note wait should cross midnight");
  const replacements = {};
  for (const id of ["northern", "arwyn", "sub"]) {
    const next = structuredClone(person(town, id).plan);
    next.day = town.day;
    next.summary = `A new day chosen by ${id}`;
    next.beats = next.beats.map((beat) => ({ ...beat, status: `new-day ${id} hour ${beat.hour}` }));
    person(town, id).plan = next;
    replacements[id] = structuredClone(next);
  }
  playerAtVenue(town, "library");
  ready(town);
  act(town, "evening-join", "listen");
  for (const [id, plan] of Object.entries(replacements))
    assert.deepEqual(
      person(town, id).plan,
      plan,
      "a finished reading cannot restore yesterday's timetable",
    );
  reload(town);
});

test("cash refreshments are optional, paid to their actual businesses and cannot be replayed after reload", () => {
  let town = project();
  act(town, "evening-plan", "park");
  const tooFar = action(town, "evening-refreshments", "bread");
  assert.ok(tooFar?.disabledReason);
  reject(town, tooFar);
  playerAtVenue(town, "park");
  const before = {
    player: person(town, "player").money,
    tills: { ...town.tills },
    total: total(town),
  };
  const debt = structuredClone(town.favors);
  const { quoted: bread } = act(town, "evening-refreshments", "bread");
  assert.equal(person(town, "player").money, before.player - 2);
  assert.equal(town.tills.grocery, before.tills.grocery + 2);
  assert.equal(town.tills.cafe, before.tills.cafe);
  reject(town, bread);
  town = reload(town);
  reject(town, bread);
  const { quoted: tea } = act(town, "evening-refreshments", "tea");
  assert.equal(person(town, "player").money, before.player - 4);
  assert.equal(town.tills.cafe, before.tills.cafe + 2);
  assert.equal(total(town), before.total);
  assert.deepEqual(town.favors, debt, "cash refreshments cannot settle or create a personal tab");
  reject(town, tea);
  town = reload(town);
  assert.ok(
    !action(town, "evening-refreshments", "bread") ||
      action(town, "evening-refreshments", "bread").disabledReason,
  );
  assert.ok(
    !action(town, "evening-refreshments", "tea") ||
      action(town, "evening-refreshments", "tea").disabledReason,
  );
});

test("declining the project creates no reading attendance or personal financial obligation", () => {
  const town = createTown("Mira");
  const balance = total(town);
  const money = person(town, "player").money;
  const debt = structuredClone(town.favors);
  act(town, "decline", "");
  advanceTown(town, 90);
  assert.equal(evening(town), undefined);
  assert.equal(total(town), balance);
  assert.equal(person(town, "player").money, money);
  assert.deepEqual(town.favors, debt);
  assert.equal(action(town, "evening-plan", "park"), undefined);
  reload(town);
});

test("older valid projects without an evening extension still import and can explicitly choose a reading", () => {
  const old = project();
  delete state(old).evening;
  const raw = exportTown(old);
  let town = parseTownFile(raw);
  assert.ok(town);
  assert.equal(evening(town), undefined, "import cannot invent attendance for an old save");
  healthy(town);
  act(town, "evening-plan", "park");
  assert.equal(evening(town).status, "routing");
  assert.equal(evening(town).attendedByPlayer, false);
  town = reload(town);
  assert.equal(evening(town).choice, "park");
});

test("malformed reading extensions are recoverable raw data rather than silently discarded", () => {
  const town = project();
  for (const invalid of [null, [], "broken", { version: 99 }, { version: 1, eventId: "forged" }]) {
    const file = JSON.parse(exportTown(town));
    file.town.economy.projects.library.evening = invalid;
    const raw = JSON.stringify(file);
    const report = readTownFile(raw);
    assert.equal(report.status, "unreadable");
    assert.equal(report.raw, raw);
    assert.equal(parseTownFile(raw), null);
  }
});
