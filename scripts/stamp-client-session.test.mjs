import assert from "node:assert/strict";
import { after, test } from "node:test";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else delete globalThis.window;
});
let moduleId = 0;
const fresh = () => import(`../src/lib/stamps/client-session.ts?test=${++moduleId}`);
const scope = (n = 1) => ({
  worldId: `world_${"a".repeat(64)}`,
  characterId: `character_${n.toString(16).padStart(64, "0")}`,
});
function storageFixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storage },
  });
  return { data, storage };
}

test("local disconnect suppression is scoped and explicit reconnect clears only that scope", async () => {
  const { data } = storageFixture();
  const { isStampSuppressed, setStampSuppressed } = await fresh();
  assert.equal(isStampSuppressed(scope()), false);
  setStampSuppressed(scope(), true);
  setStampSuppressed(scope(2), true);
  assert.equal(isStampSuppressed(scope()), true);
  assert.equal(isStampSuppressed({ ...scope(), worldId: `world_${"b".repeat(64)}` }), false);
  setStampSuppressed(scope(), false);
  assert.equal(isStampSuppressed(scope()), false);
  assert.equal(isStampSuppressed(scope(2)), true);
  assert.deepEqual(JSON.parse([...data.values()][0]), [
    `${scope(2).worldId}:${scope(2).characterId}`,
  ]);
});

test("the disconnect preference survives a fresh client module without storing wallet data", async () => {
  const { data } = storageFixture();
  const first = await fresh();
  first.setStampSuppressed(scope(), true);
  const reloaded = await fresh();
  assert.equal(reloaded.isStampSuppressed(scope()), true);
  const values = JSON.parse([...data.values()][0]);
  assert.equal(values.length, 1);
  assert.match(values[0], /^world_[0-9a-f]{64}:character_[0-9a-f]{64}$/);
  assert.equal([...data.values()][0].includes("address"), false);
  assert.equal([...data.values()][0].includes("proof"), false);
  assert.equal([...data.values()][0].includes("data:image"), false);
});

test("the suppression set remains bounded and retains the most recent 64 scopes", async () => {
  const { data } = storageFixture();
  const client = await fresh();
  for (let n = 1; n <= 64; n++) client.setStampSuppressed(scope(n), true);
  client.setStampSuppressed(scope(1), true);
  client.setStampSuppressed(scope(65), true);
  assert.equal(client.isStampSuppressed(scope(1)), true);
  assert.equal(client.isStampSuppressed(scope(2)), false);
  assert.equal(client.isStampSuppressed(scope(65)), true);
  assert.equal(JSON.parse([...data.values()][0]).length, 64);
});

test("blocked or full session storage cannot undo this tab's disconnect intent", async () => {
  const { storage } = storageFixture();
  storage.getItem = () => {
    throw new Error("Storage blocked");
  };
  storage.setItem = () => {
    throw new DOMException("Full", "QuotaExceededError");
  };
  const client = await fresh();
  assert.doesNotThrow(() => client.setStampSuppressed(scope(), true));
  assert.equal(client.isStampSuppressed(scope()), true);
  client.setStampSuppressed(scope(), false);
  assert.equal(client.isStampSuppressed(scope()), false);
});

test("malformed storage and invalid scope keys do not import unrelated preferences", async () => {
  for (const raw of [
    "{",
    JSON.stringify({ address: "untrusted" }),
    JSON.stringify(["arbitrary"]),
    JSON.stringify(Array(65).fill(`${scope().worldId}:${scope().characterId}`)),
  ]) {
    const { data } = storageFixture();
    data.set("the-game-stamp-suppressed-v1", raw);
    const client = await fresh();
    assert.equal(client.isStampSuppressed(scope()), false);
    client.setStampSuppressed({ ...scope(), characterId: "player" }, true);
    assert.equal(client.isStampSuppressed(scope()), false);
  }
});

test("server rendering never retains client suppression state", async () => {
  delete globalThis.window;
  const client = await fresh();
  client.setStampSuppressed(scope(), true);
  assert.equal(client.isStampSuppressed(scope()), false);
  storageFixture();
  assert.equal(client.isStampSuppressed(scope()), false);
});

test("a session polling hint starts absent and persists only the opted-in scope across reload", async () => {
  const { data } = storageFixture();
  const client = await fresh();
  assert.equal(client.hasStampSession(scope()), false);
  client.rememberStampSession(scope(), true);
  assert.equal(client.hasStampSession(scope()), true);
  assert.equal(client.hasStampSession(scope(2)), false);
  assert.equal(client.hasStampSession({ ...scope(), worldId: `world_${"b".repeat(64)}` }), false);
  const reloaded = await fresh();
  assert.equal(reloaded.hasStampSession(scope()), true);
  assert.deepEqual(JSON.parse(data.get("the-game-stamp-sessions-v1")), [
    `${scope().worldId}:${scope().characterId}`,
  ]);
  for (const value of JSON.parse(data.get("the-game-stamp-sessions-v1")))
    assert.match(value, /^world_[0-9a-f]{64}:character_[0-9a-f]{64}$/);
  assert.equal(data.get("the-game-stamp-sessions-v1").includes("address"), false);
  assert.equal(data.get("the-game-stamp-sessions-v1").includes("proof"), false);
  assert.equal(data.get("the-game-stamp-sessions-v1").includes("data:image"), false);
});

test("forgetting a disconnected session hint does not undo local appearance suppression", async () => {
  storageFixture();
  const client = await fresh();
  client.rememberStampSession(scope(), true);
  client.rememberStampSession(scope(2), true);
  client.setStampSuppressed(scope(), true);
  client.rememberStampSession(scope(), false);
  assert.equal(client.hasStampSession(scope()), false);
  assert.equal(client.hasStampSession(scope(2)), true);
  assert.equal(client.isStampSuppressed(scope()), true);
});

test("session polling hints are bounded to the most recent 64 scopes independently of suppression", async () => {
  const { data } = storageFixture();
  const client = await fresh();
  client.setStampSuppressed(scope(2), true);
  for (let n = 1; n <= 64; n++) client.rememberStampSession(scope(n), true);
  client.rememberStampSession(scope(1), true);
  client.rememberStampSession(scope(65), true);
  assert.equal(client.hasStampSession(scope(1)), true);
  assert.equal(client.hasStampSession(scope(2)), false);
  assert.equal(client.hasStampSession(scope(65)), true);
  assert.equal(client.isStampSuppressed(scope(2)), true);
  assert.equal(JSON.parse(data.get("the-game-stamp-sessions-v1")).length, 64);
});

test("wallet changes retain a bounded fresh-verification reason across reload without wallet data", async () => {
  const { data } = storageFixture();
  const client = await fresh();
  client.setStampSuppressed(scope(), true);
  for (let n = 1; n <= 64; n++) client.setStampVerificationRequired(scope(n), true);
  client.setStampVerificationRequired(scope(1), true);
  client.setStampVerificationRequired(scope(65), true);
  const reloaded = await fresh();
  assert.equal(reloaded.isStampVerificationRequired(scope(1)), true);
  assert.equal(reloaded.isStampVerificationRequired(scope(2)), false);
  assert.equal(reloaded.isStampVerificationRequired(scope(65)), true);
  assert.equal(
    reloaded.isStampVerificationRequired({ ...scope(), worldId: `world_${"b".repeat(64)}` }),
    false,
  );
  assert.equal(reloaded.isStampSuppressed(scope()), true);
  const stored = data.get("the-game-stamp-verification-required-v1");
  const values = JSON.parse(stored);
  assert.equal(values.length, 64);
  for (const value of values)
    assert.match(value, /^world_[0-9a-f]{64}:character_[0-9a-f]{64}$/);
  assert.doesNotMatch(stored, /address|proof|signature|data:image|wonder|leather/);
});

test("clearing the fresh-verification reason preserves a failed-disconnect suppression latch", async () => {
  storageFixture();
  const client = await fresh();
  client.setStampSuppressed(scope(), true);
  client.setStampVerificationRequired(scope(), true);
  client.setStampVerificationRequired(scope(2), true);
  // Explicit disconnect clears the wallet-change reason before attempting the service call.
  client.setStampVerificationRequired(scope(), false);
  const reloaded = await fresh();
  assert.equal(reloaded.isStampSuppressed(scope()), true);
  assert.equal(reloaded.isStampVerificationRequired(scope()), false);
  assert.equal(reloaded.isStampVerificationRequired(scope(2)), true);
  assert.equal(reloaded.hasStampSession(scope()), false);
});

test("fresh-verification flags reject malformed storage and stay local when storage is blocked", async () => {
  const { data, storage } = storageFixture();
  data.set("the-game-stamp-verification-required-v1", JSON.stringify(["untrusted-address"]));
  const client = await fresh();
  assert.equal(client.isStampVerificationRequired(scope()), false);
  client.setStampVerificationRequired({ ...scope(), characterId: "player" }, true);
  assert.equal(client.isStampVerificationRequired(scope()), false);
  storage.setItem = () => {
    throw new DOMException("Full", "QuotaExceededError");
  };
  assert.doesNotThrow(() => client.setStampVerificationRequired(scope(), true));
  assert.equal(client.isStampVerificationRequired(scope()), true);
  delete globalThis.window;
  const server = await fresh();
  server.setStampVerificationRequired(scope(), true);
  assert.equal(server.isStampVerificationRequired(scope()), false);
});
