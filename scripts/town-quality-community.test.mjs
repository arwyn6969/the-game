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
} = await server.ssrLoadModule("/src/game/community.ts");
const { advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { ANCHORS } = await server.ssrLoadModule("/src/game/world.ts");
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const state = (town) => town.economy?.projects?.library;
const cash = (town) =>
  town.agents.reduce((sum, agent) => sum + agent.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
const choice = (town, kind, arg) =>
  libraryActions(town).find((action) => {
    const [actionKind, actionArg] = JSON.parse(action.id);
    return actionKind === kind && (arg === undefined || arg === actionArg);
  });
const act = (town, kind, arg) => {
  const action = choice(town, kind, arg);
  assert.ok(action, `Missing ${kind}:${arg ?? ""}`);
  assert.equal(action.disabledReason, undefined, action.disabledReason);
  const result = applyLibraryAction(town, action.id);
  assert.equal(result.ok, true, result.reply);
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateLibraryState(town), []);
  return { action, result };
};
const start = (role = "reference", playerCoins = 4) => {
  const town = createTown("Mira");
  person(town, "player").money = playerCoins;
  act(town, "accept", role);
  return town;
};
const library = (town) => {
  person(town, "player").tile = { ...ANCHORS.library };
};
const inspect = (town) => {
  library(town);
  for (const key of [
    "card:equipment",
    "card:dorm",
    "card:room",
    "card:kevin",
    "box:Birch",
    "box:Alder",
    "box:Cedar",
  ])
    act(town, "inspect", key);
};
const prepared = (box = "Cedar", playerCoins = 4) => {
  const town = start("reference", playerCoins);
  inspect(town);
  act(town, "report", "reference");
  act(town, "request", "source");
  for (const [record, mapping] of [
    ["hobbs-equipment", "Birch"],
    ["dorm-repair", "Alder"],
    ["room-access", box],
  ])
    act(town, "map", `${record}:${mapping}`);
  act(town, "submit", "player");
  return town;
};
const finishLookup = (town) => {
  const before = { ...person(town, "northern").tile };
  act(town, "test", "");
  assert.deepEqual(person(town, "northern").tile, before, "booking cannot teleport a worker");
  for (let minute = 0; minute < 80 && state(town).lookup.status === "routing"; minute++)
    advanceTown(town, 1);
  assert.equal(state(town).lookup.status, "done", state(town).lookup.reason);
  assert.deepEqual(auditEconomy(town), []);
  assert.deepEqual(validateLibraryState(town), []);
  return town;
};
const reload = (town) => {
  const restored = parseTownFile(exportTown(town));
  assert.ok(restored, "project export must import without discarding its books");
  assert.deepEqual(auditEconomy(restored), []);
  assert.deepEqual(validateLibraryState(restored), []);
  assert.equal(cash(restored), cash(town));
  return restored;
};

test("declining creates no personal obligation, spending, trust penalty or private disclosure", () => {
  const town = createTown("Mira");
  const money = town.agents.map((agent) => agent.money);
  const relationships = town.agents.map((agent) => structuredClone(agent.relationships));
  const tills = { ...town.tills };
  const pause = town.paused,
    minute = town.minute;
  const offers = libraryActions(town);
  assert.equal(town.economy, undefined, "reading an offer cannot activate funding");
  assert.equal(town.minute, minute);
  assert.equal(town.paused, pause);
  assert.doesNotMatch(JSON.stringify(offers), /man under the apron|private|seed/);
  act(town, "decline", "");
  assert.deepEqual(
    town.agents.map((agent) => agent.money),
    money,
  );
  assert.deepEqual(
    town.agents.map((agent) => agent.relationships),
    relationships,
  );
  assert.deepEqual(town.tills, tills);
  assert.equal(town.favors.length, 0);
  assert.equal(
    town.economy.work.agreements.filter((agreement) => agreement.worker === "player").length,
    0,
  );
  assert.equal(reload(town).economy.projects.library.phase, "declined");
});

test("evidence, paid contribution and independent usefulness are distinct and replay-safe", () => {
  const town = start();
  assert.equal(cash(town), 90);
  assert.equal(libraryView(town).custody, 8);
  assert.equal(libraryView(town).reserved, 6);
  assert.ok(choice(town, "report", "reference").disabledReason);
  const far = choice(town, "inspect", "box:Cedar");
  assert.ok(far.disabledReason);
  const snapshot = exportTown(town);
  assert.equal(applyLibraryAction(town, far.id).ok, false);
  assert.equal(exportTown(town), snapshot);
  inspect(town);
  assert.equal(person(town, "player").money, 4);
  const { action } = act(town, "report", "reference");
  assert.equal(person(town, "player").money, 6);
  assert.equal(libraryView(town).spent, 2);
  assert.equal(libraryView(town).custody, 6);
  assert.match(libraryView(town).outcome, /No independent lookup completed/);
  const after = exportTown(town);
  assert.equal(applyLibraryAction(town, action.id).ok, false);
  assert.equal(exportTown(town), after, "a stale completion cannot pay twice");
  assert.equal(reload(town).economy.projects.library.reports[0].worker, "player");
});

test("a funded correct index changes lookup access, pays actual workers and survives reload", () => {
  let town = prepared("Cedar", 0);
  assert.equal(person(town, "player").money, 2, "no personal wealth is needed to do paid work");
  assert.equal(
    libraryView(town).entries.find((entry) => entry.id === "room-access").status,
    "verified",
  );
  assert.match(
    libraryView(town).entries.find((entry) => entry.id === "room-access").date,
    /unknown/,
  );
  town = reload(town);
  const before = person(town, "northern").money;
  finishLookup(town);
  assert.match(libraryView(town).outcome, /found room-access in Cedar using revision 1/);
  assert.equal(person(town, "northern").money, before + 2);
  assert.equal(libraryView(town).spent, 6);
  assert.equal(libraryView(town).custody, 2);
  assert.equal(cash(town), 86);
  assert.ok(
    state(town).reports.every((report) => report.worker !== state(town).assignments.lookup.worker),
  );
  act(town, "find", "room-access");
  assert.match(
    libraryView(town).finds.find((find) => find.id === "room-access").result,
    /Found Community room access note in Cedar/,
  );
  assert.equal(reload(town).economy.projects.library.lookup.result, "success");
});

test("a wrong frozen reference stays provisional while honest preparation and a failed search are paid", () => {
  const town = prepared("Birch");
  assert.equal(
    libraryView(town).entries.find((entry) => entry.id === "room-access").status,
    "provisional",
  );
  const before = person(town, "northern").money;
  finishLookup(town);
  assert.equal(state(town).lookup.revision, 1);
  assert.equal(state(town).revisions[0].mappings["room-access"], "Birch");
  assert.match(libraryView(town).outcome, /could not find room-access/);
  assert.equal(person(town, "northern").money, before + 2);
  assert.equal(person(town, "player").money, 6);
  assert.equal(libraryView(town).spent, 6);
  assert.equal(cash(town), 90);
  act(town, "find", "room-access");
  assert.match(
    libraryView(town).finds.find((find) => find.id === "room-access").result,
    /did not locate/,
  );
});

test("an unresolved reference stays unresolved and the actual independent search still earns its fee", () => {
  const town = prepared("unresolved");
  assert.equal(
    libraryView(town).entries.find((entry) => entry.id === "room-access").status,
    "unresolved",
  );
  const before = person(town, "northern").money;
  finishLookup(town);
  assert.equal(state(town).lookup.result, "failure");
  assert.equal(state(town).revisions[0].mappings["room-access"], null);
  assert.equal(person(town, "northern").money, before + 2);
  assert.equal(libraryView(town).spent, 6);
});

test("delegated submission credits Arwyn without taking the player's earned contribution", () => {
  const town = start();
  inspect(town);
  act(town, "report", "reference");
  act(town, "request", "source");
  act(town, "submit", "arwyn");
  assert.equal(state(town).revisions[0].author, "arwyn");
  assert.equal(state(town).reports.find((report) => report.role === "reference").worker, "player");
  assert.equal(person(town, "player").money, 6);
  assert.equal(state(town).revisions[0].mappings["room-access"], "Cedar");
  finishLookup(town);
});

test("reload preserves a lookup en route and a blocked box does not earn a search fee", () => {
  let town = prepared();
  const baba = person(town, "baba");
  const originalBaba = structuredClone({ tile: baba.tile, home: baba.home, plan: baba.plan });
  baba.tile = { x: 50, y: 16 };
  baba.home = { ...baba.tile };
  baba.plan.beats.forEach((beat) =>
    Object.assign(beat, { place: "library", spot: "home", status: "staying by the box" }),
  );
  const money = person(town, "northern").money;
  act(town, "test", "");
  advanceTown(town, 1);
  assert.equal(state(town).lookup.status, "routing");
  const position = { ...person(town, "northern").tile };
  town = reload(town);
  assert.deepEqual(person(town, "northern").tile, position);
  advanceTown(town, 30);
  assert.equal(state(town).lookup.status, "routing");
  assert.equal(person(town, "northern").money, money);
  assert.equal(libraryView(town).spent, 4);
  Object.assign(person(town, "baba"), originalBaba);
  for (let minute = 0; minute < 80 && state(town).lookup.status === "routing"; minute++)
    advanceTown(town, 1);
  assert.equal(state(town).lookup.status, "done", state(town).lookup.reason);
  assert.equal(person(town, "northern").money, money + 2);
  reload(town);
});

test("closure cannot refund an earned fee while its worker's purse is full", () => {
  const town = start("reference", 999);
  inspect(town);
  act(town, "report", "reference");
  assert.equal(person(town, "player").money, 999);
  assert.equal(
    town.economy.work.payables.find((payable) => payable.worker === "player").status,
    "earned",
  );
  const before = exportTown(town);
  const close = choice(town, "close", "");
  const result = applyLibraryAction(town, close.id);
  assert.equal(result.ok, false);
  assert.match(result.reply, /earned liability|earned.*paid|payable/i);
  assert.equal(exportTown(town), before, "failed closure retains every earned reservation and fee");
  reload(town);
});

test("closing before work and after one fee returns respectively four and three to each donor", () => {
  for (const [paid, refund] of [
    [false, 4],
    [true, 3],
  ]) {
    const town = start();
    if (paid) {
      inspect(town);
      act(town, "report", "reference");
    }
    const tills = { ...town.tills };
    const purse = person(town, "player").money;
    act(town, "close", "");
    assert.equal(town.tills.cafe, tills.cafe + refund);
    assert.equal(town.tills.grocery, tills.grocery + refund);
    assert.equal(person(town, "player").money, purse);
    assert.equal(libraryView(town).custody, 0);
    assert.equal(libraryView(town).reserved, 0);
    assert.equal(libraryView(town).status, "closed");
    assert.equal(cash(town), 90);
    reload(town);
  }
});

test("three completed fees refund one each and preserve the common index after closure", () => {
  const town = finishLookup(prepared());
  const tills = { ...town.tills };
  act(town, "close", "");
  assert.equal(town.tills.cafe, tills.cafe + 1);
  assert.equal(town.tills.grocery, tills.grocery + 1);
  assert.equal(libraryView(town).custody, 0);
  act(town, "find", "room-access");
  assert.match(libraryView(town).finds.find((find) => find.id === "room-access").result, /Found/);
  reload(town);
});

test("next-day use, separately paid correction and zero-refund closure preserve original test attribution", () => {
  let town = finishLookup(prepared("Birch"));
  const endOfDay = 1440 - town.minute;
  advanceTown(town, endOfDay);
  assert.match(residentLibraryReply(town, "arwyn"), /read Northern's public search report.*failed/);
  town = reload(town);
  advanceTown(town, 1440);
  library(town);
  const before = person(town, "player").money;
  act(town, "correct", "");
  assert.equal(person(town, "player").money, before + 2);
  assert.equal(state(town).lookup.result, "failure");
  assert.equal(state(town).lookup.revision, 1);
  assert.equal(state(town).revisions[0].mappings["room-access"], "Birch");
  assert.equal(state(town).revisions[1].mappings["room-access"], "Cedar");
  assert.equal(libraryView(town).spent, 8);
  const tills = { ...town.tills };
  act(town, "close", "");
  assert.deepEqual(town.tills, tills);
  assert.equal(cash(town), 90);
  reload(town);
});

test("a forged self-verifying assignment or false success is rejected on import", () => {
  const town = finishLookup(prepared("Birch"));
  const forgedWorker = JSON.parse(exportTown(town));
  forgedWorker.town.economy.projects.library.assignments.reference.worker = "northern";
  assert.equal(parseTownFile(JSON.stringify(forgedWorker)), null);
  const forgedResult = JSON.parse(exportTown(town));
  forgedResult.town.economy.projects.library.lookup.result = "success";
  assert.equal(parseTownFile(JSON.stringify(forgedResult)), null);
});
