import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
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
const { createTown, addSpecialists } = await server.ssrLoadModule("/src/game/town.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const { stepMinute, frameAt, advanceTown } = await server.ssrLoadModule("/src/game/sim.ts");
const { buildPrompt } = await server.ssrLoadModule("/src/game/prompt.ts");
const { offlineResult } = await server.ssrLoadModule("/src/game/offline.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { walkable } = await server.ssrLoadModule("/src/game/world.ts");
const fixture = await readFile(
  new URL("./fixtures/legacy-six-resident-town.json", import.meta.url),
  "utf8",
);
const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
after(async () => {
  if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage);
  else delete globalThis.localStorage;
  await server.close();
});
const agent = (town, id) => town.agents.find((resident) => resident.id === id);
const copy = (value) => JSON.parse(JSON.stringify(value));

test("new towns have seven distinct residents plus the player", () => {
  const town = createTown("Ada");
  assert.equal(town.version, 2);
  assert.deepEqual(
    town.agents.map((a) => a.id),
    ["kevin", "arwyn", "northern", "baba", "sub", "player", "data", "amelia"],
  );
  assert.equal(new Set(town.agents.map((a) => `${a.tile.x},${a.tile.y}`)).size, 8);
  for (const id of ["data", "amelia"]) {
    const resident = agent(town, id);
    assert.ok(walkable(resident.home.x, resident.home.y));
    assert.ok(walkable(resident.tile.x, resident.tile.y));
    assert.equal(resident.plan.beats.length, 24);
    assert.ok(resident.memories.some((m) => /arrived/.test(m.text)));
  }
  assert.match(agent(town, "data").identity, /test/);
  assert.match(agent(town, "amelia").identity, /economist/);
});

test("a genuine v1 town migrates once without replacing the original residents", () => {
  const old = JSON.parse(fixture).town;
  const migrated = save.parseTownFile(fixture);
  assert.ok(migrated);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.agents.length, 8);
  for (const previous of old.agents) {
    const next = agent(migrated, previous.id);
    for (const key of [
      "name",
      "money",
      "identity",
      "selfSentence",
      "want",
      "tile",
      "home",
      "plan",
      "projects",
      "threads",
      "relationships",
    ]) {
      assert.deepEqual(next[key], previous[key], `${previous.id}.${key}`);
    }
    for (const memory of previous.memories) {
      assert.ok(next.memories.some((m) => m.id === memory.id && m.text === memory.text));
    }
  }
  for (const key of ["playerName", "day", "minute", "paused", "notices", "favors", "tills"]) {
    assert.deepEqual(migrated[key], old[key], key);
  }
  const once = structuredClone(migrated);
  addSpecialists(migrated);
  assert.deepEqual(migrated, once, "arrival is idempotent");
  const restored = save.parseTownFile(save.exportTown(migrated));
  assert.equal(restored.agents.length, 8);
  assert.equal(agent(restored, "data").memories.filter((m) => /arrived/.test(m.text)).length, 1);
});

test("migration retains the old bytes even if saving the new town fails", () => {
  const items = new Map([[save.LEGACY_TOWN_STORAGE_KEY, fixture]]);
  let fail = true;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        if (fail) throw new DOMException("Full", "QuotaExceededError");
        items.set(key, value);
      },
    },
  });
  const report = save.readTownSave();
  assert.equal(report.status, "ready");
  assert.equal(save.saveTownWithStatus(report.town).ok, false);
  assert.equal(items.get(save.LEGACY_TOWN_STORAGE_KEY), fixture);
  fail = false;
  assert.equal(save.saveTownWithStatus(report.town).ok, true);
  assert.equal(items.get(save.LEGACY_TOWN_STORAGE_KEY), fixture);
  assert.equal(save.readTownSave().town.agents.length, 8);
  items.set(save.TOWN_STORAGE_KEY, "{broken newer save");
  assert.deepEqual(save.readTownSave(), { status: "unreadable", raw: "{broken newer save" });
  items.set(save.TOWN_STORAGE_KEY, "");
  assert.deepEqual(save.readTownSave(), { status: "unreadable", raw: "" });
  assert.equal(items.get(save.LEGACY_TOWN_STORAGE_KEY), fixture);
});

test("unknown versions, partial rosters, duplicate IDs and inconsistent wrappers are recoverable errors", () => {
  for (const mutate of [
    (t) => {
      t.version = 3;
    },
    (t) => {
      t.agents.pop();
    },
    (t) => {
      t.agents[7].id = "data";
    },
    (t) => {
      t.agents[7].id = "unknown";
    },
  ]) {
    const town = createTown("Ada");
    mutate(town);
    assert.equal(save.parseTownFile(JSON.stringify(town)), null);
  }
  assert.equal(save.parseTownFile(JSON.stringify({ version: 1, town: createTown("Ada") })), null);
  const old = JSON.parse(fixture);
  old.town.agents.pop();
  assert.equal(save.parseTownFile(JSON.stringify(old)), null);
});

test("legacy replay keeps the original roster order and hides newcomers before their arrival", () => {
  const old = JSON.parse(fixture).town;
  old.agents.reverse();
  old.scrub[0].p = old.agents.flatMap((a) => [a.tile.x, a.tile.y]);
  const town = save.parseTownFile(JSON.stringify(old));
  town.agents.reverse();
  const positions = frameAt(town, 730, 3);
  town.agents.forEach((resident, i) => {
    const original = agent(old, resident.id);
    if (original)
      assert.deepEqual(positions.slice(i * 2, i * 2 + 2), [original.tile.x, original.tile.y]);
    else assert.ok(Number.isNaN(positions[i * 2]) && Number.isNaN(positions[i * 2 + 1]));
  });
});

test("structured conversation turns and attribution survive export and reload", () => {
  const town = createTown("Ada");
  agent(town, "data").memories.push({
    id: "m999",
    day: 1,
    minute: 420,
    type: "chat",
    text: "A test was discussed, not performed.",
    importance: 5,
    keywords: ["test"],
    with: "player",
    source: "statement",
    turns: [
      { speaker: "player", text: "Which test?" },
      { speaker: "data", text: "We could compare the two records." },
    ],
  });
  const loaded = save.parseTownFile(save.exportTown(town));
  const memory = agent(loaded, "data").memories.find((m) => m.id === "m999");
  assert.equal(memory.source, "statement");
  assert.deepEqual(memory.turns, agent(town, "data").memories.at(-1).turns);
});

test("seven residents plan in bounded batches without losing any resident", () => {
  const town = createTown("Ada");
  town.day = 2;
  town.minute = 299;
  const planned = [];
  for (let i = 0; i < 4; i++) {
    const job = stepMinute(town, true);
    assert.equal(job.kind, "plan");
    assert.ok(job.agents.length >= 1 && job.agents.length <= 2);
    const prompt = buildPrompt(town, job);
    assert.ok(prompt.length <= 14000, `gateway limit exceeded: ${prompt.length}`);
    const result = offlineResult(town, job);
    assert.deepEqual(
      result.plans.map((p) => p.id),
      job.agents,
    );
    applyResult(town, result);
    planned.push(...job.agents);
  }
  assert.deepEqual(
    planned.sort(),
    ["kevin", "arwyn", "northern", "baba", "sub", "data", "amelia"].sort(),
  );
});

test("dawn resumes unapplied plans after a reload, even after the normal batch window", () => {
  const town = createTown("Ada");
  town.day = 2;
  town.minute = 299;
  const interrupted = stepMinute(town, true);
  assert.deepEqual(interrupted.agents, ["kevin", "arwyn"]);
  const restored = save.parseTownFile(save.exportTown(town));
  // The request was interrupted before its result reached the saved town.
  restored.minute = 310;
  const planned = [];
  for (let i = 0; i < 4; i++) {
    const job = stepMinute(restored, true);
    assert.equal(job.kind, "plan");
    assert.ok(job.agents.length <= 2);
    planned.push(...job.agents);
    applyResult(restored, offlineResult(restored, job));
  }
  assert.equal(new Set(planned).size, 7);
  assert.ok(restored.agents.filter((a) => a.id !== "player").every((a) => a.plan.day === 2));
});

test("specialists remain themselves through a week and a save round trip", () => {
  const town = createTown("Ada");
  advanceTown(town, 7 * 1440);
  const loaded = save.parseTownFile(save.exportTown(town));
  assert.ok(loaded);
  for (const id of ["data", "amelia"]) {
    const resident = agent(loaded, id);
    assert.ok(Number.isFinite(resident.money));
    assert.ok(walkable(resident.tile.x, resident.tile.y));
    assert.doesNotMatch(resident.selfSentence, /writer|borrowed.*voice/i);
    assert.equal(resident.plan.beats.length, 24);
  }
});
