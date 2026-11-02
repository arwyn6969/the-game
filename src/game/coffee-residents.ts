import type { AgentId, Town } from "./types";
import type { CoffeeCommand } from "./coffee-types";
import {
  applyCoffeeAction,
  coffeeActionReason,
  coffeeAdmissionReason,
  coffeeEconomyCommand,
  coffeeEligibleWorkers,
  coffeeNpcBudget,
  makeCoffeeCommand,
  settleCoffeeRefunds,
  validateCoffeeCommand,
} from "./coffee";
import { COFFEE_CUSTOMER_STAND, COFFEE_MAX_SHIFTS } from "./coffee-types";
import { availableFunds, runEconomyCommand } from "./economy";
import {
  approvePayrollAgreement,
  cafeAgreementTerms,
  CAFE_CANCELLATION,
  createFundedCafeAgreement,
  type PayrollApproval,
} from "./funded-work";
import { activateFundedTown, runtimeCommand } from "./payroll-runtime";
import {
  coffeeCommitmentReason,
  startCoffeeRoutine,
  type CoffeeControlResult,
} from "./coffee-runtime";
import { beatAt } from "./plan";
import { findPath } from "./path";
import { cell, walkable, zoneAt } from "./world";

type Tile = { x: number; y: number };
type Goals = Partial<Record<AgentId, Tile>>;
const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const person = (town: Town, id: AgentId) => town.agents.find((actor) => actor.id === id)!;
const unfinishedNorthernShift = (town: Town) =>
  town.economy?.work?.agreements.find(
    (agreement) =>
      agreement.worker === "northern" &&
      agreement.payer === "till:cafe" &&
      agreement.kind === "cafe-shift" &&
      ["active", "suspended"].includes(agreement.status) &&
      town.coffee?.routines.some((routine) => routine.agreementId === agreement.id),
  );

/** A concrete authored willingness check, never a player order to another resident. */
export function coffeeStaffRequestReason(town: Town): string | null {
  const existingShift = unfinishedNorthernShift(town);
  const closed = existingShift ? null : coffeeAdmissionReason(town);
  if (closed) return closed;
  if (
    zoneAt(person(town, "player").tile.x, person(town, "player").tile.y) !== "cafe" ||
    zoneAt(person(town, "kevin").tile.x, person(town, "kevin").tile.y) !== "cafe"
  )
    return "Ask Kevin while you are both at the café.";
  if (town.minute < 960 || town.minute >= 1140)
    return "Kevin considers staffed coffee service during 16:00–19:00.";
  if (coffeeEligibleWorkers(town, "player").length)
    return "A funded worker is already serving coffee.";
  const coffee = town.coffee!;
  if (!existingShift && coffee.routines.length >= COFFEE_MAX_SHIFTS)
    return "The pilot's funded service-shift limit has been reached.";
  if (!existingShift && coffee.orders.filter((order) => order.phase === "ready").length >= 2)
    return "The pickup counter is full; another shift cannot make space.";
  const northern = person(town, "northern");
  const willing =
    northern.plan.day === town.day &&
    northern.plan.beats
      .filter((beat) => beat.hour >= Math.floor(town.minute / 60) && beat.hour < 19)
      .every(
        (beat) =>
          beat.place === "cafe" && beat.spot === "out" && /ready to work/i.test(beat.status),
      );
  if (!willing || !/ready to work/i.test(beatAt(northern, town.minute).status))
    return "Northern has not chosen café work in his current plan.";
  const conflict = coffeeCommitmentReason(town, "northern", existingShift?.id);
  if (conflict) return conflict;
  if (
    !existingShift &&
    (northern.paidToday ||
      town.economy?.work?.agreements.some(
        (agreement) =>
          agreement.worker === "northern" &&
          agreement.accepted.day === town.day &&
          agreement.kind === "cafe-shift" &&
          agreement.payer === "till:cafe",
      ))
  )
    return "Northern has already accepted his café shift today.";
  if (
    town.economy?.work?.legacyClaims.some(
      (claim) =>
        (claim.payer === "till:cafe" || claim.payer === null) &&
        ["unresolved", "underfunded"].includes(claim.resolution),
    )
  )
    return "Kevin must resolve and protect earlier café wages first.";
  if (!existingShift && (!town.economy || availableFunds(town, "till:cafe") < 5))
    return "The café cannot reserve another complete 5-coin wage.";
  const staff = coffee.routines.filter((routine) => routine.status === "active");
  if (staff.length >= 2) return "Both service staff places are occupied.";
  if (
    !existingShift &&
    staff.length &&
    coffee.orders.filter(
      (order) =>
        ["queued", "brewing", "placing"].includes(order.phase) && order.buyer !== "northern",
    ).length < 2
  )
    return "A second worker needs at least two waiting coffee tickets and usable capacity.";
  return null;
}

/** Commit a staged sequence together: no orphan employer approval or unfunded consent. */
export function requestCoffeeStaff(town: Town, command: CoffeeCommand): CoffeeControlResult {
  const invalid = validateCoffeeCommand(town, command);
  if (invalid) return { ok: false, message: invalid };
  if (command.kind !== "staff-request" || command.actor !== "player" || command.authority !== "ui")
    return {
      ok: false,
      message: "Only the human player's explicit request asks Kevin about staffing.",
    };
  const economic = coffeeEconomyCommand(command);
  const old = town.economy?.commandReceipts.find((receipt) => receipt.id === command.id);
  if (old) {
    const replay = runEconomyCommand(town, economic, () => ({}));
    return replay.ok
      ? { ok: true, replayed: true, message: "This staffing request is already recorded." }
      : { ok: false, message: replay.reason };
  }
  if (command.expectedRevision !== town.coffee?.revision)
    return { ok: false, message: "The café changed. Review current staffing before asking again." };
  if (coffeeEligibleWorkers(town, "player").length)
    return {
      ok: true,
      replayed: true,
      message: "A funded worker is already serving; no new shift was opened.",
    };
  const reason = coffeeStaffRequestReason(town);
  if (reason) return { ok: false, message: reason };
  const draft = structuredClone(town);
  const funded = activateFundedTown(draft);
  if (!funded.ok) return { ok: false, message: funded.reason ?? "Earlier payroll needs recovery." };
  const currentReason = coffeeStaffRequestReason(draft);
  if (currentReason) return { ok: false, message: currentReason };
  const existingShift = unfinishedNorthernShift(draft);
  const id = existingShift?.id ?? `coffee-shift:northern:${draft.day}`;
  const approvalId = `approval:${id}`;
  const approval: Omit<PayrollApproval, "consumed"> = {
    id: approvalId,
    kind: "cafe-replacement",
    worker: "northern",
    payer: "till:cafe",
    issuer: "kevin",
    claimId: null,
    confirmedMinutes: 0,
    fee: 5,
    requiredMinutes: 180,
    expires: { day: draft.day, minute: 1439 },
    cancellation: CAFE_CANCELLATION,
  };
  const approved = existingShift
    ? { ok: true as const }
    : approvePayrollAgreement(
        draft,
        runtimeCommand(draft, "approve-payroll-agreement", "kevin", approval, approvalId),
        approval,
      );
  if (!approved.ok) return { ok: false, message: approved.reason };
  const accepted = existingShift
    ? { ok: true as const }
    : createFundedCafeAgreement(
        draft,
        runtimeCommand(
          draft,
          "accept-funded-cafe-shift",
          "northern",
          cafeAgreementTerms(id, "northern", approvalId),
          id,
        ),
        id,
        "northern",
        approvalId,
      );
  if (!accepted.ok) return { ok: false, message: accepted.reason };
  const started = startCoffeeRoutine(
    draft,
    makeCoffeeCommand(draft, "northern", existingShift ? "resume" : "start", { targetId: id }),
    id,
  );
  if (!started.ok) return started;
  const receipt = runEconomyCommand(draft, economic, () => ({
    agreementId: id,
    worker: "northern",
    fee: 5,
  }));
  if (!receipt.ok) return { ok: false, message: receipt.reason };
  // Preserve stable actor/debt references just as other staged game actions do.
  const agents = draft.agents.map((actor) => Object.assign(person(town, actor.id), actor));
  const favors = draft.favors.map((favor) => {
    const oldFavor = town.favors.find((candidate) => candidate.id === favor.id);
    return oldFavor ? Object.assign(oldFavor, favor) : favor;
  });
  Object.assign(town, draft, { agents, favors });
  return {
    ok: true,
    message:
      "Northern accepted Kevin's funded 5-coin shift and will serve automatically. Late starts preserve remaining minutes for another allowed session.",
  };
}

const COFFEE_VISITORS = ["sub", "northern"] as const;
type Visitor = (typeof COFFEE_VISITORS)[number];

function canVisit(town: Town, visitor: Visitor): boolean {
  const resident = person(town, visitor);
  const beat = beatAt(resident, town.minute);
  return (
    beat.place === "cafe" &&
    beat.spot === "out" &&
    !coffeeCommitmentReason(town, visitor) &&
    !town.coffee?.routines.some((r) => r.worker === visitor && r.status === "active")
  );
}

function readyOrder(town: Town, visitor: Visitor) {
  return town.coffee?.orders
    .filter((order) => order.buyer === visitor && order.phase === "ready")
    .sort((a, b) => a.createdAt - b.createdAt)[0];
}

/** One authored café-visit choice; the spending permission never resets daily. */
function wantsCoffee(town: Town, visitor: Visitor): boolean {
  if (
    !canVisit(town, visitor) ||
    coffeeAdmissionReason(town) ||
    coffeeNpcBudget(town, visitor) < 2 ||
    !coffeeEligibleWorkers(town, visitor).length
  )
    return false;
  if (
    town.coffee!.orders.some(
      (order) =>
        order.buyer === visitor &&
        (Math.floor(order.createdAt / 1440) + 1 === town.day ||
          ["queued", "brewing", "placing", "ready", "refund-pending"].includes(order.phase)),
    )
  )
    return false;
  // Evaluate the same checkout contract at the intended destination without
  // granting arrival or mutating the town. The actual action checks arrival again.
  const view = {
    ...town,
    agents: town.agents.map((actor) =>
      actor.id === visitor ? { ...actor, tile: { ...COFFEE_CUSTOMER_STAND } } : actor,
    ),
  };
  return !coffeeActionReason(view, visitor, "buy");
}

function reachable(town: Town, actor: AgentId, goal: Tile): boolean {
  const who = person(town, actor);
  if (
    !walkable(goal.x, goal.y) ||
    town.agents.some((other) => other.id !== actor && same(other.tile, goal))
  )
    return false;
  if (same(who.tile, goal)) return true;
  const occupied = new Set(
    town.agents
      .filter((other) => other.id !== actor)
      .map((other) => `${other.tile.x},${other.tile.y}`),
  );
  const route = findPath(who.tile, goal, occupied);
  return (
    route.length > 0 &&
    same(route.at(-1)!, goal) &&
    route.every((point) => !occupied.has(`${point.x},${point.y}`))
  );
}

function waitingTile(town: Town, visitor: Visitor): Tile | null {
  const sub = person(town, visitor);
  const options: Tile[] = [];
  for (let y = 17; y <= 24; y++)
    for (let x = 4; x <= 14; x++) {
      const tile = { x, y };
      if (
        zoneAt(x, y) !== "cafe" ||
        cell(x, y)?.ground === "door" ||
        (y === 18 && [5, 6].includes(x)) ||
        same(tile, COFFEE_CUSTOMER_STAND) ||
        !reachable(town, visitor, tile)
      )
        continue;
      options.push(tile);
    }
  return (
    options.sort(
      (a, b) =>
        Math.abs(a.x - sub.tile.x) +
          Math.abs(a.y - sub.tile.y) -
          (Math.abs(b.x - sub.tile.x) + Math.abs(b.y - sub.tile.y)) ||
        a.y - b.y ||
        a.x - b.x,
    )[0] ?? null
  );
}

/** Only a consenting ready buyer approaches pickup; an older unready ticket cannot block it. */
export function coffeeResidentGoals(town: Town, reserved: Goals = {}): Goals {
  if (!town.coffee) return {};
  const visitors = COFFEE_VISITORS.filter(
    (visitor) => !reserved[visitor] && canVisit(town, visitor),
  );
  const ready = visitors
    .filter((visitor) => readyOrder(town, visitor))
    .sort((a, b) => readyOrder(town, a)!.createdAt - readyOrder(town, b)!.createdAt);
  const buying = visitors.filter(
    (visitor) => !ready.includes(visitor) && wantsCoffee(town, visitor),
  );
  // Only one current destination reservation, selected from actual ready orders
  // before new purchases. A human obstruction remains real.
  const approaching = [...ready, ...buying].find((visitor) =>
    reachable(town, visitor, COFFEE_CUSTOMER_STAND),
  );
  const goals: Goals = {};
  if (approaching) goals[approaching] = COFFEE_CUSTOMER_STAND;
  for (const visitor of visitors) {
    if (visitor === approaching) continue;
    const resident = person(town, visitor);
    if (
      same(resident.tile, COFFEE_CUSTOMER_STAND) ||
      town.coffee.orders.some(
        (order) =>
          order.buyer === visitor && ["queued", "brewing", "placing"].includes(order.phase),
      )
    ) {
      const wait = waitingTile(town, visitor);
      goals[visitor] = wait ?? { ...resident.tile };
    }
  }
  return goals;
}

/** Arrival alone never makes a cup: invoke the guarded buyer action after movement. */
export function advanceCoffeeResidents(town: Town): void {
  if (!town.coffee) return;
  const closed = !town.coffee.enabled || town.day >= town.coffee.openedDay + 7;
  settleCoffeeRefunds(
    town,
    (order) =>
      closed &&
      !town.coffee!.routines.some((routine) => {
        const agreement = town.economy?.work?.agreements.find((a) => a.id === routine.agreementId);
        const hold = town.economy?.holds.find((item) => item.id === agreement?.holdId);
        return (
          agreement &&
          agreement.worker !== order.buyer &&
          ["active", "suspended"].includes(agreement.status) &&
          hold?.remaining === 5
        );
      }),
  );
  for (const visitor of COFFEE_VISITORS) {
    if (!canVisit(town, visitor) || !same(person(town, visitor).tile, COFFEE_CUSTOMER_STAND))
      continue;
    const order = readyOrder(town, visitor);
    if (order) {
      applyCoffeeAction(town, makeCoffeeCommand(town, visitor, "collect", { targetId: order.id }));
    } else if (wantsCoffee(town, visitor)) {
      applyCoffeeAction(town, makeCoffeeCommand(town, visitor, "buy"));
    }
  }
  // The next ordinary movement pass clears the counter. No second movement,
  // automatic drinking or invented spending is hidden inside the purchase.
}
