import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { serializeSignedCookie } from "better-call";
import { requestHandler } from "@tanstack/react-start/server";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const origin = "http://localhost:8080";
const envKeys = ["DATABASE_URL", "VITE_AUTH_ENABLED", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let server;
let database;
let auth;
let context;
let guard;
let handlers;
let cookieName;
let ownerTransport;

before(async () => {
  delete process.env.DATABASE_URL;
  process.env.VITE_AUTH_ENABLED = "true";
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  server = await createServer({
    root,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    plugins: [
      {
        name: "test-owner-transport",
        transform(source, id) {
          // Expose the real middleware only to this test; production exports stay private.
          if (id.endsWith("/src/lib/agent-wallets.functions.ts"))
            return `${source}\nexport { ownerTransport as __testOwnerTransport };`;
        },
      },
    ],
  });
  const dbModule = await server.ssrLoadModule("/src/lib/db.ts");
  database = await dbModule.getPglite();
  const authModule = await server.ssrLoadModule("/src/lib/auth/server.ts");
  auth = authModule.auth;
  cookieName = authModule.SESSION_TOKEN_COOKIE;
  context = await auth.$context;
  guard = await server.ssrLoadModule("/src/lib/agent-wallets/auth.server.ts");
  const route = await server.ssrLoadModule("/src/routes/api.auth.$.ts");
  handlers = route.Route.options.server.handlers;
  const functions = await server.ssrLoadModule("/src/lib/agent-wallets.functions.ts");
  ownerTransport = functions.__testOwnerTransport;
});
after(async () => {
  await server?.close();
  await database?.close();
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function inRequest(request, work) {
  let result;
  let failure;
  await requestHandler(async () => {
    try {
      result = await work();
    } catch (error) {
      failure = error;
    }
    return new Response(null, { status: 204 });
  })(request, {});
  if (failure) throw failure;
  return result;
}
const request = (headers = {}, method = "GET") =>
  new Request(`${origin}/api/auth/get-session`, { method, headers });
const unauthorized = (error) =>
  error instanceof guard.OwnerAuthenticationError && error.status === 401;

async function sessionFixture() {
  const user = await context.internalAdapter.createUser({
    name: "Disposable owner fixture",
    email: `${randomBytes(12).toString("hex")}@example.invalid`,
    emailVerified: true,
  });
  const session = await context.internalAdapter.createSession(user.id);
  const signed = await serializeSignedCookie(cookieName, session.token, context.secret, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  return { user, session, cookie: signed.split(";", 1)[0] };
}

test("the activated root auth migration is an exact copy and creates real account/session tables", async () => {
  assert.equal(
    await readFile(new URL("../migrations/0001_auth.sql", import.meta.url), "utf8"),
    await readFile(new URL("../migrations/auth/0001_auth.sql", import.meta.url), "utf8"),
  );
  const rows = await database.query(
    "select table_name from information_schema.tables where table_schema='public' and table_name in ('user','session','account','verification')",
  );
  assert.equal(rows.rows.length, 4);
});

test("owner IDs reject the offline fallback and malformed claims", () => {
  for (const value of [
    null,
    undefined,
    "",
    "dev-user",
    " owner",
    "owner ",
    "owner\n",
    "x".repeat(257),
    {},
    1,
  ])
    assert.throws(() => guard.assertRealOwnerUser(value), unauthorized);
  assert.equal(guard.assertRealOwnerUser("real-account-id"), "real-account-id");
});

test("unsigned requests and caller-supplied identity labels cannot register an owner", async () => {
  for (const headers of [
    {},
    { cookie: `${cookieName}=forged` },
    { "x-user-id": "real-account-id", "x-owner-id": "real-account-id" },
  ])
    await assert.rejects(
      inRequest(request(headers), () => guard.resolveOwnerUser()),
      unauthorized,
    );
  await assert.rejects(
    inRequest(request(), () => guard.resolveOwnerUser("dev-user")),
    unauthorized,
  );
});

test("only a genuine Better Auth session establishes the owner through cookie or preview bearer", async () => {
  const fixture = await sessionFixture();
  assert.equal(
    await inRequest(request({ cookie: fixture.cookie }), () => guard.resolveOwnerUser()),
    fixture.user.id,
  );
  assert.equal(
    await inRequest(request(), () => guard.resolveOwnerUser(fixture.session.token)),
    fixture.user.id,
  );
});

async function ownerRead(token, cookie) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let captured;
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: { getItem: () => token ?? null } },
    });
    const outgoing = await ownerTransport.options.client({ next: async (options) => options });
    // Exercise the installed serializer used by every compiled TanStack GET RPC.
    const { serverFnFetcher } = await import(
      new URL(
        "../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js",
        import.meta.url,
      ).href
    );
    const headers = new Headers(outgoing.headers);
    if (cookie) headers.set("cookie", cookie);
    let owner;
    let failure;
    await runWithStartContext({ startOptions: {} }, () =>
      serverFnFetcher(
        `${origin}/_serverFn/disposable-owner-read`,
        [
          {
            method: "GET",
            data: { expectedOwnerRef: "owner-reference", input: { profileId: "private-profile" } },
            context: outgoing.sendContext ?? {},
            headers,
          },
        ],
        async (url, init) => {
          captured = new Request(url, init);
          try {
            owner = await inRequest(captured, () => guard.resolveOwnerUser());
          } catch (error) {
            failure = error;
          }
          return Response.json({ checked: true });
        },
      ),
    );
    assert.ok(captured);
    const query = new URL(captured.url).searchParams.get("payload") ?? "";
    assert.ok(!query.includes("context"), "Credentials must not enter serialized GET context");
    assert.ok(!query.includes("ownerBearer"));
    if (token) {
      assert.ok(!captured.url.includes(token), "The GET URL must not contain the bearer");
      assert.ok(!decodeURIComponent(captured.url).includes(token));
    }
    return { captured, owner, failure };
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
}

test("owner GET transport keeps a genuine preview bearer in Authorization and out of the URL", async () => {
  const fixture = await sessionFixture();
  const result = await ownerRead(fixture.session.token);
  assert.equal(result.captured.headers.get("authorization"), `Bearer ${fixture.session.token}`);
  assert.equal(result.owner, fixture.user.id);
  assert.equal(result.failure, undefined);
});

test("owner GET transport preserves cookie authentication without adding bearer credentials", async () => {
  const fixture = await sessionFixture();
  const result = await ownerRead(null, fixture.cookie);
  assert.equal(result.captured.headers.get("authorization"), null);
  assert.equal(result.owner, fixture.user.id);
  assert.equal(result.failure, undefined);
});

test("owner GET transport grants no authority when signed out or its header bearer is revoked", async () => {
  const signedOut = await ownerRead(null);
  assert.equal(signedOut.captured.headers.get("authorization"), null);
  assert.equal(signedOut.owner, undefined);
  assert.ok(unauthorized(signedOut.failure));
  const fixture = await sessionFixture();
  await context.internalAdapter.deleteSession(fixture.session.token);
  const revoked = await ownerRead(fixture.session.token);
  assert.equal(revoked.owner, undefined);
  assert.ok(unauthorized(revoked.failure));
});

test("the real auth catch-all dispatches GET and POST while retaining sibling isolation", async () => {
  assert.equal(typeof handlers.GET, "function");
  assert.equal(typeof handlers.POST, "function");
  const fixture = await sessionFixture();
  const sameOrigin = request({ cookie: fixture.cookie, "sec-fetch-site": "same-origin" });
  const response = await inRequest(sameOrigin, () => handlers.GET({ request: sameOrigin }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, fixture.user.id);
  for (const method of ["GET", "POST"]) {
    const sibling = request(
      {
        cookie: fixture.cookie,
        origin: "https://other.grok.me",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
      },
      method,
    );
    const blocked = await inRequest(sibling, () => handlers[method]({ request: sibling }));
    assert.equal(blocked.status, 403);
  }
});

test("the existing top-level GET callback exception is retained", async () => {
  const fixture = await sessionFixture();
  const navigation = request({
    cookie: fixture.cookie,
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  });
  const response = await inRequest(navigation, () => handlers.GET({ request: navigation }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, fixture.user.id);
});

test("a revoked real session no longer supplies receiving authority", async () => {
  const fixture = await sessionFixture();
  await context.internalAdapter.deleteSession(fixture.session.token);
  await assert.rejects(
    inRequest(request({ cookie: fixture.cookie }), () => guard.resolveOwnerUser()),
    unauthorized,
  );
});

test("revocation rejects a previously issued signed session cache for receiving authority", async () => {
  const fixture = await sessionFixture();
  const get = request({ cookie: fixture.cookie, "sec-fetch-site": "same-origin" });
  const response = await inRequest(get, () => handlers.GET({ request: get }));
  assert.equal(response.status, 200);
  const cached = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  assert.ok(
    cached.some((value) => value.startsWith("__Host-grok-auth.session_data=")),
    "The regression must include a real signed session cache",
  );
  const cookies = [fixture.cookie, ...cached].join("; ");
  assert.equal(
    await inRequest(request({ cookie: cookies }), () => guard.resolveOwnerUser()),
    fixture.user.id,
  );
  await context.internalAdapter.deleteSession(fixture.session.token);
  await assert.rejects(
    inRequest(request({ cookie: cookies }), () => guard.resolveOwnerUser()),
    unauthorized,
  );
});

test("auth-disabled local play retains its dev fallback while receiving ownership rejects it", async () => {
  process.env.VITE_AUTH_ENABLED = "false";
  const local = await createServer({
    root,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  try {
    const platform = await local.ssrLoadModule("/src/lib/auth/verify.server.ts");
    const receiving = await local.ssrLoadModule("/src/lib/agent-wallets/auth.server.ts");
    assert.equal(await platform.requireUserId(), "dev-user");
    await assert.rejects(
      receiving.resolveOwnerUser(),
      (error) => error instanceof receiving.OwnerAuthenticationError && error.status === 401,
    );
  } finally {
    process.env.VITE_AUTH_ENABLED = "true";
    await local.close();
  }
});
