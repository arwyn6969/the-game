import type { Agent, AgentId, NpcId, PlaceId, ThinkJob, Town } from "./types";
import { AGENT_IDS, NPC_IDS, PLACE_IDS } from "./types";
import type {
  PhysicalActionResult,
  PhysicalDecision,
  PhysicalItem,
  PhysicalSession,
  PhysicalUsageSample,
} from "./physical-types";
import { absMinute, makeMemory, pushMemory } from "./memory";
import { ANCHORS, cell, placeTitleOf, zoneAt } from "./world";
import { findPath } from "./path";
import { wageInterval } from "./funded-work";

type Tile = { x: number; y: number };
type ActJob = Extract<ThinkJob, { kind: "act" }>;
export const MANUSCRIPT_ID = "manuscript:town:1";
const MAX_TITLE = 80;
const MAX_TEXT = 1200;
const MAX_SPEECH = 400;
const INTENT_MINUTES = 180;
const markedRequests = new WeakMap<Town, Set<string>>();
const now = (town: Town) => absMinute(town.day, town.minute);
const resident = (town: Town, id: AgentId) => town.agents.find((agent) => agent.id === id);
const distance = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const actorId = (value: unknown): value is AgentId => AGENT_IDS.includes(value as AgentId);
const npcId = (value: unknown): value is NpcId => NPC_IDS.includes(value as NpcId);
const integer = (value: unknown, min = 0): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const text = (value: unknown, max: number, blank = false): value is string =>
  typeof value === "string" &&
  value.length <= max &&
  (blank || value.trim().length > 0) &&
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
function floorTile(value: unknown): value is Tile {
  if (!object(value) || !keys(value, ["x", "y"]) || !integer(value.x) || !integer(value.y))
    return false;
  const ground = cell(value.x, value.y);
  return Boolean(ground && !ground.block && !["wall", "water", "door"].includes(ground.ground));
}
function resultValid(value: unknown, item: PhysicalItem): boolean {
  if (
    !object(value) ||
    !keys(value, ["ok", "message", "kind"], ["itemId", "content"]) ||
    typeof value.ok !== "boolean" ||
    !text(value.message, 600) ||
    !["bring", "pick-up", "put-down", "read", "write", "speak", "wait"].includes(
      String(value.kind),
    ) ||
    (value.itemId !== undefined && value.itemId !== item.id)
  )
    return false;
  const content = value.content;
  return (
    content === undefined ||
    Boolean(
      value.ok &&
      value.kind === "read" &&
      value.itemId === item.id &&
      object(content) &&
      keys(content, ["title", "text", "revision", "author"]) &&
      text(content.title, MAX_TITLE) &&
      text(content.text, MAX_TEXT, true) &&
      integer(content.revision) &&
      content.revision <= item.contentRevision &&
      (content.author === null || actorId(content.author)),
    )
  );
}

/** Pure and fail-closed: damaged custody is never repaired into a fresh book. */
export function validatePhysicalItems(town: Town): string[] {
  if (!Object.hasOwn(town, "physicalItems")) return [];
  const state: unknown = town.physicalItems;
  const invalid = (detail: string) => [
    `The saved physical manuscript ${detail}; keep the original file for recovery.`,
  ];
  if (!Array.isArray(town.agents)) return invalid("has no valid resident roster");
  if (
    !object(state) ||
    !keys(state, ["version", "items", "session"], ["reading"]) ||
    state.version !== 1 ||
    !Array.isArray(state.items) ||
    state.items.length !== 1
  )
    return invalid("has an unsupported structure");
  const item = state.items[0];
  if (
    !object(item) ||
    !keys(item, [
      "id",
      "kind",
      "title",
      "text",
      "author",
      "owner",
      "revision",
      "contentRevision",
      "location",
    ]) ||
    item.id !== MANUSCRIPT_ID ||
    item.kind !== "manuscript" ||
    item.owner !== "town" ||
    !text(item.title, MAX_TITLE) ||
    !text(item.text, MAX_TEXT, true) ||
    !integer(item.revision) ||
    !integer(item.contentRevision) ||
    item.contentRevision > item.revision ||
    !(item.author === null || actorId(item.author)) ||
    (item.contentRevision === 0
      ? item.author !== null || item.text !== ""
      : item.author === null || !item.text.trim()) ||
    !object(item.location)
  )
    return invalid("has invalid content, identity or revision");
  const location = item.location;
  if (!(
    (location.kind === "ground" && keys(location, ["kind", "tile"]) && floorTile(location.tile)) ||
    (location.kind === "held" &&
      keys(location, ["kind", "holder"]) &&
      actorId(location.holder) &&
      town.agents?.some((agent) => agent.id === location.holder))
  ))
    return invalid("has invalid or ambiguous custody");
  const session = state.session;
  if (session !== null) {
    if (
      !object(session) ||
      !keys(session, [
        "actor",
        "revision",
        "enabled",
        "waiting",
        "decisions",
        "maxDecisions",
        "intent",
        "lastResult",
        "usage",
      ]) ||
      !npcId(session.actor) ||
      !town.agents?.some((agent) => agent.id === session.actor) ||
      !integer(session.revision, 1) ||
      typeof session.enabled !== "boolean" ||
      typeof session.waiting !== "boolean" ||
      !integer(session.maxDecisions, 1) ||
      session.maxDecisions > 20 ||
      !integer(session.decisions) ||
      session.decisions > session.maxDecisions ||
      (session.lastResult !== null && !resultValid(session.lastResult, item as PhysicalItem)) ||
      !object(session.usage)
    )
      return invalid("has an invalid controller");
    const usage = session.usage;
    const counters = [
      "requests",
      "providerAttempts",
      "attemptsUnknown",
      "knownTokens",
      "tokenSamples",
      "tokensUnknown",
      "elapsedMs",
      "failures",
    ];
    if (
      !keys(usage, counters) ||
      counters.some((key) => !integer(usage[key])) ||
      usage.requests !== session.decisions ||
      Number(usage.attemptsUnknown) > Number(usage.requests) ||
      Number(usage.tokenSamples) + Number(usage.tokensUnknown) !== usage.requests ||
      Number(usage.failures) > Number(usage.requests)
    )
      return invalid("has invalid inference accounting");
    const intent = session.intent;
    if (
      intent !== null &&
      (!session.enabled ||
        !object(intent) ||
        !keys(
          intent,
          ["kind", "itemId", "itemRevision", "phase", "startedAt", "deadlineAt"],
          ["destination"],
        ) ||
        !["bring", "pick-up"].includes(String(intent.kind)) ||
        intent.itemId !== item.id ||
        !integer(intent.itemRevision) ||
        Number(intent.itemRevision) > Number(item.revision) ||
        !["approach", "carry"].includes(String(intent.phase)) ||
        !integer(intent.startedAt) ||
        !integer(intent.deadlineAt) ||
        Number(intent.startedAt) > now(town) ||
        Number(intent.deadlineAt) <= Number(intent.startedAt) ||
        Number(intent.deadlineAt) - Number(intent.startedAt) > INTENT_MINUTES ||
        (intent.kind === "bring"
          ? !PLACE_IDS.includes(intent.destination as PlaceId)
          : intent.destination !== undefined || intent.phase !== "approach"))
    )
      return invalid("has an invalid movement intention");
  }
  const reading = state.reading;
  if (
    reading !== undefined &&
    (!object(reading) ||
      !keys(reading, ["actor", "itemId", "contentRevision", "until"]) ||
      !actorId(reading.actor) ||
      reading.itemId !== item.id ||
      !integer(reading.contentRevision) ||
      Number(reading.contentRevision) > Number(item.contentRevision) ||
      !integer(reading.until) ||
      Number(reading.until) > now(town) + 10)
  )
    return invalid("has an invalid reading pose");
  return [];
}

export function initializePhysicalItems(town: Town): { ok: boolean; message: string } {
  if (Object.hasOwn(town, "physicalItems")) {
    const errors = validatePhysicalItems(town);
    return { ok: !errors.length, message: errors[0] ?? "The existing manuscript is preserved." };
  }
  const tile = { ...ANCHORS.library };
  if (!floorTile(tile))
    return { ok: false, message: "The library has no supported manuscript floor tile." };
  town.physicalItems = {
    version: 1,
    items: [
      {
        id: MANUSCRIPT_ID,
        kind: "manuscript",
        title: "Blank manuscript",
        text: "",
        author: null,
        owner: "town",
        revision: 0,
        contentRevision: 0,
        location: { kind: "ground", tile },
      },
    ],
    session: null,
  };
  return {
    ok: true,
    message: "A blank communal manuscript is on the library floor. No text has been written yet.",
  };
}

export function physicalItem(town: Town, id: string): PhysicalItem | null {
  return town.physicalItems?.items.find((item) => item.id === id) ?? null;
}
export function heldItem(town: Town, actor: AgentId): PhysicalItem | null {
  return (
    town.physicalItems?.items.find(
      (item) => item.location.kind === "held" && item.location.holder === actor,
    ) ?? null
  );
}
function itemTile(town: Town, item: PhysicalItem): Tile | null {
  return item.location.kind === "ground"
    ? item.location.tile
    : (resident(town, item.location.holder)?.tile ?? null);
}
function close(a: Tile, b: Tile, reach = 1) {
  return distance(a, b) <= reach && zoneAt(a.x, a.y) === zoneAt(b.x, b.y);
}
export function nearbyPhysicalItems(town: Town, actor: AgentId): PhysicalItem[] {
  const person = resident(town, actor);
  if (!person) return [];
  return (
    town.physicalItems?.items.filter((item) => {
      const tile = itemTile(town, item);
      return tile && close(person.tile, tile, 3);
    }) ?? []
  );
}

function record(town: Town, actor: AgentId, message: string, privateRead = false, speech = false) {
  const person = resident(town, actor)!;
  const recipients = town.agents.filter(
    (other) => other.id === actor || (!privateRead && close(person.tile, other.tile, 3)),
  );
  for (const recipient of recipients)
    pushMemory(
      recipient,
      makeMemory(town, town.day, town.minute, speech ? "chat" : "observe", message, 6, {
        source: speech ? "statement" : "event",
        ...(speech ? { with: actor } : {}),
      }),
    );
}
function adopt(town: Town, draft: Town) {
  // Keep the live root (save origin) and resident objects (simulation callers).
  town.physicalItems = draft.physicalItems;
  town.nextId = draft.nextId;
  for (const next of draft.agents) {
    const current = resident(town, next.id);
    if (current) {
      current.memories = next.memories;
      current.newMemories = next.newMemories;
      current.bubble = next.bubble;
      current.path = next.path;
      current.status = next.status;
    }
  }
}
function finishDecision(town: Town, actor: AgentId, result: PhysicalActionResult) {
  const session = town.physicalItems?.session;
  if (session?.enabled && session.actor === actor) {
    session.revision++;
    session.lastResult = structuredClone(result);
    session.waiting = result.ok && (result.kind === "wait" || result.kind === "speak");
    if (!session.intent && session.decisions >= session.maxDecisions) {
      session.enabled = false;
      session.waiting = false;
    }
  }
}
function decisionShape(decision: unknown): decision is PhysicalDecision {
  if (!object(decision)) return false;
  if (decision.kind === "wait") return keys(decision, ["kind"]);
  if (decision.kind === "speak")
    return keys(decision, ["kind", "text"]) && text(decision.text, MAX_SPEECH);
  const base = ["kind", "itemId", "itemRevision"];
  if (!text(decision.itemId, 96) || !integer(decision.itemRevision)) return false;
  if (decision.kind === "bring")
    return (
      keys(decision, [...base, "destination"]) &&
      PLACE_IDS.includes(decision.destination as PlaceId)
    );
  if (decision.kind === "write")
    return (
      keys(decision, [...base, "title", "text"]) &&
      text(decision.title, MAX_TITLE) &&
      text(decision.text, MAX_TEXT)
    );
  return ["pick-up", "put-down", "read"].includes(String(decision.kind)) && keys(decision, base);
}
function pickUp(town: Town, actor: AgentId, item: PhysicalItem) {
  const person = resident(town, actor)!;
  if (item.location.kind !== "ground" || !close(person.tile, item.location.tile))
    throw new Error("Walk beside the manuscript on the ground before picking it up.");
  if (heldItem(town, actor)) throw new Error("Put down the item you are holding first.");
  item.location = { kind: "held", holder: actor };
  item.revision++;
  delete town.physicalItems!.reading;
  record(town, actor, `${person.name} picked up the communal manuscript, “${item.title}”.`);
}

/** Typed proposals never move money, grant authority or fabricate speech. */
export function applyPhysicalCommand(
  town: Town,
  actor: AgentId,
  decision: PhysicalDecision,
): PhysicalActionResult {
  const supportedKinds = ["bring", "pick-up", "put-down", "read", "write", "speak", "wait"];
  const kind: PhysicalDecision["kind"] = supportedKinds.includes(decision?.kind)
    ? decision.kind
    : "wait";
  const fail = (message: string): PhysicalActionResult => {
    const result = { ok: false, kind, message };
    finishDecision(town, actor, result);
    return result;
  };
  const errors = validatePhysicalItems(town);
  if (errors.length) return { ok: false, kind, message: errors[0]! };
  if (!town.physicalItems || !resident(town, actor))
    return fail("Enable the manuscript prototype before using an item.");
  if (!decisionShape(decision))
    return fail("Choose one supported action with exact current item terms and bounded text.");
  if (town.physicalItems.session?.intent && town.physicalItems.session.actor === actor)
    return fail("Finish or stop the current item movement before choosing another action.");
  const draft = structuredClone(town);
  const person = resident(draft, actor)!;
  const state = draft.physicalItems!;
  let result: PhysicalActionResult;
  try {
    if (decision.kind === "wait") {
      result = {
        ok: true,
        kind,
        message: `${person.name} is waiting. Resume a new trial to request another AI decision.`,
      };
      record(draft, actor, `${person.name} paused to wait.`, true);
    } else if (decision.kind === "speak") {
      const spoken = decision.text.trim();
      person.bubble = { text: spoken, until: now(draft) + 8 };
      record(draft, actor, `${person.name} said: “${spoken}”`, false, true);
      result = { ok: true, kind, message: `${person.name} spoke to the people within earshot.` };
    } else {
      const item = physicalItem(draft, decision.itemId);
      if (!item || item.revision !== decision.itemRevision)
        throw new Error(
          "The manuscript or its revision changed. Inspect its current location and try again.",
        );
      const holding = item.location.kind === "held" && item.location.holder === actor;
      if (
        decision.kind === "bring" ||
        (decision.kind === "pick-up" &&
          item.location.kind === "ground" &&
          !close(person.tile, item.location.tile))
      ) {
        const session = state.session;
        if (!session?.enabled || session.actor !== actor)
          throw new Error(
            "A distant item needs an active resident trial; the player can walk beside it and pick it up.",
          );
        if (item.location.kind === "held" && !holding)
          throw new Error(
            "Another resident holds this manuscript. It cannot be taken through an item command.",
          );
        session.intent = {
          kind: decision.kind,
          itemId: item.id,
          itemRevision: item.revision,
          ...(decision.kind === "bring" ? { destination: decision.destination } : {}),
          phase: holding ? "carry" : "approach",
          startedAt: now(draft),
          deadlineAt: now(draft) + INTENT_MINUTES,
        };
        person.path = [];
        result = {
          ok: true,
          kind,
          itemId: item.id,
          message: `${person.name} will ${decision.kind === "bring" ? `bring the manuscript to ${placeTitleOf(decision.destination)}` : "approach and pick up the manuscript"} using normal paths, after earlier commitments.`,
        };
      } else if (decision.kind === "pick-up") {
        pickUp(draft, actor, item);
        result = {
          ok: true,
          kind,
          itemId: item.id,
          message: `${person.name} picked up the manuscript.`,
        };
      } else {
        if (!holding)
          throw new Error("Hold the manuscript before putting it down, reading or writing it.");
        if (decision.kind === "put-down") {
          if (!floorTile(person.tile))
            throw new Error("Move to a clear floor tile before putting the manuscript down.");
          item.location = { kind: "ground", tile: { ...person.tile } };
          item.revision++;
          delete state.reading;
          record(
            draft,
            actor,
            `${person.name} put the manuscript down at ${placeTitleOf(physicalPlace(person.tile))}.`,
          );
          result = {
            ok: true,
            kind,
            itemId: item.id,
            message: "The manuscript is on the ground at your current tile.",
          };
        } else if (decision.kind === "read") {
          state.reading = {
            actor,
            itemId: item.id,
            contentRevision: item.contentRevision,
            until: now(draft) + 5,
          };
          record(
            draft,
            actor,
            `I read “${item.title}”, content revision ${item.contentRevision}: ${item.text || "The pages are blank."}`,
            true,
          );
          result = {
            ok: true,
            kind,
            itemId: item.id,
            message: item.text
              ? `${person.name} read the manuscript.`
              : "The manuscript is blank. Nobody has written its text yet.",
            content: {
              title: item.title,
              text: item.text,
              revision: item.contentRevision,
              author: item.author,
            },
          };
        } else {
          item.title = decision.title.trim();
          item.text = decision.text.trim();
          item.author = actor;
          item.contentRevision++;
          item.revision++;
          delete state.reading;
          record(
            draft,
            actor,
            `${person.name} wrote “${item.title}” in the communal manuscript.`,
            false,
          );
          record(draft, actor, `I wrote the manuscript text: ${item.text}`, true);
          result = {
            ok: true,
            kind,
            itemId: item.id,
            message: `${person.name} wrote the actual manuscript text; content revision ${item.contentRevision}.`,
          };
        }
      }
    }
    finishDecision(draft, actor, result);
    const problems = validatePhysicalItems(draft);
    if (problems.length) throw new Error(problems[0]);
    adopt(town, draft);
    return result;
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "The item action failed; custody is unchanged.",
    );
  }
}

function physicalPlace(tile: Tile): PlaceId {
  const zone = zoneAt(tile.x, tile.y);
  return PLACE_IDS.includes(zone as PlaceId)
    ? (zone as PlaceId)
    : zone.startsWith("house-") || zone === "row"
      ? "townhouses"
      : "street";
}
function committed(
  town: Town,
  session: PhysicalSession,
  reserved?: Partial<Record<AgentId, Tile>>,
) {
  return Boolean(
    reserved?.[session.actor] ||
    town.economy?.work?.agreements.some(
      (agreement) =>
        agreement.worker === session.actor &&
        agreement.kind === "cafe-shift" &&
        agreement.status === "active" &&
        wageInterval(town, agreement),
    ),
  );
}
function approachTile(town: Town, actor: Agent, tile: Tile): Tile | null {
  const occupied = new Set(
    town.agents
      .filter((other) => other.id !== actor.id)
      .map((other) => `${other.tile.x},${other.tile.y}`),
  );
  const options = [
    tile,
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ];
  const paths = options
    .filter(
      (point) => floorTile(point) && close(point, tile) && !occupied.has(`${point.x},${point.y}`),
    )
    .map((point) => ({ point, path: findPath(actor.tile, point, occupied) }))
    .filter(({ point, path }) => distance(actor.tile, point) === 0 || path.length > 0)
    .sort((a, b) => a.path.length - b.path.length);
  return paths[0]?.point ?? null;
}
export function physicalMovementGoals(
  town: Town,
  reserved?: Partial<Record<AgentId, Tile>>,
): Partial<Record<AgentId, Tile>> {
  const session = town.physicalItems?.session;
  if (!session?.enabled || committed(town, session, reserved)) return {};
  const actor = resident(town, session.actor);
  if (!actor) return {};
  const intent = session.intent;
  if (!intent) return session.waiting ? { [actor.id]: { ...actor.tile } } : {};
  const item = physicalItem(town, intent.itemId);
  if (!item || item.revision !== intent.itemRevision || now(town) >= intent.deadlineAt) return {};
  const target =
    intent.phase === "approach" && item.location.kind === "ground"
      ? item.location.tile
      : intent.phase === "carry" &&
          item.location.kind === "held" &&
          item.location.holder === actor.id &&
          intent.destination
        ? ANCHORS[intent.destination]
        : null;
  const goal = target ? approachTile(town, actor, target) : null;
  return goal ? { [actor.id]: goal } : { [actor.id]: { ...actor.tile } };
}
function completeIntent(town: Town, session: PhysicalSession, ok: boolean, message: string) {
  const intent = session.intent!;
  session.lastResult = { ok, kind: intent.kind, itemId: intent.itemId, message };
  session.intent = null;
  const actor = resident(town, session.actor);
  if (actor) actor.path = [];
  if (session.decisions >= session.maxDecisions) session.enabled = false;
}
/** Only resolves actual arrival, after the single ordinary movement pass. */
export function advancePhysicalIntents(
  town: Town,
  reserved?: Partial<Record<AgentId, Tile>>,
): void {
  const state = town.physicalItems;
  if (!state) return;
  if (state.reading && state.reading.until < now(town)) delete state.reading;
  const session = state.session;
  if (!session?.enabled || !session.intent) return;
  const intent = session.intent;
  const item = physicalItem(town, intent.itemId);
  const actor = resident(town, session.actor);
  if (!item || !actor || item.revision !== intent.itemRevision) {
    completeIntent(
      town,
      session,
      false,
      "The manuscript changed during travel. No replacement item was created.",
    );
    return;
  }
  if (now(town) >= intent.deadlineAt) {
    completeIntent(
      town,
      session,
      false,
      "The bounded movement time ended. The manuscript remains at its actual location.",
    );
    return;
  }
  if (committed(town, session, reserved)) return;
  if (intent.phase === "approach") {
    if (item.location.kind !== "ground") {
      completeIntent(
        town,
        session,
        false,
        "Someone else holds the manuscript; the approach stopped.",
      );
      return;
    }
    if (!close(actor.tile, item.location.tile)) return;
    pickUp(town, actor.id, item);
    intent.itemRevision = item.revision;
    if (intent.kind === "pick-up") {
      completeIntent(town, session, true, `${actor.name} reached and picked up the manuscript.`);
      return;
    }
    intent.phase = "carry";
    actor.path = [];
  }
  if (item.location.kind !== "held" || item.location.holder !== actor.id) {
    completeIntent(town, session, false, "The manuscript is no longer held by this resident.");
    return;
  }
  const destination = intent.destination!;
  if (close(actor.tile, ANCHORS[destination])) {
    record(town, actor.id, `${actor.name} brought the manuscript to ${placeTitleOf(destination)}.`);
    completeIntent(
      town,
      session,
      true,
      `${actor.name} arrived at ${placeTitleOf(destination)} holding the manuscript. It has not been put down or read automatically.`,
    );
  } else actor.status = `carrying the manuscript toward ${placeTitleOf(destination)}`;
}

export function startPhysicalSession(
  town: Town,
  actor: NpcId,
  maxDecisions = 8,
): { ok: boolean; message: string } {
  const errors = validatePhysicalItems(town);
  if (errors.length) return { ok: false, message: errors[0]! };
  if (!town.physicalItems || !npcId(actor) || !resident(town, actor))
    return { ok: false, message: "Enable the manuscript and choose an existing resident." };
  if (!integer(maxDecisions, 1) || maxDecisions > 20)
    return { ok: false, message: "Choose between 1 and 20 AI decisions for this trial." };
  const previous = town.physicalItems.session;
  if (previous?.enabled && (!previous.waiting || previous.intent))
    return { ok: false, message: "Stop the active physical trial before starting another." };
  if (previous) resident(town, previous.actor)!.path = [];
  markedRequests.delete(town);
  town.physicalItems.session = {
    actor,
    revision: (previous?.revision ?? 0) + 1,
    enabled: true,
    waiting: false,
    decisions: 0,
    maxDecisions,
    intent: null,
    lastResult: null,
    usage: {
      requests: 0,
      providerAttempts: 0,
      attemptsUnknown: 0,
      knownTokens: 0,
      tokenSamples: 0,
      tokensUnknown: 0,
      elapsedMs: 0,
      failures: 0,
    },
  };
  return {
    ok: true,
    message: `Started a new bounded ${resident(town, actor)!.name} trial with ${maxDecisions} AI decisions. Item content and custody are preserved; trial accounting starts anew.`,
  };
}
export function pausePhysicalSession(town: Town, message: string): void {
  const session = town.physicalItems?.session;
  if (!session) return;
  session.revision++;
  session.enabled = false;
  session.waiting = false;
  session.intent = null;
  session.lastResult = {
    ok: false,
    kind: "wait",
    message: message.slice(0, 600) || "The physical trial is paused.",
  };
  const actor = resident(town, session.actor);
  if (actor) actor.path = [];
}
export function stopPhysicalSession(town: Town): void {
  pausePhysicalSession(
    town,
    "The physical trial stopped. The manuscript remains at its actual location, with its written content intact.",
  );
}
export function nextPhysicalJob(town: Town): ActJob | null {
  const session = town.physicalItems?.session;
  if (
    !session?.enabled ||
    session.waiting ||
    session.intent ||
    session.decisions >= session.maxDecisions
  )
    return null;
  return {
    kind: "act",
    day: town.day,
    minute: town.minute,
    agentId: session.actor,
    sessionRevision: session.revision,
  };
}
const requestKey = (job: ActJob) =>
  `${job.agentId}:${job.sessionRevision}:${job.day}:${job.minute}`;
export function markPhysicalRequest(town: Town, job: ActJob): boolean {
  const expected = nextPhysicalJob(town);
  if (!expected || requestKey(expected) !== requestKey(job)) return false;
  const session = town.physicalItems!.session!;
  session.decisions++;
  session.usage.requests++;
  session.usage.attemptsUnknown++;
  session.usage.tokensUnknown++;
  session.waiting = true;
  const requests = markedRequests.get(town) ?? new Set<string>();
  requests.add(requestKey(job));
  markedRequests.set(town, requests);
  return true;
}
export function recordPhysicalUsage(town: Town, job: ActJob, sample: PhysicalUsageSample): void {
  const session = town.physicalItems?.session;
  const requests = markedRequests.get(town);
  if (
    !session?.enabled ||
    session.actor !== job.agentId ||
    session.revision !== job.sessionRevision ||
    !requests?.has(requestKey(job))
  )
    return;
  requests.delete(requestKey(job));
  const usage = session.usage;
  if (Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0)
    usage.elapsedMs += Math.round(sample.elapsedMs);
  if (integer(sample.attempts)) {
    usage.providerAttempts += sample.attempts;
    usage.attemptsUnknown--;
  }
  if (integer(sample.totalTokens)) {
    usage.knownTokens += sample.totalTokens;
    usage.tokenSamples++;
    usage.tokensUnknown--;
  }
  if (!sample.success) usage.failures++;
}

/** The model sees visible metadata; only an actual read returns manuscript text. */
export function physicalObservation(town: Town, actor: AgentId): Record<string, unknown> {
  const person = resident(town, actor);
  if (!person) return { unavailable: "That resident is not in this town." };
  const session = town.physicalItems?.session;
  return {
    actor: {
      id: actor,
      name: person.name,
      role: person.role,
      tile: { ...person.tile },
      place: physicalPlace(person.tile),
      heldItemId: heldItem(town, actor)?.id ?? null,
    },
    items: nearbyPhysicalItems(town, actor).map(({ text: _body, ...item }) =>
      structuredClone(item),
    ),
    nearbyResidents: town.agents
      .filter((other) => other.id !== actor && close(person.tile, other.tile, 3))
      .map((other) => ({
        id: other.id,
        name: other.name,
        tile: { ...other.tile },
        place: physicalPlace(other.tile),
      })),
    session:
      session?.actor === actor
        ? {
            revision: session.revision,
            decisions: session.decisions,
            maxDecisions: session.maxDecisions,
            intent: structuredClone(session.intent),
            lastResult: structuredClone(session.lastResult),
          }
        : null,
    destinations: PLACE_IDS.map((place) => ({ id: place, name: placeTitleOf(place) })),
  };
}
