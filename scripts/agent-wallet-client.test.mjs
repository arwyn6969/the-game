import assert from "node:assert/strict";
import { after, test } from "node:test";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
after(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else delete globalThis.window;
});
let version = 0;
const fresh = () => import(`../src/lib/agent-wallets/client-state.ts?test=${++version}`);
const OWNER = "test-owner-account-one";
const OTHER = "test-owner-account-two";
const STORAGE_KEY = "the-game-agent-owner-hidden-v1";
function storage() {
  const values = new Map();
  const box = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: box },
  });
  return { values, box };
}

test("owner privacy starts visible and a sign-out latch affects only that owner", async () => {
  storage();
  const client = await fresh();
  assert.equal(client.isAgentOwnerHidden(OWNER), false);
  client.setAgentOwnerHidden(OWNER, true);
  assert.equal(client.isAgentOwnerHidden(OWNER), true);
  assert.equal(client.isAgentOwnerHidden(OTHER), false);
});

test("the privacy latch survives panel remounts and fresh modules without storing wallet or session data", async () => {
  const { values } = storage();
  const client = await fresh();
  client.setAgentOwnerHidden(OWNER, true);
  for (let pass = 0; pass < 3; pass++) {
    const reloaded = await fresh();
    assert.equal(reloaded.isAgentOwnerHidden(OWNER), true);
    assert.equal(reloaded.isAgentOwnerHidden(OTHER), false);
  }
  const raw = values.get(STORAGE_KEY);
  const entries = JSON.parse(raw);
  assert.equal(entries.length, 1);
  assert.match(entries[0], /^[0-9a-f]{64}$/);
  for (const forbidden of [OWNER, "address", "token", "proof", "wallet", "data:image"])
    assert.equal(raw.includes(forbidden), false);
});

test("explicit recovery clears only the recovered owner's local latch", async () => {
  const { values } = storage();
  const client = await fresh();
  client.setAgentOwnerHidden(OWNER, true);
  client.setAgentOwnerHidden(OTHER, true);
  client.setAgentOwnerHidden(OWNER, false);
  assert.equal(client.isAgentOwnerHidden(OWNER), false);
  assert.equal(client.isAgentOwnerHidden(OTHER), true);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).length, 1);
  const reloaded = await fresh();
  assert.equal(reloaded.isAgentOwnerHidden(OWNER), false);
  assert.equal(reloaded.isAgentOwnerHidden(OTHER), true);
});

test("privacy is bounded to the 64 most recently hidden owner IDs", async () => {
  const { values } = storage();
  const client = await fresh();
  for (let index = 0; index < 64; index++) client.setAgentOwnerHidden(`owner-${index}`, true);
  client.setAgentOwnerHidden("owner-0", true);
  client.setAgentOwnerHidden("owner-64", true);
  assert.equal(client.isAgentOwnerHidden("owner-0"), true);
  assert.equal(client.isAgentOwnerHidden("owner-1"), false);
  assert.equal(client.isAgentOwnerHidden("owner-64"), true);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).length, 64);
});

test("blocked or full session storage still keeps this page's sign-out intent in memory", async () => {
  const { box } = storage();
  box.getItem = () => {
    throw new Error("Storage unavailable");
  };
  box.setItem = () => {
    throw new DOMException("Storage full", "QuotaExceededError");
  };
  const client = await fresh();
  assert.doesNotThrow(() => client.setAgentOwnerHidden(OWNER, true));
  assert.equal(client.isAgentOwnerHidden(OWNER), true);
  client.setAgentOwnerHidden(OWNER, false);
  assert.equal(client.isAgentOwnerHidden(OWNER), false);
});

test("invalid owner IDs never become privacy preferences or stored authority", async () => {
  const { values } = storage();
  const client = await fresh();
  for (const owner of [
    null,
    undefined,
    {},
    [],
    3,
    "",
    " ",
    "dev-user",
    " owner",
    "owner ",
    "owner\n",
    "x".repeat(257),
  ]) {
    client.setAgentOwnerHidden(owner, true);
    assert.equal(client.isAgentOwnerHidden(owner), false);
  }
  assert.equal(values.size, 0);
});

test("malformed, oversized and non-ID storage is ignored without granting anything", async () => {
  for (const raw of [
    "{",
    "null",
    JSON.stringify({ owner: OWNER }),
    JSON.stringify([OWNER]),
    JSON.stringify(Array(65).fill("a".repeat(64))),
    JSON.stringify(["A".repeat(64)]),
    "x".repeat(5001),
  ]) {
    const { values } = storage();
    values.set(STORAGE_KEY, raw);
    const client = await fresh();
    assert.equal(client.isAgentOwnerHidden(OWNER), false);
    client.setAgentOwnerHidden(OTHER, true);
    assert.equal(client.isAgentOwnerHidden(OTHER), true);
    assert.equal(client.isAgentOwnerHidden(OWNER), false);
  }
});

test("server execution never retains an owner's browser privacy state", async () => {
  delete globalThis.window;
  const client = await fresh();
  client.setAgentOwnerHidden(OWNER, true);
  assert.equal(client.isAgentOwnerHidden(OWNER), false);
  storage();
  assert.equal(client.isAgentOwnerHidden(OWNER), false);
});
