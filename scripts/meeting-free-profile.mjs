import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateConfig } from "../src/lib/mind-pool/config.ts";
import { validateBudgetPolicy } from "../src/lib/mind-budget/policy.ts";

/** Explicit hosted profile; does not activate any provider or mutate live settings. */
export async function meetingFreeProfile() {
  const raw = JSON.parse(
    await readFile(new URL("../config/meeting-free-profile.json", import.meta.url), "utf8"),
  );
  return { pool: validateConfig(raw.pool), budget: validateBudgetPolicy(raw.budget) };
}

export async function meetingFreeBindings() {
  const { pool, budget } = await meetingFreeProfile();
  return { MIND_POOL_CONFIG: JSON.stringify(pool), MIND_BUDGET_CONFIG: JSON.stringify(budget) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(
    process.argv.length,
    4,
    "Usage: node scripts/meeting-free-profile.mjs --write /private/exclusive-file.json",
  );
  assert.equal(process.argv[2], "--write");
  await writeFile(process.argv[3], JSON.stringify(await meetingFreeBindings(), null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log("Wrote only the two meeting policy bindings; no live configuration changed.");
}
