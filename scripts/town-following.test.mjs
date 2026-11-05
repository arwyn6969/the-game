import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { followingFixture } from "./fixtures/following.mjs";
const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const load = (name) => server.ssrLoadModule(`/src/game/${name}.ts`);
const f = await load("following-runtime"),
  c = await load("following"),
  d = await load("discussions"),
  save = await load("save");
const { advanceTown } = await load("sim");
const { auditEconomy, runEconomyCommand } = await load("economy");
const { activateFundedTown } = await load("payroll-runtime");
const person = (t, id) => t.agents.find((a) => a.id === id),
  session = (t) => t.following.sessions.at(-1),
  meeting = (t) => t.discussions.sessions.at(-1);
const ok = (r) => assert.equal(r.ok, true, r.message ?? r.reason);
const speech = (t) => session(t).evidence.filter((e) => e.kind === "speech");
async function fixture(options) {
  return followingFixture(load, options);
}
function act(t, id, kind, fields = {}) {
  return d.applyDiscussionCommand(t, id, {
    kind,
    meetingId: meeting(t).id,
    expectedRevision: meeting(t).members.find((m) => m.id === id).revision,
    commandId: crypto.randomUUID(),
    ...fields,
  });
}
function pending(t) {
  const job = d.nextDiscussionJob(t);
  assert.ok(job);
  assert.equal(d.markDiscussionRequest(t, job), true);
  return job;
}
function reply(t, job, text) {
  return d.applyDiscussionResult(t, { ...job, mind: "grok", decision: { kind: "speak", text } });
}

test("library session retains only actual received attributed excerpts, deduplicates and survives transcript pruning", async () => {
  const { town: t } = await fixture();
  ok(f.startFollowing(t, "arwyn"));
  assert.equal(session(t).state, "listening");
  const before = JSON.stringify(t.agents.map((a) => a.relationships));
  const job = pending(t);
  ok(reply(t, job, "Check the date against the original record."));
  assert.equal(speech(t).length, 1);
  assert.equal(speech(t)[0].eventId, meeting(t).utterances[0].id);
  f.recordFollowingSpeech(t, meeting(t).id, meeting(t).utterances[0]);
  assert.equal(speech(t).length, 1);
  assert.equal(JSON.stringify(t.agents.map((a) => a.relationships)), before);
  meeting(t).utterances = [];
  f.stopFollowing(t);
  const restored = save.parseTownFile(save.exportTown(t));
  assert.ok(restored);
  assert.deepEqual(speech(restored), speech(t));
});

test("second companion and quiet session produce honest history without speech or inference", async () => {
  const { town: t } = await fixture({ target: "sub", meeting: false });
  ok(f.startFollowing(t, "sub", 30, false));
  t.paused = false;
  for (let i = 0; i < 30; i++) advanceTown(t, 1);
  assert.equal(session(t).state, "ended");
  assert.equal(speech(t).length, 0);
  assert.ok(session(t).evidence.some((e) => e.kind === "visit"));
  assert.equal(t.discussions, undefined);
  assert.deepEqual(auditEconomy(t), []);
});

test("start is observably local; private areas, acoustic walls, range and camera receipts grant no knowledge", async () => {
  const { town: t } = await fixture();
  person(t, "player").tile = { x: 33, y: 20 };
  person(t, "arwyn").tile = { x: 35, y: 20 };
  assert.equal(f.observableCompanion(t, "arwyn"), false);
  assert.equal(f.startFollowing(t, "arwyn").ok, false);
  person(t, "player").tile = { x: 43, y: 22 };
  person(t, "arwyn").tile = { x: 52, y: 22 };
  assert.equal(f.startFollowing(t, "arwyn").ok, false);
  person(t, "arwyn").tile = { x: 44, y: 21 };
  ok(f.startFollowing(t, "arwyn"));
  const seen = { ...session(t).lastObserved };
  person(t, "arwyn").tile = { ...person(t, "arwyn").home };
  for (let i = 0; i < 5; i++) {
    t.minute++;
    f.followingMovementGoal(t);
  }
  assert.equal(session(t).state, "paused");
  assert.deepEqual(session(t).lastObserved, seen);
  assert.equal(speech(t).length, 0);
});

test("declined, left or undelivered membership is never overridden by following", async () => {
  for (const choice of ["declined", "left", "unseen"]) {
    const { town: t } = await fixture();
    const member = meeting(t).members.find((m) => m.id === "player");
    if (choice === "unseen") {
      member.invitation = "unseen";
      member.choice = "pending";
    } else member.choice = choice;
    ok(f.startFollowing(t, "arwyn"));
    f.advanceFollowing(t);
    assert.equal(member.mode, "off");
    assert.equal(speech(t).length, 0);
    assert.equal(member.choice, choice === "unseen" ? "pending" : choice);
  }
});

test("late arrival during a pending reply hears only the committed reply and never backfills a turn", async () => {
  const { town: t } = await fixture({ late: true });
  ok(act(t, "arwyn", "speak", { text: "Earlier unheard line." }));
  ok(f.startFollowing(t, "arwyn"));
  assert.equal(speech(t).length, 0);
  for (const id of ["northern", "sub"]) ok(act(t, id, "listen"));
  const job = pending(t);
  person(t, "player").tile = { x: 43, y: 22 };
  f.followingMovementGoal(t);
  f.advanceFollowing(t);
  ok(reply(t, job, "Reply after the listener arrived."));
  assert.deepEqual(
    speech(t).map((e) => e.text),
    ["Reply after the listener arrived."],
  );
});

test("leaving or takeover during pending inference excludes the player without invalidating the speaker", async () => {
  for (const leave of [true, false]) {
    const { town: t } = await fixture();
    ok(f.startFollowing(t, "arwyn"));
    const job = pending(t);
    if (leave) person(t, "player").tile = { x: 36, y: 22 };
    else f.suspendFollowing(t, "Manual takeover");
    ok(reply(t, job, "A pending line for those still listening."));
    assert.equal(speech(t).length, 0);
    assert.equal(meeting(t).utterances[0].recipientIds.includes("player"), false);
  }
});

test("Stop releases only owned listener revision; a later manual listening choice survives", async () => {
  const { town: t } = await fixture();
  ok(f.startFollowing(t, "arwyn"));
  assert.ok(session(t).listener);
  ok(act(t, "player", "listen"));
  f.stopFollowing(t);
  assert.equal(meeting(t).members.find((m) => m.id === "player").mode, "listening");
  const own = (await fixture()).town;
  ok(f.startFollowing(own, "arwyn"));
  f.stopFollowing(own);
  assert.equal(meeting(own).members.find((m) => m.id === "player").mode, "off");
  assert.equal(meeting(own).status, "active");
});

test("navigation uses ordinary bounded steps and free non-door stand points without changing target plans", async () => {
  const { town: t } = await fixture({ late: true });
  const plans = structuredClone(t.agents.map((a) => a.plan));
  ok(f.startFollowing(t, "arwyn"));
  let moved = false;
  for (let i = 0; i < 4; i++) {
    const before = { ...person(t, "player").tile };
    advanceTown(t, 1);
    const after = person(t, "player").tile;
    const distance = c.followDistance(before, after);
    assert.ok(distance <= 3);
    moved ||= distance > 0;
    assert.equal(new Set(t.agents.map((a) => `${a.tile.x},${a.tile.y}`)).size, 8);
  }
  assert.ok(moved);
  assert.deepEqual(
    t.agents.map((a) => a.plan),
    plans,
  );
  assert.equal(f.validateFollowing(t).length, 0);
});

test("blocked stand points and five minutes without progress pause instead of displacing people", async () => {
  const { town: t } = await fixture({ late: true });
  ok(f.startFollowing(t, "arwyn"));
  const poses = {
    kevin: { x: 38, y: 22 },
    baba: { x: 40, y: 22 },
    data: { x: 39, y: 21 },
    amelia: { x: 39, y: 23 },
  };
  for (const [id, p] of Object.entries(poses)) person(t, id).tile = p;
  const before = structuredClone(poses);
  for (let i = 0; i < 5; i++) {
    t.minute++;
    f.followingMovementGoal(t);
  }
  assert.equal(session(t).state, "paused");
  assert.match(session(t).reason, /progress/);
  for (const id of Object.keys(poses)) assert.deepEqual(person(t, id).tile, before[id]);
});

test("paused town has no wall-clock expiry; durations and retention are bounded", async () => {
  const { town: t } = await fixture({ meeting: false });
  t.minute = 1430;
  ok(f.startFollowing(t, "arwyn", 30));
  const deadline = session(t).deadline;
  for (let i = 0; i < 10; i++) f.followingMovementGoal(t);
  assert.equal(session(t).deadline, deadline);
  assert.notEqual(session(t).state, "ended");
  for (let i = 0; i < 12; i++) {
    f.stopFollowing(t);
    ok(f.startFollowing(t, "arwyn", [30, 60, 120][i % 3]));
  }
  f.stopFollowing(t);
  assert.equal(t.following.sessions.length, 8);
  assert.equal(f.validateFollowing(t).length, 0);
  assert.equal(f.startFollowing(t, "arwyn", 45).ok, false);
});

test("restore/import revoke automatic movement and attention; old saves remain optional", async () => {
  const { town: t } = await fixture();
  ok(f.startFollowing(t, "arwyn"));
  ok(act(t, "arwyn", "speak", { text: "A retained original receipt." }));
  const restored = save.parseTownFile(save.exportTown(t));
  assert.ok(restored);
  assert.equal(session(restored).state, "paused");
  assert.equal(f.followingOwnsMovement(restored), false);
  assert.deepEqual(speech(restored), speech(t));
  assert.equal(meeting(restored).members.find((m) => m.id === "player").mode, "off");
  const old = (await fixture({ meeting: false })).town;
  assert.equal(save.parseTownFile(save.exportTown(old)).following, undefined);
  const raw = JSON.parse(save.exportTown(t));
  raw.town.following.version = 99;
  const bytes = JSON.stringify(raw);
  const report = save.readTownFile(bytes);
  assert.equal(report.status, "unreadable");
  assert.equal(report.raw, bytes);
  assert.match(report.reason, /journal/);
  for (const mutate of [
    (s) => s.sessions[0].evidence.push(...Array(129).fill(s.sessions[0].evidence[0])),
    (s) => s.sessions[0].deadline++,
    (s) => (s.sessions[0].target = "secret"),
    (s) => (s.sessions[0].evidence[0].at = 0),
  ]) {
    const data = JSON.parse(save.exportTown(t));
    mutate(data.town.following);
    assert.equal(save.readTownFile(JSON.stringify(data)).status, "unreadable");
  }
});

test("earlier obligations and café automation have priority without changing financial facts", async () => {
  const { town: t } = await fixture({ meeting: false });
  ok(activateFundedTown(t));
  ok(f.startFollowing(t, "arwyn"));
  const before = JSON.stringify(t.economy);
  ok(
    runEconomyCommand(
      t,
      { id: "no-op", kind: "qa", actor: "player", authority: "ui", terms: {} },
      () => ({}),
    ),
  );
  assert.equal(
    f.followingOwnsMovement(t),
    true,
    "Unrelated transaction cloning must retain the explicit grant",
  );
  // A minimal competing routine is sufficient at the deterministic arbitration boundary.
  t.coffee = { routines: [{ worker: "player", status: "active" }] };
  assert.equal(f.followingMovementGoal(t), undefined);
  assert.equal(session(t).state, "paused");
  assert.equal(f.startFollowing(t, "arwyn").ok, false);
  delete t.coffee;
  assert.ok(before);
  assert.deepEqual(auditEconomy(t), []);
});

test("save conflicts preserve canonical bytes and losing recovery history while revoking movement", async () => {
  const box = new Map();
  globalThis.localStorage = {
    getItem: (k) => box.get(k) ?? null,
    setItem: (k, v) => box.set(k, v),
    removeItem: (k) => box.delete(k),
    key: (i) => [...box.keys()][i] ?? null,
    get length() {
      return box.size;
    },
  };
  try {
    const { town: t } = await fixture();
    ok(save.saveTownWithStatus(t));
    ok(f.startFollowing(t, "arwyn"));
    const original = box.get(save.TOWN_STORAGE_KEY);
    const canonical = original + " ";
    box.set(save.TOWN_STORAGE_KEY, canonical);
    const result = save.saveTownWithStatus(t);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "conflict");
    assert.equal(box.get(save.TOWN_STORAGE_KEY), canonical);
    assert.equal(session(t).state, "paused");
    assert.equal(f.followingOwnsMovement(t), false);
    assert.ok(result.localRaw.includes("follow-"));
    assert.equal(box.get(result.backupKey), result.localRaw);
  } finally {
    delete globalThis.localStorage;
  }
});

test("actual accepted café work rejects following; paused work retains its hold and resuming service ends following", async () => {
  const { town: t } = await fixture({ meeting: false });
  const { applyPlayerAction, playerActions } = await load("effects");
  const coffee = await load("coffee");
  const runtime = await load("coffee-runtime");
  t.minute = 960;
  person(t, "player").tile = { x: 7, y: 19 };
  person(t, "kevin").tile = { x: 9, y: 19 };
  ok(activateFundedTown(t));
  ok(coffee.applyCoffeeAction(t, coffee.makeCoffeeCommand(t, "player", "enable")));
  const choice = playerActions(t, "kevin").find((a) => a.label.startsWith("Accept cafe shift"));
  assert.ok(choice && !choice.disabledReason);
  const accepted = applyPlayerAction(t, "kevin", choice.id);
  assert.equal(accepted.ok, true, accepted.reply);
  const agreement = t.economy.work.agreements.find(
    (a) => a.worker === "player" && a.kind === "cafe-shift",
  );
  const financial = () => ({
    holds: t.economy.holds,
    transactions: t.economy.transactions,
    favors: t.favors,
    tills: t.tills,
    money: t.agents.map((a) => a.money),
  });
  const before = structuredClone(financial());
  person(t, "player").tile = { x: 43, y: 22 };
  person(t, "arwyn").tile = { x: 44, y: 21 };
  assert.equal(f.startFollowing(t, "arwyn").ok, false);
  assert.deepEqual(financial(), before);
  person(t, "player").tile = { x: 7, y: 19 };
  ok(
    runtime.startCoffeeRoutine(
      t,
      coffee.makeCoffeeCommand(t, "player", "start", { targetId: agreement.id }),
    ),
  );
  ok(runtime.suspendPlayerCoffeeRoutine(t, "Synthetic pause before a public visit"));
  person(t, "player").tile = { x: 43, y: 22 };
  ok(f.startFollowing(t, "arwyn"));
  const afterPause = structuredClone(financial());
  person(t, "player").tile = { x: 7, y: 19 };
  ok(
    runtime.startCoffeeRoutine(
      t,
      coffee.makeCoffeeCommand(t, "player", "resume", { targetId: agreement.id }),
    ),
  );
  assert.equal(session(t).state, "ended");
  assert.equal(f.followingOwnsMovement(t), false);
  assert.deepEqual(financial(), afterPause);
  assert.deepEqual(auditEconomy(t), []);
  assert.equal(t.economy.holds.find((h) => h.id === agreement.holdId).remaining, 5);
});

test("full journal terminates on the final actual receipt and releases only its own attention", async () => {
  const { town: t } = await fixture();
  ok(f.startFollowing(t, "arwyn"));
  // Explicit synthetic near-capacity history, followed by a real validated utterance.
  for (let i = 0; i < 126; i++)
    c.retainFollowEvidence(session(t), {
      eventId: `synthetic-capacity-${i}`,
      recipient: "player",
      kind: "visit",
      at: f.followTime(t),
      place: "library",
      text: "Synthetic capacity fixture entry.",
    });
  person(t, "player").path = [{ x: 41, y: 22 }];
  ok(act(t, "arwyn", "speak", { text: "The actual final received excerpt." }));
  assert.equal(session(t).state, "ended");
  assert.equal(session(t).evidence.length, 128);
  assert.deepEqual(person(t, "player").path, []);
  assert.equal(session(t).evidence.at(-1).text, "The actual final received excerpt.");
  assert.equal(meeting(t).members.find((m) => m.id === "player").mode, "off");
  assert.equal(f.followingOwnsMovement(t), false);
  assert.deepEqual(f.validateFollowing(t), []);
  assert.ok(save.parseTownFile(save.exportTown(t)));
});

test("measured save headroom is required before taking control", async () => {
  const { town: t } = await fixture({ meeting: false });
  t.notices.push({ text: "x".repeat(8 * 1024 * 1024) });
  const before = t.notices[0].text;
  assert.equal(f.startFollowing(t, "arwyn").ok, false);
  assert.equal(t.following, undefined);
  assert.equal(t.notices[0].text, before);
});
