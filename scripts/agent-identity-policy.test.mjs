import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { requestHandler } from "@tanstack/react-start/server";
import { createServer } from "vite";

// Regression of the application's explicit-only Better Auth linking policy. The
// real auth route, OAuth state, callback, DB adapter and session verification
// run here. Only token/user-info responses from a disposable broker are fake.
// This does not establish what the real broker allows a person to assert.
const origin = "http://localhost:8080";
const broker = "https://agent-identity-fixture.invalid";
const envKeys = [
  "DATABASE_URL",
  "VITE_AUTH_ENABLED",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "GROK_AUTH_ISSUER",
  "GROK_AUTH_CLIENT_ID",
  "GROK_AUTH_CLIENT_SECRET",
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const realFetch = globalThis.fetch;
const codes = new Map();
const tokens = new Map();
const requests = [];
let server, database, handlers, guard, auth;
const id = () => randomBytes(16).toString("hex");
const email = () => `${id()}@example.invalid`;
const identity = (mail = email(), verified = false) => ({
  sub: id(),
  email: mail,
  email_verified: verified,
  name: "Disposable broker identity",
});

async function inRequest(request, work) {
  let value, failure;
  await requestHandler(async () => {
    try {
      value = await work();
    } catch (error) {
      failure = error;
    }
    return new Response(null, { status: 204 });
  })(request, {});
  if (failure) throw failure;
  return value;
}
function remember(jar, response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0];
    const split = pair.indexOf("=");
    if (split < 1) continue;
    const name = pair.slice(0, split),
      value = pair.slice(split + 1);
    if (!value || /;\s*max-age=0(?:;|$)/i.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  }
}
async function call(
  path,
  jar = new Map(),
  { method = "GET", body, callback = false, headers = {} } = {},
) {
  const request = new Request(`${origin}/api/auth${path}`, {
    method,
    headers: {
      cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      ...(method === "POST" ? { origin, "content-type": "application/json" } : {}),
      "sec-fetch-site": callback ? "cross-site" : "same-origin",
      ...(callback ? { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const response = await inRequest(request, () => handlers[method]({ request }));
  remember(jar, response);
  return response;
}
async function begin(providerId, jar, link = false, headers = {}) {
  const response = await call(link ? "/oauth2/link" : "/sign-in/oauth2", jar, {
    method: "POST",
    headers,
    body: {
      providerId,
      callbackURL: `${origin}/identity-fixture-done`,
      errorCallbackURL: `${origin}/identity-fixture-error`,
    },
  });
  assert.equal(response.status, 200);
  const authorization = new URL((await response.json()).url);
  assert.equal(authorization.origin, broker);
  assert.equal(authorization.pathname, "/api/auth/oauth2/authorize");
  assert.ok(authorization.searchParams.get("state"));
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    `${origin}/api/auth/oauth2/callback/${providerId}`,
  );
  return authorization.searchParams.get("state");
}
async function complete(providerId, person, jar, link = false) {
  const state = await begin(providerId, jar, link);
  return callback(providerId, person, jar, state);
}
async function callback(providerId, person, jar, state, headers = {}) {
  const code = id();
  codes.set(code, person);
  const response = await call(
    `/oauth2/callback/${providerId}?code=${code}&state=${encodeURIComponent(state)}`,
    jar,
    { callback: true, headers },
  );
  return response;
}
async function signIn(providerId, person, jar = new Map()) {
  const response = await complete(providerId, person, jar);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${origin}/identity-fixture-done`);
  assert.ok(
    jar.has("__Host-grok-auth.session_token"),
    "The real callback must issue its signed session cookie",
  );
  const session = await call("/get-session?disableCookieCache=true", jar);
  assert.equal(session.status, 200);
  const payload = await session.json();
  assert.ok(payload?.user?.id);
  const request = new Request(`${origin}/_serverFn/identity-policy`, {
    headers: { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") },
  });
  assert.equal(await inRequest(request, () => guard.resolveOwnerUser()), payload.user.id);
  return { user: payload.user, jar, token: payload.session.token };
}
async function blockedSignIn(providerId, person) {
  const jar = new Map();
  const response = await complete(providerId, person, jar);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, origin);
  assert.equal(location.pathname, "/identity-fixture-error");
  assert.equal(location.searchParams.get("error"), "account_not_linked");
  assert.equal(jar.has("__Host-grok-auth.session_token"), false);
  const request = new Request(`${origin}/_serverFn/identity-policy`, {
    headers: { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") },
  });
  await assert.rejects(
    inRequest(request, () => guard.resolveOwnerUser()),
    (error) => error.name === "OwnerAuthenticationError",
  );
}
before(async () => {
  delete process.env.DATABASE_URL;
  process.env.VITE_AUTH_ENABLED = "true";
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.GROK_AUTH_ISSUER = broker;
  process.env.GROK_AUTH_CLIENT_ID = `fixture-${id()}`;
  process.env.GROK_AUTH_CLIENT_SECRET = randomBytes(32).toString("hex");
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, broker, "No real broker or external network is allowed");
    requests.push({ path: url.pathname, method: request.method });
    if (url.pathname === "/api/auth/oauth2/token" && request.method === "POST") {
      const body = new URLSearchParams(await request.text());
      const code = body.get("code");
      assert.ok(codes.has(code), "The token request must redeem a disposable authorization code");
      const token = id();
      tokens.set(token, codes.get(code));
      codes.delete(code);
      return Response.json({ access_token: token, token_type: "Bearer", expires_in: 300 });
    }
    if (url.pathname === "/api/auth/oauth2/userinfo" && request.method === "GET") {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      assert.ok(tokens.has(token), "User info must require the code exchange's disposable token");
      return Response.json(tokens.get(token));
    }
    throw new Error("Unexpected identity fixture endpoint");
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
  auth = (await server.ssrLoadModule("/src/lib/auth/server.ts")).auth;
  guard = await server.ssrLoadModule("/src/lib/agent-wallets/auth.server.ts");
  handlers = (await server.ssrLoadModule("/src/routes/api.auth.$.ts")).Route.options.server
    .handlers;
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

test("the actual OAuth callback issues a verifiable owner session and preserves the same provider subject", async () => {
  assert.equal(auth.options.account.accountLinking.enabled, true);
  assert.equal(auth.options.account.accountLinking.disableImplicitLinking, true);
  assert.equal(auth.options.account.accountLinking.requireLocalEmailVerified, false);
  const person = identity();
  const first = await signIn("grok-google", person);
  const again = await signIn("grok-google", person);
  assert.equal(first.user.id, again.user.id);
  const rows = await database.query(
    'select "providerId","accountId","userId" from "account" where "userId"=$1',
    [first.user.id],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].accountId, person.sub);
  assert.equal(rows.rows[0].providerId, "grok-google");
});

for (const localVerified of [false, true])
  for (const incomingVerified of [false, true]) {
    test(`new same-email trusted-provider subjects cannot acquire an existing owner: existing verified=${localVerified}, incoming verified=${incomingVerified}`, async () => {
      const shared = email();
      const local = identity(shared, localVerified),
        incoming = identity(shared, incomingVerified);
      const first = await signIn("grok-google", local);
      await blockedSignIn("grok-x", incoming);
      assert.notEqual(local.sub, incoming.sub);
      const rows = await database.query(
        'select "providerId","accountId","userId" from "account" where "userId"=$1 order by "providerId"',
        [first.user.id],
      );
      assert.deepEqual(
        rows.rows.map((row) => [row.providerId, row.accountId, row.userId]),
        [["grok-google", local.sub, first.user.id]],
      );
      const stored = await database.query('select "emailVerified" from "user" where id=$1', [
        first.user.id,
      ]);
      assert.equal(stored.rows[0].emailVerified, localVerified);
      assert.equal(
        (await signIn("grok-google", local)).user.id,
        first.user.id,
        "The original provider identity still signs in",
      );
    });
  }

test("a new same-provider subject cannot acquire an existing owner through matching email", async () => {
  const shared = email();
  const one = identity(shared),
    two = identity(shared);
  const first = await signIn("grok-google", one);
  await blockedSignIn("grok-google", two);
  const rows = await database.query(
    'select "accountId" from "account" where "userId"=$1 order by "accountId"',
    [first.user.id],
  );
  assert.deepEqual(
    rows.rows.map((row) => row.accountId),
    [one.sub],
  );
});

test("explicit authenticated provider linking and subsequent fresh sign-in still work", async () => {
  const shared = email();
  const one = identity(shared, false),
    two = identity(shared, false);
  const first = await signIn("grok-google", one);
  const response = await complete("grok-x", two, first.jar, true);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${origin}/identity-fixture-done`);
  const rows = await database.query(
    'select "providerId","accountId" from "account" where "userId"=$1 order by "providerId"',
    [first.user.id],
  );
  assert.deepEqual(
    rows.rows.map((row) => [row.providerId, row.accountId]),
    [
      ["grok-google", one.sub],
      ["grok-x", two.sub],
    ],
  );
  assert.equal(
    (await signIn("grok-x", two)).user.id,
    first.user.id,
    "An already explicitly linked identity continues to work after logout/new sign-in",
  );
  assert.equal((await signIn("grok-google", one)).user.id, first.user.id);
});

test("explicit linking requires an authenticated session rather than a matching email claim", async () => {
  const before = requests.length;
  for (const path of ["/oauth2/link", "/oauth2/link/", "/link-social", "/link-social/"]) {
    const response = await call(path, new Map(), {
      method: "POST",
      body: { providerId: "grok-x", callbackURL: `${origin}/identity-fixture-done` },
    });
    assert.equal(response.status, 401);
  }
  assert.equal(requests.length, before);
});

test("the live preview bearer transport can initiate an explicit link with a current session", async () => {
  const first = await signIn("grok-google", identity());
  const response = await call("/oauth2/link", new Map(), {
    method: "POST",
    headers: { authorization: `Bearer ${first.token}` },
    body: { providerId: "grok-x", callbackURL: `${origin}/identity-fixture-done` },
  });
  assert.equal(response.status, 200);
  assert.equal(new URL((await response.json()).url).origin, broker);
});

test("explicit linking binds the live bearer owner even when another account's signed cookie cache is present", async () => {
  const a = await signIn("grok-google", identity());
  const owner = identity();
  const b = await signIn("grok-google", owner);
  const headers = { authorization: `Bearer ${b.token}` };
  const incoming = identity(owner.email);
  const state = await begin("grok-x", a.jar, true, headers);
  const response = await callback("grok-x", incoming, a.jar, state, headers);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${origin}/identity-fixture-done`);
  assert.equal((await signIn("grok-x", incoming)).user.id, b.user.id);
  assert.equal(
    (
      await database.query('select count(*)::int as n from "account" where "userId"=$1', [
        a.user.id,
      ])
    ).rows[0].n,
    1,
  );
});

test("explicit linking binds the live cookie-token owner instead of a different signed account cache", async () => {
  const a = await signIn("grok-google", identity());
  const owner = identity();
  const b = await signIn("grok-google", owner);
  a.jar.set("__Host-grok-auth.session_token", b.jar.get("__Host-grok-auth.session_token"));
  a.jar.set("__Host-grok-auth.session_data.0", a.jar.get("__Host-grok-auth.session_data"));
  const incoming = identity(owner.email);
  const state = await begin("grok-x", a.jar, true);
  const response = await callback("grok-x", incoming, a.jar, state);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${origin}/identity-fixture-done`);
  assert.equal((await signIn("grok-x", incoming)).user.id, b.user.id);
  assert.equal(
    (
      await database.query('select count(*)::int as n from "account" where "userId"=$1', [
        a.user.id,
      ])
    ).rows[0].n,
    1,
  );
});

test("a revoked session cache cannot initiate explicit provider linking", async () => {
  const first = await signIn("grok-google", identity());
  assert.ok(first.jar.has("__Host-grok-auth.session_data"));
  await database.query('delete from "session" where "userId"=$1', [first.user.id]);
  const response = await call("/oauth2/link", first.jar, {
    method: "POST",
    body: { providerId: "grok-x", callbackURL: `${origin}/identity-fixture-done` },
  });
  assert.equal(
    response.status,
    401,
    "Explicit linking must require the live account session after revocation",
  );
});

for (const interruption of ["revoked", "signed-out", "another-account"]) {
  test(`a pending explicit link cannot persist after the initiating session is ${interruption}`, async () => {
    const shared = email();
    const first = await signIn("grok-google", identity(shared));
    const incoming = identity(shared);
    const state = await begin("grok-x", first.jar, true);
    if (interruption === "revoked")
      await database.query('delete from "session" where "userId"=$1', [first.user.id]);
    else if (interruption === "signed-out") {
      const response = await call("/sign-out", first.jar, { method: "POST", body: {} });
      assert.equal(response.status, 200);
    } else {
      const other = await signIn("grok-google", identity());
      first.jar.set(
        "__Host-grok-auth.session_token",
        other.jar.get("__Host-grok-auth.session_token"),
      );
      // Keep the old A cache and linking-state cookie while B's live token is active.
    }
    const response = await callback("grok-x", incoming, first.jar, state);
    assert.equal(
      response.status,
      401,
      "Persisting an alias requires the live initiating account at callback time",
    );
    const accounts = await database.query('select "accountId" from "account" where "userId"=$1', [
      first.user.id,
    ]);
    assert.equal(accounts.rows.length, 1);
    await blockedSignIn("grok-x", incoming);
  });
}

test("a pending explicit link cannot update an existing provider binding after revocation", async () => {
  const shared = email();
  const first = await signIn("grok-google", identity(shared));
  const incoming = identity(shared);
  assert.equal((await complete("grok-x", incoming, first.jar, true)).status, 302);
  const before = (
    await database.query(
      'select "accessToken" from "account" where "userId"=$1 and "providerId"=$2',
      [first.user.id, "grok-x"],
    )
  ).rows[0].accessToken;
  const state = await begin("grok-x", first.jar, true);
  await database.query('delete from "session" where "userId"=$1', [first.user.id]);
  const response = await callback("grok-x", incoming, first.jar, state);
  assert.equal(response.status, 401);
  const after = (
    await database.query(
      'select "accessToken" from "account" where "userId"=$1 and "providerId"=$2',
      [first.user.id, "grok-x"],
    )
  ).rows[0].accessToken;
  assert.equal(after, before);
  assert.equal(
    (await signIn("grok-x", incoming)).user.id,
    first.user.id,
    "Existing authorized bindings still support ordinary sign-in",
  );
});

test("different reported emails and different subjects create independent owner accounts", async () => {
  const first = await signIn("grok-google", identity());
  const second = await signIn("grok-x", identity());
  assert.notEqual(second.user.id, first.user.id);
});

test("an already linked provider subject retains its account when the broker reports another email", async () => {
  const person = identity();
  const first = await signIn("grok-google", person);
  const again = await signIn("grok-google", { ...person, email: email(), email_verified: true });
  assert.equal(again.user.id, first.user.id);
});

test("an invalid OAuth state cannot reach the token fixture or create an account", async () => {
  const jar = new Map();
  await begin("grok-google", jar);
  const before = requests.length;
  const count = (await database.query('select count(*)::int as n from "account"')).rows[0].n;
  const response = await call(
    `/oauth2/callback/grok-google?code=${id()}&state=invalid-fixture-state`,
    jar,
    { callback: true },
  );
  assert.equal(response.status, 302);
  assert.notEqual(response.headers.get("location"), `${origin}/identity-fixture-done`);
  assert.equal(requests.length, before);
  assert.equal((await database.query('select count(*)::int as n from "account"')).rows[0].n, count);
});
