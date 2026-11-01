import assert from "node:assert/strict";
import { test } from "node:test";
import { failureCases, terminalFailureCases, replayFailures } from "./a01-failure-replay.mjs";

test(
  "A01.2 retains the A01.1 baseline and closes final failures with intact town/SQL state",
  { timeout: 60_000 },
  async () => {
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
    assert.equal(report.cases.length, 16);
    assert.deepEqual(
      report.cases.map((entry) => entry.id),
      terminalFailureCases.map((entry) => entry.id),
    );
    assert.equal(report.cases.filter((entry) => entry.remainingIssue).length, 0);
    assert.equal(
      report.cases.find((entry) => entry.id === "final-empty-completion").status,
      "closed",
    );
    // Historical A01.1 expectations remain evidence of the original failure.
    assert.match(
      failureCases.find((entry) => entry.id === "final-empty-completion").gap,
      /player must close it manually/,
    );
  },
);
