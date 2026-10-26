import assert from "node:assert/strict";
import { test, before, beforeEach, after } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { defaultConfig, validateConfig, candidatesFor } from "../src/lib/mind-pool/config.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";
import { SqlQuotaStore } from "../src/lib/mind-pool/store.ts";
import { retryAfterMs, validMindJson, decodeCompletion } from "../src/lib/mind-pool/transport.ts";
import { loadPoolConfig, poolAvailable } from "../src/lib/mind-pool/server.ts";

let db;
let store;
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(new URL("../migrations/20261012_mind_pool.sql", import.meta.url), "utf8"),
  );
  store = new SqlQuotaStore({ query: async (sql, params) => (await db.query(sql, params)).rows });
});
beforeEach(async () => {
  await db.exec("truncate mind_pool_attempts, mind_pool_health");
});
after(async () => {
  await db.close();
});

function fixture(ids = ["gemini", "groq"]) {
  const config = defaultConfig();
  config.providers = config.providers.filter((p) => ids.includes(p.id));
  const env = {};
  for (const p of config.providers) {
    p.enabled = true;
    p.freeTierConfirmed = true;
    env[p.apiKeyEnv] = "test-key-never-log";
  }
  return { config, env, store, kind: "plan", system: "Return JSON", user: "Plan a town day" };
}
const candidate = (f, kind = "plan", index = 0) => candidatesFor(f.config, kind, f.env)[index];
const success = (text = '{"plans":[{"id":"kevin","blocks":[]}]}') =>
  Response.json({
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { total_tokens: 40 },
  });
const rows = async () =>
  (await db.query("select * from mind_pool_attempts order by started_at, provider")).rows;

test("pool is opt-in and all catalog providers start disabled", () => {
  const config = defaultConfig();
  validateConfig(config);
  assert.equal(candidatesFor(config, "plan", {}).length, 0);
  assert.ok(config.providers.every((p) => !p.enabled && !p.freeTierConfirmed));
});
test("action deadline overrides are optional, finite and at most thirty seconds", () => {
  const config = defaultConfig();
  assert.equal(validateConfig(config).actionTimeoutMs, undefined);
  assert.equal(validateConfig({ ...config, actionTimeoutMs: 30_000 }).actionTimeoutMs, 30_000);
  for (const actionTimeoutMs of [0, -1, 30_001, 120.5, "30000", NaN, Infinity])
    assert.throws(() => validateConfig({ ...config, actionTimeoutMs }));
});
test("an action body may complete after the legacy deadline without retry or extra tokens", async () => {
  const f = fixture(["gemini"]);
  f.kind = "act";
  f.config.timeoutMs = 25;
  f.config.deadlineMs = 25;
  f.config.actionTimeoutMs = 150;
  f.config.providers[0].routes.act = { ...f.config.providers[0].routes.player, maxTokens: 4000 };
  let calls = 0;
  const result = await routeMind({
    ...f,
    fetcher: async (_url, { signal, body }) => {
      calls++;
      assert.ok(JSON.parse(body).max_tokens <= 1200);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(" "));
            const timer = setTimeout(() => {
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({
                    choices: [
                      {
                        message: { content: '{"task":"discussion","decision":{"kind":"listen"}}' },
                        finish_reason: "stop",
                      },
                    ],
                    usage: { total_tokens: 40 },
                  }),
                ),
              );
              controller.close();
            }, 65);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                controller.error(signal.reason);
              },
              { once: true },
            );
          },
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal((await rows())[0].outcome, "ok");
});
test("action deadline still aborts and settles exactly one attempt", async () => {
  const f = fixture(["gemini"]);
  f.kind = "act";
  f.config.actionTimeoutMs = 100;
  f.config.maxAttempts = 4;
  f.config.providers[0].routes.act = { ...f.config.providers[0].routes.player };
  let calls = 0;
  const keepAlive = setTimeout(() => undefined, 1000);
  try {
    const result = await routeMind({
      ...f,
      fetcher: async (_url, { signal }) => {
        calls++;
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        );
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
    const attempts = await rows();
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, "timeout");
    assert.ok(attempts[0].completed_at !== null);
  } finally {
    clearTimeout(keepAlive);
  }
});
test("quality preference is per service and independent of catalog order", () => {
  const f = fixture();
  f.config.providers.reverse();
  assert.equal(candidate(f, "plan").provider.id, "gemini");
  assert.equal(candidate(f, "reflect").route.model, "gemini-3.8-flash");
  assert.equal(candidate(f, "player").provider.id, "groq");
  assert.equal(candidate(f, "talk").route.model, "openai/gpt-oss-120b");
});
test("missing keys and unconfirmed free tier are ineligible", async () => {
  const f = fixture();
  f.config.providers[0].freeTierConfirmed = false;
  delete f.env.GROQ_API_KEY;
  let calls = 0;
  const result = await routeMind({
    ...f,
    fetcher: async () => {
      calls++;
      return success();
    },
  });
  assert.deepEqual(result, { ok: false, error: "offline" });
  assert.equal(calls, 0);
});
test("recognizable foreign-provider credentials are rejected before transmission", async () => {
  const prefixes = { gemini: "AIza", groq: "gsk_", nvidia: "nvapi-", openrouter: "sk-or-v1-" };
  for (const [owner, prefix] of Object.entries(prefixes)) {
    const key = prefix + "synthetic".repeat(8);
    const own = fixture([owner]);
    own.env[own.config.providers[0].apiKeyEnv] = key;
    assert.equal(candidatesFor(own.config, "plan", own.env).length, 1);
    for (const recipient of ["gemini", "groq", "nvidia", "openrouter", "cohere", "mistral"]) {
      if (recipient === owner) continue;
      const f = fixture([recipient]);
      f.env[f.config.providers[0].apiKeyEnv] = key;
      let calls = 0;
      assert.deepEqual(
        await routeMind({
          ...f,
          fetcher: async () => {
            calls++;
            return success();
          },
        }),
        { ok: false, error: "offline" },
      );
      assert.equal(calls, 0);
    }
    own.config.providers[0].baseUrl = "https://example.com/v1";
    assert.equal(candidatesFor(own.config, "plan", own.env).length, 0);
  }
  assert.equal((await rows()).length, 0);
});
test("strongest available model is repeatedly preferred, without round robin", async () => {
  const f = fixture();
  const calls = [];
  for (let i = 0; i < 2; i++) {
    assert.equal(
      (
        await routeMind({
          ...f,
          fetcher: async (_url, options) => {
            calls.push(JSON.parse(options.body).model);
            return success();
          },
        })
      ).ok,
      true,
    );
  }
  assert.deepEqual(calls, ["gemini-3.8-flash", "gemini-3.8-flash"]);
});
test("429 fails over, and the account cooldown also blocks its other models", async () => {
  const f = fixture();
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return String(url).includes("googleapis")
      ? new Response("{}", { status: 429, headers: { "retry-after": "120" } })
      : success();
  };
  assert.equal((await routeMind({ ...f, fetcher })).ok, true);
  assert.equal((await routeMind({ ...f, fetcher })).ok, true);
  assert.equal(calls.filter((url) => url.includes("googleapis")).length, 1);
  const geminiDialogue = {
    provider: f.config.providers[0],
    route: f.config.providers[0].routes.player,
  };
  assert.equal(await store.reserve(geminiDialogue, "player", 50, 5000), null);
  const attempts = await rows();
  assert.equal(attempts.length, 3);
  assert.equal(attempts.filter((r) => r.outcome === "rate_limit").length, 1);
});
test("invalid JSON, empty replies and wrong envelopes fail over", async () => {
  for (const content of ["", "not json", "[]", '{"reply":"wrong job"}']) {
    await db.exec("truncate mind_pool_attempts, mind_pool_health");
    const f = fixture();
    const result = await routeMind({
      ...f,
      fetcher: async (url) => (String(url).includes("googleapis") ? success(content) : success()),
    });
    assert.equal(result.ok, true);
    assert.equal((await rows()).filter((r) => r.outcome === "invalid").length, 1);
  }
});
test("truncated JSON is rejected even if it happens to parse", async () => {
  const f = fixture();
  const result = await routeMind({
    ...f,
    fetcher: async (url) =>
      String(url).includes("googleapis")
        ? Response.json({
            choices: [{ message: { content: '{"plans":[{}]}' }, finish_reason: "length" }],
          })
        : success(),
  });
  assert.equal(result.ok, true);
  assert.equal((await rows()).filter((r) => r.outcome === "invalid").length, 1);
});
test("network failure releases concurrency and allows the next ranked provider", async () => {
  const f = fixture();
  const result = await routeMind({
    ...f,
    fetcher: async (url) => {
      if (String(url).includes("googleapis")) throw new Error("simulated network error");
      return success();
    },
  });
  assert.equal(result.ok, true);
  assert.ok((await rows()).every((r) => r.completed_at !== null));
});
test("provider timeout aborts the request and fails over", async () => {
  const f = fixture();
  f.config.timeoutMs = 100;
  const keepAlive = setTimeout(() => undefined, 1000);
  try {
    const result = await routeMind({
      ...f,
      fetcher: async (url, options) => {
        if (!String(url).includes("googleapis")) return success();
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          }),
        );
      },
    });
    assert.equal(result.ok, true);
  } finally {
    clearTimeout(keepAlive);
  }
});
for (const phase of ["headers", "body"]) {
  test(`provider timeout during ${phase} is settled as timeout without another call`, async () => {
    const f = fixture(["gemini"]);
    f.config.timeoutMs = 25;
    f.config.maxAttempts = 1;
    let calls = 0;
    const keepAlive = setTimeout(() => undefined, 1000);
    try {
      const result = await routeMind({
        ...f,
        fetcher: async (_url, { signal }) => {
          calls++;
          if (phase === "headers")
            return new Promise((_resolve, reject) =>
              signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
            );
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(" "));
                signal.addEventListener("abort", () => controller.error(signal.reason), {
                  once: true,
                });
              },
            }),
            { status: 200 },
          );
        },
      });
      assert.deepEqual(result, { ok: false, error: "unreachable" });
      assert.equal(calls, 1);
      const attempts = await rows();
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].outcome, "timeout");
      assert.equal(attempts[0].status, phase === "body" ? 200 : null);
      assert.equal(attempts[0].actual_tokens, null);
      assert.ok(attempts[0].completed_at !== null);
    } finally {
      clearTimeout(keepAlive);
    }
  });
}
test("401/403/402 disable the account and never fall back to paid Grok", async () => {
  for (const status of [401, 403, 402]) {
    await db.exec("truncate mind_pool_attempts, mind_pool_health");
    const f = fixture();
    const calls = [];
    f.env.XAI_API_KEY = "paid-key-must-not-be-used";
    const result = await routeMind({
      ...f,
      fetcher: async (url) => {
        calls.push(String(url));
        return String(url).includes("googleapis") ? new Response("{}", { status }) : success();
      },
    });
    assert.equal(result.ok, true);
    assert.ok(calls.every((u) => !u.includes("api.x.ai")));
    assert.equal(await store.reserve(candidate(f), "plan", 20, 5000), null);
  }
});
test("JSON-mode incompatibility retries once, counts both attempts, and is remembered", async () => {
  const f = fixture(["groq"]);
  const formats = [];
  const fetcher = async (_url, options) => {
    const body = JSON.parse(options.body);
    formats.push(Boolean(body.response_format));
    return body.response_format
      ? Response.json(
          { error: { message: "response_format json_object unsupported" } },
          { status: 400 },
        )
      : success();
  };
  assert.equal((await routeMind({ ...f, fetcher })).ok, true);
  assert.equal((await routeMind({ ...f, fetcher })).ok, true);
  assert.deepEqual(formats, [true, false, false]);
  assert.equal((await rows()).length, 3);
});
test("an unrelated 400 doesn't trigger a second call to the same model", async () => {
  const f = fixture();
  f.config.providers[0].routes.player.model = "synthetic-different-dialogue-model";
  const calls = [];
  assert.equal(
    (
      await routeMind({
        ...f,
        fetcher: async (url) => {
          calls.push(String(url));
          return String(url).includes("googleapis")
            ? Response.json({ error: { message: "unknown model" } }, { status: 400 })
            : success();
        },
      })
    ).ok,
    true,
  );
  assert.equal(calls.length, 2);
  assert.equal(await store.reserve(candidate(f), "plan", 20, 5000), null);
  // A bad planning model doesn't disable the same provider's dialogue model.
  const p = f.config.providers[0];
  assert.ok(await store.reserve({ provider: p, route: p.routes.player }, "player", 20, 5000));
});
test("provider redirects are not followed or accepted as completions", async () => {
  const f = fixture(["groq"]);
  let calls = 0;
  const result = await routeMind({
    ...f,
    fetcher: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, "manual");
      return new Response(null, {
        status: 307,
        headers: { location: "https://unexpected.invalid/completions" },
      });
    },
  });
  assert.deepEqual(result, { ok: false, error: "unreachable" });
  assert.equal(calls, 1);
  const attempts = await rows();
  assert.equal(attempts[0].status, 307);
  assert.equal(attempts[0].outcome, "unreachable");
});
test("attempt and deadline ceilings prevent a retry storm", async () => {
  const f = fixture(["gemini", "groq", "nvidia", "cohere"]);
  f.config.maxAttempts = 2;
  let calls = 0;
  const result = await routeMind({
    ...f,
    fetcher: async () => {
      calls++;
      return new Response("{}", { status: 503 });
    },
  });
  assert.deepEqual(result, { ok: false, error: "unreachable" });
  assert.equal(calls, 2);
  await db.exec("truncate mind_pool_attempts, mind_pool_health");
  let clock = 0;
  calls = 0;
  await routeMind({
    ...f,
    now: () => clock,
    fetcher: async () => {
      calls++;
      clock = f.config.deadlineMs + 1;
      return new Response("{}", { status: 503 });
    },
  });
  assert.equal(calls, 1);
});
test("shared SQL reservations serialize simultaneous requests", async () => {
  const f = fixture(["groq"]);
  f.config.providers[0].limits.concurrent = 3;
  const reservations = await Promise.all(
    Array.from({ length: 30 }, () => store.reserve(candidate(f), "plan", 20, 5000)),
  );
  assert.equal(reservations.filter(Boolean).length, 3);
  assert.equal((await rows()).length, 3);
});
test("concurrency lease expires after a crashed worker without refunding usage", async () => {
  const f = fixture(["gemini"]);
  assert.ok(await store.reserve(candidate(f), "plan", 20, 5000));
  assert.equal(await store.reserve(candidate(f), "plan", 20, 5000), null);
  await db.exec("update mind_pool_attempts set expires_at = 0");
  assert.ok(await store.reserve(candidate(f), "plan", 20, 5000));
  assert.equal((await rows()).length, 2);
});
test("request and token caps include failed attempts and all account models", async () => {
  for (const [field, cap, tokens] of [
    ["rpm", 1, 20],
    ["rpd", 1, 20],
    ["monthly", 1, 20],
    ["tpm", 30, 20],
    ["tpd", 30, 20],
  ]) {
    await db.exec("truncate mind_pool_attempts, mind_pool_health");
    const f = fixture(["gemini"]);
    f.config.providers[0].limits[field] = cap;
    const c = candidate(f);
    const lease = await store.reserve(c, "plan", tokens, 5000);
    assert.ok(lease);
    await store.finish(c, lease, {
      outcome: "unreachable",
      status: null,
      latencyMs: 1,
      actualTokens: null,
    });
    const p = c.provider;
    assert.equal(
      await store.reserve({ provider: p, route: p.routes.player }, "player", tokens, 5000),
      null,
      field,
    );
  }
});
test("minute quotas use a rolling window across clock-minute boundaries", async () => {
  const f = fixture(["groq"]);
  f.config.providers[0].limits.rpm = 1;
  const c = candidate(f);
  const lease = await store.reserve(c, "plan", 20, 5000);
  await store.finish(c, lease, { outcome: "ok", status: 200, latencyMs: 1, actualTokens: 5 });
  await db.exec(
    "update mind_pool_attempts set started_at = floor(extract(epoch from clock_timestamp()) * 1000) - 59000",
  );
  assert.equal(await store.reserve(c, "plan", 20, 5000), null);
  await db.exec(
    "update mind_pool_attempts set started_at = floor(extract(epoch from clock_timestamp()) * 1000) - 61000",
  );
  assert.ok(await store.reserve(c, "plan", 20, 5000));
});
test("completion is idempotent and a late success cannot clear an account cooldown", async () => {
  const f = fixture(["groq"]);
  const c = candidate(f);
  const a = await store.reserve(c, "plan", 20, 5000);
  const b = await store.reserve(c, "plan", 20, 5000);
  await store.finish(c, a, {
    outcome: "rate_limit",
    status: 429,
    latencyMs: 2,
    actualTokens: null,
    accountCooldownMs: 60_000,
  });
  await store.finish(c, b, { outcome: "ok", status: 200, latencyMs: 3, actualTokens: 10 });
  await store.finish(c, a, { outcome: "ok", status: 200, latencyMs: 3, actualTokens: 10 });
  assert.equal(await store.reserve(c, "plan", 20, 5000), null);
  assert.equal((await rows()).filter((r) => r.outcome === "rate_limit").length, 1);
});
test("actual token overruns tighten the next reservation instead of undercounting", async () => {
  const f = fixture(["groq"]);
  f.config.providers[0].limits.tpm = 100;
  const c = candidate(f);
  const lease = await store.reserve(c, "plan", 20, 5000);
  await store.finish(c, lease, { outcome: "ok", status: 200, latencyMs: 1, actualTokens: 90 });
  assert.equal(await store.reserve(c, "plan", 20, 5000), null);
});
test("ledger outage fails closed before making any provider call", async () => {
  const f = fixture();
  let calls = 0;
  const result = await routeMind({
    ...f,
    store: {
      reserve: async () => {
        throw new Error("db down");
      },
      finish: async () => {},
    },
    fetcher: async () => {
      calls++;
      return success();
    },
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});
test("Cohere v2 adapter uses its endpoint, content blocks and usage shape", async () => {
  const f = fixture(["cohere"]);
  f.kind = "player";
  const result = await routeMind({
    ...f,
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.cohere.com/v2/chat");
      assert.equal(JSON.parse(options.body).response_format.type, "json_object");
      return Response.json({
        message: { content: [{ type: "text", text: '{"reply":"Morning, neighbor."}' }] },
        finish_reason: "COMPLETE",
        usage: { tokens: { input_tokens: 10, output_tokens: 20 } },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal((await rows())[0].actual_tokens, 30);
});
test("oversize responses fail over without persisting body text or secrets", async () => {
  const f = fixture();
  const result = await routeMind({
    ...f,
    fetcher: async (url) =>
      String(url).includes("googleapis") ? new Response("x".repeat(256_001)) : success(),
  });
  assert.equal(result.ok, true);
  const ledger = JSON.stringify(await rows());
  assert.ok(!ledger.includes(f.user) && !ledger.includes(f.env.GEMINI_API_KEY));
});
test("Retry-After supports seconds and HTTP dates without shortening long waits", () => {
  assert.equal(retryAfterMs("120", 0), 120_000);
  assert.equal(
    retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT", Date.parse("2026-10-21T07:27:00Z")),
    60_000,
  );
  assert.equal(retryAfterMs("86400", 0), 86_400_000);
  assert.equal(retryAfterMs("bad", 0), 60_000);
});
test("config rejects paid OpenRouter models, embedded credentials and zero quotas", () => {
  for (const mutate of [
    (c) => {
      c.providers.find((p) => p.id === "openrouter").routes.plan.model = "paid/model";
    },
    (c) => {
      c.providers[0].baseUrl = "https://secret@example.com/v1";
    },
    (c) => {
      c.providers[0].limits.rpm = 0;
    },
    (c) => {
      c.providers[0].baseUrl = "https://api.x.ai/v1";
    },
    (c) => {
      c.providers[0].apiKeyEnv = "";
    },
    (c) => {
      c.providers[0].apiKeyEnv = "VITE_EXPOSED_KEY";
    },
    (c) => {
      c.providers[0].routes.plan.reasoningEffort = ["low"];
    },
    (c) => {
      c.providers[0].routes.plan.reasoningEffort = "unsupported";
    },
    (c) => {
      c.providers.find((p) => p.id === "cohere").routes.plan.reasoningEffort = "low";
    },
  ]) {
    const config = defaultConfig();
    mutate(config);
    assert.throws(() => validateConfig(config));
  }
});
test("missing explicit config fails closed; deployment without shared DB is offline", async () => {
  await assert.rejects(
    loadPoolConfig({ MIND_POOL_CONFIG_FILE: "/path-that-does-not-exist/pool.json" }),
  );
  const prev = {
    GROK_PROJECT_ID: process.env.GROK_PROJECT_ID,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  process.env.GROK_PROJECT_ID = "synthetic-deployment";
  delete process.env.DATABASE_URL;
  try {
    assert.equal(await poolAvailable(), false);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
test("game envelopes and OpenAI content blocks are accepted", () => {
  assert.ok(validMindJson("player", '```json\n{"reply":"Hi"}\n```'));
  assert.ok(validMindJson("reflect", '{"agents":[{"id":"baba","reflections":["Morning."]}]}'));
  assert.ok(validMindJson("talk", '{"lines":[{"speaker":"baba","text":"Morning."}]}'));
  assert.equal(
    decodeCompletion(
      { choices: [{ message: { content: [{ text: "abc" }, { text: "def" }] } }] },
      "openai",
    ).text,
    "abcdef",
  );
});
