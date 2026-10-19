import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createECDH, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeSignedCookie } from "better-call";
import { Address, Signer, Verifier } from "bip322-js";
import { chromium } from "playwright";

// Built-browser QA with disposable real Better Auth sessions and real BIP-322
// signatures. Only extension prompts and public indexer GET data are fixtures.
const target = new URL(process.env.GAME_AGENT_QA_URL || "http://127.0.0.1:8197/");
assert.equal(Number(process.versions.node.split(".")[0]), 24);
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
const walletId = process.env.GAME_AGENT_QA_WALLET || "wonder";
assert.ok(["wonder", "leather"].includes(walletId));
const out = resolve(process.env.GAME_AGENT_QA_OUT || "artifacts/agent-wallet-browser");
await mkdir(out, { recursive: true });
const secret = randomBytes(32).toString("hex");
const sessions = [0, 1].map((index) => ({
  owner: `agent-qa-owner-${index}`,
  token: randomBytes(32).toString("hex"),
}));
const report = {
  url: target.href,
  builtPreview: true,
  genuineAccountSessions: true,
  genuineBip322: true,
  walletId,
  spendingMethods: 0,
  journeys: [],
  fixtureRequests: [],
  failures: [],
};
let preview, browser, activePage;
let serverOutput = "";
const sha = (bytes) => createHash("sha256").update(bytes).digest();
function wallet() {
  const key = createECDH("secp256k1");
  key.generateKeys();
  const publicKey = key.getPublicKey(undefined, "compressed");
  // ECDH omits leading zero bytes; compressed WIF requires the full 32-byte scalar.
  const scalar = key.getPrivateKey();
  const privateKey = Buffer.alloc(32);
  scalar.copy(privateKey, privateKey.length - scalar.length);
  const payload = Buffer.concat([Buffer.from([128]), privateKey, Buffer.from([1])]);
  const checked = Buffer.concat([payload, sha(sha(payload)).subarray(0, 4)]);
  let n = BigInt(`0x${checked.toString("hex")}`),
    wif = "";
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  while (n) {
    wif = alphabet[Number(n % 58n)] + wif;
    n /= 58n;
  }
  const address = Address.convertPubKeyIntoAddress(publicKey, "p2wpkh").mainnet;
  return {
    address,
    publicKey: publicKey.toString("hex"),
    sign(message) {
      assert.ok(message.startsWith("THE GAME: private agent receiving-address draft\n"));
      assert.ok(message.includes(`Origin: ${target.origin}\n`));
      assert.ok(message.includes(`Bitcoin address: ${address}\n`));
      assert.ok(message.includes("does not publish funding instructions"));
      const signature = Signer.sign(wif, address, message);
      assert.equal(Verifier.verifySignature(address, message, signature, true), true);
      return signature;
    },
  };
}
const wallets = Array.from({ length: 4 }, wallet);
const manifest = await readFile(".vercel/output/functions/__server.func/_ssr/ssr.mjs", "utf8");
const availabilityId =
  /"([0-9a-f]{64})":\s*\{\s*functionName: "mindAvailability_createServerFn_handler"/.exec(
    manifest,
  )?.[1];
assert.ok(availabilityId, "Find the existing availability-only RPC in the actual built manifest");
async function startPreview() {
  preview = spawn(
    process.execPath,
    [
      "scripts/with-app-env.mjs",
      process.execPath,
      "--import",
      fileURLToPath(new URL("./fixtures/agent-wallet-fixture.mjs", import.meta.url)),
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      target.hostname,
      "--port",
      target.port,
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DATABASE_URL: "",
        XAI_API_KEY: "",
        VERCEL: "",
        GROK_PROJECT_ID: "",
        VITE_AUTH_ENABLED: "true",
        BETTER_AUTH_SECRET: secret,
        BETTER_AUTH_URL: target.origin,
        AGENT_REGISTRY_LOCAL_DEV: "true",
        GAME_AGENT_QA_FIXTURE: "1",
        GAME_AGENT_QA_SESSIONS: JSON.stringify(sessions),
        GAME_AGENT_QA_ADDRESSES: JSON.stringify(wallets.map((item) => item.address)),
      },
    },
  );
  for (const stream of [preview.stdout, preview.stderr])
    stream.on("data", (data) => {
      serverOutput = (serverOutput + data.toString()).slice(-30_000);
    });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (preview.exitCode !== null) throw new Error(`Built QA preview exited: ${serverOutput}`);
    try {
      if ((await fetch(target.href, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* warming */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Built QA preview did not start: ${serverOutput}`);
}
const panel = (page) => page.getByRole("dialog", { name: "Agent wallets", exact: true });
const observations = (page) =>
  panel(page).getByRole("region", { name: "Private chain observations", exact: true });
const bitcoin = (page) =>
  observations(page).getByRole("region", { name: "Bitcoin outputs", exact: true });
const counterparty = (page) =>
  observations(page).getByRole("region", { name: "Counterparty direct sends", exact: true });
const fixtureChainCalls = () =>
  serverOutput
    .split("\n")
    .filter((line) => line.startsWith("[agent-fixture] "))
    .map((line) => JSON.parse(line.slice("[agent-fixture] ".length)))
    .filter((item) => item.chain);
const tool = (page) => page.getByRole("button", { name: "Agent wallets", exact: true });
const rawTown = (page) => page.evaluate(() => localStorage.getItem("the-game-town-v2"));
const balances = (raw) => {
  const town = JSON.parse(raw).town;
  return {
    money: town.agents.map((item) => [item.id, item.money]),
    economy: town.economy,
    debts: town.debts,
  };
};
async function sessionCookie(context, index) {
  const serialized = await serializeSignedCookie(
    "__Host-grok-auth.session_token",
    sessions[index].token,
    secret,
    { path: "/", httpOnly: true, secure: true, sameSite: "lax" },
  );
  const pair = serialized.split(";", 1)[0];
  await context.addCookies([
    {
      name: pair.slice(0, pair.indexOf("=")),
      value: pair.slice(pair.indexOf("=") + 1),
      domain: target.hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}
async function contextFor(viewport, journey, owner, saved) {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 500,
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === target.origin || url.protocol === "data:") return route.continue();
    journey.externalRequests.push(url.origin);
    return route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  if (owner !== undefined) await sessionCookie(context, owner);
  if (saved)
    await context.addInitScript((raw) => localStorage.setItem("the-game-town-v2", raw), saved);
  await context.exposeFunction("__agentQaSign", (index, message) => wallets[index].sign(message));
  await context.exposeFunction("__agentQaCall", (method) => journey.walletMethods.push(method));
  await context.addInitScript(
    (addresses) => {
      const state = (window.__agentWalletMock = {
        index: 0,
        pending: false,
        jobs: [],
        connected: false,
        listeners: new Map(),
        emit(event) {
          if (event === "disconnect") this.connected = false;
          const payload = event === "accountsChanged" ? [addresses[this.index].address] : undefined;
          for (const listener of this.listeners.get(event) || []) listener(payload);
        },
        async release() {
          for (const job of this.jobs.splice(0)) job.resolve(await response(job.params, job.index));
        },
      });
      async function response(params, index) {
        return {
          result: {
            address: addresses[index].address,
            message: params.message,
            signature: await window.__agentQaSign(index, params.message),
          },
        };
      }
      window.LeatherProvider = {
        async request(method, params) {
          await window.__agentQaCall(method);
          const index = state.index;
          if (method === "getAddresses")
            return {
              result: {
                addresses: [
                  {
                    symbol: "BTC",
                    type: "p2wpkh",
                    address: addresses[index].address,
                    publicKey: addresses[index].publicKey,
                    derivationPath: "m/84'/0'/0'/0/0",
                  },
                ],
              },
            };
          assertReadOnly(method, params);
          if (state.pending)
            return new Promise((resolve) => state.jobs.push({ resolve, params, index }));
          return response(params, index);
        },
      };
      window.wonderWallet = {
        isWonderWallet: true,
        async requestAccounts() {
          await window.__agentQaCall("requestAccounts");
          const accounts = [addresses[state.index].address];
          if (state.connected) return accounts;
          state.connected = true;
          // Actual Wonder emits this before its fresh approval promise resolves.
          state.emit("accountsChanged");
          return {
            accounts,
            proof: {
              address: accounts[0],
              message: "untrusted-wallet-generated-login",
              signature: "not-the-server-proof",
              scheme: "BIP-322",
            },
          };
        },
        async getAccounts() {
          await window.__agentQaCall("getAccounts");
          return state.connected ? [addresses[state.index].address] : [];
        },
        async signMessage(message, address) {
          await window.__agentQaCall("signMessage");
          const index = state.index;
          if (address !== addresses[index].address)
            throw new Error("Unexpected Wonder proof address");
          const params = { message };
          if (state.pending) {
            const result = await new Promise((resolve) =>
              state.jobs.push({ resolve, params, index }),
            );
            return result.result.signature;
          }
          return (await response(params, index)).result.signature;
        },
        on(event, listener) {
          const values = state.listeners.get(event) || new Set();
          values.add(listener);
          state.listeners.set(event, values);
        },
        removeListener(event, listener) {
          state.listeners.get(event)?.delete(listener);
        },
      };
      function assertReadOnly(method, params) {
        if (
          method !== "signMessage" ||
          params.type !== "bip322" ||
          params.paymentType !== "p2wpkh" ||
          params.network !== "mainnet" ||
          params.account !== 0
        )
          throw new Error("QA wallet forbids transaction methods or unsupported proofs");
      }
    },
    wallets.map(({ address, publicKey }) => ({ address, publicKey })),
  );
  return context;
}
async function enter(page, name, existing = false) {
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const nameField = page.getByLabel("What do they call you?", { exact: true });
  if (!existing) {
    await nameField.waitFor();
    await nameField.fill(name);
    await page.getByLabel("Use local dialogue only", { exact: true }).check();
    await page.getByRole("button", { name: "Walk in", exact: true }).click();
  }
  await page.waitForFunction(
    () => Boolean(window.__game) && Boolean(localStorage.getItem("the-game-town-v2")),
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(150);
}
async function open(page) {
  await tool(page).click();
  await panel(page).getByRole("button", { name: "Refresh owner status", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] .mind-body')?.getAttribute("aria-busy") === "false",
  );
  const choice = panel(page).getByLabel("Receiving wallet", { exact: true });
  if ((await choice.inputValue()) !== walletId) await choice.selectOption(walletId);
}

async function verify(page, role, index) {
  await panel(page).getByLabel("Resident", { exact: true }).selectOption(role);
  await page.evaluate((value) => {
    window.__agentWalletMock.index = value;
  }, index);
  await panel(page).getByRole("button", { name: "Verify external address", exact: true }).click();
  await panel(page)
    .getByText(/External address verified for .*funding is unpublished\./)
    .waitFor();
  await panel(page).getByText(wallets[index].address, { exact: true }).waitFor();
}
async function importTown(page, raw, fork = false) {
  await page.getByLabel("Import a town file", { exact: true }).setInputFiles({
    name: "synthetic-private-registry-town.json",
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
const pendingProofTimes = new WeakMap();
async function pendingProof(page, role, index) {
  const times = pendingProofTimes.get(page) || new Map();
  pendingProofTimes.set(page, times);
  const previous = times.get(role);
  // Keep the real server's five-second per-profile proof cooldown intact.
  if (previous !== undefined)
    await page.waitForTimeout(Math.max(0, 5_200 - (Date.now() - previous)));
  await panel(page).getByLabel("Resident", { exact: true }).selectOption(role);
  await page.evaluate((value) => {
    window.__agentWalletMock.index = value;
    window.__agentWalletMock.pending = true;
  }, index);
  await panel(page).getByRole("button", { name: "Verify external address", exact: true }).click();
  await page.waitForFunction(() => window.__agentWalletMock.jobs.length === 1);
  times.set(role, Date.now());
}
async function releaseProof(page) {
  await page.evaluate(async () => {
    window.__agentWalletMock.pending = false;
    await window.__agentWalletMock.release();
  });
  // A resolved extension promise gets a chance to dispatch any unwanted finish POST.
  await page.waitForTimeout(150);
}
async function loadObservations(page) {
  const before = fixtureChainCalls().length;
  await observations(page).getByRole("button", { name: "Load observations", exact: true }).click();
  await observations(page)
    .getByText("Recorded observations loaded. Refresh chain observations to request a new scan.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    fixtureChainCalls().length,
    before,
    "Loading stored observations must not contact any external indexer",
  );
}
async function assertBitcoinEvidence(page) {
  await bitcoin(page).getByText("1000 satoshis", { exact: true }).waitFor();
  await bitcoin(page).getByText("1234 satoshis", { exact: true }).waitFor();
  await bitcoin(page).getByText("4321 satoshis", { exact: true }).waitFor();
  assert.equal(await bitcoin(page).locator("li").count(), 3);
  const pending = bitcoin(page)
    .locator("li")
    .filter({ has: page.getByText("1000 satoshis", { exact: true }) });
  await pending.getByText("Last observed state: Pending", { exact: true }).waitFor();
  for (const [quantity, output] of [
    [1234, 0],
    [4321, 2],
  ]) {
    const row = bitcoin(page)
      .locator("li")
      .filter({ has: page.getByText(`${quantity} satoshis`, { exact: true }) });
    await row
      .getByText("Last observed state: Confirmed · observed block inclusion", { exact: true })
      .waitFor();
    await row.locator("summary").click();
    await row.getByText(`Transaction ${"1".repeat(64)}`, { exact: true }).waitFor();
    await row.getByText(`Output ${output}`, { exact: true }).waitFor();
    await row.locator("summary").click();
  }
  await counterparty(page)
    .getByText("Current status unknown · source unavailable", { exact: true })
    .waitFor();
  await counterparty(page)
    .getByText("No current observations are available. This does not mean zero deposits.", {
      exact: true,
    })
    .waitFor();
}
try {
  await startPreview();
  browser = await chromium.launch({ headless: true });
  for (const [index, viewport] of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ].entries()) {
    const journey = { viewport, checks: [], walletMethods: [], externalRequests: [], errors: [] };
    report.journeys.push(journey);
    const context = await contextFor(viewport, journey, index);
    const page = (activePage = await context.newPage());
    page.on("pageerror", (error) => journey.errors.push(error.message));
    const requests = [];
    let completionCount = 0;
    let lastCompletion;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes("_serverFn") || url.pathname.startsWith("/api/auth/"))
        requests.push(url.pathname);
      if (request.method() === "POST" && request.postData()?.includes("challengeId")) {
        completionCount++;
        lastCompletion = {
          url: request.url(),
          data: request.postData(),
          contentType: request.headers()["content-type"],
        };
      }
    });
    await enter(page, `Registry QA ${index}`);
    assert.deepEqual(
      requests.filter((path) => path !== `/_serverFn/${availabilityId}`),
      [],
      "Local play must make zero auth or registry RPC requests before owner tools are opened",
    );
    const before = balances(await rawTown(page));
    await open(page);
    if (index === 0) {
      await panel(page)
        .getByRole("button", { name: "Register private copy", exact: true })
        .waitFor();
      assert.ok(
        (await context.cookies()).some((item) => item.name === "__Host-grok-auth.session_data"),
        "Use an actual server-signed account cache",
      );
      await sessionCookie(context, 1);
      const cachedAccount = await page.evaluate(
        async () =>
          (await (await fetch("/api/auth/get-session", { credentials: "same-origin" })).json()).user
            ?.id,
      );
      assert.equal(
        cachedAccount,
        sessions[0].owner,
        "The test must retain genuine cached account A while token B is active",
      );
      await panel(page).getByRole("button", { name: "Register private copy", exact: true }).click();
      await panel(page)
        .getByRole("alert")
        .filter({ hasText: /account changed|account status|owner session/ })
        .waitFor();
      assert.equal(await panel(page).getByLabel("Resident", { exact: true }).count(), 0);
      await panel(page).getByRole("button", { name: "Refresh owner status", exact: true }).click();
      await panel(page)
        .getByText(/Signed in as Disposable owner 2\./)
        .waitFor();
      await panel(page)
        .getByRole("button", { name: "Register private copy", exact: true })
        .waitFor();
      journey.checks.push(
        "mixed cached account A/live session B blocks registration and reveals no private profiles until explicit refresh",
      );
      await sessionCookie(context, 0);
      await panel(page).getByRole("button", { name: "Refresh owner status", exact: true }).click();
      await panel(page)
        .getByText(/Signed in as Disposable owner 1\./)
        .waitFor();
      await panel(page)
        .getByRole("button", { name: "Register private copy", exact: true })
        .waitFor();
    }
    await panel(page).getByRole("button", { name: "Register private copy", exact: true }).click();
    await panel(page).getByLabel("Resident", { exact: true }).waitFor();
    assert.equal(
      await panel(page).getByLabel("Resident", { exact: true }).locator("option").count(),
      8,
    );
    journey.checks.push(
      "optional tools do not contact auth or registry before opening",
      "a real account registers all eight residents privately",
    );
    const completionsBeforeCancel = completionCount;
    await pendingProof(page, "data", index * 2);
    await panel(page).getByLabel("Resident", { exact: true }).selectOption("amelia");
    await page.evaluate(
      (value) => {
        window.__agentWalletMock.index = value;
      },
      index * 2 + 1,
    );
    await releaseProof(page);
    assert.equal(completionCount, completionsBeforeCancel);
    await panel(page).getByText("No external address is linked yet.", { exact: true }).waitFor();
    await pendingProof(page, "baba", index * 2);
    await panel(page).getByRole("button", { name: "Cancel request", exact: true }).click();
    await releaseProof(page);
    assert.equal(completionCount, completionsBeforeCancel);
    await pendingProof(page, "arwyn", index * 2);
    await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
    await releaseProof(page);
    assert.equal(completionCount, completionsBeforeCancel);
    await page.reload({ waitUntil: "domcontentloaded" });
    await tool(page).waitFor();
    await open(page);
    await panel(page).getByLabel("Resident", { exact: true }).waitFor();
    for (const role of ["data", "amelia", "baba", "arwyn"]) {
      await panel(page).getByLabel("Resident", { exact: true }).selectOption(role);
      await panel(page).getByText("No external address is linked yet.", { exact: true }).waitFor();
    }
    journey.checks.push(
      "a delayed signature cannot finish after resident/wallet selection changes",
      "canceling or closing a pending extension prompt sends no proof completion and survives reload without linking a profile",
    );
    await pendingProof(page, "northern", index * 2);
    await panel(page)
      .getByLabel("Receiving wallet", { exact: true })
      .selectOption(walletId === "wonder" ? "leather" : "wonder");
    await releaseProof(page);
    assert.equal(
      completionCount,
      completionsBeforeCancel,
      "A late signature cannot complete after changing provider",
    );
    await panel(page).getByLabel("Receiving wallet", { exact: true }).selectOption(walletId);
    await panel(page).getByLabel("Resident", { exact: true }).waitFor();
    await panel(page).getByText("No external address is linked yet.", { exact: true }).waitFor();
    journey.checks.push(
      "changing the explicit wallet provider cancels a pending proof without changing the authenticated owner or linking an address",
    );
    if (walletId === "wonder") {
      for (const event of ["accountsChanged", "disconnect"]) {
        await pendingProof(page, "northern", index * 2);
        await page.evaluate((event) => window.__agentWalletMock.emit(event), event);
        await releaseProof(page);
        assert.equal(
          completionCount,
          completionsBeforeCancel,
          "A changed Wonder grant cannot submit its stale proof",
        );
        await panel(page)
          .getByRole("button", { name: "Refresh owner status", exact: true })
          .click();
        await panel(page).getByLabel("Resident", { exact: true }).waitFor();
        await panel(page).getByLabel("Resident", { exact: true }).selectOption("northern");
        await panel(page)
          .getByText("No external address is linked yet.", { exact: true })
          .waitFor();
        journey.checks.push(
          `Wonder ${event} prevents a pending signature from completing a receiving proof`,
        );
      }
    }
    await verify(page, "player", index * 2);
    const replay = lastCompletion;
    assert.ok(replay, "Capture the real proof completion to test replay after retirement");
    await panel(page).getByRole("button", { name: "Refresh inventory", exact: true }).click();
    await panel(page).getByText("Observed quantity 2 · Supply 10", { exact: true }).waitFor();
    await panel(page).getByText("Bitcoin balance: not checked.", { exact: true }).waitFor();
    await panel(page)
      .getByText("Observed quantity 2 · Supply 10", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${index}-private-inventory.png`) });
    const beforeObservationLoad = fixtureChainCalls().length;
    await loadObservations(page);
    assert.equal(fixtureChainCalls().length, beforeObservationLoad);
    await bitcoin(page).getByText("Not checked", { exact: true }).waitFor();
    await counterparty(page).getByText("Not checked", { exact: true }).waitFor();
    await observations(page)
      .getByRole("button", { name: "Refresh chain observations", exact: true })
      .click();
    await assertBitcoinEvidence(page);
    await bitcoin(page).getByText("1234 satoshis", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${index}-bitcoin-observations.png`) });
    await counterparty(page)
      .getByRole("heading", { name: "Counterparty direct sends", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${index}-counterparty-unknown.png`) });
    assert.deepEqual(balances(await rawTown(page)), before);
    await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await tool(page).waitFor();
    await open(page);
    await panel(page).getByLabel("Resident", { exact: true }).waitFor();
    await loadObservations(page);
    await assertBitcoinEvidence(page);
    journey.checks.push(
      "explicit observation load reads stored evidence without indexer calls; one refresh records pending and distinct confirmed Bitcoin outputs while Counterparty outage stays unknown",
      "private chain observations survive reload without changing town coins or inferring spendability",
    );
    const failSignOut = (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "QA_SIGN_OUT_UNAVAILABLE", message: "Disposable outage" }),
      });
    await context.route("**/api/auth/sign-out", failSignOut);
    await panel(page).getByRole("button", { name: "Sign out", exact: true }).click();
    assert.equal(await panel(page).getByLabel("Resident", { exact: true }).count(), 0);
    await panel(page)
      .getByRole("alert")
      .filter({ hasText: /Sign-out could not be confirmed/ })
      .waitFor();
    await context.unroute("**/api/auth/sign-out", failSignOut);
    await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
    const afterSignOutIntent = requests.length;
    await open(page);
    await panel(page)
      .getByText(/Private details for this account are hidden\./)
      .waitFor();
    assert.equal(await panel(page).getByLabel("Resident", { exact: true }).count(), 0);
    await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await tool(page).waitFor();
    await open(page);
    await panel(page)
      .getByText(/Private details for this account are hidden\./)
      .waitFor();
    assert.equal(await panel(page).getByLabel("Resident", { exact: true }).count(), 0);
    assert.equal(
      await panel(page)
        .getByText(wallets[index * 2].address, { exact: true })
        .count(),
      0,
    );
    assert.deepEqual(
      requests
        .slice(afterSignOutIntent)
        .filter((path) => path.includes("_serverFn") && path !== `/_serverFn/${availabilityId}`),
      [],
      "A failed sign-out must not automatically refetch owner-registry data after reopen/reload",
    );
    await page.screenshot({ path: join(out, `${index}-failed-signout-hidden.png`) });
    await panel(page).getByRole("button", { name: "Refresh owner status", exact: true }).click();
    await panel(page).getByLabel("Resident", { exact: true }).waitFor();
    await panel(page)
      .getByText(wallets[index * 2].address, { exact: true })
      .waitFor();
    journey.checks.push(
      "failed sign-out hides private data through close/reopen/reload with no owner RPC until an explicit verified refresh restores it",
    );
    await verify(page, "kevin", index * 2 + 1);
    await panel(page).getByRole("button", { name: "Refresh inventory", exact: true }).click();
    await panel(page).getByRole("alert").waitFor();
    assert.equal(
      await panel(page)
        .getByText("No supported stamps were found on this page.", { exact: true })
        .count(),
      0,
    );
    assert.deepEqual(balances(await rawTown(page)), before);
    journey.checks.push(
      "two residents verify distinct disposable addresses through real BIP-322",
      "inventory is read only and API outage stays unknown without changing game coins",
    );
    await loadObservations(page);
    await observations(page)
      .getByRole("button", { name: "Refresh chain observations", exact: true })
      .click();
    await bitcoin(page)
      .getByText("Current status unknown · source unavailable", { exact: true })
      .waitFor();
    await bitcoin(page)
      .getByText("No current observations are available. This does not mean zero deposits.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await bitcoin(page).locator("li").count(), 0);
    assert.equal(
      await bitcoin(page)
        .getByText(
          "No incoming events were observed in this scan. Incomplete coverage can omit events.",
          { exact: true },
        )
        .count(),
      0,
    );
    assert.deepEqual(balances(await rawTown(page)), before);
    journey.checks.push(
      "a second resident's Bitcoin source outage remains unknown rather than zero and never credits game money",
    );
    await panel(page).getByLabel("Resident", { exact: true }).selectOption("player");
    await panel(page).getByRole("button", { name: "Retire draft profile", exact: true }).click();
    await panel(page).getByRole("button", { name: "Confirm retire profile", exact: true }).click();
    await panel(page)
      .getByText(/^This draft profile was retired\./)
      .waitFor();
    const replayResult = await page.evaluate(async (request) => {
      const response = await fetch(request.url, {
        method: "POST",
        credentials: "same-origin",
        body: request.data,
        headers: {
          "content-type": request.contentType,
          "x-tsr-serverFn": "true",
          accept: "application/json",
        },
      });
      return { status: response.status, body: await response.text() };
    }, replay);
    assert.ok(
      replayResult.body.includes("expired"),
      `Old proof replay must expire (HTTP ${replayResult.status}; ${replayResult.body.slice(0, 500)})`,
    );
    await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
    const saved = await rawTown(page);
    for (const item of wallets) assert.equal(saved.includes(item.address), false);
    for (const value of ["registration_", "profile_", "resident_", "valid-test-proof"])
      assert.equal(saved.includes(value), false);
    for (const value of ["1".repeat(64), "2".repeat(64), '"eventId"', '"lease_token"'])
      assert.equal(saved.includes(value), false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await tool(page).waitFor();
    await open(page);
    await panel(page)
      .getByText(/^This draft profile was retired\./)
      .waitFor();
    await loadObservations(page);
    await assertBitcoinEvidence(page);
    journey.checks.push(
      "retirement persists on reload and rejects old proof replay",
      "portable saves contain no private registrations, receiving addresses or proofs",
      "retired profiles retain their private historical-address observations after reload",
    );
    assert.equal(await page.evaluate(() => document.cookie.includes("grok-auth")), false);
    const cookie = (await context.cookies()).find(
      (item) => item.name === "__Host-grok-auth.session_token",
    );
    assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    const rect = await panel(page).boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= viewport.width + 1);
    await panel(page)
      .getByText(/^This draft profile was retired\./)
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${index}-retired.png`) });
    if (index === 0) {
      await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
      const changedSource = JSON.parse(saved);
      changedSource.town.identityRegistry.characters.kevin.characterId = `character_${randomBytes(32).toString("hex")}`;
      await importTown(page, JSON.stringify(changedSource));
      await open(page);
      await panel(page)
        .getByRole("alert")
        .filter({ hasText: /different owner or resident roster/ })
        .waitFor();
      assert.equal(await panel(page).getByLabel("Resident", { exact: true }).count(), 0);
      for (const item of wallets)
        assert.equal(await panel(page).getByText(item.address, { exact: true }).count(), 0);
      await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
      await importTown(page, saved, true);
      await open(page);
      await panel(page).getByRole("button", { name: "Register private copy", exact: true }).click();
      await panel(page).getByLabel("Resident", { exact: true }).waitFor();
      await panel(page).getByText("No external address is linked yet.", { exact: true }).waitFor();
      await panel(page).getByRole("button", { name: "Close agent wallets", exact: true }).click();
      await importTown(page, saved);
      await open(page);
      await panel(page)
        .getByText(/^This draft profile was retired\./)
        .waitFor();
      await panel(page).getByLabel("Resident", { exact: true }).selectOption("kevin");
      await panel(page).getByText(wallets[1].address, { exact: true }).waitFor();
      assert.deepEqual(
        balances(await rawTown(page)).money,
        before.money,
        "Source/fork restoration preserves resident coins; legacy imports may initialize their opening ledger",
      );
      journey.checks.push(
        "an altered source roster cannot remap private residents; a fork starts with empty profiles and restoring the source recovers its own registry",
      );
      const other = await contextFor(viewport, journey, 1, saved);
      const otherPage = (activePage = await other.newPage());
      await enter(otherPage, "Same public IDs", true);
      await open(otherPage);
      await panel(otherPage)
        .getByRole("button", { name: "Register private copy", exact: true })
        .click();
      await panel(otherPage).getByLabel("Resident", { exact: true }).waitFor();
      await panel(otherPage)
        .getByText("No external address is linked yet.", { exact: true })
        .waitFor();
      await panel(otherPage)
        .getByRole("button", { name: "Verify external address", exact: true })
        .click();
      await panel(otherPage)
        .getByRole("alert")
        .filter({ hasText: /conflicts|reserved/ })
        .waitFor();
      journey.checks.push(
        "another account creates its own copy of identical public IDs and cannot reuse a retired address",
      );
      await other.close();
      const guest = await contextFor(viewport, journey, undefined, saved);
      const guestPage = (activePage = await guest.newPage());
      await enter(guestPage, "Guest", true);
      await open(guestPage);
      await panel(guestPage)
        .getByText(
          "Sign in to register a private copy and manage its residents' watch-only profiles.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await panel(guestPage).getByLabel("Resident", { exact: true }).count(), 0);
      journey.checks.push("unsigned visitors cannot inherit private profiles from portable saves");
      await guest.close();
    }
    assert.deepEqual(
      [...new Set(journey.walletMethods)].sort(),
      walletId === "wonder"
        ? ["getAccounts", "requestAccounts", "signMessage"]
        : ["getAddresses", "signMessage"],
    );
    assert.deepEqual(journey.errors, []);
    journey.checks.push(
      "account cookie is Secure, HttpOnly and inaccessible to scripts",
      "desktop/phone panel stays within viewport; wallet methods are address lookup and message signing only",
    );
    await context.close();
  }
} catch (error) {
  report.failures.push(
    (error instanceof Error ? error.stack || error.message : String(error)).slice(0, 4000),
  );
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => undefined);
    await writeFile(
      join(out, "failure-body.txt"),
      await activePage.locator("body").innerText(),
    ).catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  report.fixtureRequests = serverOutput
    .split("\n")
    .filter((line) => line.startsWith("[agent-fixture] "))
    .map((line) => JSON.parse(line.slice("[agent-fixture] ".length)));
  if (
    report.fixtureRequests.some((item) => item.unexpectedNetwork || item.method !== "GET") ||
    !report.fixtureRequests.length ||
    !report.fixtureRequests.some((item) => item.chain && item.protocol === "bitcoin") ||
    !report.fixtureRequests.some((item) => item.chain && item.protocol === "counterparty")
  ) {
    report.failures.push("The read-only indexer fixture contract was not satisfied.");
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
        journeys: report.journeys.map((item) => ({
          viewport: item.viewport,
          checks: item.checks.length,
        })),
        failures: report.failures,
      },
      null,
      2,
    ),
  );
}
