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
  const privateKey = key.getPrivateKey();
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
  await page
    .getByLabel("Import a town file", { exact: true })
    .setInputFiles({
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
    .getByText("Connect Leather to browse stamps you hold.", { exact: true })
    .waitFor();
}
async function installWallet(context, result) {
  await context.exposeFunction("__stampQaSign", (message) => wallet.sign(message));
  await context.exposeFunction("__stampQaCall", (method) => {
    result.walletCalls.push(method);
  });
  await context.addInitScript(
    ({ address, publicKey }) => {
      const state = (window.__stampWalletMock = {
        mode: "approve",
        calls: [],
        pending: [],
        install() {
          window.LeatherProvider = provider;
        },
        async release() {
          for (const job of this.pending.splice(0)) job.resolve(await response(job.params));
        },
      });
      async function response(params) {
        return {
          jsonrpc: "2.0",
          result: {
            address,
            message: params.message,
            signature: await window.__stampQaSign(params.message),
          },
        };
      }
      const provider = {
        async request(method, params) {
          state.calls.push({ method });
          await window.__stampQaCall(method);
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
          if (state.mode === "reject")
            throw { error: { code: 4001, message: "User declined fixture proof" } };
          if (state.mode === "pending")
            return new Promise((resolve) => state.pending.push({ params, resolve }));
          return response(params);
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
    const page = (activePage = await context.newPage());
    page.on("pageerror", (error) => result.errors.push(error.message));
    let expectingAbort = false;
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (
        expectingAbort &&
        /Failed to load resource|Failed to fetch|net::ERR_FAILED/.test(message.text())
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
    await panel(page).getByRole("button", { name: "Connect Leather", exact: true }).click();
    await panel(page).getByRole("alert").filter({ hasText: "Leather was not found" }).waitFor();
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
    await panel(page).getByRole("button", { name: "Connect Leather", exact: true }).click();
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
    await panel(page).getByRole("button", { name: "Connect Leather", exact: true }).click();
    await page.waitForFunction(() => window.__stampWalletMock.pending.length === 1);
    await panel(page).getByRole("button", { name: "Cancel request", exact: true }).click();
    await page.evaluate(() => window.__stampWalletMock.release());
    await page.waitForTimeout(150);
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
    await panel(page).getByRole("button", { name: "Connect Leather", exact: true }).click();
    await panel(page).getByRole("heading", { name: "Choose a stamp", exact: true }).waitFor();
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
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "The panel must not create horizontal overflow",
    );
    const rect = await panel(page).boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= viewport.width + 1);
    result.walletMethods = [...new Set(result.walletCalls)];
    assert.deepEqual(result.walletMethods.sort(), ["getAddresses", "signMessage"]);
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
