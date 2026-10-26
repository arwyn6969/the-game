import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { requestHandler } from "@tanstack/react-start/server";
import { createServer } from "vite";
import { serializeSignedCookie } from "better-call";
import {
  createHeadInjector,
  renderWebManifest,
  renderInstallPageHtml,
} from "./grok-pwa-shared.mjs";

const origin = "http://localhost:8080";
let server, database, auth, handlers, configured, cookieName;
let verify;
const settings = {
  VITE_AUTH_ENABLED: "true",
  VITE_AUTH_MODE: "standalone",
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  GOOGLE_CLIENT_ID: "synthetic-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "synthetic-secret-never-sent",
};
const old = new Map([...Object.keys(settings), "DATABASE_URL"].map((k) => [k, process.env[k]]));
before(async () => {
  delete process.env.DATABASE_URL;
  Object.assign(process.env, settings);
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    base: "/thegame/",
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  database = await (await server.ssrLoadModule("/src/lib/db.ts")).getPglite();
  const module = await server.ssrLoadModule("/src/lib/auth/server.ts");
  auth = module.auth;
  configured = module.authConfigured;
  cookieName = module.SESSION_TOKEN_COOKIE;
  verify = await server.ssrLoadModule("/src/lib/auth/verify.server.ts");
  handlers = (await server.ssrLoadModule("/src/routes/api.auth.$.ts")).Route.options.server
    .handlers;
});
after(async () => {
  await server?.close();
  await database?.close();
  for (const [key, value] of old) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const request = (path, body, requestOrigin = origin) =>
  new Request(`${origin}/thegame/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
      "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
async function inRequest(req, run) {
  let result;
  await requestHandler(async () => {
    result = await run();
    return result;
  })(req, {});
  return result;
}

test("standalone Google login uses the mounted callback and isolated secure cookies", async () => {
  assert.equal(configured, true);
  assert.equal(cookieName, "__Host-the-game-auth.session_token");
  const context = await auth.$context;
  assert.equal(context.authCookies.sessionToken.attributes.secure, true);
  assert.equal(context.authCookies.sessionToken.attributes.path, "/");
  assert.equal(context.authCookies.sessionToken.attributes.domain, undefined);
  const req = request("sign-in/social", { provider: "google", callbackURL: "/thegame/" });
  const response = await inRequest(req, () => auth.handler(req));
  assert.equal(response.status, 200);
  const result = await response.json();
  const url = new URL(result.url);
  assert.equal(url.hostname, "accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), `${origin}/thegame/api/auth/callback/google`);
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("state"));
});

test("mounted cookie sessions work and standalone clients ignore stale preview bearer tokens", async () => {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({
    name: "Disposable hosted owner",
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
  const req = new Request(`${origin}/thegame/_serverFn/synthetic-session-check`, {
    method: "POST",
    headers: { cookie: signed.split(";", 1)[0], "sec-fetch-site": "same-origin" },
  });
  const resolveUser = async (bearer) => {
    const response = await inRequest(req, async () => {
      try {
        return Response.json({ userId: await verify.requireUserId(bearer) });
      } catch (error) {
        return Response.json({ error: error.message, status: error.status });
      }
    });
    return response.json();
  };
  assert.deepEqual(await resolveUser(), { userId: user.id });
  // A stale bearer overrides the cookie in Better Auth. Hosted callers must not
  // forward preview credentials into this otherwise working session.
  assert.deepEqual(await resolveUser("stale-preview-session"), {
    error: "Unauthorized",
    status: 401,
  });
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: { getItem: () => "stale-preview-session" } },
    });
    const client = await server.ssrLoadModule("/src/lib/auth/client.ts");
    assert.equal(client.getBearerToken(), null);
    assert.deepEqual(await resolveUser(client.getBearerToken() ?? undefined), { userId: user.id });
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete globalThis.window;
  }
});

test("an authoritative mounted session check rejects a revoked session despite its cached cookie", async () => {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({
    name: "Disposable restored tab",
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
  const tokenCookie = signed.split(";", 1)[0];
  const get = (cookies, fresh = false) =>
    new Request(
      `${origin}/thegame/api/auth/get-session${fresh ? "?disableCookieCache=true" : ""}`,
      { headers: { cookie: cookies, "sec-fetch-site": "same-origin" } },
    );
  const first = get(tokenCookie);
  const response = await inRequest(first, () => handlers.GET({ request: first }));
  assert.equal((await response.json()).user.id, user.id);
  const cache = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  assert.ok(cache.some((value) => value.startsWith("__Host-the-game-auth.session_data=")));
  const cookies = [tokenCookie, ...cache].join("; ");
  await context.internalAdapter.deleteSession(session.token);
  const restored = get(cookies);
  const cached = await inRequest(restored, () => handlers.GET({ request: restored }));
  assert.equal((await cached.json()).user.id, user.id);
  const fresh = get(cookies, true);
  const checked = await inRequest(fresh, () => handlers.GET({ request: fresh }));
  assert.equal(checked.status, 200);
  assert.equal(await checked.json(), null);
});

test("mounted account linking still requires a live authenticated owner", async () => {
  const req = request("link-social", { provider: "google" });
  const response = await inRequest(req, () => handlers.POST({ request: req }));
  assert.equal(response.status, 401);
});

test("standalone login rejects another site's POST", async () => {
  const req = request(
    "sign-in/social",
    { provider: "google", callbackURL: "/thegame/" },
    "https://attacker.invalid",
  );
  const response = await inRequest(req, () => handlers.POST({ request: req }));
  assert.equal(response.status, 403);
});

test("install scope and streamed head links stay inside the game mount", () => {
  const options = { host: "www.arwyn.party", basePath: "/thegame", appName: "THE GAME" };
  const manifest = JSON.parse(renderWebManifest(options.host, options));
  assert.equal(manifest.name, "THE GAME");
  assert.equal(manifest.scope, "/thegame/");
  assert.equal(manifest.start_url, "/thegame/");
  assert.equal(manifest.icons[0].src, "/thegame/__grok/icon-180.png");
  const injector = createHeadInjector(options);
  const bytes = [
    ...injector.push(
      '<html><head><title>THE GAME</title><link rel="manifest" href="/thegame/__grok/manifest.webmanifest"></he',
    ),
    ...injector.push("ad><body></body></html>"),
    ...injector.flush(),
  ];
  const html = Buffer.concat(bytes).toString();
  assert.equal((html.match(/rel="manifest"/g) || []).length, 1);
  assert.ok(!html.includes('href="/__grok/'));
  assert.ok(html.includes('href="/thegame/__grok/icon-180.png"'));
  const install = renderInstallPageHtml(
    '<a href="{{APP_URL}}">{{APP_NAME}}</a><link href="/__grok/install/styles.css">',
    {
      ...options,
      url: "/thegame/?install=1&platform=ios",
    },
  );
  assert.ok(install.includes('href="/thegame/"'));
  assert.ok(install.includes('href="/thegame/__grok/install/styles.css"'));
});
