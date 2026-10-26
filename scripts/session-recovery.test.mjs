import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let server;
let checkGameSession;
let getSession;
const fixtureKey = "__gameSessionRecoveryFixture";
const oldFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);

before(async () => {
  Object.defineProperty(globalThis, fixtureKey, {
    configurable: true,
    value: { authEnabled: true, getSession: (...args) => getSession(...args) },
  });
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    plugins: [
      {
        name: "test-session-recovery-client",
        transform(source, id) {
          if (id.split("?", 1)[0].endsWith("/src/lib/auth/session-recovery.ts"))
            return source.replace(
              'import { authClient, authEnabled } from "./client";',
              `const authClient = globalThis.${fixtureKey};
               const { authEnabled } = globalThis.${fixtureKey};`,
            );
        },
      },
    ],
  });
  ({ checkGameSession } = await server.ssrLoadModule("/src/lib/auth/session-recovery.ts"));
});

after(async () => {
  await server?.close();
  if (oldFixture) Object.defineProperty(globalThis, fixtureKey, oldFixture);
  else delete globalThis[fixtureKey];
});

test("recovery checks an authoritative uncached session and does not replay a game action", async () => {
  const calls = [];
  getSession = async (...args) => {
    calls.push(args);
    return { data: { session: { id: "synthetic-session" }, user: { id: "synthetic-user" } } };
  };
  assert.equal(await checkGameSession(), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], { query: { disableCookieCache: true } });
  assert.equal(calls[0][1].cache, "no-store");
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal(calls[0][1].signal.aborted, false);
});

test("a signed-out server response is distinct from a transport failure", async () => {
  getSession = async () => ({ data: null, error: null });
  assert.equal(await checkGameSession(), false);
  const failed = new Error("Synthetic connection unavailable");
  getSession = async () => {
    throw failed;
  };
  await assert.rejects(checkGameSession(), (error) => error === failed);
  getSession = async () => ({ data: null, error: { status: 503, message: "private detail" } });
  await assert.rejects(checkGameSession(), /Your session could not be checked/);
});

test("a session check times out and aborts even when its transport never settles", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  let finish;
  getSession = async (_query, options) => {
    signal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const pending = checkGameSession();
  const rejected = assert.rejects(pending, (error) => error.name === "TimeoutError");
  t.mock.timers.tick(7_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(signal.aborted, true);
  finish({ data: { session: { id: "late-session" }, user: { id: "late-user" } } });
});

test("a completed recovery does not leave a timer that aborts its request later", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  getSession = async (_query, options) => {
    signal = options.signal;
    return { data: null, error: null };
  };
  assert.equal(await checkGameSession(), false);
  t.mock.timers.tick(8_001);
  assert.equal(signal.aborted, false);
});

test("auth-disabled local play keeps its dev-user contract without requesting a session", async () => {
  let calls = 0;
  getSession = async () => {
    calls++;
    throw new Error("An auth-disabled game must not request a Better Auth session");
  };
  globalThis[fixtureKey].authEnabled = false;
  try {
    const disabled = await server.ssrLoadModule("/src/lib/auth/session-recovery.ts?auth-disabled");
    assert.equal(await disabled.checkGameSession(), true);
    assert.equal(calls, 0);
  } finally {
    globalThis[fixtureKey].authEnabled = true;
  }
});
