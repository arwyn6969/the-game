import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const f = await server.ssrLoadModule("/src/game/following.ts");
const make = (now = 1430) =>
  f.beginFollow({
    id: "follow-test",
    target: "arwyn",
    now,
    duration: 60,
    listen: true,
    observed: { x: 2, y: 1 },
    player: { x: 1, y: 1 },
  });
test("controller validates durations and spans midnight using simulation time", () => {
  assert.equal(f.beginFollow({ duration: 45 }), null);
  const s = make();
  assert.equal(s.deadline, 1490);
  f.tickFollow(s, {
    now: 1489,
    player: { x: 1, y: 1 },
    observed: { x: 2, y: 1 },
    goal: { x: 1, y: 1 },
  });
  assert.notEqual(s.state, "ended");
  f.tickFollow(s, { now: 1490, player: { x: 1, y: 1 } });
  assert.equal(s.state, "ended");
});
test("takeover needs explicit resume; stalled/lost observations pause without private tracking", () => {
  const s = make(0);
  f.pauseFollow(s, "Manual control");
  f.tickFollow(s, { now: 1, player: { x: 1, y: 1 } });
  assert.equal(s.state, "paused");
  assert.equal(f.resumeFollow(s, 1, { x: 1, y: 1 }), true);
  f.tickFollow(s, { now: 6, player: { x: 1, y: 1 } });
  assert.equal(s.state, "paused");
  assert.deepEqual(s.lastObserved, { x: 2, y: 1 });
  const blocked = make(0);
  f.tickFollow(blocked, { now: 5, player: { x: 1, y: 1 }, observed: { x: 6, y: 1 } });
  assert.equal(blocked.state, "paused");
});
test("journal deduplicates receipts and reserves a bounded terminal record", () => {
  const s = make(0);
  const entry = {
    eventId: "one",
    recipient: "player",
    kind: "speech",
    at: 1,
    place: "library",
    text: "An attributed claim.",
  };
  assert.equal(f.retainFollowEvidence(s, entry), true);
  assert.equal(f.retainFollowEvidence(s, entry), false);
  for (let i = 1; i < 128; i++) f.retainFollowEvidence(s, { ...entry, eventId: `event-${i}` });
  assert.equal(s.state, "ended");
  assert.equal(s.evidence.length, 128);
  assert.ok(s.endedAt);
  assert.equal(f.retainFollowEvidence(s, { ...entry, eventId: "overflow" }), false);
});

test("a full paused journal cannot acquire a fresh movement grant", () => {
  const s = make(0);
  f.pauseFollow(s, "Synthetic capacity restore");
  s.evidence = Array.from({ length: 128 }, (_, i) => ({
    eventId: `capacity-${i}`,
    recipient: "player",
    kind: "visit",
    at: 0,
    place: "library",
    text: "Synthetic capacity fixture.",
  }));
  assert.equal(f.resumeFollow(s, 1, { x: 1, y: 1 }), false);
  assert.equal(s.state, "ended");
  assert.match(s.reason, /capacity/);
});
