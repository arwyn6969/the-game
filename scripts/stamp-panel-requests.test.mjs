import assert from "node:assert/strict";
import { test } from "node:test";
import { StampPanelRequests } from "../src/lib/stamps/panel-requests.ts";

const context = { scopeKey: "test-world:test-character", walletId: "leather" };

test("an explicit edit supersedes a pending holdings refresh and ignores its late completion", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timedOut = [];
  const requests = new StampPanelRequests((operation) => timedOut.push(operation));
  const refresh = requests.begin(context, true);
  assert.ok(refresh);
  assert.equal(refresh.background, true);
  assert.equal(requests.begin(context, true), null);
  t.mock.timers.tick(10_000);

  const edit = requests.begin(context);
  assert.ok(edit);
  assert.equal(edit.background, false);
  assert.ok(edit.generation > refresh.generation);
  assert.equal(refresh.abort.signal.aborted, true);
  assert.equal(requests.isCurrent(refresh), false);
  assert.equal(requests.finish(refresh), false);
  assert.equal(requests.current, edit);
  assert.equal(requests.isCurrent(edit), true);
  t.mock.timers.tick(20_000);
  assert.deepEqual(timedOut, []);
  assert.equal(requests.current, edit);
  requests.finish(edit);
});

test("an in-flight explicit action excludes polling and duplicate explicit actions", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const requests = new StampPanelRequests(() => assert.fail("Unexpected timeout"));
  const edit = requests.begin(context);
  assert.ok(edit);
  assert.equal(requests.begin(context, true), null);
  assert.equal(requests.begin(context), null);
  assert.equal(requests.current, edit);
  assert.equal(requests.finish(edit), true);
  assert.equal(edit.abort.signal.aborted, false);
  assert.equal(requests.current, null);
  assert.equal(requests.isCurrent(edit), false);
  const next = requests.begin({ scopeKey: "other-world:other-character", walletId: "wonder" });
  assert.ok(next);
  assert.equal(next.walletId, "wonder");
  assert.equal(next.scopeKey, "other-world:other-character");
  assert.ok(next.generation > edit.generation);
  requests.invalidate();
});

test("service operations time out after 30 seconds and are invalid before notification", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timedOut = [];
  const requests = new StampPanelRequests((operation) => {
    assert.equal(requests.current, null);
    assert.equal(requests.isCurrent(operation), false);
    assert.equal(operation.abort.signal.aborted, true);
    timedOut.push(operation);
  });
  const operation = requests.begin(context);
  t.mock.timers.tick(29_999);
  assert.equal(requests.current, operation);
  assert.deepEqual(timedOut, []);
  t.mock.timers.tick(1);
  assert.deepEqual(timedOut, [operation]);
  t.mock.timers.tick(300_000);
  assert.deepEqual(timedOut, [operation]);
  assert.equal(requests.finish(operation), false);
});

test("wallet approvals receive their longer deadline and cannot notify a later request", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timedOut = [];
  const requests = new StampPanelRequests((operation) => timedOut.push(operation));
  const wallet = requests.begin(context, false, true);
  t.mock.timers.tick(119_999);
  assert.equal(requests.isCurrent(wallet), true);
  assert.deepEqual(timedOut, []);
  t.mock.timers.tick(1);
  assert.deepEqual(timedOut, [wallet]);
  const retry = requests.begin(context, false, true);
  assert.ok(retry);
  assert.equal(requests.finish(wallet), false);
  assert.equal(requests.isCurrent(retry), true);
  requests.finish(retry);
  t.mock.timers.tick(120_000);
  assert.deepEqual(timedOut, [wallet]);
});

test("normal completion and cancellation clean deadlines without retaining stale operations", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const requests = new StampPanelRequests(() => assert.fail("A cleaned deadline fired"), {
    timeoutMs: 20,
    walletTimeoutMs: 50,
  });
  const completed = requests.begin(context);
  assert.equal(requests.finish(completed), true);
  assert.equal(requests.finish(completed), false);
  t.mock.timers.tick(100);
  const cancelled = requests.begin(context, false, true);
  requests.invalidate();
  requests.invalidate();
  assert.equal(cancelled.abort.signal.aborted, true);
  assert.equal(requests.current, null);
  assert.equal(requests.finish(cancelled), false);
  t.mock.timers.tick(100);
});

test("timeout notification may immediately start a retry with its own deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timedOut = [];
  let retry;
  const requests = new StampPanelRequests(
    (operation) => {
      timedOut.push(operation);
      if (!retry) retry = requests.begin(context);
    },
    { timeoutMs: 20 },
  );
  const first = requests.begin(context, true);
  t.mock.timers.tick(20);
  assert.ok(retry);
  assert.equal(requests.current, retry);
  assert.deepEqual(timedOut, [first]);
  t.mock.timers.tick(19);
  assert.equal(requests.current, retry);
  t.mock.timers.tick(1);
  assert.deepEqual(timedOut, [first, retry]);
  assert.equal(requests.current, null);
});
