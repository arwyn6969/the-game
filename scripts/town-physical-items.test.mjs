import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
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
const physical = await server.ssrLoadModule("/src/game/physical-items.ts");
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const { forkTown } = await server.ssrLoadModule("/src/game/identity.ts");
const { AGENT_IDS } = await server.ssrLoadModule("/src/game/types.ts");
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const { activateFundedTown } = await server.ssrLoadModule("/src/game/payroll-runtime.ts");
const { auditEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { ANCHORS, cell, zoneAt } = await server.ssrLoadModule("/src/game/world.ts");
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
after(async () => {
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete globalThis.localStorage;
  await server.close();
});
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const item = (town) => physical.physicalItem(town, physical.MANUSCRIPT_ID);
const fixture = () => {
  const town = createTown("Mira");
  assert.equal(physical.initializePhysicalItems(town).ok, true);
  return town;
};
const act = (town, actor, kind, extra = {}) =>
  physical.applyPhysicalCommand(
    town,
    actor,
    ["speak", "wait"].includes(kind)
      ? { kind, ...extra }
      : { kind, itemId: item(town).id, itemRevision: item(town).revision, ...extra },
  );
function ok(result) {
  assert.equal(result.ok, true, result.message);
  return result;
}
function atBook(town, actor = "player") {
  person(town, actor).tile = { ...item(town).location.tile };
}
function storage(raw) {
  const data = new Map(raw ? [[save.TOWN_STORAGE_KEY, raw]] : []);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
      key: (index) => [...data.keys()][index] ?? null,
      get length() {
        return data.size;
      },
    },
  });
  return data;
}
function marked(town, actor = "data", max = 8) {
  ok(physical.startPhysicalSession(town, actor, max));
  const job = physical.nextPhysicalJob(town);
  assert.ok(job);
  assert.equal(physical.markPhysicalRequest(town, job), true);
  return job;
}

test("old towns opt in explicitly; initial manuscript is blank, unique and on clear library floor", async () => {
  const town = createTown("Old town");
  const original = JSON.stringify(town);
  assert.equal(town.physicalItems, undefined);
  assert.equal(save.parseTownFile(save.exportTown(town)).physicalItems, undefined);
  assert.equal(physical.nextPhysicalJob(town), null);
  assert.equal(physical.startPhysicalSession(town, "data").ok, false);
  ok(physical.initializePhysicalItems(town));
  const location = item(town).location;
  assert.equal(item(town).text, "");
  assert.equal(item(town).author, null);
  assert.equal(location.kind, "ground");
  assert.equal(zoneAt(location.tile.x, location.tile.y), "library");
  assert.equal(cell(location.tile.x, location.tile.y).block, false);
  assert.notEqual(cell(location.tile.x, location.tile.y).ground, "door");
  const state = JSON.stringify(town.physicalItems);
  ok(physical.initializePhysicalItems(town));
  assert.equal(JSON.stringify(town.physicalItems), state);
  const without = structuredClone(town);
  delete without.physicalItems;
  assert.equal(JSON.stringify(without), original, "opt in creates no speech, money or history");
  const legacy = await readFile(
    new URL("./fixtures/legacy-six-resident-town.json", import.meta.url),
    "utf8",
  );
  assert.equal(save.parseTownFile(legacy).physicalItems, undefined);
});

test("all eight actors share revision-checked pickup/write/read/drop without altering accounts", () => {
  for (const actor of AGENT_IDS) {
    const town = fixture();
    atBook(town, actor);
    const accounts = JSON.stringify(town.economy);
    ok(act(town, actor, "pick-up"));
    ok(
      act(town, actor, "write", {
        title: `${actor}'s page`,
        text: `An original line from ${actor}.`,
      }),
    );
    const read = ok(act(town, actor, "read"));
    assert.equal(read.content.text, `An original line from ${actor}.`);
    assert.equal(read.content.author, actor);
    ok(act(town, actor, "put-down"));
    assert.equal(item(town).location.kind, "ground");
    assert.equal(JSON.stringify(town.economy), accounts);
    assert.deepEqual(physical.validatePhysicalItems(town), []);
  }
});

test("distant, competing, stale and malformed item actions cannot duplicate or overwrite custody", () => {
  const town = fixture();
  const before = JSON.stringify(town);
  assert.equal(act(town, "player", "pick-up").ok, false);
  assert.equal(JSON.stringify(town), before);
  atBook(town);
  ok(act(town, "player", "pick-up"));
  person(town, "sub").tile = { ...ANCHORS.library };
  const held = JSON.stringify(town);
  assert.equal(act(town, "sub", "pick-up").ok, false);
  assert.equal(
    act(town, "player", "write", { itemRevision: 0, title: "Stale", text: "No" }).ok,
    false,
  );
  assert.equal(
    act(town, "player", "write", { title: "Too long", text: "x".repeat(1201) }).ok,
    false,
  );
  assert.equal(
    physical.applyPhysicalCommand(town, "player", { kind: "wait", money: 90 }).ok,
    false,
  );
  assert.equal(JSON.stringify(town), held);
  assert.equal(town.physicalItems.items.length, 1);
});

test("reading reveals exact content to its reader, not nearby observers or an unrequested model", () => {
  const town = fixture();
  atBook(town, "data");
  atBook(town, "sub");
  ok(act(town, "data", "pick-up"));
  const secret = "A private test phrase that only the actual reader receives.";
  ok(act(town, "data", "write", { title: "An original draft", text: secret }));
  ok(physical.startPhysicalSession(town, "data"));
  assert.equal(JSON.stringify(physical.physicalObservation(town, "data")).includes(secret), false);
  const subBefore = JSON.stringify(person(town, "sub").memories);
  ok(act(town, "data", "read"));
  assert.equal(JSON.stringify(physical.physicalObservation(town, "data")).includes(secret), true);
  assert.equal(JSON.stringify(physical.physicalObservation(town, "sub")).includes(secret), false);
  assert.equal(JSON.stringify(person(town, "sub").memories), subBefore);
});

test("speak records model-chosen words for actual nearby listeners and parks inference; wait is quiet", () => {
  const town = fixture();
  atBook(town, "data");
  atBook(town, "sub");
  const text = "I can take this blank page to the park.";
  const job = marked(town);
  physical.recordPhysicalUsage(town, job, {
    elapsedMs: 12.4,
    attempts: 1,
    totalTokens: 45,
    success: true,
  });
  ok(act(town, "data", "speak", { text }));
  assert.equal(person(town, "data").bubble.text, text);
  assert.ok(person(town, "sub").memories.some((memory) => memory.text.includes(text)));
  assert.equal(physical.nextPhysicalJob(town), null);
  assert.equal(town.physicalItems.session.usage.elapsedMs, 12);
  physical.stopPhysicalSession(town);
  marked(town);
  const bubbles = JSON.stringify(town.agents.map((agent) => agent.bubble));
  ok(act(town, "data", "wait"));
  assert.equal(JSON.stringify(town.agents.map((agent) => agent.bubble)), bubbles);
  assert.equal(physical.nextPhysicalJob(town), null);
});

test("bring uses one normal movement pass, rebuilds stripped paths after reload and retains the actual item", () => {
  let town = fixture();
  person(town, "data").tile = { x: 12, y: 21 };
  marked(town);
  ok(act(town, "data", "bring", { destination: "park" }));
  assert.equal(item(town).location.kind, "ground", "planning does not teleport pickup");
  const first = { ...person(town, "data").tile };
  stepMinute(town, false);
  assert.ok(
    Math.abs(first.x - person(town, "data").tile.x) +
      Math.abs(first.y - person(town, "data").tile.y) <=
      3,
  );
  town = save.parseTownFile(save.exportTown(town));
  assert.ok(town);
  assert.deepEqual(person(town, "data").path, []);
  for (let minute = 0; minute < 170 && town.physicalItems.session.intent; minute++)
    stepMinute(town, false);
  assert.equal(
    town.physicalItems.session.intent,
    null,
    town.physicalItems.session.lastResult?.message,
  );
  assert.equal(
    town.physicalItems.session.lastResult.ok,
    true,
    town.physicalItems.session.lastResult.message,
  );
  assert.deepEqual(item(town).location, { kind: "held", holder: "data" });
  assert.equal(zoneAt(person(town, "data").tile.x, person(town, "data").tile.y), "park");
  assert.equal(item(town).text, "", "travel did not fabricate a reading or authored text");
  assert.deepEqual(physical.validatePhysicalItems(town), []);
  assert.deepEqual(auditEconomy(town), []);
});

test("earlier paid work and reserved library appointments take priority over item travel", () => {
  const town = fixture();
  town.minute = 600;
  assert.equal(activateFundedTown(town).ok, true);
  assert.ok(
    town.economy.work.agreements.some(
      (agreement) => agreement.worker === "kevin" && agreement.status === "active",
    ),
  );
  marked(town, "kevin");
  ok(act(town, "kevin", "bring", { destination: "park" }));
  assert.deepEqual(physical.physicalMovementGoals(town), {});
  atBook(town, "kevin");
  physical.advancePhysicalIntents(town);
  assert.equal(item(town).location.kind, "ground", "paid work also blocks automatic pickup");
  physical.stopPhysicalSession(town);
  marked(town, "data");
  ok(act(town, "data", "bring", { destination: "park" }));
  atBook(town, "data");
  const reserved = { data: { ...ANCHORS.library } };
  assert.deepEqual(physical.physicalMovementGoals(town, reserved), {});
  physical.advancePhysicalIntents(town, reserved);
  assert.equal(item(town).location.kind, "ground");
  physical.advancePhysicalIntents(town);
  assert.deepEqual(item(town).location, { kind: "held", holder: "data" });
});

test("a competing pickup or bounded route expiry stops an intention without replacement or false arrival", () => {
  const town = fixture();
  marked(town);
  ok(act(town, "data", "bring", { destination: "park" }));
  atBook(town);
  ok(act(town, "player", "pick-up"));
  physical.advancePhysicalIntents(town);
  assert.equal(town.physicalItems.session.intent, null);
  assert.equal(town.physicalItems.session.lastResult.ok, false);
  assert.deepEqual(item(town).location, { kind: "held", holder: "player" });
  const second = fixture();
  marked(second);
  ok(act(second, "data", "bring", { destination: "park" }));
  second.minute += 180;
  physical.advancePhysicalIntents(second);
  assert.equal(second.physicalItems.session.intent, null);
  assert.equal(second.physicalItems.session.lastResult.ok, false);
  assert.equal(item(second).location.kind, "ground");
});

test("inference accounting is marked once, fresh completion replaces unknowns once and stop preserves uncertainty", () => {
  const town = fixture();
  const job = marked(town, "data", 2);
  assert.equal(physical.markPhysicalRequest(town, job), false);
  assert.equal(town.physicalItems.session.revision, job.sessionRevision);
  assert.deepEqual(town.physicalItems.session.usage, {
    requests: 1,
    providerAttempts: 0,
    attemptsUnknown: 1,
    knownTokens: 0,
    tokenSamples: 0,
    tokensUnknown: 1,
    elapsedMs: 0,
    failures: 0,
  });
  const sample = { elapsedMs: 25, attempts: 2, totalTokens: 90, success: true };
  physical.recordPhysicalUsage(town, job, sample);
  physical.recordPhysicalUsage(town, job, sample);
  assert.deepEqual(town.physicalItems.session.usage, {
    requests: 1,
    providerAttempts: 2,
    attemptsUnknown: 0,
    knownTokens: 90,
    tokenSamples: 1,
    tokensUnknown: 0,
    elapsedMs: 25,
    failures: 0,
  });
  assert.equal(act(town, "data", "read").ok, false);
  const next = physical.nextPhysicalJob(town);
  assert.ok(next);
  assert.equal(physical.markPhysicalRequest(town, next), true);
  physical.stopPhysicalSession(town);
  physical.recordPhysicalUsage(town, next, {
    elapsedMs: 40,
    attempts: 1,
    totalTokens: 50,
    success: true,
  });
  assert.equal(town.physicalItems.session.usage.attemptsUnknown, 1);
  assert.equal(town.physicalItems.session.usage.tokensUnknown, 1);
  assert.equal(town.physicalItems.session.usage.knownTokens, 90);
  assert.equal(physical.nextPhysicalJob(town), null);
  assert.deepEqual(physical.validatePhysicalItems(town), []);
});

test("a pending request survives reload honestly and cannot resume inference automatically", () => {
  const town = fixture();
  marked(town);
  const restored = save.parseTownFile(save.exportTown(town));
  assert.ok(restored);
  assert.equal(restored.physicalItems.session.waiting, true);
  assert.equal(physical.nextPhysicalJob(restored), null);
  assert.equal(restored.physicalItems.session.usage.tokensUnknown, 1);
  physical.stopPhysicalSession(restored);
  const revision = restored.physicalItems.session.revision;
  ok(physical.startPhysicalSession(restored, "sub"));
  assert.ok(restored.physicalItems.session.revision > revision);
  assert.equal(restored.physicalItems.session.usage.requests, 0);
});

test("restore and explicit fork preserve local item custody/content while fork remaps the owning world", () => {
  const town = fixture();
  atBook(town, "amelia");
  ok(act(town, "amelia", "pick-up"));
  ok(
    act(town, "amelia", "write", {
      title: "A fair proposal",
      text: "Name the resources and listen to the people who use them.",
    }),
  );
  const restored = save.parseTownFile(save.exportTown(town));
  assert.ok(restored);
  assert.deepEqual(restored.physicalItems, town.physicalItems);
  assert.equal(restored.identityRegistry.worldId, town.identityRegistry.worldId);
  const fork = forkTown(restored);
  assert.notEqual(fork.identityRegistry.worldId, town.identityRegistry.worldId);
  assert.notEqual(
    fork.identityRegistry.characters.amelia.characterId,
    town.identityRegistry.characters.amelia.characterId,
  );
  assert.deepEqual(fork.physicalItems, town.physicalItems);
  assert.ok(save.parseTownFile(save.exportTown(fork)));
});

test("invalid physical extensions fail before normalization, writes or export and preserve raw recovery bytes", () => {
  for (const corrupt of [
    (town) => town.physicalItems.items.push(structuredClone(item(town))),
    (town) => {
      item(town).location = { kind: "held", holder: "nobody" };
    },
    (town) => {
      item(town).location = { kind: "ground", tile: { x: 0, y: 0 } };
    },
    (town) => {
      item(town).location.holder = "player";
    },
    (town) => {
      item(town).text = "Forged blank";
    },
    (town) => {
      item(town).revision = -1;
    },
    (town) => {
      town.physicalItems = null;
    },
    (town) => {
      town.physicalItems.version = 2;
    },
  ]) {
    const town = fixture();
    corrupt(town);
    const original = JSON.stringify(town);
    assert.ok(physical.validatePhysicalItems(town).length);
    assert.equal(JSON.stringify(town), original, "validator is pure");
    const raw = JSON.stringify({ version: 2, town });
    const report = save.readTownFile(raw);
    assert.equal(report.status, "unreadable");
    assert.equal(report.raw, raw);
    assert.match(report.reason, /manuscript/i);
    assert.throws(() => save.exportTown(town), /manuscript/i);
    const data = storage(raw);
    assert.equal(save.saveTownWithStatus(town).reason, "serialization");
    assert.equal(data.get(save.TOWN_STORAGE_KEY), raw);
    assert.equal(save.readTownSave().status, "unreadable");
  }
});

test("two tabs cannot overwrite newer manuscript custody and failed replacement retains both originals", async () => {
  const original = fixture();
  storage();
  assert.equal((await save.initializeTownSave(original)).ok, true);
  const a = save.readTownSave().town,
    b = save.readTownSave().town;
  atBook(a);
  ok(act(a, "player", "pick-up"));
  assert.equal(
    (await save.persistTownSave(a)).ok,
    true,
    "item commit preserves the root storage origin",
  );
  atBook(b, "sub");
  ok(act(b, "sub", "pick-up"));
  const result = await save.persistTownSave(b);
  assert.equal(result.reason, "conflict");
  assert.equal(JSON.parse(result.storedRaw).town.physicalItems.items[0].location.holder, "player");
  assert.equal(JSON.parse(result.localRaw).town.physicalItems.items[0].location.holder, "sub");
  assert.equal(save.readTownSave().town.physicalItems.items[0].location.holder, "player");
});

test("generic mind result application rejects act before mutating any town state", () => {
  const town = fixture();
  const original = JSON.stringify(town);
  assert.throws(
    () =>
      applyResult(town, {
        kind: "act",
        mind: "grok",
        agentId: "data",
        sessionRevision: 1,
        decision: { kind: "wait" },
      }),
    /applyPhysicalCommand/,
  );
  assert.equal(JSON.stringify(town), original);
});
