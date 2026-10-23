import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { cloudflareStampPng } from "../src/lib/stamps/cloudflare-image.server.ts";

test("hosted stamp decoding checks dimensions and produces a still padded PNG", async () => {
  const before = globalThis.__env__;
  const png = await sharp({
    create: { width: 256, height: 256, channels: 4, background: "transparent" },
  })
    .png()
    .toBuffer();
  let transforms = 0;
  let metadata = { format: "png", width: 20, height: 10 };
  globalThis.__env__ = {
    IMAGES: {
      info: async () => metadata,
      input: () => ({
        transform: (options) => {
          transforms++;
          assert.deepEqual(options, {
            width: 256,
            height: 256,
            fit: "pad",
            background: "transparent",
          });
          return {
            output: async (options) => {
              assert.deepEqual(options, { format: "image/png", anim: false });
              return {
                response: () => new Response(png, { headers: { "content-type": "image/png" } }),
              };
            },
          };
        },
      }),
    },
  };
  try {
    assert.deepEqual(await cloudflareStampPng(png, "image/png"), png);
    for (const invalid of [
      { format: "svg", width: 20, height: 10 },
      { format: "png", width: 4096, height: 10 },
      { format: "png", width: 2048, height: 2048 },
      { format: "png", width: 0, height: 10 },
      { format: "png", width: 20.5, height: 10 },
    ]) {
      metadata = invalid;
      await assert.rejects(cloudflareStampPng(png, "image/png"), /dimensions/);
    }
    assert.equal(transforms, 1);
    globalThis.__env__ = {};
    await assert.rejects(cloudflareStampPng(png, "image/png"), /binding is unavailable/);
  } finally {
    if (before === undefined) delete globalThis.__env__;
    else globalThis.__env__ = before;
  }
});
