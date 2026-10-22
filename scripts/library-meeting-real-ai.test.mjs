import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
// Isolated fake network only. No existing key, environment file or provider is
// read. A single synthetic decline exercises a real route/ledger/engine finish.
const fixture = `
globalThis.fetch = async (url, init) => {
  if (url === 'https://openrouter.ai/api/v1/key') return Response.json({data:{
    is_free_tier:true,usage_daily:0,free_model_daily_requests:{used:Number(process.env.FIXTURE_USED),limit:50,remaining:25}
  }});
  if (url === 'https://openrouter.ai/api/v1/models') return Response.json({data:[{
    id:'nvidia/nemotron-3-ultra-550b-a55b:free',pricing:{prompt:process.env.FIXTURE_PRICE??'0',completion:'0'}
  }]});
  if (url === 'https://openrouter.ai/api/v1/chat/completions' && process.env.FIXTURE_GENERATE==='yes') {
    const body=JSON.parse(init.body);
    if (body.model !== 'nvidia/nemotron-3-ultra-550b-a55b:free') throw new Error('Wrong model');
    return Response.json({choices:[{message:{content:JSON.stringify({task:'discussion',decision:{kind:'decline'}})},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:14,total_tokens:44,cost:0}});
  }
  throw new Error('Unexpected network operation; generation forbidden');
};
`;
async function invoke({
  used = 25,
  extra = "0",
  mode = "--preflight",
  existing = false,
  generate = false,
  price = "0",
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "meeting-real-gate-"));
  const preload = join(dir, "network-fixture.mjs");
  const out = join(dir, "trial");
  await writeFile(preload, fixture);
  if (existing) {
    await writeFile(join(dir, "marker"), "preserved");
    // An already occupied path, even a file, must reject before generation.
    await writeFile(out, "original-trial");
  }
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", preload, "scripts/library-meeting-real-ai.mjs", mode],
      {
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
          FIXTURE_USED: String(used),
          FIXTURE_GENERATE: generate ? "yes" : "no",
          FIXTURE_PRICE: price,
        },
      },
    );
    let report = null;
    if (result.status === 0 && mode === "--run")
      report = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
    if (existing) assert.equal(await readFile(out, "utf8"), "original-trial");
    else if (mode === "--preflight" || result.status !== 0)
      await assert.rejects(access(out), { code: "ENOENT" });
    return { ...result, report };
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
