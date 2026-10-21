import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  DEFAULT_BUDGET,
  validateBudgetPolicy,
  loadBudgetPolicy,
  estimateBudgetMicrousd,
} from "../src/lib/mind-budget/policy.ts";
import { SqlMindBudgetStore, EphemeralMindBudgetStore } from "../src/lib/mind-budget/store.ts";
import { runBudgetedMind } from "../src/lib/mind-budget/runner.ts";
import { budgetScope, budgetConfigured } from "../src/lib/mind-budget/server.server.ts";
import { defaultConfig } from "../src/lib/mind-pool/config.ts";
import { thinkWithPool } from "../src/lib/mind-pool/server.ts";

let db;
let store;
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(new URL("../migrations/20261013_mind_budget.sql", import.meta.url), "utf8"),
  );
  store = new SqlMindBudgetStore({
    query: async (text, params) => (await db.query(text, params)).rows,
  });
});
beforeEach(async () => {
  await db.exec("truncate mind_budget_attempts");
});
after(async () => {
  await db.close();
});
const policy = (changes = {}) =>
  validateBudgetPolicy({
    ...DEFAULT_BUDGET,
    dailyCalls: 10,
    playerDailyCalls: 8,
    playerMinuteCalls: 6,
    playerInteractiveReserveCalls: 2,
    playerInteractiveReserveMinuteCalls: 2,
    concurrent: 3,
    backgroundConcurrent: 1,
    interactiveReserveCalls: 2,
    dailyMicrousd: 1000,
    interactiveReserveMicrousd: 200,
    inputNanousdPerToken: 1000,
    outputNanousdPerToken: 1000,
    ...changes,
  });
const request = (changes = {}) => ({
  user: "verified-user-hash",
  kind: "player",
  calls: 1,
  microusd: 100,
  leaseMs: 10_000,
  ...changes,
});
const attempts = async () =>
  (await db.query("select * from mind_budget_attempts order by started_at,id")).rows;
const run = (changes = {}) => ({
  kind: "player",
  userHash: "verified-user-hash",
  system: "s",
  user: "u",
  maxAttempts: 3,
  maxOutputTokens: 30,
  leaseMs: 10_000,
  policy: policy({ dailyMicrousd: 10_000, interactiveReserveMicrousd: 200 }),
  store,
  scope: "shared",
  run: async () => ({ ok: true, text: '{"reply":"Hello"}', diagnostics: { attempts: 1 } }),
  ...changes,
});

test("monetary reservation covers UTF-8 input, maximum output and all possible attempts", () => {
  assert.equal(estimateBudgetMicrousd(policy(), 100, 200, 3), 1668);
  assert.equal(estimateBudgetMicrousd(DEFAULT_BUDGET, 100, 200, 3), null);
  assert.equal(loadBudgetPolicy({}).dailyCalls, 500);
  assert.throws(
    () => validateBudgetPolicy({ ...DEFAULT_BUDGET, inputNanousdPerToken: 1 }),
    /Invalid/,
  );
  assert.throws(
    () => validateBudgetPolicy({ ...DEFAULT_BUDGET, backgroundConcurrent: 4 }),
    /Invalid/,
  );
});

test("shared reservations enforce cost and call limits across independent store instances", async () => {
  const second = new SqlMindBudgetStore({
    query: async (text, params) => (await db.query(text, params)).rows,
  });
  const lease = await store.reserve(request({ calls: 3, microusd: 600 }), policy());
  assert.ok(lease);
  assert.equal(
    await second.reserve(request({ user: "other", calls: 3, microusd: 600 }), policy()),
    null,
  );
  await store.finish(lease, 1);
  assert.ok(await second.reserve(request({ user: "other", calls: 3, microusd: 600 }), policy()));
  assert.equal(
    (await attempts()).reduce((sum, entry) => sum + Number(entry.charged_microusd), 0),
    800,
  );
});

test("a literal zero monetary cap requires a zero monetary reserve and preserves positive-cap rules", () => {
  assert.equal(policy({ dailyMicrousd: 0, interactiveReserveMicrousd: 0 }).dailyMicrousd, 0);
  for (const changes of [
    { dailyMicrousd: -1, interactiveReserveMicrousd: 0 },
    { dailyMicrousd: 0, interactiveReserveMicrousd: 1 },
    { dailyMicrousd: 0, interactiveReserveMicrousd: -1 },
    { dailyMicrousd: 1, interactiveReserveMicrousd: 1 },
  ])
    assert.throws(() => policy(changes), /Invalid/);
  assert.equal(policy({ dailyMicrousd: 1, interactiveReserveMicrousd: 0 }).dailyMicrousd, 1);
});

for (const scope of ["shared", "ephemeral"]) {
  test(`${scope} zero cap rejects positive cost while free calls retain identity, global and concurrency limits`, async () => {
    const target = scope === "shared" ? store : new EphemeralMindBudgetStore();
    const cap = policy({
      dailyCalls: 4,
      playerDailyCalls: 2,
      playerMinuteCalls: 2,
      playerInteractiveReserveCalls: 0,
      playerInteractiveReserveMinuteCalls: 0,
      interactiveReserveCalls: 1,
      concurrent: 2,
      backgroundConcurrent: 1,
      dailyMicrousd: 0,
      interactiveReserveMicrousd: 0,
      inputNanousdPerToken: 0,
      outputNanousdPerToken: 0,
    });
    for (const kind of ["player", "talk"])
      assert.equal(await target.reserve(request({ kind, microusd: 1 }), cap), null);
    const free = (user) => target.reserve(request({ user, microusd: 0 }), cap);
    const first = await free("first");
    const second = await free("first");
    assert.ok(first);
    assert.ok(second);
    assert.equal(await free("second"), null, "concurrency still applies to free work");
    await target.finish(first, 1);
    await target.finish(second, 1);
    assert.equal(await free("first"), null, "identity call limits remain charged after finish");
    const third = await free("second");
    const fourth = await free("second");
    assert.ok(third);
    assert.ok(fourth);
    await target.finish(third, 1);
    await target.finish(fourth, 1);
    assert.equal(await free("third"), null, "global call allowance remains finite");
  });
}

test("a zero cap blocks the provider callback under positive tariffs in both stores", async () => {
  let calls = 0;
  for (const scope of ["shared", "ephemeral"]) {
    const result = await runBudgetedMind(
      run({
        scope,
        store: scope === "shared" ? store : new EphemeralMindBudgetStore(),
        policy: policy({ dailyMicrousd: 0, interactiveReserveMicrousd: 0 }),
        run: async () => {
          calls++;
          return { ok: true, diagnostics: { attempts: 1 } };
        },
      }),
    );
    assert.equal(result.ok, false);
  }
  assert.equal(calls, 0);
  assert.equal((await attempts()).length, 0);
});

test("parallel shared workers cannot allocate the same remaining allowance", async () => {
  const result = await Promise.all([
    store.reserve(request({ user: "a", microusd: 600 }), policy()),
    store.reserve(request({ user: "b", microusd: 600 }), policy()),
  ]);
  assert.equal(result.filter(Boolean).length, 1);
});

test("background concurrency and per-user minute caps leave direct reply capacity", async () => {
  const p = policy();
  const background = await store.reserve(request({ kind: "plan", calls: 3 }), p);
  assert.ok(background);
  assert.equal(await store.reserve(request({ user: "other", kind: "talk" }), p), null);
  assert.ok(
    await store.reserve(request({ calls: 3 }), p),
    "direct reply can use its reserved minute capacity",
  );
  assert.equal(
    await store.reserve(request(), p),
    null,
    "same user cannot exceed their rolling minute cap",
  );
  assert.ok(
    await store.reserve(request({ user: "another" }), p),
    "another verified user retains access",
  );
});

test("background daily calls and cost cannot spend the interactive reserve", async () => {
  const p = policy({
    dailyCalls: 4,
    playerDailyCalls: 4,
    playerMinuteCalls: 4,
    interactiveReserveCalls: 1,
    playerInteractiveReserveCalls: 1,
    playerInteractiveReserveMinuteCalls: 1,
  });
  const lease = await store.reserve(request({ kind: "reflect", calls: 3, microusd: 800 }), p);
  assert.ok(lease);
  await store.finish(lease, 3);
  assert.equal(await store.reserve(request({ user: "other", kind: "talk" }), p), null);
  assert.ok(await store.reserve(request({ user: "other", microusd: 200 }), p));
});

test("unknown outcomes and expired leases keep daily charges, while freeing concurrency", async () => {
  const p = policy();
  const lease = await store.reserve(request({ calls: 3, microusd: 900 }), p);
  assert.ok(lease);
  await store.finish(lease, null);
  await store.finish(lease, 0);
  assert.equal(
    Number((await attempts())[0].charged_microusd),
    900,
    "late duplicate finish cannot refund an unknown result",
  );
  await db.query("update mind_budget_attempts set completed_at = null, expires_at = 0");
  assert.equal(
    await store.reserve(request({ user: "other", microusd: 200 }), p),
    null,
    "expired lease does not refund money",
  );
  assert.ok(await store.reserve(request({ user: "other", microusd: 100 }), p));
});

test("successful transports release unused attempts but failed adapters retain their full reservation", async () => {
  const result = await runBudgetedMind(run());
  assert.equal(result.ok, true);
  const first = (await attempts())[0];
  assert.equal(first.reserved_calls, 3);
  assert.equal(first.charged_calls, 1);
  assert.equal(Number(first.charged_microusd), 288);
  await runBudgetedMind(
    run({
      userHash: "other",
      run: async () => ({ ok: false, error: "offline", diagnostics: { attempts: 0 } }),
    }),
  );
  assert.equal((await attempts()).find((item) => item.user_hash === "other").charged_calls, 3);
});

test("deployed budgets fail closed without shared storage and explicit tariffs; client hostnames cannot enable local mode", () => {
  assert.equal(budgetScope({ NODE_ENV: "production" }), "unavailable");
  assert.equal(
    budgetScope({ GROK_PROJECT_ID: "test", MIND_BUDGET_LOCAL_DEV: "true" }),
    "unavailable",
  );
  assert.equal(budgetScope({ VERCEL: "1", MIND_BUDGET_LOCAL_DEV: "true" }), "unavailable");
  assert.equal(budgetScope({ NODE_ENV: "development" }), "ephemeral");
  assert.equal(budgetScope({ NODE_ENV: "production", MIND_BUDGET_LOCAL_DEV: "true" }), "ephemeral");
  assert.equal(budgetConfigured({ DATABASE_URL: "synthetic-not-connected" }), false);
  assert.equal(
    budgetConfigured({
      DATABASE_URL: "synthetic-not-connected",
      MIND_BUDGET_CONFIG: JSON.stringify(policy()),
    }),
    true,
  );
});

test("pool execution uses its immutable budget snapshot even if operator configuration changes", async () => {
  const snapshot = defaultConfig();
  const before = structuredClone(snapshot);
  const freeze = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(snapshot);
  const previous = process.env.MIND_POOL_CONFIG;
  process.env.MIND_POOL_CONFIG = "synthetic invalid replacement configuration";
  try {
    assert.deepEqual(await thinkWithPool("player", "synthetic", "synthetic", snapshot), {
      ok: false,
      error: "offline",
    });
    assert.deepEqual(snapshot, before);
    assert.deepEqual(await thinkWithPool("player", "synthetic", "synthetic"), {
      ok: false,
      error: "unreachable",
    });
  } finally {
    if (previous === undefined) delete process.env.MIND_POOL_CONFIG;
    else process.env.MIND_POOL_CONFIG = previous;
  }
});

test("missing price config, failed reservation and failed finalization never permit unmetered fallback", async () => {
  let calls = 0;
  assert.deepEqual(
    await runBudgetedMind(
      run({
        policy: DEFAULT_BUDGET,
        run: async () => {
          calls++;
          return { ok: true };
        },
      }),
    ),
    { ok: false, error: "offline" },
  );
  const broken = {
    reserve: async () => {
      throw new Error("DB failed");
    },
    finish: async () => {},
  };
  assert.deepEqual(
    await runBudgetedMind(
      run({
        store: broken,
        run: async () => {
          calls++;
          return { ok: true };
        },
      }),
    ),
    { ok: false, error: "unreachable" },
  );
  assert.equal(calls, 0);
  const finished = [];
  const brokenFinish = {
    reserve: async () => ({ id: "lease", calls: 3, microusd: 100 }),
    finish: async (_lease, count) => {
      finished.push(count);
      throw new Error("DB failed");
    },
  };
  assert.deepEqual(
    await runBudgetedMind(
      run({
        store: brokenFinish,
        run: async () => {
          calls++;
          return { ok: true, diagnostics: { attempts: 1 } };
        },
      }),
    ),
    { ok: false, error: "unreachable" },
  );
  assert.equal(calls, 1);
  assert.deepEqual(finished, [1, null]);
});

test("process-local development limits are finite, retain unknown charges and reset only in a fresh instance", async () => {
  let time = 1_000;
  const local = new EphemeralMindBudgetStore(() => time);
  const p = policy({ playerMinuteCalls: 2, playerInteractiveReserveMinuteCalls: 1 });
  const lease = await local.reserve(request({ calls: 2 }), p);
  assert.ok(lease);
  await local.finish(lease, null);
  assert.equal(await local.reserve(request(), p), null);
  time += 60_001;
  assert.ok(await local.reserve(request(), p));
  assert.ok(await new EphemeralMindBudgetStore(() => time).reserve(request({ calls: 2 }), p));
});
