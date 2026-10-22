import assert from "node:assert/strict";

const originalMemoryId = (memory) =>
  String(memory.id).replace(/^archive-(?:chat|observe|plan)-/, "");
const residents = (town) => new Map(town.agents.map((agent) => [agent.id, agent]));
const sessionFor = (town, meetingId) =>
  town.discussions?.sessions.find((session) => session.id === meetingId);
const withoutRecipients = ({ recipientIds: _recipientIds, ...turn }) => turn;

function findSession(town, utterance) {
  const session = town.discussions?.sessions.find((candidate) =>
    candidate.utterances.some((turn) => turn.id === utterance.id),
  );
  assert.ok(session, `No session contains committed utterance ${utterance.id}`);
  return session;
}

/** Snapshot immediately before applying a result; this never calls an engine or model. */
export function captureDiscussionAuditSnapshot(town) {
  return structuredClone(town);
}

/** Inspect the actual per-resident observation, including nonmembers and the player. */
export function auditDiscussionObservations({ town, meetingId, observation }) {
  assert.equal(typeof observation, "function", "Provide the actual scoped observation helper");
  const session = sessionFor(town, meetingId);
  assert.ok(session, `Unknown discussion ${meetingId}`);
  const evidence = [];
  for (const agent of town.agents) {
    const actual = observation(town, agent.id, meetingId);
    const expected = session.utterances
      .filter((turn) => turn.speaker === agent.id || turn.recipientIds.includes(agent.id))
      .map(withoutRecipients);
    assert.deepEqual(
      actual.receivedTurns,
      expected,
      `${agent.id}: observation must contain only own or actually received turns`,
    );
    const member = session.members.find((candidate) => candidate.id === agent.id);
    if (!member || member.invitation === "unseen") {
      assert.equal(
        Object.hasOwn(actual.meeting ?? {}, "topic"),
        false,
        `${agent.id}: an unread invitation must not disclose the topic`,
      );
    }
    evidence.push({ actor: agent.id, receivedTurnIds: expected.map((turn) => turn.id) });
  }
  return evidence;
}

/**
 * Audit one actual committed utterance against the independent pre-commit state.
 * Supply the real canHear/observation helpers; no inferred NPC choices are made.
 */
export function auditDiscussionDelivery({ before, after, utterance, canHear, observation }) {
  assert.equal(typeof canHear, "function", "Provide the actual acoustic eligibility helper");
  const afterSession = findSession(after, utterance);
  const beforeSession = sessionFor(before, afterSession.id);
  assert.ok(beforeSession, "A committed utterance must belong to an existing meeting");
  assert.equal(
    beforeSession.status,
    "active",
    "The meeting must have been active before speech committed",
  );
  assert.equal(
    beforeSession.floor?.actor,
    utterance.speaker,
    "The actual speaker must have held the floor",
  );
  assert.equal(
    beforeSession.utterances.some((turn) => turn.id === utterance.id),
    false,
    "The audited speech must be newly committed",
  );
  assert.equal(
    afterSession.utterances.length,
    beforeSession.utterances.length + 1,
    "One result must commit exactly one utterance",
  );
  assert.deepEqual(
    afterSession.utterances.slice(0, -1),
    beforeSession.utterances,
    "Later choices must not rewrite previous speech or recipients",
  );
  assert.deepEqual(
    afterSession.utterances.at(-1),
    utterance,
    "Audit the actual saved utterance, not a proposed model line",
  );

  const beforePeople = residents(before),
    afterPeople = residents(after);
  const speaker = beforePeople.get(utterance.speaker);
  assert.ok(speaker, "The recorded speaker must exist");
  assert.deepEqual(
    utterance.speakerTile,
    speaker.tile,
    "Receipt location must be the actual speaker location",
  );
  assert.equal(utterance.source, "statement", "Speaking does not verify the content's truth");
  const eligible = beforeSession.members
    .filter((member) => {
      const person = beforePeople.get(member.id);
      return (
        person &&
        member.id !== utterance.speaker &&
        member.choice === "accepted" &&
        member.arrived &&
        ["listening", "participating"].includes(member.mode) &&
        canHear(speaker.tile, person.tile)
      );
    })
    .map((member) => member.id)
    .sort();
  assert.ok(eligible.length, "A committed speech needs an actual attentive listener");
  assert.deepEqual(
    [...utterance.recipientIds].sort(),
    eligible,
    "Recorded audience differs from actual accepted, present, attentive residents in earshot",
  );

  const expectedReceivers = new Set([utterance.speaker, ...eligible]);
  const memoryEvidence = [];
  for (const [id, oldAgent] of beforePeople) {
    const nextAgent = afterPeople.get(id);
    assert.ok(nextAgent, `${id}: utterance must not replace or remove a resident`);
    const oldIds = new Set(oldAgent.memories.map(originalMemoryId));
    const added = nextAgent.memories.filter((memory) => !oldIds.has(originalMemoryId(memory)));
    if (!expectedReceivers.has(id)) {
      assert.deepEqual(
        nextAgent.memories,
        oldAgent.memories,
        `${id}: nonlistener memories must remain unchanged`,
      );
      memoryEvidence.push({ actor: id, received: false, addedMemoryIds: [] });
      continue;
    }
    assert.equal(added.length, 1, `${id}: actual speaker/listener must get exactly one new memory`);
    const memory = added[0];
    assert.equal(
      memory.source,
      "statement",
      `${id}: received speech must retain statement provenance`,
    );
    assert.deepEqual(
      memory.turns,
      [{ speaker: utterance.speaker, text: utterance.text }],
      `${id}: memory must preserve the actual complete attributed turn`,
    );
    assert.ok(
      memory.text.startsWith(`${speaker.name} said in the library discussion:`),
      `${id}: memory excerpt must retain actual speaker attribution`,
    );
    memoryEvidence.push({
      actor: id,
      received: true,
      addedMemoryIds: [memory.id],
      fullAttributedTurn: true,
    });
  }
  return {
    meetingId: afterSession.id,
    utteranceId: utterance.id,
    speaker: utterance.speaker,
    expectedRecipientIds: eligible,
    actualRecipientIds: [...utterance.recipientIds].sort(),
    memories: memoryEvidence,
    observations: auditDiscussionObservations({
      town: after,
      meetingId: afterSession.id,
      observation,
    }),
  };
}

/** Fresh-fixture reload may normalize old text, but must not add knowledge or replay speech. */
export function auditDiscussionReload({ before, after, meetingId, observation }) {
  const previous = sessionFor(before, meetingId),
    restored = sessionFor(after, meetingId);
  assert.ok(previous && restored, "Reload must preserve the discussion");
  assert.deepEqual(
    restored.utterances,
    previous.utterances,
    "Reload must preserve committed words and audience receipts exactly",
  );
  const previousPeople = residents(before);
  for (const agent of after.agents) {
    const old = previousPeople.get(agent.id);
    assert.ok(old, `Reload introduced resident ${agent.id}`);
    assert.deepEqual(
      agent.memories.map(originalMemoryId).sort(),
      old.memories.map(originalMemoryId).sort(),
      `${agent.id}: reload must not create or backfill memories`,
    );
  }
  const expected = auditDiscussionObservations({ town: before, meetingId, observation });
  const actual = auditDiscussionObservations({ town: after, meetingId, observation });
  assert.deepEqual(actual, expected, "Reload must not change who knows each committed turn");
  return {
    meetingId,
    unchangedUtteranceIds: restored.utterances.map((turn) => turn.id),
    observations: actual,
    knowledgeBackfilled: false,
  };
}
