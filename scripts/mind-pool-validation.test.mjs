import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { defaultConfig, validateConfig, candidatesFor } from "../src/lib/mind-pool/config.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";
import {
  decodeCompletion,
  mindJsonFailure,
  requestBody,
  validMindJson,
} from "../src/lib/mind-pool/transport.ts";
import { MIND_SYSTEM } from "../src/lib/mind.gateway.ts";

// This suite cannot contact a provider accidentally. Every router request gets
// its own explicit mock; the game modules load without the application's config.
const originalFetch = globalThis.fetch;
let unexpectedOutboundRequests = 0;
globalThis.fetch = async () => {
  unexpectedOutboundRequests++;
  throw new Error("Live fetch is forbidden in validation regressions");
};
let server;
let createTown, buildPrompt, parseMind, applyResult;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  ({ createTown } = await server.ssrLoadModule("/src/game/town.ts"));
  ({ buildPrompt, parseMind } = await server.ssrLoadModule("/src/game/prompt.ts"));
  ({ applyResult } = await server.ssrLoadModule("/src/game/effects.ts"));
});
after(async () => {
  await server?.close();
  globalThis.fetch = originalFetch;
  assert.equal(unexpectedOutboundRequests, 0);
});

const reply = JSON.stringify({
  reply: "Morning, neighbor. Good to see you here.",
  delta: 0,
  note: "",
  favor: null,
  thread: null,
  notice: null,
  project: null,
});
function fixture() {
  const config = defaultConfig();
  config.providers = config.providers.filter((provider) => provider.id === "openrouter");
  const provider = config.providers[0];
  provider.enabled = provider.freeTierConfirmed = true;
  for (const route of Object.values(provider.routes)) route.maxTokens = 400;
  provider.routes.player.reasoningEffort = "none";
  config.maxAttempts = 1;
  validateConfig(config);
  const env = { OPENROUTER_API_KEY: "sk-or-v1-synthetic-no-real-credential" };
  return { config, env, candidate: candidatesFor(config, "player", env)[0] };
}
function openAiResponse(content = reply, finishReason = "stop", extra = {}) {
  return {
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: {
      total_tokens: 2284,
      prompt_tokens: 1884,
      completion_tokens: 400,
      completion_tokens_details: { reasoning_tokens: 0 },
    },
    ...extra,
  };
}
async function runSynthetic(body, options = {}) {
  const f = fixture();
  const attempts = [];
  const finishes = [];
  const reservations = [];
  let posted = 0;
  const system = options.system ?? "Return exactly one JSON object.";
  const user = options.user ?? "Synthetic player greeting.";
  const lease = { id: "synthetic-single-attempt", jsonMode: true };
  const result = await routeMind({
    config: f.config,
    env: f.env,
    kind: "player",
    system,
    user,
    store: {
      reserve: async (candidate, kind, tokens, leaseMs) => {
        assert.equal(candidate.provider.id, "openrouter");
        assert.equal(kind, "player");
        assert.ok(leaseMs > 0);
        reservations.push(tokens);
        assert.equal(reservations.length, 1, "a failed output must not acquire another lease");
        return lease;
      },
      finish: async (candidate, receivedLease, completion) => {
        assert.equal(candidate.provider.id, "openrouter");
        assert.deepEqual(receivedLease, lease);
        finishes.push(structuredClone(completion));
      },
    },
    fetcher: async (url, init) => {
      posted++;
      assert.equal(posted, 1, "the one-attempt policy must forbid retries");
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(init.method, "POST");
      assert.equal(init.redirect, "manual");
      const request = JSON.parse(init.body);
      assert.equal(request.model, "openrouter/free");
      assert.equal(request.max_tokens, 400);
      assert.deepEqual(request.response_format, { type: "json_object" });
      assert.deepEqual(request.reasoning, { enabled: false });
      assert.ok(!("reasoning_effort" in request));
      assert.deepEqual(request.messages, [
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      return Response.json(body);
    },
    onAttempt: (provider, model, completion) => attempts.push({ provider, model, completion }),
  });
  assert.equal(posted, 1);
  assert.equal(finishes.length, 1, "a failed response still settles its one reservation");
  assert.equal(attempts.length, 1);
  assert.equal(reservations[0], new TextEncoder().encode(system + user).byteLength + 256 + 400);
  return { result, completion: attempts[0].completion, finish: finishes[0] };
}

test("explicit OpenRouter reasoning disable preserves the 400-token limit and omitted defaults", () => {
  const f = fixture();
  const body = requestBody(f.candidate, "System", "Player", 400, true);
  assert.deepEqual(body.reasoning, { enabled: false });
  assert.equal(body.max_tokens, 400);
  assert.ok(!("reasoning_effort" in body));
  delete f.candidate.route.reasoningEffort;
  const unchanged = requestBody(f.candidate, "System", "Player", 400, true);
  assert.ok(!("reasoning" in unchanged));
  assert.ok(!("reasoning_effort" in unchanged));
  f.candidate.route.reasoningEffort = "low";
  const existing = requestBody(f.candidate, "System", "Player", 400, true);
  assert.equal(existing.reasoning_effort, "low");
  assert.ok(!("reasoning" in existing));
});

test("reasoning none is rejected for foreign hosts, other protocols and insecure OpenRouter URLs", () => {
  for (const mutate of [
    (provider) => {
      provider.id = "foreign";
      provider.baseUrl = "https://example.com/v1";
    },
    (provider) => {
      provider.baseUrl = "https://openrouter.ai.example.com/api/v1";
    },
    (provider) => {
      provider.baseUrl = "http://localhost:8099/v1";
    },
    (provider) => {
      provider.protocol = "cohere";
    },
  ]) {
    const f = fixture();
    mutate(f.config.providers[0]);
    assert.throws(() => validateConfig(f.config));
  }
});

test("JSON failure categories preserve strict complete-object and job-envelope checks", () => {
  const failures = [
    ["player", " ", "empty"],
    ["player", "x".repeat(20_001), "oversize"],
    ["player", '{"reply":"unfinished', "invalid-json"],
    ["player", `Here is the answer: ${reply}`, "invalid-json"],
    ["player", "null", "not-object"],
    ["player", "[]", "not-object"],
    ["player", '{"answer":"Morning."}', "missing-envelope"],
    ["player", '{"reply":" "}', "missing-envelope"],
    ["player", '{"reply":42}', "missing-envelope"],
    ["plan", '{"plans":[]}', "missing-envelope"],
    ["reflect", '{"lines":[{}]}', "missing-envelope"],
    ["talk", '{"agents":[{}]}', "missing-envelope"],
  ];
  for (const [kind, text, expected] of failures) {
    assert.equal(mindJsonFailure(kind, text), expected);
    assert.equal(validMindJson(kind, text), false);
  }
  for (const [kind, text] of [
    ["player", reply],
    ["player", `\`\`\`json\n${reply}\n\`\`\``],
    ["plan", '{"plans":[{}]}'],
    ["reflect", '{"agents":[{}]}'],
    ["talk", '{"lines":[{}]}'],
  ]) {
    assert.equal(mindJsonFailure(kind, text), null);
    assert.equal(validMindJson(kind, text), true);
  }
});

test("safe decoder metadata distinguishes token counts and normalizes finish reasons", () => {
  const decoded = decodeCompletion(openAiResponse(reply, "length"), "openai");
  assert.equal(decoded.actualTokens, 2284);
  assert.equal(decoded.inputTokens, 1884);
  assert.equal(decoded.outputTokens, 400);
  assert.equal(decoded.reasoningTokens, 0);
  assert.equal(decoded.finishReason, "length");
  assert.equal(decoded.truncated, true);
  for (const reason of ["stop", "content_filter", "tool_calls", "error"])
    assert.equal(decodeCompletion(openAiResponse(reply, reason), "openai").finishReason, reason);
  assert.equal(
    decodeCompletion(openAiResponse(reply, "secret-echo-finish"), "openai").finishReason,
    "other",
  );
  assert.equal(
    decodeCompletion({ choices: [{ message: { content: reply } }] }, "openai").finishReason,
    null,
  );
  const cohere = decodeCompletion(
    {
      message: { content: [{ type: "text", text: reply }] },
      finish_reason: "COMPLETE",
      usage: { tokens: { input_tokens: 12, output_tokens: 18 } },
    },
    "cohere",
  );
  assert.equal(cohere.finishReason, "stop");
  assert.equal(cohere.inputTokens, 12);
  assert.equal(cohere.outputTokens, 18);
  assert.equal(cohere.actualTokens, 30);
  assert.equal(cohere.reasoningTokens, null);
  assert.equal(decodeCompletion({ finish_reason: "MAX_TOKENS" }, "cohere").finishReason, "length");
});

test("decoder never coerces malformed usage into trusted token counts", () => {
  for (const invalid of [-1, 1.5, "400", null, Number.MAX_SAFE_INTEGER + 1]) {
    const d = decodeCompletion(
      {
        choices: [{ message: { content: reply }, finish_reason: "stop" }],
        usage: {
          total_tokens: invalid,
          prompt_tokens: invalid,
          completion_tokens: invalid,
          completion_tokens_details: { reasoning_tokens: invalid },
        },
      },
      "openai",
    );
    for (const field of ["actualTokens", "inputTokens", "outputTokens", "reasoningTokens"])
      assert.equal(d[field], null, `${field} rejects ${String(invalid)}`);
  }
  assert.equal(
    decodeCompletion({ usage: { tokens: { input_tokens: null, output_tokens: 3 } } }, "cohere")
      .actualTokens,
    null,
  );
});

test("invalid HTTP 200 completions settle exactly one attempt with a precise non-content reason", async () => {
  for (const [content, finishReason, invalidReason] of [
    ["", "stop", "empty"],
    ['{"reply":"unfinished', "stop", "invalid-json"],
    [`Answer: ${reply}`, "stop", "invalid-json"],
    ["[]", "stop", "not-object"],
    ['{"answer":"Morning."}', "stop", "missing-envelope"],
    ["x".repeat(20_001), "stop", "oversize"],
    [reply, "length", "truncated"],
  ]) {
    const { result, completion, finish } = await runSynthetic(
      openAiResponse(content, finishReason),
    );
    assert.equal(result.ok, false);
    assert.equal(completion.outcome, "invalid");
    assert.equal(completion.status, 200);
    assert.equal(completion.actualTokens, 2284);
    assert.equal(completion.response.invalidReason, invalidReason);
    assert.equal(completion.response.responseCharacters, content.length);
    assert.deepEqual(finish.response, completion.response);
  }
});

test("reasoning-only and provider metadata can never become a reply or leak into attempt diagnostics", async () => {
  const secret = "SYNTHETIC_PRIVATE_REASONING_MUST_NOT_BE_STORED";
  const body = openAiResponse(null, "length");
  body.model = secret;
  body.id = secret;
  body.choices[0].message.reasoning = `${secret} {"reply":"This is reasoning, not final speech."}`;
  body.choices[0].message.reasoning_details = [{ text: secret }];
  body.usage.completion_tokens_details.reasoning_tokens = 400;
  const decoded = decodeCompletion(body, "openai");
  assert.equal(decoded.text, "");
  const { result, completion } = await runSynthetic(body);
  assert.equal(result.ok, false);
  assert.equal(completion.response.invalidReason, "truncated");
  assert.equal(completion.response.reasoningTokens, 400);
  assert.equal(completion.response.responseCharacters, 0);
  assert.deepEqual(Object.keys(completion.response).sort(), [
    "finishReason",
    "inputTokens",
    "invalidReason",
    "outputTokens",
    "reasoningTokens",
    "responseCharacters",
  ]);
  assert.ok(!JSON.stringify({ result, completion }).includes(secret));
  const invalid = await runSynthetic(openAiResponse(`${secret} not JSON`, secret));
  assert.equal(invalid.completion.response.finishReason, "other");
  assert.ok(!JSON.stringify(invalid.completion).includes(secret));
});

test("the real player prompt accepts a synthetic final reply through the pool, parser and town effects", async () => {
  const town = createTown("Synthetic Visitor");
  const job = {
    kind: "player",
    agentId: "kevin",
    text: "Good morning, Kevin.",
    day: town.day,
    minute: town.minute,
  };
  const user = buildPrompt(town, job);
  assert.match(user, /Resident:/);
  assert.match(user, /Good morning, Kevin\./);
  const balances = town.agents.map((agent) => [agent.id, agent.money]);
  const protectedState = structuredClone({
    favors: town.favors,
    economy: town.economy,
    playerProjects: town.agents.find((a) => a.id === "player").projects,
  });
  const { result, completion } = await runSynthetic(openAiResponse(reply), {
    system: MIND_SYSTEM,
    user,
  });
  assert.equal(result.ok, true);
  assert.equal(completion.outcome, "ok");
  assert.equal(completion.response.invalidReason, null);
  const parsed = parseMind(job, result.text);
  assert.ok(parsed);
  applyResult(town, parsed);
  const conversation = town.agents.find((a) => a.id === "kevin").memories.at(-1);
  assert.equal(conversation.mind, "grok");
  assert.deepEqual(conversation.turns.at(-1), { speaker: "kevin", text: JSON.parse(reply).reply });
  assert.deepEqual(
    town.agents.map((agent) => [agent.id, agent.money]),
    balances,
  );
  assert.deepEqual(
    {
      favors: town.favors,
      economy: town.economy,
      playerProjects: town.agents.find((a) => a.id === "player").projects,
    },
    protectedState,
  );
});
