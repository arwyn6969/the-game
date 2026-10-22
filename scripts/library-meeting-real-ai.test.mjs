import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
// Isolated fake network only. No existing key, environment file or provider is
// read. A single synthetic decline exercises a real route/ledger/engine finish.
const fixture = `
globalThis.fetch = async (url, init) => {
  if (url === 'https://openrouter.ai/api/v1/key') return Response.json({data:{
    is_free_tier:true,usage_daily:0,free_model_daily_requests:{used:Number(process.env.FIXTURE_USED),limit:50,remaining:Number(process.env.FIXTURE_REMAINING)}
  }});
  if (url === 'https://openrouter.ai/api/v1/models') return Response.json({data:[{
    id:'nvidia/nemotron-3-ultra-550b-a55b:free',pricing:{prompt:process.env.FIXTURE_PRICE??'0',completion:'0'}
  }]});
  if (url === 'https://openrouter.ai/api/v1/chat/completions' && process.env.FIXTURE_GENERATE==='yes') {
    const body=JSON.parse(init.body);
    if (body.model !== 'nvidia/nemotron-3-ultra-550b-a55b:free') throw new Error('Wrong model');
    return Response.json({choices:[{message:{content:JSON.stringify({task:'discussion',decision:{kind:'decline'}})},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:14,total_tokens:44,cost:0}});
  }
  if (url === 'https://openrouter.ai/api/v1/chat/completions' && process.env.FIXTURE_GENERATE==='empty')
    return Response.json({id:'fixture-response',provider:'fixture-provider',error:{code:502,message:'Upstream empty sk-or-v1-fixture-hidden Bearer fixture-hidden'},choices:[{message:{content:''},finish_reason:null}]});
  if (url === 'https://openrouter.ai/api/v1/chat/completions' && process.env.FIXTURE_GENERATE==='pass')
    return Response.json({choices:[{message:{content:JSON.stringify({task:'discussion',decision:{kind:'pass'}})},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:14,total_tokens:44,cost:0}});
  throw new Error('Unexpected network operation; generation forbidden');
};
`;

async function evidenceDigest(path) {
  const hash = createHash("sha256");
  async function add(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const child = join(directory, entry.name);
      hash.update(child.slice(path.length));
      if (entry.isDirectory()) await add(child);
      else hash.update(await readFile(child));
    }
  }
  await add(path);
  return hash.digest("hex");
}

// Construct a synthetic five-attempt paused meeting with the real engine and
// SQL schema. Every acceptance here is test setup, never production dialogue.
async function prepareResume(dir, previousText, overrides) {
  const pausedDir = join(dir, "paused");
  await mkdir(pausedDir);
  const server = await createServer({
    root,
    configFile: false,
    envDir: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  let town;
  try {
    const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
    const save = await server.ssrLoadModule("/src/game/save.ts");
    const d = await server.ssrLoadModule("/src/game/discussions.ts");
    town = save.parseTownFile(save.exportTown(createTown("Observer")));
    for (const [id, tile] of Object.entries({
      northern: { x: 42, y: 21 },
      arwyn: { x: 44, y: 21 },
      sub: { x: 43, y: 20 },
      player: { x: 43, y: 22 },
      baba: { x: 42, y: 22 },
    }))
      town.agents.find((agent) => agent.id === id).tile = tile;
    assert.ok(d.createLibraryDiscussion(town, "A possible shared reading", "arwyn").ok);
    const meeting = town.discussions.sessions[0];
    for (const invitee of ["northern", "arwyn", "sub"])
      assert.ok(
        d.applyDiscussionCommand(town, "player", {
          kind: "invite",
          invitee,
          meetingId: meeting.id,
          expectedRevision: meeting.members.find((member) => member.id === "player").revision,
          commandId: `fixture-invite:${invitee}`,
        }).ok,
      );
    for (let index = 0; index < 5; index++) {
      d.advanceDiscussions(town);
      const job = d.nextDiscussionJob(town);
      assert.ok(d.markDiscussionRequest(town, job));
      if (index < 4)
        assert.ok(
          d.applyDiscussionResult(town, {
            ...job,
            mind: "grok",
            decision: { kind: index < 3 ? "accept" : "participate" },
          }).ok,
        );
      else
        d.pauseDiscussion(town, "Real AI unavailable or invalid; no retry or substitute dialogue.");
      d.recordDiscussionUsage(town, job, {
        elapsedMs: 10,
        attempts: 1,
        totalTokens: index < 4 ? 40 : null,
        success: index < 4,
      });
    }
    d.pauseDiscussion(town, "unreachable");
    const saved = save.exportTown(town);
    await writeFile(join(pausedDir, "final-town.json"), saved);
    const rawInvitation = JSON.parse(saved)
      .town.agents.find((agent) => agent.id === "arwyn")
      .memories.at(-1);
    assert.equal(
      Object.hasOwn(rawInvitation, "seed"),
      false,
      "Saved invitation omits default flags just as the real final town does",
    );
    town = save.parseTownFile(saved);
    assert.equal(town.agents.find((agent) => agent.id === "arwyn").memories.at(-1).seed, false);
  } finally {
    await server.close();
  }
  const db = new PGlite({ dataDir: join(pausedDir, "ledger") });
  try {
    for (const name of [
      "20261012_mind_pool.sql",
      "20261013_mind_budget.sql",
      "20261022_mind_actions.sql",
    ])
      await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    const userHash = createHash("sha256")
      .update(`operator-library-meeting:${pausedDir}`)
      .digest("hex");
    for (let index = 0; index < 5; index++) {
      const at = Date.now() - 120_000 - index;
      await db.query("insert into mind_budget_attempts values ($1,$2,'act',$3,$3,$3,1,1,0,0)", [
        `budget-${index}`,
        userHash,
        at,
      ]);
      await db.query(
        "insert into mind_pool_attempts values ($1,'openrouter',$2,'act',$3,$3,$3,1500,$4,$5,200,10)",
        [
          `pool-${index}`,
          "nvidia/nemotron-3-ultra-550b-a55b:free",
          at,
          index < 4 ? 40 : null,
          index < 4 ? "ok" : "invalid",
        ],
      );
    }
  } finally {
    await db.close();
  }
  const original = JSON.parse(previousText);
  const carryForward = {
    priorReportSha256: createHash("sha256").update(previousText).digest("hex"),
    previousTrialSourceHead: original.sourceHead,
    originalAuthorizedCalls: 12,
    previousTransmissions: 1,
    remainingAuthorizedCalls: 11,
    inheritedAccountCeiling: 37,
  };
  const report = {
    sourceHead: "b".repeat(40),
    model: original.model,
    maxCalls: 11,
    carryForward,
    preflight: { experimentAccountCeiling: 37 },
    transmissions: 5,
    finishedAt: new Date().toISOString(),
    meeting: town.discussions.sessions[0],
    playerAttention: [],
    stopReason: "unreachable",
    decisions: Array.from({ length: 5 }, (_, index) => ({
      transmissions: 1,
      ok: index < 4,
      at: new Date(Date.now() - 120_000).toISOString(),
      ...(index < 4
        ? { result: { ok: true } }
        : {
            attempts: [
              {
                status: 200,
                outcome: "invalid",
                response: { invalidReason: "empty", responseCharacters: 0 },
              },
            ],
          }),
    })),
    ledger: {
      budget: Array.from({ length: 5 }, () => ({ charged_calls: 1, settled: true })),
      pool: Array.from({ length: 5 }, (_, index) => ({
        settled: true,
        actual_tokens: index < 4 ? 40 : null,
        outcome: index < 4 ? "ok" : "invalid",
        status: 200,
      })),
    },
    ...(typeof overrides === "object" ? overrides : {}),
  };
  const path = join(pausedDir, "report.json");
  await writeFile(path, JSON.stringify(report));
  return { path, town, digest: await evidenceDigest(pausedDir) };
}

async function prepareFloorProbe(dir, paused, overrides) {
  const floorDir = join(dir, "resumed");
  await mkdir(floorDir);
  const parentBytes = await readFile(paused.path);
  const parent = JSON.parse(parentBytes);
  const server = await createServer({
    root,
    configFile: false,
    envDir: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  let town;
  try {
    const save = await server.ssrLoadModule("/src/game/save.ts");
    const d = await server.ssrLoadModule("/src/game/discussions.ts");
    town = save.parseTownFile(await readFile(join(dir, "paused", "final-town.json"), "utf8"));
    assert.ok(d.resumeDiscussion(town).ok);
    for (let index = 0; index < 2; index++) {
      const job = d.nextDiscussionJob(town);
      assert.equal(job.agentId, index === 0 ? "northern" : "sub");
      assert.ok(d.markDiscussionRequest(town, job));
      if (index === 0)
        assert.ok(
          d.applyDiscussionResult(town, { ...job, mind: "grok", decision: { kind: "listen" } }).ok,
        );
      else
        d.pauseDiscussion(town, "Real AI unavailable or invalid; no retry or substitute dialogue.");
      d.recordDiscussionUsage(town, job, {
        elapsedMs: 10,
        attempts: 1,
        totalTokens: index === 0 ? 40 : null,
        success: index === 0,
      });
    }
    d.pauseDiscussion(town, "unreachable");
    await writeFile(join(floorDir, "final-town.json"), save.exportTown(town));
  } finally {
    await server.close();
  }
  await cp(join(dir, "paused", "ledger"), join(floorDir, "ledger"), { recursive: true });
  const db = new PGlite({ dataDir: join(floorDir, "ledger") });
  try {
    const userHash = createHash("sha256")
      .update(`operator-library-meeting:${join(dir, "paused")}`)
      .digest("hex");
    for (let index = 5; index < 7; index++) {
      const at = Date.now() - 120_000 - index;
      await db.query("insert into mind_budget_attempts values ($1,$2,'act',$3,$3,$3,1,1,0,0)", [
        `budget-${index}`,
        userHash,
        at,
      ]);
      await db.query(
        "insert into mind_pool_attempts values ($1,'openrouter',$2,'act',$3,$3,$3,1500,$4,$5,200,10)",
        [
          `pool-${index}`,
          parent.model,
          at,
          index === 5 ? 40 : null,
          index === 5 ? "ok" : "invalid",
        ],
      );
    }
  } finally {
    await db.close();
  }
  const report = {
    sourceHead: "c".repeat(40),
    model: parent.model,
    maxCalls: 6,
    carryForward: parent.carryForward,
    resumption: {
      pausedReportSha256: createHash("sha256").update(parentBytes).digest("hex"),
      pausedTrialSourceHead: parent.sourceHead,
      meetingId: parent.meeting.id,
      originalAuthorizedCalls: 12,
      originalTrialTransmissions: 1,
      pausedMeetingTransmissions: 5,
      previouslySpentCalls: 6,
      remainingAuthorizedCalls: 6,
      inheritedAccountCeiling: 37,
    },
    preflight: { experimentAccountCeiling: 37 },
    transmissions: 2,
    cumulativeTransmissions: 8,
    cumulativeMeetingTransmissions: 7,
    cumulativeLedgerCharges: 7,
    finishedAt: new Date().toISOString(),
    meeting: town.discussions.sessions[0],
    playerAttention: [],
    stopReason: "unreachable",
    decisions: [
      {
        actor: "northern",
        decision: { kind: "listen" },
        transmissions: 1,
        ok: true,
        result: { ok: true },
        at: new Date(Date.now() - 120_000).toISOString(),
      },
      {
        actor: "sub",
        transmissions: 1,
        ok: false,
        at: new Date(Date.now() - 120_000).toISOString(),
        attempts: [
          {
            status: 200,
            outcome: "invalid",
            response: { invalidReason: "empty", responseCharacters: 0 },
          },
        ],
      },
    ],
    ledger: {
      budget: [
        ...parent.ledger.budget,
        { charged_calls: 1, settled: true },
        { charged_calls: 1, settled: true },
      ],
      pool: [
        ...parent.ledger.pool,
        { settled: true, actual_tokens: 40, outcome: "ok", status: 200 },
        { settled: true, actual_tokens: null, outcome: "invalid", status: 200 },
      ],
    },
    ...(typeof overrides === "object" ? overrides : {}),
  };
  const path = join(floorDir, "report.json");
  await writeFile(path, JSON.stringify(report));
  return { path, town, digest: await evidenceDigest(floorDir) };
}

async function invoke({
  used = 25,
  extra = "0",
  mode = "--preflight",
  existing = false,
  generate = false,
  price = "0",
  prior = false,
  remaining = 25,
  facilitator = "northern",
  replay = false,
  resume = false,
  floorProbe = false,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "meeting-real-gate-"));
  const preload = join(dir, "network-fixture.mjs");
  const out = join(dir, "trial");
  await writeFile(preload, fixture);
  let previousPath = "";
  let previousText = "";
  if (prior) {
    await mkdir(join(dir, "previous"));
    previousPath = join(dir, "previous", "report.json");
    previousText = JSON.stringify({
      sourceHead: "a".repeat(40),
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      maxCalls: 12,
      preflight: {
        authorizedAdditionalFreeCalls: 12,
        freeRequests: { used: 25 },
        experimentAccountCeiling: 37,
      },
      transmissions: 1,
      finishedAt: new Date().toISOString(),
      meeting: { status: "closed", pending: null },
      decisions: [{ transmissions: 1 }],
      ledger: { budget: [{ charged_calls: 1, settled: true }], pool: [{ settled: true }] },
      ...(typeof prior === "object" ? prior : {}),
    });
    await writeFile(previousPath, previousText);
  }
  const paused = resume ? await prepareResume(dir, previousText, resume) : null;
  const floor = floorProbe ? await prepareFloorProbe(dir, paused, floorProbe) : null;
  if (existing) {
    await writeFile(join(dir, "marker"), "preserved");
    // An already occupied path, even a file, must reject before generation.
    await writeFile(out, "original-trial");
  }
  try {
    const options = {
      cwd: root,
      encoding: "utf8",
      timeout: 20_000,
      env: {
        PATH: process.env.PATH,
        HOME: dir,
        TMPDIR: dir,
        OPENROUTER_API_KEY: "sk-or-v1-fixture-not-a-secret",
        MEETING_TRIAL_OUT: out,
        MEETING_TRIAL_AUTHORIZED_EXTRA_FREE_CALLS: extra,
        MEETING_TRIAL_PRIOR_REPORT: previousPath,
        MEETING_TRIAL_FACILITATOR: facilitator,
        MEETING_TRIAL_RESUME_REPORT: paused?.path ?? "",
        MEETING_TRIAL_FLOOR_PROBE_REPORT: floor?.path ?? "",
        FIXTURE_USED: String(used),
        FIXTURE_REMAINING: String(remaining),
        FIXTURE_GENERATE: typeof generate === "string" ? generate : generate ? "yes" : "no",
        FIXTURE_PRICE: price,
      },
    };
    const execute = () =>
      spawnSync(
        process.execPath,
        ["--import", preload, "scripts/library-meeting-real-ai.mjs", mode],
        options,
      );
    const result = execute();
    if (paused && generate) assert.equal(result.status, 0, result.stderr);
    let report = null;
    if (result.status === 0 && mode === "--run")
      report = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
    if (existing) assert.equal(await readFile(out, "utf8"), "original-trial");
    else if (mode === "--preflight" || result.status !== 0)
      await assert.rejects(access(out), { code: "ENOENT" });
    if (previousPath)
      assert.equal(
        await readFile(previousPath, "utf8"),
        previousText,
        "The first trial's evidence must remain byte-for-byte unchanged",
      );
    if (paused)
      assert.equal(
        await evidenceDigest(join(dir, "paused")),
        paused.digest,
        "Resume must not change the paused report, town or original ledger",
      );
    if (floor)
      assert.equal(
        await evidenceDigest(join(dir, "resumed")),
        floor.digest,
        "The prior resume evidence and seven-charge ledger stay unchanged",
      );
    if (replay) {
      options.env.MEETING_TRIAL_OUT = join(dir, "another-output");
      const replayed = execute();
      assert.notEqual(replayed.status, 0);
      assert.match(replayed.stderr, /EEXIST/);
      assert.equal(
        await readFile(join(out, "report.json"), "utf8"),
        JSON.stringify(report, null, 2),
      );
    }
    const initialTown = report
      ? JSON.parse(await readFile(join(out, "initial-town.json"), "utf8")).town
      : null;
    const finalTown = report
      ? JSON.parse(await readFile(join(out, "final-town.json"), "utf8")).town
      : null;
    return {
      ...result,
      report,
      initialTown,
      finalTown,
      pausedTown: paused?.town,
      floorTown: floor?.town,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("meeting preflight keeps the existing daily ceiling without new authority", async () => {
  const result = await invoke();
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.callAllowance, 0);
  assert.equal(data.savedDailyCeiling, 24);
  assert.equal(data.authorizedAdditionalFreeCalls, 0);
  assert.equal(data.requestedMaxCalls, 12);
});

test("continuation inherits eleven calls and the original account ceiling without rebasing", async () => {
  for (const [used, remaining, allowance] of [
    [26, 24, 11],
    [27, 23, 10],
    [37, 13, 0],
    [26, 0, 0],
  ]) {
    const result = await invoke({ prior: true, used, remaining, facilitator: "arwyn" });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.callAllowance, allowance);
    assert.equal(data.requestedMaxCalls, 11);
    assert.equal(data.experimentAccountCeiling, 37);
    assert.equal(data.authorizedAdditionalFreeCalls, 0);
    assert.equal(data.carryForward.originalAuthorizedCalls, 12);
    assert.equal(data.carryForward.previousTransmissions, 1);
  }
});
test("continuation rejects a fresh grant, malformed prior counts, a different day or exhausted account", async () => {
  for (const options of [
    { prior: true, extra: "12" },
    { prior: { transmissions: 0 } },
    { prior: { finishedAt: new Date(Date.now() - 86_400_000).toISOString() } },
    { prior: true, used: 37, mode: "--run" },
  ]) {
    const result = await invoke(options);
    assert.notEqual(result.status, 0);
  }
});
test("one-use Arwyn continuation preserves the prior trial and cannot restart through another output", async () => {
  const result = await invoke({
    prior: true,
    used: 26,
    remaining: 24,
    facilitator: "arwyn",
    mode: "--run",
    generate: true,
    replay: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const report = result.report;
  assert.equal(report.maxCalls, 11);
  assert.equal(report.carryForward.inheritedAccountCeiling, 37);
  assert.equal(report.transmissions, 1);
  assert.ok(report.transmissions + report.carryForward.previousTransmissions <= 12);
  assert.equal(report.decisions[0].actor, "arwyn");
  assert.equal(report.meeting.facilitator, "arwyn");
  assert.equal(report.meeting.status, "closed");
  assert.equal(report.outcome, "no-speech-hearing-unqualified");
});
test("same-meeting resume allows six remaining calls, never refreshing the original grant", async () => {
  for (const [used, allowance] of [
    [30, 6],
    [32, 5],
    [37, 0],
  ]) {
    const result = await invoke({ prior: true, resume: true, facilitator: "arwyn", used });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.requestedMaxCalls, 6);
    assert.equal(data.callAllowance, allowance);
    assert.equal(data.experimentAccountCeiling, 37);
    assert.equal(data.resumption.previouslySpentCalls, 6);
    assert.equal(data.resumption.remainingAuthorizedCalls, 6);
  }
});
test("explicit resume preserves the same residents and copies five ledger charges without restart", async () => {
  const result = await invoke({
    prior: true,
    resume: true,
    facilitator: "arwyn",
    used: 30,
    mode: "--run",
    generate: "empty",
    replay: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const { report, initialTown, finalTown, pausedTown } = result;
  assert.equal(report.maxCalls, 6);
  assert.equal(report.ledgerCallLimit, 11);
  assert.equal(report.resumption.copiedLedgerCharges, 5);
  assert.equal(report.resumption.copiedLedgerAttempts, 5);
  assert.equal(report.resumption.priorChoicesAndMemoriesPreserved, true);
  assert.equal(report.transmissions, 1, "Any further invalid response stops this explicit resume");
  assert.equal(report.decisions[0].actor, "northern");
  assert.equal(report.cumulativeTransmissions, 7);
  assert.equal(report.cumulativeMeetingTransmissions, 6);
  assert.equal(report.cumulativeLedgerCharges, 6);
  assert.equal(report.ledger.pool.length, 6);
  assert.equal(report.meeting.id, pausedTown.discussions.sessions[0].id);
  assert.equal(
    initialTown.discussions.sessions[0].epoch,
    pausedTown.discussions.sessions[0].epoch + 1,
  );
  assert.deepEqual(initialTown.agents, JSON.parse(JSON.stringify(pausedTown.agents)));
  assert.deepEqual(finalTown.agents, JSON.parse(JSON.stringify(pausedTown.agents)));
  assert.deepEqual(
    initialTown.discussions.sessions[0].members,
    pausedTown.discussions.sessions[0].members,
  );
  assert.deepEqual(report.meeting.utterances, []);
  assert.equal(
    report.meeting.usage.tokensUnknown,
    2,
    "The original unknown sample remains unknown",
  );
  assert.equal(
    report.meeting.usage.knownTokens,
    pausedTown.discussions.sessions[0].usage.knownTokens,
  );
});
test("resume rejects changed parent authority, changed failure evidence and exhausted account", async () => {
  for (const options of [
    { resume: { transmissions: 6 } },
    { resume: { stopReason: "manual stop" } },
    { resume: { carryForward: {} } },
    { resume: true, used: 37, mode: "--run" },
  ]) {
    const result = await invoke({ prior: true, facilitator: "arwyn", ...options });
    assert.notEqual(result.status, 0);
  }
});
test("targeted floor probe inherits only four remaining calls and verifies the complete chain", async () => {
  for (const [used, allowance] of [
    [32, 4],
    [34, 3],
    [37, 0],
  ]) {
    const result = await invoke({
      prior: true,
      resume: true,
      floorProbe: true,
      facilitator: "arwyn",
      used,
    });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.requestedMaxCalls, 4);
    assert.equal(data.callAllowance, allowance);
    assert.equal(data.experimentAccountCeiling, 37);
    assert.equal(data.resumption.previouslySpentCalls, 8);
    assert.equal(data.floorProbe.method, "targeted-floor-probe");
  }
  const changed = await invoke({
    prior: true,
    resume: true,
    floorProbe: { cumulativeTransmissions: 7 },
    facilitator: "arwyn",
  });
  assert.notEqual(changed.status, 0);
});
test("targeted floor dispatch selects Arwyn while Sub stays off and copies all seven charges once", async () => {
  const result = await invoke({
    prior: true,
    resume: true,
    floorProbe: true,
    facilitator: "arwyn",
    used: 32,
    mode: "--run",
    generate: "empty",
    replay: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const { report, initialTown, finalTown, floorTown } = result;
  assert.equal(report.method, "targeted-floor-probe");
  assert.equal(report.maxCalls, 4);
  assert.equal(report.ledgerCallLimit, 11);
  assert.equal(report.resumption.copiedLedgerCharges, 7);
  assert.equal(report.resumption.copiedLedgerAttempts, 7);
  assert.equal(report.floorProbe.defaultNextActor, "sub");
  assert.equal(report.floorProbe.initialFloor.actor, "arwyn");
  assert.equal(report.decisions[0].actor, "arwyn");
  assert.ok(
    report.decisions[0].observation.availableActions.some((action) => action.kind === "speak"),
  );
  assert.equal(report.transmissions, 1);
  assert.equal(report.cumulativeTransmissions, 9);
  assert.equal(report.cumulativeLedgerCharges, 8);
  assert.equal(report.ledger.pool.length, 8);
  assert.equal(report.meeting.id, floorTown.discussions.sessions[0].id);
  assert.deepEqual(initialTown.agents, JSON.parse(JSON.stringify(floorTown.agents)));
  assert.deepEqual(finalTown.agents, JSON.parse(JSON.stringify(floorTown.agents)));
  assert.equal(report.meeting.members.find((member) => member.id === "sub").mode, "off");
  assert.equal(report.meeting.members.find((member) => member.id === "northern").mode, "listening");
  assert.equal(report.meeting.usage.tokensUnknown, 3);
  const metadata = report.decisions[0].providerMetadata;
  assert.equal(metadata.id, "fixture-response");
  assert.equal(metadata.provider, "fixture-provider");
  assert.equal(metadata.errorCode, 502);
  assert.ok(!metadata.errorMessage.includes("fixture-hidden"));
});
test("targeted probe respects an actual pass without repeating the floor holder", async () => {
  const result = await invoke({
    prior: true,
    resume: true,
    floorProbe: true,
    facilitator: "arwyn",
    used: 32,
    mode: "--run",
    generate: "pass",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.transmissions, 1);
  assert.equal(result.report.decisions[0].decision.kind, "pass");
  assert.equal(result.report.decisions[0].result.ok, true);
  assert.equal(result.report.meeting.utterances.length, 0);
  assert.match(result.report.stopReason, /chose to stop, pass or leave/);
  assert.equal(result.report.meeting.members.find((member) => member.id === "sub").mode, "off");
});
test("exhausted authority prevents any ledger or generation", async () => {
  const result = await invoke({ mode: "--run" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /needs free headroom and authority/);
});
test("a separately authorized allowance is bounded to this twelve-call experiment", async () => {
  const result = await invoke({ extra: "12" });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.savedDailyCeiling, 24);
  assert.equal(data.experimentAccountCeiling, 37);
  assert.equal(data.callAllowance, 12);
  const tooMany = await invoke({ extra: "13" });
  assert.notEqual(tooMany.status, 0);
});
test("nonzero pricing or occupied output prevents generation", async () => {
  for (const price of ["0.001", "", " ", "null"]) {
    const priced = await invoke({ extra: "12", mode: "--run", price });
    assert.notEqual(priced.status, 0);
    assert.match(priced.stderr, /prices must be known zero/);
  }
  const occupied = await invoke({ extra: "12", mode: "--run", existing: true });
  assert.notEqual(occupied.status, 0);
  assert.match(occupied.stderr, /EEXIST/);
});
test("one synthetic real-route decline closes the sole meeting without authored replacement or restart", async () => {
  const result = await invoke({ extra: "12", mode: "--run", generate: true });
  assert.equal(result.status, 0, result.stderr);
  const report = result.report;
  assert.equal(report.transmissions, 1);
  assert.equal(report.decisions.length, 1);
  assert.equal(report.decisions[0].actor, "northern");
  assert.equal(report.decisions[0].result.ok, true);
  assert.equal(report.meeting.status, "closed");
  assert.equal(report.meeting.utterances.length, 0);
  assert.equal(report.speechAudits.length, 0, "Zero speech is never a hearing pass");
  assert.equal(report.outcome, "no-speech-hearing-unqualified");
  assert.equal(report.hearingQualification.onlyOptedInResidentsReceivedObservedSpeech, null);
  assert.equal(report.financeUnchanged, true);
  assert.equal(report.saveRoundTrip, true);
  assert.equal(report.reloadKnowledgeUnchanged, true);
  assert.equal(report.ledger.budget.length, 1);
  assert.equal(Number(report.ledger.budget[0].charged_calls), 1);
  assert.equal(report.ledger.budget[0].settled, true);
  assert.equal(report.ledger.pool.length, 1);
  assert.equal(report.ledger.pool[0].actual_tokens, 44);
});
