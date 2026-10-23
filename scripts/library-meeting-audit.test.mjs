import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditDiscussionDelivery,
  auditDiscussionReload,
  captureDiscussionAuditSnapshot,
} from "./library-meeting-audit.mjs";

const meetingId = "discussion:1";
const person = (town, id) => town.agents.find((agent) => agent.id === id);
const session = (town) => town.discussions.sessions[0];
const canHear = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 6;
function observation(town, id) {
  const meeting = session(town),
    member = meeting.members.find((member) => member.id === id);
  return {
    meeting: {
      id: meeting.id,
      ...(member?.invitation === "delivered" ? { topic: meeting.topic } : {}),
    },
    receivedTurns: meeting.utterances
      .filter((turn) => turn.speaker === id || turn.recipientIds.includes(id))
      .map(({ recipientIds: _ids, ...turn }) => turn),
  };
}
function fixture() {
  const before = {
    agents: ["northern", "arwyn", "sub", "player", "baba"].map((id, index) => ({
      id,
      name: id,
      tile: { x: 42 + (index % 2), y: 21 },
      memories: [],
    })),
    discussions: {
      version: 1,
      sessions: [
        {
          id: meetingId,
          topic: "A public topic",
          status: "active",
          floor: { actor: "northern", id: "turn:1" },
          utterances: [],
          members: ["northern", "arwyn", "sub", "player"].map((id) => ({
            id,
            invitation: "delivered",
            choice: "accepted",
            arrived: true,
            mode: ["northern", "arwyn"].includes(id) ? "participating" : "off",
          })),
        },
      ],
    },
  };
  const after = structuredClone(before);
  const utterance = {
    id: "discussion:1:speech:1",
    seq: 1,
    speaker: "northern",
    text: "Would a reading be useful?",
    at: { day: 1, minute: 420 },
    speakerTile: { ...person(before, "northern").tile },
    recipientIds: ["arwyn"],
    source: "statement",
    mind: "grok",
  };
  session(after).utterances.push(utterance);
  for (const [index, id] of ["northern", "arwyn"].entries())
    person(after, id).memories.push({
      id: `m${index + 1}`,
      source: "statement",
      text: `northern said in the library discussion: “${utterance.text}”`,
      turns: [{ speaker: "northern", text: utterance.text }],
    });
  return { before, after, utterance, canHear, observation };
}

test("audit accepts actual opted-in delivery and excludes nearby inattentive residents", () => {
  const args = fixture();
  const original = structuredClone(args.after);
  const receipt = auditDiscussionDelivery(args);
  assert.deepEqual(receipt.actualRecipientIds, ["arwyn"]);
  assert.deepEqual(receipt.observations.find((row) => row.actor === "baba").receivedTurnIds, []);
  assert.deepEqual(args.after, original, "Auditing must remain read-only");
  const captured = captureDiscussionAuditSnapshot(args.after);
  captured.agents[0].memories.length = 0;
  assert.equal(args.after.agents[0].memories.length, 1, "Snapshots cannot mutate the live town");
});

test("audit detects an omitted attentive recipient and an added inattentive recipient", () => {
  for (const ids of [[], ["arwyn", "sub"]]) {
    const args = fixture();
    args.utterance.recipientIds = ids;
    assert.throws(() => auditDiscussionDelivery(args), /Recorded audience differs/);
  }
});

test("audit detects leaked bystander memory even when the receipt itself is correct", () => {
  const args = fixture();
  person(args.after, "baba").memories.push({
    id: "m9",
    source: "statement",
    text: args.utterance.text,
  });
  assert.throws(
    () => auditDiscussionDelivery(args),
    /baba: nonlistener memories must remain unchanged/,
  );
});

test("audit rejects missing full attribution and fabricated factual provenance", () => {
  const args = fixture();
  person(args.after, "arwyn").memories[0].turns[0].speaker = "sub";
  assert.throws(() => auditDiscussionDelivery(args), /complete attributed turn/);
  const wrongSource = fixture();
  person(wrongSource.after, "arwyn").memories[0].source = "event";
  assert.throws(() => auditDiscussionDelivery(wrongSource), /statement provenance/);
});

test("audit detects observation leakage independently of correct memories and receipts", () => {
  const args = fixture();
  args.observation = (town, id) => {
    const view = observation(town, id);
    if (id === "baba") view.receivedTurns = observation(town, "arwyn").receivedTurns;
    return view;
  };
  assert.throws(() => auditDiscussionDelivery(args), /baba: observation must contain only/);
});

test("audit uses pre-commit attention even if the committed turn closes the meeting", () => {
  const args = fixture();
  session(args.after).status = "closed";
  for (const member of session(args.after).members) member.mode = "off";
  assert.deepEqual(auditDiscussionDelivery(args).actualRecipientIds, ["arwyn"]);
});

test("late listening and opt-out do not expose or rewrite earlier speech", () => {
  const args = fixture();
  const first = structuredClone(args.utterance);
  const before = structuredClone(args.after);
  session(before).floor = { actor: "northern", id: "turn:2" };
  session(before).members.find((member) => member.id === "player").mode = "listening";
  session(before).members.find((member) => member.id === "arwyn").mode = "off";
  const after = structuredClone(before);
  const utterance = {
    ...structuredClone(first),
    id: "discussion:1:speech:2",
    seq: 2,
    text: "A later reply.",
    recipientIds: ["player"],
  };
  session(after).utterances.push(utterance);
  for (const [index, id] of ["northern", "player"].entries())
    person(after, id).memories.push({
      id: `m${index + 3}`,
      source: "statement",
      text: `northern said in the library discussion: “${utterance.text}”`,
      turns: [{ speaker: "northern", text: utterance.text }],
    });
  const evidence = auditDiscussionDelivery({ before, after, utterance, canHear, observation });
  assert.deepEqual(evidence.observations.find((row) => row.actor === "player").receivedTurnIds, [
    utterance.id,
  ]);
  assert.deepEqual(evidence.observations.find((row) => row.actor === "arwyn").receivedTurnIds, [
    first.id,
  ]);
  session(after).utterances[0].recipientIds.push("player");
  assert.throws(
    () => auditDiscussionDelivery({ before, after, utterance, canHear, observation }),
    /rewrite previous speech/,
  );
});

test("reload audit rejects memory backfill and recipient changes", () => {
  const { after: before } = fixture();
  const after = structuredClone(before);
  assert.equal(
    auditDiscussionReload({ before, after, meetingId, observation }).knowledgeBackfilled,
    false,
  );
  person(after, "baba").memories.push({ id: "m8", source: "statement", text: "Backfilled words" });
  assert.throws(
    () => auditDiscussionReload({ before, after, meetingId, observation }),
    /baba: reload must not create or backfill memories/,
  );
  const changed = structuredClone(before);
  session(changed).utterances[0].recipientIds.push("baba");
  assert.throws(
    () => auditDiscussionReload({ before, after: changed, meetingId, observation }),
    /preserve committed words and audience/,
  );
});
