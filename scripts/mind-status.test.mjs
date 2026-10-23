import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mindFailure,
  mindFailureFromResult,
  mindFailureMessage,
} from "../src/components/town/mind-status.ts";

test("expired player sessions are distinct from provider credential failures", () => {
  assert.equal(mindFailure(new Error("Unauthorized")), "sign-in");
  assert.equal(mindFailure({ status: 401 }), "sign-in");
  assert.equal(
    mindFailureFromResult({ error: "unreachable", diagnostics: { status: 401 } }),
    "provider",
  );
  assert.equal(
    mindFailureFromResult({ error: "Unauthorized", diagnostics: { outcome: "auth" } }),
    "provider",
  );
  for (const status of [402, 403])
    assert.equal(mindFailureFromResult({ diagnostics: { status } }), "provider");
});

test("pool cooldown and budget refusal do not claim a particular quota was exhausted", () => {
  assert.equal(mindFailure("slow"), "limited");
  assert.equal(mindFailure({ status: 429 }), "limited");
  for (const outcome of ["rate_limit", "rate-limit"])
    assert.equal(
      mindFailureFromResult({ error: "unreachable", diagnostics: { outcome } }),
      "limited",
    );
  assert.equal(mindFailureFromResult({ diagnostics: { status: 429 } }), "limited");
  assert.doesNotMatch(mindFailureMessage("limited"), /daily|exhausted|tomorrow/i);
});

test("browser and legacy timeouts receive a useful bounded reason", () => {
  for (const error of [new Error("timeout"), { name: "TimeoutError" }, { name: "AbortError" }])
    assert.equal(mindFailure(error), "timeout");
  assert.equal(mindFailureFromResult({ diagnostics: { outcome: "timeout" } }), "timeout");
});

test("rejected model output is distinguished from connection failure", () => {
  for (const code of ["invalid", "malformed", "empty", "huge"])
    assert.equal(mindFailure(new Error(code)), "invalid");
  for (const outcome of ["invalid", "malformed", "empty", "format"])
    assert.equal(
      mindFailureFromResult({ error: "unreachable", diagnostics: { outcome } }),
      "invalid",
    );
});

test("missing configuration and unknown connection failures remain distinct", () => {
  assert.equal(mindFailure("offline"), "unconfigured");
  assert.equal(mindFailureFromResult({ diagnostics: { outcome: "offline" } }), "unconfigured");
  for (const error of [undefined, null, 42, {}, new Error("Failed to fetch"), "unreachable"])
    assert.equal(mindFailure(error), "connection");
  assert.equal(mindFailureFromResult({ error: "slow" }), "limited");
});

test("legacy HTTP errors use stable codes and do not mistake provider auth for player sign-in", () => {
  assert.equal(mindFailure("mind 429"), "limited");
  for (const status of [401, 402, 403, 500, 503])
    assert.equal(mindFailure(`mind ${status}`), "provider");
  assert.equal(
    mindFailureFromResult({ error: "mind 500", diagnostics: { outcome: "http-error" } }),
    "provider",
  );
});

test("unknown raw error details never appear in any player-facing message", () => {
  const raw = "Private provider body: token=secret; prompt=private conversation";
  assert.equal(mindFailure(new Error(raw)), "connection");
  for (const category of [
    "connection",
    "timeout",
    "limited",
    "sign-in",
    "provider",
    "invalid",
    "unconfigured",
  ]) {
    const message = mindFailureMessage(category);
    assert.equal(typeof message, "string");
    assert.ok(message.endsWith("."));
    assert.doesNotMatch(message, /secret|token=|private conversation|recovered|verified/i);
  }
});
