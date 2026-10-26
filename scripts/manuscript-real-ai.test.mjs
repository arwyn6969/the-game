import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
// Only the quota/model GETs exist in this fixture. A generation is a test
// failure, and no real credential or network access is used.
const fixture = `
globalThis.fetch = async (url, init) => {
  if (init?.method && init.method !== 'GET') throw new Error('Generation forbidden in quota-gate tests');
  if (url === 'https://openrouter.ai/api/v1/key') return Response.json({data:{
    is_free_tier:true, usage_daily:0,
    free_model_daily_requests:{used:Number(process.env.FIXTURE_USED),limit:50,remaining:Number(process.env.FIXTURE_REMAINING)}
  }});
  if (url === 'https://openrouter.ai/api/v1/models') return Response.json({data:[{
    id:'nvidia/nemotron-3-ultra-550b-a55b:free',pricing:{prompt:'0',completion:'0'}
  }]});
  throw new Error('Unexpected network operation in quota-gate tests');
};
`;

async function trial({ used, remaining, mode = "--run-when-ready", existing = false }) {
  const dir = await mkdtemp(join(tmpdir(), "manuscript-quota-"));
  const preload = join(dir, "quota-fixture.mjs");
  const out = existing ? dir : join(dir, "trial");
  await writeFile(preload, fixture);
  if (existing) await writeFile(join(out, "report.json"), "existing trial evidence");
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", preload, "scripts/manuscript-real-ai.mjs", mode],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          HOME: dir,
          TMPDIR: dir,
          OPENROUTER_API_KEY: "sk-or-v1-fixture-not-a-secret",
          MANUSCRIPT_TRIAL_OUT: out,
          FIXTURE_USED: String(used),
          FIXTURE_REMAINING: String(remaining),
        },
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    if (existing) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /EEXIST/);
      assert.equal(await readFile(join(out, "report.json"), "utf8"), "existing trial evidence");
    } else {
      assert.equal(result.status, 0, result.stderr);
      await assert.rejects(access(out), { code: "ENOENT" });
    }
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("scheduled qualification waits without a ledger or generation when daily headroom is partial or exhausted", async () => {
  for (const [used, remaining, allowance] of [
    [20, 30, 4],
    [24, 26, 0],
    [25, 25, 0],
    [0, 7, 7],
  ]) {
    const result = await trial({ used, remaining });
    assert.equal(result.status, "waiting-for-quota");
    assert.equal(result.preflight.callAllowance, allowance);
    assert.equal(result.preflight.requestedMaxCalls, 8);
    assert.equal(result.preflight.dailyCeiling, 24);
  }
});

test("read-only preflight reports the full eight-call allowance without starting a trial", async () => {
  const result = await trial({ used: 16, remaining: 34, mode: "--preflight" });
  assert.equal(result.callAllowance, 8);
});

test("a ready scheduled run cannot overwrite or restart an existing trial directory", async () => {
  await trial({ used: 0, remaining: 50, existing: true });
});
