import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, request } from "node:http";
import { mkdir, mkdtemp, open, readFile, readdir, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COFFEE_ROLLBACK_SHA = "c183e32d3dc4de923490471da2d30a66caf788a7";
const root = fileURLToPath(new URL("..", import.meta.url));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function loopback(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:", "QA previews must use local HTTP");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/", "Both QA builds use the same root base path");
  assert.equal(url.username + url.password + url.search + url.hash, "");
  return url;
}

async function removeEnvironmentFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name === ".grok" || entry.name.startsWith(".env"))
      await rm(path, { recursive: true, force: true });
    else if (entry.isDirectory()) await removeEnvironmentFiles(path);
  }
}

async function listen(server) {
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      done();
    });
  });
  return server.address().port;
}

async function freePort() {
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise((done) => reservation.close(done));
  return port;
}

async function assetsAt(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.ok, true, `Built preview did not respond at ${url}`);
  const html = await response.text();
  const assets = [];
  for (const [, path] of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)) {
    const target = new URL(path, url);
    if (target.origin !== url.origin || assets.some((asset) => asset.path === target.pathname))
      continue;
    const asset = await fetch(target, { signal: AbortSignal.timeout(5000) });
    assert.equal(asset.ok, true, `Missing built asset ${target.pathname}`);
    assets.push({ path: target.pathname, sha256: hash(Buffer.from(await asset.arrayBuffer())) });
  }
  assert.ok(
    assets.some((asset) => asset.path.endsWith(".js")),
    "Expected built JavaScript",
  );
  return { htmlSha256: hash(html), assets };
}

/**
 * Build the recorded rollback source and expose it and the caller's current
 * build through one disposable browser origin. This changes no working tree,
 * deployed Worker, private environment file or browser save on another origin.
 * Callers must clear service workers/caches and inspect the served asset paths
 * when switching builds; the proxy does not claim PWA cache rollback coverage.
 */
export async function startCoffeeRollbackPreview({ currentUrl, outDir }) {
  const current = loopback(currentUrl);
  const output = resolve(outDir);
  await mkdir(output, { recursive: true });
  assert.equal(git("rev-parse", `${COFFEE_ROLLBACK_SHA}^{commit}`), COFFEE_ROLLBACK_SHA);
  const tree = git("rev-parse", `${COFFEE_ROLLBACK_SHA}^{tree}`);
  const stage = await mkdtemp(join(tmpdir(), "the-game-coffee-rollback-"));
  let preview;
  let proxy;
  let previewLog;
  let childError;
  let selected = "current";
  let closed = false;
  async function stop(child) {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    for (
      let attempt = 0;
      attempt < 20 && child.exitCode === null && child.signalCode === null;
      attempt++
    )
      await delay(50);
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
  async function close() {
    if (closed) return;
    closed = true;
    if (proxy) {
      proxy.closeAllConnections();
      await new Promise((done) => proxy.close(done));
    }
    await stop(preview);
    await previewLog?.close();
    await rm(stage, { recursive: true, force: true });
  }
  try {
    const archive = execFileSync("git", ["archive", "--format=tar", COFFEE_ROLLBACK_SHA], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
    });
    execFileSync("tar", ["-xf", "-", "-C", stage], { input: archive });
    await removeEnvironmentFiles(stage);
    const files = ["package.json", "package-lock.json", ".nvmrc"];
    const hashes = {};
    for (const name of files) {
      const [before, now] = await Promise.all([
        readFile(join(stage, name)),
        readFile(join(root, name)),
      ]);
      assert.ok(
        before.equals(now),
        `Rollback ${name} differs; install its pinned dependencies separately`,
      );
      hashes[name] = hash(before);
    }
    await symlink(join(root, "node_modules"), join(stage, "node_modules"), "dir");
    const env = {
      HOME: homedir(),
      PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
      DATABASE_URL: "",
      XAI_API_KEY: "",
      MIND_PROVIDER_MODE: "legacy",
      CI: "true",
      NO_COLOR: "1",
      npm_config_update_notifier: "false",
    };
    const buildLog = await open(join(output, "rollback-build.log"), "w");
    let build;
    try {
      build = spawn("npm", ["run", "build"], {
        cwd: stage,
        env,
        detached: true,
        stdio: ["ignore", buildLog.fd, buildLog.fd],
      });
      await new Promise((done, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Rollback build exceeded five minutes")),
          300000,
        );
        build.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        build.once("exit", (code, signal) => {
          clearTimeout(timeout);
          if (code === 0) done();
          else reject(new Error(`Rollback build exited ${code ?? signal}; see rollback-build.log`));
        });
      });
    } finally {
      await stop(build);
      await buildLog.close();
    }
    const buildText = await readFile(join(output, "rollback-build.log"), "utf8");
    assert.match(
      buildText,
      /DATABASE_URL not set.*skipping/,
      "Rollback must not run a database migration",
    );
    const port = await freePort();
    const rollback = new URL(`http://127.0.0.1:${port}/`);
    previewLog = await open(join(output, "rollback-preview.log"), "w");
    preview = spawn(
      process.execPath,
      [
        "scripts/with-app-env.mjs",
        process.execPath,
        "node_modules/vite/bin/vite.js",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      { cwd: stage, env, detached: true, stdio: ["ignore", previewLog.fd, previewLog.fd] },
    );
    preview.on("error", (error) => {
      childError = error;
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (childError || preview.exitCode !== null || preview.signalCode !== null)
        throw childError ?? new Error("Rollback preview exited; see rollback-preview.log");
      try {
        if ((await fetch(rollback, { signal: AbortSignal.timeout(1000) })).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Preview is warming. */
      }
      await delay(250);
    }
    assert.ok(ready, "Rollback preview did not start within its bounded wait");
    const [currentBuild, rollbackBuild] = await Promise.all([
      assetsAt(current),
      assetsAt(rollback),
    ]);
    proxy = createServer((incoming, outgoing) => {
      if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
        outgoing.writeHead(400).end("Only local QA paths are accepted");
        return;
      }
      if (
        selected === "rollback" &&
        (childError || preview.exitCode !== null || preview.signalCode !== null)
      ) {
        outgoing.writeHead(502).end("The pinned rollback preview exited");
        return;
      }
      const version = selected;
      const target = version === "current" ? current : rollback;
      const upstream = request(
        {
          hostname: target.hostname,
          port: target.port,
          path: incoming.url,
          method: incoming.method,
          headers: { ...incoming.headers, host: target.host, connection: "close" },
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, {
            ...response.headers,
            "cache-control": "no-store",
            pragma: "no-cache",
            expires: "0",
            "x-game-qa-version": version,
            "x-the-game-qa-source": version === "rollback" ? COFFEE_ROLLBACK_SHA : "current",
          });
          response.pipe(outgoing);
        },
      );
      upstream.on("error", () => {
        if (!outgoing.headersSent) outgoing.writeHead(502);
        outgoing.end("The selected local QA preview is unavailable");
      });
      upstream.setTimeout(30000, () => upstream.destroy(new Error("Local QA request timed out")));
      incoming.on("aborted", () => upstream.destroy());
      incoming.pipe(upstream);
    });
    const proxyPort = await listen(proxy);
    return {
      url: `http://127.0.0.1:${proxyPort}/`,
      select(version) {
        assert.ok(["current", "rollback"].includes(version));
        selected = version;
      },
      receipt: {
        rollbackSource: COFFEE_ROLLBACK_SHA,
        rollbackTree: tree,
        matchingDependencyFiles: hashes,
        credentialFreeBuild: true,
        privateEnvironmentFilesIncluded: false,
        build: {
          command: "npm run build",
          exitCode: 0,
          migrationSkipped: true,
          log: "rollback-build.log",
        },
        currentBuild,
        rollbackBuild,
        limitations: [
          "Root-base HTTP preview; browser must bypass service workers/caches; not a deployed Worker rollback",
        ],
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
