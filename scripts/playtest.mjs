#!/usr/bin/env node
/** Local, credential-free human playtests. Does not open a browser or clear a town. */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLAYTEST_SESSIONS = Object.freeze(
  Array.from({ length: 5 }, (_, index) => ({
    id: `PT0${index + 1}`,
    port: 8181 + index,
    url: `http://127.0.0.1:${8181 + index}/`,
  })),
);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_FILES = new Set([
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "tsconfig.json",
  "vercel.json",
]);
const SOURCE_DIRS = new Set(["src", "public", "scripts", "server", "migrations", "config"]);

export function isPrivatePlaytestPath(name) {
  const parts = name.split("/");
  return parts.some(
    (part) =>
      part.startsWith(".env") ||
      [".grok", ".aws", ".codex", ".git"].includes(part) ||
      (parts[0] === "config" && /(?:^|[.-])local(?:[.-]|$)/i.test(part)) ||
      /\.(?:pem|key|p12|pfx)$/i.test(part),
  );
}

export function parsePlaytestArgs(argv) {
  const options = { buildOnly: false, skipBuild: false, sessions: PLAYTEST_SESSIONS };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--build-only") options.buildOnly = true;
    else if (arg === "--skip-build") options.skipBuild = true;
    else if (arg === "--session") {
      const id = argv[++index];
      const selected = PLAYTEST_SESSIONS.find((session) => session.id === id);
      if (!selected) throw new Error("--session must be PT01, PT02, PT03, PT04 or PT05");
      options.sessions = [selected];
    } else throw new Error(`Unknown playtest option: ${arg}`);
  }
  if (options.buildOnly && options.skipBuild)
    throw new Error("--build-only and --skip-build cannot be combined");
  return options;
}

/** Explicit allowlist: never inherit Node preload flags, credentials or app flags. */
export function playtestEnvironment(parent, buildId) {
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "WINDIR",
  ])
    if (typeof parent[key] === "string") env[key] = parent[key];
  return {
    ...env,
    NODE_ENV: "production",
    VITE_AUTH_ENABLED: "true",
    GAME_PLAYTEST_BUILD_ID: buildId,
  };
}

/** Only app inputs visible to Git; excluded names are never read or copied. */
export function isPlaytestSourcePath(name) {
  const parts = name.split("/");
  if (!name || name.includes("\\") || parts.some((part) => !part || part === "." || part === ".."))
    return false;
  if (
    isPrivatePlaytestPath(name) ||
    parts.some(
      (part) => part.startsWith(".") || ["node_modules", "artifacts", "dist"].includes(part),
    )
  )
    return false;
  return parts.length === 1 ? ROOT_FILES.has(name) : SOURCE_DIRS.has(parts[0]);
}

export async function sourceSnapshot(root) {
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const commit = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  const files = [
    ...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0")),
  ]
    .filter(isPlaytestSourcePath)
    .sort();
  const hash = createHash("sha256");
  const inputs = [];
  const canonicalRoot = await realpath(root);
  for (const name of files) {
    const path = join(root, name);
    const info = await lstat(path).catch((error) => {
      if (error.code === "ENOENT") return null; // A tracked deletion is a valid input change.
      throw error;
    });
    if (!info) continue;
    if (!info.isFile()) throw new Error(`Playtest source must be a regular file: ${name}`);
    const canonicalPath = await realpath(path);
    if (canonicalPath !== join(canonicalRoot, name))
      throw new Error(`Playtest source cannot use a symlinked directory: ${name}`);
    const bytes = await readFile(canonicalPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    hash.update(`${name}\0${digest}\0`);
    inputs.push({ path: name, sha256: digest });
  }
  const dirty = status.trim().length > 0;
  return {
    commit,
    dirty,
    buildId: `${commit.slice(0, 12)}${dirty ? " + local changes" : ""}`,
    fingerprint: hash.digest("hex"),
    inputs,
  };
}

export async function assertOwnedPlaytestApp(root) {
  for (const relative of ["artifacts", "artifacts/playtest-app", "artifacts/playtest-app/source"]) {
    const info = await lstat(join(root, relative)).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info?.isSymbolicLink())
      throw new Error("Playtest staging cannot replace a symlinked directory");
  }
}

/** Nitro preview loads dotenv itself, so validate reused artifacts before importing it. */
export async function assertCredentialFreeStage(staged) {
  const inspect = async (folder, prefix = "") => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (isPrivatePlaytestPath(relative))
        throw new Error(
          `Private configuration found in playtest artifacts: ${relative}. Rebuild the snapshot.`,
        );
      // Installed dependency package links and their private Nitro/Vite caches
      // are separate from app configuration and are not dotenv search roots.
      if (entry.name === "node_modules") continue;
      if (entry.isSymbolicLink())
        throw new Error(
          `Unexpected symlink in playtest artifacts: ${relative}. Rebuild the snapshot.`,
        );
      if (entry.isDirectory()) await inspect(join(folder, entry.name), relative);
    }
  };
  await inspect(staged);
}

export async function stagePlaytestSource(root, destination, snapshot) {
  if (resolve(destination) !== resolve(root, "artifacts/playtest-app/source"))
    throw new Error(
      "Playtest staging can replace only its owned artifacts/playtest-app/source directory",
    );
  await assertOwnedPlaytestApp(root);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const canonicalRoot = await realpath(root);
  for (const input of snapshot.inputs) {
    if (!isPlaytestSourcePath(input.path)) throw new Error("Unsafe playtest source path");
    const source = join(root, input.path);
    if (!(await lstat(source)).isFile()) throw new Error(`Source changed: ${input.path}`);
    const canonicalPath = await realpath(source);
    if (canonicalPath !== join(canonicalRoot, input.path))
      throw new Error(`Playtest source cannot use a symlinked directory: ${input.path}`);
    const bytes = await readFile(canonicalPath);
    if (createHash("sha256").update(bytes).digest("hex") !== input.sha256)
      throw new Error(`Source changed while preparing playtest: ${input.path}. Run again.`);
    const target = join(destination, input.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  // Keep Nitro's last-build pointer and Vite caches private to this staged app.
  // Linking the whole node_modules directory would overwrite the normal build pointer.
  const modules = join(destination, "node_modules");
  await mkdir(modules, { recursive: true });
  for (const entry of await readdir(join(root, "node_modules"))) {
    if (entry.startsWith(".")) continue;
    await symlink(join(root, "node_modules", entry), join(modules, entry), "junction");
  }
}

export async function assertPortAvailable(port, makeServer = createServer) {
  const server = makeServer();
  await new Promise((accept, reject) => {
    server.once("error", (error) => {
      const reason =
        error.code === "EADDRINUSE"
          ? `Port ${port} is already in use.`
          : `Cannot check playtest port ${port}: ${error.code || error.message}.`;
      reject(Object.assign(new Error(`${reason} No process was stopped.`), { code: error.code }));
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, accept);
  });
  await new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
}

export async function initializeSessionRecords(directory) {
  for (const session of PLAYTEST_SESSIONS) {
    const folder = join(directory, session.id);
    await mkdir(folder, { recursive: true });
    const record = {
      session: session.id,
      status: "not run",
      url: session.url,
      exactBuild: null,
      dateAndTimezone: null,
      deviceAndBrowser: null,
      inputAndAccessibilitySettings: null,
      dialogueMode: "local-only (planned)",
      startingGameDayAndTime: null,
      firstActionWithoutHelp: null,
      chosenContributionOrRefusal: null,
      timeToDecisionAndResult: null,
      hesitationAndAssistance: null,
      explanationOfConsequence: null,
      fundingAndPaymentUnderstanding: null,
      usefulnessAndOwnershipUnderstanding: null,
      northernAndVenueUnderstanding: null,
      readingAndOptionalSpendingReaction: null,
      backupVerified: null,
      recognitionAfterReopening: null,
      voluntaryFurtherVisit: null,
      participantWords: null,
      defects: null,
    };
    try {
      await writeFile(join(folder, "record.json"), `${JSON.stringify(record, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

export function assertReusableBuild(receipt, snapshot) {
  if (
    receipt.source?.commit !== snapshot.commit ||
    receipt.source?.fingerprint !== snapshot.fingerprint ||
    receipt.source?.dirty !== snapshot.dirty ||
    receipt.credentialFree !== true ||
    receipt.authEnabled !== true
  )
    throw new Error(
      "The saved playtest build does not match this source. Run without --skip-build.",
    );
}

async function main(argv) {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error("Use Node 24 for playtests.");
  const options = parsePlaytestArgs(argv);
  const app = join(ROOT, "artifacts/playtest-app");
  const staged = join(app, "source");
  const receiptFile = join(app, "build.json");
  const children = new Set();
  let stopping = false;
  const stop = (signal = "SIGTERM") => {
    stopping = true;
    for (const child of children) child.kill(signal);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => stop(signal));
  const runWorker = (action, env, extra = []) => {
    const child = spawn(
      process.execPath,
      [join(ROOT, "scripts/playtest-worker.mjs"), action, ...extra],
      {
        cwd: staged,
        env,
        stdio: "inherit",
      },
    );
    children.add(child);
    return new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        children.delete(child);
        if (stopping || code === 0) accept();
        else reject(new Error(`Playtest ${action} exited (${signal || code}).`));
      });
    });
  };
  try {
    // Check before deleting a receipt or creating anything under the app path.
    await assertOwnedPlaytestApp(ROOT);
    // Rebuilding cannot change files underneath any running playtest session.
    for (const session of options.skipBuild ? options.sessions : PLAYTEST_SESSIONS)
      await assertPortAvailable(session.port);
    const snapshot = await sourceSnapshot(ROOT);
    const env = playtestEnvironment(process.env, snapshot.buildId);
    await initializeSessionRecords(join(ROOT, "artifacts/playtest-human"));
    if (options.skipBuild) {
      const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
      assertReusableBuild(receipt, snapshot);
      await assertCredentialFreeStage(staged);
      await readFile(join(staged, ".vercel/output/nitro.json"));
    } else {
      await mkdir(app, { recursive: true });
      await rm(receiptFile, { force: true });
      await stagePlaytestSource(ROOT, staged, snapshot);
      await runWorker("build", env);
      if (stopping) return;
      await assertCredentialFreeStage(staged);
      await writeFile(
        receiptFile,
        `${JSON.stringify(
          {
            source: snapshot,
            builtAt: new Date().toISOString(),
            node: process.version,
            credentialFree: true,
            authEnabled: true,
            stagedSource: staged,
            output: join(staged, ".vercel/output"),
            sessions: PLAYTEST_SESSIONS,
          },
          null,
          2,
        )}\n`,
      );
    }
    console.log(`[playtest] Build ${snapshot.buildId}; source SHA-256 ${snapshot.fingerprint}`);
    console.log(`[playtest] Receipt: ${receiptFile}`);
    if (options.buildOnly) return;
    console.log(
      "[playtest] Open each participant's assigned URL in their own browser. Keep that origin for reopening.",
    );
    for (const session of options.sessions) console.log(`[playtest] ${session.id}: ${session.url}`);
    console.log(
      "[playtest] Select Use local dialogue only. Ctrl-C stops only these preview children.",
    );
    await Promise.all(
      options.sessions.map((session) => runWorker("preview", env, [String(session.port)])),
    );
  } finally {
    stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[playtest] ${error.message}`);
    process.exitCode = 1;
  });
