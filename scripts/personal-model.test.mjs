import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  DEFAULT_PERSONAL_MODEL,
  personalModelReady,
  personalModelTimeoutMs,
  readPersonalModelSettings,
  requestPersonalModel,
  savePersonalModelSettings,
  validatePersonalModelSettings,
} from "../src/lib/personal-model.ts";

const personal = {
  mode: "api-key",
  baseUrl: "https://api.openai.com/v1",
  model: "chosen-model",
  apiKey: "sk-proj-synthetic-never-transmit",
};
const local = {
  mode: "local",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen3:8b",
  apiKey: "",
};
const request = { kind: "player", user: "A synthetic conversation" };
const completion = (text = '{"reply":"Hello, neighbor."}', extra = {}) =>
  Response.json({
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 7 },
    ...extra,
  });

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else delete globalThis.localStorage;
});

function storageFixture() {
  const entries = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
    },
  });
  return entries;
}

test("personal settings require HTTPS, safe URLs and an explicit model/key", () => {
  assert.deepEqual(validatePersonalModelSettings(personal), personal);
  assert.equal(
    validatePersonalModelSettings({ ...personal, baseUrl: `${personal.baseUrl}/` }).baseUrl,
    personal.baseUrl,
  );
  for (const changes of [
    { mode: "unknown" },
    { baseUrl: "http://api.openai.com/v1" },
    { baseUrl: "https://name:secret@api.openai.com/v1" },
    { baseUrl: "https://api.openai.com/v1?key=secret" },
    { baseUrl: "https://api.openai.com/v1#fragment" },
    { baseUrl: "https://api.openai.com/\npath" },
    { model: "" },
    { model: "x".repeat(201) },
    { apiKey: "" },
    { apiKey: "invalid\nkey" },
  ])
    assert.throws(() => validatePersonalModelSettings({ ...personal, ...changes }));
  assert.equal(personalModelReady(DEFAULT_PERSONAL_MODEL), false);
  assert.equal(personalModelReady(personal), true);
  assert.equal(personalModelReady({ ...personal, apiKey: "" }), false);
});

test("local settings require loopback and never accept a recognizable remote-provider key", () => {
  for (const baseUrl of [
    "http://localhost:1234/v1",
    "http://127.0.0.1:11434/v1",
    "https://[::1]:1234/v1",
  ])
    assert.equal(personalModelReady({ ...local, baseUrl }), true);
  for (const baseUrl of [
    "http://192.168.1.2:11434/v1",
    "https://evil.example/v1",
    "http://localhost.evil.example/v1",
    "file://localhost/v1",
  ])
    assert.throws(() => validatePersonalModelSettings({ ...local, baseUrl }));
  assert.throws(
    () => validatePersonalModelSettings({ ...local, apiKey: personal.apiKey }),
    /different provider/,
  );
  assert.equal(personalModelReady({ ...local, apiKey: "local-server-secret" }), true);
});

test("recognizable credentials cannot be sent to another provider or a lookalike hostname", () => {
  for (const [apiKey, baseUrl] of [
    ["sk-or-v1-synthetic", "https://openrouter.ai/api/v1"],
    ["xai-synthetic", "https://api.x.ai/v1"],
    ["AIza-synthetic", "https://generativelanguage.googleapis.com/v1beta/openai"],
    ["gsk_synthetic", "https://api.groq.com/openai/v1"],
    ["nvapi-synthetic", "https://integrate.api.nvidia.com/v1"],
  ]) {
    assert.equal(validatePersonalModelSettings({ ...personal, apiKey, baseUrl }).apiKey, apiKey);
    assert.throws(
      () =>
        validatePersonalModelSettings({ ...personal, apiKey, baseUrl: "https://other.example/v1" }),
      /different provider/,
    );
    const wrong = baseUrl.replace(
      new URL(baseUrl).hostname,
      `${new URL(baseUrl).hostname}.evil.example`,
    );
    assert.throws(
      () => validatePersonalModelSettings({ ...personal, apiKey, baseUrl: wrong }),
      /different provider/,
    );
  }
});

test("only preferences survive reload; credentials are neither written nor restored", () => {
  const entries = storageFixture();
  assert.equal(savePersonalModelSettings(personal), true);
  assert.equal(entries.size, 1);
  const [key, raw] = [...entries][0];
  assert.deepEqual(JSON.parse(raw), {
    mode: personal.mode,
    baseUrl: personal.baseUrl,
    model: personal.model,
  });
  assert.ok(!raw.includes(personal.apiKey));
  assert.equal(readPersonalModelSettings().apiKey, "");
  assert.equal(readPersonalModelSettings().mode, "api-key");
  assert.equal(personalModelReady(readPersonalModelSettings()), false);
  entries.set(key, JSON.stringify(personal));
  assert.equal(readPersonalModelSettings().apiKey, "");
  entries.set(key, "not-json");
  assert.deepEqual(readPersonalModelSettings(), DEFAULT_PERSONAL_MODEL);
  assert.equal(savePersonalModelSettings(local), true);
  assert.deepEqual(readPersonalModelSettings(), local);
});

test("blocked storage leaves an honest save failure and safe default reads", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: () => {
      throw new Error("blocked");
    },
  });
  assert.equal(savePersonalModelSettings(personal), false);
  assert.deepEqual(readPersonalModelSettings(), DEFAULT_PERSONAL_MODEL);
});

test("personal transport sends exactly one direct request with bounded payload and private credentials", async () => {
  let calls = 0;
  const result = await requestPersonalModel(request, personal, {
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.equal(options.headers.Authorization, `Bearer ${personal.apiKey}`);
      assert.equal(options.credentials, "omit");
      assert.equal(options.referrerPolicy, "no-referrer");
      assert.equal(options.redirect, "error");
      const body = JSON.parse(options.body);
      assert.equal(body.model, personal.model);
      assert.equal(body.max_tokens, 700);
      assert.equal(body.stream, false);
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.equal(body.messages[1].content, request.user);
      assert.ok(!options.body.includes(personal.apiKey));
      return completion();
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.model, personal.model);
  assert.equal(result.diagnostics.attempts, 1);
  assert.equal(result.diagnostics.inputTokens, 12);
  assert.equal(result.diagnostics.outputTokens, 7);
});

test("local transport needs no key and supports the same strictly validated action envelope", async () => {
  const result = await requestPersonalModel(
    { kind: "act", user: "One bounded observation" },
    local,
    {
      fetcher: async (url, options) => {
        assert.equal(url, "http://127.0.0.1:11434/v1/chat/completions");
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(JSON.parse(options.body).max_tokens, 1200);
        return completion('{"decision":{"kind":"wait"}}');
      },
    },
  );
  assert.equal(result.ok, true);
  const rejected = await requestPersonalModel({ kind: "act", user: "Observation" }, local, {
    fetcher: async () => completion('{"decision":{"kind":"pay","amount":100}}'),
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "malformed");
});

test("each job keeps its output ceiling and local models get a bounded longer deadline", async () => {
  for (const [kind, maxTokens, text] of [
    ["player", 700, '{"reply":"Hello."}'],
    ["plan", 1800, '{"plans":[{}]}'],
    ["reflect", 900, '{"agents":[{}]}'],
    ["talk", 900, '{"lines":[{}]}'],
    ["act", 1200, '{"decision":{"kind":"wait"}}'],
  ]) {
    let transmittedSignal;
    const result = await requestPersonalModel({ kind, user: "Synthetic observation" }, local, {
      fetcher: async (_url, options) => {
        transmittedSignal = options.signal;
        assert.equal(JSON.parse(options.body).max_tokens, maxTokens);
        return completion(text);
      },
    });
    assert.equal(result.ok, true);
    assert.ok(transmittedSignal instanceof AbortSignal);
    assert.equal(personalModelTimeoutMs(local, kind), 60_000);
    assert.equal(personalModelTimeoutMs(personal, kind), kind === "act" ? 30_000 : 25_000);
  }
});

test("failure never retries, changes endpoint or exposes provider errors", async () => {
  for (const status of [301, 400, 401, 429, 500]) {
    let calls = 0;
    const result = await requestPersonalModel(request, personal, {
      fetcher: async () => {
        calls++;
        return new Response(`echoed ${personal.apiKey} ${request.user}`, { status });
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, false);
    assert.equal(result.error, status === 429 ? "rate-limit" : "http-error");
    assert.ok(!JSON.stringify(result).includes(personal.apiKey));
    assert.ok(!JSON.stringify(result).includes(request.user));
  }
  const unreachable = await requestPersonalModel(request, personal, {
    fetcher: async () => {
      throw new Error(personal.apiKey);
    },
  });
  assert.equal(unreachable.error, "unreachable");
});

test("malformed, truncated, excessive and wrong-envelope output is rejected after one attempt", async () => {
  for (const response of [
    new Response("not JSON"),
    completion(""),
    completion("[]"),
    completion("{}"),
    completion('{"reply":"' + "x".repeat(20_000) + '"}'),
    completion(undefined, {
      choices: [{ message: { content: '{"reply":"hello"}' }, finish_reason: "length" }],
    }),
    new Response("x".repeat(256_001)),
  ]) {
    let calls = 0;
    const result = await requestPersonalModel(request, personal, {
      fetcher: async () => {
        calls++;
        return response;
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
  }
});

test("unconfigured, invalid and already-aborted requests do not transmit", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return completion();
  };
  for (const settings of [
    DEFAULT_PERSONAL_MODEL,
    { ...personal, apiKey: "" },
    { ...local, baseUrl: "https://remote.example/v1" },
  ])
    assert.equal((await requestPersonalModel(request, settings, { fetcher })).ok, false);
  assert.equal(
    (await requestPersonalModel({ kind: "invalid", user: "x" }, personal, { fetcher })).ok,
    false,
  );
  const controller = new AbortController();
  controller.abort();
  const aborted = await requestPersonalModel(request, personal, {
    fetcher,
    signal: controller.signal,
  });
  assert.equal(aborted.error, "timeout");
  assert.equal(calls, 0);
});

test("abort during response reading is reported as a timeout", async () => {
  const controller = new AbortController();
  const result = await requestPersonalModel(request, personal, {
    signal: controller.signal,
    fetcher: async () => {
      controller.abort();
      return completion();
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "timeout");
});
