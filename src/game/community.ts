import type { AgentId, Plan, Town } from "./types";
import type { PlayerAction } from "./effects";
import type { FundedTown, JSONValue } from "./economy-types";
import { activateFundedTown, runtimeCommand } from "./payroll-runtime";
import {
  approveLibraryContribution,
  fundLibraryProject,
  createWorkOffer,
  acceptWorkOffer,
  workAcceptanceTerms,
  recordWorkEvidence,
  submitWorkReport,
  completeWorkUnit,
  closeFundedProject,
  projectFundingSummary,
} from "./funded-work";
import { availableFunds, runEconomyCommand, reserveFunds, releaseFunds } from "./economy";
import { agentById, makeMemory, pushMemory } from "./memory";
import { findPath } from "./path";
import { ANCHORS, zoneAt } from "./world";
import { advanceTown } from "./sim";

export const LIBRARY_PROJECT = "library-index";
export const BOX_IDS = ["Birch", "Alder", "Cedar"] as const;
export type BoxId = (typeof BOX_IDS)[number];
export const RECORD_IDS = ["hobbs-equipment", "dorm-repair", "room-access"] as const;
export type RecordId = (typeof RECORD_IDS)[number];
type Role = "source" | "reference";
type Mapping = Record<RecordId, BoxId | null>;
export const LIBRARY_RECORDS = [
  { id: "hobbs-equipment", label: "Hobbs equipment register", box: "Birch" },
  { id: "dorm-repair", label: "Dormitory repair request", box: "Alder" },
  { id: "room-access", label: "Community room access note", box: "Cedar" },
] as const;
const FIXTURE = [
  {
    id: "card:equipment",
    label: "Read the equipment source card",
    text: "Arwyn's public source card: the Hobbs equipment register belongs to stable box Birch; the old shelf number was superseded.",
  },
  {
    id: "card:dorm",
    label: "Read the dormitory source card",
    text: "Arwyn's dated public source card: dorm-repair is the dormitory repair request in Alder. A similarly shortened title belongs to a different record.",
  },
  {
    id: "card:room",
    label: "Read the loose access card",
    text: "The loose community-room card says Birch, but its historical date is uncertain. Check the boxes before treating this as a current location.",
  },
  {
    id: "card:kevin",
    label: "Read Kevin's reference card",
    text: "Kevin's public reference card: use stable box IDs Birch, Alder and Cedar, rather than shelf numbers. Hobbs equipment is in Birch; compare each label with what the box actually contains.",
  },
  ...LIBRARY_RECORDS.map((record) => ({
    id: `box:${record.box}`,
    label: `Inspect ${record.box}`,
    text: `Direct box inspection: ${record.box} contains ${record.label} (${record.id}). This establishes the current location, not the uncertain historical date.`,
  })),
];
const REQUIRED: Record<Role, string[]> = {
  source: ["card:equipment", "card:dorm", "box:Cedar"],
  reference: ["card:kevin", "box:Birch", "box:Alder", "box:Cedar"],
};
const emptyMapping = (): Mapping => ({
  "hobbs-equipment": null,
  "dorm-repair": null,
  "room-access": null,
});
const correctMapping = (): Mapping =>
  Object.fromEntries(LIBRARY_RECORDS.map((record) => [record.id, record.box])) as Mapping;
type PublicEvent = {
  id: string;
  day: number;
  minute: number;
  text: string;
  participants: AgentId[];
  witnesses: AgentId[];
};
type Revision = {
  id: number;
  author: AgentId;
  day: number;
  minute: number;
  mappings: Mapping;
  verified: RecordId[];
};
const BOX_TILES: Record<BoxId, { x: number; y: number }> = {
  Birch: { x: 40, y: 16 },
  Alder: { x: 44, y: 16 },
  Cedar: { x: 50, y: 16 },
};
type LibraryState = {
  schemaVersion: 1;
  actionRevision: number;
  started: number;
  role: Role | "declined";
  phase: "active" | "tested" | "closed" | "declined";
  assignments: Partial<
    Record<Role | "lookup" | "correction", { worker: AgentId; agreementId: string }>
  >;
  observations: {
    id: string;
    key: string;
    text: string;
    worker: AgentId;
    day: number;
    minute: number;
  }[];
  reports: { role: Role | "correction"; worker: AgentId; text: string; agreementId: string }[];
  draft: Mapping;
  revisions: Revision[];
  lookup: {
    revision: number;
    agreementId: string;
    status: "routing" | "done" | "cancelled";
    originalPlan: Plan;
    result: "success" | "failure" | null;
    reason: string;
  } | null;
  events: PublicEvent[];
  delivery: boolean;
  corrected: boolean;
  nextDayRecorded: number;
  finds?: { record: RecordId; revision: number; result: string }[];
  notice?: { revision: number; mode: "verified" | "marked" };
};
type LibraryTown = FundedTown;
const getState = (town: Town): LibraryState | null =>
  ((town as LibraryTown).economy?.projects?.library as unknown as LibraryState) ?? null;
const setState = (town: LibraryTown, state: LibraryState) => {
  town.economy!.projects ??= {};
  town.economy!.projects.library = state as unknown as JSONValue;
};
const command = (town: Town, kind: string, actor: AgentId, terms: JSONValue, suffix: string) =>
  runtimeCommand(town, kind, actor, terms, `${LIBRARY_PROJECT}:${suffix}`);
const must = <T>(result: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
};
function event(town: Town, state: LibraryState, id: string, text: string, participants: AgentId[]) {
  if (state.events.some((item) => item.id === id)) return;
  const present = town.agents
    .filter((agent) =>
      participants.some((participant) => {
        const other = agentById(town, participant);
        return (
          zoneAt(agent.tile.x, agent.tile.y) === zoneAt(other.tile.x, other.tile.y) &&
          Math.abs(agent.tile.x - other.tile.x) + Math.abs(agent.tile.y - other.tile.y) <= 5
        );
      }),
    )
    .map((agent) => agent.id);
  state.events.push({
    id,
    day: town.day,
    minute: town.minute,
    text,
    participants,
    witnesses: present,
  });
  for (const id of new Set([...participants, ...present]))
    pushMemory(
      agentById(town, id),
      makeMemory(town, town.day, town.minute, "observe", text, 7, { source: "event" }),
    );
  town.notices.push({
    id: `n${town.nextId++}`,
    day: town.day,
    minute: town.minute,
    author: participants[0] ?? "player",
    text: text.slice(0, 240),
  });
}
function offer(
  town: LibraryTown,
  role: Role | "lookup" | "correction",
  worker: AgentId,
  requiredEvidence: string[],
) {
  const id = `${LIBRARY_PROJECT}:${role}`;
  const input = {
    id,
    revision: 1,
    worker,
    payer: `project:${LIBRARY_PROJECT}` as const,
    issuer: "kevin" as const,
    task:
      role === "lookup"
        ? "Independent search for the submitted community-room record"
        : `${role} check of three public library records`,
    requiredEvidence,
    fee: 2,
    expires: { day: town.day + 365, minute: 1439 },
  };
  must(createWorkOffer(town, command(town, "offer-work", "kevin", input, id), input));
  return input.id;
}
function accept(town: LibraryTown, offerId: string, worker: AgentId) {
  const item = town.economy!.work!.offers.find((item) => item.id === offerId)!;
  const input = command(town, "accept-work", worker, workAcceptanceTerms(item), offerId);
  input.authority = worker === "player" ? "ui" : "simulation";
  return must(acceptWorkOffer(town, input, offerId));
}
function releasePending(town: LibraryTown, role: string) {
  const id = `hold:pending:${role}`;
  if (!town.economy!.holds.some((hold) => hold.id === id && hold.remaining > 0)) return;
  must(
    runEconomyCommand(
      town,
      command(town, "library.release", "kevin", { role }, role),
      (draft, ctx) => {
        releaseFunds(
          draft,
          ctx,
          id,
          "Move the reserved task fee into its accepted work agreement.",
        );
        return { role };
      },
    ),
  );
}
function start(town: LibraryTown, role: Role) {
  if (getState(town)?.phase !== "declined" && getState(town))
    throw new Error("This project has already started.");
  for (const [donor, account] of [
    ["kevin", "till:cafe"],
    ["baba", "till:grocery"],
  ] as const) {
    const input = {
      id: `approval:library:${donor}`,
      projectId: LIBRARY_PROJECT,
      donor,
      account,
      amount: 4 as const,
      expires: { day: town.day + 365, minute: 1439 },
    };
    must(
      approveLibraryContribution(
        town,
        command(town, "approve-library-contribution", donor, input, donor),
        input,
      ),
    );
  }
  must(
    fundLibraryProject(
      town,
      command(
        town,
        "fund-library-project",
        "kevin",
        {
          projectId: LIBRARY_PROJECT,
          approvalIds: ["approval:library:kevin", "approval:library:baba"],
        },
        "fund",
      ),
      LIBRARY_PROJECT,
      ["approval:library:kevin", "approval:library:baba"],
    ),
  );
  const otherRole = role === "source" ? "reference" : "source";
  const otherWorker = otherRole === "source" ? "arwyn" : "kevin";
  const playerOffer = offer(town, role, "player", REQUIRED[role]);
  offer(town, otherRole, otherWorker, REQUIRED[otherRole]);
  offer(town, "lookup", "northern", ["lookup:room-access"]);
  const agreement = accept(town, playerOffer, "player");
  must(
    runEconomyCommand(
      town,
      command(town, "library.reserve", "kevin", { roles: [otherRole, "lookup"] }, "reserve"),
      (draft, ctx) => {
        for (const task of [otherRole, "lookup"])
          reserveFunds(draft, ctx, {
            id: `hold:pending:${task}`,
            account: `project:${LIBRARY_PROJECT}`,
            amount: 2,
            agreementId: `pending:${task}`,
            purpose: `Reserve the disclosed ${task} fee until its explicit assignment.`,
          });
        return { reserved: 4 };
      },
    ),
  );
  const state: LibraryState = {
    schemaVersion: 1,
    actionRevision: 0,
    started: town.day,
    role,
    phase: "active",
    assignments: { [role]: { worker: "player", agreementId: agreement.id } },
    observations: [],
    reports: [],
    draft: emptyMapping(),
    revisions: [],
    lookup: null,
    events: [],
    delivery: false,
    corrected: false,
    nextDayRecorded: 0,
  };
  setState(town, state);
  event(
    town,
    state,
    "library:funded",
    `Kevin and Baba committed 4 existing business coins each. The town owns the index; ${town.playerName} accepted the ${role} check for 2. Six coins are reserved for the three tasks; two remain for correction.`,
    ["player", "kevin", "baba"],
  );
  return `Your ${role} check is funded. Walk to the library and inspect the listed evidence. The other ${otherRole} check awaits an explicit request.`;
}
function inspect(town: LibraryTown, state: LibraryState, key: string) {
  const fixture = FIXTURE.find((item) => item.id === key);
  if (!fixture) throw new Error("That evidence does not exist.");
  if (state.observations.some((item) => item.key === key))
    throw new Error("That evidence is already recorded.");
  const id = `library-observation:${key}`;
  state.observations.push({
    id,
    key,
    text: fixture.text,
    worker: "player",
    day: town.day,
    minute: town.minute,
  });
  const assignment = state.assignments[state.role as Role];
  if (assignment && REQUIRED[state.role as Role].includes(key)) {
    const input = {
      id: `evidence:${key}`,
      agreementId: assignment.agreementId,
      worker: "player" as const,
      key,
      source: id,
      detail: fixture.text,
    };
    must(
      recordWorkEvidence(town, command(town, "record-work-evidence", "player", input, key), input),
    );
  }
  return fixture.text;
}
function report(
  town: LibraryTown,
  state: LibraryState,
  role: Role,
  worker: AgentId,
  request = false,
) {
  let assignment = state.assignments[role];
  if (request) {
    if (
      role === "reference" &&
      !BOX_IDS.every((box) => state.observations.some((item) => item.key === `box:${box}`))
    )
      throw new Error(
        "Kevin needs your three recorded box inspections before he can check the references.",
      );
    releasePending(town, role);
    const agreement = accept(town, `${LIBRARY_PROJECT}:${role}`, worker);
    assignment = { worker, agreementId: agreement.id };
    state.assignments[role] = assignment;
    for (const key of REQUIRED[role]) {
      const fixture = FIXTURE.find((item) => item.id === key)!;
      const source = key.startsWith("box:")
        ? state.observations.find((item) => item.key === key)?.id
        : `public:${key}`;
      const detail = key.startsWith("box:")
        ? `Written check of the player's observation ${source}: ${fixture.text} This is a report review, not a claimed visit.`
        : fixture.text;
      const input = {
        id: `evidence:${role}:${key}`,
        agreementId: agreement.id,
        worker,
        key,
        source: source ?? `public:${key}`,
        detail,
      };
      must(
        recordWorkEvidence(
          town,
          command(town, "record-work-evidence", worker, input, `${role}:${key}`),
          input,
        ),
      );
    }
  }
  if (!assignment) throw new Error("Read and accept this task first.");
  if (state.reports.some((item) => item.role === role))
    throw new Error("This check has already earned its fee.");
  const agreement = town.economy!.work!.agreements.find(
    (item) => item.id === assignment!.agreementId,
  )!;
  const text = `${agentById(town, worker).name}'s ${role} report: equipment is in Birch, dorm repair in Alder, and the recorded inspection places room access in Cedar. The historical room-access date remains uncertain. This report does not overwrite the submitted index.`;
  const input = { outcome: "success" as const, text, evidenceIds: [...agreement.evidenceIds] };
  const cmd = command(
    town,
    "submit-work-report",
    worker,
    { agreementId: agreement.id, report: input },
    role,
  );
  cmd.authority = worker === "player" ? "ui" : "simulation";
  must(submitWorkReport(town, cmd, agreement.id, input));
  must(
    completeWorkUnit(
      town,
      command(town, "complete-work", worker, { agreementId: agreement.id }, role),
      agreement.id,
    ),
  );
  state.reports.push({ role, worker, text, agreementId: agreement.id });
  event(
    town,
    state,
    `library:paid:${role}`,
    `${agentById(town, worker).name} completed the agreed ${role} check and earned 2. Payment is for the recorded work; the independent lookup has not yet established usefulness.`,
    [worker, "kevin"],
  );
  return text;
}
function submit(town: LibraryTown, state: LibraryState, author: AgentId) {
  if (!["source", "reference"].every((role) => state.reports.some((item) => item.role === role)))
    throw new Error("Both attributed preparation reports are required before submission.");
  if (state.lookup?.status === "routing")
    throw new Error(
      "Northern is testing a frozen revision. Finish or cancel that appointment before submitting another.",
    );
  if (state.revisions.length && !state.corrected)
    throw new Error(
      "A further test needs a separately funded correction; the first revision stays recorded.",
    );
  const mappings = author === "arwyn" ? correctMapping() : structuredClone(state.draft);
  const verified = LIBRARY_RECORDS.filter(
    (record) =>
      mappings[record.id] === record.box &&
      state.observations.some((item) => item.key === `box:${record.box}`),
  ).map((record) => record.id);
  const revision: Revision = {
    id: state.revisions.length + 1,
    author,
    day: town.day,
    minute: town.minute,
    mappings,
    verified,
  };
  state.revisions.push(revision);
  state.draft = mappings;
  event(
    town,
    state,
    `library:revision:${revision.id}`,
    `${agentById(town, author).name} submitted index revision ${revision.id}: ${verified.length} verified locations; other entries remain provisional or unresolved. Historical date confidence is separate.`,
    [author],
  );
  return `Revision ${revision.id} is frozen for testing. Its actual author is ${agentById(town, author).name}.`;
}
function beginLookup(town: LibraryTown, state: LibraryState) {
  const revision = state.revisions.at(-1);
  if (!revision) throw new Error("Submit an index first.");
  if (state.lookup) throw new Error("The funded independent test has already been booked.");
  const northern = agentById(town, "northern");
  const wage = town.economy!.work!.agreements.find(
    (item) => item.worker === "northern" && item.kind === "cafe-shift" && item.status === "active",
  );
  if (wage && town.minute >= 960 && town.minute < 1140)
    throw new Error(
      "Northern has an active cafe commitment. Return outside its hours; the lookup remains funded and pending.",
    );
  const occupied = new Set(
    town.agents
      .filter((agent) => agent.id !== "northern")
      .map((agent) => `${agent.tile.x},${agent.tile.y}`),
  );
  if (
    zoneAt(northern.tile.x, northern.tile.y) !== "library" &&
    !findPath(northern.tile, ANCHORS.library, occupied).length
  )
    throw new Error(
      "Northern's route is blocked. Clear the route or return later; no fee was consumed.",
    );
  releasePending(town, "lookup");
  const agreement = accept(town, `${LIBRARY_PROJECT}:lookup`, "northern");
  state.assignments.lookup = { worker: "northern", agreementId: agreement.id };
  state.lookup = {
    revision: revision.id,
    agreementId: agreement.id,
    status: "routing",
    originalPlan: structuredClone(northern.plan),
    result: null,
    reason: "Northern is walking to the library to test room-access.",
  };
  return "Northern accepted the independent two-coin lookup. He will walk to the library; use the clock or read the wait preview.";
}
function latestEntries(state: LibraryState | null) {
  const revision = state?.revisions.at(-1);
  return LIBRARY_RECORDS.map((record) => ({
    id: record.id,
    label: record.label,
    box: revision?.mappings[record.id] ?? state?.draft[record.id] ?? null,
    status: (revision?.verified.includes(record.id)
      ? "verified"
      : (revision?.mappings[record.id] ?? state?.draft[record.id])
        ? "provisional"
        : "unresolved") as "verified" | "provisional" | "unresolved",
    date:
      record.id === "room-access" && !state?.delivery
        ? "Historical date unknown"
        : "Public source date confirmed",
  }));
}
export function libraryView(town: Town) {
  const state = getState(town);
  const economy = (town as FundedTown).economy;
  const funding = economy?.work ? projectFundingSummary(town, LIBRARY_PROJECT) : null;
  const goal = libraryMovementGoals(town)?.northern ?? ANCHORS.library;
  const route =
    state?.lookup?.status === "routing" ? findPath(agentById(town, "northern").tile, goal) : [];
  const minutes =
    state?.lookup?.status === "routing" ? Math.max(1, Math.ceil(route.length / 3) + 2) : 0;
  const outcome =
    state?.lookup?.result === "success"
      ? `Northern found room-access in Cedar using revision ${state.lookup.revision}.`
      : state?.lookup?.result === "failure"
        ? `Northern could not find room-access using revision ${state.lookup.revision}. Payment for his completed search remains earned.`
        : (state?.lookup?.reason ?? "No independent lookup completed yet.");
  const player = agentById(town, "player");
  const warnings = player.projects
    .filter((item) => item.status === "open" && item.kind === "shift")
    .map((item) => item.text);
  return {
    title: "The library index",
    status: state?.phase ?? "offered",
    owner: "The town" as const,
    nextStep:
      !state || state.phase === "declined"
        ? "Read the terms; choose a paid check, decline, or walk on."
        : state.phase === "closed"
          ? "Use the common index; its funding account is closed."
          : !state.reports.some((item) => item.worker === "player")
            ? "Walk to the library. Inspect your required evidence and submit your check."
            : state.reports.length < 2
              ? "Request the other funded preparation report."
              : !state.revisions.length
                ? "Choose your draft mappings, then submit or delegate authorship."
                : !state.lookup
                  ? "Book Northern's independent lookup."
                  : state.lookup.status === "routing"
                    ? "Northern is en route. Preview waiting or let town time run."
                    : "Read the result and tomorrow's aftermath. Correction and closure have separate terms.",
    budget: 8,
    custody: funding?.balance ?? 0,
    reserved: funding?.holds.reduce((sum, item) => sum + item.remaining, 0) ?? 0,
    spent: funding?.paid ?? 0,
    progress: `${state?.reports.filter(item=>item.role!=="correction").length ?? 0}/2 preparation reports; ${state?.lookup?.status === "done" ? 1 : 0}/1 independent lookup`,
    entries: latestEntries(state),
    evidence: FIXTURE.map((item) => ({
      ...item,
      read: state?.observations.some((observation) => observation.key === item.id) ?? false,
    })),
    reports:
      state?.reports.map((item) => ({
        role: item.role,
        worker: agentById(town, item.worker).name,
        text: item.text,
      })) ?? [],
    outcome,
    events: state?.events.map(({ id, day, minute, text }) => ({ id, day, minute, text })) ?? [],
    waitPreview: minutes
      ? {
          minutes,
          warning: `Advances ${minutes} game minutes through ordinary movement and work rules. ${warnings.length ? `Existing commitments: ${warnings.join(" ")}` : "You have no recorded cafe shift."} Blocked routes may remain pending.`,
        }
      : null,
    finds: latestEntries(state).map((item) => ({
      id: item.id,
      label: item.label,
      result:
        state?.finds
          ?.filter(
            (find) => find.record === item.id && find.revision === state.revisions.at(-1)?.id,
          )
          .at(-1)?.result ??
        (!state?.revisions.length
          ? "No submitted index yet."
          : "Use Find a record at the library to try this exact submitted reference."),
    })),
  };
}
export type LibraryAction = PlayerAction & {
  category: "offer" | "evidence" | "report" | "draft" | "lookup" | "manage";
};
export function libraryActions(town: Town): LibraryAction[] {
  const state = getState(town);
  const actions: LibraryAction[] = [];
  const here =
    zoneAt(agentById(town, "player").tile.x, agentById(town, "player").tile.y) === "library";
  const add = (
    kind: string,
    arg: string,
    label: string,
    terms: string,
    category: LibraryAction["category"],
    disabledReason?: string,
  ) =>
    actions.push({
      id: JSON.stringify([kind, arg, town.day, state?.actionRevision ?? 0, town.nextId]),
      label,
      terms,
      category,
      disabledReason,
    });
  if (!state || state.phase === "declined") {
    for (const role of ["source", "reference"] as const)
      add(
        "accept",
        role,
        `Accept ${role} check · 2`,
        `${role === "source" ? "Read the equipment and dorm source cards and inspect Cedar" : "Read Kevin's reference card and inspect Birch, Alder and Cedar"}; submit one structured report to earn 2. Kevin and Baba commit 4 business coins each after payroll protection. All three task fees are reserved; two coins fund a later correction. Incomplete work earns no fee; completed work earns the full fee even if the later index fails. The town owns the result. You may withdraw without a penalty.`,
        "offer",
      );
    if (state?.phase !== "declined")
      add(
        "decline",
        "",
        "Decline the project",
        "Create no obligation, spend nothing, and incur no trust penalty. The same funded work remains available to residents or pending.",
        "offer",
      );
    return actions;
  }
  const location = here
    ? undefined
    : "Walk to the library to inspect evidence, prepare a draft or use its index.";
  if (state.revisions.length)
    for (const record of LIBRARY_RECORDS)
      add(
        "find",
        record.id,
        `Find a record · ${record.label}`,
        "Try the current submitted reference against its actual box. This common resource is free to use; its result does not claim an independent paid test.",
        "lookup",
        location,
      );
  if (state.phase === "closed") return actions;
  for (const fixture of FIXTURE)
    if (!state.observations.some((item) => item.key === fixture.id))
      add(
        "inspect",
        fixture.id,
        fixture.label,
        "Record this specific public card or direct box inspection; no payment or completion is implied by reading alone.",
        "evidence",
        location,
      );
  const role = state.role as Role;
  if (!state.reports.some((item) => item.role === role))
    add(
      "report",
      role,
      `Submit ${role} check · earn 2`,
      `Submit your report after these observations: ${REQUIRED[role].map(key=>FIXTURE.find(item=>item.id===key)!.label).join("; ")}. Completing these observations earns the agreed 2; this does not verify an untested index or invent a historical date.`,
      "report",
      location ??
        (REQUIRED[role].every((key) => state.observations.some((item) => item.key === key))
          ? undefined
          : "Inspect every required evidence item first."),
    );
  const otherRole = role === "source" ? "reference" : "source";
  if (!state.reports.some((item) => item.role === otherRole))
    add(
      "request",
      otherRole,
      `Request ${otherRole} check · pay ${otherRole === "source" ? "Arwyn" : "Kevin"} 2`,
      `Commission the other preparation unit from the reserved project budget. ${otherRole === "reference" ? "Kevin reviews your recorded box observations, rather than claiming he visited." : "Arwyn checks the public source cards and the supplied recorded box inspection."} You receive the attributed written report; it does not overwrite your draft.`,
      "report",
      location ??
        (otherRole === "reference" &&
        !BOX_IDS.every((box) => state.observations.some((item) => item.key === `box:${box}`))
          ? "Inspect all three boxes before requesting Kevin's report."
          : undefined),
    );
  if (
    state.reports.filter((item) => item.role !== "correction").length === 2 &&
    !state.revisions.length
  ) {
    for (const record of LIBRARY_RECORDS)
      for (const box of [...BOX_IDS, "unresolved"] as const)
        add(
          "map",
          `${record.id}:${box}`,
          `${record.label} → ${box}`,
          `Choose ${box} in your draft. A supported observed mapping is verified; a conflicting selection stays provisional. No fee depends on guessing a preferred answer.`,
          "draft",
          location,
        );
    add(
      "submit",
      "player",
      "Submit your index",
      "Freeze the displayed mappings as your attributed revision. Northern tests exactly this revision; written NPC reports cannot silently repair it.",
      "draft",
      location,
    );
    add(
      "submit",
      "arwyn",
      "Delegate submission to Arwyn",
      "Arwyn submits the supported locations, retaining the unknown historical date. Credit belongs to Arwyn; you retain credit and payment for your actual preparation check.",
      "draft",
      location,
    );
  }
  if (state.revisions.length && !state.lookup)
    add(
      "test",
      "",
      "Test this index · Northern earns 2",
      "Book a funded independent search for room-access against the frozen revision. Northern walks to the library; blocked routes and active commitments leave it pending. A completed failed search still earns 2.",
      "lookup",
      location,
    );
  if (state.revisions.length) for(const mode of ["verified","marked"] as const) {
    const revision=state.revisions.at(-1)!;
    if(state.notice?.revision===revision.id&&state.notice.mode===mode) continue;
    add("publish",mode,mode==="verified"?"Ask Sub to post verified entries":"Ask Sub to mark provisional entries",
      "Request one optional, voluntary public notice from Sub using this submitted revision. Show only verified entries, or clearly label provisional and unresolved entries. The notice cannot change the index, claim ownership or overrule evidence.","manage",location);
  }
  const preview = libraryView(town).waitPreview;
  if (preview)
    add(
      "wait",
      String(preview.minutes),
      `Wait for lookup · ${preview.minutes} game minutes`,
      preview.warning,
      "lookup",
    );
  if (
    state.lookup?.status === "done" &&
    state.delivery &&
    !state.corrected &&
    availableFunds(town as FundedTown, `project:${LIBRARY_PROJECT}`) >= 2
  )
    add(
      "correct",
      "",
      "Accept and complete correction · 2",
      "Read Baba's dated delivery evidence and cite your prior inspections. A separate funded two-coin correction updates location confidence and attribution without confiscating earlier wages. The earlier tested revision stays recorded; this revision has not received a new paid independent test.",
      "report",
      location,
    );
  add(
    "close",
    "",
    "Close project and refund unspent funds",
    "Settle earned liabilities, cancel only unearned work, and return all remaining unreserved project coins equally to Kevin and Baba's tills. Completed work and the common index stay accessible; an unpaid earned claim blocks closure.",
    "manage",
  );
  return actions;
}
export function applyLibraryAction(town: Town, actionId: string): { ok: boolean; reply: string } {
  const quoted = libraryActions(town).find((item) => item.id === actionId);
  if (!quoted)
    return { ok: false, reply: "The project terms changed. Read its current actions again." };
  if (quoted.disabledReason) return { ok: false, reply: quoted.disabledReason };
  try {
    const draft = structuredClone(town) as LibraryTown;
    const activation = activateFundedTown(draft);
    if (!activation.ok) throw new Error(activation.reason);
    const [kind, arg] = JSON.parse(actionId) as [string, string];
    let state = getState(draft);
    let reply = "";
    if (kind === "decline") {
      state = {
        schemaVersion: 1,
        actionRevision: 0,
        started: town.day,
        role: "declined",
        phase: "declined",
        assignments: {},
        observations: [],
        reports: [],
        draft: emptyMapping(),
        revisions: [],
        lookup: null,
        events: [],
        delivery: false,
        corrected: false,
        nextDayRecorded: 0,
      };
      setState(draft, state);
      reply =
        "You declined. No debt, fee or trust penalty was created. The project remains pending.";
      pushMemory(
        agentById(draft, "player"),
        makeMemory(draft, draft.day, draft.minute, "observe", reply, 5, { source: "event" }),
      );
    } else if (kind === "accept") reply = start(draft, arg as Role);
    else {
      if (!state) throw new Error("Read the offer first.");
      if (kind === "inspect") reply = inspect(draft, state, arg);
      else if (kind === "report") reply = report(draft, state, arg as Role, "player");
      else if (kind === "request")
        reply = report(draft, state, arg as Role, arg === "source" ? "arwyn" : "kevin", true);
      else if (kind === "map") {
        const [id, box] = arg.split(":");
        state.draft[id as RecordId] = box === "unresolved" ? null : (box as BoxId);
        reply = `Draft updated: ${id} → ${box}.`;
      } else if (kind === "submit") reply = submit(draft, state, arg as AgentId);
      else if (kind === "test") reply = beginLookup(draft, state);
      else if (kind === "find") {
        const revision = state.revisions.at(-1)!;
        const record = LIBRARY_RECORDS.find((item) => item.id === arg)!;
        const box = revision.mappings[record.id];
        reply =
          box === record.box
            ? `Found ${record.label} in ${box} using revision ${revision.id}. Source: the submitted index and this direct box search.`
            : `Revision ${revision.id} points to ${box ?? "no box"}; that reference did not locate ${record.label}. The mapping remains ${box ? "provisional" : "unresolved"}.`;
        state.finds ??= [];
        state.finds = state.finds.filter(item=>item.record!==record.id||item.revision!==revision.id);
        state.finds.push({ record: record.id, revision: revision.id, result: reply });
        pushMemory(
          agentById(draft, "player"),
          makeMemory(draft, draft.day, draft.minute, "observe", reply, 6, { source: "event" }),
        );
      } else if(kind === "publish") {
        const revision=state.revisions.at(-1)!;const mode=arg as "verified"|"marked";
        const entries=latestEntries(state).filter(item=>mode==="marked"||item.status==="verified");
        state.notice={revision:revision.id,mode};
        reply=`Sub's notice, revision ${revision.id}: ${entries.length?entries.map(item=>`${item.label}: ${item.box??"unresolved"} (${item.status})`).join("; "):"No verified entries yet"}. Credit: ${agentById(draft,revision.author).name} submitted the index; the town owns it.`;
        event(draft,state,`library:notice:${revision.id}:${mode}`,reply,["player","sub"]);
      } else if (kind === "wait") {
        advanceTown(draft, Number(arg));
        state = getState(draft);
        reply = libraryView(draft).outcome;
      } else if (kind === "correct") reply = correct(draft, state);
      else if (kind === "close") {
        for (const role of ["source", "reference", "lookup"]) releasePending(draft, role);
        must(
          closeFundedProject(
            draft,
            command(
              draft,
              "close-funded-project",
              "kevin",
              { projectId: LIBRARY_PROJECT },
              "close",
            ),
            LIBRARY_PROJECT,
          ),
        );
        if (state.lookup?.status === "routing") {
          agentById(draft, "northern").plan = state.lookup.originalPlan;
          agentById(draft, "northern").path = [];
          state.lookup.status = "cancelled";
        }
        state.phase = "closed";
        reply =
          "Project closed. Earned fees stay paid; all remaining money returned equally to the contributing tills. The index remains common.";
        event(draft, state, "library:closed", reply, ["player", "kevin", "baba"]);
      }
    }
    state = getState(draft);
    if (state) state.actionRevision++;
    draft.nextId++;
    Object.assign(town, draft);
    return { ok: true, reply };
  } catch (error) {
    return {
      ok: false,
      reply:
        error instanceof Error
          ? error.message
          : "The project action failed; your town is unchanged.",
    };
  }
}
function correct(town: LibraryTown, state: LibraryState) {
  if (!state.delivery || state.corrected || !state.lookup?.result)
    throw new Error("Correction needs the completed lookup and Baba's later public evidence.");
  const id = offer(town, "correction", "player", ["delivery:room-access"]);
  const agreement = accept(town, id, "player");
  state.assignments.correction = { worker: "player", agreementId: agreement.id };
  const evidence = {
    id: "evidence:correction:delivery",
    agreementId: agreement.id,
    worker: "player" as const,
    key: "delivery:room-access",
    source: "library:delivery",
    detail:
      "Baba's dated public delivery note confirms the historical Cedar reference; the prior box observations establish the current mappings.",
  };
  must(
    recordWorkEvidence(
      town,
      command(town, "record-work-evidence", "player", evidence, "correction"),
      evidence,
    ),
  );
  const report = {
    outcome: "success" as const,
    text: "Corrected the submitted mappings against recorded box inspections and Baba's public delivery note; historical date now confirmed.",
    evidenceIds: [evidence.id],
  };
  const cmd = command(
    town,
    "submit-work-report",
    "player",
    { agreementId: agreement.id, report },
    "correction",
  );
  cmd.authority = "ui";
  must(submitWorkReport(town, cmd, agreement.id, report));
  must(
    completeWorkUnit(
      town,
      command(town, "complete-work", "player", { agreementId: agreement.id }, "correction"),
      agreement.id,
    ),
  );
  state.reports.push({
    role: "correction",
    worker: "player",
    text: report.text,
    agreementId: agreement.id,
  });
  state.corrected = true;
  state.draft = correctMapping();
  const revision: Revision = {
    id: state.revisions.length + 1,
    author: "player",
    day: town.day,
    minute: town.minute,
    mappings: correctMapping(),
    verified: LIBRARY_RECORDS.map((item) => item.id),
  };
  state.revisions.push(revision);
  event(
    town,
    state,
    "library:correction",
    `${town.playerName} completed the separately funded correction and earned 2. Revision ${revision.id} cites current inspections and Baba's historical evidence. Northern's earlier test remains attached to its original revision.`,
    ["player", "baba", "arwyn"],
  );
  return report.text;
}
/** Called around normal pathfinder movement; no teleport or wall-clock absence penalty. */
export function prepareLibraryAppointment(town: Town) {
  const state = getState(town);
  if (state?.lookup?.status !== "routing") return;
  const northern = agentById(town, "northern");
  for (const beat of northern.plan.beats)
    if (beat.hour >= Math.floor(town.minute / 60))
      Object.assign(beat, {
        place: "library",
        spot: "out",
        status: "walking to the library for the funded index lookup",
      });
  northern.path = [];
}
export function libraryMovementGoals(
  town: Town,
): Partial<Record<AgentId, { x: number; y: number }>> | undefined {
  const state = getState(town);
  if (state?.lookup?.status !== "routing") return undefined;
  const revision = state.revisions.find((item) => item.id === state.lookup!.revision);
  const box = revision?.mappings["room-access"];
  return { northern: box ? BOX_TILES[box] : { x: 36, y: 20 } };
}
export function advanceLibraryProject(town: Town) {
  const state = getState(town);
  if (!state || state.phase === "declined") return;
  const target = libraryMovementGoals(town)?.northern;
  const northern = agentById(town, "northern");
  if (
    state.lookup?.status === "routing" &&
    target &&
    northern.tile.x === target.x &&
    northern.tile.y === target.y
  ) {
    const revision = state.revisions.find((item) => item.id === state.lookup!.revision)!;
    const success = revision.mappings["room-access"] === "Cedar";
    const input = {
      id: "evidence:lookup:room-access",
      agreementId: state.lookup.agreementId,
      worker: "northern" as const,
      key: "lookup:room-access",
      source: `library:revision:${revision.id}`,
      detail: `Northern physically reached the library and searched the submitted ${revision.mappings["room-access"] ?? "unresolved"} reference for room-access: ${success ? "found in Cedar" : "record not found through this reference"}.`,
    };
    const draft = structuredClone(town) as LibraryTown;
    try {
      must(
        recordWorkEvidence(
          draft,
          command(draft, "record-work-evidence", "northern", input, "lookup"),
          input,
        ),
      );
      const report = {
        outcome: success ? ("success" as const) : ("failure" as const),
        text: input.detail,
        evidenceIds: [input.id],
      };
      must(
        submitWorkReport(
          draft,
          command(
            draft,
            "submit-work-report",
            "northern",
            { agreementId: input.agreementId, report },
            "lookup",
          ),
          input.agreementId,
          report,
        ),
      );
      must(
        completeWorkUnit(
          draft,
          command(draft, "complete-work", "northern", { agreementId: input.agreementId }, "lookup"),
          input.agreementId,
        ),
      );
      const current = getState(draft)!;
      current.lookup!.status = "done";
      current.lookup!.result = success ? "success" : "failure";
      current.lookup!.reason = input.detail;
      current.phase = "tested";
      agentById(draft, "northern").plan = current.lookup!.originalPlan;
      agentById(draft, "northern").path = [];
      event(
        draft,
        current,
        "library:lookup",
        `${input.detail} Northern earned 2 for his actual search and report.`,
        ["northern"],
      );
      current.actionRevision++;
      Object.assign(town, draft);
    } catch (error) {
      state.lookup.reason =
        error instanceof Error
          ? error.message
          : "The lookup remains pending; payment was not applied.";
    }
  }
  const current = getState(town)!;
  if (
    town.day > current.started &&
    current.lookup?.status === "done" &&
    current.nextDayRecorded !== current.lookup.revision
  ) {
    current.nextDayRecorded = current.lookup.revision;
    const success = current.lookup.result === "success";
    event(
      town,
      current,
      `library:tomorrow:${current.lookup.revision}`,
      success
        ? `Arwyn read Northern's public search report: room-access was found in Cedar using revision ${current.lookup.revision}. Arwyn now uses that index; its preparation credits name ${current.reports
            .filter((item) => item.role !== "correction")
            .map((item) => agentById(town, item.worker).name)
            .join(" and ")}.`
        : `Arwyn read Northern's public search report: revision ${current.lookup.revision} failed to locate room-access. Arwyn keeps it provisional; paid preparation stays credited and a funded correction can address the specific reference.`,
      ["arwyn"],
    );
  }
  if (town.day >= current.started + 2 && !current.delivery && current.lookup?.status === "done") {
    current.delivery = true;
    event(
      town,
      current,
      "library:delivery",
      "Baba published her dated delivery note: Cedar received the community-room access document before the shelf labels changed. The historical date is now corroborated; the direct current box inspection still stands.",
      ["baba"],
    );
    current.actionRevision++;
  }
}
/** A resident knows a public event after witnessing it or reading its notice. */
export function residentLibraryReply(town: Town, resident: AgentId): string | null {
  const state = getState(town);
  if (!state) return null;
  const known = state.events.filter(
    (item) =>
      item.participants.includes(resident) ||
      item.witnesses.includes(resident) ||
      agentById(town, resident).memories.some(
        (memory) => memory.source === "event" && memory.text === item.text,
      ),
  );
  return known.at(-1)?.text ?? null;
}
export function validateLibraryState(town: Town): string[] {
  const state = getState(town);
  if (!state) return [];
  const errors: string[] = [];
  if (
    state.schemaVersion !== 1 ||
    !Number.isInteger(state.actionRevision) ||
    state.actionRevision < 0 ||
    !["source", "reference", "declined"].includes(state.role) ||
    !["active", "tested", "closed", "declined"].includes(state.phase) ||
    !Array.isArray(state.revisions) ||
    !Array.isArray(state.observations) ||
    !Array.isArray(state.reports) ||
    !Array.isArray(state.events)
  )
    return ["The saved library project has invalid structure."];
  const work = (town as FundedTown).economy?.work;
  const validTime = (value: { day: number; minute: number }) =>
    Number.isInteger(value.day) &&
    value.day >= 1 &&
    Number.isInteger(value.minute) &&
    value.minute >= 0 &&
    value.minute < 1440 &&
    value.day * 1440 + value.minute <= town.day * 1440 + town.minute;
  if (
    !Number.isInteger(state.started) ||
    state.started < 1 ||
    state.started > town.day ||
    !Number.isInteger(state.nextDayRecorded) ||
    state.nextDayRecorded < 0 ||
    typeof state.delivery !== "boolean" ||
    typeof state.corrected !== "boolean" ||
    !state.assignments ||
    typeof state.assignments !== "object" ||
    !state.draft
  )
    errors.push("Invalid library lifecycle or progress record.");
  const project = work?.projects.find((item) => item.id === LIBRARY_PROJECT);
  if (
    state.phase !== "declined" &&
    (!project || project.status !== (state.phase === "closed" ? "closed" : "funded"))
  )
    errors.push("The library project does not match its funding account.");
  if (
    state.role === "declined" &&
    (state.phase !== "declined" || state.reports.length || state.revisions.length)
  )
    errors.push("A declined project cannot contain chosen work or authorship.");
  const observationKeys = new Set<string>();
  for (const observation of state.observations) {
    const fixture = FIXTURE.find((item) => item.id === observation.key);
    if (
      !fixture ||
      fixture.text !== observation.text ||
      observation.id !== `library-observation:${observation.key}` ||
      observation.worker !== "player" ||
      !validTime(observation) ||
      observationKeys.has(observation.key)
    )
      errors.push("A library observation lacks its immutable public evidence source.");
    observationKeys.add(observation.key);
  }
  for (const [role, assignment] of Object.entries(state.assignments ?? {})) {
    const agreement = work?.agreements.find((item) => item.id === assignment?.agreementId);
    if (
      !["source", "reference", "lookup", "correction"].includes(role) ||
      !assignment ||
      !agreement ||
      agreement.worker !== assignment.worker ||
      agreement.payer !== `project:${LIBRARY_PROJECT}` ||
      agreement.fee !== 2
    )
      errors.push("A library task lacks its actual funded worker agreement.");
    if (
      role === "lookup" &&
      (assignment?.worker !== "northern" ||
        Object.entries(state.assignments).some(
          ([other, worker]) =>
            ["source", "reference"].includes(other) && worker?.worker === assignment.worker,
        ))
    )
      errors.push("An independent lookup cannot verify its worker's own preparation.");
  }
  const reportRoles = new Set<string>();
  for (const report of state.reports) {
    if (
      !["source", "reference", "correction"].includes(report.role) ||
      reportRoles.has(report.role)
    )
      errors.push("A bounded library check is duplicated or unknown.");
    reportRoles.add(report.role);
  }
  let expectedRevision = 1;
  for (const revision of state.revisions) {
    if (
      revision.id !== expectedRevision++ ||
      !["player", "arwyn"].includes(revision.author) ||
      !validTime(revision) ||
      !Array.isArray(revision.verified) ||
      !revision.mappings ||
      new Set(revision.verified).size !== revision.verified.length
    ) {
      errors.push("Invalid submitted index revision.");
      continue;
    }
    for (const id of RECORD_IDS)
      if (revision.mappings[id] !== null && !BOX_IDS.includes(revision.mappings[id]!))
        errors.push("Unknown library box mapping.");
    for (const id of revision.verified)
      if (
        !RECORD_IDS.includes(id) ||
        revision.mappings[id] !== LIBRARY_RECORDS.find((record) => record.id === id)?.box ||
        !state.observations.some((item) => item.key === `box:${revision.mappings[id]}`)
      )
        errors.push("A verified mapping lacks supporting observed evidence.");
  }
  for (const report of state.reports)
    if (
      !(town as FundedTown).economy?.work?.receipts.some(
        (receipt) => receipt.agreementId === report.agreementId && receipt.worker === report.worker,
      )
    )
      errors.push("A preparation report lacks its paid-work receipt.");
  if (
    state.lookup?.status === "done" &&
    !(town as FundedTown).economy?.work?.receipts.some(
      (receipt) =>
        receipt.agreementId === state.lookup!.agreementId && receipt.worker === "northern",
    )
  )
    errors.push("A completed lookup lacks its independent search receipt.");
  if (state.lookup) {
    const revision = state.revisions.find((item) => item.id === state.lookup!.revision);
    const assignment = state.assignments.lookup;
    if (
      !revision ||
      !["routing", "done", "cancelled"].includes(state.lookup.status) ||
      !assignment ||
      assignment.agreementId !== state.lookup.agreementId ||
      !Array.isArray(state.lookup.originalPlan?.beats) ||
      state.lookup.originalPlan.beats.length !== 24
    )
      errors.push("The lookup appointment has invalid revision, route or work ownership.");
    if (
      state.lookup.status === "done" &&
      revision &&
      state.lookup.result !== (revision.mappings["room-access"] === "Cedar" ? "success" : "failure")
    )
      errors.push("The lookup result contradicts the actual submitted reference.");
  }
  const eventIds = new Set<string>();
  for (const item of state.events) {
    if (
      !item ||
      typeof item.id !== "string" ||
      eventIds.has(item.id) ||
      typeof item.text !== "string" ||
      !validTime(item) ||
      !Array.isArray(item.participants) ||
      !Array.isArray(item.witnesses) ||
      [...item.participants, ...item.witnesses].some(
        (id) => !town.agents.some((agent) => agent.id === id),
      )
    )
      errors.push("Invalid sourced public project event.");
    eventIds.add(item.id);
  }
  return errors;
}
