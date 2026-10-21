import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  PLAYTEST_SESSIONS,
  assertCredentialFreeStage,
  assertOwnedPlaytestApp,
  assertPortAvailable,
  assertReusableBuild,
  initializeSessionRecords,
  isPlaytestSourcePath,
  parsePlaytestArgs,
  playtestEnvironment,
  sourceSnapshot,
  stagePlaytestSource,
} from "./playtest.mjs";

test("playtest sessions have five stable separate loopback origins and explicit selection", () => {
  assert.equal(new Set(PLAYTEST_SESSIONS.map((session) => new URL(session.url).origin)).size, 5);
  assert.deepEqual(
    PLAYTEST_SESSIONS.map((session) => session.port),
    [8181, 8182, 8183, 8184, 8185],
  );
  assert.ok(PLAYTEST_SESSIONS.every((session) => new URL(session.url).hostname === "127.0.0.1"));
  assert.equal(parsePlaytestArgs([]).sessions.length, 5);
  assert.equal(parsePlaytestArgs(["--skip-build", "--session", "PT03"]).sessions[0].port, 8183);
  assert.throws(() => parsePlaytestArgs(["--session", "../../personal"]), /--session/);
  assert.throws(() => parsePlaytestArgs(["--host", "0.0.0.0"]), /Unknown/);
  assert.throws(() => parsePlaytestArgs(["--build-only", "--skip-build"]), /cannot/);
});

test("playtest child environment drops credentials, app overrides and Node preload hooks", () => {
  const parent = {
    PATH: "/node/bin",
    HOME: "/home/tester",
    TMPDIR: "/tmp/tester",
    DATABASE_URL: "private-database",
    XAI_API_KEY: "private-key",
    MIND_PROVIDER_MODE: "pool",
    OPENROUTER_API_KEY: "private-provider",
    AGENT_WALLET_SECRET: "private-wallet",
    GROK_GATE_ORIGIN: "https://private.example",
    VITE_AUTH_ENABLED: "false",
    VITE_PRIVATE_FLAG: "private-client-setting",
    NODE_OPTIONS: "--require /private/preload.cjs",
  };
  const clean = playtestEnvironment(parent, "abc123 + local changes");
  assert.deepEqual(clean, {
    PATH: parent.PATH,
    HOME: parent.HOME,
    TMPDIR: parent.TMPDIR,
    NODE_ENV: "production",
    VITE_AUTH_ENABLED: "true",
    GAME_PLAYTEST_BUILD_ID: "abc123 + local changes",
  });
  assert.equal(parent.VITE_AUTH_ENABLED, "false", "Parent settings are preserved");
});

test("playtest staging excludes environment, ignored/private inputs and path escapes", () => {
  for (const name of [
    ".env",
    ".env.production",
    ".grok/app-env.json",
    "src/.env.local",
    "config/mind-pool.local.json",
    "config/wallet.pem",
    "artifacts/playtest-human/PT01/save.json",
    "../src/town.ts",
    "/src/town.ts",
    "src/../private.json",
    "src\\private.json",
    "node_modules/nitro/index.js",
    "docs/private-session.md",
  ])
    assert.equal(isPlaytestSourcePath(name), false, name);
  for (const name of [
    "vite.config.ts",
    "package-lock.json",
    "src/game/town.ts",
    "src/game/local-dialogue.ts",
    "src/game/local-replies.ts",
    "scripts/local-browser.mjs",
    "public/game/head.png",
  ])
    assert.equal(isPlaytestSourcePath(name), true, name);
});

test("source snapshot hashes working app bytes and staging owns Nitro cache separately", async () => {
  const folder = await mkdtemp(join(tmpdir(), "game-playtest-source-"));
  const root = join(folder, "repo");
  const stage = join(root, "artifacts/playtest-app/source");
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules/vite"), { recursive: true });
    await mkdir(join(root, "node_modules/.nitro"), { recursive: true });
    await writeFile(join(root, "node_modules/.nitro/last-build.json"), "personal-normal-build");
    await writeFile(join(root, ".gitignore"), "node_modules\n.env*\n");
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(root, "src/app.ts"), "original");
    const git = (args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git(["init", "--quiet"]);
    git(["add", "."]);
    git([
      "-c",
      "user.name=Playtest test",
      "-c",
      "user.email=playtest@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ]);
    const original = await sourceSnapshot(root);
    assert.equal(original.dirty, false);
    await writeFile(join(root, "src/app.ts"), "reviewed change");
    await writeFile(join(root, ".env.production"), "XAI_API_KEY=must-not-copy");
    const changed = await sourceSnapshot(root);
    assert.equal(changed.dirty, true);
    assert.match(changed.buildId, / \+ local changes$/);
    assert.notEqual(changed.fingerprint, original.fingerprint);
    assert.ok(changed.inputs.every((input) => !input.path.includes(".env")));
    await stagePlaytestSource(root, stage, changed);
    await assert.rejects(stagePlaytestSource(root, folder, changed), /only its owned/);
    assert.equal(await readFile(join(stage, "src/app.ts"), "utf8"), "reviewed change");
    await assert.rejects(readFile(join(stage, ".env.production")), { code: "ENOENT" });
    await mkdir(join(stage, "node_modules/.nitro"));
    await writeFile(join(stage, "node_modules/.nitro/last-build.json"), "playtest-build");
    assert.equal(
      await readFile(join(root, "node_modules/.nitro/last-build.json"), "utf8"),
      "personal-normal-build",
    );
    await writeFile(join(root, "src/app.ts"), "changed again");
    await assert.rejects(stagePlaytestSource(root, stage, changed), /Source changed/);
    await rm(join(root, "src/app.ts"));
    await symlink(join(root, ".env.production"), join(root, "src/app.ts"));
    await assert.rejects(sourceSnapshot(root), /regular file/);
    await rm(join(root, "src"), { recursive: true });
    await mkdir(join(folder, "outside"));
    await writeFile(join(folder, "outside/app.ts"), "outside-private-input");
    await symlink(join(folder, "outside"), join(root, "src"));
    await assert.rejects(sourceSnapshot(root), /symlinked directory/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("session initialization never overwrites observations or fabricates outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-playtest-records-"));
  try {
    await initializeSessionRecords(directory);
    for (const session of PLAYTEST_SESSIONS) {
      const record = JSON.parse(await readFile(join(directory, session.id, "record.json"), "utf8"));
      assert.equal(record.status, "not run");
      assert.equal(record.exactBuild, null);
      assert.equal(record.explanationOfConsequence, null);
      assert.equal(record.recognitionAfterReopening, null);
      assert.equal(record.voluntaryFurtherVisit, null);
      assert.equal(record.url, session.url);
    }
    const privateObservation = '{"status":"in progress","participantWords":"actual observation"}\n';
    await writeFile(join(directory, "PT01/record.json"), privateObservation);
    await initializeSessionRecords(directory);
    assert.equal(await readFile(join(directory, "PT01/record.json"), "utf8"), privateObservation);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("artifact app guard rejects linked ancestors before any existing receipt is removed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-playtest-owned-"));
  const root = join(directory, "repo");
  const outside = join(directory, "outside");
  try {
    await mkdir(join(root, "artifacts"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, "build.json"), "keep this unrelated receipt");
    await symlink(outside, join(root, "artifacts/playtest-app"));
    await assert.rejects(assertOwnedPlaytestApp(root), /symlinked directory/);
    assert.equal(
      await readFile(join(outside, "build.json"), "utf8"),
      "keep this unrelated receipt",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reused preview artifacts reject injected dotenv and private config without reading them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-playtest-private-"));
  try {
    await mkdir(join(directory, "src/game"), { recursive: true });
    await mkdir(join(directory, ".vercel/output"), { recursive: true });
    await mkdir(join(directory, "node_modules"));
    await writeFile(join(directory, "src/game/local-dialogue.ts"), "legitimate local dialogue");
    await writeFile(join(directory, ".vercel/output/nitro.json"), "{}");
    await assert.doesNotReject(assertCredentialFreeStage(directory));
    for (const name of [
      ".env",
      ".env.production",
      "config/mind-pool.local.json",
      ".grok/app-env.json",
      "config/wallet.pem",
    ]) {
      const path = join(directory, name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "private fixture must never be loaded");
      await assert.rejects(assertCredentialFreeStage(directory), /Private configuration.*Rebuild/);
      await rm(path);
      if (name.startsWith(".grok/")) await rm(join(directory, ".grok"), { recursive: true });
    }
    await assert.doesNotReject(assertCredentialFreeStage(directory));
    await symlink(join(directory, "src"), join(directory, "linked-source"));
    await assert.rejects(assertCredentialFreeStage(directory), /Unexpected symlink/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("port collision fails without closing or signalling its existing owner", async () => {
  const server = createServer((socket) => socket.end("still running"));
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  const { port } = server.address();
  try {
    await assert.rejects(assertPortAvailable(port), /already in use.*No process was stopped/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((accept) => server.close(accept));
  }
  await assertPortAvailable(port);
});

test("port permission errors retain EPERM instead of claiming an occupied port", async () => {
  const server = new EventEmitter();
  server.listen = () => process.nextTick(() => server.emit("error", { code: "EPERM" }));
  await assert.rejects(
    assertPortAvailable(8181, () => server),
    (error) => {
      assert.equal(error.code, "EPERM");
      assert.match(error.message, /Cannot check playtest port 8181: EPERM/);
      assert.match(error.message, /No process was stopped/);
      assert.doesNotMatch(error.message, /already in use/);
      return true;
    },
  );
});

test("skip-build refuses changed source or an unverified build environment", () => {
  const snapshot = { commit: "abc", dirty: true, fingerprint: "exact-working-inputs" };
  const receipt = { source: snapshot, credentialFree: true, authEnabled: true };
  assert.doesNotThrow(() => assertReusableBuild(receipt, snapshot));
  for (const changed of [
    { ...snapshot, commit: "def" },
    { ...snapshot, dirty: false },
    { ...snapshot, fingerprint: "other-inputs" },
  ])
    assert.throws(() => assertReusableBuild(receipt, changed), /does not match/);
  assert.throws(
    () => assertReusableBuild({ ...receipt, authEnabled: false }, snapshot),
    /does not match/,
  );
  assert.throws(
    () => assertReusableBuild({ ...receipt, credentialFree: false }, snapshot),
    /does not match/,
  );
});
