import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig, validateConfig, candidatesFor } from "../src/lib/mind-pool/config.ts";
import { requestBody } from "../src/lib/mind-pool/transport.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";

function fixture(id, effort) {
  const config = defaultConfig();
  config.providers = config.providers.filter((p) => p.id === id);
  const provider = config.providers[0];
  provider.enabled = provider.freeTierConfirmed = true;
  if (effort !== undefined) provider.routes.reflect.reasoningEffort = effort;
  else delete provider.routes.reflect.reasoningEffort;
  config.maxAttempts = 1;
  return {
    config,
    env: { [provider.apiKeyEnv]: id === "gemini" ? "AIza-synthetic" : "synthetic-key" },
  };
}

test("Cohere requests retain native behavior and reject unsupported reasoning controls", () => {
  const f = fixture("cohere");
  validateConfig(f.config);
  const candidate = candidatesFor(f.config, "reflect", f.env)[0];
  assert.ok(!("thinking" in requestBody(candidate, "system", "user", 2000, true)));
  candidate.route.reasoningEffort = "none";
  assert.throws(() => validateConfig(f.config));
  assert.throws(() => requestBody(candidate, "system", "user", 2000, true));
});

test("Gemini minimal effort is explicit and keeps the ordinary output/JSON limits", () => {
  const f = fixture("gemini", "minimal");
  validateConfig(f.config);
  const body = requestBody(
    candidatesFor(f.config, "reflect", f.env)[0],
    "system",
    "user",
    2000,
    true,
  );
  assert.equal(body.reasoning_effort, "minimal");
  assert.equal(body.max_tokens, 2000);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.ok(!("thinking" in body));
});

test("provider-specific reasoning controls reject foreign protocols and hosts", () => {
  for (const [id, effort, origin, protocol] of [
    ["cohere", "none", "https://example.com/v2", "cohere"],
    ["cohere", "none", "https://api.cohere.com/v2", "openai"],
    ["gemini", "minimal", "https://example.com/v1", "openai"],
    ["gemini", "minimal", "https://generativelanguage.googleapis.com/v1beta/openai", "cohere"],
  ]) {
    const f = fixture(id, effort);
    const provider = f.config.providers[0];
    provider.baseUrl = origin;
    provider.protocol = protocol;
    assert.throws(() => validateConfig(f.config));
    assert.throws(() =>
      requestBody({ provider, route: provider.routes.reflect }, "s", "u", 2000, true),
    );
  }
});

test("fast reasoning choices still use the existing router, settle once, and never retry", async () => {
  for (const [id, effort] of [
    ["cohere", undefined],
    ["gemini", "minimal"],
  ]) {
    const f = fixture(id, effort);
    validateConfig(f.config);
    let reserved = 0,
      completed = 0,
      sent = 0;
    const result = await routeMind({
      ...f,
      kind: "reflect",
      system: "system",
      user: "user",
      store: {
        reserve: async () => {
          reserved++;
          return { id: "lease", jsonMode: true };
        },
        finish: async (_candidate, _lease, completion) => {
          completed++;
          assert.equal(completion.outcome, "ok");
        },
      },
      fetcher: async (_url, options) => {
        sent++;
        const body = JSON.parse(options.body);
        assert.equal(body.max_tokens, f.config.providers[0].routes.reflect.maxTokens);
        if (id === "cohere") assert.ok(!("thinking" in body));
        else assert.equal(body.reasoning_effort, "minimal");
        const text =
          '{"agents":[{"id":"kevin","reflections":["I offered to help.","I am still unsure."]}]}';
        return Response.json(
          id === "cohere"
            ? { message: { content: [{ type: "text", text }] }, finish_reason: "COMPLETE" }
            : { choices: [{ message: { content: text }, finish_reason: "stop" }] },
        );
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual([reserved, sent, completed], [1, 1, 1]);
  }
});
