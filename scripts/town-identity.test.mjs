import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { AGENT_IDS } = await server.ssrLoadModule("/src/game/types.ts");
const identity = await server.ssrLoadModule("/src/game/identity.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const economy = await server.ssrLoadModule("/src/game/economy.ts");
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
const legacyFixture = JSON.parse(
  await readFile(new URL("./fixtures/legacy-six-resident-town.json", import.meta.url), "utf8"),
).town;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
after(async () => {
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete globalThis.localStorage;
  await server.close();
});

const copy = (value) => structuredClone(value);
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const withoutIdentity = (town) => {
  const clone = copy(town);
  delete clone.identityRegistry;
  return clone;
};
const reverseKeys = (value) => {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .reverse()
      .map((key) => [key, reverseKeys(value[key])]),
  );
};
function storage() {
  const data = new Map();
  const writes = [];
  const box = {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      writes.push({ key, value });
      data.set(key, value);
    },
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: box });
  return { data, writes, box };
}
function restore(raw) {
  const report = save.readTownFile(raw);
  assert.equal(report.status, "ready", report.reason);
  return report.town;
}
function assertRegistry(registry) {
  assert.equal(identity.validateTownIdentity(registry, AGENT_IDS), true);
  assert.equal(registry.schemaVersion, 1);
  assert.match(registry.worldId, /^world_[0-9a-f]{64}$/);
  assert.match(registry.rootWorldId, /^world_[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(registry.characters).sort(), [...AGENT_IDS].sort());
  const characterIds = [];
  for (const id of AGENT_IDS) {
    const entry = registry.characters[id];
    assert.match(entry.characterId, /^character_[0-9a-f]{64}$/);
    assert.match(entry.originWorldId, /^world_[0-9a-f]{64}$/);
    assert.equal(entry.archetypeId, id);
    characterIds.push(entry.characterId);
  }
  assert.equal(new Set(characterIds).size, AGENT_IDS.length);
}
function transfer(town) {
  const terms = { from: "agent:player", to: "agent:baba", amount: 1 };
  return economy.runEconomyCommand(
    town,
    { id: "identity-transfer", kind: "test-transfer", actor: "player", authority: "ui", terms },
    (draft, context) => {
      economy.transferFunds(draft, context, {
        id: "identity-transfer:transaction",
        ...terms,
        purpose: "A disclosed identity regression fixture transfer",
      });
      return terms;
    },
  );
}
const originalBackups = (data, raw) =>
  [...data.entries()].filter(
    ([key, value]) => key.startsWith(save.TOWN_BACKUP_PREFIX) && value === raw,
  );

test("fresh towns with the same cast and player name receive independent world and character IDs", () => {
  const first = createTown("Ada");
  const second = createTown("Ada");
  assert.equal(first.version, 2, "identity is an additive version-2 extension");
  assert.deepEqual(
    first.agents.map((agent) => agent.name),
    second.agents.map((agent) => agent.name),
  );
  for (const town of [first, second]) {
    assertRegistry(town.identityRegistry);
    assert.equal(town.identityRegistry.rootWorldId, town.identityRegistry.worldId);
    assert.equal(town.identityRegistry.parentWorldId, undefined);
    for (const entry of Object.values(town.identityRegistry.characters)) {
      assert.equal(entry.originWorldId, town.identityRegistry.worldId);
      assert.equal(entry.forkedFromCharacterId, undefined);
    }
  }
  assert.notEqual(first.identityRegistry.worldId, second.identityRegistry.worldId);
  const firstIds = new Set(
    Object.values(first.identityRegistry.characters).map((entry) => entry.characterId),
  );
  for (const entry of Object.values(second.identityRegistry.characters))
    assert.equal(firstIds.has(entry.characterId), false);
  assertRegistry(identity.createTownIdentity(AGENT_IDS));
});

test("identity survives export, repeated restore, browser reload, renaming and simulation time", () => {
  storage();
  const town = createTown("Ada");
  const registry = copy(town.identityRegistry);
  person(town, "kevin").name = "A different Kevin";
  town.playerName = "Iris";
  person(town, "player").name = "Iris";
  for (let minute = 0; minute < 3; minute++) stepMinute(town);
  assert.deepEqual(town.identityRegistry, registry);
  const raw = save.exportTown(town);
  for (let attempt = 0; attempt < 3; attempt++)
    assert.deepEqual(restore(raw).identityRegistry, registry);
  assert.equal(save.saveTownWithStatus(town).ok, true);
  const report = save.readTownSave();
  assert.equal(report.status, "ready");
  assert.deepEqual(report.town.identityRegistry, registry);
  assert.equal(person(report.town, "kevin").name, "A different Kevin");
  assert.equal(report.town.playerName, "Iris");
});

for (const version of [1, 2]) {
  test(`legacy v${version} restores deterministically before normalization and ignores JSON key order`, () => {
    const original =
      version === 1 ? copy(legacyFixture) : withoutIdentity(createTown("Legacy Ada"));
    const before = copy(original);
    const envelope = { version, town: original };
    const variants = [
      JSON.stringify(original),
      JSON.stringify(envelope),
      JSON.stringify(reverseKeys(envelope), null, 2),
    ];
    const expected = identity.legacyTownIdentity(original, AGENT_IDS);
    assertRegistry(expected);
    assert.deepEqual(original, before, "computing a legacy identity must not normalize the input");
    for (const raw of variants) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const town = restore(raw);
        assert.equal(town.version, 2);
        assert.deepEqual(town.identityRegistry, expected);
        assert.equal(town.agents.length, AGENT_IDS.length);
      }
    }
    const migrated = restore(variants[0]);
    assert.deepEqual(restore(save.exportTown(migrated)).identityRegistry, expected);
  });
}

test("legacy identity includes original history rather than only the fixed cast or player name", () => {
  const first = withoutIdentity(createTown("Ada"));
  const second = copy(first);
  second.day++;
  assert.notEqual(
    identity.legacyTownIdentity(first, AGENT_IDS).worldId,
    identity.legacyTownIdentity(second, AGENT_IDS).worldId,
  );
});

test("legacy runtime optional fields derive the same identity as their exported JSON", () => {
  const town = withoutIdentity(createTown("Legacy Ada"));
  town.social = undefined;
  person(town, "kevin").bubble = undefined;
  const before = copy(town);
  assert.deepEqual(
    identity.legacyTownIdentity(town, AGENT_IDS),
    identity.legacyTownIdentity(JSON.parse(JSON.stringify(town)), AGENT_IDS),
  );
  assert.deepEqual(town, before, "canonical hashing must not remove runtime optional fields");
});

test("strict identity validation rejects malformed, partial, duplicate and unknown data without repair", () => {
  const valid = createTown("Ada");
  const mutations = [
    ["null registry", (town) => (town.identityRegistry = null)],
    ["array registry", (town) => (town.identityRegistry = [])],
    ["unknown schema", (town) => (town.identityRegistry.schemaVersion = 2)],
    ["missing world", (town) => delete town.identityRegistry.worldId],
    [
      "wrong world prefix",
      (town) => (town.identityRegistry.worldId = `character_${"a".repeat(64)}`),
    ],
    ["uppercase world", (town) => (town.identityRegistry.worldId = `world_${"A".repeat(64)}`)],
    ["missing root", (town) => delete town.identityRegistry.rootWorldId],
    ["invalid root", (town) => (town.identityRegistry.rootWorldId = "world_short")],
    ["missing character map", (town) => delete town.identityRegistry.characters],
    ["missing resident", (town) => delete town.identityRegistry.characters.kevin],
    [
      "unknown resident",
      (town) =>
        (town.identityRegistry.characters.stranger = copy(town.identityRegistry.characters.kevin)),
    ],
    ["partial character", (town) => delete town.identityRegistry.characters.kevin.originWorldId],
    ["wrong archetype", (town) => (town.identityRegistry.characters.kevin.archetypeId = "baba")],
    ["invalid character", (town) => (town.identityRegistry.characters.kevin.characterId = "kevin")],
    [
      "duplicate character",
      (town) =>
        (town.identityRegistry.characters.baba.characterId =
          town.identityRegistry.characters.kevin.characterId),
    ],
    [
      "invalid origin",
      (town) => (town.identityRegistry.characters.kevin.originWorldId = "elsewhere"),
    ],
    [
      "root with parent",
      (town) => (town.identityRegistry.parentWorldId = town.identityRegistry.worldId),
    ],
    [
      "root with fork lineage",
      (town) =>
        (town.identityRegistry.characters.kevin.forkedFromCharacterId = `character_${"b".repeat(64)}`),
    ],
    ["unknown registry property", (town) => (town.identityRegistry.unexpected = true)],
    [
      "unknown character property",
      (town) => (town.identityRegistry.characters.kevin.wallet = "unverified"),
    ],
  ];
  for (const [label, mutate] of mutations) {
    const town = copy(valid);
    mutate(town);
    const before = copy(town.identityRegistry);
    assert.equal(identity.validateTownIdentity(town.identityRegistry, AGENT_IDS), false, label);
    assert.deepEqual(town.identityRegistry, before, `${label}: validation must not repair`);
    const raw = ` \n${JSON.stringify({ version: 2, town }, null, 2)}\n `;
    const report = save.readTownFile(raw);
    assert.equal(report.status, "unreadable", label);
    assert.equal(report.raw, raw, `${label}: exact original bytes remain available`);
    assert.match(report.reason, /identity|character|world/i, label);
    assert.equal(save.parseTownFile(raw), null, label);
  }
});

test("existing registries are validated and restored without rekeying or mutating them", () => {
  const town = createTown("Ada");
  const registry = copy(town.identityRegistry);
  const before = JSON.stringify(town);
  assert.equal(identity.validateTownIdentity(town.identityRegistry, AGENT_IDS), true);
  assert.deepEqual(identity.characterRef(town, "kevin"), {
    worldId: registry.worldId,
    ...registry.characters.kevin,
  });
  assert.equal(
    identity.agentByCharacterId(town, registry.characters.kevin.characterId),
    person(town, "kevin"),
  );
  assert.equal(identity.agentByCharacterId(town, `character_${"f".repeat(64)}`), undefined);
  assert.equal(JSON.stringify(town), before);
  assert.deepEqual(restore(save.exportTown(town)).identityRegistry, registry);
});

test("an invalid browser identity is retained for recovery rather than replaced by an older town", () => {
  const { data, writes } = storage();
  const invalid = createTown("Invalid identity");
  invalid.identityRegistry.characters.baba.characterId =
    invalid.identityRegistry.characters.kevin.characterId;
  const raw = `\n${JSON.stringify({ version: 2, town: invalid }, null, 2)}\n`;
  data.set(save.TOWN_STORAGE_KEY, raw);
  data.set(save.LEGACY_TOWN_STORAGE_KEY, JSON.stringify({ version: 1, town: legacyFixture }));
  const report = save.readTownSave();
  assert.equal(report.status, "unreadable");
  assert.equal(report.raw, raw);
  assert.match(report.reason, /identity|character|world/i);
  assert.equal(writes.length, 0);
  assert.equal(save.saveTownWithStatus(invalid).reason, "serialization");
  assert.equal(data.get(save.TOWN_STORAGE_KEY), raw);
  assert.equal(writes.length, 0, "a malformed registry must not be repaired during saving");
});

test("missing or corrupt registry helpers never fall back to local archetype IDs", () => {
  for (const registry of [undefined, null, {}]) {
    const town = createTown("Ada");
    town.identityRegistry = registry;
    assert.throws(() => identity.characterRef(town, "kevin"));
    assert.throws(() => identity.townRecordRef(town, "memory", "m1", "kevin"));
    assert.throws(() => identity.agentByCharacterId(town, "kevin"));
    assert.throws(() => identity.forkTown(town));
  }
});

test("record references distinguish worlds, record kinds and owners even when local IDs collide", () => {
  const first = createTown("Ada");
  const second = createTown("Ada");
  const reference = identity.townRecordRef(first, "memory", "m:shared", "kevin");
  assert.deepEqual(reference, {
    worldId: first.identityRegistry.worldId,
    kind: "memory",
    localId: "m:shared",
    ownerCharacterId: first.identityRegistry.characters.kevin.characterId,
  });
  assert.notDeepEqual(reference, identity.townRecordRef(second, "memory", "m:shared", "kevin"));
  assert.notDeepEqual(reference, identity.townRecordRef(first, "memory", "m:shared", "baba"));
  assert.notDeepEqual(reference, identity.townRecordRef(first, "thread", "m:shared", "kevin"));
  assert.notDeepEqual(reference, identity.townRecordRef(first, "memory", "m:other", "kevin"));
  assert.deepEqual(identity.townRecordRef(first, "notice", "shared"), {
    worldId: first.identityRegistry.worldId,
    kind: "notice",
    localId: "shared",
  });
  assert.equal(
    identity.agentByCharacterId(second, first.identityRegistry.characters.kevin.characterId),
    undefined,
  );
});

test("an explicit fork gets new IDs and preserves all game relationships, debts and ledger receipts", () => {
  const town = createTown("Ada");
  person(town, "kevin").relationships.player = {
    score: 17,
    note: "A witnessed fixture conversation.",
  };
  town.favors.push({
    id: "debt-row",
    from: "player",
    to: "baba",
    text: "A loaf on account.",
    amount: 2,
    status: "owed",
    day: town.day,
  });
  economy.initializeEconomy(town);
  assert.equal(transfer(town).ok, true);
  const before = copy(town);
  const fork = identity.forkTown(town);
  assert.deepEqual(town, before, "forking must not mutate its source");
  assert.notEqual(fork, town);
  assertRegistry(fork.identityRegistry);
  assert.notEqual(fork.identityRegistry.worldId, town.identityRegistry.worldId);
  assert.equal(fork.identityRegistry.rootWorldId, town.identityRegistry.rootWorldId);
  assert.equal(fork.identityRegistry.parentWorldId, town.identityRegistry.worldId);
  assert.deepEqual(withoutIdentity(fork), withoutIdentity(town));
  for (const id of AGENT_IDS) {
    const source = town.identityRegistry.characters[id];
    const entry = fork.identityRegistry.characters[id];
    assert.notEqual(entry.characterId, source.characterId);
    assert.equal(entry.forkedFromCharacterId, source.characterId);
    assert.equal(entry.originWorldId, source.originWorldId);
    assert.equal(identity.agentByCharacterId(fork, entry.characterId), person(fork, id));
    assert.equal(identity.agentByCharacterId(fork, source.characterId), undefined);
  }
  for (const [kind, localId, owner] of [
    ["debt", "debt-row"],
    ["transaction", "identity-transfer:transaction"],
    ["command", "identity-transfer"],
    ["thread", "kevin-seed", "kevin"],
  ])
    assert.notDeepEqual(
      identity.townRecordRef(town, kind, localId, owner),
      identity.townRecordRef(fork, kind, localId, owner),
    );
  assert.deepEqual(economy.auditEconomy(fork), []);
  assert.equal(
    transfer(fork).replayed,
    true,
    "local receipts still prevent a duplicate payment within a fork",
  );
  const restored = restore(save.exportTown(fork));
  assert.deepEqual(restored.identityRegistry, fork.identityRegistry);
  assert.deepEqual(restored.favors, fork.favors);
  assert.deepEqual(restored.economy, fork.economy);
  assert.deepEqual(economy.auditEconomy(restored), []);
  person(fork, "kevin").relationships.player.note = "Changed only in the fork.";
  fork.favors[0].text = "Changed only in the fork.";
  assert.deepEqual(town, before, "nested fork data must not alias source data");
});

test("repeated and nested forks preserve the root and historical origins while recording their immediate parent", () => {
  const root = createTown("Ada");
  const first = identity.forkTown(root);
  const sibling = identity.forkTown(root);
  const child = identity.forkTown(first);
  assert.equal(
    new Set([root, first, sibling, child].map((town) => town.identityRegistry.worldId)).size,
    4,
  );
  assert.equal(child.identityRegistry.rootWorldId, root.identityRegistry.worldId);
  assert.equal(child.identityRegistry.parentWorldId, first.identityRegistry.worldId);
  for (const id of AGENT_IDS) {
    assert.equal(
      child.identityRegistry.characters[id].originWorldId,
      root.identityRegistry.characters[id].originWorldId,
    );
    assert.equal(
      child.identityRegistry.characters[id].forkedFromCharacterId,
      first.identityRegistry.characters[id].characterId,
    );
    const ids = [root, first, sibling, child].map(
      (town) => town.identityRegistry.characters[id].characterId,
    );
    assert.equal(new Set(ids).size, 4);
  }
  const mutations = [
    ["partial fork lineage", (registry) => delete registry.characters.kevin.forkedFromCharacterId],
    ["missing parent", (registry) => delete registry.parentWorldId],
    ["self parent", (registry) => (registry.parentWorldId = registry.worldId)],
    [
      "reused source ID",
      (registry) =>
        (registry.characters.kevin.characterId = registry.characters.kevin.forkedFromCharacterId),
    ],
    [
      "crossed source ID",
      (registry) =>
        (registry.characters.baba.characterId = registry.characters.kevin.forkedFromCharacterId),
    ],
    [
      "duplicate source IDs",
      (registry) =>
        (registry.characters.baba.forkedFromCharacterId =
          registry.characters.kevin.forkedFromCharacterId),
    ],
    [
      "rewritten origin",
      (registry) => (registry.characters.kevin.originWorldId = registry.worldId),
    ],
  ];
  for (const [label, mutate] of mutations) {
    const malformed = copy(child.identityRegistry);
    mutate(malformed);
    const before = copy(malformed);
    assert.equal(identity.validateTownIdentity(malformed, AGENT_IDS), false, label);
    assert.deepEqual(malformed, before, `${label}: invalid lineage must not be repaired`);
    const raw = JSON.stringify({ version: 2, town: { ...child, identityRegistry: malformed } });
    const report = save.readTownFile(raw);
    assert.equal(report.status, "unreadable", label);
    assert.equal(report.raw, raw, label);
  }
});

test("reading a legacy browser save adds identities in memory and leaves its original bytes untouched", () => {
  const { data, writes } = storage();
  const raw = JSON.stringify(
    { version: 2, town: withoutIdentity(createTown("Legacy Ada")) },
    null,
    2,
  );
  data.set(save.TOWN_STORAGE_KEY, raw);
  const first = save.readTownSave();
  const second = save.readTownSave();
  assert.equal(first.status, "ready");
  assert.equal(second.status, "ready");
  assertRegistry(first.town.identityRegistry);
  assert.deepEqual(first.town.identityRegistry, second.town.identityRegistry);
  assert.equal(data.get(save.TOWN_STORAGE_KEY), raw);
  assert.equal(writes.length, 0);
  assert.equal(save.readTownConflicts().length, 0);
});

test("the first successful legacy v2 browser save backs up exact original bytes once", async () => {
  const { data } = storage();
  const raw = `\n${JSON.stringify({ version: 2, town: withoutIdentity(createTown("Legacy Ada")) }, null, 2)}\n`;
  data.set(save.TOWN_STORAGE_KEY, raw);
  const report = save.readTownSave();
  assert.equal(report.status, "ready");
  const registry = copy(report.town.identityRegistry);
  assert.equal((await save.persistTownSave(report.town)).ok, true);
  assert.equal(originalBackups(data, raw).length, 1);
  assert.deepEqual(JSON.parse(data.get(save.TOWN_STORAGE_KEY)).town.identityRegistry, registry);
  report.town.day++;
  assert.equal((await save.persistTownSave(report.town)).ok, true);
  const reloaded = save.readTownSave();
  assert.equal(reloaded.status, "ready");
  assert.equal((await save.persistTownSave(reloaded.town)).ok, true);
  assert.equal(
    originalBackups(data, raw).length,
    1,
    "later saves must not duplicate the migration backup",
  );
  assert.deepEqual(reloaded.town.identityRegistry, registry);
});

for (const failure of ["backup", "primary"]) {
  test(`a legacy v2 ${failure} quota failure retains original bytes and retries with the same identities`, async () => {
    const { data, box } = storage();
    const raw = JSON.stringify({ version: 2, town: withoutIdentity(createTown("Legacy Ada")) });
    data.set(save.TOWN_STORAGE_KEY, raw);
    const report = save.readTownSave();
    assert.equal(report.status, "ready");
    const registry = copy(report.town.identityRegistry);
    const write = box.setItem;
    box.setItem = (key, value) => {
      if ((failure === "primary") === (key === save.TOWN_STORAGE_KEY))
        throw new DOMException("Full", "QuotaExceededError");
      write(key, value);
    };
    const failed = await save.persistTownSave(report.town);
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "quota");
    assert.equal(data.get(save.TOWN_STORAGE_KEY), raw);
    assert.deepEqual(report.town.identityRegistry, registry);
    box.setItem = write;
    assert.equal((await save.persistTownSave(report.town)).ok, true);
    assert.equal(originalBackups(data, raw).length, 1);
    assert.deepEqual(restore(data.get(save.TOWN_STORAGE_KEY)).identityRegistry, registry);
  });
}

test("reloading after a migration primary-write failure reuses the existing exact-raw backup", async () => {
  const { data, box } = storage();
  const raw = JSON.stringify({ version: 2, town: withoutIdentity(createTown("Legacy Ada")) });
  data.set(save.TOWN_STORAGE_KEY, raw);
  const first = save.readTownSave();
  assert.equal(first.status, "ready");
  const registry = copy(first.town.identityRegistry);
  const write = box.setItem;
  box.setItem = (key, value) => {
    if (key === save.TOWN_STORAGE_KEY) throw new DOMException("Full", "QuotaExceededError");
    write(key, value);
  };
  assert.equal((await save.persistTownSave(first.town)).reason, "quota");
  assert.equal(data.get(save.TOWN_STORAGE_KEY), raw);
  assert.equal(originalBackups(data, raw).length, 1);
  const reloaded = save.readTownSave();
  assert.equal(reloaded.status, "ready");
  assert.notEqual(reloaded.town, first.town);
  assert.deepEqual(reloaded.town.identityRegistry, registry);
  box.setItem = write;
  assert.equal((await save.persistTownSave(reloaded.town)).ok, true);
  assert.equal(
    originalBackups(data, raw).length,
    1,
    "a new runtime town reuses the durable backup",
  );
  assert.deepEqual(restore(data.get(save.TOWN_STORAGE_KEY)).identityRegistry, registry);
});

test("a stale legacy migration cannot overwrite a town saved by another tab", async () => {
  const { data } = storage();
  const original = JSON.stringify({ version: 2, town: withoutIdentity(createTown("Legacy Ada")) });
  data.set(save.TOWN_STORAGE_KEY, original);
  const report = save.readTownSave();
  assert.equal(report.status, "ready");
  const registry = copy(report.town.identityRegistry);
  const newer = save.exportTown(createTown("Other tab"));
  data.set(save.TOWN_STORAGE_KEY, newer);
  const result = await save.persistTownSave(report.town);
  assert.equal(result.reason, "conflict");
  assert.equal(result.storedRaw, newer);
  assert.equal(data.get(save.TOWN_STORAGE_KEY), newer);
  assert.deepEqual(restore(result.localRaw).identityRegistry, registry);
  assert.deepEqual(report.town.identityRegistry, registry);
});

test("legacy v1 browser migration retains its original key without requiring a redundant backup", async () => {
  const { data, box } = storage();
  const raw = JSON.stringify({ version: 1, town: legacyFixture }, null, 2);
  data.set(save.LEGACY_TOWN_STORAGE_KEY, raw);
  const write = box.setItem;
  box.setItem = (key, value) => {
    if (key.startsWith(`${save.TOWN_BACKUP_PREFIX}identity:`))
      throw new DOMException("No room for a redundant legacy copy", "QuotaExceededError");
    write(key, value);
  };
  const report = save.readTownSave();
  assert.equal(report.status, "ready");
  const registry = copy(report.town.identityRegistry);
  assert.equal((await save.persistTownSave(report.town)).ok, true);
  assert.equal(data.get(save.LEGACY_TOWN_STORAGE_KEY), raw);
  assert.equal(
    [...data.keys()].filter((key) => key.startsWith(`${save.TOWN_BACKUP_PREFIX}identity:`)).length,
    0,
    "the retained legacy key is already the exact original backup",
  );
  assert.deepEqual(restore(data.get(save.TOWN_STORAGE_KEY)).identityRegistry, registry);
  assert.deepEqual(save.readTownSave().town.identityRegistry, registry);
});
