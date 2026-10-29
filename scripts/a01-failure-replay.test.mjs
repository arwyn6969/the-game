import assert from "node:assert/strict";
import { test } from "node:test";
import { failureCases, replayFailures } from "./a01-failure-replay.mjs";

test("A01.1 replays every failure class with retained town and SQL accounting", async () => {
  const realFetch = globalThis.fetch;
  let escapedTransports = 0;
  globalThis.fetch = async () => {
    escapedTransports++;
    throw new Error("A01.1 must never use a network transport");
  };
  let report;
  try {
    report = await replayFailures();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(escapedTransports, 0);
  assert.equal(report.liveInferenceCalls, 0);
  assert.equal(report.spend, 0);
  assert.equal(report.cases.length, 10);
  assert.deepEqual(
    report.cases.map((entry) => entry.id),
    failureCases.map((entry) => entry.id),
  );
  assert.equal(report.cases.filter((entry) => entry.remainingIssue).length, 1);
  assert.match(
    report.cases.find((entry) => entry.id === "final-empty-completion").remainingIssue,
    /player must close it manually/,
  );
});
