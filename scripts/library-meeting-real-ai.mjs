import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { parseEnv } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";
import { MIND_SYSTEM } from "../src/lib/mind.gateway.ts";
import { validateConfig } from "../src/lib/mind-pool/config.ts";
import { routeMind } from "../src/lib/mind-pool/router.ts";
import { SqlQuotaStore } from "../src/lib/mind-pool/store.ts";
import { DEFAULT_BUDGET, validateBudgetPolicy } from "../src/lib/mind-budget/policy.ts";
import { SqlMindBudgetStore } from "../src/lib/mind-budget/store.ts";
import { runBudgetedMind } from "../src/lib/mind-budget/runner.ts";
import { auditDiscussionDelivery, auditDiscussionReload } from "./library-meeting-audit.mjs";
import { currentDiscussionFloorJob } from "./library-meeting-floor-probe.mjs";

// One explicitly authorized operator experiment, not hosted-user authentication.
// No production town/config/database is loaded. Only the existing provider key
// is extracted; every budget/quota write is to a new local disposable ledger.
const BASE = "https://openrouter.ai/api/v1";
const MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const ORIGINAL_ALLOWANCE = 12;
const SAVED_DAILY_CEILING = 24;
const mode = process.argv[2];
assert.ok(process.argv.length === 3 && ["--preflight", "--run"].includes(mode));
const extraCalls = Number(process.env.MEETING_TRIAL_AUTHORIZED_EXTRA_FREE_CALLS || 0);
assert.ok(
  [0, ORIGINAL_ALLOWANCE].includes(extraCalls),
  "Additional calls need explicit bounded authority",
);
const resumePath = process.env.MEETING_TRIAL_RESUME_REPORT;
const floorProbePath = process.env.MEETING_TRIAL_FLOOR_PROBE_REPORT;
const facilitator = process.env.MEETING_TRIAL_FACILITATOR || (resumePath ? "arwyn" : "northern");
assert.ok(["northern", "arwyn"].includes(facilitator), "Choose a supported proposed facilitator");
const previousPath = process.env.MEETING_TRIAL_PRIOR_REPORT;
const previousBytes = previousPath ? await readFile(previousPath) : null;
const previous = previousBytes ? JSON.parse(previousBytes.toString("utf8")) : null;
if (previous) {
  assert.equal(extraCalls, 0, "Carry-forward cannot also create a fresh allowance");
  assert.equal(previous.model, MODEL);
  assert.equal(previous.maxCalls, ORIGINAL_ALLOWANCE);
  assert.equal(previous.preflight.authorizedAdditionalFreeCalls, ORIGINAL_ALLOWANCE);
  assert.equal(previous.preflight.freeRequests.used, 25);
  assert.equal(previous.preflight.experimentAccountCeiling, 37);
  assert.equal(previous.transmissions, 1, "Continue only the recorded one-call original trial");
  assert.equal(previous.meeting.status, "closed");
  assert.equal(previous.meeting.pending, null);
  assert.equal(
    previous.decisions.reduce((sum, row) => sum + row.transmissions, 0),
    1,
  );
  assert.equal(previous.ledger.budget.length, 1);
  assert.equal(previous.ledger.budget[0].charged_calls, 1);
  assert.equal(previous.ledger.budget[0].settled, true);
  assert.equal(previous.ledger.pool.length, 1);
  assert.equal(previous.ledger.pool[0].settled, true);
  assert.equal(
    new Date(previous.finishedAt).toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
    "Carry-forward is authorized for the original UTC day only",
  );
}
const initialRemaining = previous
  ? ORIGINAL_ALLOWANCE - previous.transmissions
  : ORIGINAL_ALLOWANCE;
const carryForward = previous
  ? {
      priorReportSha256: createHash("sha256").update(previousBytes).digest("hex"),
      previousTrialSourceHead: previous.sourceHead,
      originalAuthorizedCalls: ORIGINAL_ALLOWANCE,
      previousTransmissions: previous.transmissions,
      remainingAuthorizedCalls: initialRemaining,
      inheritedAccountCeiling: previous.preflight.experimentAccountCeiling,
    }
  : null;
const resumeBytes = resumePath ? await readFile(resumePath) : null;
const resumed = resumeBytes ? JSON.parse(resumeBytes.toString("utf8")) : null;
if (resumePath) {
  assert.ok(previous && resumed, "Resume requires both original and paused meeting receipts");
  assert.equal(facilitator, "arwyn");
  assert.equal(extraCalls, 0, "Resume cannot create a fresh allowance");
  assert.equal(resumed.model, MODEL);
  assert.deepEqual(
    resumed.carryForward,
    carryForward,
    "Resume must inherit the verified original grant",
  );
  assert.equal(resumed.preflight.experimentAccountCeiling, 37);
  assert.equal(resumed.maxCalls, 11);
  assert.equal(resumed.transmissions, 5, "Resume only the recorded five-call Arwyn meeting");
  assert.equal(resumed.meeting.facilitator, "arwyn");
  assert.equal(resumed.meeting.status, "paused");
  assert.equal(resumed.meeting.pending, null);
  assert.equal(resumed.meeting.utterances.length, 0);
  assert.equal(resumed.playerAttention.length, 0);
  assert.equal(resumed.stopReason, "unreachable");
  assert.equal(resumed.decisions.length, 5);
  assert.ok(resumed.decisions.every((row) => row.transmissions === 1));
  assert.ok(resumed.decisions.slice(0, -1).every((row) => row.ok && row.result?.ok));
  const failure = resumed.decisions.at(-1);
  assert.equal(failure.ok, false);
  assert.equal(failure.attempts.length, 1);
  assert.equal(failure.attempts[0].status, 200);
  assert.equal(failure.attempts[0].outcome, "invalid");
  assert.equal(failure.attempts[0].response.invalidReason, "empty");
  assert.equal(failure.attempts[0].response.responseCharacters, 0);
  assert.equal(resumed.ledger.budget.length, resumed.transmissions);
  assert.ok(resumed.ledger.budget.every((row) => row.charged_calls === 1 && row.settled));
  assert.equal(resumed.ledger.pool.length, resumed.transmissions);
  assert.ok(resumed.ledger.pool.every((row) => row.settled));
  assert.equal(
    new Date(resumed.finishedAt).toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
    "Resume is authorized for the original UTC day only",
  );
}
const resumeRemaining = initialRemaining - (resumed?.transmissions ?? 0);
const initialResumption = resumed
  ? {
      pausedReportSha256: createHash("sha256").update(resumeBytes).digest("hex"),
      pausedTrialSourceHead: resumed.sourceHead,
      meetingId: resumed.meeting.id,
      originalAuthorizedCalls: ORIGINAL_ALLOWANCE,
      originalTrialTransmissions: previous.transmissions,
      pausedMeetingTransmissions: resumed.transmissions,
      previouslySpentCalls: previous.transmissions + resumed.transmissions,
      remainingAuthorizedCalls: resumeRemaining,
      inheritedAccountCeiling: carryForward.inheritedAccountCeiling,
    }
  : null;
const floorProbeBytes = floorProbePath ? await readFile(floorProbePath) : null;
const floorSource = floorProbeBytes ? JSON.parse(floorProbeBytes.toString("utf8")) : null;
if (floorProbePath) {
  assert.ok(
    previous && resumed && floorSource,
    "Floor probe requires the complete prior receipt chain",
  );
  assert.equal(floorSource.model, MODEL);
  assert.deepEqual(floorSource.carryForward, carryForward);
  for (const [field, value] of Object.entries(initialResumption))
    assert.deepEqual(
      floorSource.resumption[field],
      value,
      "Floor probe parent receipt does not match",
    );
  assert.equal(floorSource.preflight.experimentAccountCeiling, 37);
  assert.equal(floorSource.maxCalls, 6);
  assert.equal(floorSource.transmissions, 2);
  assert.equal(floorSource.cumulativeTransmissions, 8);
  assert.equal(floorSource.cumulativeMeetingTransmissions, 7);
  assert.equal(floorSource.cumulativeLedgerCharges, 7);
  assert.equal(floorSource.meeting.id, resumed.meeting.id);
  assert.equal(floorSource.meeting.facilitator, "arwyn");
  assert.equal(floorSource.meeting.status, "paused");
  assert.equal(floorSource.meeting.pending, null);
  assert.equal(floorSource.meeting.floor?.actor, "arwyn");
  assert.equal(floorSource.meeting.utterances.length, 0);
  assert.equal(floorSource.playerAttention.length, 0);
  assert.equal(floorSource.stopReason, "unreachable");
  assert.equal(floorSource.decisions.length, 2);
  assert.ok(floorSource.decisions.every((row) => row.transmissions === 1));
  assert.equal(floorSource.decisions[0].actor, "northern");
  assert.equal(floorSource.decisions[0].decision.kind, "listen");
  assert.equal(floorSource.decisions[0].ok, true);
  assert.equal(floorSource.decisions[0].result.ok, true);
  const failure = floorSource.decisions[1];
  assert.equal(failure.actor, "sub");
  assert.equal(failure.ok, false);
  assert.equal(failure.attempts.length, 1);
  assert.equal(failure.attempts[0].status, 200);
  assert.equal(failure.attempts[0].outcome, "invalid");
  assert.equal(failure.attempts[0].response.invalidReason, "empty");
  assert.equal(failure.attempts[0].response.responseCharacters, 0);
  assert.equal(floorSource.ledger.budget.length, 7);
  assert.ok(floorSource.ledger.budget.every((row) => row.charged_calls === 1 && row.settled));
  assert.equal(floorSource.ledger.pool.length, 7);
  assert.ok(floorSource.ledger.pool.every((row) => row.settled));
  assert.equal(
    new Date(floorSource.finishedAt).toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
    "Floor probe is authorized for the original UTC day only",
  );
}
const sourceReport = floorSource || resumed;
const sourcePath = floorProbePath || resumePath;
const priorMeetingTransmissions = (resumed?.transmissions ?? 0) + (floorSource?.transmissions ?? 0);
const MAX_CALLS = initialRemaining - priorMeetingTransmissions;
assert.ok(Number.isSafeInteger(MAX_CALLS) && MAX_CALLS > 0 && MAX_CALLS <= ORIGINAL_ALLOWANCE);
const resumption = sourceReport
  ? {
      ...initialResumption,
      pausedReportSha256: createHash("sha256")
        .update(floorProbeBytes || resumeBytes)
        .digest("hex"),
      pausedTrialSourceHead: sourceReport.sourceHead,
      pausedMeetingTransmissions: priorMeetingTransmissions,
      previouslySpentCalls: previous.transmissions + priorMeetingTransmissions,
      remainingAuthorizedCalls: MAX_CALLS,
    }
  : null;
const floorProbe = floorSource
  ? {
      method: "targeted-floor-probe",
      priorReportSha256: resumption.pausedReportSha256,
      priorMeetingTransmissions,
      remainingAuthorizedCalls: MAX_CALLS,
    }
  : null;
const resumeTownPath = sourceReport
  ? resolve(dirname(resolve(sourcePath)), "final-town.json")
  : null;
const resumeTownBytes = resumeTownPath ? await readFile(resumeTownPath) : null;
const savedResumeTown = resumeTownBytes ? JSON.parse(resumeTownBytes.toString("utf8")) : null;
if (sourceReport) {
  assert.equal(savedResumeTown.version, 2);
  assert.equal(savedResumeTown.town.discussions.sessions.length, 1);
  assert.deepEqual(savedResumeTown.town.discussions.sessions[0], sourceReport.meeting);
}
const envFile = process.env.MEETING_TRIAL_ENV_FILE;
const key = (
  process.env.OPENROUTER_API_KEY ||
  (envFile ? parseEnv(await readFile(envFile, "utf8")).OPENROUTER_API_KEY : "")
)?.trim();
assert.ok(key?.startsWith("sk-or-v1-"), "Existing OpenRouter credential required");

async function account() {
  const response = await fetch(`${BASE}/key`, {
    headers: { Authorization: `Bearer ${key}` },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  assert.equal(response.status, 200, "Read-only provider preflight failed");
  const { data } = await response.json();
  const requests = data.free_model_daily_requests;
  assert.ok(
    requests &&
      Number.isSafeInteger(requests.used) &&
      requests.used >= 0 &&
      Number.isSafeInteger(requests.remaining) &&
      requests.remaining >= 0,
    "Actual provider free-request headroom required",
  );
  return {
    at: new Date().toISOString(),
    freeTier: data.is_free_tier,
    freeRequests: requests,
    monetaryUsageToday: data.usage_daily ?? null,
  };
}
const beforeAccount = await account();
const modelsResponse = await fetch(`${BASE}/models`, {
  redirect: "error",
  signal: AbortSignal.timeout(12_000),
});
assert.equal(modelsResponse.status, 200);
const model = (await modelsResponse.json()).data.find((entry) => entry.id === MODEL);
assert.ok(model, "Exact free model unavailable");
const knownZero = (value) =>
  ((typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))) &&
  Number(value) === 0;
for (const value of Object.values(model.pricing))
  assert.ok(knownZero(value), "All reported model prices must be known zero values");
assert.ok(knownZero(model.pricing.prompt));
assert.ok(knownZero(model.pricing.completion));
// A new user-authorized allowance is per experiment. It never changes the
// saved ceiling, another experiment, an environment file or production policy.
const trialCeiling = previous
  ? previous.preflight.experimentAccountCeiling
  : extraCalls === ORIGINAL_ALLOWANCE
    ? Math.max(SAVED_DAILY_CEILING, beforeAccount.freeRequests.used + extraCalls)
    : SAVED_DAILY_CEILING;
const callAllowance = Math.max(
  0,
  Math.min(
    MAX_CALLS,
    beforeAccount.freeRequests.remaining,
    trialCeiling - beforeAccount.freeRequests.used,
  ),
);
const preflight = {
  ...beforeAccount,
  model: MODEL,
  pricing: model.pricing,
  requestedMaxCalls: MAX_CALLS,
  savedDailyCeiling: SAVED_DAILY_CEILING,
  authorizedAdditionalFreeCalls: extraCalls,
  carryForward,
  resumption,
  floorProbe,
  experimentAccountCeiling: trialCeiling,
  callAllowance,
};
if (mode === "--preflight") {
  console.log(JSON.stringify(preflight));
  process.exit(0);
}
assert.ok(
  previous ? callAllowance > 0 : callAllowance === MAX_CALLS,
  "The complete bounded meeting needs free headroom and authority",
);
const RUN_CALLS = callAllowance;
// A resumed ledger already contains five charged requests. Its original
// eleven-call cap remains in force while the separate dispatch guard allows six.
const LEDGER_CALL_LIMIT = resumed ? initialRemaining : RUN_CALLS;
assert.ok(process.env.MEETING_TRIAL_OUT, "One fixed exclusive output directory is required");
const out = resolve(process.env.MEETING_TRIAL_OUT);
for (const evidencePath of [previousPath, resumePath, floorProbePath].filter(Boolean)) {
  const fromEvidence = relative(dirname(resolve(evidencePath)), out);
  assert.ok(
    fromEvidence === ".." || fromEvidence.startsWith("../"),
    "New output must be outside preserved evidence directories",
  );
}
await mkdir(dirname(out), { recursive: true });
await mkdir(out, { recursive: false }); // An interrupted trial cannot restart its allowance.
if (carryForward || resumption) {
  // Claim the one authorized continuation outside the original evidence folder.
  // Another output path cannot reset the inherited eleven-call allowance.
  const claim = resolve(
    dirname(dirname(resolve(sourcePath || previousPath))),
    floorProbe
      ? `.meeting-floor-probe-${floorProbe.priorReportSha256}.json`
      : resumption
        ? `.meeting-resume-${resumption.pausedReportSha256}.json`
        : `.meeting-continuation-${carryForward.priorReportSha256}.json`,
  );
  await writeFile(
    claim,
    JSON.stringify({
      claimedAt: new Date().toISOString(),
      output: out,
      ...(floorProbe || resumption || carryForward),
    }),
    { flag: "wx" },
  );
}
const report = {
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(),
  scope:
    "One operator headless local meeting, real model and engine, synthetic town, local SQL accounting",
  model: MODEL,
  method: floorProbe ? "targeted-floor-probe" : "default-discussion-scheduler",
  maxCalls: RUN_CALLS,
  carryForward,
  resumption,
  floorProbe,
  ledgerCallLimit: LEDGER_CALL_LIMIT,
  preflight,
  transmissions: 0,
  decisions: [],
  speechAudits: [],
  playerAttention: [],
  stopReason: null,
};
const checkpoint = () => writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2));
await checkpoint();
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
      limits: {
        rpm: 2,
        rpd: LEDGER_CALL_LIMIT,
        monthly: LEDGER_CALL_LIMIT,
        tpm: 20_000,
        tpd: 100_000,
        concurrent: 1,
      },
      routes: Object.fromEntries(
        ["plan", "reflect", "talk", "player", "act"].map((kind) => [
          kind,
          {
            model: MODEL,
            maxTokens: 1200,
            rank: 1,
            reasoningEffort: "none",
          },
        ]),
      ),
    },
  ],
});
const policy = validateBudgetPolicy({
  ...DEFAULT_BUDGET,
  dailyCalls: LEDGER_CALL_LIMIT,
  playerDailyCalls: LEDGER_CALL_LIMIT,
  playerMinuteCalls: Math.min(2, LEDGER_CALL_LIMIT),
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
if (sourceReport)
  await cp(resolve(dirname(resolve(sourcePath)), "ledger"), resolve(out, "ledger"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
const db = new PGlite({ dataDir: resolve(out, "ledger"), parsers: { 20: Number } });
if (!sourceReport)
  for (const name of [
    "20261012_mind_pool.sql",
    "20261013_mind_budget.sql",
    "20261022_mind_actions.sql",
  ])
    await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
const sql = { query: async (query, params) => (await db.query(query, params)).rows };
const budgetUserHash = createHash("sha256")
  .update(`operator-library-meeting:${resumed ? dirname(resolve(resumePath)) : out}`)
  .digest("hex");
if (sourceReport) {
  const budget = await sql.query(
    "select user_hash, charged_calls, charged_microusd, completed_at is not null as settled from mind_budget_attempts",
  );
  const pool = await sql.query(
    "select provider, model, actual_tokens, outcome, status, completed_at is not null as settled from mind_pool_attempts",
  );
  assert.equal(
    budget.length,
    priorMeetingTransmissions,
    "Copied ledger must retain every prior charge",
  );
  assert.ok(
    budget.every(
      (row) =>
        row.user_hash === budgetUserHash &&
        row.charged_calls === 1 &&
        row.charged_microusd === 0 &&
        row.settled,
    ),
  );
  assert.equal(pool.length, priorMeetingTransmissions);
  assert.ok(
    pool.every((row) => row.provider === "openrouter" && row.model === MODEL && row.settled),
  );
  assert.deepEqual(
    pool.map(({ actual_tokens, outcome, status }) => ({ actual_tokens, outcome, status })),
    sourceReport.ledger.pool.map(({ actual_tokens, outcome, status }) => ({
      actual_tokens,
      outcome,
      status,
    })),
  );
  report.resumption.copiedLedgerCharges = budget.reduce((sum, row) => sum + row.charged_calls, 0);
  report.resumption.copiedLedgerAttempts = pool.length;
}
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
const d = await server.ssrLoadModule("/src/game/discussions.ts");
const { canHear } = await server.ssrLoadModule("/src/game/attention.ts");
const { exportTown, parseTownFile } = await server.ssrLoadModule("/src/game/save.ts");
const town = sourceReport
  ? parseTownFile(resumeTownBytes.toString("utf8"))
  : parseTownFile(exportTown(createTown("Observer")));
assert.ok(town, "The preserved final town must load without replacement");
const person = (id) => town.agents.find((agent) => agent.id === id);
if (!sourceReport)
  for (const [id, tile] of Object.entries({
    northern: { x: 42, y: 21 },
    arwyn: { x: 44, y: 21 },
    sub: { x: 43, y: 20 },
    player: { x: 43, y: 22 },
    baba: { x: 42, y: 22 },
  }))
    person(id).tile = tile;
const meeting = () => town.discussions.sessions.at(-1);
if (sourceReport) {
  assert.deepEqual(
    meeting(),
    sourceReport.meeting,
    "Saved meeting choices must match the paused receipt",
  );
  const memoryFacts = (value) =>
    value.agents.map(({ id, memories }) => ({
      id,
      memories: memories.map((memory) =>
        JSON.parse(
          JSON.stringify({
            ...memory,
            protected: Boolean(memory.protected),
            seed: Boolean(memory.seed),
          }),
        ),
      ),
    }));
  assert.deepEqual(memoryFacts(town), memoryFacts(savedResumeTown.town));
  const before = structuredClone(town);
  const result = d.resumeDiscussion(town);
  assert.ok(result.ok, result.message);
  assert.equal(meeting().id, sourceReport.meeting.id);
  assert.equal(meeting().epoch, sourceReport.meeting.epoch + 1);
  assert.deepEqual(meeting().members, sourceReport.meeting.members);
  assert.deepEqual(meeting().utterances, sourceReport.meeting.utterances);
  assert.deepEqual(meeting().usage, sourceReport.meeting.usage);
  assert.deepEqual(
    town.agents,
    before.agents,
    "Resuming must preserve all resident state and memories",
  );
  report.resumption.resumedEpoch = meeting().epoch;
  report.resumption.priorChoicesAndMemoriesPreserved = true;
  if (floorProbe) {
    const floorJob = currentDiscussionFloorJob(town, {
      observation: d.discussionObservation,
      isFresh: d.isDiscussionJobFresh,
    });
    assert.ok(
      floorJob && floorJob.agentId === "arwyn",
      "The saved Arwyn floor must still be eligible to speak",
    );
    assert.equal(meeting().members.find((member) => member.id === "northern").mode, "listening");
    assert.equal(meeting().members.find((member) => member.id === "sub").mode, "off");
    report.floorProbe.initialFloor = structuredClone(meeting().floor);
    report.floorProbe.defaultNextActor = d.nextDiscussionJob(town)?.agentId ?? null;
  }
}
const finance = (value) =>
  JSON.stringify({
    agents: value.agents.map(({ id, money }) => ({ id, money })),
    tills: value.tills,
    favors: value.favors,
    economy: value.economy,
  });
const startFinance = finance(town);
const initialMemories = new Map(
  town.agents.map((agent) => [agent.id, structuredClone(agent.memories)]),
);
const command = (decision) =>
  d.applyDiscussionCommand(town, "player", {
    ...decision,
    meetingId: meeting().id,
    expectedRevision: meeting().members.find((member) => member.id === "player").revision,
    commandId: `operator:${report.playerAttention.length}:${decision.kind}:${decision.invitee ?? "self"}`,
  });
if (!sourceReport) {
  assert.ok(
    d.createLibraryDiscussion(
      town,
      "Would a short shared reading at the library be worthwhile, and what would make it welcoming?",
      facilitator,
    ).ok,
  );
  for (const invitee of ["northern", "arwyn", "sub"]) {
    const result = command({ kind: "invite", invitee });
    assert.ok(result.ok, result.message);
  }
}
report.setup = {
  proposedFacilitator: facilitator,
  positions: town.agents.map(({ id, tile }) => ({ id, tile })),
  npcChoices: sourceReport
    ? "Existing AI acceptance and attention choices preserved; same meeting resumed explicitly once"
    : "Invitations delivered by the player; all acceptance, attention and speech remain AI choices",
  observer:
    "Player initially off; joins after first actual speech and stops after second if those turns occur",
  nearbyNonmember: "baba",
  gameTime: { day: town.day, minute: town.minute },
};
await writeFile(resolve(out, "initial-town.json"), exportTown(town));
let lastTransmission = sourceReport ? Date.parse(sourceReport.decisions.at(-1).at) || 0 : 0;
let retainedReceipts = structuredClone(meeting().utterances);
try {
  while (report.transmissions < RUN_CALLS && meeting().status !== "closed") {
    d.advanceDiscussions(town);
    const job = floorProbe
      ? currentDiscussionFloorJob(town, {
          observation: d.discussionObservation,
          isFresh: d.isDiscussionJobFresh,
        })
      : d.nextDiscussionJob(town);
    if (!job) {
      report.stopReason = floorProbe
        ? "No eligible reserved NPC floor remains; targeted probe stops without changing attention choices."
        : "No resident decision is ready; voluntary silence/decline is retained without coaxing.";
      break;
    }
    const waitMs = lastTransmission + 31_000 - Date.now();
    if (waitMs > 0) {
      console.log(JSON.stringify({ pacingMs: waitMs }));
      await new Promise((done) => setTimeout(done, waitMs));
    }
    const currentAccount = await account();
    assert.equal(
      currentAccount.at.slice(0, 10),
      preflight.at.slice(0, 10),
      "The same-day allowance has expired; no request transmitted",
    );
    assert.ok(
      currentAccount.freeRequests.used < trialCeiling && currentAccount.freeRequests.remaining > 0,
      "Account headroom exhausted; no request transmitted",
    );
    assert.ok(d.markDiscussionRequest(town, job));
    const prompt = buildPrompt(town, job);
    const observation = JSON.parse(prompt.split("\nCurrent observation: ")[1]);
    assert.deepEqual(observation, d.discussionObservation(town, job.agentId, job.meetingId));
    const expectedKnown = meeting()
      .utterances.filter(
        (line) => line.speaker === job.agentId || line.recipientIds.includes(job.agentId),
      )
      .map((line) => line.id);
    assert.deepEqual(
      observation.receivedTurns.map((line) => line.id),
      expectedKnown,
      "Outgoing real prompt must contain exactly this actor's received turns",
    );
    const row = {
      number: report.decisions.length + 1,
      actor: job.agentId,
      method: report.method,
      at: new Date().toISOString(),
      observation,
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
      userHash: budgetUserHash,
      system: MIND_SYSTEM,
      user: prompt,
      maxAttempts: 1,
      maxOutputTokens: 1200,
      leaseMs: 30_000,
      policy,
      store: budgetStore,
      scope: "shared",
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
            assert.ok(!body.tools && !body.response_format);
            assert.ok(report.transmissions < RUN_CALLS && row.transmissions === 0);
            report.transmissions++;
            row.transmissions++;
            lastTransmission = Date.now();
            await checkpoint();
            const response = await fetch(url, init);
            const payload = await response
              .clone()
              .json()
              .catch(() => null);
            if (typeof payload?.usage?.cost === "number") row.reportedCostUSD = payload.usage.cost;
            const safeField = (value) =>
              typeof value === "number" && Number.isFinite(value)
                ? value
                : typeof value === "string"
                  ? value
                      .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
                      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
                      .slice(0, 240)
                  : null;
            const providerMetadata = {
              id: safeField(payload?.id),
              provider: safeField(payload?.provider ?? payload?.error?.metadata?.provider_name),
              errorCode: safeField(payload?.error?.code),
              errorMessage: safeField(payload?.error?.message),
            };
            if (Object.values(providerMetadata).some((value) => value !== null))
              row.providerMetadata = providerMetadata;
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
    if (result.ok) row.rawDecisionJSON = result.text;
    const parsed = result.ok ? parseMind(job, result.text) : null;
    let committedSpeech = null;
    if (!parsed || parsed.kind !== "act" || parsed.task !== "discussion") {
      row.error = result.error ?? "Invalid discussion decision";
      report.stopReason = row.error;
      d.pauseDiscussion(town, "Real AI unavailable or invalid; no retry or substitute dialogue.");
    } else {
      d.advanceDiscussions(town);
      const before = structuredClone(town);
      row.decision = parsed.decision;
      row.result = d.applyDiscussionResult(town, parsed);
      if (!row.result.ok) {
        report.stopReason = row.result.message;
        d.pauseDiscussion(town, row.result.message);
      } else if (
        meeting().utterances.length > before.discussions.sessions.at(-1).utterances.length
      ) {
        committedSpeech = { before, utterance: meeting().utterances.at(-1) };
      }
    }
    d.recordDiscussionUsage(town, job, {
      elapsedMs: row.elapsedMs,
      attempts: row.transmissions,
      totalTokens: row.attempts[0]?.actualTokens ?? null,
      success: Boolean(row.result?.ok),
    });
    if (committedSpeech) {
      const { before, utterance } = committedSpeech;
      report.speechAudits.push(
        auditDiscussionDelivery({
          before,
          after: town,
          utterance,
          canHear,
          observation: (value, id) => d.discussionObservation(value, id),
        }),
      );
      assert.deepEqual(meeting().utterances.slice(0, retainedReceipts.length), retainedReceipts);
      retainedReceipts = structuredClone(meeting().utterances);
      if (meeting().status !== "closed" && [1, 2].includes(retainedReceipts.length)) {
        const kind = retainedReceipts.length === 1 ? "listen" : "stop-listening";
        const changed = command({ kind });
        assert.ok(changed.ok, changed.message);
        report.playerAttention.push({ afterTurn: utterance.id, kind, result: changed });
        assert.deepEqual(
          meeting().utterances,
          retainedReceipts,
          "Attention must not rewrite old receipts",
        );
      }
    }
    if (row.reportedCostUSD !== null && row.reportedCostUSD !== 0)
      report.stopReason = "Unexpected nonzero reported provider cost; no further calls.";
    if (floorProbe && ["pass", "leave", "close", "stop-listening"].includes(row.decision?.kind))
      report.stopReason =
        "The floor holder chose to stop, pass or leave; targeted probe ends without coaxing.";
    assert.equal(finance(town), startFinance, "Meeting decision changed financial state; stop now");
    assert.deepEqual(person("baba").memories, initialMemories.get("baba"));
    console.log(
      JSON.stringify({
        decision: row.number,
        actor: job.agentId,
        chosen: row.decision,
        result: row.result,
        elapsedMs: row.elapsedMs,
        tokens: row.attempts[0]?.actualTokens ?? null,
        error: row.error,
      }),
    );
    await writeFile(resolve(out, "current-town.json"), exportTown(town));
    await checkpoint();
    if (report.stopReason) break;
  }
  report.stopReason ??=
    meeting().status === "closed"
      ? meeting().reason
      : `${RUN_CALLS}-call allowance exhausted; no restart or further trial.`;
} catch (error) {
  report.stopReason = `Qualification stopped: ${error instanceof Error ? error.message : "guard failure"}`;
  d.pauseDiscussion(town, "Qualification stopped without retry or fallback.");
} finally {
  if (meeting().status !== "closed") d.pauseDiscussion(town, report.stopReason);
  report.finishedAt = new Date().toISOString();
  report.aiWaitMs = report.decisions.reduce((sum, row) => sum + (row.elapsedMs || 0), 0);
  report.meeting = structuredClone(meeting());
  report.financeUnchanged = startFinance === finance(town);
  report.memoryKnowledge = town.agents.map((agent) => ({
    id: agent.id,
    receivedTurnIds:
      d.discussionObservation(town, agent.id)?.receivedTurns?.map((line) => line.id) ?? [],
    newMemories: agent.memories.filter(
      (memory) => !initialMemories.get(agent.id).some((old) => old.id === memory.id),
    ),
  }));
  const restored = parseTownFile(exportTown(town));
  report.saveRoundTrip = JSON.stringify(restored.discussions) === JSON.stringify(town.discussions);
  report.reloadKnowledgeUnchanged = town.agents.every(
    (agent) =>
      JSON.stringify(d.discussionObservation(restored, agent.id).receivedTurns) ===
      JSON.stringify(d.discussionObservation(town, agent.id).receivedTurns),
  );
  try {
    report.reloadAudit = auditDiscussionReload({
      before: town,
      after: restored,
      meetingId: meeting().id,
      observation: d.discussionObservation,
    });
  } catch (error) {
    report.reloadAuditFailure = error instanceof Error ? error.message : "Reload audit failed";
  }
  const lines = meeting().utterances;
  report.hearingQualification = {
    actualSpokenTurns: lines.length,
    independentlyAuditedTurns: report.speechAudits.length,
    onlyOptedInResidentsReceivedObservedSpeech:
      lines.length > 0 ? lines.length === report.speechAudits.length : null,
    nearbyBabaExcluded:
      lines.length > 0 ? lines.every((line) => !line.recipientIds.includes("baba")) : null,
    playerExcludedBeforeListening:
      lines.length > 0 ? !lines[0].recipientIds.includes("player") : null,
    playerReceivedAfterJoining: lines.length > 1 ? lines[1].recipientIds.includes("player") : null,
    playerExcludedAfterStopping:
      lines.length > 2
        ? lines.slice(2).every((line) => !line.recipientIds.includes("player"))
        : null,
    unexercisedCasesRemainUnqualified: true,
  };
  report.outcome =
    report.financeUnchanged &&
    report.saveRoundTrip &&
    report.reloadKnowledgeUnchanged &&
    !report.reloadAuditFailure &&
    !report.stopReason.startsWith("Qualification stopped:") &&
    report.hearingQualification.onlyOptedInResidentsReceivedObservedSpeech === true
      ? "observed-speech-hearing-verified"
      : lines.length === 0
        ? "no-speech-hearing-unqualified"
        : "hearing-not-qualified";
  report.ledger = {
    budget: await sql.query(
      "select kind, charged_calls, charged_microusd, completed_at is not null as settled from mind_budget_attempts",
    ),
    pool: await sql.query(
      "select kind, actual_tokens, outcome, status, latency_ms, completed_at is not null as settled from mind_pool_attempts",
    ),
  };
  report.cumulativeTransmissions =
    (previous?.transmissions ?? 0) + priorMeetingTransmissions + report.transmissions;
  report.cumulativeMeetingTransmissions = priorMeetingTransmissions + report.transmissions;
  report.cumulativeLedgerCharges = report.ledger.budget.reduce(
    (sum, row) => sum + row.charged_calls,
    0,
  );
  assert.ok(report.cumulativeTransmissions <= ORIGINAL_ALLOWANCE);
  assert.ok(report.cumulativeLedgerCharges >= report.cumulativeMeetingTransmissions);
  assert.ok(report.cumulativeLedgerCharges <= LEDGER_CALL_LIMIT);
  try {
    report.afterAccount = await account();
  } catch {
    report.afterAccount = null;
  }
  await writeFile(resolve(out, "final-town.json"), exportTown(town));
  await checkpoint();
  await server.close();
  await db.close();
  console.log(
    JSON.stringify({
      out,
      transmissions: report.transmissions,
      turns: report.meeting.utterances.length,
      stopReason: report.stopReason,
      financeUnchanged: report.financeUnchanged,
      usage: report.meeting.usage,
    }),
  );
}
