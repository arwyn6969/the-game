import type { AgentId, NpcId, Town } from "./types";
import { NPC_IDS } from "./types";
import type {
  DiscussionAction,
  DiscussionActionResult,
  DiscussionCommand,
  DiscussionDecision,
  DiscussionJob,
  DiscussionMember,
  DiscussionResult,
  DiscussionSession,
  DiscussionUsageSample,
  DiscussionView,
} from "./discussion-types";
import { canHear, attentiveDiscussionRecipients } from "./attention";
import { absMinute, makeMemory, pushMemory } from "./memory";
import { wageInterval } from "./funded-work";
import { walkable, zoneAt } from "./world";

export const DISCUSSION_LIMITS = { turns: 6, decisions: 16, closed: 8, text: 400 } as const;
export const DISCUSSION_VENUE = { x: 43, y: 21 };
const CAST: NpcId[] = ["northern", "arwyn", "sub"];
const SEATS: Partial<Record<AgentId, { x: number; y: number }>> = {
  northern: { x: 42, y: 21 },
  arwyn: { x: 44, y: 21 },
  sub: { x: 43, y: 20 },
  player: { x: 43, y: 22 },
};
const actor = (town: Town, id: AgentId) => town.agents.find((agent) => agent.id === id);
const at = (town: Town) => ({ day: town.day, minute: town.minute });
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const usage = () => ({
  requests: 0,
  providerAttempts: 0,
  attemptsUnknown: 0,
  knownTokens: 0,
  tokenSamples: 0,
  tokensUnknown: 0,
  elapsedMs: 0,
  failures: 0,
});
const active = (town: Town, id?: string) =>
  id
    ? town.discussions?.sessions.find((meeting) => meeting.id === id)
    : ([...(town.discussions?.sessions ?? [])]
        .reverse()
        .find((meeting) => meeting.status !== "closed") ?? town.discussions?.sessions.at(-1));
const memberOf = (meeting: DiscussionSession, id: AgentId) =>
  meeting.members.find((member) => member.id === id);
const touch = (meeting: DiscussionSession, member?: DiscussionMember) => {
  meeting.revision++;
  if (member) member.revision++;
};
const inRoom = (town: Town, id: AgentId) => {
  const person = actor(town, id);
  return Boolean(
    person &&
    zoneAt(person.tile.x, person.tile.y) === "library" &&
    distance(person.tile, DISCUSSION_VENUE) <= 4,
  );
};
const safeText = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max &&
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
const requestKey = (job: DiscussionJob) =>
  `${job.meetingId}:${job.sessionRevision}:${job.agentId}:${job.actorRevision}:${job.turnId ?? "decision"}`;
const requests = new WeakMap<Town, Set<string>>();
type Reserved = Partial<Record<AgentId, { x: number; y: number }>>;

function isCommitted(town: Town, id: AgentId, reserved: Reserved = {}): boolean {
  if (reserved[id]) return true;
  if (
    town.physicalItems?.session?.enabled &&
    town.physicalItems.session.actor === id &&
    town.physicalItems.session.intent
  )
    return true;
  return Boolean(
    town.economy?.work?.agreements.some(
      (agreement) =>
        agreement.worker === id &&
        agreement.status === "active" &&
        (agreement.kind === "check" || wageInterval(town, agreement)),
    ),
  );
}
function hasQuorum(meeting: DiscussionSession): boolean {
  const present = meeting.members.filter(
    (member) => member.choice === "accepted" && member.arrived && member.mode !== "off",
  );
  return present.some((member) => member.id === meeting.facilitator) && present.length >= 2;
}
function finishFloor(meeting: DiscussionSession, member: DiscussionMember) {
  meeting.floor = null;
  meeting.queue = meeting.queue.filter((id) => id !== member.id);
  member.decisionNeeded = false;
  if (member.mode === "participating" && member.arrived && member.choice === "accepted")
    meeting.queue.push(member.id);
}
function close(meeting: DiscussionSession, reason: string) {
  meeting.status = "closed";
  meeting.reason = reason;
  meeting.epoch++;
  meeting.pending = null;
  meeting.floor = null;
  meeting.queue = [];
  for (const member of meeting.members) {
    member.mode = "off";
    member.decisionNeeded = false;
  }
  touch(meeting);
}
function prune(town: Town) {
  const state = town.discussions!;
  const closed = state.sessions.filter((meeting) => meeting.status === "closed");
  const remove = new Set(
    closed
      .slice(0, Math.max(0, closed.length - DISCUSSION_LIMITS.closed))
      .map((meeting) => meeting.id),
  );
  // Received speech is already materialized as a bounded attributed memory.
  state.sessions = state.sessions.filter((meeting) => !remove.has(meeting.id));
}

export function createLibraryDiscussion(
  town: Town,
  topic: string,
  facilitator: "northern" | "arwyn" = "northern",
): DiscussionActionResult {
  if (!safeText(topic, 160))
    return { ok: false, message: "Give the meeting a topic of 1–160 characters." };
  if (!["northern", "arwyn"].includes(facilitator))
    return { ok: false, message: "Choose Northern or Arwyn as the proposed facilitator." };
  if (town.discussions?.sessions.some((meeting) => meeting.status !== "closed"))
    return { ok: false, message: "Finish or close the current meeting first." };
  const usedIds = new Set(town.discussions?.sessions.map((meeting) => meeting.id) ?? []);
  let id = `discussion:${town.nextId++}`;
  while (usedIds.has(id)) id = `discussion:${town.nextId++}`;
  const proposedCast = [facilitator, ...CAST.filter((id) => id !== facilitator)];
  const members: DiscussionMember[] = [...proposedCast, "player" as const].map((id) => ({
    id,
    invitation: id === "player" ? "delivered" : "unseen",
    choice: id === "player" ? "accepted" : "pending",
    role: id === facilitator ? "facilitator" : "participant",
    revision: 1,
    mode: "off",
    arrived: false,
    decisionNeeded: false,
    noticedCue: false,
  }));
  const meeting: DiscussionSession = {
    id,
    revision: 1,
    epoch: 1,
    topic: topic.trim(),
    venue: "library",
    facilitator,
    status: "gathering",
    reason:
      "Deliver the invitation face to face, or let residents choose to read the library notice.",
    createdAt: at(town),
    members,
    queue: [],
    floor: null,
    utterances: [],
    decisions: 0,
    usage: usage(),
    pending: null,
    commands: [],
  };
  (town.discussions ??= { version: 1, sessions: [] }).sessions.push(meeting);
  prune(town);
  advanceDiscussions(town);
  return {
    ok: true,
    message: "The meeting is proposed. Nobody has accepted or started listening yet.",
    meetingId: id,
  };
}

function actions(town: Town, meeting: DiscussionSession, id: AgentId): DiscussionAction[] {
  const member = memberOf(meeting, id);
  if (!member || meeting.status === "closed") return [];
  const result: DiscussionAction[] = [];
  const add = (kind: DiscussionDecision["kind"], label: string) => result.push({ kind, label });
  if (id === "player") add("close", "Close meeting");
  if (meeting.status === "paused") {
    // A provider pause must never hold a resident's attention hostage.
    if (member.choice === "accepted") {
      add("leave", "Leave discussion");
      if (member.mode !== "off") add("stop-listening", "Stop listening");
    }
    return result;
  }
  if (member.invitation === "unseen") {
    if (canHear(DISCUSSION_VENUE, actor(town, id)!.tile)) {
      add("read-invitation", "Read the meeting invitation");
      add("ignore", "Ignore this notice");
    }
    return result;
  }
  if (member.choice === "pending") {
    add(
      "accept",
      member.role === "facilitator"
        ? "Accept the invitation and facilitate"
        : "Accept the invitation",
    );
    add("decline", "Decline the invitation");
    return result;
  }
  if (member.choice !== "accepted") return result;
  add("leave", "Leave discussion");
  if (!member.arrived || isCommitted(town, id)) return result;
  if (member.mode === "off") {
    add("listen", "Join and listen");
    add("participate", "Join as a speaker");
    return result;
  }
  add("stop-listening", "Stop listening");
  if (member.mode === "listening") add("participate", "Join as a speaker");
  if (meeting.status === "active") {
    if (meeting.floor?.actor === id) {
      add("speak", "Say it");
      add("pass", "Pass this turn");
    } else if (!meeting.queue.includes(id)) add("request-turn", "Request a turn");
    else add("withdraw-turn", "Withdraw turn request");
  }
  if (id === meeting.facilitator) add("close", "Close meeting");
  return result;
}

export function applyDiscussionCommand(
  town: Town,
  id: AgentId,
  command: DiscussionCommand,
): DiscussionActionResult {
  if (!command || typeof command !== "object")
    return { ok: false, message: "Choose a current meeting action." };
  advanceDiscussions(town);
  const meeting = active(town, command.meetingId);
  const member = meeting && memberOf(meeting, id);
  const fail = (message: string) => ({ ok: false, message });
  if (!meeting || !member || !safeText(command.commandId, 180))
    return fail("That meeting action is unavailable.");
  if (meeting.commands.includes(command.commandId))
    return { ok: true, message: "That action was already recorded.", meetingId: meeting.id };
  if (command.expectedRevision !== member.revision)
    return fail("The meeting changed. Check the current action before trying again.");
  const keys = Object.keys(command);
  const allowed = [
    "kind",
    "meetingId",
    "expectedRevision",
    "commandId",
    ...(command.kind === "speak" ? ["text"] : command.kind === "invite" ? ["invitee"] : []),
  ];
  if (keys.some((key) => !allowed.includes(key))) return fail("Choose one exact meeting action.");
  if (command.kind === "invite") {
    const invitee = memberOf(meeting, command.invitee);
    const person = actor(town, command.invitee),
      inviter = actor(town, id);
    if (
      id !== "player" ||
      meeting.status === "closed" ||
      !invitee ||
      !person ||
      !inviter ||
      !canHear(inviter.tile, person.tile, 2)
    )
      return fail("Walk beside that resident to deliver the invitation.");
    if (invitee.invitation === "delivered")
      return { ok: true, message: "They already received the invitation." };
    invitee.invitation = "delivered";
    invitee.decisionNeeded = true;
    touch(meeting, invitee);
    pushMemory(
      person,
      makeMemory(
        town,
        town.day,
        town.minute,
        "observe",
        `${town.playerName} invited me to a library discussion: ${meeting.topic}. This is an invitation, not an attendance commitment.`,
        5,
        { source: "statement" },
      ),
    );
  } else {
    if (!actions(town, meeting, id).some((action) => action.kind === command.kind))
      return fail("That action is not available in the current meeting.");
    switch (command.kind) {
      case "read-invitation":
        member.invitation = "delivered";
        member.decisionNeeded = true;
        pushMemory(
          actor(town, id)!,
          makeMemory(
            town,
            town.day,
            town.minute,
            "observe",
            `I read an invitation to a library discussion: ${meeting.topic}. The proposed facilitator is ${actor(town, meeting.facilitator)!.name}; nobody's attendance is guaranteed.`,
            5,
            { source: "statement" },
          ),
        );
        break;
      case "ignore":
        member.decisionNeeded = false;
        break;
      case "accept":
        member.choice = "accepted";
        member.decisionNeeded = false;
        break;
      case "decline":
        member.choice = "declined";
        member.decisionNeeded = false;
        if (id === meeting.facilitator)
          close(meeting, "The proposed facilitator declined. This meeting will not proceed.");
        break;
      case "listen":
        member.mode = "listening";
        member.decisionNeeded = false;
        break;
      case "participate":
        member.mode = "participating";
        member.decisionNeeded = false;
        if (!meeting.queue.includes(id)) meeting.queue.push(id);
        break;
      case "stop-listening":
        member.mode = "off";
        member.decisionNeeded = false;
        meeting.queue = meeting.queue.filter((other) => other !== id);
        if (meeting.floor?.actor === id) meeting.floor = null;
        break;
      case "leave":
        member.choice = "left";
        member.mode = "off";
        member.decisionNeeded = false;
        meeting.queue = meeting.queue.filter((other) => other !== id);
        if (meeting.floor?.actor === id) meeting.floor = null;
        break;
      case "request-turn":
        member.mode = "participating";
        if (!meeting.queue.includes(id)) meeting.queue.push(id);
        break;
      case "withdraw-turn":
        member.mode = "listening";
        meeting.queue = meeting.queue.filter((other) => other !== id);
        break;
      case "pass":
        finishFloor(meeting, member);
        break;
      case "speak": {
        if (!safeText(command.text, DISCUSSION_LIMITS.text))
          return fail("Say something in 1–400 characters. Your draft is unchanged.");
        const source = actor(town, id)!;
        const recipients = attentiveDiscussionRecipients(town, id, meeting.id);
        if (!recipients.length)
          return fail("There is no attentive listener in earshot. Your draft is unchanged.");
        const seq = meeting.utterances.length + 1;
        const utterance = {
          id: `${meeting.id}:speech:${seq}`,
          seq,
          speaker: id,
          text: command.text.trim(),
          at: at(town),
          speakerTile: { ...source.tile },
          recipientIds: recipients,
          source: "statement" as const,
          mind: id === "player" ? ("player" as const) : ("grok" as const),
        };
        meeting.utterances.push(utterance);
        for (const recipientId of [id, ...recipients]) {
          pushMemory(
            actor(town, recipientId)!,
            makeMemory(
              town,
              town.day,
              town.minute,
              "observe",
              `${source.name} said in the library discussion: “${utterance.text}”`,
              6,
              { source: "statement", turns: [{ speaker: id, text: utterance.text }] },
            ),
          );
        }
        source.bubble = { text: utterance.text, until: absMinute(town.day, town.minute) + 8 };
        finishFloor(meeting, member);
        if (meeting.utterances.length >= DISCUSSION_LIMITS.turns)
          close(
            meeting,
            "The six-turn meeting is complete. Its statements remain recorded; no agreement was invented.",
          );
        break;
      }
      case "close":
        close(meeting, "The meeting was closed with its actual discussion preserved.");
        break;
    }
    touch(meeting, member);
  }
  meeting.commands.push(command.commandId);
  meeting.commands = meeting.commands.slice(-96);
  advanceDiscussions(town);
  return {
    ok: true,
    message:
      command.kind === "speak"
        ? "Your line was heard and recorded once."
        : "Meeting action recorded.",
    meetingId: meeting.id,
  };
}

/** No plan is rewritten: the existing navigation accepts these temporary goals. */
export function meetingMovementGoals(town: Town, reserved: Reserved = {}): Reserved {
  const meeting = active(town);
  if (!meeting || !["gathering", "active"].includes(meeting.status)) return {};
  return Object.fromEntries(
    meeting.members
      .filter(
        (member) =>
          member.id !== "player" &&
          member.choice === "accepted" &&
          !isCommitted(town, member.id, reserved),
      )
      .map((member) => [member.id, SEATS[member.id]!]),
  );
}

export function advanceDiscussions(town: Town, reserved: Reserved = {}): void {
  const meeting = active(town);
  if (!meeting || meeting.status === "closed") return;
  for (const member of meeting.members) {
    if (
      member.invitation === "unseen" &&
      !member.noticedCue &&
      canHear(DISCUSSION_VENUE, actor(town, member.id)!.tile)
    ) {
      member.noticedCue = true;
      member.decisionNeeded = true;
      touch(meeting, member);
    }
    const present =
      member.choice === "accepted" &&
      inRoom(town, member.id) &&
      !isCommitted(town, member.id, reserved);
    if (present !== member.arrived) {
      member.arrived = present;
      if (!present) {
        member.mode = "off";
        member.decisionNeeded = false;
        meeting.queue = meeting.queue.filter((id) => id !== member.id);
        if (meeting.floor?.actor === member.id) meeting.floor = null;
      } else if (member.mode === "off") member.decisionNeeded = true;
      touch(meeting, member);
    }
  }
  if (meeting.status === "paused") return;
  if (meeting.status === "gathering" && hasQuorum(meeting)) {
    meeting.status = "active";
    meeting.reason = "The willing listeners have gathered.";
    touch(meeting);
  } else if (meeting.status === "active" && !hasQuorum(meeting)) {
    pauseDiscussion(
      town,
      "The facilitator and another attentive person must be present to continue.",
    );
    return;
  }
  if (meeting.status === "active" && !meeting.floor) {
    meeting.queue = meeting.queue.filter((id) => {
      const member = memberOf(meeting, id);
      return member?.arrived && member.mode === "participating" && member.choice === "accepted";
    });
    const next = meeting.queue[0];
    if (next) {
      meeting.floor = { actor: next, id: `${meeting.id}:turn:${++meeting.revision}` };
      memberOf(meeting, next)!.decisionNeeded = true;
    }
  }
}

export function pauseDiscussion(town: Town, reason = "The meeting is paused."): void {
  const meeting = active(town);
  if (!meeting || meeting.status === "closed") return;
  meeting.status = "paused";
  meeting.reason = reason.slice(0, 240);
  meeting.epoch++;
  meeting.pending = null;
  touch(meeting);
}
export function resumeDiscussion(town: Town): DiscussionActionResult {
  const meeting = active(town);
  if (!meeting || meeting.status !== "paused")
    return { ok: false, message: "There is no paused meeting to resume." };
  if (meeting.decisions >= DISCUSSION_LIMITS.decisions)
    return {
      ok: false,
      message: "The meeting reached its sixteen-decision limit. Close it to preserve the record.",
    };
  meeting.status = "gathering";
  meeting.epoch++;
  meeting.reason = "Resuming with current presence and commitments.";
  meeting.pending = null;
  touch(meeting);
  advanceDiscussions(town);
  return { ok: true, message: meeting.reason, meetingId: meeting.id };
}

export function nextDiscussionJob(town: Town): DiscussionJob | null {
  const meeting = active(town);
  if (
    !meeting ||
    !["gathering", "active"].includes(meeting.status) ||
    meeting.pending ||
    meeting.decisions >= DISCUSSION_LIMITS.decisions
  )
    return null;
  const candidates = meeting.members.filter(
    (member): member is DiscussionMember & { id: NpcId } =>
      member.id !== "player" && NPC_IDS.includes(member.id as NpcId),
  );
  const next =
    candidates.find((member) => member.invitation === "delivered" && member.choice === "pending") ??
    candidates.find((member) => member.arrived && member.mode === "off" && member.decisionNeeded) ??
    candidates.find(
      (member) =>
        member.invitation === "unseen" &&
        member.decisionNeeded &&
        canHear(DISCUSSION_VENUE, actor(town, member.id)!.tile),
    ) ??
    candidates.find((member) => meeting.floor?.actor === member.id);
  if (!next || !actions(town, meeting, next.id).length) return null;
  return {
    kind: "act",
    task: "discussion",
    day: town.day,
    minute: town.minute,
    agentId: next.id,
    meetingId: meeting.id,
    sessionRevision: meeting.epoch,
    actorRevision: next.revision,
    turnId: meeting.floor?.actor === next.id ? meeting.floor.id : null,
  };
}
export function isDiscussionJobFresh(town: Town, job: DiscussionJob): boolean {
  const meeting = active(town, job.meetingId);
  const member = meeting && memberOf(meeting, job.agentId);
  return Boolean(
    meeting &&
    member &&
    ["gathering", "active"].includes(meeting.status) &&
    meeting.epoch === job.sessionRevision &&
    member.revision === job.actorRevision &&
    (job.turnId === null ||
      (meeting.floor?.id === job.turnId &&
        meeting.floor.actor === job.agentId &&
        member.arrived &&
        inRoom(town, job.agentId) &&
        !isCommitted(town, job.agentId))),
  );
}
export function markDiscussionRequest(town: Town, job: DiscussionJob): boolean {
  const meeting = active(town, job.meetingId);
  if (
    !meeting ||
    meeting.pending ||
    !isDiscussionJobFresh(town, job) ||
    meeting.decisions >= DISCUSSION_LIMITS.decisions
  )
    return false;
  meeting.pending = { actor: job.agentId, key: requestKey(job) };
  meeting.decisions++;
  meeting.usage.requests++;
  meeting.usage.attemptsUnknown++;
  meeting.usage.tokensUnknown++;
  const marked = requests.get(town) ?? new Set<string>();
  marked.add(requestKey(job));
  requests.set(town, marked);
  return true;
}
export function recordDiscussionUsage(
  town: Town,
  job: DiscussionJob,
  sample: DiscussionUsageSample,
): void {
  const meeting = active(town, job.meetingId),
    marked = requests.get(town),
    key = requestKey(job);
  if (!meeting || !marked?.has(key)) return;
  marked.delete(key);
  meeting.usage.elapsedMs += Math.max(0, Math.round(sample.elapsedMs || 0));
  if (Number.isSafeInteger(sample.attempts) && Number(sample.attempts) >= 0) {
    meeting.usage.providerAttempts += sample.attempts!;
    meeting.usage.attemptsUnknown--;
  }
  if (Number.isSafeInteger(sample.totalTokens) && Number(sample.totalTokens) >= 0) {
    meeting.usage.knownTokens += sample.totalTokens!;
    meeting.usage.tokenSamples++;
    meeting.usage.tokensUnknown--;
  }
  if (!sample.success) meeting.usage.failures++;
}
export function applyDiscussionResult(
  town: Town,
  result: DiscussionResult,
): DiscussionActionResult {
  // Physical movement can happen while inference is pending. Update attendance
  // here as well as on clock ticks before calculating this utterance's audience.
  advanceDiscussions(town);
  const meeting = active(town, result.meetingId);
  const key = requestKey({ ...result, day: town.day, minute: town.minute });
  if (
    !meeting ||
    meeting.pending?.key !== key ||
    !isDiscussionJobFresh(town, { ...result, day: town.day, minute: town.minute })
  )
    return { ok: false, message: "That discussion decision is stale." };
  meeting.pending = null;
  const response = applyDiscussionCommand(town, result.agentId, {
    ...result.decision,
    meetingId: result.meetingId,
    expectedRevision: result.actorRevision,
    commandId: key,
  });
  if (!response.ok) pauseDiscussion(town, response.message);
  else if (meeting.decisions >= DISCUSSION_LIMITS.decisions && meeting.status !== "closed")
    pauseDiscussion(town, "The meeting reached its sixteen-decision limit.");
  return response;
}

export function discussionObservation(
  town: Town,
  id: AgentId,
  meetingId?: string,
): Record<string, unknown> {
  const meeting = active(town, meetingId),
    person = actor(town, id);
  if (!meeting || !person)
    return { unavailable: "No discussion is available.", availableActions: [] };
  const member = memberOf(meeting, id);
  const knows = member?.invitation === "delivered";
  return {
    actor: { id, name: person.name, tile: { ...person.tile } },
    meeting: {
      id: meeting.id,
      ...(knows
        ? {
            topic: meeting.topic,
            venue: meeting.venue,
            status: meeting.status,
            proposedRole: member?.role,
            ownMode: member?.mode,
            ownTurn: meeting.floor?.actor === id,
          }
        : {}),
    },
    perceivedCues:
      !knows && canHear(DISCUSSION_VENUE, person.tile)
        ? ["There is a meeting invitation available to read at the library reading area."]
        : [],
    receivedTurns: meeting.utterances
      .filter((turn) => turn.speaker === id || turn.recipientIds.includes(id))
      .map(({ recipientIds: _receipts, ...turn }) => structuredClone(turn)),
    availableActions: actions(town, meeting, id),
  };
}

export function discussionView(
  town: Town,
  id: AgentId = "player",
  meetingId?: string,
): DiscussionView {
  const meeting = active(town, meetingId),
    member = meeting && memberOf(meeting, id),
    person = actor(town, id);
  if (!meeting)
    return {
      meeting: null,
      actorRevision: 0,
      actions: [],
      canJoin: false,
      isListening: false,
      isPresent: false,
      ownTurn: false,
      roster: [],
      canInviteIds: [],
      invitations: [],
    };
  return structuredClone({
    meeting: {
      id: meeting.id,
      revision: meeting.revision,
      topic: meeting.topic,
      venue: meeting.venue,
      facilitator: meeting.facilitator,
      status: meeting.status,
      reason: meeting.reason,
      decisions: meeting.decisions,
      usage: meeting.usage,
      utterances: meeting.utterances.map(({ recipientIds: _receipts, ...turn }) => turn),
      queue: meeting.queue,
      floor: meeting.floor,
    },
    actorRevision: member?.revision ?? 0,
    actions: actions(town, meeting, id),
    canJoin: Boolean(member?.arrived && member.choice === "accepted"),
    isListening: Boolean(member?.arrived && member.mode !== "off"),
    isPresent: Boolean(member?.arrived),
    ownTurn: meeting.floor?.actor === id,
    roster: meeting.members
      .filter(
        (other) =>
          other.id === id ||
          (other.arrived && other.mode !== "off") ||
          meeting.utterances.some((turn) => turn.speaker === other.id),
      )
      .map((other) => ({
        id: other.id,
        name: actor(town, other.id)!.name,
        choice: other.choice,
        arrived: other.arrived,
        mode: other.mode,
        role: other.role,
      })),
    canInviteIds:
      id === "player" && person && meeting.status !== "closed"
        ? meeting.members
            .filter(
              (other) =>
                other.id !== id &&
                other.invitation === "unseen" &&
                canHear(person.tile, actor(town, other.id)!.tile, 2),
            )
            .map((other) => other.id)
        : [],
    invitations:
      id === "player"
        ? meeting.members
            .filter((other) => other.id !== "player")
            .map((other) => ({
              id: other.id,
              name: actor(town, other.id)!.name,
              delivered: other.invitation === "delivered",
              choice: other.choice,
            }))
        : [],
  });
}

export function recoverDiscussions(town: Town): void {
  for (const meeting of town.discussions?.sessions ?? [])
    if (meeting.pending) {
      meeting.pending = null;
      meeting.status = "paused";
      meeting.epoch++;
      meeting.reason =
        "A decision was in flight when this town was saved. Its outcome is unknown; resume explicitly.";
    }
}

/** Validate before any legacy normalization; malformed state must remain recoverable. */
export function validateDiscussions(town: Town): string[] {
  if (!Object.hasOwn(town, "discussions")) return [];
  const invalid = () => [
    "The saved discussion state is invalid. Preserve the original town for recovery.",
  ];
  try {
    const state = town.discussions!;
    if (
      !state ||
      !validTime(town) ||
      state.version !== 1 ||
      !Array.isArray(state.sessions) ||
      state.sessions.length > DISCUSSION_LIMITS.closed + 1 ||
      state.sessions.filter((meeting) => meeting.status !== "closed").length > 1
    )
      return invalid();
    const ids = new Set<string>(),
      speechIds = new Set<string>();
    for (const meeting of state.sessions) {
      if (
        !safeText(meeting.id, 100) ||
        ids.has(meeting.id) ||
        !Number.isSafeInteger(meeting.revision) ||
        meeting.revision < 1 ||
        !Number.isSafeInteger(meeting.epoch) ||
        meeting.epoch < 1 ||
        !safeText(meeting.topic, 160) ||
        meeting.venue !== "library" ||
        !["northern", "arwyn"].includes(meeting.facilitator) ||
        !["gathering", "active", "paused", "closed"].includes(meeting.status) ||
        typeof meeting.reason !== "string" ||
        meeting.reason.length > 240 ||
        !validTime(meeting.createdAt) ||
        absMinute(meeting.createdAt.day, meeting.createdAt.minute) >
          absMinute(town.day, town.minute) ||
        !Array.isArray(meeting.members) ||
        meeting.members.length !== 4 ||
        !Array.isArray(meeting.utterances) ||
        meeting.utterances.length > 6 ||
        !Number.isSafeInteger(meeting.decisions) ||
        meeting.decisions < 0 ||
        meeting.decisions > 16 ||
        !Array.isArray(meeting.queue) ||
        meeting.queue.length > 4 ||
        new Set(meeting.queue).size !== meeting.queue.length ||
        !Array.isArray(meeting.commands) ||
        meeting.commands.length > 96 ||
        new Set(meeting.commands).size !== meeting.commands.length ||
        meeting.commands.some((command) => !safeText(command, 180))
      )
        return invalid();
      ids.add(meeting.id);
      const members = new Set<AgentId>();
      for (const member of meeting.members) {
        if (
          ![...CAST, "player"].includes(member.id) ||
          members.has(member.id) ||
          !["unseen", "delivered"].includes(member.invitation) ||
          !["pending", "accepted", "declined", "left"].includes(member.choice) ||
          !["facilitator", "participant"].includes(member.role) ||
          (member.role === "facilitator") !== (member.id === meeting.facilitator) ||
          !Number.isSafeInteger(member.revision) ||
          member.revision < 1 ||
          !["off", "listening", "participating"].includes(member.mode) ||
          typeof member.arrived !== "boolean" ||
          typeof member.decisionNeeded !== "boolean" ||
          typeof member.noticedCue !== "boolean" ||
          (member.mode !== "off" && (member.choice !== "accepted" || !member.arrived)) ||
          (member.choice !== "pending" && member.invitation !== "delivered")
        )
          return invalid();
        members.add(member.id);
      }
      if (
        meeting.queue.some((id) => !members.has(id)) ||
        (meeting.floor &&
          (!safeText(meeting.floor.id, 180) || !members.has(meeting.floor.actor))) ||
        (meeting.status === "closed" &&
          (meeting.pending ||
            meeting.floor ||
            meeting.queue.length ||
            meeting.members.some((member) => member.mode !== "off")))
      )
        return invalid();
      if (
        meeting.pending &&
        (!NPC_IDS.includes(meeting.pending.actor) || !safeText(meeting.pending.key, 240))
      )
        return invalid();
      if (
        !meeting.usage ||
        Object.keys(usage()).some((key) => {
          const value = meeting.usage[key as keyof typeof meeting.usage];
          return !Number.isSafeInteger(value) || value < 0;
        }) ||
        meeting.usage.requests !== meeting.decisions ||
        meeting.usage.attemptsUnknown > meeting.decisions ||
        meeting.usage.tokenSamples + meeting.usage.tokensUnknown !== meeting.decisions ||
        meeting.usage.failures > meeting.decisions
      )
        return invalid();
      for (const [index, turn] of meeting.utterances.entries()) {
        if (
          !safeText(turn.id, 140) ||
          speechIds.has(turn.id) ||
          turn.id !== `${meeting.id}:speech:${index + 1}` ||
          turn.seq !== index + 1 ||
          !members.has(turn.speaker) ||
          !safeText(turn.text, 400) ||
          !validTime(turn.at) ||
          absMinute(turn.at.day, turn.at.minute) <
            absMinute(meeting.createdAt.day, meeting.createdAt.minute) ||
          absMinute(turn.at.day, turn.at.minute) > absMinute(town.day, town.minute) ||
          !validTile(turn.speakerTile) ||
          zoneAt(turn.speakerTile.x, turn.speakerTile.y) !== "library" ||
          !Array.isArray(turn.recipientIds) ||
          !turn.recipientIds.length ||
          turn.recipientIds.length > 3 ||
          new Set(turn.recipientIds).size !== turn.recipientIds.length ||
          turn.recipientIds.some((id) => !members.has(id) || id === turn.speaker) ||
          turn.source !== "statement" ||
          turn.mind !== (turn.speaker === "player" ? "player" : "grok")
        )
          return invalid();
        speechIds.add(turn.id);
        if (
          index &&
          absMinute(turn.at.day, turn.at.minute) <
            absMinute(
              meeting.utterances[index - 1]!.at.day,
              meeting.utterances[index - 1]!.at.minute,
            )
        )
          return invalid();
      }
    }
    return [];
  } catch {
    return invalid();
  }
}
function validTime(value: { day: number; minute: number }): boolean {
  return Boolean(
    value &&
    Number.isSafeInteger(value.day) &&
    value.day >= 1 &&
    Number.isSafeInteger(value.minute) &&
    value.minute >= 0 &&
    value.minute < 1440,
  );
}
function validTile(value: { x: number; y: number }): boolean {
  return Boolean(
    value && Number.isInteger(value.x) && Number.isInteger(value.y) && walkable(value.x, value.y),
  );
}
