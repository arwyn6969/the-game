import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_BUDGET, validateBudgetPolicy } from "../src/lib/mind-budget/policy.ts";
import { actionBudgetConfigured } from "../src/lib/mind-budget/server.server.ts";
import { EphemeralMindBudgetStore, SqlMindBudgetStore } from "../src/lib/mind-budget/store.ts";

const production = (changes = {}) =>
  validateBudgetPolicy({
    ...DEFAULT_BUDGET,
    dailyCalls: 24,
    playerDailyCalls: 12,
    playerMinuteCalls: 3,
    playerInteractiveReserveCalls: 0,
    playerInteractiveReserveMinuteCalls: 0,
    interactiveReserveCalls: 0,
    concurrent: 1,
    backgroundConcurrent: 0,
    actionConcurrent: 1,
    dailyMicrousd: 0,
    interactiveReserveMicrousd: 0,
    inputNanousdPerToken: 0,
    outputNanousdPerToken: 0,
    ...changes,
  });
const request = (changes = {}) => ({
  user: "verified-user",
  kind: "act",
  calls: 1,
  microusd: 0,
  leaseMs: 10000,
  ...changes,
});
let db;
let sql;
let migrationPreserved;
before(async () => {
  db = new PGlite({ parsers: { 20: Number } });
  for (const name of ["20261013_mind_budget.sql", "20261022_mind_actions.sql"])
    await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  sql = new SqlMindBudgetStore({
    query: async (text, params) => (await db.query(text, params)).rows,
  });
  assert.equal(
    await sql.reserve(request(), production()),
    null,
    "Old SQL cannot silently enable the new lane",
  );
  const oldLease = await sql.reserve(
    request(),
    production({ concurrent: 2, backgroundConcurrent: 1, actionConcurrent: 0 }),
  );
  assert.ok(oldLease);
  await sql.finish(oldLease, null);
  const oldRows = (await db.query("select * from mind_budget_attempts")).rows;
  await db.exec(
    await readFile(
      new URL("../migrations/20261023_manual_action_budget.sql", import.meta.url),
      "utf8",
    ),
  );
  migrationPreserved = (await db.query("select * from mind_budget_attempts")).rows;
  assert.deepEqual(migrationPreserved, oldRows);
});
beforeEach(async () => {
  await db.exec("truncate mind_budget_attempts");
});
after(async () => {
  await db.close();
});

test("optional action lane defaults to legacy gating and cannot exceed global concurrency", () => {
  const omitted = { ...production() };
  delete omitted.actionConcurrent;
  assert.equal(validateBudgetPolicy(omitted).actionConcurrent, 0);
  assert.equal(DEFAULT_BUDGET.actionConcurrent, 0);
  assert.equal(migrationPreserved[0].charged_calls, 1);
  assert.ok(migrationPreserved[0].completed_at);
  for (const value of [-1, 1.5, "1", null, 2])
    assert.throws(() => production({ actionConcurrent: value }), /Invalid/);
  assert.equal(production().concurrent, 1);
  assert.equal(production().backgroundConcurrent, 0);
});

test("availability requires a usable configured action or historical background lane", () => {
  const env = (policy) => ({
    DATABASE_URL: "synthetic-not-connected",
    MIND_BUDGET_CONFIG: JSON.stringify(policy),
  });
  assert.equal(actionBudgetConfigured(env(production())), true);
  assert.equal(actionBudgetConfigured(env(production({ actionConcurrent: 0 }))), false);
  const omitted = { ...production() };
  delete omitted.actionConcurrent;
  assert.equal(actionBudgetConfigured(env(omitted)), false);
  assert.equal(
    actionBudgetConfigured(
      env(production({ concurrent: 2, backgroundConcurrent: 1, actionConcurrent: 0 })),
    ),
    true,
  );
  assert.equal(
    actionBudgetConfigured({
      NODE_ENV: "production",
      MIND_BUDGET_CONFIG: JSON.stringify(production()),
    }),
    false,
  );
  assert.equal(
    actionBudgetConfigured({ DATABASE_URL: "synthetic", MIND_BUDGET_CONFIG: "invalid" }),
    false,
  );
});

test("independent shared action and foreground workers cannot overlap the single global slot", async () => {
  const second = new SqlMindBudgetStore({
    query: async (text, params) => (await db.query(text, params)).rows,
  });
  const leases = await Promise.all([
    sql.reserve(request({ user: "action" }), production()),
    second.reserve(request({ user: "foreground", kind: "player" }), production()),
  ]);
  assert.equal(leases.filter(Boolean).length, 1);
  assert.equal((await db.query("select count(*) as n from mind_budget_attempts")).rows[0].n, 1);
});

for (const scope of ["shared", "ephemeral"]) {
  function fixture() {
    let now = Date.now();
    return scope === "shared"
      ? {
          store: sql,
          age: () => db.exec("update mind_budget_attempts set started_at = started_at - 60001"),
        }
      : {
          store: new EphemeralMindBudgetStore(() => now),
          age: async () => {
            now += 60001;
          },
        };
  }

  test(`${scope} action lane preserves one global request, zero background and zero cost`, async () => {
    const { store } = fixture();
    const policy = production();
    for (const kind of ["plan", "reflect", "talk"])
      assert.equal(await store.reserve(request({ kind }), policy), null);
    assert.equal(await store.reserve(request({ microusd: 1 }), policy), null);
    const action = await store.reserve(request(), policy);
    assert.ok(action);
    assert.equal(await store.reserve(request({ user: "other" }), policy), null);
    assert.equal(await store.reserve(request({ user: "other", kind: "player" }), policy), null);
    await store.finish(action, null);
    const player = await store.reserve(request({ kind: "player" }), policy);
    assert.ok(player);
    assert.equal(await store.reserve(request({ user: "other" }), policy), null);
    await store.finish(player, 1);
    assert.equal(await store.reserve(request(), production({ actionConcurrent: 0 })), null);
  });

  test(`${scope} action and autonomous background counts stay separate under the shared global cap`, async () => {
    const { store } = fixture();
    const policy = production({ concurrent: 3, backgroundConcurrent: 1 });
    const action = await store.reserve(request(), policy);
    const background = await store.reserve(request({ user: "background", kind: "plan" }), policy);
    assert.ok(action);
    assert.ok(background, "A separate-lane act must not occupy the autonomous lane");
    assert.equal(await store.reserve(request({ user: "other", kind: "talk" }), policy), null);
    assert.equal(await store.reserve(request({ user: "other" }), policy), null);
    assert.ok(await store.reserve(request({ user: "player", kind: "player" }), policy));
    assert.equal(await store.reserve(request({ user: "fourth", kind: "player" }), policy), null);
  });

  test(`${scope} action requests share the unchanged 24/day, 12/user/day and 3/user/minute totals`, async () => {
    const { store, age } = fixture();
    const policy = production();
    for (const user of ["first", "second"]) {
      for (let group = 0; group < 4; group++) {
        for (let count = 0; count < 3; count++) {
          const lease = await store.reserve(request({ user }), policy);
          assert.ok(lease);
          await store.finish(lease, null); // Unknown attempts retain their full charge.
        }
        assert.equal(await store.reserve(request({ user }), policy), null);
        await age();
      }
      assert.equal(await store.reserve(request({ user }), policy), null);
    }
    assert.equal(await store.reserve(request({ user: "third" }), policy), null);
    assert.equal(await store.reserve(request({ user: "third", kind: "player" }), policy), null);
  });

  test(`${scope} action requests cannot consume interactive call or monetary reserves`, async () => {
    const { store } = fixture();
    const policy = production({
      dailyCalls: 4,
      playerDailyCalls: 4,
      playerMinuteCalls: 4,
      interactiveReserveCalls: 1,
      playerInteractiveReserveCalls: 1,
      playerInteractiveReserveMinuteCalls: 1,
      dailyMicrousd: 100,
      interactiveReserveMicrousd: 20,
    });
    const action = await store.reserve(request({ calls: 3, microusd: 80 }), policy);
    assert.ok(action);
    await store.finish(action, 3);
    assert.equal(await store.reserve(request(), policy), null);
    assert.equal(await store.reserve(request({ user: "other" }), policy), null);
    assert.ok(await store.reserve(request({ kind: "player", microusd: 20 }), policy));
  });

  test(`${scope} absent action option preserves prior explicitly enabled background behavior`, async () => {
    const { store } = fixture();
    const policy = { ...production({ concurrent: 2, backgroundConcurrent: 1 }) };
    delete policy.actionConcurrent;
    const action = await store.reserve(request(), policy);
    assert.ok(action);
    assert.equal(await store.reserve(request({ user: "other", kind: "plan" }), policy), null);
    assert.ok(await store.reserve(request({ user: "other", kind: "player" }), policy));
  });
}
