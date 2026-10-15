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
  const payload = Buffer.concat([Buffer.from([128]), key.getPrivateKey(), Buffer.from([1])]);
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
    let lastCompletion;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes("_serverFn") || url.pathname.startsWith("/api/auth/"))
        requests.push(url.pathname);
      if (request.method() === "POST" && request.postData()?.includes("challengeId"))
        lastCompletion = {
          url: request.url(),
          data: request.postData(),
          contentType: request.headers()["content-type"],
        };
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await tool(page).waitFor();
    await open(page);
    await panel(page)
      .getByText(/^This draft profile was retired\./)
      .waitFor();
    journey.checks.push(
      "retirement persists on reload and rejects old proof replay",
      "portable saves contain no private registrations, receiving addresses or proofs",
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
    assert.deepEqual([...new Set(journey.walletMethods)].sort(), ["getAddresses", "signMessage"]);
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
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: join(out, "failure.png") }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  report.fixtureRequests = serverOutput
    .split("\n")
    .filter((line) => line.startsWith("[agent-fixture] "))
    .map((line) => JSON.parse(line.slice("[agent-fixture] ".length)));
  if (
    report.fixtureRequests.some((item) => item.unexpectedNetwork || item.method !== "GET") ||
    !report.fixtureRequests.length
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
