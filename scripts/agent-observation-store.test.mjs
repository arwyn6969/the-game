import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
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
const { SqlAgentObservationStore } = await server.ssrLoadModule(
  "/src/lib/agent-wallets/observation-store.server.ts",
);
const { SqlAgentRegistryStore } = await server.ssrLoadModule(
  "/src/lib/agent-wallets/store.server.ts",
);
const { AGENT_IDS } = await server.ssrLoadModule("/src/game/types.ts");
const database = new PGlite();
const sql = { query: async (text, params) => (await database.query(text, params)).rows };
const store = new SqlAgentObservationStore(sql),
  registry = new SqlAgentRegistryStore(sql);
before(async () => {
  for (const name of [
    "auth/0001_auth.sql",
    "20261016_agent_registry.sql",
    "20261017_agent_observations.sql",
  ])
    await database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
});
beforeEach(async () => {
  await database.exec(
    'truncate agent_receiving_observations,agent_receiving_address_reservations,agent_receiving_profiles,agent_registered_residents,agent_registered_worlds,"user" cascade',
  );
  await database.query(
    'insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true),($3,$3,$4,true)',
    ["owner-one", "one@example.invalid", "owner-two", "two@example.invalid"],
  );
});
after(async () => {
  await database.close();
  await server.close();
});
const now = 1_800_000_000_000;
const hex = (n) => BigInt(n).toString(16).padStart(64, "0");
const addresses = Array.from({ length: 30 }, (_, i) => {
  const key = createECDH("secp256k1");
  key.setPrivateKey(Buffer.from(hex(i + 1), "hex"));
  return Address.convertPubKeyIntoAddress(key.getPublicKey(undefined, "compressed"), "p2wpkh")
    .mainnet;
});
const anchor = { height: 900_000, hash: hex(900_000) };
const code = (value) => (error) => error.code === value;
const event = (index = 1, protocol = "bitcoin", extra = {}) => ({
  eventId: `${protocol}:${hex(index)}:0`,
  protocol,
  txid: hex(index),
  eventIndex: 0,
  source: null,
  destination: addresses[0],
  asset: protocol === "bitcoin" ? "BTC" : "A7337447728884561000",
  quantity: "1",
  block: anchor,
  ...extra,
});
const scan = (protocol = "bitcoin", events = [], extra = {}) => ({
  protocol,
  anchor,
  indexedHeight: anchor.height,
  historyComplete: true,
  mempoolComplete: true,
  events,
  orphanedEventIds: [],
  ...extra,
});
const results = (events = [], cp = []) => ({
  bitcoin: scan("bitcoin", events),
  counterparty: scan("counterparty", cp),
});
async function setup(count = 1, owner = "owner-one") {
  const world = await registry.registerWorld(
    owner,
    {
      sourceWorldId: `world_${hex(1)}`,
      title: "Observer fixture",
      characters: AGENT_IDS.map((role, i) => ({
        role,
        sourceCharacterId: `character_${hex(i + 1)}`,
        name: role,
      })),
    },
    now,
  );
  const profile = (await registry.getWorld(owner, world.registrationId)).profiles[0];
  for (let i = 0; i < count; i++)
    await database.query(
      "insert into agent_receiving_address_reservations(network,address,profile_id,first_verified_at,last_verified_at) values('mainnet',$1,$2,$3,$4)",
      [addresses[i], profile.profileId, now, now + i],
    );
  if (count)
    await database.query(
      "update agent_receiving_profiles set address=$1,verified_at=$2,state='draft',revision=1 where profile_id=$3",
      [addresses[0], now, profile.profileId],
    );
  const args = [owner, world.registrationId, profile.profileId, count ? 1 : 0];
  return {
    owner,
    world,
    profile,
    args,
    load: (address, addressPage) => store.load(...args, address, addressPage),
    claim: (at = now, address = addresses[0]) => store.claim(...args, address, at),
    complete: (lease, value, at = now, address = addresses[0]) =>
      store.complete(...args, address, lease.token, value, at),
  };
}

test("empty profiles load private not-checked sources and reject another owner or stale revision", async () => {
  const h = await setup(0),
    view = await h.load();
  assert.equal(view.address, null);
  assert.equal(view.fundingPublished, false);
  assert.equal(view.addressPages, 1);
  assert.deepEqual(view.events, []);
  assert.deepEqual(
    view.sources.map((s) => s.status),
    ["not-checked", "not-checked"],
  );
  await assert.rejects(store.load("owner-two", ...h.args.slice(1)), code("stale"));
  await assert.rejects(store.load(...h.args.slice(0, 3), 1), code("stale"));
  assert.equal(await h.claim(), null);
});

test("address pages are bounded, current-first, history-aware and reject selection outside the returned page", async () => {
  const h = await setup(25),
    first = await h.load(),
    second = await h.load(undefined, 2);
  assert.equal(first.addresses.length, 20);
  assert.equal(first.addressPages, 2);
  assert.equal(first.address, addresses[0]);
  assert.equal(first.addresses[0].current, true);
  assert.equal(first.addresses[1].address, addresses[24]);
  assert.equal(second.addresses.length, 5);
  assert.equal(second.address, addresses[5]);
  assert.equal((await h.load(addresses[3], 2)).address, addresses[3]);
  await assert.rejects(h.load(addresses[0], 2), code("invalid"));
  await assert.rejects(h.load(addresses[29]), code("invalid"));
  await assert.rejects(h.load(undefined, 3), code("invalid"));
});

test("concurrent refresh claims enforce per-address leases and durable thirty-second cooldowns", async () => {
  const h = await setup(2),
    claims = await Promise.all(Array.from({ length: 6 }, () => h.claim()));
  assert.equal(claims.filter(Boolean).length, 1);
  const lease = claims.find(Boolean);
  assert.match(lease.token, /^[0-9a-f]{64}$/);
  assert.deepEqual(lease.known, []);
  assert.ok(await h.claim(now, addresses[1]));
  assert.equal(await h.complete(lease, results()), true);
  assert.equal(await h.claim(now + 29_999), null);
  assert.ok(await h.claim(now + 30_000));
  assert.equal(
    await store.claim("owner-two", ...h.args.slice(1), addresses[0], now + 60_000),
    null,
  );
});

test("completion atomically records both protocols and preserves exact integer quantities", async () => {
  const h = await setup(),
    lease = await h.claim();
  assert.equal(
    await h.complete(
      lease,
      results(
        [event(1, "bitcoin", { quantity: "2100000000000000" })],
        [event(2, "counterparty", { quantity: "18446744073709551615", block: null })],
      ),
    ),
    true,
  );
  const view = await h.load();
  assert.equal(view.events.length, 2);
  assert.deepEqual(
    view.sources.map((s) => s.status),
    ["ready", "ready"],
  );
  assert.equal(view.events[0].quantity, "2100000000000000");
  assert.equal(view.events[1].state, "pending");
  assert.equal(await h.complete(lease, results()), false);
  const next = await h.claim(now + 30_000);
  assert.equal(next.known.length, 2);
});

test("a lagging parsed height marks source status partial while preserving terminal pagination flags", async () => {
  const h = await setup(),
    lease = await h.claim();
  const parsed = { height: anchor.height - 1, hash: hex(anchor.height - 1) };
  await h.complete(lease, {
    bitcoin: scan("bitcoin"),
    counterparty: scan("counterparty", [event(1, "counterparty", { block: parsed })], {
      indexedHeight: parsed.height,
    }),
  });
  const cp = (await h.load()).sources[1];
  assert.equal(cp.status, "partial");
  assert.equal(cp.indexedHeight, anchor.height - 1);
  assert.equal(cp.historyComplete, true);
  assert.equal(cp.mempoolComplete, true);
});

test("expired, replaced and replayed leases cannot apply an out-of-order completion", async () => {
  const h = await setup(),
    old = await h.claim();
  assert.equal(await h.complete(old, results(), now + 45_000), false);
  const fresh = await h.claim(now + 45_000);
  assert.ok(fresh);
  assert.notEqual(fresh.token, old.token);
  assert.equal(await h.complete(old, results([event(1)]), now + 45_001), false);
  assert.equal(await h.complete(fresh, results([event(2)]), now + 45_002), true);
  assert.deepEqual(
    (await h.load()).events.map((e) => e.txid),
    [hex(2)],
  );
});

test("profile revisions invalidate pending work while retired historical addresses remain observable", async () => {
  const h = await setup(2),
    lease = await h.claim();
  assert.equal(await registry.retireProfile(...h.args, now + 1), true);
  assert.equal(await h.complete(lease, results([event(1)]), now + 2), false);
  await assert.rejects(h.load(), code("stale"));
  assert.equal(await h.claim(now + 46_000), null);
  const retiredArgs = [...h.args.slice(0, 3), 2];
  const view = await store.load(...retiredArgs, addresses[1]);
  assert.equal(view.addresses.length, 2);
  const later = await store.claim(...retiredArgs, addresses[1], now + 46_000);
  assert.ok(later);
  assert.equal(
    await store.complete(
      ...retiredArgs,
      addresses[1],
      later.token,
      results([event(1, "bitcoin", { destination: addresses[1] })]),
      now + 46_001,
    ),
    true,
  );
});

test("source outages retain observations and old checkpoints while making pending status unknown", async () => {
  const h = await setup();
  await h.complete(await h.claim(), results([event(1), event(2, "bitcoin", { block: null })]));
  const lease = await h.claim(now + 30_000);
  assert.equal(await h.complete(lease, { bitcoin: null, counterparty: null }, now + 30_001), true);
  const view = await h.load(),
    btc = view.sources[0];
  assert.equal(btc.status, "unavailable");
  assert.equal(btc.observedAt, now);
  assert.equal(btc.attemptedAt, now + 30_001);
  assert.deepEqual(btc.anchor, anchor);
  assert.equal(view.events.find((e) => e.txid === hex(1)).state, "confirmed");
  assert.equal(view.events.find((e) => e.txid === hex(2)).state, "unknown");
});

test("missing pending events become unknown and unseen confirmed events are never silently deleted or reorged", async () => {
  const h = await setup();
  await h.complete(await h.claim(), results([event(1), event(2, "bitcoin", { block: null })]));
  await h.complete(await h.claim(now + 30_000), results(), now + 30_001);
  const view = await h.load();
  assert.equal(view.events.length, 2);
  assert.equal(view.events.find((e) => e.txid === hex(1)).state, "confirmed");
  assert.equal(view.events.find((e) => e.txid === hex(2)).state, "unknown");
  assert.equal(
    view.events.every((e) => !e.wasReorged),
    true,
  );
});

test("only explicit orphan evidence marks reorgs and a later canonical inclusion keeps the reorg history", async () => {
  const h = await setup();
  await h.complete(await h.claim(), results([event(1)]));
  const orphan = event(1).eventId;
  await h.complete(
    await h.claim(now + 30_000),
    { bitcoin: scan("bitcoin", [], { orphanedEventIds: [orphan] }), counterparty: null },
    now + 30_001,
  );
  let e = (await h.load()).events[0];
  assert.equal(e.state, "reorged");
  assert.equal(e.wasReorged, true);
  const newBlock = { height: anchor.height - 1, hash: hex(800) };
  await h.complete(
    await h.claim(now + 60_000),
    results([event(1, "bitcoin", { block: newBlock })]),
    now + 60_001,
  );
  e = (await h.load()).events[0];
  assert.equal(e.state, "confirmed");
  assert.equal(e.wasReorged, true);
  assert.deepEqual(e.block, newBlock);
  assert.equal(e.firstObservedAt, now);
});

test("a positively orphaned confirmation can return to pending while retaining its prior-reorg marker", async () => {
  const h = await setup();
  await h.complete(await h.claim(), results([event(1)]));
  await h.complete(
    await h.claim(now + 30_000),
    {
      bitcoin: scan("bitcoin", [event(1, "bitcoin", { block: null })], {
        orphanedEventIds: [event(1).eventId],
      }),
      counterparty: null,
    },
    now + 30_001,
  );
  const e = (await h.load()).events[0];
  assert.equal(e.state, "pending");
  assert.equal(e.block, null);
  assert.equal(e.wasReorged, true);
  assert.equal(e.firstObservedAt, now);
});

test("event identity conflicts preserve the original payload and mark source and event unknown", async () => {
  const h = await setup();
  await h.complete(await h.claim(), results([event(1)]));
  await h.complete(
    await h.claim(now + 30_000),
    results([event(1, "bitcoin", { quantity: "2" })]),
    now + 30_001,
  );
  const view = await h.load();
  assert.equal(view.events[0].quantity, "1");
  assert.equal(view.events[0].state, "unknown");
  assert.equal(view.sources[0].status, "partial");
});

test("storage retains at most 256 observations, exposes only 100 and marks overflow partial", async () => {
  const h = await setup(),
    btc = Array.from({ length: 200 }, (_, i) => event(i + 1)),
    cp = Array.from({ length: 100 }, (_, i) => event(i + 300, "counterparty"));
  await h.complete(await h.claim(), results(btc, cp));
  const view = await h.load();
  assert.equal(view.events.length, 100);
  assert.equal(view.hasMoreEvents, true);
  assert.equal(view.sources[1].status, "partial");
  const next = await h.claim(now + 30_000);
  assert.equal(next.known.length, 256);
  await h.complete(next, results([event(999)]), now + 30_001);
  assert.equal((await h.claim(now + 60_000)).known.length, 256);
  assert.equal((await h.load()).sources[0].status, "partial");
});

test("invalid destination, keys, protocol, quantities, indices and block shapes fail before mutation", async () => {
  const h = await setup(),
    lease = await h.claim();
  for (const extra of [
    { destination: addresses[1] },
    { eventId: "bitcoin:wrong:0" },
    { protocol: "counterparty" },
    { quantity: 1 },
    { quantity: "01" },
    { quantity: "0" },
    { quantity: "18446744073709551616" },
    { quantity: "2100000000000001" },
    { eventIndex: -1 },
    { txid: "bad" },
    { asset: "XCP" },
    { block: { height: 900_001, hash: hex(1) } },
  ])
    await assert.rejects(h.complete(lease, results([event(1, "bitcoin", extra)])), code("invalid"));
  assert.equal((await h.load()).sources[0].status, "not-checked");
  assert.equal(await h.complete(lease, results([event(1)])), true);
});

test("competing completions of the same claim apply exactly one coherent result", async () => {
  const h = await setup(),
    lease = await h.claim();
  const done = await Promise.all([
    h.complete(lease, results([event(1)])),
    h.complete(lease, results([event(2)])),
  ]);
  assert.equal(done.filter(Boolean).length, 1);
  assert.equal((await h.load()).events.length, 1);
});

test("a revision change between completion read and final CAS cannot install stale observations", async () => {
  const h = await setup(),
    lease = await h.claim();
  let intervened = false;
  const racing = new SqlAgentObservationStore({
    query: async (text, params) => {
      const rows = await sql.query(text, params);
      if (!intervened && text.includes("select o.* from agent_receiving_observations")) {
        intervened = true;
        assert.equal(await registry.retireProfile(...h.args, now + 1), true);
      }
      return rows;
    },
  });
  assert.equal(
    await racing.complete(...h.args, addresses[0], lease.token, results([event(1)]), now + 2),
    false,
  );
  assert.equal(intervened, true);
  const saved = await database.query("select events from agent_receiving_observations");
  assert.deepEqual(saved.rows[0].events, []);
});

test("a replacement lease between completion read and final CAS preserves the new worker's authority", async () => {
  const h = await setup(),
    old = await h.claim();
  let replacement;
  const racing = new SqlAgentObservationStore({
    query: async (text, params) => {
      const rows = await sql.query(text, params);
      if (!replacement && text.includes("select o.* from agent_receiving_observations")) {
        replacement = await h.claim(now + 45_000);
        assert.ok(replacement);
      }
      return rows;
    },
  });
  assert.equal(
    await racing.complete(...h.args, addresses[0], old.token, results([event(1)]), now + 1),
    false,
  );
  assert.equal(await h.complete(replacement, results([event(2)]), now + 45_001), true);
  assert.deepEqual(
    (await h.load()).events.map((e) => e.txid),
    [hex(2)],
  );
});

test("failed completion writes are atomic and leave the lease retryable", async () => {
  const h = await setup(),
    lease = await h.claim();
  await database.exec(
    "create function fail_observation_update() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end $$; create trigger fail_observation_update before update on agent_receiving_observations for each row execute function fail_observation_update()",
  );
  try {
    await assert.rejects(h.complete(lease, results([event(1)])));
  } finally {
    await database.exec(
      "drop trigger fail_observation_update on agent_receiving_observations;drop function fail_observation_update()",
    );
  }
  assert.deepEqual((await h.load()).events, []);
  assert.equal(await h.complete(lease, results([event(1)])), true);
});

test("account deletion cascades private observations but preserves address tombstones", async () => {
  const h = await setup();
  await h.complete(await h.claim(), results([event(1)]));
  await database.query('delete from "user" where id=$1', [h.owner]);
  assert.equal(
    (await database.query("select count(*)::int as count from agent_receiving_observations"))
      .rows[0].count,
    0,
  );
  assert.equal(
    (
      await database.query(
        "select count(*)::int as count from agent_receiving_address_reservations",
      )
    ).rows[0].count,
    1,
  );
  await assert.rejects(h.load(), code("stale"));
});

test("database constraints prohibit cross-profile address association and oversized stored histories", async () => {
  const h = await setup();
  await h.claim();
  const other = (await registry.getWorld(h.owner, h.world.registrationId)).profiles[1];
  await assert.rejects(
    database.query(
      "insert into agent_receiving_observations(profile_id,address,last_attempt_at) values($1,$2,$3)",
      [other.profileId, addresses[0], now],
    ),
  );
  await assert.rejects(
    database.query("update agent_receiving_observations set events=$1::jsonb", [
      JSON.stringify(Array(257).fill({})),
    ]),
  );
});
