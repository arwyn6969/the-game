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
after(() => server.close());
const { observeCounterparty } = await server.ssrLoadModule(
  "/src/lib/agent-wallets/counterparty-observer.server.ts",
);
const address = "bc1qt5ptvaw0h55v58t06cz270akcc8l5ae37l84vw";
const other = "bc1qg40tcjxaj66xnyzfypzttxez0l5dnfpzxtmtqu";
const origin = "https://api.counterparty.io:4000";
const hash = (n) => BigInt(n).toString(16).padStart(64, "0");
const anchor = { height: 900_000, hash: hash(900_000) };
const json = (value, extra = {}) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    ...extra,
  });
const row = (n = 1, extra = {}) => ({
  tx_index: n,
  tx_hash: hash(n),
  block_index: anchor.height - 1,
  source: other,
  destination: address,
  asset: "A7337447728884561000",
  quantity: 1,
  status: "valid",
  msg_index: 0,
  memo: null,
  fee_paid: 0,
  send_type: "send",
  source_address: null,
  destination_address: null,
  ...extra,
});
const pending = (n = 2, extra = {}) => ({
  tx_hash: hash(n),
  event: "ENHANCED_SEND",
  params: row(n, { block_index: 9_999_999, ...extra }),
  timestamp: 1_800_000_000.123,
});
const page = (rows = [], next = null) => ({
  result: rows,
  next_cursor: next,
  result_count: rows.length,
});
function fixture(options = {}) {
  const calls = [];
  const canonicalCalls = [];
  let rootCalls = 0;
  const fetch = async (raw, init) => {
    const url = new URL(raw);
    calls.push({ url: url.href, init });
    assert.equal(url.origin, origin);
    if (options.response) {
      const response = options.response(url, init);
      if (response) return response;
    }
    if (url.pathname === "/v2/") {
      rootCalls++;
      return json({
        result: {
          server_ready: true,
          network: "mainnet",
          version: "11.5.0",
          backend_height: anchor.height,
          counterparty_height: anchor.height,
          ledger_state: "Following",
          ...(options.root?.(rootCalls) ?? {}),
        },
      });
    }
    if (url.pathname.startsWith("/v2/blocks/")) {
      const height = Number(url.pathname.split("/").at(-1));
      return json({
        result: {
          block_index: height,
          block_hash: options.blockHash?.(height, calls) ?? hash(height),
          previous_block_hash: hash(height - 1),
          block_time: 1_800_000_000,
        },
      });
    }
    if (url.pathname.endsWith("/receives")) {
      assert.equal(url.searchParams.get("send_type"), "send");
      assert.equal(url.searchParams.get("limit"), "100");
      return json(options.history?.(url.searchParams.get("cursor")) ?? page());
    }
    assert.equal(url.pathname, "/v2/addresses/mempool");
    assert.equal(url.searchParams.get("addresses"), address);
    assert.equal(url.searchParams.get("event_name"), "SEND,ENHANCED_SEND,MPMA_SEND");
    return json(options.mempool?.(url.searchParams.get("cursor")) ?? page());
  };
  const canonical = async (height) => {
    canonicalCalls.push(height);
    return options.canonical?.(height) ?? hash(height);
  };
  return {
    calls,
    canonicalCalls,
    run: (known = [], extra = {}) =>
      observeCounterparty(address, known, anchor, canonical, { fetch, ...extra }),
  };
}

test("fixed HTTPS GET feeds produce raw confirmed and pending protocol observations", async () => {
  const h = fixture({ history: () => page([row()]), mempool: () => page([pending()]) });
  const scan = await h.run();
  assert.equal(scan.protocol, "counterparty");
  assert.equal(scan.indexedHeight, anchor.height);
  assert.equal(scan.historyComplete, true);
  assert.equal(scan.mempoolComplete, true);
  assert.equal(scan.events.length, 2);
  assert.equal(scan.events[0].eventId, `counterparty:${hash(1)}:0`);
  assert.equal(scan.events[0].asset, "A7337447728884561000");
  assert.equal(scan.events[0].quantity, "1");
  assert.deepEqual(scan.events[0].block, {
    height: anchor.height - 1,
    hash: hash(anchor.height - 1),
  });
  assert.equal(scan.events[1].block, null);
  assert.deepEqual(scan.orphanedEventIds, []);
  assert.ok(
    h.calls.every(
      ({ init }) =>
        init.method === "GET" &&
        init.redirect === "manual" &&
        init.cache === "no-store" &&
        init.credentials === "omit",
    ),
  );
});

test("MPMA legs keep distinct message indexes and uint64 quantities remain lossless", async () => {
  const h = fixture({
    history: () =>
      page([
        row(1, { quantity: "18446744073709551615" }),
        row(1, { msg_index: 1, quantity: "9007199254740993" }),
      ]),
  });
  const scan = await h.run();
  assert.equal(new Set(scan.events.map((event) => event.eventId)).size, 2);
  assert.deepEqual(
    scan.events.map((event) => event.quantity),
    ["18446744073709551615", "9007199254740993"],
  );
});

test("invalid sends, zero quantities, other send types and outgoing pending sends never become receipts", async () => {
  const h = fixture({
    history: () =>
      page([
        row(1, { status: "invalid: insufficient funds" }),
        row(3, { quantity: 0 }),
        row(4, { send_type: "detach" }),
      ]),
    mempool: () => page([pending(5, { source: address, destination: other })]),
  });
  const scan = await h.run();
  assert.deepEqual(scan.events, []);
  assert.equal(scan.historyComplete, true);
  assert.equal(scan.mempoolComplete, true);
});

test("a foreign recipient in the confirmed receives route is invalid rather than a complete empty history", async () => {
  const h = fixture({ history: () => page([row(2, { destination: other })]) });
  await assert.rejects(h.run(), /Invalid Counterparty observation response/);
});

test("unsafe quantities and malformed message identities reject the response", async () => {
  for (const extra of [
    { quantity: 9_007_199_254_740_992 },
    { quantity: "18446744073709551616" },
    { quantity: "01" },
    { quantity: "1.0" },
    { quantity: -1 },
    { msg_index: -1 },
    { msg_index: "0" },
    { tx_hash: "not-a-hash" },
    { asset: "untrusted\nasset" },
    { block_index: anchor.height + 1 },
  ])
    await assert.rejects(fixture({ history: () => page([row(1, extra)]) }).run());
});

test("confirmed cursor paging follows next_cursor without offset or sort", async () => {
  const h = fixture({
    history: (cursor) => (cursor === null ? page([row(2)], 700) : page([row(1)], null)),
  });
  const scan = await h.run();
  assert.equal(scan.historyComplete, true);
  assert.equal(scan.events.length, 2);
  const history = h.calls.filter(({ url }) => url.includes("/receives?"));
  assert.equal(new URL(history[1].url).searchParams.get("cursor"), "700");
  assert.ok(history.every(({ url }) => !url.includes("offset=") && !url.includes("sort=")));
});

test("page caps and cyclic cursors retain observations while explicitly marking partial scans", async () => {
  for (const cycle of [false, true]) {
    const h = fixture({
      history: (cursor) =>
        page([row(cursor === null ? 2 : 1)], cycle ? 700 : cursor === null ? 700 : 600),
      mempool: (cursor) => page([pending(cursor === null ? 4 : 3)], 900),
    });
    const scan = await h.run();
    assert.equal(scan.historyComplete, false);
    assert.equal(scan.mempoolComplete, false);
    assert.equal(scan.events.length, 4);
    assert.equal(h.calls.filter(({ url }) => url.includes("/receives?")).length, 2);
    assert.equal(h.calls.filter(({ url }) => url.includes("/mempool?")).length, 2);
  }
});

test("the merged event cap is bounded and never reports a truncated mempool as complete", async () => {
  const h = fixture({
    history: (cursor) =>
      page(
        Array.from({ length: 100 }, (_, i) => row(i + (cursor === null ? 1 : 101))),
        cursor === null ? 900 : null,
      ),
    mempool: () => page([pending(999)]),
  });
  const scan = await h.run();
  assert.equal(scan.events.length, 200);
  assert.equal(scan.historyComplete, true);
  assert.equal(scan.mempoolComplete, false);
});

test("known old-block mismatch supplies positive reorg evidence even when history omits it", async () => {
  const h = fixture();
  const old = {
    eventId: `counterparty:${hash(1)}:0`,
    protocol: "counterparty",
    txid: hash(1),
    eventIndex: 0,
    source: other,
    destination: address,
    asset: "A7337447728884561000",
    quantity: "1",
    block: { height: anchor.height - 1, hash: hash(500) },
    state: "confirmed",
    firstObservedAt: 1,
    lastObservedAt: 1,
    wasReorged: false,
  };
  const scan = await h.run([
    old,
    { ...old, eventId: `counterparty:${hash(2)}:0`, txid: hash(2), block: null, state: "pending" },
  ]);
  assert.deepEqual(scan.orphanedEventIds, [old.eventId]);
  assert.equal(scan.events.length, 0);
});

test("missing pending transactions and same-chain missing confirmed rows are not reorg proof", async () => {
  const old = {
    eventId: `counterparty:${hash(1)}:0`,
    protocol: "counterparty",
    txid: hash(1),
    eventIndex: 0,
    source: other,
    destination: address,
    asset: "A7337447728884561000",
    quantity: "1",
    block: { height: anchor.height - 1, hash: hash(anchor.height - 1) },
    state: "confirmed",
    firstObservedAt: 1,
    lastObservedAt: 1,
    wasReorged: false,
  };
  assert.deepEqual(
    (await fixture().run([old, { ...old, block: null, state: "pending" }])).orphanedEventIds,
    [],
  );
});

test("a known block above the current anchor suppresses its pending row without inventing reorg evidence", async () => {
  const h = fixture({ mempool: () => page([pending(1)]) });
  const old = {
    eventId: `counterparty:${hash(1)}:0`,
    protocol: "counterparty",
    txid: hash(1),
    eventIndex: 0,
    source: other,
    destination: address,
    asset: "A7337447728884561000",
    quantity: "1",
    block: { height: anchor.height + 1, hash: hash(999) },
    state: "confirmed",
    firstObservedAt: 1,
    lastObservedAt: 1,
    wasReorged: false,
  };
  const scan = await h.run([old]);
  assert.equal(scan.historyComplete, false);
  assert.equal(scan.mempoolComplete, false);
  assert.deepEqual(scan.events, []);
  assert.deepEqual(scan.orphanedEventIds, []);
  assert.equal(h.canonicalCalls.includes(anchor.height + 1), false);
});

test("the canonical-height budget cannot refresh an unchecked old confirmation through a pending row", async () => {
  const h = fixture({ mempool: () => page([pending(12)]) });
  const known = Array.from({ length: 12 }, (_, i) => ({
    eventId: `counterparty:${hash(i + 1)}:0`,
    protocol: "counterparty",
    txid: hash(i + 1),
    eventIndex: 0,
    source: other,
    destination: address,
    asset: "A7337447728884561000",
    quantity: "1",
    block: { height: anchor.height - i - 1, hash: hash(anchor.height - i - 1) },
    state: "confirmed",
    firstObservedAt: 1,
    lastObservedAt: 1,
    wasReorged: false,
  }));
  const scan = await h.run(known);
  assert.equal(scan.historyComplete, false);
  assert.equal(scan.mempoolComplete, false);
  assert.deepEqual(scan.events, []);
  assert.deepEqual(scan.orphanedEventIds, []);
  assert.equal(h.canonicalCalls.length, 12);
  assert.equal(h.canonicalCalls.includes(known[11].block.height), false);
});

test("canonical-height checks have a strict twelve-height budget", async () => {
  const h = fixture({
    history: () =>
      page(
        Array.from({ length: 20 }, (_, i) => row(i + 1, { block_index: anchor.height - i - 1 })),
      ),
  });
  const scan = await h.run();
  assert.equal(scan.historyComplete, false);
  assert.equal(scan.events.length, 11);
  assert.equal(h.canonicalCalls.length, 12);
  assert.ok(h.calls.length <= 19);
});

test("unready, wrong-network, lagging and moving indexers fail closed", async () => {
  for (const root of [
    () => ({ server_ready: false }),
    () => ({ network: "testnet" }),
    () => ({ ledger_state: "Catching Up" }),
    () => ({ counterparty_height: anchor.height - 2 }),
    (n) => ({ backend_height: anchor.height + (n > 1 ? 1 : 0) }),
  ])
    await assert.rejects(fixture({ root }).run());
  await assert.rejects(fixture({ blockHash: () => hash(400) }).run());
  let anchorReads = 0;
  await assert.rejects(
    fixture({
      blockHash: (height) =>
        height === anchor.height && ++anchorReads > 1 ? hash(800) : hash(height),
    }).run(),
  );
});

test("duplicate legs deduplicate identically and conflicting payloads fail closed", async () => {
  const h = fixture({ history: () => page([row(), row()]), mempool: () => page([pending(1)]) });
  const scan = await h.run();
  assert.equal(scan.events.length, 1);
  assert.notEqual(scan.events[0].block, null);
  await assert.rejects(fixture({ history: () => page([row(), row(1, { quantity: 2 })]) }).run());
});

test("malformed envelopes, cursor metadata and inconsistent pending wrappers fail closed", async () => {
  for (const history of [
    () => ({}),
    () => ({ result: [], next_cursor: "bad" }),
    () => ({ result: [], next_cursor: 1 }),
    () => ({ result: [], next_cursor: null, error: "upstream failure" }),
    () => page(Array.from({ length: 101 }, (_, i) => row(i + 1))),
  ])
    await assert.rejects(fixture({ history }).run());
  await assert.rejects(
    fixture({ mempool: () => page([{ ...pending(), tx_hash: hash(9) }]) }).run(),
  );
  await assert.rejects(
    fixture({ mempool: () => page([pending(2, { block_index: anchor.height })]) }).run(),
  );
});

test("outages, wrong MIME, redirects, cancellation and a never-resolving fetch cannot manufacture an empty scan", async () => {
  for (const response of [
    () => json({}, { status: 503 }),
    () => new Response("{}", { headers: { "content-type": "text/html" } }),
    () => {
      const r = json({});
      Object.defineProperty(r, "redirected", { value: true });
      return r;
    },
  ])
    await assert.rejects(fixture({ response }).run());
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(fixture().run([], { signal: aborted.signal }));
  await assert.rejects(
    observeCounterparty(address, [], anchor, async (hash) => String(hash), {
      fetch: () => new Promise(() => {}),
      timeoutMs: 5,
    }),
  );
});

test("unsupported addresses fail before any remote request", async () => {
  let called = false;
  await assert.rejects(
    observeCounterparty("http://127.0.0.1/", [], anchor, async () => hash(1), {
      fetch: async () => {
        called = true;
        return json({});
      },
    }),
  );
  assert.equal(called, false);
});
