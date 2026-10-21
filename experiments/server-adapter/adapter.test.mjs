import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { performance } from "node:perf_hooks";

// Fail closed on provider/network attempts for the entire engine-loading/test lifecycle.
const networkAttempts = [];
const originalFetch = globalThis.fetch;
const originalConnect = net.Socket.prototype.connect;
const originalListen = net.Server.prototype.listen;
const block = (kind) =>
  function () {
    networkAttempts.push(kind);
    throw new Error(`Forbidden network attempt: ${kind}`);
  };
globalThis.fetch = block("fetch");
net.Socket.prototype.connect = block("socket.connect");
net.Server.prototype.listen = block("server.listen");
const { loadEngine, ENGINE_SOURCE } = await import("./engine.mjs");
const {
  EngineAuthority,
  OWNER,
  CLOCK,
  NPC_WORKER,
  AVATAR_WORKER,
  playerIntent,
  tickIntent,
  completionIntent,
} = await import("./authority.mjs");
const { digest, jsonCopy } = await import("./store.mjs");
const engine = await loadEngine();
after(async () => {
  await engine.close();
  globalThis.fetch = originalFetch;
  net.Socket.prototype.connect = originalConnect;
  net.Server.prototype.listen = originalListen;
  assert.deepEqual(
    networkAttempts,
    [],
    "No fetch, outgoing TCP connection or server listener may be attempted",
  );
});

const person = (town, id) => town.agents.find((agent) => agent.id === id);
const cash = (town) =>
  town.agents.reduce((sum, agent) => sum + agent.money, 0) +
  town.tills.cafe +
  town.tills.grocery +
  Object.values(town.economy?.projectBalances ?? {}).reduce((sum, value) => sum + value, 0);
const ownerBack = { ...OWNER, sessionId: "session:return" };
function rawFixture(change = () => {}) {
  const town = engine.town.createTown("Adapter Ada");
  change(town);
  return JSON.stringify({ version: 2, town });
}
function setup(t, { raw = rawFixture(), fault } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "game-engine-adapter-"));
  let authority = new EngineAuthority(directory, engine, { raw, fault });
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
      authority = new EngineAuthority(directory, engine);
      return authority;
    },
  };
}
function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function currentQuote(authority, target, prefix, requestId = "choice:one") {
  const state = authority.snapshot();
  const quote = engine.effects
    .playerActions(state.town, target)
    .find((action) => action.label.startsWith(prefix));
  assert.ok(quote, `Missing choice ${prefix}`);
  assert.equal(quote.disabledReason, undefined, quote.disabledReason);
  return playerIntent(state, "quote", requestId, { target, quoteId: quote.id });
}
function delegate(authority) {
  return success(
    authority.submit(
      OWNER,
      playerIntent(authority.snapshot(), "delegate", "delegate:one", {
        workerId: AVATAR_WORKER.workerId,
        durationMs: 10_000,
      }),
    ),
  );
}
function queueAvatar(authority, id = "avatar:one") {
  const state = authority.snapshot();
  const request = playerIntent(state, "queue-avatar", id, { leaseId: state.controller.lease.id });
  return success(authority.submit(AVATAR_WORKER, request)).jobId;
}
function legalMove(town) {
  const player = person(town, "player");
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const x = player.tile.x + dx;
    const y = player.tile.y + dy;
    if (
      engine.world.walkable(x, y) &&
      !town.agents.some(
        (agent) => agent.id !== "player" && agent.tile.x === x && agent.tile.y === y,
      )
    )
      return { kind: "move", dx, dy };
  }
  throw new Error("Fixture has no legal movement");
}
function planningFixture() {
  return rawFixture((town) => {
    town.minute = 300;
    for (const agent of town.agents) if (agent.id !== "player") agent.plan.day = 0;
  });
}

test("real engine loads from the pinned source without application config, environment files or a listener", () => {
  assert.equal(ENGINE_SOURCE, "0bd3e3b1401ebf6b460d9d71f287c4b474b2452b");
  assert.deepEqual(engine.loader, { envDir: false, hasHttpServer: false });
  assert.deepEqual(engine.types.AGENT_IDS, [
    "kevin",
    "arwyn",
    "northern",
    "baba",
    "sub",
    "player",
    "data",
    "amelia",
  ]);
  assert.deepEqual(networkAttempts, []);
});

test("malformed intent discriminators and job IDs fail without throwing or changing committed state", (t) => {
  const { authority } = setup(t);
  const before = authority.snapshot();
  const tick = tickIntent(before);
  assert.equal(
    authority.submit(CLOCK, { ...tick, kind: { toString: "invalid" } }).code,
    "CAPABILITY_DENIED",
  );
  const completion = completionIntent(
    before,
    { toString: "invalid" },
    { kind: "npc", result: null },
    "malformed:job",
  );
  assert.equal(authority.submit(NPC_WORKER, completion).code, "INVALID_REQUEST");
  assert.deepEqual(authority.snapshot(), before);
});

test("raw v1 migration retains original bytes and normalized history through repeated reopen/export", (t) => {
  const raw = readFileSync(
    new URL("../../scripts/fixtures/legacy-six-resident-town.json", import.meta.url),
    "utf8",
  );
  const expected = engine.save.readTownFile(raw);
  assert.equal(expected.status, "ready");
  const run = setup(t, { raw });
  const initial = run.authority.snapshot();
  assert.equal(initial.sourceImport.raw, raw);
  assert.deepEqual(initial.town, jsonCopy(expected.town));
  assert.equal(initial.town.agents.length, 8);
  const original = JSON.parse(raw).town;
  for (const resident of original.agents) {
    const migrated = person(initial.town, resident.id);
    assert.equal(migrated.name, resident.name);
    assert.equal(migrated.money, resident.money);
    for (const memory of resident.memories)
      assert.ok(migrated.memories.some((next) => next.text === memory.text));
  }
  assert.deepEqual(initial.town.favors, expected.town.favors);
  assert.deepEqual(initial.town.notices, expected.town.notices);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = run.restart().snapshot();
    assert.deepEqual(current, initial);
    const portable = engine.save.readTownFile(run.authority.exportPortable());
    assert.equal(portable.status, "ready");
    assert.deepEqual(portable.town.identityRegistry, initial.town.identityRegistry);
    assert.deepEqual(portable.town.economy, initial.town.economy);
    assert.deepEqual(portable.town.favors, initial.town.favors);
  }
});

test("v2 preserves named history, existing debt and full paths/replay internally; portable export keeps its own omissions", (t) => {
  const raw = rawFixture((town) => {
    person(town, "kevin").name = "Kevin Kept";
    person(town, "player").tile = { ...person(town, "baba").tile };
    const bread = engine.effects
      .playerActions(town, "baba")
      .find((item) => item.label.startsWith("Accept bread tab"));
    success(engine.effects.applyPlayerAction(town, "baba", bread.id));
    person(town, "kevin").tile = { ...engine.world.ANCHORS.library };
    town.scrub.push({
      d: town.day,
      m: town.minute,
      ids: [...engine.types.AGENT_IDS],
      p: town.agents.flatMap((agent) => [agent.tile.x, agent.tile.y]),
    });
  });
  const run = setup(t, { raw });
  const expected = engine.save.readTownFile(raw).town;
  assert.deepEqual(run.authority.snapshot().town, jsonCopy(expected));
  success(run.authority.submit(CLOCK, tickIntent(run.authority.snapshot())));
  const before = run.authority.snapshot();
  assert.ok(before.town.scrub.length > 0);
  assert.ok(
    before.town.agents.some((agent) => agent.path.length > 0),
    "real navigation produced a route",
  );
  assert.deepEqual(run.restart().snapshot(), before);
  const portableRaw = run.authority.exportPortable();
  const portable = JSON.parse(portableRaw);
  assert.deepEqual(portable.town.scrub, []);
  assert.ok(portable.town.agents.every((agent) => agent.path.length === 0));
  assert.equal(portable.town.agents.find((agent) => agent.id === "kevin").name, "Kevin Kept");
  assert.deepEqual(portable.town.favors, before.town.favors);
  assert.deepEqual(portable.town.identityRegistry, before.town.identityRegistry);
  assert.equal(portableRaw.includes("server-character:"), false);
  assert.equal(portableRaw.includes(OWNER.accountId), false);
});

test("legacy v2 without identities normalizes once; invalid/corrupt imports retain their exact raw bytes", (t) => {
  const legacy = rawFixture((town) => {
    delete town.identityRegistry;
  });
  const run = setup(t, { raw: legacy });
  const before = run.authority.snapshot();
  assert.deepEqual(run.restart().snapshot(), before);
  const malformed = [
    "{ exact damaged bytes\n",
    rawFixture((town) => {
      town.identityRegistry.characters.player.characterId = "broken";
    }),
  ];
  for (const raw of malformed) {
    const rejected = setup(t, { raw });
    const state = rejected.authority.snapshot();
    assert.equal(state.admission, "rejected");
    assert.equal(state.sourceImport.raw, raw);
    assert.equal(state.town, null);
    assert.deepEqual(state.members, {});
    assert.equal(rejected.authority.submit(CLOCK, tickIntent(state)).code, "IMPORT_REJECTED");
    assert.deepEqual(rejected.restart().snapshot(), state);
  }
});

test("all eight canonical roles persist; only the synthetic owner controls player and imports cannot overwrite", (t) => {
  const run = setup(t);
  const state = run.authority.snapshot();
  assert.equal(Object.keys(state.members).length, 8);
  for (const [role, member] of Object.entries(state.members)) {
    assert.equal(member.ownerAccountId, role === "player" ? OWNER.accountId : null);
    assert.notEqual(member.characterId, member.portable.characterId);
  }
  const reclaim = playerIntent(state, "reclaim", "reclaim:denied");
  assert.equal(
    run.authority.submit({ ...OWNER, accountId: "account:other" }, reclaim).code,
    "FORBIDDEN",
  );
  assert.equal(
    run.authority.submit(OWNER, { ...reclaim, actorId: state.members.kevin.characterId }).code,
    "FORBIDDEN",
  );
  run.authority.close();
  assert.throws(
    () => new EngineAuthority(run.directory, engine, { raw: rawFixture() }),
    /IMPORT_CONFLICT/,
  );
  assert.deepEqual(run.restart().snapshot().members, state.members);
});

test("two real Town views agree; a quoted choice uses separate outer ID and is never applied twice", (t) => {
  const run = setup(t, {
    raw: rawFixture((town) => {
      person(town, "player").tile = { ...person(town, "baba").tile };
    }),
  });
  const first = run.authority.connectView();
  const second = run.authority.connectView();
  const request = currentQuote(run.authority, "baba", "Accept bread tab", "outer:bread");
  assert.notEqual(request.requestId, request.quoteId);
  const result = success(run.authority.submit(OWNER, request));
  assert.equal(result.receipt.quoteId, request.quoteId);
  assert.deepEqual(first.read(), second.read());
  const committed = second.read();
  const edited = first.read();
  person(edited.town, "player").money = 999;
  assert.notEqual(person(run.authority.snapshot().town, "player").money, 999);
  assert.equal(run.authority.submit(OWNER, request).code, "DUPLICATE_REQUEST");
  assert.equal(
    run.authority.submit(OWNER, { ...request, quoteId: "different" }).code,
    "REQUEST_ID_CONFLICT",
  );
  assert.equal(
    run.authority.submit(OWNER, { ...request, requestId: "stale:bread" }).code,
    "STALE_WORLD",
  );
  assert.deepEqual(run.authority.snapshot(), committed);
  assert.equal(run.restart().submit(OWNER, request).code, "DUPLICATE_REQUEST");
  assert.deepEqual(run.authority.snapshot(), committed);
});

test("a real tick commits a pending NPC job with the Town and receipt; restart and fake completion are atomic", (t) => {
  const run = setup(t, { raw: planningFixture() });
  const tick = tickIntent(run.authority.snapshot());
  const result = success(run.authority.submit(CLOCK, tick));
  assert.ok(result.jobId);
  const state = run.authority.snapshot();
  assert.equal(state.outbox[result.jobId].scope, "npc");
  assert.equal(state.outbox[result.jobId].observedRevision, state.revision);
  assert.ok(state.receipts[tick.requestId]);
  const output = run.authority.fakeOutput(result.jobId);
  assert.deepEqual(run.restart().snapshot(), state);
  const request = completionIntent(state, result.jobId, output);
  assert.equal(run.authority.submit(AVATAR_WORKER, request).code, "FORBIDDEN");
  const completed = success(run.authority.submit(NPC_WORKER, request));
  assert.equal(completed.receipt.townDigest, digest(run.authority.snapshot().town));
  assert.equal(run.authority.snapshot().outbox[result.jobId].status, "completed");
  assert.equal(run.authority.submit(NPC_WORKER, request).code, "DUPLICATE_REQUEST");
  const after = run.authority.snapshot();
  assert.deepEqual(run.restart().snapshot(), after);
  assert.equal(run.authority.submit(NPC_WORKER, request).code, "DUPLICATE_REQUEST");
});

test("unsupported fake result scope is denied; a tick makes the old job stale without changing Town on rejection", (t) => {
  const { authority } = setup(t, { raw: planningFixture() });
  const first = success(authority.submit(CLOCK, tickIntent(authority.snapshot())));
  const output = authority.fakeOutput(first.jobId);
  const forged = structuredClone(output);
  forged.result.plans[0].id = "player";
  assert.equal(
    authority.submit(NPC_WORKER, completionIntent(authority.snapshot(), first.jobId, forged)).code,
    "INVALID_JOB_OUTPUT",
  );
  success(authority.submit(CLOCK, tickIntent(authority.snapshot())));
  const before = authority.snapshot().town;
  const result = authority.submit(
    NPC_WORKER,
    completionIntent(authority.snapshot(), first.jobId, output),
  );
  assert.equal(result.code, "STALE_JOB");
  assert.deepEqual(authority.snapshot().town, before);
  assert.equal(authority.snapshot().outbox[first.jobId].status, "rejected");
});

test("delegated movement uses the actual map and is applied once; it grants no quoted spending/work authority", (t) => {
  const run = setup(t);
  delegate(run.authority);
  const jobId = queueAvatar(run.authority);
  const before = run.authority.snapshot();
  const output = legalMove(before.town);
  const request = completionIntent(before, jobId, output);
  const invalid = { ...request, output: { kind: "move", dx: 99, dy: 0 } };
  assert.equal(run.authority.submit(AVATAR_WORKER, invalid).code, "INVALID_MOVE");
  assert.equal(run.authority.submit(NPC_WORKER, request).code, "FORBIDDEN");
  success(run.authority.submit(AVATAR_WORKER, request));
  const moved = run.authority.snapshot();
  assert.equal(
    person(moved.town, "player").tile.x,
    person(before.town, "player").tile.x + output.dx,
  );
  assert.equal(
    person(moved.town, "player").tile.y,
    person(before.town, "player").tile.y + output.dy,
  );
  assert.equal(run.authority.submit(AVATAR_WORKER, request).code, "DUPLICATE_REQUEST");
  assert.equal(run.restart().submit(AVATAR_WORKER, request).code, "DUPLICATE_REQUEST");
  const financial = playerIntent(moved, "quote", "worker:spend", {
    target: "kevin",
    quoteId: "anything",
  });
  assert.equal(run.authority.submit(AVATAR_WORKER, financial).code, "FORBIDDEN");
  assert.equal(cash(moved.town), cash(before.town));
});

test("reclaim fences pending avatar work immediately, preserves NPC scope and survives restart", (t) => {
  const run = setup(t, { raw: planningFixture() });
  const npc = success(run.authority.submit(CLOCK, tickIntent(run.authority.snapshot())));
  delegate(run.authority);
  const avatarId = queueAvatar(run.authority);
  const pending = run.authority.snapshot();
  const output = legalMove(pending.town);
  const completion = completionIntent(pending, avatarId, output);
  const oldHuman = playerIntent(pending, "reclaim", "reclaim:old");
  // World revision may advance; a valid controller revision is enough for reclaim.
  success(run.authority.submit(CLOCK, tickIntent(run.authority.snapshot())));
  success(run.authority.submit(ownerBack, playerIntent(pending, "reclaim", "reclaim:return")));
  const reclaimed = run.authority.snapshot();
  assert.equal(reclaimed.controller.mode, "human");
  assert.equal(reclaimed.outbox[avatarId].status, "cancelled");
  assert.equal(reclaimed.outbox[npc.jobId].status, "pending");
  assert.equal(run.authority.submit(AVATAR_WORKER, completion).code, "JOB_CANCELLED");
  assert.equal(run.authority.submit(OWNER, oldHuman).code, "STALE_CONTROLLER");
  assert.equal(
    run.authority.submit(
      AVATAR_WORKER,
      playerIntent(reclaimed, "queue-avatar", "forged:fresh", { leaseId: "old" }),
    ).code,
    "FORBIDDEN",
  );
  assert.deepEqual(run.restart().snapshot(), reclaimed);
  assert.equal(run.authority.submit(AVATAR_WORKER, completion).code, "JOB_CANCELLED");
  assert.deepEqual(run.authority.snapshot(), reclaimed);
});

test("independent timer ticks real Town with both views disconnected; lease expiry parks without new AI authority", async (t) => {
  const { authority } = setup(t);
  const a = authority.connectView();
  const b = authority.connectView();
  delegate(authority);
  const jobId = queueAvatar(authority);
  a.disconnect();
  b.disconnect();
  assert.equal(authority.clientCount, 0);
  const minute = authority.snapshot().town.minute;
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(timer);
      reject(new Error("Clock did not progress"));
    }, 3000);
    const timer = setInterval(() => {
      try {
        success(authority.submit(CLOCK, tickIntent(authority.snapshot())));
        if (authority.snapshot().clock.ticks === 3) {
          clearInterval(timer);
          clearTimeout(deadline);
          resolve();
        }
      } catch (error) {
        clearInterval(timer);
        clearTimeout(deadline);
        reject(error);
      }
    }, 5);
  });
  const restored = authority.connectView().read();
  assert.equal(restored.town.minute, minute + 3);
  assert.equal(restored.controller.mode, "parked");
  assert.equal(restored.outbox[jobId].status, "cancelled");
});

for (const phase of [
  "after-engine",
  "after-receipt",
  "after-outbox",
  "after-record-sync",
  "before-head-rename",
  "after-head-sync",
]) {
  test(`crash boundary ${phase} exposes all or none of the real Town/tick receipt/outbox`, (t) => {
    const run = setup(t, {
      raw: planningFixture(),
      fault: (at) => {
        if (at === phase) throw new Error(`Injected ${phase}`);
      },
    });
    const before = run.authority.snapshot();
    const request = tickIntent(before);
    const result = run.authority.submit(CLOCK, request);
    assert.equal(result.ok, false);
    const reopened = run.restart();
    const after = reopened.snapshot();
    if (phase === "after-head-sync") {
      assert.equal(after.town.minute, before.town.minute + 1);
      assert.ok(after.receipts[request.requestId]);
      assert.ok(after.outbox[`job:${request.requestId}`]);
      assert.equal(reopened.submit(CLOCK, request).code, "DUPLICATE_REQUEST");
    } else {
      assert.deepEqual(after, before);
      success(reopened.submit(CLOCK, request));
    }
    assert.deepEqual(engine.economy.auditEconomy(reopened.snapshot().town), []);
  });
}

test("lost response after fake completion persists the changed Town and completed job exactly once", (t) => {
  let crash = false;
  const run = setup(t, {
    raw: planningFixture(),
    fault: (phase) => {
      if (crash && phase === "after-head-sync") throw new Error("Completion response lost");
    },
  });
  const tick = success(run.authority.submit(CLOCK, tickIntent(run.authority.snapshot())));
  const pending = run.authority.snapshot();
  const request = completionIntent(pending, tick.jobId, run.authority.fakeOutput(tick.jobId));
  crash = true;
  assert.equal(run.authority.submit(NPC_WORKER, request).code, "STORAGE_UNCERTAIN");
  const recovered = run.restart();
  assert.equal(recovered.snapshot().outbox[tick.jobId].status, "completed");
  const completed = recovered.snapshot();
  assert.equal(recovered.submit(NPC_WORKER, request).code, "DUPLICATE_REQUEST");
  assert.deepEqual(recovered.snapshot(), completed);
});

test("abrupt process exit retains the real tick and outbox; verified lock recovery rejects redelivery", (t) => {
  const run = setup(t, { raw: planningFixture() });
  const request = tickIntent(run.authority.snapshot());
  run.authority.close();
  const script = `
    import net from "node:net";
    const deny = () => { throw new Error("Forbidden child network attempt"); };
    globalThis.fetch = deny;
    net.Socket.prototype.connect = deny;
    net.Server.prototype.listen = deny;
    const { loadEngine } = await import(${JSON.stringify(new URL("./engine.mjs", import.meta.url).href)});
    const { EngineAuthority, CLOCK } = await import(${JSON.stringify(new URL("./authority.mjs", import.meta.url).href)});
    const engine = await loadEngine();
    const authority = new EngineAuthority(process.argv[1], engine, {
      fault(phase) { if (phase === "after-head-sync") process.exit(86); }
    });
    authority.submit(CLOCK, ${JSON.stringify(request)});
    process.exit(87);
  `;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script, run.directory],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(child.status, 86, child.stderr);
  assert.throws(() => new EngineAuthority(run.directory, engine), { code: "EEXIST" });
  // The joined exact child is known to have stopped; this is explicit operator recovery.
  unlinkSync(join(run.directory, "writer.lock"));
  const recovered = run.restart();
  assert.equal(recovered.snapshot().clock.ticks, 1);
  assert.ok(recovered.snapshot().outbox[`job:${request.requestId}`]);
  assert.equal(recovered.submit(CLOCK, request).code, "DUPLICATE_REQUEST");
});

test("actual funded cafe work pays exactly once across the final-tick crash, duplicate and restart", (t) => {
  let crash = false;
  const raw = rawFixture((town) => {
    town.minute = 960;
    person(town, "player").tile = { ...person(town, "kevin").tile };
  });
  const run = setup(t, {
    raw,
    fault: (phase) => {
      if (crash && phase === "after-head-sync") throw new Error("Wage response lost");
    },
  });
  const initialCash = cash(run.authority.snapshot().town);
  const initialMoney = person(run.authority.snapshot().town, "player").money;
  const accept = currentQuote(run.authority, "kevin", "Accept cafe shift", "work:accept");
  success(run.authority.submit(OWNER, accept));
  const agreementId = run.authority
    .snapshot()
    .town.economy.work.agreements.find((item) => item.worker === "player").id;
  const started = performance.now();
  for (let minute = 0; minute < 179; minute += 1)
    success(run.authority.submit(CLOCK, tickIntent(run.authority.snapshot())));
  const almost = run.authority.snapshot();
  assert.equal(
    almost.town.economy.work.agreements.find((item) => item.id === agreementId).eligibleMinutes,
    179,
  );
  assert.equal(person(almost.town, "player").money, initialMoney);
  const finalTick = tickIntent(almost);
  crash = true;
  assert.equal(run.authority.submit(CLOCK, finalTick).code, "STORAGE_UNCERTAIN");
  const recovered = run.restart();
  const paid = recovered.snapshot();
  assert.equal(person(paid.town, "player").money, initialMoney + 5);
  assert.equal(cash(paid.town), initialCash);
  assert.equal(
    paid.town.economy.work.agreements.find((item) => item.id === agreementId).status,
    "completed",
  );
  assert.equal(
    paid.town.economy.work.payables.filter((item) => item.agreementId === agreementId).length,
    1,
  );
  assert.equal(
    paid.town.economy.work.payables.find((item) => item.agreementId === agreementId).status,
    "settled",
  );
  const wages = paid.town.economy.transactions.filter(
    (item) => item.agreementId === agreementId && item.to === "agent:player",
  );
  assert.equal(wages.length, 1);
  assert.equal(wages[0].amount, 5);
  assert.ok(paid.receipts[finalTick.requestId].transactionIds.includes(wages[0].id));
  assert.equal(recovered.submit(CLOCK, finalTick).code, "DUPLICATE_REQUEST");
  assert.deepEqual(recovered.snapshot(), paid);
  assert.equal(run.restart().submit(CLOCK, finalTick).code, "DUPLICATE_REQUEST");
  success(run.authority.submit(CLOCK, tickIntent(run.authority.snapshot())));
  assert.equal(person(run.authority.snapshot().town, "player").money, initialMoney + 5);
  assert.deepEqual(engine.economy.auditEconomy(run.authority.snapshot().town), []);
  t.diagnostic(
    JSON.stringify({
      sample: "181 real ticks plus shift acceptance and crash recovery",
      elapsedMs: Math.round(performance.now() - started),
      ...run.authority.stats(),
    }),
  );
  // Losing the commit pointer is NOT proof that a world was never initialized.
  // In particular, it must never erase the settled wage/idempotency history.
  run.authority.close();
  unlinkSync(join(run.directory, "HEAD"));
  const retained = () =>
    Object.fromEntries(
      readdirSync(run.directory)
        .sort()
        .map((name) => [
          name,
          createHash("sha256")
            .update(readFileSync(join(run.directory, name)))
            .digest("hex"),
        ]),
    );
  const beforeMissingHead = retained();
  assert.throws(
    () => new EngineAuthority(run.directory, engine, { raw: rawFixture() }),
    /Missing HEAD with retained store evidence/,
  );
  assert.deepEqual(
    retained(),
    beforeMissingHead,
    "all old records remain byte-exact; no new genesis or HEAD appears",
  );
});

for (const evidence of ["orphan-genesis.json", "HEAD-leftover.tmp"]) {
  test(`missing HEAD with ${evidence} requires recovery and never calls initialization`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "game-engine-recovery-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, evidence);
    writeFileSync(path, "retained original bytes");
    assert.throws(
      () => new EngineAuthority(directory, engine, { raw: rawFixture() }),
      /Missing HEAD with retained store evidence/,
    );
    assert.deepEqual(readdirSync(directory), [evidence]);
    assert.equal(readFileSync(path, "utf8"), "retained original bytes");
  });
}

test("corrupt canonical snapshot stops recovery and leaves bytes unchanged", (t) => {
  const run = setup(t);
  success(run.authority.submit(CLOCK, tickIntent(run.authority.snapshot())));
  run.authority.close();
  const head = JSON.parse(readFileSync(join(run.directory, "HEAD"), "utf8"));
  const recordPath = join(run.directory, `${head.hash}.json`);
  const broken = readFileSync(recordPath, "utf8").slice(0, -25);
  writeFileSync(recordPath, broken);
  assert.throws(() => new EngineAuthority(run.directory, engine));
  assert.equal(readFileSync(recordPath, "utf8"), broken);
});
