import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const cacheDir = await mkdtemp(join(tmpdir(), "town-reflections-"));
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
const { makeMemory, pushMemory } = await server.ssrLoadModule("/src/game/memory.ts");
const { localReflections } = await server.ssrLoadModule("/src/game/reflections.ts");
const { applyResult } = await server.ssrLoadModule("/src/game/effects.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { characterProfile } = await server.ssrLoadModule("/src/game/characters.ts");

const resident = (town, id = "data") => town.agents.find((agent) => agent.id === id);
const addMemory = (town, type, text, extra = {}, id = "data") => {
  const memory = makeMemory(town, town.day, town.minute, type, text, 6, extra);
  pushMemory(resident(town, id), memory);
  return memory;
};
const reflect = (town, id = "data") => {
  const reflections = localReflections(town, resident(town, id));
  applyResult(town, {
    kind: "reflect",
    mind: "offline",
    agents: [{ id, reflections }],
  });
  return reflections;
};
const receipt = (town) =>
  addMemory(town, "favor", "Hobbs Cafe paid me 5 for a shift I actually worked.");
const tell = (town, text, extra = {}) =>
  addMemory(town, "chat", "A recorded synthetic conversation.", {
    with: "player",
    turns: [
      { speaker: "player", text },
      { speaker: "data", text: "I will keep your account separate from a confirmed event." },
    ],
    ...extra,
  });

test("quiet batches add no lessons and reset the reflection trigger", () => {
  const town = createTown("Test Resident");
  const agent = resident(town);
  const count = agent.memories.filter((memory) => memory.type === "reflect").length;
  for (let batch = 0; batch < 5; batch++) {
    for (let observation = 0; observation < 6; observation++) {
      town.minute++;
      addMemory(town, "observe", "At 12:00 in the cafe, I saw Baba — home on the row.");
    }
    assert.deepEqual(reflect(town), []);
    assert.equal(agent.newMemories, 0);
  }
  assert.equal(agent.memories.filter((memory) => memory.type === "reflect").length, count);
  receipt(town);
  const fresh = reflect(town);
  assert.equal(fresh.length, 1);
  assert.match(fresh[0], /record.*paid me 5/i);
  assert.deepEqual(reflect(town), []);
});

test("identical receipt copies deduplicate but a later day's wage remains a new event", () => {
  const town = createTown("Test Resident");
  const original = receipt(town);
  addMemory(town, "favor", original.text);
  assert.equal(reflect(town).length, 1);
  town.day++;
  receipt(town);
  const fresh = reflect(town);
  assert.equal(fresh.length, 1);
  assert.match(fresh[0], /day 2/);
  assert.deepEqual(reflect(town), []);
});

test("reported completion stays an attributed, unverified statement and is not repeated", () => {
  const town = createTown("Test Resident");
  tell(town, "I finished the water pump repair and paid every outstanding bill.");
  const before = exportTown(town);
  const preview = localReflections(town, resident(town));
  assert.equal(exportTown(town), before, "review must not mutate town state");
  assert.equal(preview.length, 1);
  assert.match(preview[0], /Test Resident told me:/);
  assert.match(preview[0], /not independently verified/);
  assert.match(preview[0], /I finished the water pump repair/);
  reflect(town);
  town.minute++;
  tell(town, "I finished the water pump repair and paid every outstanding bill.");
  assert.deepEqual(reflect(town), []);
  assert.equal(town.favors.length, 0);
});

test("greetings, questions, own answers, legacy prose and profile maxims do not create learning", () => {
  const town = createTown("Test Resident");
  tell(town, "Hello. I am happy to see you around the town today.");
  tell(town, "What should the town do to improve its water supply?");
  tell(town, "", {
    with: "baba",
    turns: [{ speaker: "baba", text: characterProfile("baba").publicInfo }],
  });
  tell(town, "", {
    turns: [{ speaker: "data", text: "I fixed the water supply and paid every outstanding bill." }],
  });
  tell(town, "", { turns: undefined, text: "A stranger said the water supply was fixed." });
  addMemory(town, "reflect", characterProfile("data").reflection, { seed: true });
  assert.deepEqual(reflect(town), []);
});

test("other residents' private records and misleading source labels supply no personal facts", () => {
  const town = createTown("Test Resident");
  addMemory(town, "favor", "PRIVATE_RECEIPT_SENTINEL paid me 9.", {}, "amelia");
  addMemory(town, "favor", "Hobbs Cafe paid me 500.", { source: "statement" });
  addMemory(town, "favor", "Hobbs Cafe paid me 999.", { source: "reflection" });
  tell(town, "", {
    turns: [{ speaker: "amelia", text: "I have completed an unrecorded private transaction." }],
  });
  assert.deepEqual(reflect(town), []);
});

test("save reload preserves the checkpoint while accepting a new receipt in the same minute", () => {
  const town = createTown("Test Resident");
  receipt(town);
  reflect(town);
  const loaded = parseTownFile(exportTown(town));
  assert.ok(loaded);
  assert.deepEqual(reflect(loaded), []);
  addMemory(loaded, "favor", "A synthetic tab of 2 was paid from my purse.");
  const fresh = reflect(loaded);
  assert.equal(fresh.length, 1);
  assert.match(fresh[0], /synthetic tab/);
  assert.deepEqual(reflect(parseTownFile(exportTown(loaded))), []);
});

test("an automatic compression summary does not hide an unreviewed receipt", () => {
  const town = createTown("Test Resident");
  receipt(town);
  town.minute++;
  addMemory(town, "reflect", "Looking back, the ordinary minutes fold together.", {
    id: "fold-synthetic-observations",
  });
  const rows = reflect(town);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /record.*paid me 5/i);
});

test("a review is bounded, prioritizes receipts and keeps truncation inside attribution", () => {
  const town = createTown("Test Resident");
  tell(town, "I observed a possible problem with the water supply. ".repeat(30));
  town.minute++;
  tell(town, "I noticed that the practice lesson was difficult to attend after work.");
  receipt(town);
  const rows = reflect(town);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /record.*paid me 5/i);
  assert.ok(rows.every((row) => row.length <= 320));
  const other = createTown("Test Resident");
  tell(other, "I observed a possible problem with the water supply. ".repeat(30));
  const [long] = reflect(other);
  assert.ok(long.length <= 320);
  assert.match(long, /” This is their account, not independently verified\.$/);
});
