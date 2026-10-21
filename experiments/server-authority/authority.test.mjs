import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LocalAuthority, delegateIntent, moveIntent, reclaimIntent } from "./authority.mjs";
import { prepareSimulatedMove, startSimulatedClock } from "./simulated-worker.mjs";

const ALPHA = "character:alpha";
const BETA = "character:beta";
const human = (name = "alpha", session = name) => ({
  kind: "human",
  accountId: `account:${name}`,
  sessionId: `session:${session}`,
});
const worker = { kind: "worker", workerId: "worker:one" };

function setup(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "game-authority-"));
  let authority = LocalAuthority.open(directory, options);
  t.after(() => {
    authority.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    get authority() {
      return authority;
    },
    restart() {
      authority.close();
      authority = LocalAuthority.open(directory);
      return authority;
    },
  };
}

function delegate(authority, characterId = ALPHA, owner = human(), actionId = "delegate:alpha") {
  const result = authority.submit(
    owner,
    delegateIntent(authority.snapshot(), characterId, actionId, worker.workerId),
  );
  assert.equal(result.ok, true);
  return result;
}

test("two connected views receive the same durable revision; view mutation cannot write state", (t) => {
  const { authority } = setup(t);
  const first = authority.connectView();
  const second = authority.connectView();
  const intent = moveIntent(first.read(), ALPHA, "move:one");
  assert.equal(authority.submit(human(), intent).ok, true);
  assert.deepEqual(first.read(), second.read());
  assert.equal(second.read().actors[ALPHA].position.x, 2);
  const clientCopy = first.read();
  clientCopy.actors[ALPHA].position.x = 999;
  assert.equal(authority.snapshot().actors[ALPHA].position.x, 2);
});

test("stale concurrent intent and duplicate delivery cannot repeat an effect", async (t) => {
  const { authority } = setup(t);
  const observed = authority.snapshot();
  const first = moveIntent(observed, ALPHA, "move:one");
  const stale = moveIntent(observed, ALPHA, "move:two");
  const results = await Promise.all([
    Promise.resolve().then(() => authority.submit(human(), first)),
    Promise.resolve().then(() => authority.submit(human(), stale)),
    Promise.resolve().then(() => authority.submit(human(), first)),
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].code, "STALE_WORLD");
  assert.equal(results[2].code, "DUPLICATE_ACTION");
  assert.deepEqual(results[2].receipt, results[0].receipt);
  assert.equal(authority.snapshot().actors[ALPHA].moveCount, 1);
  assert.equal(authority.snapshot().revision, 1);
});

test("an action ID cannot be reused with different terms or expose another owner's receipt", (t) => {
  const { authority } = setup(t);
  const intent = moveIntent(authority.snapshot(), ALPHA, "move:one");
  assert.equal(authority.submit(human(), intent).ok, true);
  assert.equal(authority.submit(human(), { ...intent, dx: -1 }).code, "ACTION_ID_CONFLICT");
  assert.deepEqual(authority.submit(human("beta"), intent), { ok: false, code: "FORBIDDEN" });
  assert.equal(authority.snapshot().actors[ALPHA].moveCount, 1);
});

test("clean restart replays committed state, controller identity and receipts once", (t) => {
  const run = setup(t);
  const intent = moveIntent(run.authority.snapshot(), ALPHA, "move:one");
  assert.equal(run.authority.submit(human(), intent).ok, true);
  delegate(run.authority);
  assert.equal(run.authority.tick().ok, true);
  const committed = run.authority.snapshot();
  const restarted = run.restart();
  assert.deepEqual(restarted.snapshot(), committed);
  assert.equal(restarted.submit(human(), intent).code, "DUPLICATE_ACTION");
  assert.deepEqual(restarted.snapshot(), committed);
});

test("lost response after durable commit fences the writer; restart finds the effect once", (t) => {
  const run = setup(t, {
    afterPersist: () => {
      throw new Error("simulated response/process loss");
    },
  });
  const intent = moveIntent(run.authority.snapshot(), ALPHA, "move:uncertain");
  const oldView = run.authority.connectView();
  assert.equal(run.authority.submit(human(), intent).code, "STORAGE_UNCERTAIN");
  assert.equal(run.authority.submit(human(), intent).code, "STORAGE_UNCERTAIN");
  assert.throws(() => oldView.read(), /unavailable/);
  assert.throws(() => run.authority.snapshot(), /unavailable/);
  const restarted = run.restart();
  assert.equal(restarted.snapshot().actors[ALPHA].moveCount, 1);
  assert.equal(restarted.submit(human(), intent).code, "DUPLICATE_ACTION");
  assert.equal(restarted.snapshot().actors[ALPHA].moveCount, 1);
});

test("abrupt process exit retains the commit and lock; verified operator recovery does not repeat it", (t) => {
  const run = setup(t);
  const intent = moveIntent(run.authority.snapshot(), ALPHA, "move:crash");
  run.authority.close();
  const moduleUrl = new URL("./authority.mjs", import.meta.url).href;
  const script = `
    import { LocalAuthority } from ${JSON.stringify(moduleUrl)};
    const authority = LocalAuthority.open(process.argv[1], {
      afterPersist() { process.exit(86); }
    });
    authority.submit(${JSON.stringify(human())}, ${JSON.stringify(intent)});
    process.exit(87);
  `;
  const crashed = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script, run.directory],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(crashed.status, 86, crashed.stderr);
  assert.throws(() => LocalAuthority.open(run.directory), { code: "EEXIST" });
  // This test has joined the exact child, so knows it is gone. Production recovery
  // needs an operator/supervisor to prove the writer stopped before removing its lock.
  unlinkSync(join(run.directory, "writer.lock"));
  const recovered = run.restart();
  assert.equal(recovered.snapshot().actors[ALPHA].moveCount, 1);
  assert.equal(recovered.submit(human(), intent).code, "DUPLICATE_ACTION");
});

test("both clients disconnect while the independent clock and two simulated delegates continue", async (t) => {
  const { authority } = setup(t);
  const first = authority.connectView();
  const second = authority.connectView();
  delegate(authority);
  delegate(authority, BETA, human("beta"), "delegate:beta");
  first.disconnect();
  second.disconnect();
  assert.equal(authority.clientCount, 0);
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      stop();
      reject(new Error("Clock failed to progress"));
    }, 1000);
    const stop = startSimulatedClock(authority, {
      intervalMs: 5,
      onTick(result) {
        try {
          assert.equal(result.ok, true);
          const tick = authority.snapshot().clock.tick;
          for (const actor of [ALPHA, BETA]) {
            const pending = prepareSimulatedMove(
              authority,
              actor,
              worker.workerId,
              `auto:${actor}:${tick}`,
            );
            assert.equal(pending.complete().ok, true);
          }
          if (tick === 2) {
            stop();
            clearTimeout(deadline);
            resolve();
          }
        } catch (error) {
          stop();
          clearTimeout(deadline);
          reject(error);
        }
      },
    });
  });
  const reconnectedA = authority.connectView().read();
  const reconnectedB = authority.connectView().read();
  assert.deepEqual(reconnectedA, reconnectedB);
  assert.equal(reconnectedA.clock.tick, 2);
  assert.equal(reconnectedA.actors[ALPHA].moveCount, 2);
  assert.equal(reconnectedA.actors[BETA].moveCount, 2);
});

test("human reclaim commits before slow AI completes and rejects its stale proposal", (t) => {
  const { authority } = setup(t);
  delegate(authority);
  const pending = prepareSimulatedMove(authority, ALPHA, worker.workerId, "ai:slow");
  const oldObservation = authority.snapshot();
  assert.equal(authority.tick().ok, true); // World revision moved during inference.
  const reclaim = authority.submit(
    human("alpha", "return"),
    reclaimIntent(oldObservation, ALPHA, "reclaim:return"),
  );
  assert.equal(reclaim.ok, true);
  assert.equal(authority.snapshot().actors[ALPHA].controller.mode, "human");
  assert.equal(pending.complete().ok, false);
  // Even an AI worker with fresh world/controller revision has lost its authority.
  assert.equal(
    authority.submit(worker, moveIntent(authority.snapshot(), ALPHA, "ai:forged-fresh")).code,
    "FORBIDDEN",
  );
  assert.equal(
    authority.submit(
      human("alpha", "return"),
      moveIntent(authority.snapshot(), ALPHA, "human:returned"),
    ).ok,
    true,
  );
  assert.equal(authority.snapshot().actors[ALPHA].moveCount, 1);
});

test("a stale human tab cannot act or reclaim after another tab takes control", (t) => {
  const { authority } = setup(t);
  const before = authority.snapshot();
  assert.equal(
    authority.submit(human("alpha", "new-tab"), reclaimIntent(before, ALPHA, "reclaim:new-tab")).ok,
    true,
  );
  assert.equal(
    authority.submit(human(), moveIntent(before, ALPHA, "old:move")).code,
    "STALE_CONTROLLER",
  );
  assert.equal(
    authority.submit(human(), reclaimIntent(before, ALPHA, "old:reclaim")).code,
    "STALE_CONTROLLER",
  );
  assert.equal(
    authority.submit(human(), moveIntent(authority.snapshot(), ALPHA, "old:fresh")).code,
    "NOT_ACTIVE_CONTROLLER",
  );
});

test("worker lease, policy revision and permitted capabilities are checked at commit", (t) => {
  const { authority } = setup(t);
  delegate(authority);
  const intent = moveIntent(authority.snapshot(), ALPHA, "ai:move");
  assert.equal(
    authority.submit({ kind: "worker", workerId: "worker:two" }, intent).code,
    "FORBIDDEN",
  );
  assert.equal(
    authority.submit(worker, { ...intent, leaseId: "lease:forged" }).code,
    "INVALID_LEASE",
  );
  assert.equal(authority.submit(worker, { ...intent, policyRevision: 0 }).code, "STALE_POLICY");
  assert.equal(authority.submit(worker, { ...intent, kind: "spend" }).code, "CAPABILITY_DENIED");
  assert.equal(authority.submit(worker, { ...intent, dx: 100 }).code, "INVALID_MOVE");
  assert.equal(authority.submit(worker, intent).ok, true);
  assert.equal(authority.submit(worker, intent).code, "DUPLICATE_ACTION");
  assert.equal(authority.snapshot().actors[ALPHA].moveCount, 1);
});

test("lease expiry parks the avatar; restart does not revive stale worker authority", (t) => {
  const run = setup(t);
  delegate(run.authority);
  const pending = prepareSimulatedMove(run.authority, ALPHA, worker.workerId, "ai:expired");
  for (let i = 0; i < 3; i += 1) assert.equal(run.authority.tick().ok, true);
  assert.equal(run.authority.snapshot().actors[ALPHA].controller.mode, "parked");
  assert.equal(pending.complete().ok, false);
  const restarted = run.restart();
  assert.equal(restarted.snapshot().actors[ALPHA].controller.mode, "parked");
  assert.equal(restarted.submit(worker, pending.request).code, "FORBIDDEN");
});

test("clock actions require the trusted scheduler and a contiguous idempotent tick", (t) => {
  const { authority } = setup(t);
  const request = { kind: "tick", worldId: "world:spike", actionId: "tick:1", tick: 1 };
  assert.equal(authority.submit(human(), request).code, "FORBIDDEN");
  assert.equal(authority.submit({ kind: "clock", clockId: "clock:single" }, request).ok, true);
  assert.equal(
    authority.submit({ kind: "clock", clockId: "clock:single" }, request).code,
    "DUPLICATE_ACTION",
  );
  assert.equal(
    authority.submit(
      { kind: "clock", clockId: "clock:single" },
      { ...request, actionId: "tick:skip", tick: 3 },
    ).code,
    "STALE_TICK",
  );
  assert.equal(authority.snapshot().clock.tick, 1);
});

test("malformed/unknown requests fail without changing the durable state", (t) => {
  const { authority } = setup(t);
  const before = authority.snapshot();
  const request = moveIntent(before, ALPHA, "move:invalid");
  for (const invalid of [
    { ...request, dx: NaN },
    { ...request, extraCapability: "wallet:sign" },
    { ...request, worldId: "world:copied" },
    { ...request, characterId: "__proto__" },
    { ...request, actionId: "constructor" },
  ])
    assert.equal(authority.submit(human(), invalid).ok, false);
  assert.deepEqual(authority.snapshot(), before);
});

test("a second writer is denied until the existing writer closes", (t) => {
  const run = setup(t);
  assert.throws(() => LocalAuthority.open(run.directory), { code: "EEXIST" });
  run.authority.close();
  const next = LocalAuthority.open(run.directory);
  next.close();
});

test("corrupt/truncated journals stop recovery without replacing original bytes", (t) => {
  const run = setup(t);
  assert.equal(run.authority.tick().ok, true);
  run.authority.close();
  const path = join(run.directory, "journal.json");
  const valid = readFileSync(path, "utf8");
  const changed = JSON.parse(valid);
  changed.records[0].event.tick = 2;
  const corruptions = [JSON.stringify(changed), valid.slice(0, -10)];
  for (const bad of corruptions) {
    writeFileSync(path, bad);
    assert.throws(() => LocalAuthority.open(run.directory));
    assert.equal(readFileSync(path, "utf8"), bad);
  }
});

test("a duplicate journal record or broken chain is rejected during replay", (t) => {
  const run = setup(t);
  assert.equal(run.authority.tick().ok, true);
  run.authority.close();
  const path = join(run.directory, "journal.json");
  const journal = JSON.parse(readFileSync(path, "utf8"));
  journal.records.push(structuredClone(journal.records[0]));
  writeFileSync(path, JSON.stringify(journal));
  assert.throws(() => LocalAuthority.open(run.directory), /chain|record/);
});
