import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createECDH, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, Signer, Verifier } from "bip322-js";
import { chromium } from "playwright";

// Disposable contexts exercise the real built app, cookie, signature verifier,
// database and raster decoder. Only public Stampchain GET responses and the
// browser extension are fixtures. No personal wallet/browser is ever attached.
const target = new URL(process.env.GAME_STAMP_QA_URL || "http://127.0.0.1:8198/");
const walletId = process.env.GAME_STAMP_QA_WALLET || "wonder";
assert.ok(["wonder", "leather"].includes(walletId), "Choose wonder or leather for wallet QA");
const walletName = walletId === "wonder" ? "Wonder Wallet" : "Leather";
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(
  Number(process.versions.node.split(".")[0]),
  24,
  "Use the repository's Node 24 runtime",
);
const out = resolve(process.env.GAME_STAMP_QA_OUT || "artifacts/stamp-identity-browser");
await mkdir(out, { recursive: true });
const report = {
  url: target.href,
  node: process.version,
  wallet: walletId,
  builtPreview: true,
  mockedStampchainGetOnly: true,
  liveWalletRequests: 0,
  liveExternalNetwork: 0,
  journeys: [],
  fixtureRequests: [],
  failures: [],
};
let preview;
let browser;
let activePage;
let serverOutput = "";

const hash = (bytes) => createHash("sha256").update(bytes).digest();
function disposableWallet() {
  const key = createECDH("secp256k1");
  key.generateKeys();
  // ECDH omits leading zero bytes; compressed WIF requires the full 32-byte scalar.
  const scalar = key.getPrivateKey();
  const privateKey = Buffer.alloc(32);
  scalar.copy(privateKey, privateKey.length - scalar.length);
  const publicKey = key.getPublicKey(undefined, "compressed");
  const payload = Buffer.concat([Buffer.from([128]), privateKey, Buffer.from([1])]);
  const checked = Buffer.concat([payload, hash(hash(payload)).subarray(0, 4)]);
  let value = BigInt(`0x${checked.toString("hex")}`);
  let wif = "";
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  while (value) {
    wif = alphabet[Number(value % 58n)] + wif;
    value /= 58n;
  }
  const address = Address.convertPubKeyIntoAddress(publicKey, "p2wpkh").mainnet;
  return {
    address,
    publicKey: publicKey.toString("hex"),
    sign(message) {
      assert.ok(typeof message === "string" && message.length <= 4096);
      assert.ok(message.startsWith("THE GAME: read-only Bitcoin Stamp appearance proof\n"));
      assert.ok(message.includes(`Origin: ${target.origin}\n`));
      assert.ok(message.includes(`Bitcoin address: ${address}\n`));
      const signature = Signer.sign(wif, address, message);
      assert.equal(Verifier.verifySignature(address, message, signature, true), true);
      return signature;
    },
  };
}
const wallet = disposableWallet();
// Verify dependency compatibility before launching a browser or listening port.
const sample = `THE GAME: read-only Bitcoin Stamp appearance proof\nOrigin: ${target.origin}\nBitcoin address: ${wallet.address}\n`;
wallet.sign(sample);

async function startPreview() {
  preview = spawn(
    process.execPath,
    [
      "scripts/with-app-env.mjs",
      process.execPath,
      "--import",
      fileURLToPath(new URL("./fixtures/stamp-fetch.mjs", import.meta.url)),
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      target.hostname,
      "--port",
      target.port,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: "",
        XAI_API_KEY: "",
        BETTER_AUTH_URL: "",
        VERCEL: "",
        GROK_PROJECT_ID: "",
        STAMP_IDENTITY_LOCAL_DEV: "true",
        MIND_PROVIDER_MODE: "legacy",
        GAME_STAMP_QA_FIXTURE: "1",
        GAME_STAMP_QA_ADDRESS: wallet.address,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [preview.stdout, preview.stderr])
    stream.on("data", (data) => {
      serverOutput = (serverOutput + data.toString()).slice(-30_000);
    });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (preview.exitCode !== null) throw new Error(`Built preview exited: ${serverOutput}`);
    try {
      const response = await fetch(target.href, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* Local preview warming. */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Built preview did not start: ${serverOutput}`);
}

function panel(page) {
  return page.getByRole("dialog", { name: "Your stamp appearance", exact: true });
}
function toolbar(page) {
  return page.getByRole("navigation", { name: "Your town tools", exact: true });
}
function stampTool(page) {
  return toolbar(page).getByRole("button", { name: /Stamp identity$/ });
}
async function canvasHash(page) {
  const bytes = await page.locator("canvas.town-canvas").screenshot();
  return hash(bytes).toString("hex");
}
async function headPixelStats(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.town-canvas");
    const town = JSON.parse(localStorage.getItem("the-game-town-v2")).town;
    const player = town.agents.find((agent) => agent.id === "player");
    const ratio = canvas.width / canvas.clientWidth;
    const x = Math.round((player.tile.x * 32 + 16 - Number(canvas.dataset.camx) - 7) * ratio);
    const y = Math.round((player.tile.y * 32 + 24 - Number(canvas.dataset.camy) - 40) * ratio);
    const pixels = canvas
      .getContext("2d")
      .getImageData(x, y, Math.round(14 * ratio), Math.round(13 * ratio)).data;
    let pinkPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4)
      if (
        pixels[offset] > 210 &&
        pixels[offset + 1] < 100 &&
        pixels[offset + 2] > 110 &&
        pixels[offset + 2] < 230 &&
        pixels[offset + 3] > 220
      )
        pinkPixels++;
    return { pinkPixels, pixels: pixels.length / 4 };
  });
}
async function importTown(page, raw, fork = false) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-stamp-scope-town.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("heading", { name: "Replace the live town?", exact: true }).waitFor();
  if (fork) await page.getByRole("radio", { name: /Create a separate town/ }).check();
  await page
    .getByRole("button", { name: fork ? "Create separate town" : "Replace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Replace the live town?", exact: true })
    .waitFor({ state: "hidden" });
}
async function readyPanel(page) {
  await panel(page).waitFor();
  await panel(page)
    .getByText("Choose a wallet and connect to browse stamps you hold.", { exact: true })
    .waitFor();
}
function connectButton(page) {
  return panel(page).getByRole("button", {
    name: new RegExp(`^(?:Connect|Sign again with) ${walletName}$`),
  });
}
async function selectWallet(page, selected = walletId) {
  await panel(page).getByRole("combobox", { name: "Wallet", exact: true }).selectOption(selected);
}
async function assertPollingKeepsEditing(page, result, activeHeadStats) {
  const bounded = async (promise) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("The held stamp request did not arrive")),
            15_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  await page.evaluate(() => (window.__stampQaTimers.manualPolling = true));
  const isServerFunction = (request) =>
    new URL(request.url()).origin === target.origin &&
    new URL(request.url()).pathname.includes("_serverFn/");
  // Discover the built function ID through its real UI call instead of pinning a build hash.
  const viewRequest = page.waitForRequest(
    (request) => isServerFunction(request) && request.method() === "GET",
  );
  await panel(page).getByRole("button", { name: "Refresh holdings", exact: true }).click();
  const viewPath = new URL((await viewRequest).url()).pathname;
  await panel(page)
    .getByText("Your holdings have been checked. Choose a stamp to preview it.", { exact: true })
    .waitFor();

  let mode = "renew";
  let renewals = 0;
  let applyPath;
  let release;
  let captured;
  let completed;
  let heldRequest;
  function nextHeldRequest() {
    const ready = new Promise((resolve) => (captured = resolve));
    const done = new Promise((resolve) => (completed = resolve));
    const gate = new Promise((resolve) => (release = resolve));
    return { ready, done, gate };
  }
  let held = nextHeldRequest();
  const intercept = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === viewPath) {
      const response = await route.fetch();
      const body = await response.text();
      if (mode === "renew") {
        renewals++;
        assert.ok(body.includes("Stamp #4243"), "The real view must contain the selected stamp");
        const headers = response.headers();
        delete headers["content-length"];
        delete headers["content-encoding"];
        return route.fulfill({
          response,
          headers,
          body: body.replaceAll("Stamp #4243", `Stamp #4243 · renewal ${renewals}`),
        });
      }
      heldRequest = request;
      captured();
      await held.gate;
      // A superseding edit aborts this HTTP request. Releasing its old response must be harmless.
      await route.fulfill({ response, body }).catch((error) => {
        if (!request.failure()) throw error;
      });
      completed();
      return;
    }
    if (mode === "timeout" && request.method() === "POST" && pathname === applyPath) {
      heldRequest = request;
      captured();
      await held.gate;
      await route.abort("aborted").catch((error) => {
        if (!request.failure()) throw error;
      });
      completed();
      return;
    }
    return route.fallback();
  };
  await page.route("**/*", intercept);
  const poll = () =>
    page.evaluate(() => {
      const count = window.__stampQaTimers.poll();
      if (count !== 1) throw new Error(`Expected one live stamp polling interval; found ${count}`);
    });
  try {
    // The fixture invokes the actual registered 60-second callback without changing Date/leases.
    await poll();
    await panel(page)
      .getByRole("button", { name: /Stamp #4243 · renewal 1/ })
      .waitFor();
    assert.equal(
      await panel(page).getByRole("combobox", { name: "Wallet", exact: true }).inputValue(),
      walletId,
    );
    result.assertions.push(`${walletId} remains the selected wallet when its periodic view renews`);

    mode = "hold";
    await poll();
    await bounded(held.ready);
    const zoom = panel(page).getByRole("slider", { name: /Zoom/ });
    const portrait = panel(page).getByRole("radio", {
      name: "Portrait only · original sprite head",
      exact: true,
    });
    assert.equal(await zoom.isEnabled(), true);
    assert.equal(await portrait.isEnabled(), true);
    assert.equal(await panel(page).getByRole("button", { name: "Cancel request" }).count(), 0);
    await zoom.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    const draftZoom = await zoom.inputValue();
    assert.notEqual(draftZoom, "4", "Crop edits must land while the refresh is pending");
    await portrait.check();
    const applying = page.waitForRequest(
      (request) => isServerFunction(request) && request.method() === "POST",
    );
    await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
    applyPath = new URL((await applying).url()).pathname;
    await panel(page)
      .getByText("Your stamp portrait is active; your original sprite head stays in place.", {
        exact: true,
      })
      .waitFor();
    release();
    await bounded(held.done);
    await page.waitForTimeout(100);
    assert.ok(heldRequest.failure(), "Applying must abort the superseded view request");
    assert.equal(await zoom.inputValue(), draftZoom);
    assert.ok(
      (await headPixelStats(page)).pinkPixels < activeHeadStats.pinkPixels,
      "The released stale head response must not overwrite the newly applied portrait",
    );
    result.assertions.push(
      "pending periodic checks leave mode/crop editable and preserve draft edits",
      "Apply supersedes a periodic check and its late response cannot restore the old head",
    );

    // A second accepted renewal proves the old request did not retain the operation lock.
    mode = "renew";
    await poll();
    await panel(page)
      .getByRole("button", { name: /Stamp #4243 · renewal 2/ })
      .waitFor();

    mode = "timeout";
    held = nextHeldRequest();
    await panel(page).getByRole("radio", { name: "Stamp head and portrait", exact: true }).check();
    await page.evaluate(() => (window.__stampQaTimers.captureService = true));
    await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
    await bounded(held.ready);
    await page.evaluate(() => {
      window.__stampQaTimers.captureService = false;
      const count = window.__stampQaTimers.expireService();
      if (count !== 1) throw new Error(`Expected one 30-second service deadline; found ${count}`);
    });
    await panel(page)
      .getByRole("alert")
      .filter({ hasText: "This request took too long" })
      .waitFor();
    assert.equal(
      await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).isEnabled(),
      true,
    );
    assert.equal(await zoom.inputValue(), draftZoom);
    assert.equal(await imagePreview(page).count(), 1);
    release();
    await bounded(held.done);
    result.assertions.push("a stalled Apply releases controls at its deadline and keeps the draft");
  } finally {
    release?.();
    await page.evaluate(() => {
      window.__stampQaTimers.captureService = false;
      window.__stampQaTimers.manualPolling = false;
    });
    await page.unroute("**/*", intercept);
  }
  // Restore the existing journey's chosen crop/head so its remaining pixel checks stay meaningful.
  await panel(page).getByRole("slider", { name: /Zoom/ }).focus();
  await page.keyboard.press("End");
  await panel(page).getByRole("slider", { name: "Horizontal position", exact: true }).focus();
  await page.keyboard.press("End");
  await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
  await panel(page).getByText("Your stamp head is active.", { exact: true }).waitFor();
  await stampTool(page).getByRole("img", { name: "Stamp #4243", exact: true }).waitFor();
}
function imagePreview(page) {
  return panel(page).getByRole("img", { name: "Preview of Stamp #4243", exact: true });
}
async function verifyAndApplyStamp(page) {
  await selectWallet(page);
  await page.evaluate(() => {
    window.__stampWalletMock.install();
    window.__stampWalletMock.mode = "approve";
  });
  // The real server limits proof challenges; do not weaken that gate for this fixture.
  await page.waitForTimeout(5200);
  await connectButton(page).click();
  await panel(page).getByRole("heading", { name: "Choose a stamp", exact: true }).waitFor();
  await panel(page)
    .getByRole("button", { name: /Stamp #4242.*You hold 2.*Supply 10/ })
    .click();
  await panel(page).getByRole("img", { name: "Preview of Stamp #4242", exact: true }).waitFor();
  await panel(page).getByRole("radio", { name: "Stamp head and portrait", exact: true }).check();
  await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
  await panel(page).getByText("Your stamp head is active.", { exact: true }).waitFor();
  await stampTool(page).getByRole("img", { name: "Stamp #4242", exact: true }).waitFor();
}
async function assertWalletInvalidationSurvivesReload(page) {
  assert.equal(await stampTool(page).getByRole("img").count(), 0);
  assert.equal(
    await panel(page)
      .getByText(/^Verified address/)
      .count(),
    0,
  );
  assert.equal(
    await panel(page).getByRole("heading", { name: "Choose a stamp", exact: true }).count(),
    0,
  );
  await panel(page).getByRole("button", { name: "Close stamp appearance", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await stampTool(page).waitFor();
  await page.waitForFunction(() => Boolean(window.__game));
  assert.equal(await stampTool(page).getByRole("img").count(), 0);
  await stampTool(page).click();
  await panel(page)
    .getByText(
      "Your local wallet check is hidden. Connect your selected wallet to verify it again.",
      {
        exact: true,
      },
    )
    .waitFor();
  assert.equal(
    await panel(page)
      .getByText(/^Verified address/)
      .count(),
    0,
  );
  assert.equal(
    await panel(page).getByRole("button", { name: "Refresh holdings", exact: true }).isDisabled(),
    true,
  );
}
async function installWallet(context, result) {
  await context.exposeFunction("__stampQaSign", (message) => wallet.sign(message));
  await context.exposeFunction("__stampQaCall", (method) => {
    result.walletCalls.push(method);
  });
  await context.addInitScript(
    ({ address, publicKey }) => {
      const listeners = { wonder: {}, leather: {} };
      const state = (window.__stampWalletMock = {
        mode: "approve",
        calls: [],
        pending: [],
        connected: false,
        connectReplyShapes: [],
        emit(wallet, event, payload) {
          for (const handler of (listeners[wallet][event] || []).slice()) handler(payload);
        },
        install() {
          window.LeatherProvider = leather;
          if (!window.wonderWallet)
            Object.defineProperty(window, "wonderWallet", {
              value: wonder,
              writable: false,
              configurable: false,
            });
          window.dispatchEvent(new Event("wonder-wallet#initialized"));
          window.dispatchEvent(new Event("focus"));
        },
        async release() {
          for (const job of this.pending.splice(0))
            job.resolve(await response(job.wallet, job.params));
        },
      });
      function eventMethods(wallet) {
        return {
          on(event, handler) {
            (listeners[wallet][event] ||= []).push(handler);
            return this;
          },
          removeListener(event, handler) {
            listeners[wallet][event] = (listeners[wallet][event] || []).filter(
              (listener) => listener !== handler,
            );
            return this;
          },
        };
      }
      async function record(wallet, method) {
        state.calls.push({ wallet, method });
        await window.__stampQaCall(`${wallet}:${method}`);
      }
      async function response(wallet, params) {
        const signature = await window.__stampQaSign(params.message);
        return wallet === "wonder"
          ? signature
          : {
              jsonrpc: "2.0",
              result: {
                address,
                message: params.message,
                signature,
              },
            };
      }
      async function sign(wallet, params) {
        if (state.mode === "reject")
          throw { error: { code: 4001, message: "User declined fixture proof" } };
        if (state.mode === "pending")
          return new Promise((resolve) => state.pending.push({ wallet, params, resolve }));
        return response(wallet, params);
      }
      const wonder = {
        isWonderWallet: true,
        ...eventMethods("wonder"),
        async requestAccounts() {
          await record("wonder", "requestAccounts");
          if (state.connected) {
            state.connectReplyShapes.push("array");
            return [address];
          }
          state.connected = true;
          state.connectReplyShapes.push("object");
          // Actual source emits this while approving the new grant, before its reply.
          state.emit("wonder", "accountsChanged", [address]);
          return {
            accounts: [address],
            // This wallet-generated message deliberately cannot satisfy the server challenge.
            proof: {
              address,
              message: "WALLET-GENERATED CONNECT PROOF: no THE GAME server nonce",
              signature: "not-a-server-challenge-signature",
              scheme: "BIP-322",
            },
          };
        },
        async getAccounts() {
          await record("wonder", "getAccounts");
          return state.connected ? [address] : [];
        },
        async signMessage(message, selectedAddress) {
          await record("wonder", "signMessage");
          if (!state.connected || selectedAddress !== address)
            throw new Error("Unexpected read-only Wonder Wallet proof account");
          return sign("wonder", { message });
        },
      };
      const leather = {
        ...eventMethods("leather"),
        async request(method, params) {
          await record("leather", method);
          if (method === "getAddresses")
            return {
              result: {
                addresses: [
                  { symbol: "STX", address: "SP-NOT-A-BITCOIN-FIXTURE" },
                  { symbol: "BTC", type: "p2tr", address: "bc1p-unsupported-fixture" },
                  {
                    symbol: "BTC",
                    type: "p2wpkh",
                    address,
                    publicKey,
                    derivationPath: "m/84'/0'/0'/0/0",
                  },
                ],
              },
            };
          if (method !== "signMessage")
            throw new Error("The mock wallet forbids all spending/transaction methods");
          if (
            params.type !== "bip322" ||
            params.paymentType !== "p2wpkh" ||
            params.network !== "mainnet" ||
            params.account !== 0
          )
            throw new Error("Unexpected read-only wallet proof parameters");
          return sign("leather", params);
        },
      };
      // Starts without an extension so the graceful optional path is exercised.
    },
    { address: wallet.address, publicKey: wallet.publicKey },
  );
}

try {
  await startPreview();
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    const result = {
      viewport,
      errors: [],
      externalBrowserRequests: [],
      walletCalls: [],
      serverPosts: [],
      expectedAbortedRequests: [],
      assertions: [],
    };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name === "phone",
      reducedMotion: "reduce",
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === target.origin || url.protocol === "data:") return route.continue();
      result.externalBrowserRequests.push({ origin: url.origin, method: route.request().method() });
      // External fonts are optional; all external requests are stopped locally.
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    });
    await installWallet(context, result);
    await context.addInitScript(() => {
      const nativeInterval = window.setInterval.bind(window);
      const nativeClearInterval = window.clearInterval.bind(window);
      const nativeTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);
      const polls = new Map();
      const deadlines = new Map();
      const timers = (window.__stampQaTimers = {
        captureService: false,
        manualPolling: false,
        poll() {
          const callbacks = [...polls.values()];
          for (const callback of callbacks) callback();
          return callbacks.length;
        },
        expireService() {
          const pending = [...deadlines];
          deadlines.clear();
          for (const [timer, callback] of pending) {
            nativeClearTimeout(timer);
            callback();
          }
          return pending.length;
        },
      });
      window.setInterval = (callback, delay, ...args) => {
        if (delay !== 60_000 || typeof callback !== "function")
          return nativeInterval(callback, delay, ...args);
        const invoke = () => callback(...args);
        const timer = nativeInterval(() => {
          if (!timers.manualPolling) invoke();
        }, delay);
        polls.set(timer, invoke);
        return timer;
      };
      window.clearInterval = (timer) => {
        polls.delete(timer);
        nativeClearInterval(timer);
      };
      window.setTimeout = (callback, delay, ...args) => {
        const timer = nativeTimeout(callback, delay, ...args);
        if (timers.captureService && delay === 30_000 && typeof callback === "function")
          deadlines.set(timer, () => callback(...args));
        return timer;
      };
      window.clearTimeout = (timer) => {
        deadlines.delete(timer);
        nativeClearTimeout(timer);
      };
    });
    const page = (activePage = await context.newPage());
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).origin === target.origin)
        result.serverPosts.push(new URL(request.url()).pathname);
    });
    page.on("pageerror", (error) => result.errors.push(error.message));
    let expectingAbort = false;
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (
        expectingAbort &&
        /Failed to load resource|Failed to fetch|net::ERR_(?:FAILED|ABORTED)/.test(message.text())
      )
        result.expectedAbortedRequests.push(message.text());
      else result.errors.push(message.text());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page
      .getByLabel("What do they call you?", { exact: true })
      .fill(`Stamp QA ${viewport.name}`);
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page
      .getByRole("button", {
        name: viewport.name === "desktop" ? "Choose a stamp identity" : "Walk in",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () => !!window.__game && Boolean(localStorage.getItem("the-game-town-v2")),
    );
    if (viewport.name === "phone") await stampTool(page).click();
    await readyPanel(page);
    assert.equal(
      await panel(page).getByRole("combobox", { name: "Wallet", exact: true }).inputValue(),
      "wonder",
      "Wonder Wallet is the default recommendation; Leather requires an explicit choice",
    );
    await selectWallet(page);
    await connectButton(page).click();
    await panel(page)
      .getByRole("alert")
      .filter({ hasText: `${walletName} was not found` })
      .waitFor();
    assert.equal(
      (await context.cookies()).some((cookie) => cookie.name === "__Host-the-game.stamp-session"),
      false,
    );
    await page.screenshot({ path: join(out, `${viewport.name}-no-wallet.png`) });
    result.assertions.push("optional entry works without a wallet");

    await page.evaluate(() => {
      window.__stampWalletMock.install();
      window.__stampWalletMock.mode = "reject";
    });
    await connectButton(page).click();
    await panel(page).getByRole("alert").filter({ hasText: "Wallet request declined" }).waitFor();
    const cookie = (await context.cookies()).find(
      (item) => item.name === "__Host-the-game.stamp-session",
    );
    assert.ok(cookie, "A server-generated wallet proof session cookie must be present");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "Strict");
    assert.equal(
      await page.evaluate(() => document.cookie.includes("the-game.stamp-session")),
      false,
    );
    result.cookie = { httpOnly: true, secure: true, sameSite: "Strict", scriptReadable: false };
    result.assertions.push("declining a message leaves the town and appearance intact");

    await page.waitForTimeout(5200);
    await page.evaluate(() => {
      window.__stampWalletMock.mode = "pending";
    });
    await connectButton(page).click();
    await page.waitForFunction(() => window.__stampWalletMock.pending.length === 1);
    await panel(page).getByRole("button", { name: "Cancel request", exact: true }).click();
    const postsAtCancel = result.serverPosts.length;
    await page.evaluate(() => window.__stampWalletMock.release());
    await page.waitForTimeout(150);
    assert.equal(
      result.serverPosts.length,
      postsAtCancel,
      "A cancelled proof cannot finish on the server",
    );
    assert.equal(
      await panel(page)
        .getByText(/^Verified address/)
        .count(),
      0,
    );
    assert.equal(
      await panel(page).getByRole("heading", { name: "Choose a stamp", exact: true }).count(),
      0,
    );
    result.assertions.push("cancelled wallet responses cannot connect or apply a late result");

    await page.waitForTimeout(5200);
    await page.evaluate(() => {
      window.__stampWalletMock.mode = "approve";
    });
    const walletCallsBeforeConnect = result.walletCalls.length;
    await connectButton(page).click();
    await panel(page).getByRole("heading", { name: "Choose a stamp", exact: true }).waitFor();
    if (walletId === "leather") {
      assert.deepEqual(result.walletCalls.slice(walletCallsBeforeConnect), [
        "leather:getAddresses",
        "leather:signMessage",
      ]);
      result.assertions.push("Leather connects with one address request and one message signature");
    }
    const walletCallsAfterConnect = result.walletCalls.length;
    await panel(page)
      .getByText(/^Verified address/)
      .waitFor();
    await panel(page).getByText("23 unsupported assets are hidden.", { exact: true }).waitFor();
    await panel(page)
      .getByRole("button", { name: /Stamp #4242.*You hold 2.*Supply 10/ })
      .waitFor();
    await panel(page)
      .getByRole("button", { name: /Stamp #4242.*You hold 2.*Supply 10/ })
      .click();
    await panel(page).getByRole("img", { name: "Preview of Stamp #4242", exact: true }).waitFor();
    await panel(page).getByRole("button", { name: "Next", exact: true }).click();
    await panel(page).getByText("Page 2 of 2", { exact: true }).waitFor();
    await panel(page)
      .getByRole("button", { name: /Stamp #4243.*You hold 1.*Supply 10/ })
      .click();
    const image = panel(page).getByRole("img", { name: "Preview of Stamp #4243", exact: true });
    await image.waitFor();
    assert.ok((await image.getAttribute("src")).startsWith("data:image/png;base64,"));
    await image.evaluate((element) => element.decode());
    assert.equal(await image.evaluate((element) => element.naturalWidth), 256);
    assert.equal(await image.evaluate((element) => element.naturalHeight), 256);
    await panel(page).getByRole("radio", { name: "Stamp head and portrait", exact: true }).check();
    await panel(page).getByRole("slider", { name: /Zoom/ }).focus();
    await page.keyboard.press("End");
    await panel(page).getByRole("slider", { name: "Horizontal position", exact: true }).focus();
    await page.keyboard.press("End");
    await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
    await panel(page).getByText("Your stamp head is active.", { exact: true }).waitFor();
    await stampTool(page).getByRole("img", { name: "Stamp #4243", exact: true }).waitFor();
    await page.waitForTimeout(200);
    const headPixels = await canvasHash(page);
    const headStats = await headPixelStats(page);
    assert.ok(
      headStats.pinkPixels >= 10,
      "The fixture's pink pixels must appear in the actual player's head area",
    );
    await page.screenshot({ path: join(out, `${viewport.name}-stamp-head.png`) });
    result.assertions.push(
      "real server proof verifies a disposable BIP322 signature",
      "holdings paginate and exclude unsupported artwork",
      "safe raster preview and keyboard crop controls work",
      "selected head and toolbar portrait display",
    );
    if (walletId === "wonder") {
      result.wonderConnection = await page.evaluate(() => ({
        replyShapes: window.__stampWalletMock.connectReplyShapes,
        ignoredConnectProof: true,
      }));
      assert.deepEqual([...new Set(result.wonderConnection.replyShapes)].sort(), [
        "array",
        "object",
      ]);
      assert.ok(
        result.walletCalls.includes("wonder:signMessage"),
        "The invalid wallet-generated connect proof must be ignored in favor of a fresh server challenge",
      );
    }

    expectingAbort = true;
    try {
      await assertPollingKeepsEditing(page, result, headStats);
    } finally {
      expectingAbort = false;
    }
    if (walletId === "leather") {
      assert.equal(
        result.walletCalls.length,
        walletCallsAfterConnect,
        "Holdings, preview, crop, Apply and periodic renewal must not reopen Leather",
      );
      result.assertions.push("stamp editing and holdings renewals need no new Leather approvals");
    }

    await panel(page)
      .getByRole("radio", { name: "Portrait only · original sprite head", exact: true })
      .check();
    await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
    await panel(page)
      .getByText("Your stamp portrait is active; your original sprite head stays in place.", {
        exact: true,
      })
      .waitFor();
    await page.waitForTimeout(200);
    assert.notEqual(
      await canvasHash(page),
      headPixels,
      "Changing head to portrait must change actual canvas pixels",
    );
    const portraitStats = await headPixelStats(page);
    assert.ok(
      portraitStats.pinkPixels < headStats.pinkPixels,
      "Portrait mode must remove the stamp's pink pixels from the player head",
    );
    result.headPixels = { active: headStats, portraitOnly: portraitStats };
    await stampTool(page).getByRole("img", { name: "Stamp #4243", exact: true }).waitFor();
    result.assertions.push(
      "portrait mode restores the authored canvas head while keeping its portrait",
    );

    await panel(page).getByRole("radio", { name: "Original appearance", exact: true }).check();
    await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
    await panel(page)
      .getByText("Your original appearance is active. Your wallet stays connected.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await stampTool(page).getByRole("img").count(), 0);
    await panel(page)
      .getByText(/^Verified address/)
      .waitFor();
    await page.screenshot({ path: join(out, `${viewport.name}-original.png`) });
    result.assertions.push("Original clears cosmetics while preserving verified wallet and draft");

    await panel(page).getByRole("radio", { name: "Stamp head and portrait", exact: true }).check();
    await panel(page).getByRole("button", { name: "Apply appearance", exact: true }).click();
    await panel(page).getByText("Your stamp head is active.", { exact: true }).waitFor();
    await panel(page).getByRole("button", { name: "Close stamp appearance", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await stampTool(page).getByRole("img", { name: "Stamp #4243", exact: true }).waitFor();
    const saved = await page.evaluate(() => localStorage.getItem("the-game-town-v2"));
    assert.equal(
      saved.includes(wallet.address),
      false,
      "A town export must not contain wallet/session proof state",
    );
    assert.equal(
      saved.includes("data:image/png"),
      false,
      "Artwork remains outside portable game saves",
    );
    result.assertions.push(
      "reload rechecks server-held selection without wallet proofs or pixels in the town save",
    );

    const isolated = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await isolated.route("**/*", (route) =>
      new URL(route.request().url()).origin === target.origin
        ? route.continue()
        : route.fulfill({ status: 200, contentType: "text/css", body: "" }),
    );
    await isolated.addInitScript((raw) => localStorage.setItem("the-game-town-v2", raw), saved);
    const isolatedPage = await isolated.newPage();
    isolatedPage.on("pageerror", (error) => result.errors.push(`isolated: ${error.message}`));
    await isolatedPage.goto(target.href, { waitUntil: "domcontentloaded" });
    await stampTool(isolatedPage).click();
    await readyPanel(isolatedPage);
    assert.equal(await stampTool(isolatedPage).getByRole("img").count(), 0);
    assert.equal(
      (await isolated.cookies()).some((cookie) => cookie.name === "__Host-the-game.stamp-session"),
      false,
    );
    await isolatedPage.screenshot({ path: join(out, `${viewport.name}-isolated-save.png`) });
    await isolated.close();
    result.assertions.push(
      "the same saved identity in a new browser session cannot inherit wallet proof or appearance",
    );

    const originalWorld = JSON.parse(saved).town.identityRegistry.worldId;
    await importTown(page, saved, true);
    await page.waitForFunction(
      (original) =>
        JSON.parse(localStorage.getItem("the-game-town-v2")).town.identityRegistry.worldId !==
        original,
      originalWorld,
    );
    await stampTool(page).click();
    await readyPanel(page);
    assert.equal(await stampTool(page).getByRole("img").count(), 0);
    await page.screenshot({ path: join(out, `${viewport.name}-fork-no-stamp.png`) });
    await panel(page).getByRole("button", { name: "Close stamp appearance", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await stampTool(page).waitFor();
    assert.equal(await stampTool(page).getByRole("img").count(), 0);
    await importTown(page, saved);
    await stampTool(page).getByRole("img", { name: "Stamp #4243", exact: true }).waitFor();
    result.assertions.push(
      "a fork and its reload cannot inherit a cosmetic link, while restoring the source retains its original scope",
    );

    await stampTool(page).click();
    await panel(page).getByRole("button", { name: "Disconnect", exact: true }).waitFor();
    let abortedPosts = 0;
    const abortDisconnect = async (route) => {
      if (route.request().method() === "POST") {
        abortedPosts++;
        return route.abort("failed");
      }
      return route.fallback();
    };
    expectingAbort = true;
    await page.route("**/*", abortDisconnect);
    await panel(page).getByRole("button", { name: "Disconnect", exact: true }).click();
    await panel(page)
      .getByRole("alert")
      .filter({ hasText: "could not confirm disconnection" })
      .waitFor();
    assert.equal(abortedPosts, 1, "Only the intended disconnect request is blocked");
    await page.unroute("**/*", abortDisconnect);
    await page.waitForTimeout(150);
    expectingAbort = false;
    assert.equal(await stampTool(page).getByRole("img").count(), 0);
    await panel(page).getByRole("button", { name: "Close stamp appearance", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await stampTool(page).waitFor();
    await page.waitForFunction(() => Boolean(window.__game));
    assert.equal(await stampTool(page).getByRole("img").count(), 0);
    await stampTool(page).click();
    await panel(page).getByRole("button", { name: "Retry Disconnect", exact: true }).waitFor();
    assert.equal(
      await panel(page)
        .getByText(/^Verified address/)
        .count(),
      0,
    );
    await page.screenshot({ path: join(out, `${viewport.name}-failed-disconnect.png`) });
    await panel(page).getByRole("button", { name: "Retry Disconnect", exact: true }).click();
    await panel(page)
      .getByText("Wallet disconnected. Your original appearance is active.", { exact: true })
      .waitFor();
    assert.equal(await stampTool(page).getByRole("img").count(), 0);
    await panel(page).getByRole("button", { name: "Close stamp appearance", exact: true }).click();
    await stampTool(page).click();
    await readyPanel(page);
    assert.equal(
      await panel(page)
        .getByText(/^Verified address/)
        .count(),
      0,
    );
    await page.screenshot({ path: join(out, `${viewport.name}-disconnected.png`) });
    result.assertions.push(
      "disconnect clears draft, display and server link, including on reopen",
      "failed disconnect stays hidden after close and reload until explicit retry succeeds",
    );

    for (const invalidation of ["wallet-selection", "accountsChanged", "disconnect"]) {
      await verifyAndApplyStamp(page);
      await page.waitForTimeout(5200);
      await page.evaluate(() => {
        window.__stampWalletMock.mode = "pending";
      });
      await connectButton(page).click();
      await page.waitForFunction(() => window.__stampWalletMock.pending.length === 1);
      const postsBeforeInvalidation = result.serverPosts.length;
      if (invalidation === "wallet-selection")
        await selectWallet(page, walletId === "wonder" ? "leather" : "wonder");
      else
        await page.evaluate(
          ({ selected, event }) => {
            if (event === "disconnect") window.__stampWalletMock.connected = false;
            window.__stampWalletMock.emit(
              selected,
              event,
              event === "accountsChanged" ? [] : undefined,
            );
          },
          { selected: walletId, event: invalidation },
        );
      await panel(page).getByRole("button", { name: "Cancel request", exact: true }).waitFor({
        state: "hidden",
      });
      assert.equal(await stampTool(page).getByRole("img").count(), 0);
      assert.equal(
        await panel(page)
          .getByText(/^Verified address/)
          .count(),
        0,
      );
      await page.evaluate(() => window.__stampWalletMock.release());
      await page.waitForTimeout(200);
      assert.equal(
        result.serverPosts.length,
        postsBeforeInvalidation,
        `${invalidation} must prevent a late proof from finishing on the server`,
      );
      await assertWalletInvalidationSurvivesReload(page);
      await page.screenshot({ path: join(out, `${viewport.name}-${invalidation}-hidden.png`) });
      result.assertions.push(
        `${invalidation} during signing clears an active head and holds it hidden through reload without a late server finish`,
      );
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "The panel must not create horizontal overflow",
    );
    const rect = await panel(page).boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= viewport.width + 1);
    result.walletMethods = [...new Set(result.walletCalls)];
    assert.deepEqual(
      result.walletMethods.sort(),
      walletId === "wonder"
        ? ["wonder:getAccounts", "wonder:requestAccounts", "wonder:signMessage"]
        : ["leather:getAddresses", "leather:signMessage"],
      "Only the explicitly selected wallet's read-only connection and signature methods may run",
    );
    assert.deepEqual(
      result.errors,
      [],
      "Browser errors must not be hidden by interaction assertions",
    );
    assert.equal(
      result.externalBrowserRequests.some((entry) => entry.origin === "https://stampchain.io"),
      false,
      "Raw Stampchain URLs must never be rendered by the browser",
    );
    await context.close();
  }
} catch (error) {
  report.failures.push(
    (error instanceof Error ? error.stack || error.message : String(error)).slice(0, 4000),
  );
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  report.fixtureRequests = serverOutput
    .split("\n")
    .filter((line) => line.startsWith("[stamp-fixture] "))
    .map((line) => {
      try {
        return JSON.parse(line.slice("[stamp-fixture] ".length));
      } catch {
        return { unreadable: true };
      }
    });
  if (report.fixtureRequests.some((entry) => entry.unexpectedNetwork || entry.method !== "GET")) {
    report.failures.push(
      "Unexpected server network request escaped the read-only fixture contract.",
    );
    process.exitCode = 1;
  }
  if (!report.failures.length && !report.fixtureRequests.length) {
    report.failures.push("The built server did not exercise the Stampchain GET fixture.");
    process.exitCode = 1;
  }
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  preview?.kill("SIGTERM");
  console.log(
    JSON.stringify(
      {
        ok: !report.failures.length,
        report: join(out, "results.json"),
        journeys: report.journeys.map(({ viewport, assertions }) => ({
          viewport: viewport.name,
          checks: assertions.length,
        })),
        failures: report.failures,
      },
      null,
      2,
    ),
  );
}
