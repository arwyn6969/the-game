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
const { stampArt } = await server.ssrLoadModule("/src/game/stamp-art.ts");
const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
after(async () => {
  if (original) Object.defineProperty(globalThis, "Image", original);
  else delete globalThis.Image;
  await server.close();
});
const loaded = [];
class FakeImage {
  naturalWidth = 256;
  naturalHeight = 256;
  set src(value) {
    this.source = value;
    loaded.push(this);
  }
}
Object.defineProperty(globalThis, "Image", { configurable: true, value: FakeImage });
const appearance = (n, extra = {}) => ({
  worldId: `world_${"a".repeat(64)}`,
  characterId: `character_${"b".repeat(64)}`,
  cpid: "ASTAMP",
  stampNumber: 1,
  title: "Stamp #1",
  mode: "head",
  crop: { x: 0, y: 0, size: 1 },
  pngDataUrl: "data:image/png;base64,AAAA",
  contentHash: n.toString(16).padStart(64, "0"),
  verifiedAt: Date.now() - 1000,
  expiresAt: Date.now() + 60_000,
  ...extra,
});
test("renderer falls back until safe square pixels finish loading and reuses decoded pixels", () => {
  const art = appearance(1);
  assert.equal(stampArt(art), null);
  const image = loaded.at(-1);
  assert.equal(image.source, art.pngDataUrl);
  image.onload();
  assert.equal(stampArt(art), image);
  assert.equal(stampArt({ ...art, crop: { x: 0.25, y: 0.25, size: 0.5 } }), image);
  assert.equal(stampArt({ ...art, pngDataUrl: "data:image/png;base64,BBBB" }), null);
});
test("expired, malformed or external image sources never reach Image", () => {
  const before = loaded.length;
  for (const value of [
    null,
    appearance(2, { expiresAt: Date.now() - 1 }),
    appearance(3, { pngDataUrl: "https://example.com/head.png" }),
    appearance(4, { pngDataUrl: "data:image/svg+xml;base64,AAAA" }),
    appearance(5, { crop: { x: 1, y: 0, size: 1 } }),
  ])
    assert.equal(stampArt(value), null);
  assert.equal(loaded.length, before);
});
test("wrong-sized decoded pixels retain the original head", () => {
  const art = appearance(6);
  stampArt(art);
  const image = loaded.at(-1);
  image.naturalWidth = 1024;
  image.onload();
  assert.equal(stampArt(art), null);
});
test("renderer cache is bounded and evicts the oldest decoded image", () => {
  const art = appearance(100);
  stampArt(art);
  const first = loaded.at(-1);
  first.onload();
  for (let n = 101; n <= 125; n++) stampArt(appearance(n));
  assert.equal(stampArt(art), null);
  assert.notEqual(loaded.at(-1), first);
});
