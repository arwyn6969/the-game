import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const d = await server.ssrLoadModule("/src/game/discussions.ts");
const { canHear } = await server.ssrLoadModule("/src/game/attention.ts");
const { createTown } = await server.ssrLoadModule("/src/game/town.ts");
const save = await server.ssrLoadModule("/src/game/save.ts");
const physical = await server.ssrLoadModule("/src/game/physical-items.ts");
const { stepMinute } = await server.ssrLoadModule("/src/game/sim.ts");
after(() => server.close());
let serial = 0;
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const meeting = (town) => town.discussions.sessions.at(-1);
const member = (town, id) => meeting(town).members.find((member) => member.id === id);
const ok = (result) => {
  assert.equal(result.ok, true, result.message);
  return result;
};
function fixture() {
  const town = createTown("Mira");
  for (const [id, tile] of Object.entries({
    player: { x: 43, y: 22 },
    northern: { x: 42, y: 21 },
    arwyn: { x: 44, y: 21 },
    sub: { x: 43, y: 20 },
    baba: { x: 42, y: 22 },
  }))
    person(town, id).tile = tile;
  ok(d.createLibraryDiscussion(town, "A possible shared reading"));
  return town;
}
function command(town, id, kind, fields = {}) {
  return d.applyDiscussionCommand(town, id, {
    kind,
    meetingId: meeting(town).id,
    expectedRevision: member(town, id).revision,
    commandId: `test:${++serial}`,
    ...fields,
  });
}
function invite(town, id) {
  ok(command(town, "player", "invite", { invitee: id }));
}
function join(town, id, mode = "listen") {
  if (member(town, id).invitation === "unseen") invite(town, id);
  if (member(town, id).choice === "pending") ok(command(town, id, "accept"));
  ok(command(town, id, mode));
}
function gathered() {
  const town = fixture();
  join(town, "northern", "participate");
  join(town, "arwyn");
  join(town, "sub");
  assert.equal(meeting(town).status, "active");
  return town;
}
function ai(town, decision) {
  const job = d.nextDiscussionJob(town);
  assert.ok(job);
  assert.equal(d.markDiscussionRequest(town, job), true);
  const result = d.applyDiscussionResult(town, { ...job, mind: "grok", decision });
  d.recordDiscussionUsage(town, job, {
    success: result.ok,
    attempts: 1,
    totalTokens: 25,
    elapsedMs: 10,
  });
  return { job, result };
}

test("old towns stay opt out and proposal creates no NPC choice or speech", () => {
  const old = createTown("Legacy");
  assert.equal(save.parseTownFile(save.exportTown(old)).discussions, undefined);
  const town = fixture();
  assert.deepEqual(
    meeting(town)
      .members.filter((m) => m.id !== "player")
      .map((m) => [m.choice, m.mode]),
    [
      ["pending", "off"],
      ["pending", "off"],
      ["pending", "off"],
    ],
  );
  assert.equal(meeting(town).utterances.length, 0);
  assert.deepEqual(d.validateDiscussions(town), []);
});

test("acoustics merge outdoor labels but walls and room boundaries block hearing", () => {
  assert.equal(canHear({ x: 21, y: 17 }, { x: 20, y: 17 }), true);
  assert.equal(canHear({ x: 16, y: 20 }, { x: 18, y: 20 }), false);
  assert.equal(canHear({ x: 40, y: 21 }, { x: 46, y: 21 }), true);
  assert.equal(canHear({ x: 40, y: 21 }, { x: 47, y: 21 }), false);
  assert.equal(canHear({ x: -1, y: 1 }, { x: 1, y: 1 }), false);
});

test("invitation delivery, acceptance, arrival and attention remain separate", () => {
  const town = fixture();
  assert.equal(d.discussionObservation(town, "northern").meeting.topic, undefined);
  invite(town, "northern");
  assert.equal(member(town, "northern").choice, "pending");
  ok(command(town, "northern", "accept"));
  assert.equal(member(town, "northern").arrived, true);
  assert.equal(member(town, "northern").mode, "off");
  assert.equal(meeting(town).status, "gathering");
  join(town, "arwyn");
  assert.equal(meeting(town).status, "gathering", "facilitator has not chosen to listen");
  ok(command(town, "northern", "participate"));
  assert.equal(meeting(town).status, "active");
});

test("unseen notice gets a single read or ignore choice before the speaking floor", () => {
  const town = fixture();
  assert.equal(d.nextDiscussionJob(town).agentId, "northern");
  ok(ai(town, { kind: "read-invitation" }).result);
  assert.equal(member(town, "northern").invitation, "delivered");
  ok(ai(town, { kind: "accept" }).result);
  ok(ai(town, { kind: "participate" }).result);
  assert.equal(d.nextDiscussionJob(town).agentId, "arwyn");
  ok(ai(town, { kind: "ignore" }).result);
  assert.equal(d.nextDiscussionJob(town).agentId, "sub");
  assert.deepEqual(d.validateDiscussions(town), []);
});

test("only opted-in actual recipients and speaker remember a committed utterance", () => {
  const town = gathered();
  const before = new Map(town.agents.map((agent) => [agent.id, agent.memories.length]));
  ok(command(town, "northern", "speak", { text: "We might share a reading next week." }));
  const line = meeting(town).utterances[0];
  assert.deepEqual(line.recipientIds.sort(), ["arwyn", "sub"]);
  for (const id of ["player", "baba"])
    assert.equal(person(town, id).memories.length, before.get(id));
  for (const id of ["northern", "arwyn", "sub"])
    assert.equal(person(town, id).memories.at(-1).source, "statement");
  assert.equal(d.discussionObservation(town, "player").receivedTurns.length, 0);
  assert.equal(
    d.discussionView(town).meeting.utterances.length,
    1,
    "spectator can view public transcript",
  );
  assert.equal("recipientIds" in d.discussionView(town).meeting.utterances[0], false);
});

test("a late listener gets the reply and recap, never an earlier unheard question", () => {
  const town = gathered();
  ok(command(town, "sub", "stop-listening"));
  ok(command(town, "northern", "speak", { text: "Would a reading help?" }));
  ok(command(town, "sub", "listen"));
  ok(command(town, "northern", "speak", { text: "To recap, I asked about a reading." }));
  const heard = d.discussionObservation(town, "sub").receivedTurns;
  assert.equal(heard.length, 1);
  assert.match(heard[0].text, /recap/);
  assert.equal(heard[0].seq, 2);
});

test("listener changes do not invalidate the speaker; leaving prevents eventual delivery", () => {
  const town = gathered();
  const job = d.nextDiscussionJob(town);
  assert.equal(job.agentId, "northern");
  assert.equal(d.markDiscussionRequest(town, job), true);
  ok(command(town, "sub", "stop-listening"));
  assert.equal(d.isDiscussionJobFresh(town, job), true);
  ok(command(town, "player", "listen"));
  ok(
    d.applyDiscussionResult(town, {
      ...job,
      mind: "grok",
      decision: { kind: "speak", text: "Here is the eventual answer." },
    }),
  );
  d.recordDiscussionUsage(town, job, {
    success: true,
    attempts: 1,
    totalTokens: 8,
    elapsedMs: 100,
  });
  assert.deepEqual(meeting(town).utterances[0].recipientIds.sort(), ["arwyn", "player"]);
});

test("a moved speaker or withdrawn floor cannot commit a late result", () => {
  const town = gathered();
  const job = d.nextDiscussionJob(town);
  assert.equal(d.markDiscussionRequest(town, job), true);
  person(town, "northern").tile = { x: 20, y: 20 };
  assert.equal(d.isDiscussionJobFresh(town, job), false);
  assert.equal(
    d.applyDiscussionResult(town, {
      ...job,
      mind: "grok",
      decision: { kind: "speak", text: "Too late." },
    }).ok,
    false,
  );
  assert.equal(meeting(town).utterances.length, 0);
});

test("repeated command and repeated AI response do not repeat speech or memories", () => {
  const town = gathered();
  const cmd = {
    kind: "speak",
    text: "One contribution.",
    meetingId: meeting(town).id,
    expectedRevision: member(town, "northern").revision,
    commandId: "stable-delivery",
  };
  ok(d.applyDiscussionCommand(town, "northern", cmd));
  const memories = person(town, "arwyn").memories.length;
  ok(d.applyDiscussionCommand(town, "northern", cmd));
  assert.equal(meeting(town).utterances.length, 1);
  assert.equal(person(town, "arwyn").memories.length, memories);
});

test("six turns close the meeting without obligations or scripted extra dialogue", () => {
  const town = gathered();
  const balances = town.agents.map((agent) => agent.money);
  const favors = JSON.stringify(town.favors);
  for (let i = 0; i < 6; i++)
    ok(command(town, "northern", "speak", { text: `Contribution ${i + 1}.` }));
  assert.equal(meeting(town).status, "closed");
  assert.equal(meeting(town).utterances.length, 6);
  assert.deepEqual(
    town.agents.map((agent) => agent.money),
    balances,
  );
  assert.equal(JSON.stringify(town.favors), favors);
  assert.deepEqual(d.validateDiscussions(town), []);
});

test("in-flight reload becomes paused and cannot replay the old request", () => {
  const town = gathered();
  const job = d.nextDiscussionJob(town);
  assert.equal(d.markDiscussionRequest(town, job), true);
  const restored = save.parseTownFile(save.exportTown(town));
  assert.ok(restored);
  assert.equal(meeting(restored).status, "paused");
  assert.equal(meeting(restored).pending, null);
  assert.equal(meeting(restored).usage.attemptsUnknown, 1);
  assert.equal(d.isDiscussionJobFresh(restored, job), false);
  ok(d.resumeDiscussion(restored));
  assert.equal(d.isDiscussionJobFresh(restored, job), false);
});

test("saved nextId repair and allocation never reuse a retained discussion ID", () => {
  const town = fixture();
  ok(command(town, "player", "close"));
  const data = JSON.parse(save.exportTown(town));
  data.town.nextId = 0;
  const restored = save.parseTownFile(JSON.stringify(data));
  assert.ok(restored);
  const originalId = meeting(restored).id;
  ok(d.createLibraryDiscussion(restored, "A second discussion"));
  assert.notEqual(meeting(restored).id, originalId);
  assert.deepEqual(d.validateDiscussions(restored), []);
  assert.ok(save.parseTownFile(save.exportTown(restored)));
  ok(command(restored, "player", "close"));
  restored.nextId = Number(originalId.split(":").at(-1));
  ok(d.createLibraryDiscussion(restored, "A third discussion"));
  assert.equal(new Set(restored.discussions.sessions.map((m) => m.id)).size, 3);
});

test("a paused meeting still allows own Stop listening and Leave without resuming others", () => {
  const town = gathered();
  ok(command(town, "player", "listen"));
  d.pauseDiscussion(town, "A reply timed out.");
  const actions = d.discussionView(town).actions.map((action) => action.kind);
  assert.ok(actions.includes("stop-listening"));
  assert.ok(actions.includes("leave"));
  ok(command(town, "player", "stop-listening"));
  assert.equal(meeting(town).status, "paused");
  assert.equal(member(town, "player").mode, "off");
  assert.equal(member(town, "arwyn").mode, "listening");
  ok(command(town, "player", "leave"));
  assert.equal(member(town, "player").choice, "left");
  assert.equal(meeting(town).status, "paused");
  assert.deepEqual(d.validateDiscussions(town), []);
});

test("invalid or oversized discussion payload preserves the exact raw recovery file", () => {
  const town = gathered();
  ok(command(town, "northern", "speak", { text: "A real recorded statement." }));
  for (const corrupt of [
    (copy) => {
      meeting(copy).utterances[0].recipientIds.push("absent");
    },
    (copy) => {
      meeting(copy).utterances[0].text = "x".repeat(401);
    },
    (copy) => {
      meeting(copy).members[1].mode = "invalid";
    },
  ]) {
    const copy = structuredClone(town);
    corrupt(copy);
    const raw = JSON.stringify({ version: 2, town: copy });
    const result = save.readTownFile(raw);
    assert.equal(result.status, "unreadable");
    assert.equal(result.raw, raw);
    assert.match(result.reason, /discussion/i);
  }
});

test("future and pre-meeting utterances cannot enter knowledge through imported receipts", () => {
  const town = gathered();
  ok(command(town, "northern", "speak", { text: "This was said at the current meeting time." }));
  assert.ok(
    save.parseTownFile(save.exportTown(town)),
    "same-minute creation and speech remain valid",
  );
  for (const [label, corrupt] of [
    [
      "future meeting",
      (copy) => {
        meeting(copy).createdAt.minute = copy.minute + 1;
      },
    ],
    [
      "future speech",
      (copy) => {
        meeting(copy).utterances[0].at.day = copy.day + 1;
      },
    ],
    [
      "speech before creation",
      (copy) => {
        meeting(copy).utterances[0].at.minute = copy.minute - 1;
      },
    ],
    [
      "NPC speech labelled player",
      (copy) => {
        meeting(copy).utterances[0].mind = "player";
      },
    ],
  ]) {
    const copy = structuredClone(town);
    corrupt(copy);
    const raw = JSON.stringify({ version: 2, town: copy });
    const report = save.readTownFile(raw);
    assert.equal(report.status, "unreadable", label);
    assert.equal(report.raw, raw, label);
    assert.match(report.reason, /discussion/i, label);
  }
});

test("temporary meeting routes preserve real plans and use ordinary physical movement", () => {
  const town = fixture();
  invite(town, "sub");
  person(town, "sub").tile = { x: 36, y: 21 };
  ok(command(town, "sub", "accept"));
  const plan = JSON.stringify(person(town, "sub").plan);
  assert.equal(member(town, "sub").arrived, false);
  assert.deepEqual(d.meetingMovementGoals(town).sub, { x: 43, y: 20 });
  assert.equal(d.meetingMovementGoals(town, { sub: { x: 35, y: 20 } }).sub, undefined);
  stepMinute(town, false);
  assert.notDeepEqual(person(town, "sub").tile, { x: 36, y: 21 });
  assert.equal(JSON.stringify(person(town, "sub").plan), plan);
  assert.equal(distance(person(town, "sub").tile, { x: 36, y: 21 }) <= 3, true);
});
function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

test("physical unaddressed speech no longer gives inattentive bystanders its words", () => {
  const town = fixture();
  ok(physical.initializePhysicalItems(town));
  const before = person(town, "baba").memories.length;
  ok(
    physical.applyPhysicalCommand(town, "northern", {
      kind: "speak",
      text: "A private observation said aloud.",
    }),
  );
  assert.equal(person(town, "baba").memories.length, before);
  assert.equal(person(town, "northern").memories.at(-1).source, "statement");
});

test("history retention keeps heard attributed memories and never evicts unfinished state", () => {
  const town = gathered();
  ok(command(town, "northern", "speak", { text: "Keep this attributed statement." }));
  ok(command(town, "player", "close"));
  for (let i = 0; i < 9; i++) {
    ok(d.createLibraryDiscussion(town, `Meeting ${i}`));
    if (i < 8) ok(command(town, "player", "close"));
  }
  assert.equal(town.discussions.sessions.length, 9);
  assert.equal(meeting(town).status, "gathering");
  assert.ok(
    person(town, "arwyn").memories.some(
      (memory) => memory.source === "statement" && memory.text.includes("Keep this attributed"),
    ),
  );
  assert.deepEqual(d.validateDiscussions(town), []);
  assert.ok(save.parseTownFile(save.exportTown(town)));
});
