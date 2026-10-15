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
let server,
  database,
  store,
  Service,
  result,
  http,
  authContext,
  cookieName,
  owners,
  authHandler,
  cachedUser,
  ownerRef;
const start = 1_800_000_000_000;
const address = () => {
  const key = createECDH("secp256k1");
  key.generateKeys();
  return Address.convertPubKeyIntoAddress(key.getPublicKey(undefined, "compressed"), "p2wpkh")
    .mainnet;
};
const addresses = [address(), address(), address()];
const roles = ["kevin", "arwyn", "northern", "baba", "sub", "data", "amelia", "player"];
const input = (letter = "a") => ({
  sourceWorldId: `world_${letter.repeat(64)}`,
  title: "Disposable private town",
  characters: roles.map((role, index) => ({
    role,
    sourceCharacterId: `character_${String(index + 1).repeat(64)}`,
    name: role,
  })),
});
const holdings = {
  assets: [],
  page: 1,
  totalPages: 1,
  total: 0,
  unsupported: 0,
  indexedBlock: 900_000,
};
function harness(owner = owners[0].user.id) {
  const state = {
    now: start,
    calls: 0,
    list: async () => holdings,
    verify: (_address, _message, signature) => signature === "valid-test-proof",
  };
  return {
    state,
    service: new Service(store, owner, origin, {
      now: () => state.now,
      verify: (...args) => state.verify(...args),
      list: (...args) => {
        state.calls++;
        return state.list(...args);
      },
    }),
  };
}
const errorCode = (code) => (error) => error?.code === code;
const finishInput = (proof) => ({
  registrationId: proof.registrationId,
  profileId: proof.profileId,
  challengeId: proof.id,
  address: proof.address,
  message: proof.message,
  signature: "valid-test-proof",
});
async function draft(h, world, profileIndex = 0, walletAddress = addresses[0]) {
  const p = (await h.service.view(world.world.registrationId)).profiles[profileIndex];
  return h.service.begin({
    registrationId: world.world.registrationId,
    profileId: p.profileId,
    revision: p.revision,
    address: walletAddress,
  });
}
async function inRequest(headers, work, method = "GET") {
  let value, failure, response;
  response = await requestHandler(async () => {
    try {
      value = await work();
    } catch (error) {
      failure = error;
    }
    return new Response(null, { status: 204 });
  })(
    new Request(`${origin}/_serverFn/registry-fixture`, {
      method,
      headers: { origin, ...headers },
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
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  database = await (await server.ssrLoadModule("/src/lib/db.ts")).getPglite();
  const { SqlAgentRegistryStore } = await server.ssrLoadModule(
    "/src/lib/agent-wallets/store.server.ts",
  );
  store = new SqlAgentRegistryStore({
    query: async (text, params) => (await database.query(text, params)).rows,
  });
  const module = await server.ssrLoadModule("/src/lib/agent-wallets/service.server.ts");
  Service = module.AgentRegistryService;
  result = module.registryResult;
  http = await server.ssrLoadModule("/src/lib/agent-wallets/http.server.ts");
  const auth = await server.ssrLoadModule("/src/lib/auth/server.ts");
  authHandler = auth.auth.handler;
  cachedUser = (await server.ssrLoadModule("/src/lib/auth/verify.server.ts")).getSessionUser;
  ownerRef = (await server.ssrLoadModule("/src/lib/agent-wallets/owner-reference.ts"))
    .ownerReference;
  cookieName = auth.SESSION_TOKEN_COOKIE;
  authContext = await auth.auth.$context;
  owners = [];
  for (let i = 0; i < 2; i++) {
    const user = await authContext.internalAdapter.createUser({
      name: `Disposable owner ${i}`,
      email: `${randomBytes(12).toString("hex")}@example.invalid`,
      emailVerified: true,
    });
    const session = await authContext.internalAdapter.createSession(user.id);
    const signed = await serializeSignedCookie(cookieName, session.token, authContext.secret, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    owners.push({ user, session, cookie: signed.split(";", 1)[0] });
  }
});
beforeEach(async () =>
  database.exec("truncate agent_registered_worlds, agent_receiving_address_reservations cascade"),
);
after(async () => {
  await server?.close();
  await database?.close();
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("public town provenance creates eight private profiles and is idempotent only within its owner", async () => {
  const a = harness(),
    b = harness(owners[1].user.id);
  const first = await a.service.register(input());
  const again = await a.service.register(input());
  assert.equal(
    await b.service.find(input().sourceWorldId),
    null,
    "a second owner gets no copy before registration",
  );
  const copy = await b.service.register(input());
  assert.equal(first.world.residents.length, 8);
  assert.equal(first.profiles.length, 8);
  assert.deepEqual(again, first);
  assert.notEqual(copy.world.registrationId, first.world.registrationId);
  assert.notEqual(copy.ownerRef, first.ownerRef);
  assert.equal(copy.world.sourceWorldId, first.world.sourceWorldId);
  assert.equal(
    new Set([...first.world.residents, ...copy.world.residents].map((p) => p.residentId)).size,
    16,
  );
  assert.ok(
    first.profiles.every(
      (p) => p.state === "unconfigured" && p.address === null && p.fundingPublished === false,
    ),
  );
});

test("registration handles are never bearer authority and imported roster changes cannot remap a profile", async () => {
  const a = harness(),
    b = harness(owners[1].user.id);
  const world = await a.service.register(input());
  await assert.rejects(b.service.view(world.world.registrationId), errorCode("not-found"));
  await assert.rejects(
    b.service.begin({
      registrationId: world.world.registrationId,
      profileId: world.profiles[0].profileId,
      revision: 0,
      address: addresses[0],
    }),
    errorCode("not-found"),
  );
  const changed = input();
  changed.characters[0].sourceCharacterId = `character_${"f".repeat(64)}`;
  await assert.rejects(a.service.register(changed), errorCode("conflict"));
  assert.deepEqual(await a.service.view(world.world.registrationId), world);
});

test("receiving proof binds the account, origin, registration, resident, profile and revision", async () => {
  const h = harness(),
    world = await h.service.register(input());
  const proof = await draft(h, world);
  for (const value of [
    world.ownerRef,
    origin,
    world.world.registrationId,
    proof.residentId,
    proof.profileId,
    proof.address,
    proof.id,
    "Expected profile revision: 0",
    "Bitcoin mainnet",
    "does not publish funding instructions",
    "must approve every future outgoing transfer",
  ])
    assert.ok(proof.message.includes(value), `Proof is missing ${value}`);
  assert.equal(proof.expiresAt, start + 300_000);
  assert.equal(proof.message.includes(owners[0].user.id), false);
  const confirmed = await h.service.finish(finishInput(proof));
  assert.equal(confirmed.state, "draft");
  assert.equal(confirmed.revision, 1);
  assert.equal(confirmed.fundingPublished, false);
  await assert.rejects(h.service.finish(finishInput(proof)), errorCode("expired"));
});

test("a mismatched message/address or invalid signature consumes the attempt without installing a draft", async () => {
  for (const [index, mutation] of [
    { message: "cosmetic stamp proof" },
    { address: addresses[1] },
    { signature: "invalid-test-proof" },
  ].entries()) {
    const h = harness(),
      world = await h.service.register(input());
    h.state.now += 6000 * (index + 1);
    const proof = await draft(h, world);
    await assert.rejects(
      h.service.finish({ ...finishInput(proof), ...mutation }),
      errorCode("invalid"),
    );
    await assert.rejects(h.service.finish(finishInput(proof)), errorCode("expired"));
    assert.equal(
      (await h.service.view(world.world.registrationId)).profiles[0].state,
      "unconfigured",
    );
  }
});

test("a proof issued for another origin is rejected and consumed even with a valid signature", async () => {
  const h = harness();
  const world = await h.service.register(input());
  const proof = await draft(h, world);
  let verified = false;
  const otherOrigin = new Service(store, owners[0].user.id, "https://other.example", {
    now: () => h.state.now,
    verify: () => {
      verified = true;
      return true;
    },
  });
  await assert.rejects(otherOrigin.finish(finishInput(proof)), errorCode("invalid"));
  assert.equal(verified, false, "Reject origin substitution before signature verification");
  await assert.rejects(h.service.finish(finishInput(proof)), errorCode("expired"));
  assert.equal((await h.service.view(world.world.registrationId)).profiles[0].address, null);
});

test("challenge expiry, five-second issue throttle and strict supported addresses leave state intact", async () => {
  const h = harness(),
    world = await h.service.register(input());
  const proof = await draft(h, world);
  await assert.rejects(draft(h, world), errorCode("rate-limited"));
  await assert.rejects(draft(h, world, 0, addresses[0].toUpperCase()), errorCode("invalid"));
  h.state.now = proof.expiresAt;
  await assert.rejects(h.service.finish(finishInput(proof)), errorCode("expired"));
  assert.equal((await h.service.view(world.world.registrationId)).profiles[0].address, null);
});

test("distinct residents accept distinct addresses while a global address reservation rejects another owner", async () => {
  const a = harness(),
    b = harness(owners[1].user.id);
  const world = await a.service.register(input()),
    copy = await b.service.register(input());
  await a.service.finish(finishInput(await draft(a, world)));
  await a.service.finish(finishInput(await draft(a, world, 1, addresses[1])));
  await assert.rejects(
    a.service.finish(finishInput(await draft(a, world, 2))),
    errorCode("conflict"),
  );
  await assert.rejects(b.service.finish(finishInput(await draft(b, copy))), errorCode("conflict"));
  const profiles = (await a.service.view(world.world.registrationId)).profiles;
  assert.equal(profiles.filter((p) => p.state === "draft").length, 2);
  assert.equal((await b.service.view(copy.world.registrationId)).profiles[0].address, null);
});

test("retirement invalidates a pending proof and permanently reserves its historical address", async () => {
  const a = harness(),
    b = harness(owners[1].user.id),
    world = await a.service.register(input());
  const confirmed = await a.service.finish(finishInput(await draft(a, world)));
  a.state.now += 5000;
  const pending = await draft(a, world);
  await a.service.retire({
    registrationId: world.world.registrationId,
    profileId: confirmed.profileId,
    revision: confirmed.revision,
  });
  await assert.rejects(a.service.finish(finishInput(pending)), errorCode("expired"));
  const retired = (await a.service.view(world.world.registrationId)).profiles.find(
    (p) => p.profileId === confirmed.profileId,
  );
  assert.equal(retired.state, "retired");
  assert.equal(retired.address, addresses[0]);
  await assert.rejects(
    a.service.retire({
      registrationId: world.world.registrationId,
      profileId: confirmed.profileId,
      revision: confirmed.revision,
    }),
    errorCode("stale"),
  );
  const copy = await b.service.register(input());
  await assert.rejects(b.service.finish(finishInput(await draft(b, copy))), errorCode("conflict"));
});

test("a replacement challenge rejects the old completion and a stale profile revision cannot request proof", async () => {
  const h = harness(),
    world = await h.service.register(input());
  const old = await draft(h, world);
  h.state.now += 5000;
  const replacement = await draft(h, world, 0, addresses[1]);
  await assert.rejects(h.service.finish(finishInput(old)), errorCode("expired"));
  const confirmed = await h.service.finish(finishInput(replacement));
  await assert.rejects(
    h.service.begin({
      registrationId: world.world.registrationId,
      profileId: confirmed.profileId,
      revision: 0,
      address: addresses[0],
    }),
    errorCode("stale"),
  );
  assert.equal(confirmed.address, addresses[1]);
});

test("inventory failure is unavailable, BTC remains unchecked, and late observations cannot revive retirement", async () => {
  const h = harness(),
    world = await h.service.register(input());
  const profile = await h.service.finish(finishInput(await draft(h, world)));
  const scope = { registrationId: world.world.registrationId, profileId: profile.profileId };
  assert.equal((await h.service.inventory(scope)).btc, "not-checked");
  h.state.list = async () => {
    throw new Error("disposable API outage");
  };
  const failure = await result(() => h.service.inventory(scope));
  assert.equal(failure.ok, false);
  assert.equal(failure.error, "unavailable");
  assert.equal((await h.service.view(world.world.registrationId)).profiles[0].state, "draft");
  let release;
  h.state.list = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = h.service.inventory(scope);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await h.service.retire({ ...scope, revision: profile.revision });
  release(holdings);
  await assert.rejects(pending, errorCode("stale"));
  await assert.rejects(h.service.inventory(scope), errorCode("invalid"));
});

test("storage availability requires explicit local testing or configured persistent production auth", () => {
  const local = {
    VITE_AUTH_ENABLED: "true",
    BETTER_AUTH_SECRET: "x".repeat(32),
    AGENT_REGISTRY_LOCAL_DEV: "true",
  };
  assert.equal(http.registryStorageMode(local, origin), "local");
  for (const overrides of [
    { VITE_AUTH_ENABLED: "false" },
    { BETTER_AUTH_SECRET: "short" },
    { AGENT_REGISTRY_LOCAL_DEV: "false" },
    { VERCEL: "1" },
    { GROK_PROJECT_ID: "app" },
  ])
    assert.equal(http.registryStorageMode({ ...local, ...overrides }, origin), "unavailable");
  assert.equal(http.registryStorageMode(local, "https://public.example"), "unavailable");
  const shared = {
    ...local,
    DATABASE_URL: "postgres://configured",
    BETTER_AUTH_URL: "https://game.example",
    GROK_AUTH_CLIENT_ID: "configured",
    GROK_AUTH_CLIENT_SECRET: "configured",
  };
  assert.equal(http.registryStorageMode(shared, "https://game.example"), "shared");
  for (const overrides of [
    { BETTER_AUTH_URL: "https://other.example" },
    { GROK_AUTH_CLIENT_ID: "" },
    { GROK_AUTH_CLIENT_SECRET: "" },
  ])
    assert.equal(
      http.registryStorageMode({ ...shared, ...overrides }, "https://game.example"),
      "unavailable",
    );
});

test("HTTP ownership accepts real sessions, refuses unsigned/dev labels and marks responses private", async () => {
  const unauth = await inRequest({ "x-user-id": "dev-user", "x-owner-id": owners[0].user.id }, () =>
    http.agentOwnerAccess(),
  );
  assert.equal(unauth.value.authenticated, false);
  assert.equal(unauth.response.headers.get("cache-control"), "private, no-store");
  const refused = await inRequest({}, () =>
    result(() => http.agentRegistryContext(ownerRef(owners[0].user.id), "dev-user")),
  );
  assert.equal(refused.value.error, "unauthenticated");
  for (const fixture of owners) {
    const { value } = await inRequest(
      { cookie: fixture.cookie, "sec-fetch-site": "same-origin" },
      async () => {
        const access = await http.agentOwnerAccess();
        const service = await http.agentRegistryContext(ownerRef(fixture.user.id));
        return { access, world: await service.register(input()) };
      },
      "POST",
    );
    assert.equal(value.access.authenticated, true);
    assert.equal(value.access.ownerRef, value.world.ownerRef);
  }
  assert.equal(
    (await database.query("select count(*)::int as count from agent_registered_worlds")).rows[0]
      .count,
    2,
  );
});

test("HTTP rejects sibling scripts and mismatched origins before touching the registry", async () => {
  for (const headers of [
    {
      cookie: owners[0].cookie,
      "sec-fetch-site": "same-site",
      "sec-fetch-mode": "cors",
      origin: "https://sibling.grok.me",
    },
    { cookie: owners[0].cookie, "sec-fetch-site": "same-origin", origin: "https://other.example" },
  ])
    await assert.rejects(
      inRequest(headers, () => http.agentRegistryContext(ownerRef(owners[0].user.id)), "POST"),
    );
  assert.equal(
    (await database.query("select count(*)::int as count from agent_registered_worlds")).rows[0]
      .count,
    0,
  );
  assert.throws(
    () => new Service(store, "dev-user", origin),
    (error) => error.name === "OwnerAuthenticationError",
  );
});

test("a genuine cached account A with live token B cannot read or register using A's displayed owner context", async () => {
  const cached = await inRequest({ cookie: owners[0].cookie }, () =>
    authHandler(
      new Request(`${origin}/api/auth/get-session`, { headers: { cookie: owners[0].cookie } }),
    ),
  );
  const cacheCookies = cached.value.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  assert.ok(cacheCookies.some((value) => value.startsWith("__Host-grok-auth.session_data=")));
  const cookie = [owners[1].cookie, ...cacheCookies].join("; ");
  const shownOwner = ownerRef(owners[0].user.id),
    actualOwner = ownerRef(owners[1].user.id);
  const observed = await inRequest(
    { cookie },
    async () => ({
      client: await cachedUser(),
      access: await http.agentOwnerAccess(),
      rejected: await result(async () =>
        (await http.agentRegistryContext(shownOwner)).register(input()),
      ),
    }),
    "POST",
  );
  assert.equal(
    observed.value.client.id,
    owners[0].user.id,
    "The regression must have a genuine stale signed client cache",
  );
  assert.equal(observed.value.access.ownerRef, actualOwner);
  assert.equal(observed.value.rejected.ok, false);
  assert.equal(observed.value.rejected.error, "owner-mismatch");
  assert.equal(
    (await database.query("select count(*)::int as count from agent_registered_worlds")).rows[0]
      .count,
    0,
  );
  assert.throws(
    () => http.assertExpectedOwner(owners[1].user.id, shownOwner),
    errorCode("owner-mismatch"),
  );
  assert.throws(
    () => http.assertExpectedOwner(owners[1].user.id, "dev-user"),
    errorCode("owner-mismatch"),
  );
  const reconciled = await inRequest(
    { cookie },
    async () => (await http.agentRegistryContext(actualOwner)).register(input()),
    "POST",
  );
  assert.equal(reconciled.value.ownerRef, actualOwner);
  const refusedRead = await inRequest({ cookie }, () =>
    result(async () =>
      (await http.agentRegistryContext(shownOwner)).view(reconciled.value.world.registrationId),
    ),
  );
  assert.equal(refusedRead.value.error, "owner-mismatch");
  assert.equal(
    "value" in refusedRead.value,
    false,
    "No private view is returned for the stale displayed account",
  );
  assert.equal(await harness().service.find(input().sourceWorldId), null);
});
