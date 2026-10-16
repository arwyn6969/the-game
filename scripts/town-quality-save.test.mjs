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
const save = await server.ssrLoadModule("/src/game/save.ts");
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { initializeEconomy } = await server.ssrLoadModule("/src/game/economy.ts");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
after(async () => {
  for (const [key, descriptor] of [
    ["localStorage", originalStorage],
    ["navigator", originalNavigator],
  ]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await server.close();
});
function fixture() {
  const data = new Map();
  const box = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: box });
  return { data, box };
}
function webLocks() {
  let chain = Promise.resolve();
  let calls = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request(_name, work) {
          calls++;
          const result = chain.then(work);
          chain = result.then(
            () => undefined,
            () => undefined,
          );
          return result;
        },
      },
    },
  });
  return () => calls;
}

test("a stale tab preserves both full snapshots instead of overwriting current progress", () => {
  const { data } = fixture();
  const initial = createTown("Tabs");
  assert.equal(save.saveTownWithStatus(initial).ok, true);
  const tabA = save.readTownSave().town;
  const tabB = save.readTownSave().town;
  tabA.day = 3;
  tabA.playerName = "Newer";
  save.saveTownWithStatus(tabA);
  const current = data.get(save.TOWN_STORAGE_KEY);
  const result = save.saveTownWithStatus(tabB);
  assert.equal(result.reason, "conflict");
  assert.equal(result.storedRaw, current);
  assert.equal(JSON.parse(result.localRaw).town.day, 1);
  assert.equal(data.get(save.TOWN_STORAGE_KEY), current);
  assert.equal(data.get(result.backupKey), result.localRaw);
  assert.equal(save.readTownConflicts().length, 1);
  save.saveTownWithStatus(tabB);
  assert.equal(save.readTownConflicts().length, 1, "unchanged conflict copy is not duplicated");
});

test("Web Locks serialize simultaneous saves and origins advance only after own successful writes", async () => {
  fixture();
  const lockCalls = webLocks();
  assert.equal((await save.initializeTownSave(createTown("Parallel"))).ok, true);
  const first = save.readTownSave().town;
  const second = save.readTownSave().town;
  first.day = 2;
  second.day = 4;
  const results = await Promise.all([save.persistTownSave(first), save.persistTownSave(second)]);
  assert.deepEqual(
    results.map((result) => result.ok),
    [true, false],
  );
  assert.equal(results[1].reason, "conflict");
  first.day = 3;
  assert.equal((await save.persistTownSave(first)).ok, true);
  assert.equal(save.readTownSave().town.day, 3);
  assert.equal(lockCalls(), 4);
});

test("naming and unknown imported copies cannot overwrite a town that appeared elsewhere", async () => {
  const { data } = fixture();
  const current = save.exportTown(createTown("Already here"));
  data.set(save.TOWN_STORAGE_KEY, current);
  assert.equal((await save.initializeTownSave(createTown("Late naming"))).reason, "conflict");
  const imported = save.parseTownFile(save.exportTown(createTown("Import")));
  assert.equal((await save.persistTownSave(imported)).reason, "conflict");
  assert.equal(data.get(save.TOWN_STORAGE_KEY), current);
});

test("explicit replacement preserves original unreadable bytes and refuses destructive backup failure", async () => {
  const { data, box } = fixture();
  const damaged = "{ original broken bytes with private history";
  data.set(save.TOWN_STORAGE_KEY, damaged);
  const next = createTown("Replacement");
  assert.equal((await save.replaceTownSave(next)).ok, true);
  assert.ok(save.readTownConflicts().some((copy) => copy.raw === damaged));
  next.day = 2;
  assert.equal((await save.persistTownSave(next)).ok, true);
  const before = data.get(save.TOWN_STORAGE_KEY);
  const write = box.setItem;
  box.setItem = (key, value) => {
    if (key.startsWith(save.TOWN_BACKUP_PREFIX))
      throw new DOMException("Full", "QuotaExceededError");
    write(key, value);
  };
  assert.deepEqual(await save.replaceTownSave(createTown("Cannot replace")), {
    ok: false,
    reason: "quota",
  });
  assert.equal(data.get(save.TOWN_STORAGE_KEY), before);
});

test("an existing empty save requires explicit recovery and is backed up before replacement", async () => {
  const { data } = fixture();
  data.set(save.TOWN_STORAGE_KEY, "");
  assert.deepEqual(save.readTownSave(), { status: "unreadable", raw: "" });
  const next = createTown("Recovered empty");
  assert.equal((await save.initializeTownSave(next)).reason, "conflict");
  assert.equal(data.get(save.TOWN_STORAGE_KEY), "");
  assert.equal((await save.replaceTownSave(next)).ok, true);
  assert.ok(
    save.readTownConflicts().some((copy) => copy.key.includes(":replaced:") && copy.raw === ""),
  );
  assert.equal(save.readTownSave().town.playerName, "Recovered empty");
});

test("a conflict remains recoverable when durable backup storage is exhausted", () => {
  const { data, box } = fixture();
  save.saveTownWithStatus(createTown("Full storage"));
  const first = save.readTownSave().town;
  const stale = save.readTownSave().town;
  first.day++;
  save.saveTownWithStatus(first);
  const before = data.get(save.TOWN_STORAGE_KEY);
  box.setItem = () => {
    throw new DOMException("Full", "QuotaExceededError");
  };
  const result = save.saveTownWithStatus(stale);
  assert.equal(result.reason, "conflict");
  assert.equal(result.storedRaw, before);
  assert.ok(save.parseTownFile(result.localRaw));
  assert.equal(data.get(save.TOWN_STORAGE_KEY), before);
});

test("v2 audited books preserve balances above legacy caps and reject corrupt account data", () => {
  const town = createTown("Books");
  delete town.economy;
  town.agents[0].money = 5_000;
  town.tills.cafe = 2_000;
  initializeEconomy(town);
  const restored = save.parseTownFile(save.exportTown(town));
  assert.ok(restored);
  assert.equal(restored.agents[0].money, 5_000);
  assert.equal(restored.tills.cafe, 2_000);
  restored.agents[0].money++;
  assert.equal(save.parseTownFile(JSON.stringify(restored)), null);
});

test("portable exports fail visibly above the supported import ceiling without truncation", () => {
  const town = createTown("Large history");
  town.extraHistory = "x".repeat(save.MAX_TOWN_FILE_BYTES);
  assert.throws(() => save.exportTown(town), /exceeds the import size limit/);
  assert.equal(town.extraHistory.length, save.MAX_TOWN_FILE_BYTES);
});

test("ledgerless v1 imports preserve legitimate cash and debts beyond old caps before snapshotting accounts", async () => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(
    await readFile(new URL("./fixtures/legacy-six-resident-town.json", import.meta.url), "utf8"),
  );
  const legacy = data.town ?? data;
  legacy.agents[0].money = 4_000;
  legacy.tills.cafe = 3_000;
  if (legacy.favors.length) legacy.favors[0].amount = 120;
  const report = save.readTownFile(JSON.stringify(data));
  assert.equal(report.status, "ready", report.reason);
  assert.equal(report.town.agents.find((agent) => agent.id === legacy.agents[0].id).money, 4_000);
  assert.equal(report.town.tills.cafe, 3_000);
  if (legacy.favors.length) assert.equal(report.town.favors[0].amount, 120);
  assert.ok(report.town.economy);
});

test("malformed library extensions retain complete original bytes and explain recovery", () => {
  for (const malformed of [
    null,
    "broken",
    [],
    { schemaVersion: 99 },
    { schemaVersion: 1, revisions: null },
  ]) {
    const town = createTown("Broken library");
    initializeEconomy(town);
    town.economy.projects = { library: malformed };
    const raw = JSON.stringify({ version: 2, town });
    const report = save.readTownFile(raw);
    assert.equal(report.status, "unreadable");
    assert.equal(report.raw, raw);
    assert.match(report.reason, /library|accounts/i);
    assert.equal(save.parseTownFile(raw), null);
    assert.equal(save.saveTownWithStatus(town).reason, "serialization");
  }
});
