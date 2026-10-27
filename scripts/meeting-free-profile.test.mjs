import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { meetingFreeProfile, meetingFreeBindings } from "./meeting-free-profile.mjs";
import { SqlMindBudgetStore } from "../src/lib/mind-budget/store.ts";
import { SqlQuotaStore } from "../src/lib/mind-pool/store.ts";
import { candidatesFor } from "../src/lib/mind-pool/config.ts";

test("one player can use the shared free meeting allowance without paid or background routes", async () => {
  const { pool, budget } = await meetingFreeProfile();
  assert.equal(pool.providers.length, 1);
  const p = pool.providers[0];
  assert.equal(p.baseUrl, "https://openrouter.ai/api/v1");
  assert.ok(p.enabled && p.freeTierConfirmed);
  for (const r of Object.values(p.routes))
    assert.equal(r.model, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(p.routes.act.maxTokens, 1200);
  assert.equal(pool.maxAttempts, 1);
  assert.equal(p.limits.rpm, 2);
  assert.equal(p.limits.rpd, 48);
  assert.ok(p.limits.rpd < 50);
  assert.equal(p.limits.monthly, 48 * 31);
  assert.equal(p.limits.tpm, 2 * 20_000);
  assert.equal(p.limits.tpd, 48 * 20_000);
  assert.equal(budget.playerDailyCalls, budget.dailyCalls);
  assert.equal(budget.dailyCalls, p.limits.rpd);
  assert.equal(budget.concurrent, 1);
  assert.equal(budget.actionConcurrent, 1);
  assert.equal(budget.backgroundConcurrent, 0);
  assert.equal(budget.dailyMicrousd, 0);
  assert.equal(budget.inputNanousdPerToken, 0);
  assert.equal(budget.outputNanousdPerToken, 0);
  assert.deepEqual(Object.keys(await meetingFreeBindings()).sort(), [
    "MIND_BUDGET_CONFIG",
    "MIND_POOL_CONFIG",
  ]);
});

test("shared SQL retains previous charges and admits every remaining meeting decision, then blocks", async () => {
  const { pool, budget } = await meetingFreeProfile();
  const db = new PGlite({ parsers: { 20: Number } });
  try {
    for (const name of [
      "20261012_mind_pool.sql",
      "20261013_mind_budget.sql",
      "20261022_mind_actions.sql",
      "20261023_manual_action_budget.sql",
    ])
      await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    const sql = { query: async (text, params) => (await db.query(text, params)).rows };
    const b = new SqlMindBudgetStore(sql),
      q = new SqlQuotaStore(sql);
    const c = candidatesFor(pool, "act", { OPENROUTER_API_KEY: "sk-or-v1-fixture" })[0];
    const request = {
      user: "same-verified-user",
      kind: "act",
      calls: 1,
      microusd: 0,
      leaseMs: 90000,
    };
    for (let i = 0; i < 47; i++) {
      // Simulated elapsed pacing applies only to this synthetic in-memory ledger.
      await db.exec(
        "update mind_budget_attempts set started_at = started_at - 31000; update mind_pool_attempts set started_at = started_at - 31000",
      );
      const lease = await b.reserve(request, budget);
      assert.ok(lease, `decision ${i + 1}`);
      const attempt = await q.reserve(c, "act", 20_000, 40_000);
      assert.ok(attempt, `token reservation ${i + 1}`);
      assert.equal(
        await b.reserve({ ...request, user: "other-user" }, budget),
        null,
        "global concurrency remains one",
      );
      await q.finish(c, attempt, { outcome: "ok", status: 200, latencyMs: 1, actualTokens: 2000 });
      await b.finish(lease, 1);
    }
    await db.exec(
      "update mind_budget_attempts set started_at = started_at - 61000; update mind_pool_attempts set started_at = started_at - 61000",
    );
    assert.equal(
      await b.reserve(request, budget),
      null,
      "actions preserve the one direct-reply reserve",
    );
    const reply = await b.reserve({ ...request, kind: "player" }, budget);
    assert.ok(reply);
    const foreground = candidatesFor(pool, "player", { OPENROUTER_API_KEY: "sk-or-v1-fixture" })[0];
    const last = await q.reserve(foreground, "player", 20_000, 40_000);
    assert.ok(last);
    await q.finish(foreground, last, {
      outcome: "ok",
      status: 200,
      latencyMs: 1,
      actualTokens: 2000,
    });
    await b.finish(reply, 1);
    assert.equal(
      await b.reserve({ ...request, kind: "player" }, budget),
      null,
      "the shared forty-eight-call ceiling remains hard",
    );
    const rows = await sql.query(
      "select count(*)::int as n, sum(charged_calls)::int as calls, bool_and(completed_at is not null) as settled from mind_budget_attempts",
    );
    assert.deepEqual(rows[0], { n: 48, calls: 48, settled: true });
    const tokens = await sql.query(
      "select sum(reserved_tokens)::int as reserved from mind_pool_attempts",
    );
    assert.equal(tokens[0].reserved, 960_000);
  } finally {
    await db.close();
  }
});
