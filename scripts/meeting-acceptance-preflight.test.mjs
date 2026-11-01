import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assessMeetingAcceptance, SNAPSHOT_MAX_AGE_MS } from "./meeting-acceptance-preflight.mjs";
import { meetingFreeProfile } from "./meeting-free-profile.mjs";

const nowMs = Date.parse("2026-11-01T12:00:00Z"),
  at = new Date(nowMs).toISOString();
async function fixture() {
  const profile = await meetingFreeProfile();
  return {
    version: 1,
    evidenceMode: "synthetic",
    observedAt: at,
    plan: { maxCalls: 16, maxInputUtf8Bytes: 18_000, intervalMs: 31_000 },
    profile,
    operator: {
      observedAt: at,
      hostedTrialAuthorized: true,
      candidateRevision: "a".repeat(40),
      authorizedMaxCalls: 16,
      providerDayCallCeiling: 48,
      zeroSpend: true,
    },
    deployment: {
      observedAt: at,
      sourceRevision: "a".repeat(40),
      assetHashesMatch: true,
      sharedDatabase: true,
      budgetSchemaReady: true,
      providerSchemaReady: true,
    },
    auth: {
      observedAt: at,
      realSignedIn: true,
      middlewareVerified: true,
      sameCallerAsBudgetCounters: true,
    },
    budget: {
      observedAt: at,
      rolling24hChargedCalls: 31,
      rolling24hChargedMicrousd: 0,
      userRolling24hChargedCalls: 31,
      userRollingMinuteChargedCalls: 0,
      activeLeases: 0,
      activeActionLeases: 0,
      invalidRows: 0,
      lastRequestStartedAtMs: nowMs - 62_000,
    },
    provider: {
      observedAt: at,
      model: profile.pool.providers[0].routes.act.model,
      sameAccountAsDeployment: true,
      modelAvailable: true,
      pricing: { prompt: "0", completion: "0", request: 0 },
      accountBlocked: false,
      modelBlocked: false,
      rollingMinuteCalls: 0,
      rolling24hCalls: 32,
      rolling31dCalls: 1472,
      rollingMinuteReservedTokens: 0,
      rolling24hReservedTokens: 600_000,
      activeLeases: 0,
      accountCooldownUntilMs: 0,
      modelCooldownUntilMs: 0,
      utc: { date: "2026-11-01", used: 32, remaining: 18, limit: 50 },
    },
  };
}
const assess = (snapshot) => assessMeetingAcceptance(snapshot, { nowMs });
async function rejected(change, reason) {
  const snapshot = await fixture();
  change(snapshot);
  const report = await assess(snapshot);
  assert.equal(report.status, "not-ready");
  assert.ok(report.reasons.includes(reason), JSON.stringify(report));
  assert.equal(report.liveHeadroomVerified, false);
  assert.equal(report.permissionGranted, false);
  assert.equal(report.reservedCalls, 0);
}

test("fresh synthetic full-meeting boundary passes without claiming live headroom or authority", async () => {
  const snapshot = await fixture(),
    before = structuredClone(snapshot);
  const report = await assess(snapshot);
  assert.equal(report.status, "synthetic-pass");
  assert.deepEqual(report.reasons, []);
  assert.equal(report.reservedTokensPerCall, 19_456);
  assert.equal(report.validUntil, "2026-11-01T12:05:00.000Z");
  assert.equal(report.liveHeadroomVerified, false);
  assert.equal(report.permissionGranted, false);
  assert.equal(report.reservedCalls, 0);
  assert.equal(report.recheckBeforeEveryRequest, true);
  assert.deepEqual(snapshot, before);
  snapshot.evidenceMode = "read-only-live";
  assert.equal((await assess(snapshot)).status, "ready-to-recheck");
});

test("missing evidence, extra private fields and malformed numbers fail closed", async () => {
  assert.equal((await assess(null)).status, "not-ready");
  for (const section of ["operator", "deployment", "auth", "budget", "provider", "profile", "plan"])
    await rejected(
      (s) => delete s[section],
      section === "profile"
        ? "deployed-profile-mismatch"
        : section === "plan"
          ? "bounded-action-plan-required"
          : section === "operator"
            ? "bounded-operator-authority-required"
            : section === "deployment"
              ? "exact-hosted-candidate-required"
              : section === "auth"
                ? "verified-caller-evidence-required"
                : `${section}-counters-invalid`,
    );
  await rejected((s) => {
    s.apiKey = "sensitive-canary";
  }, "sanitized-snapshot-required");
  await rejected((s) => {
    s.budget.rolling24hChargedCalls = "31";
  }, "budget-counters-invalid");
  await rejected((s) => {
    s.provider.utc.used = -1;
  }, "provider-counters-invalid");
});

test("malformed JSON values never escape the reusable assessor as coercion exceptions", async () => {
  for (const [section, field] of [
    ["plan", "maxCalls"],
    ["plan", "maxInputUtf8Bytes"],
    ["budget", "observedAt"],
    ["budget", "rolling24hChargedCalls"],
    ["provider", "observedAt"],
    ["provider", "rolling24hCalls"],
    ["operator", "authorizedMaxCalls"],
  ]) {
    for (const value of [null, [], { toString: null }, false, "not-a-counter"]) {
      const s = await fixture();
      s[section][field] = value;
      assert.equal((await assess(s)).status, "not-ready");
    }
  }
  assert.equal(
    (await assessMeetingAcceptance(await fixture(), { nowMs: Number.MAX_SAFE_INTEGER })).status,
    "not-ready",
  );
});

test("every observed evidence section must be fresh, present-time and on the current provider UTC day", async () => {
  for (const section of [null, "operator", "deployment", "auth", "budget", "provider"]) {
    for (const time of [nowMs - SNAPSHOT_MAX_AGE_MS - 1, nowMs + 1])
      await rejected(
        (s) => {
          (section ? s[section] : s).observedAt = new Date(time).toISOString();
        },
        `${section ?? "snapshot"}-not-fresh`,
      );
  }
  await rejected((s) => {
    s.provider.utc.date = "2026-10-27";
  }, "provider-utc-day-mismatch");
  const s = await fixture();
  s.evidenceMode = "read-only-live";
  s.provider.observedAt = "2026-10-27T12:00:00Z";
  assert.equal(
    (await assess(s)).status,
    "not-ready",
    "A fresh wrapper cannot freshen old provider counters",
  );
});

test("operator, authentication, deployment and exact current free profile are required", async () => {
  await rejected((s) => {
    s.provider.model = "different:free";
  }, "provider-evidence-not-bound-to-deployment");
  await rejected((s) => {
    s.provider.sameAccountAsDeployment = false;
  }, "provider-evidence-not-bound-to-deployment");
  await rejected((s) => {
    s.operator.hostedTrialAuthorized = false;
  }, "bounded-operator-authority-required");
  await rejected((s) => {
    s.operator.authorizedMaxCalls = 15;
  }, "bounded-operator-authority-required");
  await rejected((s) => {
    s.operator.providerDayCallCeiling = 50;
  }, "bounded-operator-authority-required");
  await rejected((s) => {
    s.auth.sameCallerAsBudgetCounters = false;
  }, "verified-caller-evidence-required");
  await rejected((s) => {
    s.auth.middlewareVerified = false;
  }, "verified-caller-evidence-required");
  await rejected((s) => {
    s.deployment.sourceRevision = "b".repeat(40);
  }, "exact-hosted-candidate-required");
  await rejected((s) => {
    s.deployment.sharedDatabase = false;
  }, "exact-hosted-candidate-required");
  await rejected((s) => {
    s.profile.budget.dailyCalls = 49;
  }, "deployed-profile-mismatch");
  await rejected((s) => {
    s.profile.pool.providers[0].routes.act.model = "different:free";
  }, "deployed-profile-mismatch");
});

test("shared direct-reply reserve and independent caller/provider windows retain their hard boundaries", async () => {
  await rejected((s) => {
    s.budget.rolling24hChargedCalls = 32;
  }, "shared-action-headroom-insufficient");
  await rejected((s) => {
    s.budget.rolling24hChargedCalls = 33;
    s.budget.userRolling24hChargedCalls = 33;
  }, "caller-headroom-insufficient");
  await rejected((s) => {
    s.budget.userRollingMinuteChargedCalls = 3;
  }, "caller-headroom-insufficient");
  await rejected((s) => {
    s.provider.rolling24hCalls = 33;
  }, "provider-call-headroom-insufficient");
  await rejected((s) => {
    s.provider.rolling31dCalls = 1473;
  }, "provider-call-headroom-insufficient");
  await rejected((s) => {
    s.provider.utc = { date: "2026-11-01", used: 33, remaining: 17, limit: 50 };
  }, "provider-call-headroom-insufficient");
  await rejected((s) => {
    s.provider.rollingMinuteCalls = 2;
  }, "provider-call-headroom-insufficient");
});

test("conservative tokens, pacing, leases, health and known zero pricing must all be ready", async () => {
  await rejected((s) => {
    s.provider.rollingMinuteCalls = 1;
  }, "provider-call-headroom-insufficient");
  await rejected((s) => {
    s.budget.userRollingMinuteChargedCalls = 2;
  }, "caller-headroom-insufficient");
  await rejected((s) => {
    s.provider.rollingMinuteReservedTokens = 1089;
  }, "provider-token-headroom-insufficient");
  await rejected((s) => {
    s.plan.maxCalls = 17;
  }, "bounded-action-plan-required");
  await rejected((s) => {
    s.plan.intervalMs = 30_999;
  }, "bounded-action-plan-required");
  await rejected((s) => {
    s.plan.maxInputUtf8Bytes = 18_545;
  }, "provider-token-headroom-insufficient");
  await rejected((s) => {
    s.provider.rolling24hReservedTokens = 648_705;
  }, "provider-token-headroom-insufficient");
  await rejected((s) => {
    s.provider.rollingMinuteReservedTokens = 20_545;
  }, "provider-token-headroom-insufficient");
  await rejected((s) => {
    s.budget.lastRequestStartedAtMs = nowMs - 30_999;
  }, "request-pacing-not-ready");
  await rejected((s) => {
    s.budget.activeLeases = 1;
  }, "budget-lease-unsettled");
  await rejected((s) => {
    s.provider.activeLeases = 1;
  }, "provider-lease-unsettled");
  await rejected((s) => {
    s.provider.accountCooldownUntilMs = nowMs + 1;
  }, "provider-health-not-ready");
  await rejected((s) => {
    s.provider.modelBlocked = true;
  }, "provider-health-not-ready");
  await rejected((s) => {
    s.provider.modelAvailable = false;
  }, "known-zero-model-pricing-required");
  await rejected((s) => {
    s.provider.pricing.request = "0.001";
  }, "known-zero-model-pricing-required");
  await rejected((s) => {
    delete s.provider.pricing.prompt;
  }, "known-zero-model-pricing-required");
  await rejected((s) => {
    s.budget.rolling24hChargedMicrousd = 1;
  }, "zero-spend-ledger-required");
});

test("CLI defaults fail closed and never echo private input; successful snapshots still reserve nothing", async () => {
  const cwd = new URL("..", import.meta.url),
    script = new URL("./meeting-acceptance-preflight.mjs", import.meta.url);
  const dir = await mkdtemp(join(tmpdir(), "meeting-preflight-"));
  try {
    const run = (args = []) =>
      spawnSync(process.execPath, [fileURLToPath(script), ...args], {
        cwd,
        encoding: "utf8",
        env: { PATH: process.env.PATH, SECRET_CANARY: "sensitive-canary" },
      });
    const empty = run();
    assert.equal(empty.status, 2);
    assert.equal(JSON.parse(empty.stdout).status, "not-ready");
    const path = join(dir, "snapshot.json");
    await writeFile(path, JSON.stringify({ secret: "sensitive-canary" }));
    const invalid = run(["--snapshot", path]);
    assert.equal(invalid.status, 2);
    assert.ok(!`${invalid.stdout}${invalid.stderr}`.includes("sensitive-canary"));
    const s = await fixture(),
      freshAt = new Date().toISOString();
    s.observedAt = freshAt;
    for (const key of ["operator", "deployment", "auth", "budget", "provider"])
      s[key].observedAt = freshAt;
    s.provider.utc.date = freshAt.slice(0, 10);
    s.budget.lastRequestStartedAtMs = 0;
    await writeFile(path, JSON.stringify(s));
    const pass = run(["--snapshot", path]);
    assert.equal(pass.status, 0, pass.stderr);
    assert.equal(JSON.parse(pass.stdout).status, "synthetic-pass");
    assert.equal(JSON.parse(pass.stdout).reservedCalls, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
