import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const api = await server.ssrLoadModule("/src/lib/stamps/stampchain.server.ts");
const media = await server.ssrLoadModule("/src/lib/stamps/media.server.ts");
const { stampChooseSchema, stampPreviewSchema, isStampAppearance } = await server.ssrLoadModule(
  "/src/lib/stamps/validation.ts",
);
const address = "1GotRejB6XsGgMsM79TvcypeanDJRJbMtg";
let serial = 50_000;
const hash = (number) => BigInt(number).toString(16).padStart(64, "0");
function row(number = ++serial, extra = {}) {
  return {
    cpid: `A${String(number).padStart(4, "0")}`,
    stamp: number,
    tx_hash: hash(number),
    stamp_url: `https://stampchain.io/stamps/${hash(number)}.png`,
    stamp_mimetype: "image/png",
    balance: 1,
    supply: 100,
    divisible: 0,
    locked: 1,
    address,
    unbound_quantity: 1,
    utxos: [],
    ...extra,
  };
}
function asset(extra = {}) {
  const source = row();
  return {
    cpid: source.cpid,
    stampNumber: source.stamp,
    quantity: "1",
    supply: "100",
    divisible: false,
    locked: true,
    title: `Stamp #${source.stamp}`,
    mediaUrl: source.stamp_url,
    mediaType: source.stamp_mimetype,
    ...extra,
  };
}
function envelope(rows, { page = 1, limit = 24, total = rows.length, block = 900_000 } = {}) {
  return {
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    total,
    last_block: block,
    data: rows,
  };
}
const json = (value, headers = {}) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", ...headers },
  });
const fetchJson = (value) => async () => json(value);
const png = await sharp({ create: { width: 40, height: 20, channels: 4, background: "#ff0000" } })
  .png()
  .toBuffer();
const imageResponse = (bytes = png, mime = "image/png", extra = {}) =>
  new Response(bytes, {
    headers: { "content-type": mime },
    ...extra,
  });

test("holdings use a fixed GET route, 24-row pages and lossless whole-edition quantities", async () => {
  const rows = [row(10, { balance: "18446744073709551615", supply: "18446744073709551615" })];
  const calls = [];
  const result = await api.listStampHoldings(address, 1, {
    fetch: async (url, options) => {
      calls.push({ url, options });
      return json(envelope(rows));
    },
  });
  assert.equal(
    calls[0].url,
    `https://stampchain.io/api/v2/stamps/balance/${address}?limit=24&page=1`,
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.cache, "no-store");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(result.assets[0].quantity, "18446744073709551615");
  assert.equal(result.assets[0].supply, "18446744073709551615");
  assert.equal(result.assets[0].cpid, rows[0].cpid);
  assert.equal(result.total, 1);
  assert.equal(result.indexedBlock, 900_000);
});

test("each page retains total counts and explicitly counts unsupported holdings", async () => {
  const unsafe = [
    row(11, { stamp_mimetype: "image/svg+xml", stamp_url: "https://stampchain.io/stamps/bad.svg" }),
    row(12, { divisible: 1, balance: "0.2" }),
    row(13, { balance: 0 }),
    row(14, { stamp_mimetype: "text/html" }),
  ];
  const rows = [row(15), ...unsafe];
  const result = await api.listStampHoldings(address, 2, {
    fetch: fetchJson(envelope(rows, { page: 2, total: 29 })),
  });
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.total, 29);
  assert.equal(result.assets.length, 1);
  assert.equal(result.unsupported, 4);
});

test("listed identities satisfy the same preview, selection and appearance schemas", async () => {
  const scope = { worldId: `world_${"a".repeat(64)}`, characterId: `character_${"b".repeat(64)}` };
  const longCpid = `ABCD.${"x".repeat(160)}`;
  const rows = [
    row(80),
    row(81, { cpid: "ABCD.valid_Sub-asset" }),
    row(82, { cpid: longCpid, stamp: null }),
  ];
  const result = await api.listStampHoldings(address, 1, { fetch: fetchJson(envelope(rows)) });
  assert.equal(result.assets.length, rows.length);
  assert.equal(
    result.assets[2].cpid,
    longCpid,
    "the reference must remain lossless even when its display title is shortened",
  );
  assert.equal(result.assets[2].title.length, 160);
  for (const holding of result.assets) {
    assert.equal(stampPreviewSchema.safeParse({ scope, cpid: holding.cpid }).success, true);
    assert.equal(
      stampChooseSchema.safeParse({
        scope,
        cpid: holding.cpid,
        mode: "head",
        crop: { x: 0, y: 0, size: 1 },
      }).success,
      true,
    );
    assert.equal(
      isStampAppearance({
        ...scope,
        cpid: holding.cpid,
        stampNumber: holding.stampNumber,
        title: holding.title,
        mode: "head",
        crop: { x: 0, y: 0, size: 1 },
        pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
        contentHash: createHash("sha256").update(png).digest("hex"),
        verifiedAt: 1,
        expiresAt: 2,
      }),
      true,
    );
  }
});

test("well-formed unsupported identities and negative stamp numbers are counted but never offered", async () => {
  const unsupported = ["Abcd", "ABCD.sub@asset", `ABCD.${"x".repeat(161)}`, "A".repeat(40)];
  const rows = [
    ...unsupported.map((cpid, index) => row(90 + index, { cpid })),
    row(99, { stamp: -1 }),
  ];
  const result = await api.listStampHoldings(address, 1, { fetch: fetchJson(envelope(rows)) });
  assert.equal(result.unsupported, rows.length);
  assert.deepEqual(result.assets, []);
  let calls = 0;
  for (const cpid of unsupported)
    await assert.rejects(
      api.findStampHolding(address, cpid, {
        fetch: async () => {
          calls++;
          return json(envelope([]));
        },
      }),
      /supported stamp asset identity/,
    );
  assert.equal(calls, 0);
});

test("empty holdings are distinct from an unavailable or malformed response", async () => {
  const empty = await api.listStampHoldings(address, 1, { fetch: fetchJson(envelope([])) });
  assert.deepEqual(empty.assets, []);
  assert.equal(empty.total, 0);
  await assert.rejects(
    api.listStampHoldings(address, 1, { fetch: async () => new Response("Down", { status: 503 }) }),
  );
  await assert.rejects(
    api.listStampHoldings(address, 1, { fetch: fetchJson({ error: "stale index" }) }),
  );
  await assert.rejects(
    api.listStampHoldings(address, 1, {
      fetch: async () =>
        new Response("<html>", { headers: { "content-type": "application/json" } }),
    }),
  );
});

test("invalid addresses and pages never reach the network", async () => {
  let calls = 0;
  const options = {
    fetch: async () => {
      calls++;
      return json(envelope([]));
    },
  };
  for (const value of ["", "https://evil.test/", `${address}?x=1`, "bc1qbad", "../metadata"])
    await assert.rejects(api.listStampHoldings(value, 1, options));
  for (const value of [0, -1, 1.5, Infinity, 100_001])
    await assert.rejects(api.listStampHoldings(address, value, options));
  assert.equal(calls, 0);
});

test("unsafe quantities, wrong owners, duplicate CPIDs and malformed pagination fail closed", async () => {
  for (const balance of [
    Number.MAX_SAFE_INTEGER + 1,
    -1,
    0.5,
    "1e2",
    "01",
    "18446744073709551616",
    null,
  ])
    await assert.rejects(
      api.listStampHoldings(address, 1, { fetch: fetchJson(envelope([row(20, { balance })])) }),
    );
  for (const value of [
    envelope([row(21, { address: "someone else" })]),
    envelope([row(21), row(21)]),
    envelope([row(21, { tx_hash: hash(22) })]),
    envelope([row(21, { cpid: "A1/../../evil" })]),
    { ...envelope([row(21)]), page: 2 },
    { ...envelope([row(21)]), totalPages: 9 },
    { ...envelope([row(21)]), last_block: 0 },
    { ...envelope([row(21)]), limit: 100 },
    envelope([], { total: 1 }),
  ])
    await assert.rejects(api.listStampHoldings(address, 1, { fetch: fetchJson(value) }));
});

test("ownership is freshly checked across pages and never calls an incomplete scan not-held", async () => {
  const calls = [];
  const options = {
    fetch: async (url) => {
      calls.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      const rows = Array.from({ length: page === 1 ? 100 : 1 }, (_, i) => row(page * 1000 + i));
      return json(envelope(rows, { page, limit: 100, total: 101 }));
    },
  };
  assert.equal((await api.findStampHolding(address, "A2000", options)).cpid, "A2000");
  assert.equal(calls.length, 2);
  assert.equal(await api.findStampHolding(address, "A9000", options), null);
  assert.equal(calls.length, 4, "ownership must not reuse an earlier holdings cache");
  let scans = 0;
  await assert.rejects(
    api.findStampHolding(address, "A999999", {
      fetch: async (url) => {
        scans++;
        const page = Number(new URL(url).searchParams.get("page"));
        return json(
          envelope(
            Array.from({ length: 100 }, (_, i) => row(page * 1000 + i)),
            { page, limit: 100, total: 1001 },
          ),
        );
      },
    }),
    /remaining stamps were not checked/,
  );
  assert.equal(scans, 10);
});

test("a stale or moving ownership snapshot cannot produce a negative result", async () => {
  await assert.rejects(
    api.findStampHolding(address, "A999999", {
      fetch: async (url) => {
        const page = Number(new URL(url).searchParams.get("page"));
        return json(
          envelope(
            Array.from({ length: page === 1 ? 100 : 1 }, (_, i) => row(page * 1000 + i)),
            {
              page,
              limit: 100,
              total: 101,
              block: page === 1 ? 900_000 : 899_999,
            },
          ),
        );
      },
    }),
    /changed while checking/,
  );
});

test("response content type, advertised and streamed byte bounds and redirects are enforced", async () => {
  const tooLarge = new Uint8Array(api.STAMP_MAX_RESPONSE_BYTES + 1);
  for (const response of [
    new Response("{}", { headers: { "content-type": "text/html" } }),
    json(envelope([]), { "content-length": "1048577" }),
    new Response(tooLarge, { headers: { "content-type": "application/json" } }),
    new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }),
  ])
    await assert.rejects(api.listStampHoldings(address, 1, { fetch: async () => response }));
  const redirected = json(envelope([]));
  Object.defineProperty(redirected, "redirected", { value: true });
  await assert.rejects(api.listStampHoldings(address, 1, { fetch: async () => redirected }));
});

test("an unresponsive fetch is bounded by the eight-second request deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const work = api.listStampHoldings(address, 1, { fetch: () => new Promise(() => {}) });
  const rejected = assert.rejects(work, /timed out/);
  t.mock.timers.tick(8000);
  await rejected;
  t.mock.timers.reset();
});

test("only exact Stampchain raster URLs with matching MIME are eligible", async () => {
  const source = row(30);
  const badUrls = [
    source.stamp_url.replace("https:", "http:"),
    source.stamp_url.replace("stampchain.io", "stampchain.io.evil.test"),
    source.stamp_url.replace("stampchain.io", "127.0.0.1"),
    source.stamp_url.replace("stampchain.io", "user:pass@stampchain.io"),
    source.stamp_url.replace("stampchain.io", "stampchain.io:443"),
    `${source.stamp_url}?foo=1`,
    `${source.stamp_url}#foo`,
    source.stamp_url.replace("/stamps/", "/stamps/../stamps/"),
    source.stamp_url.replace(".png", ".svg"),
  ];
  let calls = 0;
  for (const url of badUrls) {
    assert.equal(api.approvedStampMedia(url, "image/png"), null);
    await assert.rejects(
      media.loadStampImage(asset({ mediaUrl: url }), {
        fetch: async () => {
          calls++;
          return imageResponse();
        },
      }),
    );
  }
  assert.equal(api.approvedStampMedia(source.stamp_url, "image/jpeg"), null);
  assert.equal(calls, 0);
  const result = await api.listStampHoldings(address, 1, {
    fetch: fetchJson(envelope(badUrls.map((url, i) => row(30 + i, { stamp_url: url })))),
  });
  assert.equal(result.assets.length, 0);
  assert.equal(result.unsupported, badUrls.length);
});

test("safe artwork is reencoded to transparent square PNG and hashed from the actual derivative", async () => {
  const original = await sharp(png)
    .withExif({ IFD0: { Artist: "PRIVATE SOURCE METADATA" } })
    .png()
    .toBuffer();
  const result = await media.loadStampImage(asset(), {
    fetch: async () => imageResponse(original),
  });
  const output = Buffer.from(result.pngDataUrl.split(",")[1], "base64");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(output.includes(Buffer.from("PRIVATE SOURCE METADATA")), false);
  assert.equal(result.contentHash, createHash("sha256").update(output).digest("hex"));
  const corner = await sharp(output)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert.equal(corner[3], 0, "the non-square source has transparent letterboxing");
});

test("JPEG and WebP decode through the same safe raster boundary", async () => {
  for (const [format, mime, extension] of [
    ["jpeg", "image/jpeg", "jpeg"],
    ["webp", "image/webp", "webp"],
  ]) {
    const input = await sharp(png)[format]().toBuffer();
    const candidate = asset();
    candidate.mediaUrl = candidate.mediaUrl.replace(".png", `.${extension}`);
    candidate.mediaType = mime;
    const output = await media.loadStampImage(candidate, {
      fetch: async () => imageResponse(input, mime),
    });
    assert.match(output.pngDataUrl, /^data:image\/png;base64,/);
  }
});

test("HTML/SVG, MIME mismatches, corrupt files and oversized images fail without caching", async () => {
  const hugeSide = await sharp({
    create: { width: 2049, height: 1, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const hugePixels = await sharp({
    create: { width: 2048, height: 2048, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  for (const [bytes, mime] of [
    [Buffer.from("<svg><script>alert(1)</script></svg>"), "image/png"],
    [png, "text/html"],
    [png, "image/jpeg"],
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]), "image/png"],
    [hugeSide, "image/png"],
    [hugePixels, "image/png"],
    [new Uint8Array(1024 * 1024 + 1), "image/png"],
  ]) {
    const candidate = asset();
    await assert.rejects(
      media.loadStampImage(candidate, { fetch: async () => imageResponse(bytes, mime) }),
    );
    const retry = await media.loadStampImage(candidate, { fetch: async () => imageResponse() });
    assert.match(retry.pngDataUrl, /^data:image\/png/);
  }
});

test("a raster polyglot's trailing payload never survives reencoding", async () => {
  const payload = Buffer.from("<script>PRIVATE POLYGLOT PAYLOAD</script>");
  const result = await media.loadStampImage(asset(), {
    fetch: async () => imageResponse(Buffer.concat([png, payload])),
  });
  const bytes = Buffer.from(result.pngDataUrl.split(",")[1], "base64");
  assert.equal(bytes.includes(payload), false);
  assert.equal((await sharp(bytes).metadata()).format, "png");
});

test("media requests reject redirects and excessive advertised lengths", async () => {
  for (const response of [
    new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
    new Response(png, { headers: { "content-type": "image/png", "content-length": "1048577" } }),
  ])
    await assert.rejects(
      media.loadStampImage(asset(), {
        fetch: async (_url, options) => {
          assert.equal(options.redirect, "error");
          return response;
        },
      }),
    );
});

test("media cache reuses only sanitized public pixels, coalesces pending work and resists caller mutation", async () => {
  const candidate = asset();
  let calls = 0;
  const options = {
    fetch: async () => {
      calls++;
      return imageResponse();
    },
  };
  const [first, second] = await Promise.all([
    media.loadStampImage(candidate, options),
    media.loadStampImage(candidate, options),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  first.pngDataUrl = "poison";
  const cached = await media.loadStampImage(
    { ...candidate, cpid: "Aother", title: "Another wallet's title" },
    options,
  );
  assert.match(cached.pngDataUrl, /^data:image\/png/);
  assert.deepEqual(Object.keys(cached).sort(), ["contentHash", "pngDataUrl"]);
  assert.equal(calls, 1);
});

test("the completed media cache evicts after 64 public derivatives", async () => {
  let calls = 0;
  const options = {
    fetch: async () => {
      calls++;
      return imageResponse();
    },
  };
  const candidates = Array.from({ length: 65 }, () => asset());
  for (const candidate of candidates) await media.loadStampImage(candidate, options);
  assert.equal(calls, 65);
  await media.loadStampImage(candidates[64], options);
  assert.equal(calls, 65);
  await media.loadStampImage(candidates[0], options);
  assert.equal(calls, 66);
});
