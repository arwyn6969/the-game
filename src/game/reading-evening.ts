import type { AgentId, PlaceId, Plan, Town } from "./types";
import { PLACE_IDS } from "./types";
import type { GameTime } from "./economy-types";
import { agentById } from "./memory";
import { wageInterval } from "./funded-work";
import { zoneAt } from "./world";
import {
  buyReadingRefreshments,
  readingRefreshmentReceipt,
  validateReadingPurchases,
} from "./commerce";
import { availableFunds } from "./economy";

export type ReadingEvening = {
  version: 1;
  eventId: string;
  choice: "park" | "library" | null;
  status: "invited" | "waiting" | "routing" | "ready" | "done";
  noteDueAt: GameTime | null;
  bookedAt: GameTime | null;
  readyAt: GameTime | null;
  completedAt: GameTime | null;
  originalPlans: Partial<Record<AgentId, Plan>>;
  attendedByPlayer: boolean;
  participation: "listen" | "read" | null;
  outcome: string | null;
  scene: string[];
};
type Library = {
  started: number;
  delivery: boolean;
  phase: string;
  actionRevision: number;
  lookup: { status: string; agreementId: string; result: string | null } | null;
  revisions: { mappings: Record<string, string | null>; verified: string[] }[];
  evening?: ReadingEvening;
  events: { id: string; day: number; minute: number; text: string; participants: AgentId[] }[];
};
type StoryEvent = (id: string, text: string, participants: AgentId[]) => void;
const ROUTE = "going to Northern's first reading";
const READY_WINDOW = 60;
const VENUES = {
  park: {
    label: "A first page in the park",
    place: "park" as PlaceId,
    tile: { x: 22, y: 35 },
    seats: { northern: { x: 21, y: 35 }, sub: { x: 23, y: 35 } },
  },
  library: {
    label: "The library's first reading",
    place: "library" as PlaceId,
    tile: { x: 43, y: 21 },
    seats: { northern: { x: 42, y: 21 }, arwyn: { x: 44, y: 21 }, sub: { x: 43, y: 20 } },
  },
};
const time = (town: Town): GameTime => ({ day: town.day, minute: town.minute });
const stamp = (at: GameTime) => (at.day - 1) * 1440 + at.minute;
export function readingTimeAfter(at: GameTime, minutes: number): GameTime {
  const total = stamp(at) + minutes;
  return { day: Math.floor(total / 1440) + 1, minute: total % 1440 };
}
export function createReadingEvening(started: number): ReadingEvening {
  return {
    version: 1,
    eventId: `library-evening:${started}:1`,
    choice: null,
    status: "invited",
    noteDueAt: null,
    bookedAt: null,
    readyAt: null,
    completedAt: null,
    originalPlans: {},
    attendedByPlayer: false,
    participation: null,
    outcome: null,
    scene: [],
  };
}
export function ensureReadingNote(town: Town, state: Library) {
  const evening = state.evening;
  if (!evening || evening.noteDueAt || state.lookup?.status !== "done") return;
  const receipt = town.economy?.work?.receipts.find(
    (item) => item.agreementId === state.lookup?.agreementId,
  );
  evening.noteDueAt = readingTimeAfter(receipt?.at ?? time(town), 30);
}
export function readingNoteDue(town: Town, state: Library): boolean {
  return Boolean(state.evening?.noteDueAt && stamp(time(town)) >= stamp(state.evening.noteDueAt));
}
function venue(state: Library) {
  return state.evening?.choice ? VENUES[state.evening.choice] : null;
}
function guests(state: Library): AgentId[] {
  return Object.keys(venue(state)?.seats ?? {}) as AgentId[];
}
function seat(state: Library, id: AgentId) {
  return (venue(state)?.seats as Partial<Record<AgentId, { x: number; y: number }>> | undefined)?.[
    id
  ];
}
function originalPlan(agentId: AgentId, town: Town, state: Library): Plan {
  const current = agentById(town, agentId).plan;
  return {
    ...current,
    beats: current.beats.map((beat) =>
      beat.status === ROUTE
        ? (state.evening?.originalPlans[agentId]?.beats.find((old) => old.hour === beat.hour) ??
          beat)
        : beat,
    ),
  };
}
function restore(town: Town, state: Library, id: AgentId) {
  const agent = agentById(town, id);
  const restored = originalPlan(id, town, state);
  if (restored.beats.some((beat, index) => beat !== agent.plan.beats[index])) {
    agent.plan = structuredClone(restored);
    agent.path = [];
  }
}
function atWork(town: Town, state: Library, id: AgentId): boolean {
  const scheduled = {
    ...town,
    agents: town.agents.map((agent) =>
      agent.id === id ? { ...agent, plan: originalPlan(id, town, state) } : agent,
    ),
  };
  return Boolean(
    town.economy?.work?.agreements.some(
      (agreement) =>
        agreement.worker === id &&
        agreement.kind === "cafe-shift" &&
        agreement.status === "active" &&
        wageInterval(scheduled, agreement),
    ),
  );
}
function arrived(town: Town, state: Library, id: AgentId) {
  const target = seat(state, id),
    actual = agentById(town, id).tile;
  if (!target || atWork(town, state, id)) return false;
  const distance = Math.abs(actual.x - target.x) + Math.abs(actual.y - target.y);
  if (distance === 0) return true;
  // Normal movement stops beside a seat occupied by the player or a neighbour.
  // Once gathered, that guest remains present if the obstruction steps away.
  return (
    distance === 1 &&
    zoneAt(actual.x, actual.y) === venue(state)?.place &&
    (state.evening?.status === "ready" ||
      town.agents.some(
        (agent) => agent.id !== id && agent.tile.x === target.x && agent.tile.y === target.y,
      ))
  );
}
function near(town: Town, state: Library) {
  const target = venue(state),
    player = agentById(town, "player").tile;
  return Boolean(
    target &&
    zoneAt(player.x, player.y) === target.place &&
    Math.abs(player.x - target.tile.x) + Math.abs(player.y - target.tile.y) <= 3,
  );
}
function roomReady(state: Library) {
  const revision = state.revisions.at(-1);
  return revision?.mappings["room-access"] === "Cedar" && revision.verified.includes("room-access");
}
function refreshments(town: Town, state: Library): string[] {
  if (!state.evening) return [];
  return (["bread", "tea"] as const).flatMap((kind) =>
    readingRefreshmentReceipt(town, state.evening!.eventId, kind)
      ? [kind === "bread" ? "Baba's bread tray" : "Kevin's tea tray"]
      : [],
  );
}
export function readingStoryView(town: Town, state: Library | null) {
  const evening = state?.evening,
    target = state ? venue(state) : null;
  let nextStep =
    "Help find the room record so Northern can invite people to his first reading. Your paid check is a useful first step.";
  if (state?.phase === "declined")
    nextStep =
      "You passed on the project. No reading, debt or attendance commitment has been created. The work offer remains available if you change your mind.";
  if (state?.phase === "closed" && state.lookup?.status !== "done")
    nextStep =
      "You closed the preparation before the independent search. No reading has been arranged. Earned fees and any common index remain recorded.";
  if (state?.lookup?.status === "done")
    nextStep =
      "Choose a small park reading now, or wait for Baba's dated note and invite Arwyn to a larger library reading. Both are free to attend.";
  if (evening?.status === "waiting")
    nextStep =
      "The library reading is booked. Baba's note is on its way; preview the short wait or keep exploring.";
  if (evening?.status === "routing")
    nextStep =
      "Your guests are making their way over around their work commitments. Go to the reading; refreshments are optional.";
  if (evening?.status === "ready")
    nextStep =
      "Everyone has arrived. Join them to hear Northern, or volunteer a first line of your own. The reading goes ahead after an hour of game time if you stay away.";
  if (evening?.status === "done")
    nextStep = evening.attendedByPlayer
      ? "You made a place for someone's first page. The index and this shared reading stay in the town's memory."
      : "The reading went ahead while you were elsewhere. Sub left a public note; your work and payment remain credited.";
  return {
    title: "Northern's first reading",
    hook: "Northern has been writing alone in his dorm. He wants to read one page to real neighbours, but the library's room record is lost among old labels. Help him find a place to begin.",
    phase: evening?.status ?? "invited",
    nextStep,
    outcome: evening?.outcome ?? null,
    scene: evening?.scene ?? [],
    refreshments: state ? refreshments(town, state) : [],
    gathering:
      target && evening?.bookedAt
        ? {
            label: target.label,
            place: target.place,
            tile: target.tile,
            day: evening.bookedAt.day,
            minute: evening.bookedAt.minute,
            guests: guests(state!).map((id) => ({
              name: agentById(town, id).name,
              arrived: arrived(town, state!, id),
            })),
            status: evening.status,
          }
        : null,
  };
}
export type ReadingAction = {
  kind: string;
  arg: string;
  label: string;
  terms: string;
  disabledReason?: string;
};
export function readingActions(town: Town, state: Library): ReadingAction[] {
  const evening = state.evening,
    actions: ReadingAction[] = [];
  const add = (kind: string, arg: string, label: string, terms: string, disabledReason?: string) =>
    actions.push({ kind, arg, label, terms, disabledReason });
  if (!evening || evening.status === "invited") {
    if (state.lookup?.status !== "done") return actions;
    add(
      "evening-plan",
      "park",
      "Plan a small park reading",
      "Northern and Sub accept a small open-air first reading. They will walk to the park around existing work. Start sooner with two guests; no room booking or spending is needed.",
    );
    add(
      "evening-plan",
      "library",
      "Wait for a library reading",
      "Wait for Baba's dated room note, then Northern, Arwyn and Sub will walk to the library for a larger reading. The note is due 30 game minutes after the lookup. No money or attendance obligation is created.",
      roomReady(state)
        ? undefined
        : "The room reference needs a verified Cedar location first. A failed or provisional index can still support the park reading.",
    );
    return actions;
  }
  if (evening.status === "done") return actions;
  if (evening.status === "waiting") {
    const minutes = Math.max(
      1,
      Math.min(1440, stamp(evening.noteDueAt ?? time(town)) - stamp(time(town))),
    );
    add(
      "evening-wait-note",
      String(minutes),
      `Wait for Baba's note · ${minutes} game minutes`,
      `Advance exactly ${minutes} game minutes using ordinary movement and work rules. Your own commitments still apply; no payment or attendance is invented.`,
    );
    return actions;
  }
  const here = near(town, state);
  for (const kind of ["bread", "tea"] as const)
    if (!readingRefreshmentReceipt(town, evening.eventId, kind))
      add(
        "evening-refreshments",
        kind,
        `Order ${kind} for the reading · 2`,
        `Spend 2 of your own coins on a shared ${kind} tray. ${kind === "bread" ? "Baba's grocery" : "Kevin's cafe"} receives the money in its business till and supplies the tray for this reading. Optional: everyone can attend for free, and old bread tabs stay separate. One tray of this kind per reading.`,
        !here
          ? "Go to the reading place to order its refreshments."
          : availableFunds(town, "agent:player") < 2
            ? "You need 2 available coins; you can still join for free."
            : undefined,
      );
  add(
    "evening-wait",
    "10",
    "Wait for your guests · 10 game minutes",
    "Let 10 game minutes pass through ordinary walking and work. Guests with a prior work commitment or a blocked route may need longer. The reading goes ahead after 60 ready minutes if you do not join.",
  );
  if (evening.status === "ready") {
    add(
      "evening-join",
      "listen",
      "Join the reading",
      "Listen to Northern's first page. Joining is free.",
      here ? undefined : "Walk to the reading place to join the people who are there.",
    );
    add(
      "evening-join",
      "read",
      "Read a first line of your own",
      "Choose to say: ‘I only moved here recently. Today I am glad I did.’ Northern and the others then share their first pages. This is optional, free and creates no future obligation.",
      here ? undefined : "Walk to the reading place before volunteering your line.",
    );
  }
  return actions;
}
export function applyReadingAction(
  town: Town,
  state: Library,
  kind: string,
  arg: string,
  record: StoryEvent,
) {
  if (kind === "evening-plan") {
    if (state.lookup?.status !== "done" || (state.evening && state.evening.status !== "invited"))
      throw new Error("Read the current invitation first.");
    if (arg !== "park" && arg !== "library") throw new Error("Choose an offered reading place.");
    if (arg === "library" && !roomReady(state))
      throw new Error("The library needs a verified room reference; the park is still available.");
    state.evening ??= createReadingEvening(state.started);
    ensureReadingNote(town, state);
    const evening = state.evening;
    evening.choice = arg;
    evening.bookedAt = time(town);
    evening.status = arg === "library" && !state.delivery ? "waiting" : "routing";
    evening.originalPlans = Object.fromEntries(
      guests(state).map((id) => [id, structuredClone(agentById(town, id).plan)]),
    );
    record(
      `reading:${evening.eventId}:booked`,
      `${town.playerName} chose ${arg === "park" ? "a small park reading with Northern and Sub" : "a library reading with Northern, Arwyn and Sub after Baba's room note"}. Their invitation is accepted around existing work; attendance and refreshments remain voluntary.`,
      ["player", ...guests(state)],
    );
    return readingStoryView(town, state).nextStep;
  }
  const evening = state.evening;
  if (!evening) throw new Error("Choose a reading place first.");
  if (kind === "evening-refreshments") {
    if (
      !["routing", "ready"].includes(evening.status) ||
      !near(town, state) ||
      (arg !== "bread" && arg !== "tea")
    )
      throw new Error("Read the current refreshment offer at the reading place.");
    const bought = buyReadingRefreshments(town, evening.eventId, arg);
    if (!bought.ok) throw new Error(bought.reason);
    record(
      `reading:${evening.eventId}:refreshments:${arg}`,
      `${town.playerName} bought a shared ${arg} tray for 2. The money went to ${arg === "bread" ? "the grocery" : "the cafe"} till; old personal tabs are unchanged.`,
      ["player", arg === "bread" ? "baba" : "kevin"],
    );
    return `A ${arg} tray is supplied for the reading. You paid 2; everyone still attends for free.`;
  }
  if (kind === "evening-join") {
    if (
      evening.status !== "ready" ||
      !near(town, state) ||
      !guests(state).every((id) => arrived(town, state, id))
    )
      throw new Error("Join when the people have arrived at the reading place.");
    if (arg !== "listen" && arg !== "read") throw new Error("Choose how to join the reading.");
    completeReading(town, state, record, arg);
    return state.evening!.outcome!;
  }
  throw new Error("That reading action needs the clock preview.");
}
export function prepareReadingAppointments(town: Town, state: Library) {
  const evening = state.evening;
  if (!evening || !["routing", "ready"].includes(evening.status)) return;
  const target = venue(state)!;
  for (const id of guests(state)) {
    restore(town, state, id);
    if (atWork(town, state, id)) continue;
    const agent = agentById(town, id),
      beat = agent.plan.beats[Math.floor(town.minute / 60)];
    // Preserve the current day's actual plan, including any new plan received
    // since booking. Only our own temporary route beats are ever restored.
    evening.originalPlans[id] = structuredClone(agent.plan);
    if (beat) Object.assign(beat, { place: target.place, spot: "out", status: ROUTE });
    agent.path = [];
  }
}
export function readingMovementGoals(
  town: Town,
  state: Library,
): Partial<Record<AgentId, { x: number; y: number }>> {
  if (!state.evening || !["routing", "ready"].includes(state.evening.status)) return {};
  return Object.fromEntries(
    guests(state)
      .filter((id) => !atWork(town, state, id))
      .map((id) => [id, seat(state, id)!]),
  );
}
function readingScene(town: Town, state: Library, participation: "listen" | "read" | null) {
  const evening = state.evening!;
  const shared = refreshments(town, state);
  const scene = [
    evening.choice === "park"
      ? "Northern rests his page on the park bench. ‘I thought I needed a proper room before I could begin.’"
      : "Arwyn opens the library's reading nook using the corroborated room record. Three neighbours pull their chairs together.",
    ...(participation === "read"
      ? [`${town.playerName}: ‘I only moved here recently. Today I am glad I did.’`]
      : []),
    "Northern reads: ‘There was a town where nobody asked what you had finished. They asked what you had begun.’ His hands stop shaking halfway through.",
    evening.choice === "library"
      ? "Arwyn: ‘The room mattered. So did keeping the uncertainty in the record until we could check it.’"
      : "Sub: ‘Two listeners count. A first page does not need a grand opening.’",
    shared.length
      ? `They pass round ${shared.join(" and ")}. Your coins have become something shared.`
      : "Sub folds the reading's programme into a little paper boat. Nobody needed to buy a ticket or a meal to belong.",
  ];
  const outcome =
    participation !== null
      ? `${town.playerName} joined Northern's first reading ${evening.choice === "park" ? "in the park" : "in the library"}. The town has a shared moment to remember, not just a filed record.`
      : `Sub's public note: Northern's first reading went ahead ${evening.choice === "park" ? "in the park" : "in the library"}. ${town.playerName} helped prepare it but was not there; the paid work remains credited.`;
  return { scene, outcome };
}
function completeReading(
  town: Town,
  state: Library,
  record: StoryEvent,
  participation: "listen" | "read" | null,
) {
  const evening = state.evening!;
  evening.attendedByPlayer = participation !== null;
  evening.participation = participation;
  evening.completedAt = time(town);
  evening.status = "done";
  Object.assign(evening, readingScene(town, state, participation));
  record(`reading:${evening.eventId}:scene`, `${evening.outcome} ${evening.scene.join(" ")}`, [
    ...(evening.attendedByPlayer ? ["player" as const] : []),
    ...guests(state),
  ]);
  for (const id of guests(state)) restore(town, state, id);
}
export function advanceReadingEvening(town: Town, state: Library, record: StoryEvent) {
  const evening = state.evening;
  if (!evening) return;
  ensureReadingNote(town, state);
  if (evening.status === "waiting" && state.delivery) {
    evening.status = "routing";
    state.actionRevision++;
  }
  if (!["routing", "ready"].includes(evening.status)) return;
  if (guests(state).every((id) => arrived(town, state, id))) {
    if (evening.status !== "ready") {
      evening.status = "ready";
      evening.readyAt = time(town);
      state.actionRevision++;
    } else if (
      evening.readyAt &&
      !near(town, state) &&
      stamp(time(town)) - stamp(evening.readyAt) >= READY_WINDOW
    ) {
      completeReading(town, state, record, null);
      state.actionRevision++;
    }
  } else if (evening.status === "ready") {
    evening.status = "routing";
    evening.readyAt = null;
    state.actionRevision++;
  }
}
/** A new timetable can change availability even while the town clock is paused. */
export function refreshReadingAttendance(town: Town, state: Library) {
  const evening = state.evening;
  if (evening?.status === "ready" && !guests(state).every((id) => arrived(town, state, id))) {
    evening.status = "routing";
    evening.readyAt = null;
    state.actionRevision++;
  }
}
export function validateReadingEvening(town: Town, state: Library): string[] {
  const e = state.evening;
  if (e === undefined) return [];
  const errors: string[] = [];
  const validTime = (at: GameTime | null, future = false) =>
    at === null ||
    (typeof at === "object" &&
      at !== null &&
      Number.isInteger(at.day) &&
      at.day >= 1 &&
      Number.isInteger(at.minute) &&
      at.minute >= 0 &&
      at.minute < 1440 &&
      (future || stamp(at) <= stamp(time(town))));
  if (
    !e ||
    e.version !== 1 ||
    e.eventId !== `library-evening:${state.started}:1` ||
    ![null, "park", "library"].includes(e.choice) ||
    !["invited", "waiting", "routing", "ready", "done"].includes(e.status) ||
    !Array.isArray(e.scene) ||
    e.scene.some((line) => typeof line !== "string" || line.length > 700) ||
    !e.originalPlans ||
    Array.isArray(e.originalPlans) ||
    typeof e.originalPlans !== "object" ||
    typeof e.attendedByPlayer !== "boolean" ||
    ![null, "listen", "read"].includes(e.participation) ||
    (e.outcome !== null && (typeof e.outcome !== "string" || e.outcome.length > 1000))
  )
    return ["Invalid reading-evening structure; preserve the original save."];
  if (
    !validTime(e.noteDueAt, true) ||
    !validTime(e.bookedAt) ||
    !validTime(e.readyAt) ||
    !validTime(e.completedAt)
  )
    return ["Invalid reading-evening time."];
  if (
    e.status === "invited" &&
    (e.choice !== null ||
      e.bookedAt !== null ||
      e.readyAt !== null ||
      e.completedAt !== null ||
      e.scene.length ||
      Object.keys(e.originalPlans).length)
  )
    errors.push("An unbooked reading cannot contain attendance.");
  if (e.status !== "invited" && (!e.choice || !e.bookedAt || state.lookup?.status !== "done"))
    errors.push("A reading needs its actual completed lookup and invitation.");
  const receipt = town.economy?.work?.receipts.find(
    (item) => item.agreementId === state.lookup?.agreementId,
  );
  if (e.noteDueAt && (!receipt || stamp(e.noteDueAt) !== stamp(readingTimeAfter(receipt.at, 30))))
    errors.push("The reading's room-note time lacks its actual lookup receipt.");
  if (e.bookedAt && (!receipt || stamp(e.bookedAt) < stamp(receipt.at)))
    errors.push("A reading invitation cannot precede its completed lookup.");
  if (
    (e.readyAt && (!e.bookedAt || stamp(e.readyAt) < stamp(e.bookedAt))) ||
    (e.completedAt && (!e.readyAt || stamp(e.completedAt) < stamp(e.readyAt)))
  )
    errors.push("The reading's arrival and scene times are out of order.");
  if (e.status === "waiting" && (e.choice !== "library" || state.delivery))
    errors.push("Only a library reading can wait for its room evidence.");
  if (
    e.choice === "library" &&
    ["routing", "ready", "done"].includes(e.status) &&
    (!state.delivery || !roomReady(state))
  )
    errors.push("A library gathering cannot precede verified room evidence.");
  for (const id of guests(state)) {
    const plan = e.originalPlans[id];
    if (
      !plan ||
      !Number.isInteger(plan.day) ||
      plan.day < 1 ||
      plan.day > town.day ||
      typeof plan.summary !== "string" ||
      !Array.isArray(plan.beats) ||
      plan.beats.length !== 24 ||
      plan.beats.some(
        (beat, index) =>
          !beat ||
          beat.hour !== index ||
          !PLACE_IDS.includes(beat.place) ||
          !["home", "out"].includes(beat.spot) ||
          typeof beat.status !== "string" ||
          beat.status === ROUTE,
      )
    )
      errors.push("A reading guest lacks the preserved timetable.");
  }
  if (Object.keys(e.originalPlans).some((id) => !guests(state).includes(id as AgentId)))
    errors.push("An unrelated resident cannot own a reading timetable.");
  if (errors.length) return errors;
  errors.push(...validateReadingPurchases(town, e.eventId));
  if (
    e.status === "ready" &&
    (!e.readyAt || !guests(state).every((id) => arrived(town, state, id)))
  )
    errors.push("Ready guests need an actual arrival time and physical attendance.");
  for (const kind of ["bread", "tea"] as const) {
    const sale = readingRefreshmentReceipt(town, e.eventId, kind);
    if (
      !sale &&
      state.events.some((event) => event.id === `reading:${e.eventId}:refreshments:${kind}`)
    )
      errors.push("The reading's supplied tray lacks its actual cash-sale receipt.");
    if (!sale) continue;
    const payment = town.economy!.transactions.find((item) => item.id === sale.transactionId)!;
    const boughtAt = { day: payment.day, minute: payment.minute };
    if (
      !e.bookedAt ||
      stamp(boughtAt) < stamp(e.bookedAt) ||
      (e.completedAt && stamp(boughtAt) > stamp(e.completedAt))
    )
      errors.push("Reading refreshments need their actual payment during the booked gathering.");
  }
  if (e.status === "done") {
    const event = state.events.find((item) => item.id === `reading:${e.eventId}:scene`);
    const expected = readingScene(town, state, e.participation);
    if (
      !e.readyAt ||
      !e.completedAt ||
      !e.outcome ||
      e.scene.length < 4 ||
      !event ||
      !Array.isArray(event.participants) ||
      JSON.stringify(e.scene) !== JSON.stringify(expected.scene) ||
      e.outcome !== expected.outcome ||
      event.day !== e.completedAt.day ||
      event.minute !== e.completedAt.minute ||
      event.text !== `${e.outcome} ${e.scene.join(" ")}` ||
      guests(state).some((id) => !event.participants.includes(id)) ||
      event.participants.length !== guests(state).length + Number(e.attendedByPlayer) ||
      e.attendedByPlayer !== Boolean(e.participation) ||
      event.participants.includes("player") !== e.attendedByPlayer ||
      (!e.attendedByPlayer &&
        e.readyAt &&
        e.completedAt &&
        stamp(e.completedAt) - stamp(e.readyAt) < READY_WINDOW)
    )
      errors.push("The reading outcome lacks its actual public scene and attendance.");
  } else if (e.completedAt || e.attendedByPlayer || e.participation || e.scene.length || e.outcome)
    errors.push("An unfinished reading cannot claim a completed scene.");
  return errors;
}
