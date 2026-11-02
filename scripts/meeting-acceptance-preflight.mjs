import { open } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { meetingFreeProfile } from "./meeting-free-profile.mjs";
import { validateConfig } from "../src/lib/mind-pool/config.ts";
import { validateBudgetPolicy } from "../src/lib/mind-budget/policy.ts";
import { DISCUSSION_RUN_INTERVAL_MS } from "../src/game/discussion-run.ts";

export const SNAPSHOT_MAX_AGE_MS = 5 * 60_000;
const MAX_FILE_BYTES = 256 * 1024;
const object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const whole = (value) => Number.isSafeInteger(value) && value >= 0;
const revision = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const keysAre = (value, allowed) =>
  object(value) && Object.keys(value).every((key) => allowed.includes(key));
const zeroPrice = (value) =>
  (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value)) &&
  Number(value) === 0;

/**
 * Assess supplied, sanitized evidence only. No credentials, network, database,
 * inference or reservations. Even a live snapshot is an unverified attestation;
 * counters and atomic admission must be checked again at each physical request.
 * nowMs is a deterministic test seam, never a CLI option.
 */
export async function assessMeetingAcceptance(snapshot, { nowMs = Date.now() } = {}) {
  const reasons = new Set();
  const fail = (code) => reasons.add(code);
  const dates = [];
  const fresh = (value, name) => {
    const time = typeof value === "string" && value.endsWith("Z") ? Date.parse(value) : NaN;
    if (!Number.isFinite(time) || time > nowMs || nowMs - time > SNAPSHOT_MAX_AGE_MS)
      fail(`${name}-not-fresh`);
    else dates.push(time);
    return time;
  };
  const result = (details = {}) => ({
    status: reasons.size
      ? "not-ready"
      : snapshot.evidenceMode === "synthetic"
        ? "synthetic-pass"
        : "ready-to-recheck",
    reasons: [...reasons],
    liveHeadroomVerified: false,
    permissionGranted: false,
    reservedCalls: 0,
    ...details,
    limitation:
      "Supplied evidence only; this neither grants permission nor reserves capacity. Recheck live counters, pricing, authority and atomic admission before each request.",
  });
  if (
    !whole(nowMs) ||
    !Number.isFinite(new Date(nowMs).getTime()) ||
    new Date(nowMs).getUTCFullYear() > 9999
  ) {
    fail("assessment-clock-invalid");
    return result();
  }
  if (
    !keysAre(snapshot, [
      "version",
      "evidenceMode",
      "observedAt",
      "plan",
      "profile",
      "operator",
      "deployment",
      "auth",
      "budget",
      "provider",
    ])
  ) {
    fail("sanitized-snapshot-required");
    return result();
  }
  if (snapshot.version !== 1 || !["synthetic", "read-only-live"].includes(snapshot.evidenceMode))
    fail("snapshot-format-invalid");
  fresh(snapshot.observedAt, "snapshot");
  if (reasons.size) return result();
  const plan = snapshot.plan ?? {};
  if (
    !keysAre(plan, ["maxCalls", "maxInputUtf8Bytes", "intervalMs"]) ||
    !whole(plan.maxCalls) ||
    plan.maxCalls < 1 ||
    plan.maxCalls > 16 ||
    !whole(plan.maxInputUtf8Bytes) ||
    plan.maxInputUtf8Bytes < 1 ||
    !whole(plan.intervalMs) ||
    plan.intervalMs < DISCUSSION_RUN_INTERVAL_MS
  )
    fail("bounded-action-plan-required");
  if (reasons.size) return result();
  // Without per-row start times, conservatively keep room for every planned
  // first-minute start alongside current usage. Admission is still rechecked.
  const firstMinuteStarts = Math.min(plan.maxCalls, Math.ceil(60_000 / plan.intervalMs));

  let expected;
  try {
    expected = await meetingFreeProfile();
    if (
      !keysAre(snapshot.profile, ["pool", "budget"]) ||
      !isDeepStrictEqual(validateConfig(snapshot.profile.pool), expected.pool) ||
      !isDeepStrictEqual(validateBudgetPolicy(snapshot.profile.budget), expected.budget)
    )
      fail("deployed-profile-mismatch");
  } catch {
    fail("deployed-profile-invalid");
  }
  if (!expected || reasons.size) return result();
  const { pool, budget: policy } = expected;
  const provider = pool.providers[0],
    route = provider?.routes.act;
  if (
    pool.providers.length !== 1 ||
    !provider?.enabled ||
    !provider.freeTierConfirmed ||
    !route ||
    !route.model.endsWith(":free") ||
    pool.maxAttempts !== 1 ||
    route.maxTokens > 1200 ||
    provider.limits.concurrent !== 1 ||
    policy.concurrent !== 1 ||
    policy.actionConcurrent !== 1 ||
    policy.backgroundConcurrent !== 0 ||
    policy.dailyMicrousd !== 0 ||
    policy.interactiveReserveMicrousd !== 0 ||
    policy.inputNanousdPerToken !== 0 ||
    policy.outputNanousdPerToken !== 0
  )
    fail("canonical-profile-not-bounded-free-actions");
  if (!route || reasons.size) return result();

  const operator = snapshot.operator ?? {},
    deployment = snapshot.deployment ?? {},
    auth = snapshot.auth ?? {};
  if (
    !keysAre(operator, [
      "observedAt",
      "hostedTrialAuthorized",
      "candidateRevision",
      "authorizedMaxCalls",
      "providerDayCallCeiling",
      "zeroSpend",
    ]) ||
    operator.hostedTrialAuthorized !== true ||
    operator.zeroSpend !== true ||
    !revision(operator.candidateRevision) ||
    !whole(operator.authorizedMaxCalls) ||
    operator.authorizedMaxCalls < plan.maxCalls ||
    operator.authorizedMaxCalls > 16 ||
    !whole(operator.providerDayCallCeiling) ||
    operator.providerDayCallCeiling < plan.maxCalls ||
    operator.providerDayCallCeiling > provider.limits.rpd
  )
    fail("bounded-operator-authority-required");
  fresh(operator.observedAt, "operator");
  if (
    !keysAre(deployment, [
      "observedAt",
      "sourceRevision",
      "assetHashesMatch",
      "sharedDatabase",
      "budgetSchemaReady",
      "providerSchemaReady",
    ]) ||
    !revision(deployment.sourceRevision) ||
    deployment.sourceRevision !== operator.candidateRevision ||
    deployment.assetHashesMatch !== true ||
    deployment.sharedDatabase !== true ||
    deployment.budgetSchemaReady !== true ||
    deployment.providerSchemaReady !== true
  )
    fail("exact-hosted-candidate-required");
  fresh(deployment.observedAt, "deployment");
  if (
    !keysAre(auth, [
      "observedAt",
      "realSignedIn",
      "middlewareVerified",
      "sameCallerAsBudgetCounters",
    ]) ||
    auth.realSignedIn !== true ||
    auth.middlewareVerified !== true ||
    auth.sameCallerAsBudgetCounters !== true
  )
    fail("verified-caller-evidence-required");
  fresh(auth.observedAt, "auth");
  if (reasons.size) return result();

  const b = snapshot.budget ?? {};
  const budgetCounts = [
    "rolling24hChargedCalls",
    "rolling24hChargedMicrousd",
    "userRolling24hChargedCalls",
    "userRollingMinuteChargedCalls",
    "activeLeases",
    "activeActionLeases",
    "invalidRows",
    "lastRequestStartedAtMs",
  ];
  if (
    !keysAre(b, ["observedAt", ...budgetCounts]) ||
    budgetCounts.some((key) => !whole(b[key])) ||
    b.userRolling24hChargedCalls > b.rolling24hChargedCalls ||
    b.userRollingMinuteChargedCalls > b.userRolling24hChargedCalls ||
    b.activeActionLeases > b.activeLeases ||
    b.lastRequestStartedAtMs > (typeof b.observedAt === "string" ? Date.parse(b.observedAt) : NaN)
  )
    fail("budget-counters-invalid");
  fresh(b.observedAt, "budget");
  if (reasons.size) return result();
  if (b.rolling24hChargedMicrousd !== 0 || b.invalidRows !== 0) fail("zero-spend-ledger-required");
  if (b.activeLeases !== 0 || b.activeActionLeases !== 0) fail("budget-lease-unsettled");
  if (b.rolling24hChargedCalls + plan.maxCalls > policy.dailyCalls - policy.interactiveReserveCalls)
    fail("shared-action-headroom-insufficient");
  if (
    b.userRolling24hChargedCalls + plan.maxCalls >
      policy.playerDailyCalls - policy.playerInteractiveReserveCalls ||
    b.userRollingMinuteChargedCalls + firstMinuteStarts >
      policy.playerMinuteCalls - policy.playerInteractiveReserveMinuteCalls
  )
    fail("caller-headroom-insufficient");
  if (b.lastRequestStartedAtMs > 0 && nowMs - b.lastRequestStartedAtMs < plan.intervalMs)
    fail("request-pacing-not-ready");

  const p = snapshot.provider ?? {},
    utc = p.utc ?? {};
  const providerCounts = [
    "rollingMinuteCalls",
    "rolling24hCalls",
    "rolling31dCalls",
    "rollingMinuteReservedTokens",
    "rolling24hReservedTokens",
    "activeLeases",
    "accountCooldownUntilMs",
    "modelCooldownUntilMs",
  ];
  if (
    !keysAre(p, [
      "observedAt",
      "model",
      "sameAccountAsDeployment",
      "modelAvailable",
      "pricing",
      "accountBlocked",
      "modelBlocked",
      "utc",
      ...providerCounts,
    ]) ||
    providerCounts.some((key) => !whole(p[key])) ||
    p.rollingMinuteCalls > p.rolling24hCalls ||
    p.rolling24hCalls > p.rolling31dCalls ||
    p.rollingMinuteReservedTokens > p.rolling24hReservedTokens ||
    !keysAre(utc, ["date", "used", "remaining", "limit"]) ||
    ![utc.used, utc.remaining, utc.limit].every(whole) ||
    utc.limit < 1 ||
    utc.used + utc.remaining !== utc.limit
  )
    fail("provider-counters-invalid");
  fresh(p.observedAt, "provider");
  if (p.model !== route.model || p.sameAccountAsDeployment !== true)
    fail("provider-evidence-not-bound-to-deployment");
  if (reasons.size) return result();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (
    utc.date !== today ||
    utc.date !== (typeof p.observedAt === "string" ? p.observedAt.slice(0, 10) : null)
  )
    fail("provider-utc-day-mismatch");
  if (
    p.modelAvailable !== true ||
    !object(p.pricing) ||
    !Object.hasOwn(p.pricing, "prompt") ||
    !Object.hasOwn(p.pricing, "completion") ||
    !Object.values(p.pricing).every(zeroPrice)
  )
    fail("known-zero-model-pricing-required");
  if (
    p.accountBlocked !== false ||
    p.modelBlocked !== false ||
    p.accountCooldownUntilMs > nowMs ||
    p.modelCooldownUntilMs > nowMs
  )
    fail("provider-health-not-ready");
  if (p.activeLeases !== 0) fail("provider-lease-unsettled");
  if (
    p.rollingMinuteCalls + firstMinuteStarts > provider.limits.rpm ||
    p.rolling24hCalls + plan.maxCalls > provider.limits.rpd ||
    p.rolling31dCalls + plan.maxCalls > provider.limits.monthly ||
    utc.remaining < plan.maxCalls ||
    utc.used + plan.maxCalls > operator.providerDayCallCeiling
  )
    fail("provider-call-headroom-insufficient");
  // Router reserves UTF-8(system + user) + 256 + max output, even when actual
  // token usage is smaller. This supplied bound must be enforced during the run.
  const reservedTokensPerCall = plan.maxInputUtf8Bytes + 256 + route.maxTokens;
  if (
    !Number.isSafeInteger(reservedTokensPerCall) ||
    p.rollingMinuteReservedTokens + firstMinuteStarts * reservedTokensPerCall >
      provider.limits.tpm ||
    p.rolling24hReservedTokens + reservedTokensPerCall * plan.maxCalls > provider.limits.tpd
  )
    fail("provider-token-headroom-insufficient");
  const midnight = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
  return result({
    plannedCalls: whole(plan.maxCalls) ? plan.maxCalls : null,
    reservedTokensPerCall: whole(reservedTokensPerCall) ? reservedTokensPerCall : null,
    validUntil: dates.length
      ? new Date(
          Math.min(midnight, ...dates.map((time) => time + SNAPSHOT_MAX_AGE_MS)),
        ).toISOString()
      : null,
    recheckBeforeEveryRequest: true,
  });
}

async function main() {
  let report;
  try {
    if (
      process.argv.length !== 4 ||
      process.argv[2] !== "--snapshot" ||
      !process.argv[3].endsWith(".json")
    )
      throw new Error("snapshot-required");
    const file = await open(process.argv[3], "r");
    let snapshot;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("snapshot-file-invalid");
      snapshot = JSON.parse(await file.readFile("utf8"));
    } finally {
      await file.close();
    }
    report = await assessMeetingAcceptance(snapshot);
  } catch {
    // Never echo paths, raw input, credentials or exception text.
    report = {
      status: "not-ready",
      reasons: ["sanitized-snapshot-file-required"],
      liveHeadroomVerified: false,
      permissionGranted: false,
      reservedCalls: 0,
    };
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.status === "not-ready" ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
