import assert from "node:assert/strict";
import { createECDH, createHash } from "node:crypto";
import { after, afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Address, Signer } from "bip322-js";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { getWonderAddress, signWonderChallenge, WonderWalletError } = await server.ssrLoadModule(
  "/src/lib/stamps/wonder.ts",
);
const {
  getWalletAddress,
  signWalletChallenge,
  hasWalletProvider,
  watchWalletChanges,
  WalletError,
} = await server.ssrLoadModule("/src/lib/stamps/wallet.ts");
const { verifyStampProof, buildStampChallenge } = await server.ssrLoadModule(
  "/src/lib/stamps/proof.server.ts",
);
after(async () => server.close());
afterEach(() => delete globalThis.window);

// Disposable keys are generated within this test process and are never stored.
function disposableWallet() {
  const key = createECDH("secp256k1");
  key.generateKeys();
  const publicKey = key.getPublicKey(undefined, "compressed");
  const hash = (value) => createHash("sha256").update(value).digest();
  // ECDH omits leading zero bytes; compressed WIF requires the full 32-byte scalar.
  const scalar = key.getPrivateKey();
  const privateKey = Buffer.alloc(32);
  scalar.copy(privateKey, privateKey.length - scalar.length);
  const payload = Buffer.concat([Buffer.from([128]), privateKey, Buffer.from([1])]);
  const checked = Buffer.concat([payload, hash(hash(payload)).subarray(0, 4)]);
  let number = BigInt(`0x${checked.toString("hex")}`);
  let wif = "";
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  while (number) {
    wif = alphabet[Number(number % 58n)] + wif;
    number /= 58n;
  }
  const addresses = Address.convertPubKeyIntoAddress(publicKey, "p2wpkh");
  return {
    address: addresses.mainnet,
    testnet: addresses.testnet,
    taproot: Address.convertPubKeyIntoAddress(publicKey, "p2tr").mainnet,
    sign: (message) => Signer.sign(wif, addresses.mainnet, message),
  };
}
const first = disposableWallet();
const second = disposableWallet();
const challenge = (changes = {}) => ({
  ...buildStampChallenge({
    id: "nonce_for_disposable_wallet_test_only",
    address: first.address,
    scope: { worldId: `world_${"a".repeat(64)}`, characterId: `character_${"b".repeat(64)}` },
    origin: "https://the-game.example",
    expiresAt: Date.now() + 60_000,
  }),
  ...changes,
});
const code = (expected, Type = WalletError) => (error) =>
  error instanceof Type && error.code === expected;

function wonder(changes = {}) {
  const calls = [];
  const listeners = new Map();
  const provider = {
    async requestAccounts() {
      calls.push(["requestAccounts"]);
      return {
        accounts: [first.address],
        proof: { address: second.address, message: "Ignored wallet-generated message", signature: "bad" },
      };
    },
    async getAccounts() {
      calls.push(["getAccounts"]);
      return [first.address];
    },
    async signMessage(message, address) {
      calls.push(["signMessage", message, address]);
      return first.sign(message);
    },
    on(event, callback) {
      const set = listeners.get(event) ?? new Set();
      set.add(callback);
      listeners.set(event, set);
    },
    removeListener(event, callback) {
      listeners.get(event)?.delete(callback);
    },
    ...changes,
  };
  return {
    provider,
    calls,
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    count(event) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}
function install(provider, leather) {
  const target = new EventTarget();
  globalThis.window = Object.assign(target, {
    ...(provider ? { wonderWallet: provider } : {}),
    ...(leather ? { LeatherProvider: leather } : {}),
  });
  return target;
}
function leather() {
  const calls = [];
  const listeners = new Map();
  const state = {
    active: first,
    entry: {
      address: first.address,
      symbol: "BTC",
      type: "p2wpkh",
      network: "mainnet",
      derivationPath: "m/84'/0'/3'/0/0",
    },
  };
  const provider = {
    async request(method, params) {
      calls.push([method, params]);
      if (method === "getAddresses")
        return {
          result: {
            addresses: [{ ...state.entry }],
          },
        };
      assert.equal(method, "signMessage");
      const signer = params.account === 3 ? first : state.active;
      return {
        result: {
          address: signer.address,
          message: params.message,
          signature: signer.sign(params.message),
        },
      };
    },
    on(event, callback) {
      const set = listeners.get(event) ?? new Set();
      set.add(callback);
      listeners.set(event, set);
    },
    removeListener(event, callback) {
      listeners.get(event)?.delete(callback);
    },
  };
  return {
    provider,
    calls,
    state,
    emit(event) {
      for (const callback of listeners.get(event) ?? []) callback();
    },
  };
}

test("Wonder connects through the documented account object and ignores its automatic proof", async () => {
  const wallet = wonder();
  assert.deepEqual(await getWonderAddress({ provider: wallet.provider }), { address: first.address });
  assert.deepEqual(wallet.calls, [["requestAccounts"], ["getAccounts"]]);
});

test("previously authorized Wonder sites can return the source-defined plain account array", async () => {
  const wallet = wonder({ requestAccounts: async () => [first.address] });
  assert.deepEqual(await getWonderAddress({ provider: wallet.provider }), { address: first.address });
});

test("Wonder signs the exact server-issued challenge with a real server-verifiable BIP322 proof", async () => {
  const wallet = wonder();
  install(wallet.provider);
  const selected = await getWalletAddress("wonder");
  const request = challenge();
  const proof = await signWalletChallenge("wonder", request, selected);
  assert.equal(Object.isFrozen(selected), true);
  assert.deepEqual(selected, { walletId: "wonder", address: first.address });
  assert.equal(proof.address, request.address);
  assert.equal(proof.message, request.message);
  assert.equal(verifyStampProof(proof.address, proof.message, proof.signature), true);
  assert.deepEqual(wallet.calls.map(([method]) => method), [
    "requestAccounts", "getAccounts", "getAccounts", "signMessage", "getAccounts",
  ]);
  assert.deepEqual(wallet.calls.find(([method]) => method === "signMessage"), [
    "signMessage", request.message, first.address,
  ]);
});

test("wallet dispatch preserves Leather's selected account and server-verifiable proof", async () => {
  const wallet = leather();
  install(undefined, wallet.provider);
  const selected = await getWalletAddress("leather");
  const request = challenge();
  const proof = await signWalletChallenge("leather", request, selected);
  assert.deepEqual(selected, { walletId: "leather", address: first.address, account: 3 });
  assert.equal(verifyStampProof(proof.address, proof.message, proof.signature), true);
  assert.deepEqual(wallet.calls.map(([method]) => method), [
    "getAddresses", "signMessage",
  ]);
  assert.deepEqual(wallet.calls[1][1], {
    type: "bip322", message: request.message, paymentType: "p2wpkh", network: "mainnet", account: 3,
  });
});

test("Leather pins the initially approved account when its active UI account silently changes", async () => {
  const wallet = leather();
  delete wallet.provider.on;
  install(undefined, wallet.provider);
  const selected = await getWalletAddress("leather");
  // This provider has no account events: the selected account remains the requested signer.
  wallet.state.active = second;
  wallet.state.entry = {
    ...wallet.state.entry,
    address: second.address,
    derivationPath: "m/84'/0'/4'/0/0",
  };
  const proof = await signWalletChallenge("leather", challenge(), selected);
  assert.equal(proof.address, first.address);
  assert.equal(verifyStampProof(proof.address, proof.message, proof.signature), true);
  assert.equal(wallet.calls[1][1].account, 3);
  assert.deepEqual(
    wallet.calls.map(([method]) => method),
    ["getAddresses", "signMessage"],
  );
});

test("Leather without an account path never guesses an account or accepts a different signer", async () => {
  for (const changedAccount of [false, true]) {
    const wallet = leather();
    delete wallet.state.entry.derivationPath;
    install(undefined, wallet.provider);
    const selected = await getWalletAddress("leather");
    assert.equal(Object.hasOwn(selected, "account"), false);
    if (changedAccount) wallet.state.active = second;
    const pending = signWalletChallenge("leather", challenge(), selected);
    if (changedAccount) await assert.rejects(pending, code("invalid"));
    else {
      const proof = await pending;
      assert.equal(verifyStampProof(proof.address, proof.message, proof.signature), true);
    }
    assert.equal(Object.hasOwn(wallet.calls[1][1], "account"), false);
    assert.deepEqual(
      wallet.calls.map(([method]) => method),
      ["getAddresses", "signMessage"],
    );
  }
});

test("Leather discards account and disconnect events before or during a signature", async () => {
  for (const event of ["accountsChanged", "disconnect"])
    for (const phase of ["before", "during"]) {
      const wallet = leather();
      install(undefined, wallet.provider);
      const selected = await getWalletAddress("leather");
      if (phase === "before") wallet.emit(event);
      else {
        const request = wallet.provider.request;
        wallet.provider.request = async (...args) => {
          const proof = await request(...args);
          wallet.emit(event);
          return proof;
        };
      }
      await assert.rejects(signWalletChallenge("leather", challenge(), selected), code("changed"));
      assert.deepEqual(
        wallet.calls.map(([method]) => method),
        phase === "before" ? ["getAddresses"] : ["getAddresses", "signMessage"],
      );
    }
});

test("Leather provider replacement cannot accept an earlier selection or its late proof", async () => {
  for (const phase of ["before", "during"]) {
    const wallet = leather();
    const replacement = leather();
    const otherWallet = wonder();
    install(otherWallet.provider, wallet.provider);
    const selected = await getWalletAddress("leather");
    if (phase === "before") window.LeatherProvider = replacement.provider;
    else {
      const request = wallet.provider.request;
      wallet.provider.request = async (...args) => {
        const proof = await request(...args);
        window.LeatherProvider = replacement.provider;
        return proof;
      };
    }
    await assert.rejects(signWalletChallenge("leather", challenge(), selected), code("changed"));
    assert.deepEqual(
      wallet.calls.map(([method]) => method),
      phase === "before" ? ["getAddresses"] : ["getAddresses", "signMessage"],
    );
    assert.deepEqual(replacement.calls, []);
    assert.deepEqual(otherWallet.calls, []);
  }
});

test("cancelled or expired pending Leather proofs cannot complete the simplified connection", async (t) => {
  for (const outcome of ["cancelled", "expired"]) {
    const wallet = leather();
    install(undefined, wallet.provider);
    const selected = await getWalletAddress("leather");
    const request = challenge();
    let complete;
    wallet.provider.request = (...args) => {
      wallet.calls.push(args);
      return new Promise((resolve) => {
        complete = resolve;
      });
    };
    const abort = new AbortController();
    const pending = signWalletChallenge("leather", request, selected, { signal: abort.signal });
    assert.ok(complete, "The signature request must already be pending");
    if (outcome === "cancelled") abort.abort();
    else t.mock.method(Date, "now", () => request.expiresAt + 1);
    complete({
      result: {
        address: first.address,
        message: request.message,
        signature: first.sign(request.message),
      },
    });
    await assert.rejects(pending, code(outcome));
    assert.deepEqual(
      wallet.calls.map(([method]) => method),
      ["getAddresses", "signMessage"],
    );
    t.mock.restoreAll();
  }
});

test("copied or forged Leather selections cannot cause another wallet prompt", async () => {
  const wallet = leather();
  install(undefined, wallet.provider);
  const selected = await getWalletAddress("leather");
  assert.equal(Object.isFrozen(selected), true);
  for (const forged of [
    { ...selected },
    { ...selected, account: 4 },
    { ...selected, address: second.address },
  ])
    await assert.rejects(signWalletChallenge("leather", challenge(), forged), code("changed"));
  assert.deepEqual(
    wallet.calls.map(([method]) => method),
    ["getAddresses"],
  );
});

test("a Leather signature must still echo the exact challenge and pass the server verifier", async () => {
  for (const changed of ["address", "message", "signature"]) {
    const wallet = leather();
    install(undefined, wallet.provider);
    const selected = await getWalletAddress("leather");
    const request = challenge();
    wallet.provider.request = async (method, params) => {
      wallet.calls.push([method, params]);
      return {
        result: {
          address: changed === "address" ? second.address : first.address,
          message: changed === "message" ? `${request.message} altered` : request.message,
          signature: second.sign(request.message),
        },
      };
    };
    const pending = signWalletChallenge("leather", request, selected);
    if (changed !== "signature") await assert.rejects(pending, code("invalid"));
    else {
      const proof = await pending;
      assert.equal(
        verifyStampProof(proof.address, proof.message, proof.signature),
        false,
        "An address echo cannot make another key's signature authoritative",
      );
    }
    assert.deepEqual(
      wallet.calls.map(([method]) => method),
      ["getAddresses", "signMessage"],
    );
  }
});

test("detection, watching and unavailable Wonder never invoke another installed wallet", async () => {
  const fallback = leather();
  install(undefined, fallback.provider);
  assert.equal(hasWalletProvider("wonder"), false);
  assert.equal(hasWalletProvider("leather"), true);
  const stop = watchWalletChanges("wonder", () => assert.fail("no change was emitted"));
  await assert.rejects(getWalletAddress("wonder"), code("unavailable"));
  stop();
  assert.deepEqual(fallback.calls, []);
});

test("Wonder refuses unsupported active accounts rather than selecting a later supported one", async () => {
  for (const accounts of [[], [first.testnet], [first.taproot], ["1legacy"], [first.taproot, first.address]]) {
    const wallet = wonder({ requestAccounts: async () => ({ accounts }) });
    await assert.rejects(getWonderAddress({ provider: wallet.provider }), code("unsupported", WonderWalletError));
    assert.equal(wallet.calls.length, 0);
  }
});

test("malformed or oversized Wonder address replies are rejected before signing", async () => {
  for (const response of [null, {}, "address", { accounts: "bad" }, { accounts: [null] }, { accounts: Array(257).fill(first.address) }]) {
    const wallet = wonder({ requestAccounts: async () => response });
    await assert.rejects(getWonderAddress({ provider: wallet.provider }), code("invalid", WonderWalletError));
    assert.equal(wallet.calls.length, 0);
  }
});

test("changed Wonder accounts at connection, before signing and after signing fail closed", async () => {
  const connecting = wonder({ getAccounts: async () => [second.address] });
  await assert.rejects(getWonderAddress({ provider: connecting.provider }), code("changed", WonderWalletError));
  for (const when of ["before", "after"]) {
    const wallet = wonder();
    install(wallet.provider);
    const selected = await getWalletAddress("wonder");
    let reads = 0;
    wallet.provider.getAccounts = async () => {
      reads++;
      return [when === "before" || reads > 1 ? second.address : first.address];
    };
    await assert.rejects(signWalletChallenge("wonder", challenge(), selected), code("changed"));
    assert.equal(wallet.calls.filter(([method]) => method === "signMessage").length, when === "before" ? 0 : 1);
  }
});

test("the connected site grant can emit accountsChanged on initial approval", async () => {
  const wallet = wonder();
  wallet.provider.requestAccounts = async () => {
    wallet.emit("accountsChanged", [first.address]);
    return { accounts: [first.address] };
  };
  install(wallet.provider);
  const stop = watchWalletChanges("wonder", () => assert.fail("Own site grant should not invalidate connect"));
  const selected = await getWalletAddress("wonder");
  assert.equal(selected.address, first.address);
  const request = challenge();
  assert.equal(verifyStampProof(first.address, request.message, (await signWalletChallenge("wonder", request, selected)).signature), true);
  stop();
});

test("a matching delayed fresh-grant event is suppressed once, while later account changes invalidate", async () => {
  const wallet = wonder();
  install(wallet.provider);
  let changes = 0;
  const stop = watchWalletChanges("wonder", () => changes++);
  const selected = await getWalletAddress("wonder");
  wallet.emit("accountsChanged", [first.address]);
  assert.equal(changes, 0);
  const request = challenge();
  assert.equal(verifyStampProof(first.address, request.message, (await signWalletChallenge("wonder", request, selected)).signature), true);
  wallet.emit("accountsChanged", [first.address]);
  assert.equal(changes, 1);
  await assert.rejects(signWalletChallenge("wonder", challenge(), selected), code("changed"));
  stop();
});

test("unmatched grant events and disconnect during connection cannot produce a usable selection", async () => {
  for (const event of ["accountsChanged", "disconnect"]) {
    const wallet = wonder();
    install(wallet.provider);
    wallet.provider.requestAccounts = async () => {
      wallet.emit(event, [second.address]);
      return { accounts: [first.address] };
    };
    await assert.rejects(getWalletAddress("wonder"), code("changed"));
  }
});

test("copied selections, other wallet selections and replaced providers cannot sign", async () => {
  const wallet = wonder();
  const old = leather();
  install(wallet.provider, old.provider);
  const selected = await getWalletAddress("wonder");
  await assert.rejects(signWalletChallenge("wonder", challenge(), { ...selected }), code("changed"));
  await assert.rejects(signWalletChallenge("leather", challenge(), selected), code("changed"));
  window.wonderWallet = wonder().provider;
  await assert.rejects(signWalletChallenge("wonder", challenge(), selected), code("changed"));
  assert.equal(wallet.calls.filter(([method]) => method === "signMessage").length, 0);
  assert.equal(old.calls.length, 0);
});

test("provider replacement during connection or signing discards the late response", async () => {
  for (const phase of ["connect", "sign"]) {
    const wallet = wonder();
    install(wallet.provider);
    if (phase === "connect") {
      wallet.provider.requestAccounts = async () => {
        window.wonderWallet = wonder().provider;
        return { accounts: [first.address] };
      };
      await assert.rejects(getWalletAddress("wonder"), code("changed"));
    } else {
      const selected = await getWalletAddress("wonder");
      wallet.provider.signMessage = async (message) => {
        window.wonderWallet = wonder().provider;
        return first.sign(message);
      };
      await assert.rejects(signWalletChallenge("wonder", challenge(), selected), code("changed"));
    }
  }
});

test("account, network and disconnect events invalidate an earlier selection even if accounts look unchanged", async () => {
  for (const event of ["accountsChanged", "disconnect", "networkChanged", "chainChanged"]) {
    const wallet = wonder();
    install(wallet.provider);
    const selected = await getWalletAddress("wonder");
    wallet.emit(event);
    await assert.rejects(signWalletChallenge("wonder", challenge(), selected), code("changed"));
    assert.equal(wallet.calls.filter(([method]) => method === "signMessage").length, 0);
  }
});

test("Wonder watcher supports late injection and removeListener cleanup without prompts", () => {
  const target = install();
  let changes = 0;
  const stop = watchWalletChanges("wonder", () => changes++);
  const wallet = wonder();
  window.wonderWallet = wallet.provider;
  target.dispatchEvent(new Event("wonder-wallet#initialized"));
  assert.equal(changes, 1);
  wallet.emit("accountsChanged");
  wallet.emit("disconnect");
  assert.equal(changes, 3);
  assert.equal(wallet.count("accountsChanged"), 1);
  stop();
  assert.equal(wallet.count("accountsChanged"), 0);
  wallet.emit("accountsChanged");
  target.dispatchEvent(new Event("wonder-wallet#initialized"));
  assert.equal(changes, 3);
  assert.deepEqual(wallet.calls, []);
});

test("watcher uses off when available and leaves unremovable handlers inert", () => {
  for (const cleanup of ["off", "none"]) {
    const wallet = wonder();
    if (cleanup === "off") wallet.provider.off = wallet.provider.removeListener;
    delete wallet.provider.removeListener;
    install(wallet.provider);
    let changes = 0;
    const stop = watchWalletChanges("wonder", () => changes++);
    wallet.emit("accountsChanged");
    stop();
    wallet.emit("accountsChanged");
    assert.equal(changes, 1);
    assert.equal(wallet.count("accountsChanged"), cleanup === "off" ? 0 : 1);
  }
});

test("invalid and expired server challenges never request accounts or signatures", async () => {
  for (const walletId of ["wonder", "leather"]) {
    const wallet = wonder();
    const old = leather();
    install(wallet.provider, old.provider);
    const selected = await getWalletAddress(walletId);
    const before = wallet.calls.length + old.calls.length;
    for (const [changes, expected] of [
      [{ address: second.address }, "invalid"],
      [{ message: "" }, "invalid"],
      [{ message: "x".repeat(4097) }, "invalid"],
      [{ expiresAt: Date.now() - 1 }, "expired"],
      [{ expiresAt: NaN }, "expired"],
    ]) await assert.rejects(signWalletChallenge(walletId, challenge(changes), selected), code(expected));
    assert.equal(wallet.calls.length + old.calls.length, before);
  }
});

test("Wonder rejects objects, prefixed, legacy, noncanonical and malformed signature encodings", async () => {
  const request = challenge();
  const signature = first.sign(request.message);
  for (const response of [
    { signature }, { address: first.address, message: request.message, signature },
    `smp${signature}`, "", "not a signature", "A".repeat(2049),
    Buffer.alloc(65, 31).toString("base64"), `${signature}\n`, `${signature}=`,
  ]) {
    const wallet = wonder({ signMessage: async () => response });
    await assert.rejects(signWonderChallenge(request, { address: first.address }, { provider: wallet.provider }), code("invalid", WonderWalletError));
  }
});

test("Wonder rejection and provider failures expose bounded public errors", async () => {
  for (const response of [{ code: 4001, message: "private diagnostics" }, { message: "User declined private diagnostics" }]) {
    const wallet = wonder({ requestAccounts: async () => { throw response; } });
    install(wallet.provider);
    await assert.rejects(getWalletAddress("wonder"), (error) => code("rejected")(error) && !error.message.includes("private"));
  }
  const wallet = wonder({ requestAccounts: async () => { throw new Error("private diagnostics"); } });
  install(wallet.provider);
  await assert.rejects(getWalletAddress("wonder"), (error) => code("invalid")(error) && !error.message.includes("private"));
});

test("aborted requests cannot complete a late connection or signature", async () => {
  for (const phase of ["connect", "sign"]) {
    const wallet = wonder();
    install(wallet.provider);
    const selected = phase === "sign" ? await getWalletAddress("wonder") : null;
    const abort = new AbortController();
    let complete;
    const deferred = () => new Promise((resolve) => { complete = resolve; });
    if (phase === "connect") wallet.provider.requestAccounts = deferred;
    else wallet.provider.signMessage = deferred;
    const pending = phase === "connect"
      ? getWalletAddress("wonder", { signal: abort.signal })
      : signWalletChallenge("wonder", challenge(), selected, { signal: abort.signal });
    while (!complete) await new Promise((resolve) => setImmediate(resolve));
    abort.abort();
    await assert.rejects(pending, code("cancelled"));
    complete(phase === "connect" ? { accounts: [first.address] } : first.sign(challenge().message));
    await new Promise((resolve) => setImmediate(resolve));
  }
});

test("already aborted operations never contact Wonder and signature expiry is checked again after waiting", async () => {
  const wallet = wonder();
  install(wallet.provider);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(getWalletAddress("wonder", { signal: abort.signal }), code("cancelled"));
  assert.deepEqual(wallet.calls, []);
  const request = challenge();
  wallet.provider.signMessage = async (message) => {
    request.expiresAt = Date.now() - 1;
    return first.sign(message);
  };
  await assert.rejects(signWonderChallenge(request, { address: first.address }, { provider: wallet.provider }), code("expired", WonderWalletError));
});
