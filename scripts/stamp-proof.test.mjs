import assert from "node:assert/strict";
import { createECDH, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { Address, BIP322, BitcoinMessage, Signer, Verifier } from "bip322-js";
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
const { buildStampChallenge, validateP2wpkhAddress, verifyStampProof } = await server.ssrLoadModule(
  "/src/lib/stamps/proof.server.ts",
);
const { SqlStampStore, STAMP_SESSION_TTL_MS, STAMP_PROOF_TTL_MS, STAMP_CHALLENGE_TTL_MS } =
  await server.ssrLoadModule("/src/lib/stamps/store.server.ts");
const now = 1_800_000_000_000;
const sessionHash = "a".repeat(64);
const scope = { worldId: `world_${"b".repeat(64)}`, characterId: `character_${"c".repeat(64)}` };
const otherScope = { ...scope, characterId: `character_${"d".repeat(64)}` };
const origin = "https://the-game.example";
const hash = (bytes) => createHash("sha256").update(bytes).digest();

// Disposable random keys never leave this process. Only fixture WIF encoding
// lives here; signing and verification use the installed BIP-322 implementation.
function wallet() {
  const ecdh = createECDH("secp256k1");
  ecdh.generateKeys();
  const privateKey = ecdh.getPrivateKey();
  const publicKey = ecdh.getPublicKey(undefined, "compressed");
  const payload = Buffer.concat([Buffer.from([128]), privateKey, Buffer.from([1])]);
  const checked = Buffer.concat([payload, hash(hash(payload)).subarray(0, 4)]);
  let number = BigInt(`0x${checked.toString("hex")}`);
  let wif = "";
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  while (number) {
    wif = alphabet[Number(number % 58n)] + wif;
    number /= 58n;
  }
  const addresses = Address.convertPubKeyIntoAddress(publicKey, "p2wpkh");
  return {
    address: addresses.mainnet,
    addresses,
    publicKey,
    privateKey,
    sign: (message) => Signer.sign(wif, addresses.mainnet, message),
  };
}
const firstWallet = wallet();
const secondWallet = wallet();
const png = await sharp({
  create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .png()
  .toBuffer();
const image = {
  pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
  contentHash: hash(png).toString("hex"),
};
const challenge = (changes = {}) =>
  buildStampChallenge({
    id: randomBytes(32).toString("hex"),
    address: firstWallet.address,
    scope,
    origin,
    expiresAt: now + STAMP_CHALLENGE_TTL_MS,
    ...changes,
  });
const appearance = (changes = {}) => ({
  ...scope,
  ...image,
  cpid: "A12345678901234567890",
  stampNumber: 123,
  title: "A fixture stamp",
  mode: "portrait",
  crop: { x: 0, y: 0, size: 1 },
  verifiedAt: now,
  expiresAt: now + 120_000,
  ...changes,
});
let db;
let store;
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(new URL("../migrations/20261015_stamp_identity.sql", import.meta.url), "utf8"),
  );
  store = new SqlStampStore({ query: async (text, params) => (await db.query(text, params)).rows });
});
beforeEach(async () => {
  await db.exec("truncate stamp_identity_sessions");
});
after(async () => {
  await db?.close();
  await server.close();
});

async function connect({
  selectedScope = scope,
  cookieHash = sessionHash,
  selectedWallet = firstWallet,
  at = now,
} = {}) {
  const request = challenge({
    scope: selectedScope,
    address: selectedWallet.address,
    expiresAt: at + STAMP_CHALLENGE_TTL_MS,
  });
  assert.equal(await store.issue(cookieHash, selectedScope, request, at), true);
  const consumed = await store.consume(cookieHash, selectedScope, request.id, at);
  assert.deepEqual(consumed, request);
  assert.equal(
    verifyStampProof(selectedWallet.address, request.message, selectedWallet.sign(request.message)),
    true,
  );
  assert.equal(
    await store.prove(
      cookieHash,
      selectedScope,
      request.id,
      selectedWallet.address,
      at + STAMP_PROOF_TTL_MS,
      at,
    ),
    true,
  );
  return request;
}

test("mainnet native SegWit addresses require a real checksum and a 20-byte witness program", () => {
  assert.equal(validateP2wpkhAddress(firstWallet.address), true);
  const changed =
    firstWallet.address.slice(0, -1) + (firstWallet.address.endsWith("q") ? "p" : "q");
  const unsupported = [
    changed,
    firstWallet.address.toUpperCase(),
    firstWallet.address + " ",
    firstWallet.addresses.testnet,
    firstWallet.addresses.regtest,
    null,
    {},
    "bc1q" + "q".repeat(38),
  ];
  for (const type of ["p2pkh", "p2sh-p2wpkh", "p2tr"])
    unsupported.push(Address.convertPubKeyIntoAddress(firstWallet.publicKey, type).mainnet);
  for (const address of unsupported) assert.equal(validateP2wpkhAddress(address), false);
});

test("a valid simple signature binds the exact challenge, address, origin, world and character", () => {
  const request = challenge();
  const signature = firstWallet.sign(request.message);
  assert.equal(verifyStampProof(firstWallet.address, request.message, signature), true);
  assert.equal(verifyStampProof(secondWallet.address, request.message, signature), false);
  for (const [from, to] of [
    [origin, "https://attacker.example"],
    [scope.worldId, `world_${"e".repeat(64)}`],
    [scope.characterId, otherScope.characterId],
    [request.id, randomBytes(32).toString("hex")],
    [String(request.expiresAt), String(request.expiresAt + 1)],
  ])
    assert.equal(
      verifyStampProof(firstWallet.address, request.message.replace(from, to), signature),
      false,
    );
  assert.match(request.message, /read-only/);
  assert.match(request.message, /does not authorize spending BTC, transferring stamps/);
  assert.match(request.message, /Network: Bitcoin mainnet/);
  assert.match(
    request.message,
    /No transaction, funds transfer, or signing authority is requested/,
  );
});

test("legacy BIP-137 and prefixed, full or noncanonical signature forms are rejected", () => {
  const request = challenge();
  const signature = firstWallet.sign(request.message);
  const bip137 = BitcoinMessage.sign(request.message, firstWallet.privateKey, true, {
    segwitType: "p2wpkh",
  }).toString("base64");
  assert.equal(
    Verifier.verifySignature(firstWallet.address, request.message, bip137, true),
    true,
    "the dependency intentionally supports legacy proofs",
  );
  const full = Buffer.from(
    BIP322.buildToSpendTx(
      request.message,
      Address.convertAdressToScriptPubkey(firstWallet.address),
    ).toBuffer(),
  ).toString("base64");
  for (const value of [
    bip137,
    full,
    `smp${signature}`,
    `ful${signature}`,
    `pof${signature}`,
    signature + "\n",
    " " + signature,
    signature + "=",
    "A".repeat(5000),
    "!!!!",
    null,
    {},
  ])
    assert.equal(verifyStampProof(firstWallet.address, request.message, value), false);
});

test("simple witness framing requires two items, canonical short lengths, DER, ALL and compressed keys", () => {
  const request = challenge();
  const original = Buffer.from(firstWallet.sign(request.message), "base64");
  const variants = [];
  const edit = (mutate) => {
    const bytes = Buffer.from(original);
    mutate(bytes);
    variants.push(bytes);
  };
  edit((bytes) => {
    bytes[0] = 3;
  });
  edit((bytes) => {
    bytes[1] = 253;
  });
  edit((bytes) => {
    bytes[2] = 0x31;
  });
  edit((bytes) => {
    bytes[2 + bytes[1] - 1] = 2;
  });
  edit((bytes) => {
    bytes[2 + bytes[1]] = 32;
  });
  edit((bytes) => {
    bytes[3 + bytes[1]] = 4;
  });
  variants.push(Buffer.concat([original, Buffer.from([0])]));
  variants.push(Buffer.concat([Buffer.from([253, 2, 0]), original.subarray(1)]));
  variants.push(
    Buffer.concat([
      original.subarray(0, 1),
      Buffer.from([253, original[1], 0]),
      original.subarray(2),
    ]),
  );
  for (const bytes of variants)
    assert.equal(
      verifyStampProof(firstWallet.address, request.message, bytes.toString("base64")),
      false,
    );
});

test("challenge construction rejects ambiguous origins, line injection and invalid scope", () => {
  for (const changes of [
    { origin: origin + "/path" },
    { origin: origin + "/" },
    { origin: "https://person:secret@the-game.example" },
    { origin: "javascript:alert(1)" },
    { id: "nonce\nWorld: attacker" },
    { scope: { ...scope, characterId: "kevin" } },
    { expiresAt: NaN },
    { address: firstWallet.addresses.testnet },
  ])
    assert.throws(() => challenge(changes));
});

test("consumption is atomic across competing requests and an invalid proof spends the one attempt", async () => {
  const request = challenge();
  assert.equal(await store.issue(sessionHash, scope, request, now), true);
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => store.consume(sessionHash, scope, request.id, now + 1)),
  );
  assert.equal(responses.filter(Boolean).length, 1);
  assert.equal(
    verifyStampProof(firstWallet.address, request.message, secondWallet.sign("wrong challenge")),
    false,
  );
  assert.equal(await store.consume(sessionHash, scope, request.id, now + 2), null);
  assert.equal((await store.get(sessionHash, scope, now + 2)).address, null);
});

test("challenge IDs, browser hashes and world/character scopes cannot substitute for one another", async () => {
  const request = challenge();
  assert.equal(await store.issue(sessionHash, scope, request, now), true);
  assert.equal(await store.consume("f".repeat(64), scope, request.id, now), null);
  assert.equal(await store.consume(sessionHash, otherScope, request.id, now), null);
  assert.equal(
    await store.consume(
      sessionHash,
      { ...scope, worldId: `world_${"e".repeat(64)}` },
      request.id,
      now,
    ),
    null,
  );
  assert.equal(await store.consume(sessionHash, scope, "0".repeat(64), now), null);
  assert.deepEqual(await store.consume(sessionHash, scope, request.id, now), request);
  assert.equal(await store.get("f".repeat(64), scope, now), null);
});

test("same-cookie scopes stay independent and unlink only deletes the selected scope", async () => {
  await connect();
  await connect({ selectedScope: otherScope, selectedWallet: secondWallet });
  await store.clear(sessionHash, scope);
  assert.equal(await store.get(sessionHash, scope, now), null);
  assert.equal((await store.get(sessionHash, otherScope, now)).address, secondWallet.address);
});

test("challenge issuance rate limits are atomic and survive successful proof consumption", async () => {
  const first = challenge();
  const second = challenge();
  const results = await Promise.all([
    store.issue(sessionHash, scope, first, now),
    store.issue(sessionHash, scope, second, now),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const chosen = results[0] ? first : second;
  assert.ok(await store.consume(sessionHash, scope, chosen.id, now + 1));
  assert.equal(
    await store.prove(
      sessionHash,
      scope,
      chosen.id,
      firstWallet.address,
      now + STAMP_PROOF_TTL_MS,
      now + 1,
    ),
    true,
  );
  assert.equal(await store.issue(sessionHash, scope, challenge(), now + 4999), false);
  assert.equal(await store.issue(sessionHash, scope, challenge(), now + 5000), true);
});

test("challenge, proof, image and session leases expire at their exact boundaries", async () => {
  const request = challenge();
  assert.equal(await store.issue(sessionHash, scope, request, now), true);
  assert.equal(await store.consume(sessionHash, scope, request.id, request.expiresAt), null);
  await store.clear(sessionHash, scope);
  await connect();
  assert.equal(
    await store.setAppearance(sessionHash, scope, firstWallet.address, appearance(), now),
    true,
  );
  assert.ok((await store.get(sessionHash, scope, now + 119999)).appearance);
  const historicalChoice = (await store.get(sessionHash, scope, now + 120000)).appearance;
  assert.ok(historicalChoice, "the private choice remains available for a fresh holdings check");
  assert.equal(
    historicalChoice.expiresAt,
    now + 120000,
    "an expired image lease is never silently extended",
  );
  assert.equal(
    await store.setAppearance(
      sessionHash,
      scope,
      firstWallet.address,
      appearance({ verifiedAt: now + STAMP_PROOF_TTL_MS, expiresAt: now + STAMP_PROOF_TTL_MS + 1 }),
      now + STAMP_PROOF_TTL_MS,
    ),
    false,
  );
  assert.equal(await store.get(sessionHash, scope, now + STAMP_SESSION_TTL_MS), null);
  await assert.rejects(
    store.issue(
      sessionHash,
      scope,
      challenge({ expiresAt: now + STAMP_CHALLENGE_TTL_MS + 1 }),
      now,
    ),
  );
});

test("a pending or invalid replacement challenge keeps the existing proof and appearance", async () => {
  await connect();
  assert.equal(
    await store.setAppearance(sessionHash, scope, firstWallet.address, appearance(), now),
    true,
  );
  const request = challenge({ address: secondWallet.address });
  assert.equal(await store.issue(sessionHash, scope, request, now + 5000), true);
  assert.ok(await store.consume(sessionHash, scope, request.id, now + 5001));
  assert.equal(
    verifyStampProof(secondWallet.address, request.message, firstWallet.sign(request.message)),
    false,
  );
  const record = await store.get(sessionHash, scope, now + 5002);
  assert.equal(record.address, firstWallet.address);
  assert.deepEqual(record.appearance, appearance());
});

test("a successful proof requires its consumed challenge and cannot be replayed or outlive the lease", async () => {
  const request = challenge();
  assert.equal(await store.issue(sessionHash, scope, request, now), true);
  assert.equal(
    await store.prove(
      sessionHash,
      scope,
      request.id,
      firstWallet.address,
      now + STAMP_PROOF_TTL_MS,
      now,
    ),
    false,
  );
  assert.ok(await store.consume(sessionHash, scope, request.id, now));
  assert.equal(
    await store.prove(
      sessionHash,
      scope,
      request.id,
      secondWallet.address,
      now + STAMP_PROOF_TTL_MS,
      now,
    ),
    false,
  );
  assert.equal(
    await store.prove(
      sessionHash,
      scope,
      request.id,
      firstWallet.address,
      now + STAMP_PROOF_TTL_MS + 1,
      now,
    ),
    false,
  );
  assert.equal(
    await store.prove(
      sessionHash,
      scope,
      request.id,
      firstWallet.address,
      now + STAMP_PROOF_TTL_MS,
      now,
    ),
    true,
  );
  assert.equal(
    await store.prove(
      sessionHash,
      scope,
      request.id,
      firstWallet.address,
      now + STAMP_PROOF_TTL_MS,
      now,
    ),
    false,
  );
});

test("reissuing or unlinking while verification is pending prevents an old proof from reconnecting", async () => {
  for (const action of ["reissue", "unlink"]) {
    await store.clear(sessionHash, scope);
    const request = challenge();
    assert.equal(await store.issue(sessionHash, scope, request, now), true);
    assert.ok(await store.consume(sessionHash, scope, request.id, now));
    if (action === "reissue")
      assert.equal(
        await store.issue(
          sessionHash,
          scope,
          challenge({ address: secondWallet.address }),
          now + 5000,
        ),
        true,
      );
    else await store.clear(sessionHash, scope);
    assert.equal(
      await store.prove(
        sessionHash,
        scope,
        request.id,
        firstWallet.address,
        now + STAMP_PROOF_TTL_MS,
        now + 5001,
      ),
      false,
    );
    const record = await store.get(sessionHash, scope, now + 5001);
    assert.equal(record?.address ?? null, null);
  }
});

test("unlink and an address change prevent a stale image fetch from selecting an appearance", async () => {
  await connect();
  assert.equal(
    await store.setAppearance(sessionHash, scope, firstWallet.address, appearance(), now),
    true,
  );
  await connect({ selectedWallet: secondWallet, at: now + 5000 });
  assert.equal((await store.get(sessionHash, scope, now + 5000)).appearance, null);
  assert.equal(
    await store.setAppearance(sessionHash, scope, firstWallet.address, appearance(), now + 5000),
    false,
  );
  await store.clear(sessionHash, scope);
  assert.equal(
    await store.setAppearance(sessionHash, scope, secondWallet.address, appearance(), now + 5000),
    false,
  );
  assert.equal(await store.get(sessionHash, scope, now + 5000), null);
});

test("clear appearance retains the wallet proof and malformed stored images never reach the view", async () => {
  await connect();
  assert.equal(
    await store.setAppearance(sessionHash, scope, firstWallet.address, appearance(), now),
    true,
  );
  await store.clearAppearance(sessionHash, scope, now);
  const cleared = await store.get(sessionHash, scope, now);
  assert.equal(cleared.address, firstWallet.address);
  assert.equal(cleared.appearance, null);
  for (const changes of [
    { ...otherScope },
    { contentHash: "0".repeat(64) },
    { pngDataUrl: "data:image/svg+xml,<svg/>" },
    { crop: { x: 0.8, y: 0, size: 0.5 } },
    { expiresAt: now + 120001 },
    { extra: "untrusted" },
  ])
    assert.equal(
      await store.setAppearance(sessionHash, scope, firstWallet.address, appearance(changes), now),
      false,
    );
  await db.query("update stamp_identity_sessions set appearance=$1::jsonb", [
    JSON.stringify({ ...appearance(), pngDataUrl: "javascript:alert(1)" }),
  ]);
  assert.equal((await store.get(sessionHash, scope, now)).appearance, null);
});

test("a stale selection cannot cross an unlink and new proof of the same address", async () => {
  await connect();
  const oldProof = (await store.get(sessionHash, scope, now)).proofExpiresAt;
  await store.clear(sessionHash, scope);
  await connect({ at: now + 5000 });
  const newProof = (await store.get(sessionHash, scope, now + 5000)).proofExpiresAt;
  assert.notEqual(newProof, oldProof);
  assert.equal(
    await store.setAppearance(
      sessionHash,
      scope,
      firstWallet.address,
      appearance(),
      now + 5000,
      oldProof,
    ),
    false,
  );
  assert.equal((await store.get(sessionHash, scope, now + 5000)).appearance, null);
  assert.equal(
    await store.setAppearance(
      sessionHash,
      scope,
      firstWallet.address,
      appearance(),
      now + 5000,
      newProof,
    ),
    true,
  );
});

test("clearing an empty or selected appearance invalidates pending selections without unlinking", async () => {
  await connect();
  const initial = await store.get(sessionHash, scope, now);
  assert.equal(
    initial.appearanceRevision,
    1,
    "successful proof starts a new appearance generation",
  );
  assert.equal(initial.appearance, null);
  await store.clearAppearance(sessionHash, scope, now);
  const clearedEmpty = await store.get(sessionHash, scope, now);
  assert.equal(clearedEmpty.appearanceRevision, initial.appearanceRevision + 1);
  assert.equal(clearedEmpty.proofExpiresAt, initial.proofExpiresAt);
  assert.equal(
    await store.setAppearance(
      sessionHash,
      scope,
      firstWallet.address,
      appearance(),
      now,
      initial.proofExpiresAt,
      initial.appearanceRevision,
    ),
    false,
  );
  assert.equal(
    await store.setAppearance(
      sessionHash,
      scope,
      firstWallet.address,
      appearance(),
      now,
      clearedEmpty.proofExpiresAt,
      clearedEmpty.appearanceRevision,
    ),
    true,
  );
  const selected = await store.get(sessionHash, scope, now);
  assert.equal(selected.appearanceRevision, clearedEmpty.appearanceRevision + 1);
  await store.clearAppearance(sessionHash, scope, now);
  const cleared = await store.get(sessionHash, scope, now);
  assert.equal(cleared.appearanceRevision, selected.appearanceRevision + 1);
  assert.equal(cleared.address, firstWallet.address);
  assert.equal(cleared.appearance, null);
  assert.equal(
    await store.setAppearance(
      sessionHash,
      scope,
      firstWallet.address,
      appearance(),
      now,
      selected.proofExpiresAt,
      selected.appearanceRevision,
    ),
    false,
  );
  await connect({ at: now + 5000 });
  assert.equal(
    (await store.get(sessionHash, scope, now + 5000)).appearanceRevision,
    cleared.appearanceRevision + 1,
    "a new proof increments the revision even for the same address",
  );
});

test("store persistence accepts the same long subasset identities as the public selection schema", async () => {
  await connect();
  const cpid = `ASTAMP.${"a".repeat(150)}`;
  const selected = appearance({ cpid, title: cpid.slice(0, 160) });
  assert.equal(
    await store.setAppearance(sessionHash, scope, firstWallet.address, selected, now),
    true,
  );
  assert.deepEqual((await store.get(sessionHash, scope, now)).appearance, selected);
});

test("cleanup deletes only a bounded number of expired sessions", async () => {
  for (const character of ["c", "d", "e"])
    await store.issue(
      sessionHash,
      { ...scope, characterId: `character_${character.repeat(64)}` },
      challenge(),
      now,
    );
  await store.cleanup(now + STAMP_SESSION_TTL_MS, 2);
  assert.equal(
    (await db.query("select count(*)::integer as count from stamp_identity_sessions")).rows[0]
      .count,
    1,
  );
  await store.cleanup(now + STAMP_SESSION_TTL_MS, 2);
  assert.equal(
    (await db.query("select count(*)::integer as count from stamp_identity_sessions")).rows[0]
      .count,
    0,
  );
});
