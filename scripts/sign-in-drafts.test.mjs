import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearSignInDrafts,
  readSignInDrafts,
  saveSignInDrafts,
} from "../src/components/town/sign-in-drafts.ts";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("OAuth draft recovery stays in the same town and preserves each unsent line", () => {
  const tab = storage();
  const drafts = { kevin: "Unsent line", northern: "Another unsent line" };
  saveSignInDrafts("world-one", drafts, tab);
  assert.deepEqual(readSignInDrafts("world-two", tab), {});
  assert.deepEqual(readSignInDrafts(undefined, tab), {});
  assert.deepEqual(readSignInDrafts("world-one", tab), drafts);
  clearSignInDrafts(tab);
  assert.deepEqual(readSignInDrafts("world-one", tab), {});
});

test("old or malformed draft snapshots never replace current input", (t) => {
  const tab = storage();
  t.mock.method(Date, "now", () => 1000);
  saveSignInDrafts("world-one", { kevin: "Unsent" }, tab);
  t.mock.method(Date, "now", () => 1000 + 30 * 60_000);
  assert.deepEqual(readSignInDrafts("world-one", tab), {});
  tab.setItem("the-game-sign-in-drafts", "broken JSON");
  assert.deepEqual(readSignInDrafts("world-one", tab), {});
});

test("blocked storage prevents the sign-in snapshot instead of claiming a saved draft", () => {
  const blocked = {
    setItem() {
      throw new Error("Storage unavailable");
    },
  };
  assert.throws(() => saveSignInDrafts("world-one", { kevin: "Still here" }, blocked));
});
