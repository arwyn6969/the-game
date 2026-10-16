import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { requestHandler } from "@tanstack/react-start/server";
import { serializeSignedCookie } from "better-call";
import { Address } from "bip322-js";
import { createServer } from "vite";

const origin = "http://localhost:8080";
const envKeys = [
  "DATABASE_URL",
  "VITE_AUTH_ENABLED",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "AGENT_REGISTRY_LOCAL_DEV",
  "VERCEL",
  "GROK_PROJECT_ID",
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const realFetch = globalThis.fetch;
const start = 1_800_000_000_000;
const hex = (n) => BigInt(n).toString(16).padStart(64, "0");
const anchor = { height: 900_000, hash: hex(900_000) };
const addresses = Array.from({ length: 3 }, () => {
  const key = createECDH("secp256k1");
  key.generateKeys();
  return Address.convertPubKeyIntoAddress(key.getPublicKey(undefined, "compressed"), "p2wpkh")
    .mainnet;
});
let server, database, registry, store, Service, http, owners, createTown, exportTown;
let externalCalls = 0;
const queries = [];
const code = (value) => (error) => error?.code === value;
function event(index, protocol, address = addresses[0], block = anchor) {
  return {
    eventId: `${protocol}:${hex(index)}:0`,
    protocol,
    txid: hex(index),
    eventIndex: 0,
    source: null,
    destination: address,
    asset: protocol === "bitcoin" ? "BTC" : "A7337447728884561000",
    quantity: "2",
    block,
  };
}
const scan = (protocol, events = []) => ({
  protocol,
  anchor,
  indexedHeight: anchor.height,
  historyComplete: true,
  mempoolComplete: true,
  events,
  orphanedEventIds: [],
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function inRequest(cookie, work, { method = "GET", headers = {} } = {}) {
  let value, failure;
  const response = await requestHandler(async () => {
    try {
      value = await work();
    } catch (error) {
      failure = error;
    }
    return new Response(null, { status: 204 });
  })(
    new Request(`${origin}/_serverFn/observation-fixture`, {
      method,
      headers: { origin, cookie: cookie ?? "", "sec-fetch-site": "same-origin", ...headers },
    }),
    {},
  );
  if (failure) throw failure;
  return { value, response };
}
before(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
  delete process.env.GROK_PROJECT_ID;
  process.env.VITE_AUTH_ENABLED = "true";
  process.env.AGENT_REGISTRY_LOCAL_DEV = "true";
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  globalThis.fetch = async () => {
    externalCalls++;
    throw new Error("External network forbidden in observation service tests");
  };
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  database = await (await server.ssrLoadModule("/src/lib/db.ts")).getPglite();
  const originalQuery = database.query.bind(database);
  database.query = (text, ...args) => {
    queries.push(text);
    return originalQuery(text, ...args);
  };
  const sql = { query: async (text, params) => (await database.query(text, params)).rows };
  const { SqlAgentRegistryStore } = await server.ssrLoadModule(
    "/src/lib/agent-wallets/store.server.ts",
  );
  const { SqlAgentObservationStore } = await server.ssrLoadModule(
    "/src/lib/agent-wallets/observation-store.server.ts",
  );
  registry = new SqlAgentRegistryStore(sql);
  store = new SqlAgentObservationStore(sql);
  Service = (await server.ssrLoadModule("/src/lib/agent-wallets/observation-service.server.ts"))
    .AgentReceivingObservationService;
  http = await server.ssrLoadModule("/src/lib/agent-wallets/http.server.ts");
  createTown = (await server.ssrLoadModule("/src/game/town.ts")).createTown;
  exportTown = (await server.ssrLoadModule("/src/game/save.ts")).exportTown;
  const auth = await server.ssrLoadModule("/src/lib/auth/server.ts");
  const context = await auth.auth.$context;
  owners = [];
  for (let i = 0; i < 2; i++) {
    const user = await context.internalAdapter.createUser({
      name: `Disposable observer owner ${i}`,
      email: `${randomBytes(12).toString("hex")}@example.invalid`,
      emailVerified: true,
    });
    const session = await context.internalAdapter.createSession(user.id);
    const signed = await serializeSignedCookie(
      auth.SESSION_TOKEN_COOKIE,
      session.token,
      context.secret,
      { path: "/", httpOnly: true, secure: true, sameSite: "lax" },
    );
    owners.push({ id: user.id, cookie: signed.split(";", 1)[0] });
  }
});
beforeEach(async () => {
  await database.exec(
    "truncate agent_registered_worlds,agent_receiving_address_reservations cascade",
  );
  queries.length = 0;
  externalCalls = 0;
});
after(async () => {
  globalThis.fetch = realFetch;
  await server?.close();
  await database?.close();
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
async function setup(count = 1, index = 0) {
  const owner = owners[index].id;
  const town = createTown("Disposable observer town");
  const world = await registry.registerWorld(
    owner,
    {
      sourceWorldId: town.identityRegistry.worldId,
      title: "Observation fixture",
      characters: town.agents.map((agent) => ({
        role: agent.id,
        sourceCharacterId: town.identityRegistry.characters[agent.id].characterId,
        name: agent.name,
      })),
    },
    start,
  );
  const profile = (await registry.getWorld(owner, world.registrationId)).profiles[0];
  for (let i = 0; i < count; i++)
    await database.query(
      "insert into agent_receiving_address_reservations(network,address,profile_id,first_verified_at,last_verified_at) values('mainnet',$1,$2,$3,$4)",
      [addresses[i], profile.profileId, start, start + i],
    );
  if (count)
    await database.query(
      "update agent_receiving_profiles set state='draft',address=$1,verified_at=$2,revision=1 where profile_id=$3",
      [addresses[count - 1], start, profile.profileId],
    );
  return {
    owner,
    world,
    profile,
    town,
    input: {
      registrationId: world.registrationId,
      profileId: profile.profileId,
      revision: count ? 1 : 0,
    },
  };
}
function harness(owner, timeoutMs = 500) {
  const calls = { tip: 0, bitcoin: 0, counterparty: 0, anchor: 0, claim: 0 };
  const state = {
    now: start,
    signal: null,
    seen: [],
    tip: async () => anchor,
    bitcoin: async (address) => scan("bitcoin", [event(1, "bitcoin", address)]),
    cp: async (address) => scan("counterparty", [event(2, "counterparty", address, null)]),
    assertAnchor: async () => undefined,
  };
  const observations = {
    load: (...args) => store.load(...args),
    claim: (...args) => {
      calls.claim++;
      return store.claim(...args);
    },
    complete: (...args) => store.complete(...args),
  };
  const service = new Service(registry, observations, owner, {
    now: () => state.now,
    timeoutMs,
    reader: (options) => {
      state.signal = options.signal;
      return {
        tip: () => {
          calls.tip++;
          return state.tip();
        },
        bitcoin: (...args) => {
          calls.bitcoin++;
          state.seen.push(args[0]);
          return state.bitcoin(...args);
        },
        assertAnchor: (...args) => {
          calls.anchor++;
          return state.assertAnchor(...args);
        },
        canonicalHash: async () => anchor.hash,
      };
    },
    counterparty: (...args) => {
      calls.counterparty++;
      return state.cp(...args);
    },
  });
  return { state, calls, service };
}

test("stored GET loads private not-checked observations without calling external readers", async () => {
  const h = await setup(),
    runtime = harness(h.owner);
  const result = await runtime.service.load(h.input);
  assert.equal(result.address, addresses[0]);
  assert.equal(result.fundingPublished, false);
  assert.deepEqual(
    result.sources.map((s) => s.status),
    ["not-checked", "not-checked"],
  );
  assert.deepEqual(result.events, []);
  assert.deepEqual(runtime.calls, { tip: 0, bitcoin: 0, counterparty: 0, anchor: 0, claim: 0 });
  assert.equal(externalCalls, 0);
});

test("unverified profiles reject refresh before a lease or provider call", async () => {
  const h = await setup(0),
    runtime = harness(h.owner);
  assert.equal((await runtime.service.load(h.input)).address, null);
  await assert.rejects(runtime.service.refresh(h.input), code("invalid"));
  assert.equal(runtime.calls.claim, 0);
  assert.equal(runtime.calls.tip, 0);
  assert.equal(
    (await database.query("select count(*)::int as n from agent_receiving_observations")).rows[0].n,
    0,
  );
});

test("a stale profile revision fails before a lease or any external work", async () => {
  const h = await setup(),
    runtime = harness(h.owner);
  await assert.rejects(runtime.service.refresh({ ...h.input, revision: 0 }), code("stale"));
  assert.equal(runtime.calls.claim, 0);
  assert.equal(runtime.calls.tip, 0);
});

test("the per-address cooldown rejects repeated scans before provider work and expires after thirty seconds", async () => {
  const h = await setup(),
    runtime = harness(h.owner);
  await runtime.service.refresh(h.input);
  await assert.rejects(runtime.service.refresh(h.input), code("rate-limited"));
  assert.equal(runtime.calls.tip, 1);
  runtime.state.now += 30_000;
  const result = await runtime.service.refresh(h.input);
  assert.equal(runtime.calls.tip, 2);
  assert.equal(result.sources[0].observedAt, start + 30_000);
});

test("retired profiles retain observations for historical reserved addresses", async () => {
  const h = await setup(2),
    runtime = harness(h.owner);
  assert.equal(
    await registry.retireProfile(h.owner, h.input.registrationId, h.input.profileId, 1, start + 1),
    true,
  );
  const result = await runtime.service.refresh({ ...h.input, revision: 2, address: addresses[0] });
  assert.equal(result.address, addresses[0]);
  assert.equal(result.addresses.length, 2);
  assert.equal(result.addresses.find((a) => a.address === addresses[0]).current, false);
  assert.deepEqual(runtime.state.seen, [addresses[0]]);
  assert.ok(result.events.every((e) => e.destination === addresses[0]));
});

test("BTC success and Counterparty failure are independent and preserve previous protocol evidence", async () => {
  const h = await setup(),
    runtime = harness(h.owner);
  runtime.state.cp = async (address) =>
    scan("counterparty", [
      event(2, "counterparty", address, null),
      event(3, "counterparty", address),
    ]);
  await runtime.service.refresh(h.input);
  runtime.state.now += 30_000;
  runtime.state.cp = async () => {
    throw new Error("Disposable Counterparty outage");
  };
  const result = await runtime.service.refresh(h.input);
  assert.deepEqual(
    result.sources.map((s) => s.status),
    ["ready", "unavailable"],
  );
  assert.equal(
    result.events.find((e) => e.eventId === event(2, "counterparty").eventId).state,
    "unknown",
  );
  assert.equal(
    result.events.find((e) => e.eventId === event(3, "counterparty").eventId).state,
    "confirmed",
  );
  assert.equal(result.sources[1].observedAt, start);
  assert.equal(result.sources[1].attemptedAt, start + 30_000);
  assert.equal(result.events.length, 3);
});

test("a moving anchor discards both new scans and marks prior pending evidence unknown", async () => {
  const h = await setup(),
    runtime = harness(h.owner);
  runtime.state.bitcoin = async (address) => scan("bitcoin", [event(1, "bitcoin", address, null)]);
  await runtime.service.refresh(h.input);
  runtime.state.now += 30_000;
  runtime.state.bitcoin = async (address) => scan("bitcoin", [event(8, "bitcoin", address)]);
  runtime.state.cp = async (address) => scan("counterparty", [event(9, "counterparty", address)]);
  runtime.state.assertAnchor = async () => {
    throw new Error("Tip moved");
  };
  const result = await runtime.service.refresh(h.input);
  assert.deepEqual(
    result.sources.map((s) => s.status),
    ["unavailable", "unavailable"],
  );
  assert.equal(result.events.length, 2);
  assert.ok(result.events.every((e) => e.state === "unknown"));
  assert.equal(
    result.events.some((e) => [hex(8), hex(9)].includes(e.txid)),
    false,
  );
});

test("a hanging provider hits the bounded deadline, aborts and returns unavailable rather than zero", async () => {
  const h = await setup(),
    runtime = harness(h.owner, 20);
  runtime.state.tip = () => new Promise(() => {});
  const began = Date.now();
  const result = await runtime.service.refresh(h.input);
  assert.ok(Date.now() - began < 2000);
  assert.equal(runtime.state.signal.aborted, true);
  assert.deepEqual(
    result.sources.map((s) => s.status),
    ["unavailable", "unavailable"],
  );
  assert.deepEqual(result.events, []);
  assert.equal("balance" in result, false);
});

test("retiring a profile while readers are pending rejects the late completion as stale", async () => {
  const h = await setup(),
    runtime = harness(h.owner),
    entered = deferred(),
    release = deferred();
  runtime.state.bitcoin = async (address) => {
    entered.resolve();
    await release.promise;
    return scan("bitcoin", [event(1, "bitcoin", address)]);
  };
  const pending = runtime.service.refresh(h.input);
  await entered.promise;
  await registry.retireProfile(h.owner, h.input.registrationId, h.input.profileId, 1, start + 1);
  release.resolve();
  await assert.rejects(pending, code("stale"));
  const stored = await runtime.service.load({ ...h.input, revision: 2 });
  assert.deepEqual(stored.events, []);
  assert.ok(stored.sources.every((s) => s.status === "not-checked"));
});

test("a replacement lease prevents an old reader from overwriting newer observations", async () => {
  const h = await setup(),
    runtime = harness(h.owner),
    entered = deferred(),
    release = deferred();
  runtime.state.bitcoin = async (address) => {
    entered.resolve();
    await release.promise;
    return scan("bitcoin", [event(1, "bitcoin", address)]);
  };
  const pending = runtime.service.refresh(h.input);
  await entered.promise;
  runtime.state.now += 45_001;
  const lease = await store.claim(
    h.owner,
    h.input.registrationId,
    h.input.profileId,
    1,
    addresses[0],
    runtime.state.now,
  );
  assert.ok(lease);
  release.resolve();
  await assert.rejects(pending, code("stale"));
  assert.equal(
    await store.complete(
      h.owner,
      h.input.registrationId,
      h.input.profileId,
      1,
      addresses[0],
      lease.token,
      { bitcoin: scan("bitcoin", [event(99, "bitcoin")]), counterparty: null },
      runtime.state.now + 1,
    ),
    true,
  );
  assert.deepEqual(
    (await runtime.service.load(h.input)).events.map((e) => e.eventId),
    [event(99, "bitcoin").eventId],
  );
});

test("refreshing observations changes neither registered profiles nor portable town money/history", async () => {
  const h = await setup(),
    runtime = harness(h.owner);
  const save = exportTown(h.town),
    profiles = await registry.getWorld(h.owner, h.world.registrationId);
  await runtime.service.refresh(h.input);
  assert.deepEqual(await registry.getWorld(h.owner, h.world.registrationId), profiles);
  assert.equal(exportTown(h.town), save);
  assert.equal(save.includes(addresses[0]), false);
  assert.equal(save.includes("counterparty:"), false);
  assert.equal(externalCalls, 0);
});

test("another authenticated owner cannot load or scan a profile using known private IDs", async () => {
  const h = await setup(),
    other = harness(owners[1].id);
  await assert.rejects(other.service.load(h.input), code("stale"));
  await assert.rejects(other.service.refresh(h.input), code("stale"));
  assert.equal(other.calls.claim, 0);
  assert.equal(other.calls.tip, 0);
});

test("HTTP stored reads require real owner binding and return private no-store without network", async () => {
  const h = await setup(),
    expected = (await harness(h.owner).service.load(h.input)).ownerRef;
  const own = await inRequest(owners[0].cookie, async () =>
    (await http.agentObservationContext(expected)).load(h.input),
  );
  assert.equal(own.value.ownerRef, expected);
  assert.equal(own.response.headers.get("cache-control"), "private, no-store");
  const otherView = await setup(0, 1);
  await assert.rejects(
    inRequest(owners[0].cookie, async () =>
      (await http.agentObservationContext(expected)).load(otherView.input),
    ),
    code("stale"),
  );
  await assert.rejects(
    inRequest(undefined, () => http.agentObservationContext(expected)),
    (error) => error.name === "OwnerAuthenticationError",
  );
  assert.equal(externalCalls, 0);
});

test("a current-account mismatch rejects before registry SQL or any provider request", async () => {
  const h = await setup(),
    expected = (await harness(h.owner).service.load(h.input)).ownerRef;
  queries.length = 0;
  await assert.rejects(
    inRequest(
      owners[1].cookie,
      async () => (await http.agentObservationContext(expected)).refresh(h.input),
      { method: "POST" },
    ),
    code("owner-mismatch"),
  );
  assert.equal(
    queries.some((q) => typeof q === "string" && /agent_(receiving|registered)/.test(q)),
    false,
  );
  assert.equal(externalCalls, 0);
});
