import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parsePhysicalDecision } from "../src/lib/mind-actions.ts";
import { validateMindRequest, requestMind } from "../src/lib/mind.gateway.ts";
import { defaultConfig, validateConfig, candidatesFor } from "../src/lib/mind-pool/config.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";
import { validMindJson } from "../src/lib/mind-pool/transport.ts";
import { poolAvailable } from "../src/lib/mind-pool/server.ts";
import { DEFAULT_BUDGET, validReservation } from "../src/lib/mind-budget/policy.ts";
import { SqlMindBudgetStore, EphemeralMindBudgetStore } from "../src/lib/mind-budget/store.ts";

let db;
let sqlStore;
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(new URL("../migrations/20261013_mind_budget.sql", import.meta.url), "utf8"),
  );
  // Establish a pre-existing charged row before the forward migration.
  await db.query(
    "insert into mind_budget_attempts values ('existing','owner','player',1,2,2,1,1,0,0)",
  );
  await db.exec(
    await readFile(new URL("../migrations/20261022_mind_actions.sql", import.meta.url), "utf8"),
  );
  assert.equal(
    (await db.query("select charged_calls from mind_budget_attempts where id='existing'")).rows[0]
      .charged_calls,
    1,
  );
  sqlStore = new SqlMindBudgetStore({
    query: async (sql, params) => (await db.query(sql, params)).rows,
  });
});
beforeEach(async () => {
  await db.exec("truncate mind_budget_attempts");
});
after(async () => {
  await db.close();
});

const item = { itemId: "manuscript:town:1", itemRevision: 1 };
const decisions = [
  { kind: "bring", ...item, destination: "park" },
  ...["pick-up", "put-down", "read"].map((kind) => ({ kind, ...item })),
  { kind: "write", ...item, title: "A new page", text: "A short original piece." },
  { kind: "speak", text: "I would like to read this." },
  { kind: "wait" },
];
const fixture = () => {
  const config = defaultConfig();
  config.providers = config.providers.filter((p) => ["gemini", "groq"].includes(p.id));
  const env = {};
  for (const provider of config.providers) {
    provider.enabled = provider.freeTierConfirmed = true;
    provider.routes.act = { ...provider.routes.player };
    env[provider.apiKeyEnv] = "synthetic-action-test-key";
  }
  const completions = [];
  return {
    kind: "act",
    config,
    env,
    system: "One decision",
    user: "Actual observation",
    store: {
      reserve: async () => ({ id: "lease", jsonMode: true }),
      finish: async (_c, _l, completion) => completions.push(completion),
    },
    completions,
  };
};

test("physical decision syntax accepts one bounded command and rejects extra authority", () => {
  for (const decision of decisions) {
    assert.deepEqual(parsePhysicalDecision(decision), decision);
    assert.equal(validMindJson("act", JSON.stringify({ decision })), true);
    assert.equal(parsePhysicalDecision({ ...decision, actor: "player" }), null);
    assert.equal(validMindJson("act", JSON.stringify({ decision, agentId: "player" })), false);
  }
  for (const decision of [
    { kind: "pay", ...item },
    { kind: "wait", action: "write" },
    { kind: "read", itemId: item.itemId, itemRevision: "1" },
    { kind: "read", ...item, itemRevision: -1 },
    { kind: "read", ...item, itemRevision: 1.5 },
    { kind: "read", ...item, itemId: " " },
    { kind: "bring", ...item, destination: "outside-world" },
    { kind: "write", ...item, title: "x".repeat(81), text: "ok" },
    { kind: "write", ...item, title: "ok", text: "x".repeat(1201) },
    { kind: "speak", text: "x".repeat(401) },
  ]) {
    assert.equal(parsePhysicalDecision(decision), null);
    assert.equal(validMindJson("act", JSON.stringify({ decision })), false);
  }
  for (const content of ['{"reply":"hello"}', '{"decision":[]}', '{"decision":{}}'])
    assert.equal(validMindJson("act", content), false);
});

test("legacy route configurations remain valid and cannot silently supply action inference", () => {
  const config = defaultConfig();
  validateConfig(config);
  assert.ok(config.providers.every((provider) => !Object.hasOwn(provider.routes, "act")));
  const f = fixture();
  for (const provider of f.config.providers) delete provider.routes.act;
  validateConfig(f.config);
  assert.equal(candidatesFor(f.config, "player", f.env).length, 2);
  assert.equal(candidatesFor(f.config, "act", f.env).length, 0);
  const bounded = fixture();
  bounded.config.providers[0].routes.act.maxTokens = 16000;
  assert.equal(candidatesFor(bounded.config, "act", bounded.env)[0].route.maxTokens, 1200);
  assert.equal(bounded.config.providers[0].routes.act.maxTokens, 16000);
  const invalid = fixture();
  invalid.config.providers[0].routes.act = null;
  assert.throws(() => validateConfig(invalid.config), /route/);
});

test("availability reports the optional action capability without breaking four-route availability", async () => {
  const f = fixture();
  const previous = Object.fromEntries(Object.keys(f.env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, f.env);
  try {
    for (const provider of f.config.providers) delete provider.routes.act;
    assert.equal(await poolAvailable(f.config), true);
    assert.equal(await poolAvailable(f.config, "act"), false);
    f.config.providers[0].routes.act = { ...f.config.providers[0].routes.player };
    assert.equal(await poolAvailable(f.config, "act"), true);
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});

test("act requests never use legacy inference or retry/fail over after one transmitted attempt", async () => {
  assert.equal(validateMindRequest({ kind: "act", user: "observation" }).kind, "act");
  let legacyCalls = 0;
  const legacy = await requestMind(
    { kind: "act", user: "observation" },
    {
      apiKey: "synthetic-never-transmit",
      fetcher: async () => {
        legacyCalls++;
        throw new Error("must not send");
      },
    },
  );
  assert.equal(legacy.ok, false);
  assert.equal(legacyCalls, 0);
  for (const failure of ["format", "429", "invalid"]) {
    const f = fixture();
    let calls = 0;
    const result = await routeMind({
      ...f,
      fetcher: async () => {
        calls++;
        if (failure === "format")
          return Response.json(
            { error: { message: "response_format unsupported" } },
            { status: 400 },
          );
        if (failure === "429") return new Response("{}", { status: 429 });
        return Response.json({
          choices: [{ message: { content: '{"decision":{"kind":"pay"}}' }, finish_reason: "stop" }],
        });
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
    assert.equal(f.completions.length, 1);
  }
  const f = fixture();
  const result = await routeMind({
    ...f,
    fetcher: async (_url, options) => {
      assert.ok(JSON.parse(options.body).max_tokens <= 1200);
      return Response.json({
        choices: [{ message: { content: '{"decision":{"kind":"wait"}}' }, finish_reason: "stop" }],
        usage: { total_tokens: 25 },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(f.completions[0].actualTokens, 25);
});

test("forward migration preserves shared background limits and never grants act interactive capacity", async () => {
  const policy = {
    ...DEFAULT_BUDGET,
    dailyCalls: 10,
    playerDailyCalls: 8,
    playerMinuteCalls: 6,
    playerInteractiveReserveCalls: 2,
    playerInteractiveReserveMinuteCalls: 2,
    concurrent: 2,
    backgroundConcurrent: 0,
    interactiveReserveCalls: 2,
    dailyMicrousd: 0,
    interactiveReserveMicrousd: 0,
    inputNanousdPerToken: 0,
    outputNanousdPerToken: 0,
  };
  const request = { user: "verified-hash", kind: "act", calls: 1, microusd: 0, leaseMs: 10000 };
  assert.equal(validReservation(request), true);
  for (const store of [sqlStore, new EphemeralMindBudgetStore()]) {
    assert.equal(await store.reserve(request, policy), null);
    assert.ok(await store.reserve({ ...request, kind: "player" }, policy));
  }
  const enabled = { ...policy, backgroundConcurrent: 1 };
  const lease = await sqlStore.reserve(request, enabled);
  assert.ok(lease);
  assert.equal(await sqlStore.reserve({ ...request, user: "other" }, enabled), null);
  await sqlStore.finish(lease, 1);
  assert.equal(
    (await db.query("select kind, charged_calls from mind_budget_attempts where kind='act'"))
      .rows[0].charged_calls,
    1,
  );
});
