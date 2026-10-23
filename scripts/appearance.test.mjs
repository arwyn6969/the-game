import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  APPEARANCE_KEY,
  DEFAULT_SKIN,
  initialAppearance,
  isSkin,
  SKINS,
} from "../src/components/town/appearance/skins.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else delete globalThis.window;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else delete globalThis.localStorage;
});

function browser(search = "", stored = null) {
  const reads = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { search } },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key) {
        reads.push(key);
        return key === APPEARANCE_KEY ? stored : null;
      },
      setItem() {
        throw new Error("Initial appearance must not write browser storage");
      },
    },
  });
  return reads;
}

test("a clean game URL opens Hobbs Hearth without an opt-in query", () => {
  const reads = browser();
  assert.equal(DEFAULT_SKIN, "hobbs-hearth");
  assert.deepEqual(initialAppearance(), { skin: "hobbs-hearth" });
  assert.deepEqual(reads, [APPEARANCE_KEY]);
});

test("server initialization uses the same Hearth default without browser globals", () => {
  delete globalThis.window;
  delete globalThis.localStorage;
  assert.deepEqual(initialAppearance(), { skin: "hobbs-hearth" });
});

for (const skin of SKINS) {
  test(`saved ${skin.name} remains available on the normal game URL`, () => {
    browser("", skin.id);
    assert.deepEqual(initialAppearance(), { skin: skin.id });
  });
}

test("an explicit valid URL skin takes precedence over the saved preference", () => {
  const reads = browser("?skin=original", "library-ink");
  assert.deepEqual(initialAppearance(), { skin: "original" });
  assert.deepEqual(reads, []);
});

test("an invalid URL skin falls back to a valid saved preference", () => {
  browser("?skin=unknown", "library-ink");
  assert.deepEqual(initialAppearance(), { skin: "library-ink" });
});

test("invalid URL and stored values fall back to Hearth", () => {
  for (const value of [null, "", "unknown", "[object Object]", "Hobbs Hearth"]) {
    browser("?skin=unknown", value);
    assert.deepEqual(initialAppearance(), { skin: "hobbs-hearth" });
  }
});

test("legacy preview flags do not change the normal default or saved preference", () => {
  for (const flag of ["0", "1"]) {
    browser(`?uiPreview=${flag}`);
    assert.deepEqual(initialAppearance(), { skin: "hobbs-hearth" });
    browser(`?uiPreview=${flag}`, "original");
    assert.deepEqual(initialAppearance(), { skin: "original" });
  }
});

test("denied storage reads leave the Hearth default usable", () => {
  browser();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        throw new DOMException("Denied", "SecurityError");
      },
    },
  });
  assert.deepEqual(initialAppearance(), { skin: "hobbs-hearth" });
});

test("a denied storage property still permits the default and URL override", () => {
  browser();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("Denied", "SecurityError");
    },
  });
  assert.deepEqual(initialAppearance(), { skin: "hobbs-hearth" });
  window.location.search = "?skin=plaza-cream";
  assert.deepEqual(initialAppearance(), { skin: "plaza-cream" });
});

test("only published skin IDs are accepted as preferences", () => {
  for (const skin of SKINS) assert.equal(isSkin(skin.id), true);
  for (const value of [undefined, null, "", "Hobbs Hearth", "constructor", {}, ["original"]])
    assert.equal(isSkin(value), false);
});
