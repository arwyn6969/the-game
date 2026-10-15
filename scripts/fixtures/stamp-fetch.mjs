import { createHash } from "node:crypto";
import sharp from "sharp";

// Node --import fixture for an isolated built-browser QA process only. Product
// source, signature verification, HTTP sessions and server functions stay real.
if (
  process.env.GAME_STAMP_QA_FIXTURE !== "1" ||
  !/^bc1q[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(process.env.GAME_STAMP_QA_ADDRESS || "")
)
  throw new Error("The Stampchain fixture requires an explicit disposable local QA address.");

const realFetch = globalThis.fetch;
const hash = (letter) => letter.repeat(64);
const pngs = new Map();
for (const [letter, color] of [
  ["a", [112, 220, 190]],
  ["b", [255, 32, 176]],
]) {
  const width = 24;
  const rgba = Buffer.alloc(width * width * 4);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const face = x >= 3 && x <= 20 && y >= 2 && y <= 21;
      const eye = ((x >= 6 && x <= 8) || (x >= 15 && x <= 17)) && y >= 8 && y <= 10;
      const mouth = x >= 8 && x <= 15 && y >= 16 && y <= 17;
      rgba.set(eye || mouth ? [33, 21, 52, 255] : [...color, face ? 255 : 0], offset);
    }
  pngs.set(
    hash(letter),
    await sharp(rgba, { raw: { width, height: width, channels: 4 } })
      .png()
      .toBuffer(),
  );
}

function asset(address, number, supported) {
  const txHash = supported
    ? hash(number === 4242 ? "a" : "b")
    : createHash("sha256").update(`unsupported-fixture-${number}`).digest("hex");
  return {
    cpid: supported ? `ASTAMPQA${number}` : `AUNSUPPORTEDQA${number}`,
    stamp: number,
    tx_hash: txHash,
    stamp_url: `https://stampchain.io/stamps/${txHash}.${supported ? "png" : "svg"}`,
    stamp_mimetype: supported ? "image/png" : "image/svg+xml",
    balance: supported ? (number === 4242 ? "2" : "1") : "1",
    supply: supported ? "10" : "100",
    divisible: false,
    locked: true,
    address,
    unbound_quantity: "1",
    utxos: [],
  };
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const method = String(
    init?.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  if (url.origin !== "https://stampchain.io") {
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    ) {
      console.error(`[stamp-fixture] ${JSON.stringify({ unexpectedNetwork: url.origin, method })}`);
      throw new Error("External network access is disabled in the isolated stamp QA preview.");
    }
    return realFetch(input, init);
  }
  if (method !== "GET")
    throw new Error("The Stampchain QA fixture allows read-only GET requests only.");
  if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  console.log(`[stamp-fixture] ${JSON.stringify({ path: url.pathname, method })}`);
  const balance = /^\/api\/v2\/stamps\/balance\/(bc1q[a-z0-9]+)$/.exec(url.pathname);
  if (balance) {
    const address = decodeURIComponent(balance[1]);
    if (address !== process.env.GAME_STAMP_QA_ADDRESS)
      throw new Error("The QA fixture refuses addresses outside its disposable wallet.");
    const limit = Number(url.searchParams.get("limit"));
    const page = Number(url.searchParams.get("page"));
    if (![24, 100].includes(limit) || !Number.isSafeInteger(page) || page < 1)
      throw new Error("Unexpected Stampchain fixture pagination.");
    const all = [
      asset(address, 4242, true),
      ...Array.from({ length: 23 }, (_, index) => asset(address, 5000 + index, false)),
      asset(address, 4243, true),
    ];
    const bytes = JSON.stringify({
      page,
      limit,
      total: all.length,
      totalPages: Math.ceil(all.length / limit),
      last_block: 900_000,
      data: all.slice((page - 1) * limit, page * limit),
    });
    return new Response(bytes, {
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(bytes)),
      },
    });
  }
  const image = /^\/stamps\/([a-f0-9]{64})\.png$/.exec(url.pathname);
  if (image && pngs.has(image[1])) {
    const bytes = pngs.get(image[1]);
    return new Response(bytes, {
      headers: { "content-type": "image/png", "content-length": String(bytes.length) },
    });
  }
  throw new Error("An unsupported Stampchain route escaped the QA fixture contract.");
};
