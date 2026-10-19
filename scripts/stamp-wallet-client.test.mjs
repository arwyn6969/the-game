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
const { getLeatherAddress, signLeatherChallenge, hasLeatherProvider, LeatherWalletError } =
  await server.ssrLoadModule("/src/lib/stamps/leather.ts");
after(async () => server.close());

const ADDRESS = "bc1qetcn9fdtzq3wez6vrljjyry225ml7j52h3kwgl";
const OTHER_ADDRESS = `bc1q${"q".repeat(38)}`;
const SIGNATURE = Buffer.from("A bounded mock witness signature for connector tests only").toString(
  "base64",
);
const challenge = () => ({
  id: "test-challenge",
  address: ADDRESS,
  message: "THE GAME read-only wallet check\nNonce: test-only",
  expiresAt: Date.now() + 60_000,
});
const addressEntry = (extra = {}) => ({
  symbol: "BTC",
  type: "p2wpkh",
  address: ADDRESS,
  derivationPath: "m/84'/0'/7'/0/0",
  ...extra,
});
const reply = (addresses) => ({ jsonrpc: "2.0", result: { addresses } });
const errorCode = (code) => (error) => error instanceof LeatherWalletError && error.code === code;

test("Leather address selection filters currency, type, network and shape rather than relying on index", async () => {
  const calls = [];
  const provider = {
    async request(...args) {
      calls.push(args);
      return reply([
        { symbol: "STX", address: ADDRESS },
        addressEntry({ type: "p2tr", address: `bc1p${"q".repeat(58)}` }),
        addressEntry({ address: "tb1qtest" }),
        addressEntry({ network: "testnet" }),
        addressEntry({ address: `bc1q${"i".repeat(38)}` }),
        addressEntry(),
      ]);
    },
  };
  assert.deepEqual(await getLeatherAddress({ provider }), { address: ADDRESS, account: 7 });
  assert.deepEqual(calls, [["getAddresses", undefined]]);
});

test("unsupported derivation paths cannot choose a different signing account", async () => {
  for (const derivationPath of [
    "m/84'/1'/7'/0/0",
    "m/84'/0'/7'/1/0",
    "m/84'/0'/7'/0/1",
    "m/84'/0'/2147483648'/0/0",
    "m/84'/0'/07'/0/0",
    "m/86'/0'/7'/0/0",
    "bad-path",
    null,
  ]) {
    await assert.rejects(
      getLeatherAddress({
        provider: { request: async () => reply([addressEntry({ derivationPath })]) },
      }),
      errorCode("unsupported"),
      String(derivationPath),
    );
  }
  assert.deepEqual(
    await getLeatherAddress({
      provider: { request: async () => reply([addressEntry({ derivationPath: undefined })]) },
    }),
    { address: ADDRESS },
  );
});

test("empty, unsupported or oversized wallet lists fail with bounded public errors", async () => {
  for (const addresses of [[], [addressEntry({ type: "p2tr" })], [addressEntry({ symbol: "STX" })]])
    await assert.rejects(
      getLeatherAddress({ provider: { request: async () => reply(addresses) } }),
      errorCode("unsupported"),
    );
  for (const response of [
    null,
    {},
    { result: {} },
    reply("not-an-array"),
    reply(Array(257).fill(addressEntry())),
  ])
    await assert.rejects(
      getLeatherAddress({ provider: { request: async () => response } }),
      errorCode("invalid"),
    );
});

test("a missing browser provider remains optional and never opens another app", async () => {
  assert.equal(hasLeatherProvider(), false);
  await assert.rejects(getLeatherAddress(), errorCode("unavailable"));
});

test("the connector requests only a mainnet BIP322 message for the selected account and exact challenge", async () => {
  const request = challenge();
  const calls = [];
  const provider = {
    async request(method, params) {
      calls.push({ method, params });
      return { result: { address: ADDRESS, message: request.message, signature: SIGNATURE } };
    },
  };
  assert.deepEqual(
    await signLeatherChallenge(request, { address: ADDRESS, account: 7 }, { provider }),
    {
      address: ADDRESS,
      message: request.message,
      signature: SIGNATURE,
    },
  );
  assert.deepEqual(calls, [
    {
      method: "signMessage",
      params: {
        type: "bip322",
        message: request.message,
        paymentType: "p2wpkh",
        network: "mainnet",
        account: 7,
      },
    },
  ]);
});

test("an unknown account is omitted instead of guessed", async () => {
  const request = challenge();
  let params;
  await signLeatherChallenge(
    request,
    { address: ADDRESS },
    {
      provider: {
        request: async (_method, value) => {
          params = value;
          return { result: { address: ADDRESS, message: request.message, signature: SIGNATURE } };
        },
      },
    },
  );
  assert.equal(Object.hasOwn(params, "account"), false);
});

test("mismatched address or message echoes and malformed signatures never become proofs", async () => {
  const request = challenge();
  for (const change of [
    { address: OTHER_ADDRESS },
    { message: `${request.message} changed` },
    { signature: "" },
    { signature: "a".repeat(2049) },
    { signature: "not a signature!" },
    { signature: `smp${SIGNATURE}` },
  ]) {
    await assert.rejects(
      signLeatherChallenge(
        request,
        { address: ADDRESS },
        {
          provider: {
            request: async () => ({
              result: {
                address: ADDRESS,
                message: request.message,
                signature: SIGNATURE,
                ...change,
              },
            }),
          },
        },
      ),
      errorCode("invalid"),
    );
  }
});

test("invalid, mismatched or expired challenges never trigger a wallet popup", async () => {
  let calls = 0;
  const provider = {
    request: async () => {
      calls++;
      return {};
    },
  };
  for (const [change, selected, code] of [
    [{ address: OTHER_ADDRESS }, { address: ADDRESS }, "invalid"],
    [{ message: "" }, { address: ADDRESS }, "invalid"],
    [{ message: "x".repeat(16_385) }, { address: ADDRESS }, "invalid"],
    [{}, { address: ADDRESS, account: -1 }, "invalid"],
    [{}, { address: ADDRESS, account: 2 ** 31 }, "invalid"],
    [{ expiresAt: Date.now() - 1 }, { address: ADDRESS }, "expired"],
    [{ expiresAt: NaN }, { address: ADDRESS }, "expired"],
  ])
    await assert.rejects(
      signLeatherChallenge({ ...challenge(), ...change }, selected, { provider }),
      errorCode(code),
    );
  assert.equal(calls, 0);
});

test("wallet rejections are handled as cancellation, without exposing provider details", async () => {
  for (const value of [
    { error: { code: 4001, message: "private wallet rejection details" } },
    { code: 4001 },
    { message: "User rejected request" },
  ])
    await assert.rejects(
      getLeatherAddress({
        provider: {
          request: async () => {
            throw value;
          },
        },
      }),
      (error) => errorCode("rejected")(error) && !error.message.includes("private"),
    );
  await assert.rejects(
    getLeatherAddress({ provider: { request: async () => ({ error: { code: 4001 } }) } }),
    errorCode("rejected"),
  );
  await assert.rejects(
    getLeatherAddress({
      provider: {
        request: async () => {
          throw new Error("private provider diagnostics");
        },
      },
    }),
    (error) => errorCode("invalid")(error) && !error.message.includes("private"),
  );
});

test("abort before a wallet request avoids invoking the extension", async () => {
  const abort = new AbortController();
  abort.abort();
  let calls = 0;
  const provider = {
    request: async () => {
      calls++;
      return {};
    },
  };
  await assert.rejects(
    getLeatherAddress({ provider, signal: abort.signal }),
    errorCode("cancelled"),
  );
  await assert.rejects(
    signLeatherChallenge(challenge(), { address: ADDRESS }, { provider, signal: abort.signal }),
    errorCode("cancelled"),
  );
  assert.equal(calls, 0);
});

test("aborted in-flight wallet prompts cannot provide a late address or signature", async () => {
  for (const signing of [false, true]) {
    const abort = new AbortController();
    let complete;
    const provider = {
      request: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    };
    const request = challenge();
    const pending = signing
      ? signLeatherChallenge(request, { address: ADDRESS }, { provider, signal: abort.signal })
      : getLeatherAddress({ provider, signal: abort.signal });
    abort.abort();
    await assert.rejects(pending, errorCode("cancelled"));
    complete(
      signing
        ? { result: { address: ADDRESS, message: request.message, signature: SIGNATURE } }
        : reply([addressEntry()]),
    );
    await new Promise((resolve) => setImmediate(resolve));
  }
});

test("a signature returned after challenge expiry is discarded", async () => {
  const request = challenge();
  const provider = {
    request: async () => {
      request.expiresAt = Date.now() - 1;
      return { result: { address: ADDRESS, message: request.message, signature: SIGNATURE } };
    },
  };
  await assert.rejects(
    signLeatherChallenge(request, { address: ADDRESS }, { provider }),
    errorCode("expired"),
  );
});
