import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Address } from "bip322-js";
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
const { EsploraObservationReader } = await server.ssrLoadModule(
  "/src/lib/agent-wallets/esplora-observer.server.ts",
);
const { chainRead, ESPLORA_ORIGIN, COUNTERPARTY_ORIGIN } = await server.ssrLoadModule(
  "/src/lib/agent-wallets/chain-http.server.ts",
);
function disposableAddress() {
  const key = createECDH("secp256k1");
  key.generateKeys();
  return Address.convertPubKeyIntoAddress(key.getPublicKey(undefined, "compressed"), "p2wpkh")
    .mainnet;
}
const address = disposableAddress();
const otherAddress = disposableAddress();
const script = Address.convertAdressToScriptPubkey(address).toString("hex");
const otherScript = Address.convertAdressToScriptPubkey(otherAddress).toString("hex");
const hash = (n) => BigInt(n).toString(16).padStart(64, "0");
const canonical = (height) => hash(height + 1_000);
const anchor = { height: 300, hash: canonical(300) };
const json = (value, headers = {}) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", ...headers },
  });
const text = (value) => new Response(value, { headers: { "content-type": "text/plain" } });
const output = (value = 1, extra = {}) => ({
  value,
  scriptpubkey: script,
  scriptpubkey_address: address,
  ...extra,
});
function transaction(n, { height = 290, outputs = [output()], ...extra } = {}) {
  return {
    txid: hash(n),
    status:
      height === null
        ? { confirmed: false }
        : { confirmed: true, block_height: height, block_hash: canonical(height) },
    vin: [],
    vout: outputs,
    ...extra,
  };
}
function previous(n, { height = 2, eventIndex = 0, ...extra } = {}) {
  return {
    eventId: `bitcoin:${hash(n)}:${eventIndex}`,
    protocol: "bitcoin",
    txid: hash(n),
    eventIndex,
    source: null,
    destination: address,
    asset: "BTC",
    quantity: "17",
    block: height === null ? null : { height, hash: canonical(height) },
    state: "confirmed",
    firstObservedAt: 1_000,
    lastObservedAt: 2_000,
    wasReorged: false,
    ...extra,
  };
}
function fixture({
  pending = [],
  confirmed = [],
  second = [],
  canonicalAt = canonical,
  tip = anchor,
  details = tip,
  override,
} = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url, path: parsed.pathname, options });
    assert.equal(parsed.origin, ESPLORA_ORIGIN);
    assert.equal(options.method, "GET");
    if (override) {
      const response = await override(parsed.pathname, options);
      if (response) return response;
    }
    if (parsed.pathname === "/api/blocks/tip/hash") return text(tip.hash);
    if (parsed.pathname === `/api/block/${tip.hash}`)
      return json({ id: details.hash, height: details.height });
    if (parsed.pathname.startsWith("/api/block-height/"))
      return text(canonicalAt(Number(parsed.pathname.split("/").at(-1))));
    if (parsed.pathname === `/api/address/${address}/txs/mempool`) return json(pending);
    if (parsed.pathname === `/api/address/${address}/txs/chain`) return json(confirmed);
    if (parsed.pathname === `/api/address/${address}/txs/chain/${confirmed.at(-1)?.txid}`)
      return json(second);
    throw new Error(`Unexpected fixture request: ${parsed.pathname}`);
  };
  return { reader: new EsploraObservationReader({ fetch }), calls };
}

test("Bitcoin observations retain two incoming outputs from one transaction as exact distinct satoshi events", async () => {
  const tx = transaction(1, {
    outputs: [
      output(1),
      output(99, { scriptpubkey: otherScript, scriptpubkey_address: otherAddress }),
      output(2_100_000_000_000_000),
    ],
  });
  const { reader, calls } = fixture({ confirmed: [tx] });
  assert.deepEqual(await reader.tip(), anchor);
  const result = await reader.bitcoin(address, [], anchor);
  assert.deepEqual(
    result.events.map(({ eventId, eventIndex, quantity }) => ({ eventId, eventIndex, quantity })),
    [
      { eventId: `bitcoin:${tx.txid}:0`, eventIndex: 0, quantity: "1" },
      { eventId: `bitcoin:${tx.txid}:2`, eventIndex: 2, quantity: "2100000000000000" },
    ],
  );
  assert.ok(result.events.every((event) => event.destination === address && event.asset === "BTC"));
  assert.equal(result.historyComplete, true);
  assert.equal(result.mempoolComplete, true);
  assert.equal(calls.filter((call) => call.path === "/api/block-height/290").length, 1);
});

test("exact destination script and address must agree, while a proven outgoing transaction creates no deposit", async () => {
  for (const bad of [
    output(1, { scriptpubkey: otherScript }),
    output(1, { scriptpubkey_address: otherAddress }),
    output(1, { scriptpubkey_address: undefined }),
  ]) {
    await assert.rejects(
      fixture({ confirmed: [transaction(2, { outputs: [bad] })] }).reader.bitcoin(
        address,
        [],
        anchor,
      ),
    );
  }
  const outgoing = transaction(3, {
    outputs: [output(1, { scriptpubkey: otherScript, scriptpubkey_address: otherAddress })],
    vin: [{ prevout: output(2) }],
  });
  const result = await fixture({ confirmed: [outgoing] }).reader.bitcoin(address, [], anchor);
  assert.deepEqual(result.events, []);
  await assert.rejects(
    fixture({ confirmed: [{ ...outgoing, vin: [] }] }).reader.bitcoin(address, [], anchor),
    /Unrelated/,
  );
  let fetched = false;
  const reader = new EsploraObservationReader({
    fetch: async () => {
      fetched = true;
      return json([]);
    },
  });
  await assert.rejects(reader.bitcoin("not-an-address", [], anchor));
  assert.equal(fetched, false);
});

test("mempool and canonical included outputs remain distinct and inconsistent status is unavailable", async () => {
  const result = await fixture({
    pending: [transaction(4, { height: null })],
    confirmed: [transaction(5)],
  }).reader.bitcoin(address, [], anchor);
  assert.equal(result.events[0].block, null);
  assert.deepEqual(result.events[1].block, { height: 290, hash: canonical(290) });
  for (const options of [
    { pending: [transaction(4)] },
    { confirmed: [transaction(4, { height: null })] },
    { pending: [transaction(4, { status: { confirmed: false, block_height: 290 } })] },
    { confirmed: [transaction(4, { status: {} })] },
  ])
    await assert.rejects(fixture(options).reader.bitcoin(address, [], anchor));
});

test("confirmed transaction data must have a canonical block no higher than the observed anchor", async () => {
  await assert.rejects(
    fixture({ confirmed: [transaction(6)], canonicalAt: () => hash(999) }).reader.bitcoin(
      address,
      [],
      anchor,
    ),
    /canonical/,
  );
  await assert.rejects(
    fixture({ confirmed: [transaction(6, { height: 301 })] }).reader.bitcoin(address, [], anchor),
    /ahead/,
  );
  await assert.rejects(
    fixture({
      confirmed: [
        transaction(6, { status: { confirmed: true, block_height: 290, block_hash: "invalid" } }),
      ],
    }).reader.bitcoin(address, [], anchor),
    /hash/,
  );
});

test("a full recent page follows its exact last txid once and honestly reports bounded history", async () => {
  const first = Array.from({ length: 25 }, (_, n) => transaction(100 + n));
  for (const size of [0, 2, 25]) {
    const second = Array.from({ length: size }, (_, n) => transaction(200 + n));
    const { reader, calls } = fixture({ confirmed: first, second });
    const result = await reader.bitcoin(address, [], anchor);
    assert.equal(result.events.length, 25 + size);
    assert.equal(result.historyComplete, size < 25);
    const pageCalls = calls.filter((call) => call.path.includes("/txs/chain"));
    assert.deepEqual(
      pageCalls.map((call) => call.path),
      [
        `/api/address/${address}/txs/chain`,
        `/api/address/${address}/txs/chain/${first.at(-1).txid}`,
      ],
    );
    assert.equal(calls.filter((call) => call.path.includes("block-height")).length, 1);
  }
});

test("page limits and duplicate txids fail rather than invent complete or duplicate deposits", async () => {
  const first = Array.from({ length: 25 }, (_, n) => transaction(300 + n));
  for (const options of [
    { pending: Array.from({ length: 51 }, (_, n) => transaction(400 + n, { height: null })) },
    { confirmed: [...first, transaction(350)] },
    { confirmed: first, second: Array.from({ length: 26 }, (_, n) => transaction(400 + n)) },
    { pending: [transaction(1, { height: null }), transaction(1, { height: null })] },
    { pending: [transaction(1, { height: null })], confirmed: [transaction(1)] },
    { confirmed: first, second: [first[0]] },
  ])
    await assert.rejects(fixture(options).reader.bitcoin(address, [], anchor));
  const fullPending = await fixture({
    pending: Array.from({ length: 50 }, (_, n) => transaction(500 + n, { height: null })),
  }).reader.bitcoin(address, [], anchor);
  assert.equal(fullPending.mempoolComplete, false);
  assert.equal(fullPending.events.length, 50);
});

test("event and canonical-height caps retain evidence with incomplete flags instead of claiming all history", async () => {
  const manyOutputs = transaction(600, { outputs: Array.from({ length: 201 }, () => output(1)) });
  const capped = await fixture({ confirmed: [manyOutputs] }).reader.bitcoin(address, [], anchor);
  assert.equal(capped.events.length, 200);
  assert.equal(capped.historyComplete, false);
  assert.equal(capped.mempoolComplete, false);
  assert.equal(new Set(capped.events.map((event) => event.eventId)).size, 200);
  const { reader, calls } = fixture({
    confirmed: Array.from({ length: 13 }, (_, n) => transaction(610 + n, { height: 100 + n })),
  });
  const heightCapped = await reader.bitcoin(address, [], anchor);
  assert.equal(heightCapped.events.length, 12);
  assert.equal(heightCapped.historyComplete, false);
  assert.equal(calls.filter((call) => call.path.includes("block-height")).length, 12);
});

test("satoshi values must be finite exact integers within Bitcoin supply bounds; zero is never a deposit", async () => {
  for (const value of [
    -1,
    0.25,
    "1",
    null,
    Number.MAX_SAFE_INTEGER + 1,
    2_100_000_000_000_001,
    Infinity,
    NaN,
  ]) {
    await assert.rejects(
      fixture({
        pending: [transaction(700, { height: null, outputs: [output(value)] })],
      }).reader.bitcoin(address, [], anchor),
    );
  }
  const result = await fixture({
    pending: [
      transaction(701, { height: null, outputs: [output(0), output(2_099_999_999_999_999)] }),
    ],
  }).reader.bitcoin(address, [], anchor);
  assert.deepEqual(
    result.events.map((event) => event.quantity),
    ["2099999999999999"],
  );
  await assert.rejects(
    fixture({
      confirmed: [transaction(702, { outputs: Array.from({ length: 10_001 }, () => output()) })],
    }).reader.bitcoin(address, [], anchor),
  );
});

test("only a positive canonical block mismatch marks a known event reorged; absence proves neither zero nor orphaning", async () => {
  const old = previous(800);
  const pending = previous(801, { height: null, state: "pending" });
  const otherProtocol = previous(802, { protocol: "counterparty" });
  const otherDestination = previous(803, { destination: otherAddress });
  const result = await fixture({
    canonicalAt: (height) => (height === 2 ? hash(999) : canonical(height)),
  }).reader.bitcoin(address, [old, pending, otherProtocol, otherDestination], anchor);
  assert.deepEqual(result.orphanedEventIds, [old.eventId]);
  assert.deepEqual(result.events, []);
  const empty = await fixture().reader.bitcoin(address, [pending], anchor);
  assert.deepEqual(empty.orphanedEventIds, []);
  assert.deepEqual(empty.events, []);
});

test("canonical known confirmed outputs remain observed after aging beyond the newest bounded history window", async () => {
  const old = previous(900);
  const first = Array.from({ length: 25 }, (_, n) => transaction(1_000 + n));
  const second = Array.from({ length: 25 }, (_, n) => transaction(1_100 + n));
  const { reader, calls } = fixture({ confirmed: first, second });
  const result = await reader.bitcoin(address, [old], anchor);
  const retained = result.events.find((event) => event.eventId === old.eventId);
  assert.equal(retained.quantity, old.quantity);
  assert.deepEqual(retained.block, old.block);
  assert.equal(result.events.length, 51);
  assert.deepEqual(result.orphanedEventIds, []);
  assert.equal(result.historyComplete, false);
  assert.ok(calls.some((call) => call.path === "/api/block-height/2"));
});

test("a lower indexer anchor is bounded unknown and is not positive evidence of a reorg", async () => {
  const future = previous(1_200, { height: 301 });
  const result = await fixture().reader.bitcoin(address, [future], anchor);
  assert.deepEqual(result.orphanedEventIds, []);
  assert.deepEqual(result.events, []);
  assert.equal(result.historyComplete, false);
});

test("a formerly confirmed output now pending still checks its old canonical block without duplicating the event", async () => {
  const old = previous(1_300);
  const pending = transaction(1_300, { height: null, outputs: [output(17)] });
  for (const changed of [false, true]) {
    const result = await fixture({
      pending: [pending],
      canonicalAt: (height) =>
        changed && height === old.block.height ? hash(999) : canonical(height),
    }).reader.bitcoin(address, [old], anchor);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].eventId, old.eventId);
    assert.equal(result.events[0].quantity, old.quantity);
    assert.equal(result.events[0].block, null);
    assert.deepEqual(result.orphanedEventIds, changed ? [old.eventId] : []);
  }
});

test("a pending echo cannot downgrade a known confirmation whose old block cannot be rechecked within the scan", async () => {
  for (const { height, confirmed } of [
    {
      height: 2,
      confirmed: Array.from({ length: 12 }, (_, n) => transaction(1_400 + n, { height: 100 + n })),
    },
    { height: 301, confirmed: [] },
  ]) {
    const old = previous(1_500, { height });
    const result = await fixture({
      pending: [transaction(1_500, { height: null, outputs: [output(17)] })],
      confirmed,
    }).reader.bitcoin(address, [old], anchor);
    assert.equal(
      result.events.some((event) => event.eventId === old.eventId),
      false,
    );
    assert.deepEqual(result.orphanedEventIds, []);
    assert.equal(result.historyComplete, false);
    assert.equal(result.mempoolComplete, false);
  }
});

test("anchor checks bypass cached hashes and reject a moving tip or replaced anchor block", async () => {
  for (const options of [
    { tip: { height: 301, hash: canonical(301) } },
    { canonicalAt: () => hash(999) },
  ]) {
    const { reader } = fixture(options);
    await assert.rejects(reader.assertAnchor(anchor), /anchor moved/);
  }
  let reads = 0;
  const { reader } = fixture({
    override: (path) =>
      path === "/api/block-height/300" ? text(++reads === 1 ? anchor.hash : hash(999)) : null,
  });
  assert.equal(await reader.canonicalHash(300), anchor.hash);
  assert.equal(await reader.canonicalHash(300), anchor.hash);
  await assert.rejects(reader.assertAnchor(anchor), /anchor moved/);
  assert.equal(reads, 2);
  await assert.rejects(
    fixture({ details: { height: 300, hash: hash(999) } }).reader.tip(),
    /tip changed/,
  );
});

test("chain transport only permits fixed HTTPS mainnet origins and GET with no credentials or redirects", async () => {
  let calls = 0;
  for (const url of [
    "http://blockstream.info/api/blocks/tip/hash",
    "https://evil.invalid/api/",
    "https://blockstream.info:444/api/",
    "https://u:p@blockstream.info/api/",
    "https://blockstream.info/api/x#fragment",
    "https://blockstream.info/elsewhere",
    "https://api.counterparty.io:4000/api/x",
  ]) {
    await assert.rejects(
      chainRead(url, "json", {
        fetch: async () => {
          calls++;
          return json({});
        },
      }),
    );
  }
  assert.equal(calls, 0);
  for (const origin of [ESPLORA_ORIGIN, COUNTERPARTY_ORIGIN]) {
    const url = `${origin}${origin === ESPLORA_ORIGIN ? "/api/" : "/v2/"}test`;
    let signal;
    assert.deepEqual(
      await chainRead(url, "json", {
        fetch: async (requested, options) => {
          assert.equal(requested, url);
          assert.equal(options.method, "GET");
          assert.equal(options.redirect, "error");
          assert.equal(options.credentials, "omit");
          assert.equal(options.cache, "no-store");
          assert.equal(options.headers.Accept, "application/json");
          signal = options.signal;
          return json({ exact: "18446744073709551615" });
        },
      }),
      { exact: "18446744073709551615" },
    );
    assert.equal(signal.aborted, true);
  }
});

test("redirects, changed final URLs, wrong content types and unsuccessful responses remain unavailable", async () => {
  const redirected = json({});
  Object.defineProperty(redirected, "redirected", { value: true });
  const changed = json({});
  Object.defineProperty(changed, "url", { value: `${ESPLORA_ORIGIN}/api/other` });
  for (const response of [
    redirected,
    changed,
    new Response("redirect", { status: 302, headers: { location: "https://evil.invalid" } }),
    new Response("bad", { status: 503 }),
    new Response("{}", { headers: { "content-type": "text/html" } }),
    new Response("{}", { headers: { "content-type": "text/plain" } }),
  ]) {
    await assert.rejects(
      chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", { fetch: async () => response }),
    );
  }
  assert.deepEqual(
    await chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", {
      fetch: async () => json({ yes: true }, { "content-type": "application/json; charset=utf-8" }),
    }),
    { yes: true },
  );
});

test("chain body size, UTF-8 and JSON validation apply to the streamed body as well as headers", async () => {
  for (const length of ["2097153", "-1", "infinite", "1.5"])
    await assert.rejects(
      chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", {
        fetch: async () => json({}, { "content-length": length }),
      }),
      /large/,
    );
  for (const response of [
    new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
      headers: { "content-type": "application/json", "content-length": "1" },
    }),
    new Response(null, { headers: { "content-type": "application/json" } }),
    new Response(new Uint8Array([255]), { headers: { "content-type": "application/json" } }),
  ]) {
    await assert.rejects(
      chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", { fetch: async () => response }),
    );
  }
  await assert.rejects(
    chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", {
      fetch: async () => new Response("{", { headers: { "content-type": "application/json" } }),
    }),
  );
});

test("the deadline includes stalled fetch and stalled body reads, and cancellation never initiates a pre-aborted request", async () => {
  let signal;
  await assert.rejects(
    chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", {
      timeoutMs: 5,
      fetch: async (_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    }),
    /timed out/,
  );
  assert.equal(signal.aborted, true);
  await assert.rejects(
    chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", {
      timeoutMs: 5,
      fetch: async () =>
        new Response(new ReadableStream({ start() {} }), {
          headers: { "content-type": "application/json" },
        }),
    }),
    /timed out/,
  );
  const cancelled = new AbortController();
  cancelled.abort();
  let called = false;
  await assert.rejects(
    chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", {
      signal: cancelled.signal,
      fetch: async () => {
        called = true;
        return json({});
      },
    }),
    /cancelled/,
  );
  assert.equal(called, false);
  const during = new AbortController();
  const operation = chainRead(`${ESPLORA_ORIGIN}/api/test`, "json", {
    signal: during.signal,
    fetch: async (_url, options) => {
      during.abort();
      assert.equal(options.signal.aborted, true);
      throw new DOMException("Aborted", "AbortError");
    },
  });
  await assert.rejects(operation, /Aborted/);
});
