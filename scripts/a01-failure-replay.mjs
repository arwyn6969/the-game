import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import { PGlite } from "@electric-sql/pglite";
import { routeMind } from "../src/lib/mind-pool/router.ts";
import { SqlQuotaStore } from "../src/lib/mind-pool/store.ts";
import { SqlMindBudgetStore } from "../src/lib/mind-budget/store.ts";
import { runBudgetedMind } from "../src/lib/mind-budget/runner.ts";
import { meetingFreeProfile } from "./meeting-free-profile.mjs";
import {
  evaluateDiscussionRun,
  markDiscussionRunStarted,
  settleDiscussionRun,
  startDiscussionRun,
  stopDiscussionRun,
} from "../src/game/discussion-run.ts";
import { auditDiscussionObservations } from "./library-meeting-audit.mjs";

export const failureCases = JSON.parse(
  await readFile(new URL("./fixtures/a01-failure-cases.json", import.meta.url), "utf8"),
);
// Keep A01.1's historical inputs/expectations and committed receipts intact.
// Current regression expectations are separate from that baseline evidence.
export const terminalFailureCases = [
  ...failureCases.map((spec) =>
    spec.id === "final-empty-completion" ? { ...spec, status: "closed", gap: null } : spec,
  ),
  ...[
    "unavailable-action",
    "malformed-completion",
    "provider-timeout",
    "budget-exhausted",
    "provider-exhausted",
    "cancel-late-completion",
  ].map((id) => ({
    ...failureCases.find((spec) => spec.id === id),
    id: `final-${id}`,
    priorDecisions: 15,
    status: "closed",
  })),
];
const clone = (value) => structuredClone(value);
const session = (town) => town.discussions.sessions.at(-1);
const member = (town, id) => session(town).members.find((person) => person.id === id);
const success = (result) => assert.equal(result.ok, true, result.message);

/** Fixture construction only; no private save, production SQL or environment loading. */
function makeTown(core, spec) {
  const { d, save, createTown, economy, migration } = core;
  const town = createTown("Synthetic replay player");
  town.paused = true;
  town.favors.push({
    id: "synthetic-existing-debt",
    from: "player",
    to: "kevin",
    amount: 3,
    text: "Synthetic retained tab",
    status: "owed",
    day: town.day,
  });
  assert.equal(migration.initializeFundedEconomy(town).ok, true);
  const terms = { from: "agent:player", to: "agent:kevin", amount: 1 };
  const transfer = economy.runEconomyCommand(
    town,
    {
      id: "synthetic-existing-transfer",
      kind: "fixture-transfer",
      actor: "player",
      authority: "ui",
      terms,
    },
    (draft, context) => {
      economy.transferFunds(draft, context, {
        id: "synthetic-existing-transfer:payment",
        ...terms,
        purpose: "Synthetic prior payment",
      });
      return terms;
    },
  );
  assert.equal(transfer.ok, true, transfer.reason);
  const positions = {
    player: { x: 43, y: 22 },
    northern: { x: 42, y: 21 },
    arwyn: { x: 44, y: 21 },
    sub: { x: 43, y: 20 },
    baba: { x: 42, y: 22 },
  };
  for (const person of town.agents) if (positions[person.id]) person.tile = positions[person.id];
  success(d.createLibraryDiscussion(town, "Synthetic failure replay"));
  let serial = 0;
  const command = (id, kind, fields = {}) =>
    d.applyDiscussionCommand(town, id, {
      kind,
      meetingId: session(town).id,
      expectedRevision: member(town, id).revision,
      commandId: `fixture:${++serial}`,
      ...fields,
    });
  for (const id of ["northern", "arwyn", "sub"]) {
    success(command("player", "invite", { invitee: id }));
    success(command(id, "accept"));
    success(command(id, id === "northern" ? "participate" : "listen"));
  }
  success(command("northern", "speak", { text: "Synthetic prior statement, retained verbatim." }));
  assert.deepEqual(session(town).utterances[0].recipientIds.sort(), ["arwyn", "sub"]);
  // All actors have nonempty seeded memories and finances; the player and Baba
  // are nearby but have not opted in to hearing the synthetic prior statement.
  if (spec.speaker) for (const id of ["arwyn", "sub"]) success(command(id, "listen"));
  // Recreate a retained fifteen-failure history through the engine. Matching
  // historical charges are seeded below, before the immutable baseline is read.
  // These are fixture history, not newly transmitted or live provider requests.
  for (let i = 0; i < (spec.priorDecisions ?? 0); i++) {
    const job = d.nextDiscussionJob(town);
    assert.ok(d.markDiscussionRequest(town, job));
    d.recordDiscussionUsage(town, job, {
      success: false,
      attempts: 1,
      totalTokens: 42,
      elapsedMs: 1,
    });
    d.pauseDiscussion(town, "Synthetic earlier failure.");
    success(d.resumeDiscussion(town));
  }
  const restored = save.parseTownFile(save.exportTown(town));
  assert.ok(restored);
  return restored;
}

function invariants(town, d) {
  return clone({
    // Everything outside discussion bookkeeping must stay byte-for-byte equal.
    rest: Object.fromEntries(Object.entries(town).filter(([key]) => key !== "discussions")),
    utterances: session(town).utterances,
    knowledge: auditDiscussionObservations({
      town,
      meetingId: session(town).id,
      observation: d.discussionObservation,
    }),
  });
}

const snapshot = (town, d) => {
  const meeting = session(town),
    job = d.nextDiscussionJob(town);
  return {
    town,
    townIdentity: town.identityRegistry.worldId,
    meeting: {
      id: meeting.id,
      epoch: meeting.epoch,
      status: meeting.status,
      decisions: meeting.decisions,
      utteranceCount: meeting.utterances.length,
      floorActor: meeting.floor?.actor ?? null,
    },
    job,
    jobFresh: Boolean(job && d.isDiscussionJobFresh(town, job)),
    visible: true,
    replaying: false,
    importing: false,
    localOnly: false,
    enabled: true,
    available: true,
    busy: false,
    lastRequestStartedAt: null,
  };
};

async function ledgerRows(db) {
  return {
    budget: (await db.query("select * from mind_budget_attempts order by id")).rows,
    pool: (await db.query("select * from mind_pool_attempts order by id")).rows,
  };
}

async function seedLedger(db, pool, spec) {
  const provider = pool.providers[0];
  const time = Date.now() - 120_000;
  for (let i = 0; i < (spec.budgetRows ?? Math.max(2, spec.priorDecisions ?? 0)); i++)
    await db.query("insert into mind_budget_attempts values ($1,$2,'act',$3,$4,$4,1,1,0,0)", [
      `prior-budget:${i}`,
      "synthetic-owner",
      time + i,
      time + i + 1,
    ]);
  for (let i = 0; i < (spec.poolRows ?? Math.max(2, spec.priorDecisions ?? 0)); i++)
    await db.query(
      "insert into mind_pool_attempts values ($1,$2,$3,'act',$4,$5,$5,2000,42,'invalid',200,1)",
      [`prior-pool:${i}`, provider.id, provider.routes.act.model, time + i, time + i + 1],
    );
}

async function replayCase(core, spec) {
  const { d, save, prompt } = core;
  const town = makeTown(core, spec);
  const before = invariants(town, d),
    beforeUsage = clone(session(town).usage);
  assert.equal(town.agents.length, 10);
  assert.equal(Object.keys(town.identityRegistry.characters).length, 10);
  assert.ok(town.agents.every((person) => person.memories.length));
  assert.ok(town.economy);
  assert.ok(town.economy.transactions.length);
  assert.ok(town.favors.some((favor) => favor.status === "owed"));
  assert.deepEqual(core.economy.auditEconomy(town), []);
  const { pool, budget } = await meetingFreeProfile();
  // Exercise the actual router AbortSignal deadline using a shortened local
  // timeout. The production profile and its 30-second ceiling are unchanged.
  if (spec.timeout) pool.actionTimeoutMs = 1000;
  const db = new PGlite({ parsers: { 20: Number } });
  try {
    for (const name of [
      "20261012_mind_pool.sql",
      "20261013_mind_budget.sql",
      "20261022_mind_actions.sql",
      "20261023_manual_action_budget.sql",
    ])
      await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    await seedLedger(db, pool, spec);
    const prior = await ledgerRows(db);
    const sql = { query: async (text, params) => (await db.query(text, params)).rows };
    const quota = new SqlQuotaStore(sql),
      budgetStore = new SqlMindBudgetStore(sql);
    let calls = 0,
      release,
      started;
    const entered = new Promise((resolve) => {
      started = resolve;
    });
    const delayed = new Promise((resolve) => {
      release = resolve;
    });
    const attempts = [];
    const initial = snapshot(town, d),
      job = initial.job;
    assert.ok(job);
    const automatic = markDiscussionRunStarted(startDiscussionRun(initial, 0), initial, 0);
    assert.ok(automatic);
    let run = automatic.state;
    assert.ok(d.markDiscussionRequest(town, job));
    if (spec.id.endsWith("unavailable-action")) {
      assert.equal(job.agentId, "arwyn");
      assert.equal(
        d.discussionObservation(town, job.agentId).availableActions.some((a) => a.kind === "speak"),
        false,
      );
    }
    const pending = runBudgetedMind({
      kind: "act",
      userHash: "synthetic-owner",
      system: "One synthetic decision",
      user: prompt.buildPrompt(town, job),
      maxAttempts: 1,
      maxOutputTokens: 1200,
      leaseMs: 90_000,
      policy: budget,
      store: budgetStore,
      scope: "shared",
      run: async () => {
        const result = await routeMind({
          kind: "act",
          config: pool,
          store: quota,
          env: { OPENROUTER_API_KEY: "synthetic-never-transmitted" },
          system: "One synthetic decision",
          user: prompt.buildPrompt(town, job),
          onAttempt: (_provider, _model, completion) => attempts.push(completion),
          // This is the sole transport. It never delegates to global fetch.
          fetcher: async (_url, options) => {
            calls++;
            assert.equal(calls, 1, "No retry or failover is permitted");
            started();
            if (spec.timeout)
              await new Promise((_resolve, reject) => {
                const keepAlive = setTimeout(
                  () => reject(new Error("deadline did not abort")),
                  5000,
                );
                options.signal.addEventListener(
                  "abort",
                  () => {
                    clearTimeout(keepAlive);
                    reject(options.signal.reason);
                  },
                  { once: true },
                );
              });
            if (spec.cancel) await delayed;
            return Response.json({
              choices: [{ message: { content: spec.content }, finish_reason: "stop" }],
              usage: { total_tokens: 42 },
            });
          },
        });
        // Match thinkWithPool's public accounting shape. A budget denial
        // bypasses this adapter and therefore has no known attempt diagnostic.
        return {
          ...result,
          diagnostics: {
            attempts: attempts.length,
            totalTokens: attempts.some((attempt) => attempt.actualTokens !== null)
              ? attempts.reduce((sum, attempt) => sum + (attempt.actualTokens ?? 0), 0)
              : null,
          },
        };
      },
    });
    if (spec.cancel) {
      await entered;
      run = stopDiscussionRun(run, "Synthetic player cancellation.");
      d.recordDiscussionUsage(town, job, {
        success: false,
        attempts: null,
        totalTokens: null,
        elapsedMs: 0,
      });
      d.pauseDiscussion(town, "Synthetic player cancellation; no replacement dialogue.");
      assert.equal(startDiscussionRun(snapshot(town, d), 31_000, run).status, "stopped");
      release();
    }
    const result = await pending;
    const parsed = result.ok ? prompt.parseMind(job, result.text) : null;
    let applied = { ok: false };
    if (spec.cancel) {
      assert.ok(parsed);
      const atCancellation = clone(town);
      applied = d.applyDiscussionResult(town, parsed);
      assert.equal(applied.ok, false);
      assert.deepEqual(town, atCancellation, "Late valid completion has no commit authority");
    } else {
      if (parsed) applied = d.applyDiscussionResult(town, parsed);
      d.recordDiscussionUsage(town, job, {
        success: applied.ok,
        attempts: result.diagnostics?.attempts ?? null,
        totalTokens: result.diagnostics?.totalTokens ?? null,
        elapsedMs: 0,
      });
      if (!applied.ok && session(town).status !== "paused")
        d.pauseDiscussion(town, "Synthetic decision failed; no replacement dialogue.");
    }
    run = settleDiscussionRun(run, automatic.token, applied.ok);
    assert.equal(applied.ok, spec.committed);
    assert.equal(session(town).status, spec.status);
    assert.equal(session(town).pending, null);
    assert.equal(session(town).decisions, (spec.priorDecisions ?? 0) + 1);
    assert.equal(session(town).usage.requests, beforeUsage.requests + 1);
    assert.equal(session(town).usage.failures, beforeUsage.failures + Number(!spec.committed));
    assert.equal(
      session(town).usage.providerAttempts,
      beforeUsage.providerAttempts + (spec.cancel ? 0 : calls),
    );
    assert.equal(
      session(town).usage.attemptsUnknown,
      spec.cancel || spec.id.endsWith("budget-exhausted") ? 1 : 0,
    );
    assert.equal(calls, spec.id.endsWith("exhausted") ? 0 : 1);
    if (spec.outcome) assert.equal(attempts[0].outcome, spec.outcome);
    assert.deepEqual(invariants(town, d), before);

    // Duplicate result and duplicate usage settlement cannot duplicate effects.
    const settledTown = clone(town);
    if (parsed) assert.equal(d.applyDiscussionResult(town, parsed).ok, false);
    d.recordDiscussionUsage(town, job, {
      success: true,
      attempts: 1,
      totalTokens: 999,
      elapsedMs: 999,
    });
    assert.deepEqual(town, settledTown);
    const loaded = save.parseTownFile(save.exportTown(town));
    assert.ok(loaded);
    assert.deepEqual(loaded, town, "Reload preserves the entire canonical town");
    assert.deepEqual(invariants(loaded, d), before);
    assert.deepEqual(core.economy.auditEconomy(loaded), []);
    if (spec.speaker) {
      for (let i = 0; i < 5; i++) d.advanceDiscussions(loaded);
      assert.equal(d.nextDiscussionJob(loaded), null);
      assert.deepEqual(loaded, town, "Unchanged polling cannot mutate the reloaded town");
      assert.equal(evaluateDiscussionRun(run, snapshot(town, d), 1_000_000).kind, "stopped");
    } else if (!spec.committed) {
      assert.equal(evaluateDiscussionRun(run, snapshot(town, d), 1_000_000).kind, "stopped");
      assert.equal(d.nextDiscussionJob(loaded), null);
    }
    if (spec.priorDecisions) {
      assert.equal(d.nextDiscussionJob(loaded), null);
      if (!spec.committed && session(loaded).status !== "closed") {
        assert.equal(d.resumeDiscussion(loaded).ok, false);
        success(
          d.applyDiscussionCommand(loaded, "player", {
            kind: "close",
            meetingId: session(loaded).id,
            expectedRevision: member(loaded, "player").revision,
            commandId: "recovery:close",
          }),
        );
        assert.equal(session(loaded).status, "closed");
        assert.deepEqual(invariants(loaded, d), before);
        assert.deepEqual(save.parseTownFile(save.exportTown(loaded)), loaded);
      } else if (!spec.committed) {
        assert.equal(d.resumeDiscussion(loaded).ok, false);
        assert.match(session(loaded).reason, /stopped at its sixteen-decision limit/);
        assert.match(session(loaded).reason, /No replacement dialogue/);
      }
    }
    const after = await ledgerRows(db);
    for (const key of ["budget", "pool"])
      for (const row of prior[key])
        assert.deepEqual(
          after[key].find((candidate) => candidate.id === row.id),
          row,
          `${key}: preserve every prior identity, timestamp and charge`,
        );
    const addedBudget = after.budget.filter(
      (row) => !prior.budget.some((old) => old.id === row.id),
    );
    const addedPool = after.pool.filter((row) => !prior.pool.some((old) => old.id === row.id));
    assert.equal(addedBudget.length, spec.id.endsWith("budget-exhausted") ? 0 : 1);
    assert.equal(addedPool.length, calls);
    assert.ok(
      after.budget.every(
        (row) => row.completed_at !== null && row.charged_calls === 1 && row.charged_microusd === 0,
      ),
    );
    assert.ok(after.pool.every((row) => row.completed_at !== null));
    return {
      id: spec.id,
      status: spec.status,
      reason: session(town).reason,
      committed: applied.ok,
      decisions: session(town).decisions,
      syntheticTransmissions: calls,
      newBudgetCharges: addedBudget.length,
      newProviderCharges: addedPool.length,
      providerOutcome: attempts[0]?.outcome ?? null,
      invalidReason: attempts[0]?.response?.invalidReason ?? null,
      townAttemptsUnknown: session(town).usage.attemptsUnknown,
      priorBudgetRows: prior.budget.length,
      priorProviderRows: prior.pool.length,
      priorRowsUnchanged: true,
      fullTownReloadEqual: true,
      protectedStateEqual: true,
      actorsAudited: 8,
      required: spec.required,
      remainingIssue: spec.gap ?? null,
    };
  } finally {
    await db.close();
  }
}

/** A seam-level replay, not a replacement browser controller or hosted trial. */
export async function replayFailures({ cases: inputs = terminalFailureCases } = {}) {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    envDir: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  try {
    const core = {
      d: await server.ssrLoadModule("/src/game/discussions.ts"),
      save: await server.ssrLoadModule("/src/game/save.ts"),
      prompt: await server.ssrLoadModule("/src/game/prompt.ts"),
      economy: await server.ssrLoadModule("/src/game/economy.ts"),
      migration: await server.ssrLoadModule("/src/game/economy-migration.ts"),
      ...(await server.ssrLoadModule("/src/game/town.ts")),
    };
    const cases = [];
    for (const spec of inputs) cases.push(await replayCase(core, spec));
    return {
      packet: "A01.2",
      liveInferenceCalls: 0,
      spend: 0,
      scope:
        "Synthetic engine/parser/save/scheduler and disposable SQL accounting seams; no browser or hosted acceptance.",
      cases,
    };
  } finally {
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(
    process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === "--report"),
    "Usage: node scripts/a01-failure-replay.mjs [--report local-output.json]",
  );
  const report = await replayFailures();
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
