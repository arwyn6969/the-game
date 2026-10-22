import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";
import { MIND_SYSTEM } from "../src/lib/mind.gateway.ts";
import { validateConfig } from "../src/lib/mind-pool/config.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";
import { SqlQuotaStore } from "../src/lib/mind-pool/store.ts";
import { DEFAULT_BUDGET, validateBudgetPolicy } from "../src/lib/mind-budget/policy.ts";
import { SqlMindBudgetStore } from "../src/lib/mind-budget/store.ts";
import { runBudgetedMind } from "../src/lib/mind-budget/runner.ts";

// Explicit operator qualification, never a hosted-player authentication substitute.
// Only a new synthetic town and a new local ledger are used. No production URL,
// config, ledger or town is read. Only the existing OpenRouter key is extracted.
const MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const BASE = "https://openrouter.ai/api/v1";
const MAX_CALLS = 8;
const args = process.argv.slice(2);
assert.ok(args.length === 1 && ["--preflight", "--run"].includes(args[0]));
const envFile = process.env.MANUSCRIPT_TRIAL_ENV_FILE;
const key = (
  process.env.OPENROUTER_API_KEY ||
  (envFile ? parseEnv(await readFile(envFile, "utf8")).OPENROUTER_API_KEY : "")
)?.trim();
assert.ok(key?.startsWith("sk-or-v1-"), "Existing OpenRouter key required");
async function account() {
  const response = await fetch(`${BASE}/key`, {
    headers: { Authorization: `Bearer ${key}` },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  assert.equal(response.status, 200, "Read-only account preflight failed");
  const { data } = await response.json();
  const quota = data.free_model_daily_requests;
  assert.ok(
    quota && Number.isSafeInteger(quota.used) && Number.isSafeInteger(quota.remaining),
    "Provider must report actual free-request headroom",
  );
  return {
    at: new Date().toISOString(),
    freeTier: data.is_free_tier,
    freeRequests: quota,
    monetaryUsageToday: data.usage_daily ?? null,
  };
}
const beforeAccount = await account();
const modelsResponse = await fetch(`${BASE}/models`, {
  redirect: "error",
  signal: AbortSignal.timeout(12_000),
});
assert.equal(modelsResponse.status, 200);
const model = (await modelsResponse.json()).data.find((value) => value.id === MODEL);
assert.ok(model, "Exact free model unavailable");
assert.equal(model.pricing.prompt, "0");
assert.equal(model.pricing.completion, "0");
assert.ok(model.pricing.request === undefined || Number(model.pricing.request) === 0);
const preflight = { ...beforeAccount, model: MODEL, pricing: model.pricing };
if (args[0] === "--preflight") {
  console.log(JSON.stringify(preflight));
  process.exit(0);
}
assert.ok(beforeAccount.freeRequests.remaining >= MAX_CALLS, "Insufficient free headroom");
assert.ok(beforeAccount.freeRequests.used + MAX_CALLS <= 24, "Preserve the saved 24/day ceiling");
const out = resolve(
  process.env.MANUSCRIPT_TRIAL_OUT || `artifacts/manuscript-real-ai/${Date.now()}`,
);
await mkdir(dirname(out), { recursive: true });
await mkdir(out, { recursive: false }); // Never resume/reset an old trial's allowance.
const report = {
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(),
  scope: "operator headless real-model/engine trial; local SQL budget and quota ledger",
  model: MODEL,
  maxCalls: MAX_CALLS,
  preflight,
  decisions: [],
  movement: [],
  suppressedOtherJobs: {},
  transmissions: 0,
  simulationMinutes: 0,
  stopReason: null,
};
const config = validateConfig({
  version: 1,
  timeoutMs: 12_000,
  deadlineMs: 12_000,
  maxAttempts: 1,
  providers: [
    {
      id: "openrouter",
      enabled: true,
      freeTierConfirmed: true,
      baseUrl: BASE,
      apiKeyEnv: "OPENROUTER_API_KEY",
      protocol: "openai",
      jsonMode: false,
      limits: { rpm: 2, rpd: 24, monthly: 744, tpm: 20_000, tpd: 100_000, concurrent: 1 },
      routes: Object.fromEntries(
        ["plan", "reflect", "talk", "player", "act"].map((kind) => [
          kind,
          { model: MODEL, maxTokens: 1200, rank: 1, reasoningEffort: "none" },
        ]),
      ),
    },
  ],
});
const policy = validateBudgetPolicy({
  ...DEFAULT_BUDGET,
  dailyCalls: MAX_CALLS,
  playerDailyCalls: MAX_CALLS,
  playerMinuteCalls: 2,
  playerInteractiveReserveCalls: 0,
  playerInteractiveReserveMinuteCalls: 0,
  concurrent: 2,
  backgroundConcurrent: 1,
  interactiveReserveCalls: 0,
  dailyMicrousd: 0,
  interactiveReserveMicrousd: 0,
  inputNanousdPerToken: 0,
  outputNanousdPerToken: 0,
});
const db = new PGlite({ dataDir: resolve(out, "ledger"), parsers: { 20: Number } });
for (const name of [
  "20261012_mind_pool.sql",
  "20261013_mind_budget.sql",
  "20261022_mind_actions.sql",
])
  await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
const sql = { query: async (query, params) => (await db.query(query, params)).rows };
const quotaStore = new SqlQuotaStore(sql);
const budgetStore = new SqlMindBudgetStore(sql);
const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const { buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts");
const physical = await server.ssrLoadModule("/src/game/physical-items.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
let town = parseTownFile(exportTown(createTown("Observer")));
physical.initializePhysicalItems(town);
town.agents.find((person) => person.id === "northern").tile = { x: 39, y: 20 };
town.agents.find((person) => person.id === "player").tile = { x: 40, y: 22 };
assert.equal(physical.startPhysicalSession(town, "northern", MAX_CALLS).ok, true);
const startFinance = JSON.stringify({
  money: town.agents.map(({ id, money }) => ({ id, money })),
  tills: town.tills,
  favors: town.favors,
  economy: town.economy,
});
report.setup = {
  northern: { ...physical.physicalObservation(town, "northern").actor },
  knowledge: "Original current character/profile/goals; no supplied story or manuscript text",
  observer: town.agents.find((person) => person.id === "player").tile,
  item: structuredClone(town.physicalItems.items[0]),
};
await writeFile(resolve(out, "initial-town.json"), exportTown(town));
let previousTransmission = 0;
const checkpoint = () => writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2));
try {
  while (physical.nextPhysicalJob(town)) {
    const remainingWait = previousTransmission + 31_000 - Date.now();
    if (remainingWait > 0) {
      console.log(JSON.stringify({ pacingMs: remainingWait }));
      await new Promise((done) => setTimeout(done, remainingWait));
    }
    const currentAccount = await account();
    assert.ok(currentAccount.freeRequests.used < 24 && currentAccount.freeRequests.remaining > 0);
    const job = physical.nextPhysicalJob(town);
    assert.ok(job && physical.markPhysicalRequest(town, job));
    const prompt = buildPrompt(town, job);
    const row = {
      number: report.decisions.length + 1,
      at: new Date().toISOString(),
      gameTime: { day: town.day, minute: town.minute },
      observation: physical.physicalObservation(town, "northern"),
      promptCharacters: prompt.length,
      promptSha256: createHash("sha256").update(prompt).digest("hex"),
      attempts: [],
      transmissions: 0,
      reportedCostUSD: null,
    };
    report.decisions.push(row);
    await writeFile(resolve(out, `prompt-${row.number}.txt`), prompt);
    const started = performance.now();
    const result = await runBudgetedMind({
      kind: "act",
      userHash: createHash("sha256").update(`operator-qualification:${out}`).digest("hex"),
      system: MIND_SYSTEM,
      user: prompt,
      maxAttempts: 1,
      maxOutputTokens: 1200,
      leaseMs: 30_000,
      policy,
      store: budgetStore,
      scope: "shared", // Same SQL budget algorithm; this ledger is local, not production.
      run: async () => {
        const routed = await routeMind({
          kind: "act",
          system: MIND_SYSTEM,
          user: prompt,
          config,
          store: quotaStore,
          env: { OPENROUTER_API_KEY: key },
          fetcher: async (url, init) => {
            assert.equal(url, `${BASE}/chat/completions`);
            assert.equal(init.method, "POST");
            const body = JSON.parse(init.body);
            assert.equal(body.model, MODEL);
            assert.equal(body.max_tokens, 1200);
            assert.deepEqual(body.reasoning, { enabled: false });
            assert.ok(!body.response_format && !body.tools);
            assert.ok(report.transmissions < MAX_CALLS && row.attempts.length === 0);
            report.transmissions++;
            row.transmissions++;
            previousTransmission = Date.now();
            await checkpoint();
            const response = await fetch(url, init);
            if (response.ok) {
              try {
                const usage = (await response.clone().json()).usage;
                if (typeof usage?.cost === "number") row.reportedCostUSD = usage.cost;
              } catch {
                // Absent cost is unknown, never inferred from token estimates.
              }
            }
            return response;
          },
          onAttempt: (provider, model, completion) =>
            row.attempts.push({ provider, model, ...completion }),
        });
        return { ...routed, diagnostics: { attempts: row.transmissions } };
      },
    });
    row.elapsedMs = Math.round(performance.now() - started);
    row.ok = result.ok;
    const parsed = result.ok ? parseMind(job, result.text) : null;
    const completion = row.attempts[0];
    physical.recordPhysicalUsage(town, job, {
      elapsedMs: row.elapsedMs,
      attempts: row.transmissions,
      totalTokens: completion?.actualTokens ?? null,
      success: Boolean(parsed),
    });
    if (result.ok) row.rawDecisionJSON = result.text;
    if (!parsed || parsed.kind !== "act") {
      row.error = result.error ?? "invalid decision";
      physical.pausePhysicalSession(
        town,
        "Real AI unavailable or invalid; trial stopped without fallback.",
      );
      report.stopReason = row.error;
    } else {
      row.decision = parsed.decision;
      row.result = physical.applyPhysicalCommand(town, parsed.agentId, parsed.decision);
      if (!row.result.ok) {
        physical.pausePhysicalSession(town, row.result.message);
        report.stopReason = row.result.message;
      }
    }
    if (row.reportedCostUSD !== null && row.reportedCostUSD !== 0) {
      report.stopReason = "Unexpected nonzero provider cost; trial stopped.";
      physical.pausePhysicalSession(town, report.stopReason);
    }
    console.log(
      JSON.stringify({
        decision: row.number,
        chosen: row.decision,
        result: row.result,
        elapsedMs: row.elapsedMs,
        tokens: completion?.actualTokens ?? null,
        error: row.error,
      }),
    );
    while (town.physicalItems.session.intent) {
      const other = stepMinute(town, true);
      if (other)
        report.suppressedOtherJobs[other.kind] = (report.suppressedOtherJobs[other.kind] ?? 0) + 1;
      report.simulationMinutes++;
      report.movement.push({
        day: town.day,
        minute: town.minute,
        actor: { ...town.agents.find((person) => person.id === "northern").tile },
        location: structuredClone(town.physicalItems.items[0].location),
      });
    }
    if (town.physicalItems.session.lastResult?.ok === false) {
      report.stopReason = town.physicalItems.session.lastResult.message;
      physical.pausePhysicalSession(town, report.stopReason);
    }
    if (town.physicalItems.session.waiting)
      report.stopReason = `Northern chose ${row.decision?.kind}; the trial parks here without restarting.`;
    await writeFile(resolve(out, "current-town.json"), exportTown(town));
    await checkpoint();
    if (report.stopReason) break;
  }
  report.stopReason ??= "Eight-decision allowance exhausted.";
} catch {
  report.stopReason = "Qualification guard or network/ledger failure; no retry or fallback.";
  physical.pausePhysicalSession(town, report.stopReason);
} finally {
  report.finishedAt = new Date().toISOString();
  report.wallTimeMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  report.aiWaitMs = report.decisions.reduce((sum, row) => sum + (row.elapsedMs ?? 0), 0);
  report.finalItem = structuredClone(town.physicalItems.items[0]);
  report.session = structuredClone(town.physicalItems.session);
  report.financeUnchanged =
    startFinance ===
    JSON.stringify({
      money: town.agents.map(({ id, money }) => ({ id, money })),
      tills: town.tills,
      favors: town.favors,
      economy: town.economy,
    });
  report.cashUnchanged =
    JSON.stringify({
      money: JSON.parse(startFinance).money,
      tills: JSON.parse(startFinance).tills,
    }) ===
    JSON.stringify({
      money: town.agents.map(({ id, money }) => ({ id, money })),
      tills: town.tills,
    });
  report.clockScope =
    "Game time advances only during physical travel; wall-clock pacing is not simulated game time.";
  report.saveRoundTrip =
    JSON.stringify(parseTownFile(exportTown(town)).physicalItems) ===
    JSON.stringify(town.physicalItems);
  report.ledger = {
    budget: await sql.query(
      "select kind, charged_calls, charged_microusd, completed_at is not null as settled from mind_budget_attempts",
    ),
    pool: await sql.query(
      "select kind, actual_tokens, outcome, status, latency_ms, completed_at is not null as settled from mind_pool_attempts",
    ),
  };
  try {
    report.afterAccount = await account();
  } catch {
    report.afterAccount = null;
  }
  await writeFile(resolve(out, "final-town.json"), exportTown(town));
  await checkpoint();
  console.log(
    JSON.stringify({
      out,
      transmissions: report.transmissions,
      stopReason: report.stopReason,
      usage: report.session.usage,
    }),
  );
  await server.close();
  await db.close();
}
