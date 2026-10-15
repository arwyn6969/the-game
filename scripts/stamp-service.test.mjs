import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { Address } from "bip322-js";
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
const { StampIdentityService, stampSessionHash, stampResult, STAMP_PROOF_MS, STAMP_APPEARANCE_MS } =
  await server.ssrLoadModule("/src/lib/stamps/service.server.ts");
const { SqlStampStore } = await server.ssrLoadModule("/src/lib/stamps/store.server.ts");
const { stampRequestOrigin, stampStorageMode, STAMP_SESSION_COOKIE, STAMP_SESSION_MS } =
  await server.ssrLoadModule("/src/lib/stamps/http.server.ts");
const database = new PGlite();
const store = new SqlStampStore({
  query: async (text, params) => (await database.query(text, params)).rows,
});
before(async () => {
  await database.exec(
    await readFile(new URL("../migrations/20261015_stamp_identity.sql", import.meta.url), "utf8"),
  );
});
beforeEach(async () => database.exec("truncate stamp_identity_sessions"));
after(async () => {
  await database.close();
  await server.close();
});

const start = 1_800_000_000_000;
const scope = { worldId: `world_${"a".repeat(64)}`, characterId: `character_${"b".repeat(64)}` };
const otherCharacter = { ...scope, characterId: `character_${"c".repeat(64)}` };
const otherWorld = { ...scope, worldId: `world_${"d".repeat(64)}` };
const origin = "https://game.example";
const address = Address.convertPubKeyIntoAddress(
  Buffer.from("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "hex"),
  "p2wpkh",
).mainnet;
const otherAddress = Address.convertPubKeyIntoAddress(
  Buffer.from("0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "hex"),
  "p2wpkh",
).mainnet;
const png = await sharp({
  create: { width: 256, height: 256, channels: 4, background: "transparent" },
})
  .png()
  .toBuffer();
const safeImage = {
  pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
  contentHash: createHash("sha256").update(png).digest("hex"),
};
const crop = { x: 0.1, y: 0.2, size: 0.5 };
const asset = (cpid = "A1234567890123456789") => ({
  cpid,
  stampNumber: 123,
  quantity: "1",
  supply: "100",
  divisible: false,
  locked: true,
  title: "Stamp #123",
  mediaUrl: `https://stampchain.io/stamps/${"e".repeat(64)}.png`,
  mediaType: "image/png",
});
const firstAsset = asset();
const secondAsset = asset("A1234567890123456790");
const holdings = (assets = [firstAsset], page = 1) => ({
  assets,
  page,
  totalPages: 1,
  total: assets.length,
  unsupported: 0,
  indexedBlock: 900_000,
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(token = "1".repeat(64)) {
  const state = {
    now: start,
    list: async (_address, page) => holdings([firstAsset], page),
    find: async (_address, cpid) =>
      [firstAsset, secondAsset].find((item) => item.cpid === cpid) ?? null,
    image: async () => safeImage,
    verify: (_address, _message, signature) => signature === "valid-test-proof",
    calls: { list: 0, find: 0, image: 0, verify: 0 },
  };
  const sessionHash = stampSessionHash(token);
  const service = new StampIdentityService(store, sessionHash, origin, {
    now: () => state.now,
    list: (...args) => {
      state.calls.list++;
      return state.list(...args);
    },
    find: (...args) => {
      state.calls.find++;
      return state.find(...args);
    },
    image: (...args) => {
      state.calls.image++;
      return state.image(...args);
    },
    verify: (...args) => {
      state.calls.verify++;
      return state.verify(...args);
    },
  });
  const finish = (challenge, overrides = {}) =>
    service.finish({
      scope,
      challengeId: challenge.id,
      address: challenge.address,
      message: challenge.message,
      signature: "valid-test-proof",
      ...overrides,
    });
  const connect = async (walletAddress = address) => {
    const challenge = await service.begin(scope, walletAddress);
    return finish(challenge);
  };
  return { service, state, sessionHash, finish, connect };
}
const disconnected = (view) => {
  assert.equal(view.connected, false);
  assert.equal(view.address, null);
  assert.equal(view.appearance, null);
  assert.equal(view.holdings, null);
};
const errorCode = (code) => (error) => error.code === code;

test("the scoped one-use proof stores a cookie hash and establishes only a read-only session", async () => {
  const { service, state, sessionHash, finish } = harness();
  const challenge = await service.begin(scope, address);
  assert.match(challenge.message, /read-only/);
  for (const value of [origin, scope.worldId, scope.characterId, address, challenge.id])
    assert.ok(challenge.message.includes(value));
  assert.match(challenge.message, /does not authorize spending BTC/);
  const view = await finish(challenge);
  assert.equal(view.connected, true);
  assert.equal(view.address, address);
  assert.equal(view.proofExpiresAt, state.now + STAMP_PROOF_MS);
  assert.equal(view.appearance, null);
  assert.equal(state.calls.verify, 1);
  await assert.rejects(finish(challenge), errorCode("expired"));
  const saved = await database.query("select * from stamp_identity_sessions");
  assert.equal(saved.rows.length, 1);
  assert.equal(saved.rows[0].session_hash, sessionHash);
  assert.notEqual(saved.rows[0].session_hash, "1".repeat(64));
  assert.equal(saved.rows[0].challenge_id, null);
  assert.equal(JSON.stringify(saved.rows).includes("valid-test-proof"), false);
});

test("a proof cannot cross the cookie, world or character boundary or accept an echoed message change", async () => {
  const current = harness();
  const stranger = harness("2".repeat(64));
  const challenge = await current.service.begin(scope, address);
  await assert.rejects(stranger.finish(challenge), errorCode("expired"));
  await assert.rejects(current.finish(challenge, { scope: otherCharacter }), errorCode("expired"));
  await assert.rejects(current.finish(challenge, { scope: otherWorld }), errorCode("expired"));
  await assert.rejects(
    current.finish(challenge, { message: `${challenge.message}\nchanged` }),
    errorCode("invalid"),
  );
  await assert.rejects(
    current.finish(challenge),
    errorCode("expired"),
    "a failed proof must also consume the nonce",
  );
  assert.equal(
    current.state.calls.verify,
    0,
    "mismatched echoed data is rejected before cryptographic verification",
  );
});

test("invalid signatures burn their challenge, and unsupported addresses never create a proof", async () => {
  const current = harness();
  await assert.rejects(current.service.begin(scope, "not-a-wallet"), errorCode("unsupported"));
  const challenge = await current.service.begin(scope, address);
  await assert.rejects(
    current.finish(challenge, { signature: "bad-test-proof" }),
    errorCode("invalid"),
  );
  await assert.rejects(current.finish(challenge), errorCode("expired"));
  disconnected(await current.service.view(scope));
});

test("challenges are rate limited, expire, and supersede the previous outstanding challenge", async () => {
  const current = harness();
  const first = await current.service.begin(scope, address);
  await assert.rejects(current.service.begin(scope, address), errorCode("rate-limited"));
  current.state.now += 5_001;
  const second = await current.service.begin(scope, address);
  await assert.rejects(current.finish(first), errorCode("expired"));
  current.state.now = second.expiresAt;
  await assert.rejects(current.finish(second), errorCode("expired"));
});

test("finish rechecks challenge expiry after consuming and verifying its proof", async () => {
  const current = harness();
  const challenge = await current.service.begin(scope, address);
  current.state.verify = () => {
    current.state.now = challenge.expiresAt + 1;
    return true;
  };
  await assert.rejects(current.finish(challenge), errorCode("expired"));
  disconnected(await current.service.view(scope));
});

test("choosing uses fresh holdings and bounded artwork, preserving scope and the selected crop", async () => {
  const current = harness();
  await current.connect();
  const result = await current.service.choose(scope, firstAsset.cpid, "head", crop);
  assert.equal(result.cpid, firstAsset.cpid);
  assert.equal(result.worldId, scope.worldId);
  assert.equal(result.characterId, scope.characterId);
  assert.deepEqual(result.crop, crop);
  assert.equal(result.mode, "head");
  assert.equal(result.contentHash, safeImage.contentHash);
  assert.equal(result.expiresAt, current.state.now + STAMP_APPEARANCE_MS);
  assert.equal(current.state.calls.find, 1);
  assert.equal(current.state.calls.image, 1);
  assert.equal((await current.service.view(scope)).appearance.cpid, firstAsset.cpid);
  disconnected(await current.service.view(otherWorld));
  disconnected(await current.service.view(otherCharacter));
  await assert.rejects(
    current.service.choose(otherCharacter, firstAsset.cpid, "head", crop),
    errorCode("expired"),
  );
  await harness("2".repeat(64)).service.disconnect(scope);
  assert.equal((await current.service.view(scope)).connected, true);
});

test("a lost stamp falls back without destroying the private historical choice", async () => {
  const current = harness();
  await current.connect();
  await current.service.choose(scope, firstAsset.cpid, "head", crop);
  current.state.list = async () => holdings([]);
  current.state.find = async () => null;
  const missing = await current.service.view(scope);
  assert.equal(missing.connected, true);
  assert.equal(missing.appearance, null);
  assert.equal(
    (await store.get(current.sessionHash, scope, current.state.now)).appearance.cpid,
    firstAsset.cpid,
  );
  await assert.rejects(current.service.preview(scope, firstAsset.cpid), errorCode("not-held"));
  await assert.rejects(
    current.service.choose(scope, firstAsset.cpid, "head", crop),
    errorCode("not-held"),
  );
  current.state.find = async () => firstAsset;
  const restored = await current.service.view(scope);
  assert.deepEqual(restored.appearance.crop, crop);
  assert.equal(restored.appearance.cpid, firstAsset.cpid);
});

test("upstream failures never become not-held or leak upstream details", async () => {
  const current = harness();
  await current.connect();
  const fail = async () => {
    throw new Error("PRIVATE UPSTREAM TOKEN");
  };
  current.state.list = fail;
  const viewed = await stampResult(() => current.service.view(scope));
  assert.equal(viewed.ok, false);
  assert.equal(viewed.error, "unavailable");
  assert.equal(viewed.message.includes("PRIVATE"), false);
  current.state.find = fail;
  const chosen = await stampResult(() =>
    current.service.choose(scope, firstAsset.cpid, "head", crop),
  );
  assert.equal(chosen.error, "unavailable");
  current.state.find = async () => firstAsset;
  current.state.image = fail;
  const preview = await stampResult(() => current.service.preview(scope, firstAsset.cpid));
  assert.equal(preview.error, "unavailable");
  assert.equal((await store.get(current.sessionHash, scope, current.state.now)).address, address);
});

test("a disconnect during a remote view cannot revive the connection", async () => {
  const current = harness();
  await current.connect();
  const gate = deferred();
  const entered = deferred();
  current.state.list = () => {
    entered.resolve();
    return gate.promise;
  };
  const view = current.service.view(scope);
  await entered.promise;
  await current.service.disconnect(scope);
  gate.resolve(holdings());
  disconnected(await view);
  assert.equal(await store.get(current.sessionHash, scope, current.state.now), null);
});

test("a view that overlaps a new selection cannot return the earlier selection", async () => {
  const current = harness();
  await current.connect();
  await current.service.choose(scope, firstAsset.cpid, "head", crop);
  const gate = deferred();
  const entered = deferred();
  current.state.list = () => {
    entered.resolve();
    return gate.promise;
  };
  const view = current.service.view(scope);
  await entered.promise;
  await current.service.choose(scope, secondAsset.cpid, "portrait", crop);
  gate.resolve(holdings([firstAsset, secondAsset]));
  disconnected(await view);
  assert.equal(
    (await store.get(current.sessionHash, scope, current.state.now)).appearance.cpid,
    secondAsset.cpid,
  );
});

for (const mutation of ["disconnect", "clear", "reprove", "choose"]) {
  test(`a pending selection cannot overwrite a later ${mutation}`, async () => {
    const current = harness();
    await current.connect();
    await current.service.choose(scope, firstAsset.cpid, "head", crop);
    const gate = deferred();
    const entered = deferred();
    current.state.image = () => {
      entered.resolve();
      return gate.promise;
    };
    const choosing = current.service.choose(scope, firstAsset.cpid, "portrait", crop);
    const rejected = assert.rejects(choosing, errorCode("expired"));
    await entered.promise;
    if (mutation === "disconnect") await current.service.disconnect(scope);
    if (mutation === "clear") await current.service.clearAppearance(scope);
    if (mutation === "reprove") {
      current.state.now += 5_001;
      await current.connect(address);
    }
    if (mutation === "choose") {
      current.state.image = async () => safeImage;
      await current.service.choose(scope, secondAsset.cpid, "head", crop);
    }
    gate.resolve(safeImage);
    await rejected;
    const stored = await store.get(current.sessionHash, scope, current.state.now);
    if (mutation === "disconnect") assert.equal(stored, null);
    else if (mutation === "choose") assert.equal(stored.appearance.cpid, secondAsset.cpid);
    else if (mutation === "reprove") assert.equal(stored.appearance.mode, "head");
    else assert.equal(stored.appearance, null);
  });
}

test("a view notices a choose-then-clear revision even when the final appearance is null again", async () => {
  const current = harness();
  await current.connect();
  const gate = deferred();
  const entered = deferred();
  current.state.list = () => {
    entered.resolve();
    return gate.promise;
  };
  const viewing = current.service.view(scope);
  await entered.promise;
  await current.service.choose(scope, firstAsset.cpid, "head", crop);
  await current.service.clearAppearance(scope);
  gate.resolve(holdings());
  disconnected(await viewing);
  assert.equal((await store.get(current.sessionHash, scope, current.state.now)).appearance, null);
});

test("reproving during a view cannot attach old holdings to the new wallet", async () => {
  const current = harness();
  await current.connect();
  const gate = deferred();
  const entered = deferred();
  current.state.list = () => {
    entered.resolve();
    return gate.promise;
  };
  const viewing = current.service.view(scope);
  await entered.promise;
  current.state.list = async () => holdings();
  current.state.now += 5_001;
  await current.connect(otherAddress);
  gate.resolve(holdings());
  disconnected(await viewing);
  assert.equal(
    (await store.get(current.sessionHash, scope, current.state.now)).address,
    otherAddress,
  );
});

for (const action of ["view", "preview", "choose"]) {
  test(`${action} checks proof expiry after its remote await`, async () => {
    const current = harness();
    await current.connect();
    const expired = async () => {
      current.state.now = start + STAMP_PROOF_MS + 1;
      return action === "view" ? holdings() : safeImage;
    };
    if (action === "view") {
      current.state.list = expired;
      disconnected(await current.service.view(scope));
    } else {
      current.state.image = expired;
      const work =
        action === "preview"
          ? current.service.preview(scope, firstAsset.cpid)
          : current.service.choose(scope, firstAsset.cpid, "head", crop);
      await assert.rejects(work, errorCode("expired"));
    }
  });
}

test("clear and disconnect are idempotent and expired proof never triggers a remote call", async () => {
  const current = harness();
  await current.service.clearAppearance(scope);
  await current.service.disconnect(scope);
  await current.connect();
  const before = { ...current.state.calls };
  current.state.now += STAMP_PROOF_MS;
  disconnected(await current.service.view(scope));
  await assert.rejects(current.service.preview(scope, firstAsset.cpid), errorCode("expired"));
  await assert.rejects(
    current.service.choose(scope, firstAsset.cpid, "head", crop),
    errorCode("expired"),
  );
  assert.deepEqual(current.state.calls, before);
});

test("cookie keys are opaque hashes and use a separate host-only session namespace", () => {
  const token = "f".repeat(64);
  assert.equal(stampSessionHash(token), createHash("sha256").update(token).digest("hex"));
  assert.match(stampSessionHash(token), /^[a-f0-9]{64}$/);
  assert.notEqual(stampSessionHash(token), token);
  assert.notEqual(stampSessionHash(token), stampSessionHash(`${token}x`));
  assert.equal(STAMP_SESSION_COOKIE, "__Host-the-game.stamp-session");
  assert.equal(STAMP_SESSION_MS, 30 * 60_000);
});

test("deployed stamp identities require shared storage; only explicit local development may use local storage", () => {
  const cases = [
    [{ NODE_ENV: "development" }, "http://localhost:8080", "local"],
    [{ NODE_ENV: "development" }, "http://127.0.0.1:8080", "local"],
    [{ NODE_ENV: "development" }, "http://[::1]:8080", "local"],
    [{ NODE_ENV: "production" }, "http://localhost:8080", "unavailable"],
    [
      { NODE_ENV: "production", STAMP_IDENTITY_LOCAL_DEV: "true" },
      "http://localhost:8080",
      "local",
    ],
    [{ NODE_ENV: "development", VERCEL: "1" }, "http://localhost:8080", "unavailable"],
    [
      { NODE_ENV: "development", GROK_PROJECT_ID: "project" },
      "http://localhost:8080",
      "unavailable",
    ],
    [{ NODE_ENV: "development" }, origin, "unavailable"],
    [{ NODE_ENV: "development" }, "http://localhost.evil.test", "unavailable"],
    [{ NODE_ENV: "production", DATABASE_URL: "postgres://private" }, origin, "shared"],
    [{ DATABASE_URL: "   " }, origin, "unavailable"],
  ];
  for (const [env, url, expected] of cases) assert.equal(stampStorageMode(env, url), expected);
});

test("origin guards require exact secure origins for mutations, including browsers without Fetch Metadata", () => {
  const request = (url, method = "POST", incoming = origin) =>
    new Request(url, {
      method,
      headers: incoming === undefined ? {} : { origin: incoming },
    });
  assert.equal(stampRequestOrigin(request(`${origin}/wallet`)), origin);
  assert.equal(stampRequestOrigin(new Request(`${origin}/wallet`)), origin);
  assert.throws(
    () => stampRequestOrigin(new Request(`${origin}/wallet`, { method: "POST" })),
    errorCode("invalid"),
  );
  for (const incoming of [
    "null",
    "https://game.example.evil.test",
    "https://other.grok.me",
    "http://game.example",
    `${origin}/`,
  ])
    assert.throws(
      () => stampRequestOrigin(request(`${origin}/wallet`, "POST", incoming)),
      errorCode("invalid"),
    );
  assert.throws(
    () => stampRequestOrigin(request("http://game.example/wallet", "POST", "http://game.example")),
    errorCode("unavailable"),
  );
  assert.equal(
    stampRequestOrigin(request("http://localhost:8080/wallet", "POST", "http://localhost:8080")),
    "http://localhost:8080",
  );
  assert.throws(
    () => stampRequestOrigin(request(`${origin}/wallet`), "https://configured.example"),
    errorCode("invalid"),
  );
});
