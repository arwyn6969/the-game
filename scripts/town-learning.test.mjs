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
  l = await load("learning-runtime"),
  p = await load("learning-practice"),
  v = await load("learning-validation"),
  save = await load("save"),
  d = await load("discussions");
const lesson = (t) => t.followerLearning.sessions.at(-1),
  follow = (t) => t.following.sessions.at(-1),
  meeting = (t) => t.discussions.sessions.at(-1);
const who = (t, id) => t.agents.find((a) => a.id === id);
const ok = (r) => {
  assert.equal(r.ok, true, r.message);
  return r;
};
async function fixture() {
  const { town } = await followingFixture(load);
  ok(f.startFollowing(town, "arwyn"));
  ok(l.enableLearning(town));
  return town;
}
function request(t, purpose) {
  return ok(l.learningRequest(t, purpose));
}
function apply(t, req, decision) {
  const parsed = v.parseLearningDecision(JSON.stringify(decision));
  assert.ok(parsed);
  const result = l.applyLearningDecision(t, req.job, parsed);
  l.recordLearningUsage(
    t,
    req.job,
    {
      elapsedMs: 10,
      attempts: 1,
      totalTokens: 20,
      success: result.ok,
    },
    {
      diagnostics: { provider: "synthetic", model: "synthetic-reference-v1", maxOutputTokens: 900 },
    },
  );
  ok(result);
  assert.deepEqual(v.validateFollowerLearning(t), []);
  return result;
}
function practice(t, phase, correct = true) {
  const plan = request(t, `${phase}-plan`);
  assert.equal(plan.prompt.includes('"instruction":'), phase !== "baseline");
  apply(t, plan, { kind: "inspect", boxes: ["Birch", "Alder", "Cedar"] });
  const s = lesson(t),
    trial = s.trials.find((x) => x.phase === phase),
    obs = p.practiceObservation(trial);
  const found = trial.observations.find((o) => o.text.includes(`contains ${obs.recordId}.`));
  assert.ok(found);
  const box = found.id.split(":").at(-1);
  apply(t, request(t, `${phase}-submit`), {
    kind: "submit",
    box,
    historicalDate: correct ? "unconfirmed" : "confirmed",
    evidenceIds: [found.id],
  });
  return trial;
}
function teach(t, kind = "accept") {
  const req = request(t, "invite");
  assert.ok(req.prompt.includes(p.LIBRARY_METHOD_CARD.id));
  apply(t, req, {
    kind,
    text:
      kind === "accept"
        ? "I can show you how to check the box rather than trusting the shelf."
        : "I would rather leave teaching for another day.",
    sourceIds: [p.LIBRARY_METHOD_CARD.id],
  });
}
function question(t, n = 1) {
  apply(t, request(t, "question"), {
    kind: "question",
    text:
      n === 1
        ? "How should I check a reference before using it?"
        : "What evidence would establish the historical date?",
    sourceIds: [n === 1 ? `${lesson(t).id}:method-card` : `${lesson(t).id}:answer:1`],
  });
  apply(t, request(t, "answer"), {
    kind: "answer",
    text:
      n === 1
        ? "Inspect the stable box contents before selecting a reference."
        : "A current box inspection cannot establish a historical date.",
    sourceIds: [`${lesson(t).id}:question:${n}`],
  });
}

test("one complete voluntary lesson has two distinct questions, matched fresh practice and one private reflection", async () => {
  const t = await fixture(),
    relations = structuredClone(t.agents.map((a) => a.relationships));
  assert.equal(lesson(t).consent, "pending");
  assert.equal(l.learningRequest(t, "question").ok, false);
  practice(t, "baseline", false);
  teach(t);
  question(t);
  question(t, 2);
  assert.equal(meeting(t).utterances.length, 5);
  assert.equal(l.learningRequest(t, "question").ok, false);
  practice(t, "after");
  practice(t, "transfer");
  assert.match(p.learningComparison(lesson(t).trials, lesson(t).calls), /This run improved/);
  apply(t, request(t, "reflection"), {
    kind: "reflect",
    text: "I succeeded on the two later trays, but this does not establish broad skill.",
    sourceIds: [`${lesson(t).id}:method-card`],
  });
  assert.equal(lesson(t).calls.length, 12);
  assert.equal(lesson(t).status, "ended");
  assert.equal(lesson(t).reflected, true);
  assert.equal(l.learningRequest(t, "reflection").ok, false);
  assert.deepEqual(
    t.agents.map((a) => a.relationships),
    relations,
  );
  assert.equal(f.followingOwnsMovement(t), true);
  const restored = save.parseTownFile(save.exportTown(t));
  assert.ok(restored);
  assert.deepEqual(restored.followerLearning.sessions[0].trials, lesson(t).trials);
  assert.equal(follow(restored).state, "paused");
});

test("declining and deferring are witnessed choices, not a compelled lesson", async () => {
  for (const consent of ["decline", "defer"]) {
    const t = await fixture();
    practice(t, "baseline");
    teach(t, consent);
    assert.equal(lesson(t).method, undefined);
    assert.equal(l.learningRequest(t, "question").ok, false);
    assert.equal(l.learningRequest(t, "after-plan").ok, false);
    assert.equal(lesson(t).receipts.filter((r) => r.kind === "claim").length, 1);
    assert.equal(f.followingOwnsMovement(t), true);
  }
});

test("practice failure, already-correct baseline and unknown attempts do not claim improved competence", async () => {
  const t = await fixture();
  practice(t, "baseline");
  teach(t);
  practice(t, "after");
  practice(t, "transfer", false);
  assert.match(p.learningComparison(lesson(t).trials, lesson(t).calls), /did not demonstrate/);
  assert.equal(lesson(t).trials[2].result.correct, false);
  const trials = lesson(t).trials;
  const transfer = trials[2];
  transfer.finished = false;
  delete transfer.result;
  const obs = p.practiceObservation(transfer);
  const found = transfer.observations.find((o) => o.text.includes(`contains ${obs.recordId}.`));
  p.submitPractice(transfer, {
    box: found.id.split(":").at(-1),
    historicalDate: "unconfirmed",
    evidenceIds: [found.id],
  });
  assert.match(p.learningComparison(trials, lesson(t).calls), /baseline already succeeded/);
  lesson(t).calls[0].usage.attemptsUnknown = 1;
  assert.match(p.learningComparison(trials, lesson(t).calls), /No improvement is qualified/);
});

test("revoking control or permission rejects late speech, practice and reflection without resetting attempts", async () => {
  for (const purpose of ["baseline-plan", "question", "reflection"]) {
    const t = await fixture();
    if (purpose !== "baseline-plan") {
      practice(t, "baseline");
      teach(t);
    }
    const req = request(t, purpose);
    const before = JSON.stringify(meeting(t).utterances);
    f.suspendFollowing(t, "Manual takeover");
    assert.equal(lesson(t).status, "paused");
    assert.equal(l.freshLearningJob(t, req.job), false);
    assert.equal(
      l.applyLearningDecision(
        t,
        req.job,
        purpose === "baseline-plan"
          ? { kind: "inspect", boxes: ["Birch"] }
          : {
              kind: purpose === "question" ? "question" : "reflect",
              text: "A late reply",
              sourceIds: [`${lesson(t).id}:method-card`],
            },
      ).ok,
      false,
    );
    assert.equal(JSON.stringify(meeting(t).utterances), before);
    assert.equal(lesson(t).calls.at(-1).status, "interrupted");
    assert.ok(save.parseTownFile(save.exportTown(t)));
    assert.equal(l.resumeLearning(t).ok, false);
  }
});

test("teacher and learner prompts exclude hidden memories, unseen speech, future answers and practice keys", async () => {
  const t = await fixture();
  who(t, "arwyn").memories.push({
    id: "private",
    text: "PRIVATE_CANARY_NPC",
    type: "observe",
    day: 1,
    minute: 0,
  });
  who(t, "player").memories.push({
    id: "player-secret",
    text: "PRIVATE_CANARY_PLAYER",
    type: "observe",
    day: 1,
    minute: 0,
  });
  const req = request(t, "baseline-plan");
  assert.ok(!req.prompt.includes("PRIVATE_CANARY"));
  assert.ok(!req.prompt.includes("reference-check-v1"));
  assert.ok(!req.prompt.includes("contains baseline-"));
  apply(t, req, { kind: "inspect", boxes: ["Birch"] });
  const submit = request(t, "baseline-submit");
  assert.ok(submit.prompt.includes("Direct practice inspection of stable box Birch"));
  assert.ok(!submit.prompt.includes("PRIVATE_CANARY"));
  apply(t, submit, {
    kind: "submit",
    box: "Birch",
    historicalDate: "unconfirmed",
    evidenceIds: [lesson(t).trials[0].observations[0].id],
  });
  const unheard = {
    eventId: "unheard",
    recipient: "player",
    kind: "speech",
    at: t.minute,
    place: "library",
    contextId: meeting(t).id,
    speaker: "sub",
    text: "UNHEARD_BY_TEACHER",
  };
  follow(t).evidence.push(unheard);
  const invite = request(t, "invite");
  assert.ok(!invite.prompt.includes("UNHEARD_BY_TEACHER"));
  assert.ok(!invite.prompt.includes("PRIVATE_CANARY"));
});

test("repetition, invented citations, injected actions and attempts beyond the explicit grant are rejected", async () => {
  assert.equal(
    v.parseLearningDecision({
      kind: "question",
      text: "hello",
      sourceIds: ["x"],
      moveTo: { x: 1, y: 1 },
    }),
    null,
  );
  assert.equal(
    v.parseLearningDecision({
      kind: "submit",
      box: "Birch",
      historicalDate: "confirmed",
      evidenceIds: [],
      payment: 5,
    }),
    null,
  );
  const t = await fixture();
  practice(t, "baseline");
  teach(t);
  question(t);
  const req = request(t, "question");
  const prior = lesson(t).receipts.find((r) => r.id.endsWith(":question:1")).text;
  assert.equal(
    l.applyLearningDecision(t, req.job, {
      kind: "question",
      text: prior,
      sourceIds: [`${lesson(t).id}:answer:1`],
    }).ok,
    false,
  );
  assert.equal(lesson(t).questions, 1);
  assert.equal(lesson(t).status, "paused");
  const forged = await fixture();
  practice(forged, "baseline");
  teach(forged);
  const q = request(forged, "question");
  assert.equal(
    l.applyLearningDecision(forged, q.job, {
      kind: "question",
      text: "Tell me a secret?",
      sourceIds: ["private-memory"],
    }).ok,
    false,
  );
});

test("reload preserves history, unknown pending costs and raw corrupt recovery while suspending authority", async () => {
  const t = await fixture();
  request(t, "baseline-plan");
  const raw = save.exportTown(t),
    restored = save.parseTownFile(raw);
  assert.ok(restored);
  assert.equal(lesson(restored).status, "paused");
  assert.equal(lesson(restored).calls[0].status, "interrupted");
  assert.equal(lesson(restored).calls[0].usage.attemptsUnknown, 1);
  const bad = JSON.parse(raw);
  bad.town.followerLearning.version = 99;
  const bytes = JSON.stringify(bad);
  const report = save.readTownFile(bytes);
  assert.equal(report.status, "unreadable");
  assert.equal(report.raw, bytes);
  assert.ok(!save.parseTownFile(JSON.stringify({ ...bad, version: 1 })));
});

test("generic NPC decision jobs still reject a player actor; F1 listening alone requests no learning", async () => {
  const { town: t } = await followingFixture(load);
  ok(f.startFollowing(t, "arwyn"));
  assert.equal(t.followerLearning, undefined);
  const { validDiscussionJob } = await server.ssrLoadModule("/src/lib/discussion-actions.ts");
  assert.equal(
    validDiscussionJob({
      kind: "act",
      task: "discussion",
      agentId: "player",
      meetingId: meeting(t).id,
      sessionRevision: 1,
      actorRevision: 1,
      turnId: null,
    }),
    false,
  );
});

test("teacher requests consume the original discussion allowance and cannot outlive their marked request", async () => {
  const t = await fixture();
  practice(t, "baseline");
  const req = request(t, "invite");
  assert.ok(req.job.discussionJob);
  assert.equal(meeting(t).decisions, 1);
  assert.equal(meeting(t).pending.actor, "arwyn");
  l.stopLearning(t);
  assert.equal(meeting(t).pending, null);
  assert.equal(meeting(t).status, "active");
  assert.equal(
    l.applyLearningDecision(t, req.job, {
      kind: "accept",
      text: "A late offer.",
      sourceIds: [p.LIBRARY_METHOD_CARD.id],
    }).ok,
    false,
  );
  l.recordLearningUsage(t, req.job, {
    elapsedMs: 50,
    attempts: 1,
    totalTokens: 30,
    success: false,
  });
  assert.equal(meeting(t).usage.providerAttempts, 1);
  assert.equal(lesson(t).calls.at(-1).usage.providerAttempts, 1);
  assert.equal(meeting(t).utterances.length, 0);
  const final = await fixture();
  practice(final, "baseline");
  const m = meeting(final);
  m.decisions = 15;
  m.usage.requests = 15;
  m.usage.attemptsUnknown = 15;
  m.usage.tokensUnknown = 15;
  const last = request(final, "invite");
  assert.equal(m.decisions, 16);
  f.suspendFollowing(final, "Takeover on final decision");
  assert.equal(m.status, "closed");
  assert.equal(
    l.applyLearningDecision(final, last.job, {
      kind: "accept",
      text: "Too late.",
      sourceIds: [p.LIBRARY_METHOD_CARD.id],
    }).ok,
    false,
  );
  assert.equal(l.learningRequest(final, "invite").ok, false);
});

test("context, invitation, acoustic reach and earlier commitments gate learner authority", async () => {
  const { town: t } = await followingFixture(load);
  assert.equal(l.enableLearning(t).ok, false);
  ok(f.startFollowing(t, "arwyn"));
  ok(l.enableLearning(t));
  const pending = request(t, "baseline-plan");
  who(t, "arwyn").tile = { x: 33, y: 20 };
  assert.equal(l.freshLearningJob(t, pending.job), false);
  assert.equal(
    l.applyLearningDecision(t, pending.job, { kind: "inspect", boxes: ["Birch"] }).ok,
    false,
  );
  assert.equal(lesson(t).trials[0].observations.length, 0);
  const other = await fixture();
  practice(other, "baseline");
  const req = request(other, "invite");
  d.pauseDiscussion(other, "Manual context pause");
  assert.equal(l.freshLearningJob(other, req.job), false);
  const declined = (await followingFixture(load)).town;
  meeting(declined).members.find((m) => m.id === "player").choice = "left";
  ok(f.startFollowing(declined, "arwyn"));
  assert.equal(l.enableLearning(declined).ok, false);
});

test("manual attention supersedes only the owned temporary participation transition", async () => {
  const t = await fixture();
  practice(t, "baseline");
  teach(t);
  request(t, "question");
  const member = meeting(t).members.find((m) => m.id === "player");
  assert.equal(member.mode, "participating");
  const manual = d.applyDiscussionCommand(t, "player", {
    kind: "listen",
    meetingId: meeting(t).id,
    expectedRevision: member.revision,
    commandId: "manual-listening",
  });
  ok(manual);
  assert.equal(lesson(t).status, "paused");
  assert.equal(member.mode, "listening");
  l.stopLearning(t);
  assert.equal(member.mode, "listening");
  assert.equal(meeting(t).status, "active");
});

test("request exhaustion retains the slot and never creates synthetic success or repeated authorization", async () => {
  const t = await fixture();
  const req = request(t, "baseline-plan");
  l.failLearningRequest(t, req.job, "Unavailable capacity");
  l.recordLearningUsage(t, req.job, {
    elapsedMs: 5,
    attempts: null,
    totalTokens: null,
    success: false,
  });
  assert.equal(lesson(t).calls.length, 1);
  assert.equal(lesson(t).calls[0].status, "unavailable");
  assert.equal(lesson(t).calls[0].usage.attemptsUnknown, 1);
  assert.equal(lesson(t).trials[0].result, undefined);
  ok(l.resumeLearning(t));
  assert.equal(l.learningRequest(t, "baseline-plan").ok, false);
  assert.equal(l.enableLearning(t).ok, false);
  assert.equal(lesson(t).calls.length, 1);
});

test("malformed or forged practice successes retain their exact recovery bytes", async () => {
  const t = await fixture();
  practice(t, "baseline", false);
  teach(t);
  practice(t, "after");
  practice(t, "transfer", false);
  for (const mutate of [
    (s) => (s.trials[0].result.correct = true),
    (s) => s.calls.push({ ...s.calls[0], id: "extra", purpose: "baseline-plan" }),
    (s) => (s.method.procedure[0] = "Unrestricted hidden actions"),
    (s) => (s.receipts[0].at = 999999),
  ]) {
    const raw = JSON.parse(save.exportTown(t));
    mutate(raw.town.followerLearning.sessions[0]);
    const bytes = JSON.stringify(raw);
    const report = save.readTownFile(bytes);
    assert.equal(report.status, "unreadable");
    assert.equal(report.raw, bytes);
  }
});

test("the existing budget runner denies unconfigured background actions and preserves direct-reply capacity", async () => {
  const { runBudgetedMind } = await server.ssrLoadModule("/src/lib/mind-budget/runner.ts");
  const { EphemeralMindBudgetStore } = await server.ssrLoadModule("/src/lib/mind-budget/store.ts");
  const { DEFAULT_BUDGET } = await server.ssrLoadModule("/src/lib/mind-budget/policy.ts");
  let now = 0,
    calls = 0;
  const store = new EphemeralMindBudgetStore(() => now);
  const policy = {
    ...DEFAULT_BUDGET,
    dailyCalls: 6,
    playerDailyCalls: 6,
    playerMinuteCalls: 6,
    interactiveReserveCalls: 1,
    playerInteractiveReserveCalls: 1,
    playerInteractiveReserveMinuteCalls: 1,
    concurrent: 1,
    backgroundConcurrent: 0,
    actionConcurrent: 0,
    dailyMicrousd: 0,
    interactiveReserveMicrousd: 0,
    inputNanousdPerToken: 0,
    outputNanousdPerToken: 0,
  };
  const invoke = (kind, p = policy) =>
    runBudgetedMind({
      kind,
      userHash: "synthetic-local-user",
      system: "Synthetic only",
      user: "Bounded lesson fixture",
      maxAttempts: 1,
      maxOutputTokens: 900,
      leaseMs: 45000,
      policy: p,
      store,
      scope: "ephemeral",
      run: async () => {
        calls++;
        return { ok: true, diagnostics: { attempts: 1 } };
      },
    });
  assert.equal((await invoke("act")).ok, false);
  assert.equal(calls, 0);
  const actionPolicy = { ...policy, actionConcurrent: 1 };
  for (let i = 0; i < 5; i++) {
    ok(await invoke("act", actionPolicy));
    now += 61000;
  }
  assert.equal((await invoke("act", actionPolicy)).ok, false);
  assert.equal(calls, 5);
  ok(await invoke("player", actionPolicy));
  assert.equal(calls, 6);
});

test("the actual pool action envelope accepts bounded F2 responses, rejects added authority, and transmits once", async () => {
  const { mindJsonFailure } = await server.ssrLoadModule("/src/lib/mind-pool/transport.ts");
  const { parseLearningResponse } = await server.ssrLoadModule("/src/lib/learning-actions.ts");
  const body = JSON.stringify({
    task: "follower-learning",
    decision: { kind: "inspect", boxes: ["Birch"] },
  });
  assert.equal(mindJsonFailure("act", body), null);
  assert.equal(parseLearningResponse(body).kind, "inspect");
  assert.equal(parseLearningResponse(`\`\`\`json\n${body}\n\`\`\``).kind, "inspect");
  assert.equal(parseLearningResponse(`Here is a decision: ${body}`), null);
  for (const bad of [
    { task: "follower-learning", decision: { kind: "inspect", boxes: ["Birch"], actor: "arwyn" } },
    { task: "follower-learning", decision: { kind: "speak", text: "Unrestricted speech" } },
    { task: "follower-learning", decision: { kind: "pass" }, quota: 100 },
  ])
    assert.equal(mindJsonFailure("act", JSON.stringify(bad)), "missing-envelope");
  const { defaultConfig } = await server.ssrLoadModule("/src/lib/mind-pool/config.ts");
  const { routeMind } = await server.ssrLoadModule("/src/lib/mind-pool/router.ts");
  const config = defaultConfig();
  config.providers = config.providers.slice(0, 1);
  const provider = config.providers[0];
  provider.enabled = true;
  provider.freeTierConfirmed = true;
  provider.routes.act = { ...provider.routes.player, maxTokens: 900 };
  let attempts = 0,
    reservations = 0,
    settlements = 0;
  const result = await routeMind({
    kind: "act",
    system: "Synthetic fixture",
    user: "Bounded F2 decision",
    config,
    env: { [provider.apiKeyEnv]: "synthetic-not-a-real-key" },
    store: {
      reserve: async () => {
        reservations++;
        return { id: "synthetic", jsonMode: true };
      },
      finish: async () => {
        settlements++;
      },
    },
    fetcher: async () => {
      attempts++;
      return Response.json({
        choices: [{ message: { content: body }, finish_reason: "stop" }],
        usage: { total_tokens: 22 },
      });
    },
  });
  ok(result);
  assert.equal(attempts, 1);
  assert.equal(reservations, 1);
  assert.equal(settlements, 1);
});

test("a changed model or output allowance blocks improvement qualification", async () => {
  const t = await fixture();
  practice(t, "baseline", false);
  teach(t);
  practice(t, "after");
  practice(t, "transfer");
  assert.match(p.learningComparison(lesson(t).trials, lesson(t).calls), /This run improved/);
  const last = lesson(t).calls.at(-1);
  last.compute.model = "changed-synthetic-model";
  assert.match(
    p.learningComparison(lesson(t).trials, lesson(t).calls),
    /No competence improvement is qualified/,
  );
  last.compute.model = "synthetic-reference-v1";
  last.compute.maxOutputTokens = 1200;
  assert.match(
    p.learningComparison(lesson(t).trials, lesson(t).calls),
    /No competence improvement is qualified/,
  );
});

test("previously received procedure remains available on a later baseline instead of manufacturing an untrained avatar", async () => {
  const t = await fixture();
  practice(t, "baseline", false);
  teach(t);
  l.stopLearning(t);
  f.stopFollowing(t);
  ok(f.startFollowing(t, "arwyn"));
  ok(l.enableLearning(t));
  const req = request(t, "baseline-plan");
  assert.ok(req.prompt.includes("priorInstruction"));
  assert.ok(req.prompt.includes("reference-check-v1"));
  assert.ok(req.prompt.length <= 14000);
  assert.equal(t.followerLearning.sessions.length, 2);
  assert.notEqual(
    t.followerLearning.sessions[0].trials[0].caseId,
    t.followerLearning.sessions[1].trials[0].caseId,
  );
});

test("ended lesson retention stays bounded when the companion itself ends the grant", async () => {
  const { town: t } = await followingFixture(load);
  for (let i = 0; i < 11; i++) {
    ok(f.startFollowing(t, "arwyn"));
    ok(l.enableLearning(t));
    f.stopFollowing(t);
  }
  assert.equal(t.followerLearning.sessions.length, 8);
  assert.ok(t.followerLearning.sessions.every((s) => s.status === "ended"));
  assert.deepEqual(v.validateFollowerLearning(t), []);
  assert.ok(save.parseTownFile(save.exportTown(t)));
});

test("save conflict preserves canonical and losing bytes while revoking an active learner request", async () => {
  const box = new Map();
  globalThis.localStorage = {
    getItem: (k) => box.get(k) ?? null,
    setItem: (k, value) => box.set(k, value),
    removeItem: (k) => box.delete(k),
    key: (i) => [...box.keys()][i] ?? null,
    get length() {
      return box.size;
    },
  };
  try {
    const t = await fixture();
    ok(save.saveTownWithStatus(t));
    request(t, "baseline-plan");
    const canonical = box.get(save.TOWN_STORAGE_KEY) + " ";
    box.set(save.TOWN_STORAGE_KEY, canonical);
    const result = save.saveTownWithStatus(t);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "conflict");
    assert.equal(box.get(save.TOWN_STORAGE_KEY), canonical);
    assert.equal(lesson(t).status, "paused");
    assert.equal(lesson(t).calls[0].status, "interrupted");
    assert.equal(box.get(result.backupKey), result.localRaw);
    const recovered = save.parseTownFile(result.localRaw);
    assert.ok(recovered);
    assert.equal(lesson(recovered).calls[0].status, "interrupted");
  } finally {
    delete globalThis.localStorage;
  }
});

test("a real funded earlier shift blocks learning without altering its five-coin reservation", async () => {
  const { town: t } = await followingFixture(load);
  t.minute = 960;
  who(t, "player").tile = { x: 7, y: 19 };
  who(t, "kevin").tile = { x: 9, y: 19 };
  const { activateFundedTown } = await load("payroll-runtime");
  const { applyPlayerAction, playerActions } = await load("effects");
  const { auditEconomy } = await load("economy");
  ok(activateFundedTown(t));
  const choice = playerActions(t, "kevin").find((a) => a.label.startsWith("Accept cafe shift"));
  assert.ok(choice && !choice.disabledReason);
  assert.equal(applyPlayerAction(t, "kevin", choice.id).ok, true);
  const work = t.economy.work.agreements.find(
    (a) => a.worker === "player" && a.kind === "cafe-shift",
  );
  const before = JSON.stringify({
    holds: t.economy.holds,
    transactions: t.economy.transactions,
    payables: t.economy.work.payables,
    money: t.agents.map((a) => a.money),
    tills: t.tills,
  });
  who(t, "player").tile = { x: 43, y: 22 };
  who(t, "arwyn").tile = { x: 44, y: 21 };
  assert.equal(f.startFollowing(t, "arwyn").ok, false);
  assert.equal(l.enableLearning(t).ok, false);
  assert.equal(t.followerLearning, undefined);
  assert.equal(
    JSON.stringify({
      holds: t.economy.holds,
      transactions: t.economy.transactions,
      payables: t.economy.work.payables,
      money: t.agents.map((a) => a.money),
      tills: t.tills,
    }),
    before,
  );
  assert.equal(t.economy.holds.find((h) => h.id === work.holdId).remaining, 5);
  assert.deepEqual(auditEconomy(t), []);
});
