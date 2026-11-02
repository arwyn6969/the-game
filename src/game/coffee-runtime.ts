import type { AgentId, Town } from "./types";
import type { CoffeeCommand, CoffeeOrder, CoffeeRoutine } from "./coffee-types";
import {
  COFFEE_BREW_MINUTES,
  COFFEE_BREW_STAND,
  COFFEE_MAX_SHIFTS,
  COFFEE_PLACE_MINUTES,
  COFFEE_PLACE_STAND,
  COFFEE_WORKERS,
} from "./coffee-types";
import {
  coffeeRecordBudgetReason,
  completeCoffeeOrder,
  makeCoffeeCommand,
  validateCoffeeCommand,
} from "./coffee";
import { failEconomy, runEconomyCommand } from "./economy";
import { activateFundedTown, advanceFundedPayroll } from "./payroll-runtime";
import { wageInterval, type WorkAgreement } from "./funded-work";
import { beatAt } from "./plan";
import { zoneAt } from "./world";

type Tile = { x: number; y: number };
type Goals = Partial<Record<AgentId, Tile>>;
export type CoffeeControlResult = { ok: boolean; message: string; replayed?: boolean };
const now = (town: Town) => (town.day - 1) * 1440 + town.minute;
const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const incomplete = (order: CoffeeOrder) => ["queued", "brewing", "placing"].includes(order.phase);
const agreementFor = (town: Town, id: string) =>
  town.economy?.work?.agreements.find((agreement) => agreement.id === id);
const routineFor = (town: Town, id: string) =>
  town.coffee?.routines.find((routine) => routine.agreementId === id);
const person = (town: Town, id: AgentId) => town.agents.find((agent) => agent.id === id)!;

/** Earlier accepted work, item movement and meetings cannot be displaced by a new routine. */
export function coffeeCommitmentReason(
  town: Town,
  worker: AgentId,
  ownAgreement?: string,
): string | null {
  if (
    town.economy?.work?.agreements.some(
      (agreement) =>
        agreement.worker === worker &&
        agreement.id !== ownAgreement &&
        ["active", "suspended"].includes(agreement.status),
    )
  )
    return "An earlier paid commitment must be completed or resolved first.";
  const physical = town.physicalItems?.session;
  if (physical?.enabled && physical.actor === worker && physical.intent)
    return "Finish or stop the earlier manuscript movement first.";
  if (
    town.discussions?.sessions.some(
      (meeting) =>
        meeting.status !== "closed" &&
        meeting.members.some((member) => member.id === worker && member.choice === "accepted"),
    )
  )
    return "An accepted meeting takes priority; leave it explicitly before serving.";
  const library = town.economy?.projects?.library as
    { lookup?: { status?: string }; evening?: { status?: string } } | undefined;
  if (worker === "northern" && library?.lookup?.status === "routing")
    return "Northern has an earlier library lookup to finish.";
  return null;
}

function eligibility(town: Town, agreement: WorkAgreement | undefined): string | null {
  if (
    !agreement ||
    agreement.kind !== "cafe-shift" ||
    agreement.payer !== "till:cafe" ||
    !COFFEE_WORKERS.includes(agreement.worker) ||
    agreement.fee !== 5 ||
    agreement.requiredMinutes !== 180
  )
    return "Accept a funded 5-coin café shift first.";
  if (!["active", "suspended"].includes(agreement.status)) return "This shift has already ended.";
  const hold = town.economy?.holds.find((candidate) => candidate.id === agreement.holdId);
  if (!hold || hold.remaining !== 5)
    return "The shift must retain its complete 5-coin wage reservation.";
  if (town.minute < 960 || town.minute >= 1140 || !wageInterval(town, agreement))
    return "Serving starts during this shift's 16:00–19:00 window.";
  const beat = beatAt(person(town, agreement.worker), town.minute);
  if (beat.place !== "cafe" || beat.spot !== "out")
    return "The current plan does not permit café work; preserve the earlier commitment.";
  return coffeeCommitmentReason(town, agreement.worker, agreement.id);
}

function relinquish(town: Town, routine: CoffeeRoutine) {
  const order = town.coffee?.orders.find((candidate) => candidate.id === routine.orderId);
  if (order && order.assignedAgreementId === routine.agreementId) {
    order.assignedAgreementId = null;
    order.assignmentRevision++;
    order.revision++;
  }
  routine.orderId = null;
  person(town, routine.worker).path = [];
}

function drainResumeReason(
  town: Town,
  agreement: WorkAgreement | undefined,
  routine?: CoffeeRoutine,
): string | null {
  if (!coffeeRecordBudgetReason(town)) return null;
  if (!routine || !agreement || routine.drainResumeUsed)
    return "Saved history needs recovery before another automatic continuation; your wage remains reserved.";
  if (
    zoneAt(person(town, routine.worker).tile.x, person(town, routine.worker).tile.y) !== "cafe" ||
    1140 - town.minute < agreement.requiredMinutes - agreement.eligibleMinutes
  )
    return "The final continuation needs café presence and enough of the 16:00–19:00 window to finish uninterrupted.";
  const pendingMinutes = (town.economy?.work?.agreements ?? [])
    .filter((item) => item.kind === "cafe-shift" && ["active", "suspended"].includes(item.status))
    .reduce((sum, item) => sum + item.requiredMinutes - item.eligibleMinutes, 0);
  const pendingOrders = town.coffee!.orders.filter(
    (item) => !["collected", "consumed", "refunded"].includes(item.phase),
  ).length;
  const unsettledPayables = (town.economy?.work?.payables ?? []).filter(
    (payable) => payable.status === "earned",
  ).length;
  // Conservative receipt allowance: source work IDs are at most 120 ASCII
  // characters; reserve 2 KiB per outstanding attendance minute, 8 KiB per
  // order boundary or already-earned payable settlement, and 128 KiB for
  // control/final earning and export wrapping. Completed agreements contribute
  // no remaining minutes, so their pending payments need this separate tail.
  // Browser quota can still fail earlier; this never certifies persistence.
  const reserve = pendingMinutes * 2048 + (pendingOrders + unsettledPayables) * 8192 + 128 * 1024;
  if (new TextEncoder().encode(JSON.stringify(town)).length + reserve >= 8 * 1024 * 1024)
    return "There is not enough measured export headroom for the remaining obligations; keep this town for recovery.";
  return null;
}

function control(
  town: Town,
  command: CoffeeCommand,
  agreementId: string,
  mode: "start" | "pause" | "finish-current",
): CoffeeControlResult {
  const invalid = validateCoffeeCommand(town, command);
  if (invalid) return { ok: false, message: invalid };
  const ownAgreement = agreementFor(town, agreementId);
  if (
    !ownAgreement ||
    ownAgreement.worker !== command.actor ||
    !COFFEE_WORKERS.includes(command.actor)
  )
    return { ok: false, message: "Only the named worker controls this service shift." };
  if (
    command.targetId !== agreementId ||
    (mode === "start" ? !["start", "resume"].includes(command.kind) : command.kind !== mode)
  )
    return { ok: false, message: "The control does not match the displayed shift and action." };
  const existing = town.economy?.commandReceipts.find((receipt) => receipt.id === command.id);
  if (!existing) {
    if (!town.coffee || command.expectedRevision !== town.coffee.revision)
      return {
        ok: false,
        message: "The café changed. Review the current shift before choosing again.",
      };
    const current = routineFor(town, agreementId);
    if (
      mode !== "start" &&
      current &&
      current.status !== "active" &&
      agreementFor(town, agreementId)?.status !== "active"
    )
      return { ok: true, message: "This service routine is already stopped.", replayed: true };
    if (mode === "finish-current" && current?.stopAfterCurrent)
      return { ok: true, message: "Finishing the current coffee, then pausing.", replayed: true };
    if (mode === "start") {
      const drainBlocked = drainResumeReason(town, ownAgreement, current);
      if (drainBlocked) return { ok: false, message: drainBlocked };
    }
  }
  const drainResumeGranted = mode === "start" && Boolean(coffeeRecordBudgetReason(town));
  const result = runEconomyCommand(
    town,
    {
      id: command.id,
      kind: `coffee.${command.kind}`,
      actor: command.actor,
      authority: command.authority,
      terms: { agreementId, coffeeRevision: command.expectedRevision },
    },
    (draft) => {
      const coffee = draft.coffee!;
      if (!coffee || coffee.revision !== command.expectedRevision)
        failEconomy("stale-coffee", "The café changed. Review the current shift first.");
      const agreement = agreementFor(draft, agreementId);
      if (
        !agreement ||
        agreement.worker !== command.actor ||
        !COFFEE_WORKERS.includes(command.actor)
      )
        failEconomy("wrong-worker", "Only the named worker controls this service shift.");
      let routine = routineFor(draft, agreementId);
      if (mode === "start") {
        const reason = eligibility(draft, agreement);
        if (reason) failEconomy("unavailable-shift", reason);
        if (
          !routine &&
          (!coffee.enabled ||
            draft.day - coffee.openedDay >= 7 ||
            coffee.routines.length >= COFFEE_MAX_SHIFTS)
        )
          failEconomy("pilot-closed", "The bounded café pilot is closed to new service shifts.");
        if (
          coffee.routines.some(
            (other) =>
              other.agreementId !== agreementId &&
              other.status === "active" &&
              other.worker === command.actor,
          )
        )
          failEconomy("already-serving", "This worker already controls another service shift.");
        if (
          coffee.routines.filter(
            (other) => other.status === "active" && other.agreementId !== agreementId,
          ).length >= 2
        )
          failEconomy("staff-full", "Both funded service places are occupied.");
        if (routine?.status === "active")
          failEconomy("already-serving", "This service routine is already running.");
        // Same worker/status preconditions as suspendWorkAgreement, committed
        // together with routine authority so neither half can survive alone.
        if (agreement.status === "suspended") agreement.status = "active";
        if (!routine) {
          routine = {
            worker: command.actor,
            agreementId,
            status: "active",
            controlDay: draft.day,
            stopAfterCurrent: false,
            orderId: null,
            lastInterval: null,
            revision: 0,
            reason: null,
          };
          coffee.routines.push(routine);
        } else {
          routine.status = "active";
          routine.controlDay = draft.day;
          routine.stopAfterCurrent = false;
          routine.reason = null;
          routine.revision++;
        }
        person(draft, command.actor).path = [];
      } else {
        if (!routine)
          failEconomy("no-routine", "This shift has no automatic service routine to stop.");
        if (mode === "finish-current" && routine.status === "active" && routine.orderId) {
          routine.stopAfterCurrent = true;
          routine.reason = "Finishing the current coffee, then pausing.";
        } else {
          if (agreement.status === "active") agreement.status = "suspended";
          relinquish(draft, routine);
          routine.status = agreement.status === "completed" ? "ended" : "paused";
          routine.stopAfterCurrent = false;
          routine.reason = "Service paused. Attendance and the full wage reservation remain.";
        }
        routine.revision++;
      }
      if (drainResumeGranted) routine.drainResumeUsed = true;
      coffee.revision++;
      return { agreementId, status: routine.status, drainResumeGranted };
    },
  );
  return result.ok
    ? {
        ok: true,
        replayed: result.replayed,
        message:
          mode === "start"
            ? "Automatic café service started. You can pause or move to stop at any time."
            : mode === "finish-current"
              ? "Finishing this coffee, then pausing; no overtime."
              : "Service paused. Your shift progress and wage reservation remain.",
      }
    : { ok: false, message: result.reason };
}

export function startCoffeeRoutine(
  town: Town,
  command: CoffeeCommand,
  agreementId = command.targetId ?? "",
) {
  return control(town, command, agreementId, "start");
}
export function pauseCoffeeRoutine(
  town: Town,
  command: CoffeeCommand,
  agreementId = command.targetId ?? "",
  finishCurrent = false,
) {
  return control(town, command, agreementId, finishCurrent ? "finish-current" : "pause");
}

function stopTrusted(town: Town, agreementId: string, reason: string): CoffeeControlResult {
  const routine = routineFor(town, agreementId);
  if (
    !routine ||
    (routine.status !== "active" && agreementFor(town, agreementId)?.status !== "active")
  )
    return { ok: true, message: reason, replayed: true };
  const result = pauseCoffeeRoutine(
    town,
    makeCoffeeCommand(town, routine.worker, "pause", {
      targetId: agreementId,
    }),
    agreementId,
  );
  // Stop is local authority even when persistence/ledger validation fails.
  // A later core tick cannot proceed until the pending agreement suspension succeeds.
  const current = routineFor(town, agreementId)!;
  if (!result.ok) {
    relinquish(town, current);
    current.status = "paused";
    current.stopAfterCurrent = false;
    current.revision++;
    town.coffee!.revision++;
    town.paused = true;
  }
  current.reason = result.ok ? reason : `${reason} Recovery is required: ${result.message}`;
  return result.ok ? { ok: true, message: reason } : { ok: false, message: current.reason };
}

export function suspendPlayerCoffeeRoutine(town: Town, reason: string): CoffeeControlResult {
  const active =
    town.coffee?.routines.filter(
      (routine) =>
        routine.worker === "player" &&
        (routine.status === "active" ||
          (routine.status === "paused" &&
            agreementFor(town, routine.agreementId)?.status === "active")),
    ) ?? [];
  let result: CoffeeControlResult = { ok: true, message: reason, replayed: true };
  for (const routine of active) {
    const stopped = stopTrusted(town, routine.agreementId, reason);
    if (!stopped.ok || result.ok) result = stopped;
  }
  return result;
}

export function suspendCoffeeAutomation(town: Town, reason: string): CoffeeControlResult {
  const hadPlayer = hasActivePlayerCoffeeRoutine(town);
  let result: CoffeeControlResult = { ok: true, message: reason, replayed: true };
  for (const routine of [...(town.coffee?.routines ?? [])]) {
    const stopped = stopTrusted(town, routine.agreementId, reason);
    if (!stopped.ok || result.ok) result = stopped;
  }
  if (hadPlayer) town.paused = true;
  return result;
}
export function recoverCoffeeControl(town: Town, reason: string): CoffeeControlResult {
  // A valid saved tick can contain service immediately before payroll. Finish
  // that already-proven attendance at the same timestamp before revoking its
  // grant; otherwise recovery itself would orphan the contribution. This does
  // no service, movement or clock advancement, and payroll retries deduplicate.
  const stamp = `${town.day}:${town.minute}`;
  const pending = town.coffee?.orders.some((order) =>
    order.contributions.some(
      (contribution) =>
        contribution.end === now(town) + 1 &&
        !agreementFor(town, contribution.agreementId)?.attendance.includes(stamp),
    ),
  );
  if (pending) {
    advanceFundedPayroll(town);
    if (!afterCoffeePayroll(town)) {
      town.paused = true;
      return {
        ok: false,
        message: "The interrupted coffee interval needs payroll recovery before work can resume.",
      };
    }
  }
  return suspendCoffeeAutomation(town, reason);
}

export function hasActivePlayerCoffeeRoutine(town: Town): boolean {
  return Boolean(
    town.coffee?.routines.some(
      (routine) =>
        routine.worker === "player" &&
        routine.status === "active" &&
        routine.controlDay === town.day &&
        agreementFor(town, routine.agreementId)?.status === "active",
    ),
  );
}

function assignedOrder(town: Town, routine: CoffeeRoutine): CoffeeOrder | undefined {
  return town.coffee?.orders.find(
    (order) =>
      order.id === routine.orderId &&
      order.assignedAgreementId === routine.agreementId &&
      incomplete(order),
  );
}

function assign(town: Town, routine: CoffeeRoutine): CoffeeOrder | undefined {
  const coffee = town.coffee!;
  const existing = assignedOrder(town, routine);
  if (existing || routine.stopAfterCurrent) return existing;
  const orders = coffee.orders
    .filter(
      (order) => incomplete(order) && !order.assignedAgreementId && order.buyer !== routine.worker,
    )
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        Number(a.id.split(":").at(-1)) - Number(b.id.split(":").at(-1)),
    );
  const candidate = orders.find(
    (order) =>
      order.phase !== "queued" ||
      (!coffee.orders.some((other) => other.phase === "brewing") &&
        coffee.orders.filter((other) => other.pickupSlot !== null).length < 2),
  );
  if (!candidate) return undefined;
  if (candidate.phase === "queued") {
    candidate.phase = "brewing";
    candidate.pickupSlot = coffee.orders.some((other) => other.pickupSlot === 0) ? 1 : 0;
  }
  candidate.assignedAgreementId = routine.agreementId;
  candidate.assignmentRevision++;
  candidate.revision++;
  routine.orderId = candidate.id;
  routine.revision++;
  coffee.revision++;
  return candidate;
}

/** Called once at interval start, before payroll can complete the final minute. */
export function beforeCoffeePayroll(town: Town): { ok: boolean; worked: Set<AgentId> } {
  const worked = new Set<AgentId>();
  if (!town.coffee) return { ok: true, worked };
  for (const order of town.coffee.orders)
    for (const contribution of order.contributions)
      if (contribution.start <= now(town) && contribution.end === now(town) + 1)
        worked.add(contribution.worker);
  if (!activateFundedTown(town).ok) return { ok: false, worked };
  for (const item of [...town.coffee.routines]) {
    const routine = routineFor(town, item.agreementId)!;
    const agreement = agreementFor(town, routine.agreementId);
    if (routine.status !== "active") {
      if (
        routine.status === "paused" &&
        agreement?.status === "active" &&
        !stopTrusted(town, routine.agreementId, routine.reason ?? "Service remains paused.").ok
      )
        return { ok: false, worked };
      continue;
    }
    if (routine.controlDay !== town.day || eligibility(town, agreement)) {
      if (
        !stopTrusted(
          town,
          routine.agreementId,
          "The allowed service window or commitment ended; resume explicitly.",
        ).ok
      )
        return { ok: false, worked };
      continue;
    }
    const interval = now(town);
    if (routine.lastInterval !== null && routine.lastInterval >= interval) continue;
    routine.lastInterval = interval;
    routine.revision++;
    town.coffee.revision++;
    const order = assign(town, routine);
    if (!order) continue;
    const worker = person(town, routine.worker);
    const phase = order.phase;
    if (phase !== "brewing" && phase !== "placing") continue;
    const target = phase === "brewing" ? COFFEE_BREW_STAND : COFFEE_PLACE_STAND;
    if (
      !same(worker.tile, target) ||
      zoneAt(worker.tile.x, worker.tile.y) !== "cafe" ||
      town.agents.some((other) => other.id !== worker.id && same(other.tile, target))
    )
      continue;
    const last = order.contributions.at(-1);
    if (
      last &&
      last.worker === worker.id &&
      last.agreementId === routine.agreementId &&
      last.phase === phase &&
      last.end === interval
    )
      last.end++;
    else
      order.contributions.push({
        worker: worker.id,
        agreementId: routine.agreementId,
        phase,
        start: interval,
        end: interval + 1,
      });
    if (phase === "brewing") {
      order.brewMinutes++;
      if (order.brewMinutes === COFFEE_BREW_MINUTES) order.phase = "placing";
    } else order.placeMinutes++;
    order.revision++;
    town.coffee.revision++;
    worked.add(worker.id);
    if (order.placeMinutes === COFFEE_PLACE_MINUTES) {
      const completed = completeCoffeeOrder(
        town,
        order.id,
        routine.agreementId,
        order.assignmentRevision,
      );
      if (!completed.ok) {
        stopTrusted(
          town,
          routine.agreementId,
          `Coffee completion needs recovery: ${completed.reason}`,
        );
        town.paused = true;
        return { ok: false, worked };
      }
    }
  }
  return { ok: true, worked };
}

/** Finish-current suspends only after this interval has earned its valid attendance. */
export function afterCoffeePayroll(town: Town): boolean {
  // If attendance failed, keep the current interval recoverable. Advancing the
  // clock would turn its already-recorded work into unsupported historical work.
  for (const order of town.coffee?.orders ?? []) {
    for (const contribution of order.contributions) {
      if (contribution.end !== now(town) + 1) continue;
      if (
        !agreementFor(town, contribution.agreementId)?.attendance.includes(
          `${town.day}:${town.minute}`,
        )
      ) {
        town.paused = true;
        return false;
      }
    }
  }
  for (const item of [...(town.coffee?.routines ?? [])]) {
    const routine = routineFor(town, item.agreementId)!;
    if (routine.status !== "active") continue;
    const agreement = agreementFor(town, routine.agreementId);
    if (
      !agreement ||
      agreement.status !== "active" ||
      town.minute >= 1139 ||
      (routine.stopAfterCurrent && !routine.orderId)
    )
      stopTrusted(
        town,
        routine.agreementId,
        agreement?.status === "completed"
          ? "Shift complete. Your earned wage is paid or remains reserved for settlement."
          : town.minute >= 1139
            ? "The service window ended; resume explicitly in a later window."
            : "Finished the coffee and paused. Your partial shift progress remains.",
      );
  }
  return true;
}

/** This is merged into the single navigation pass; progress and travel never share an interval. */
export function coffeeMovementGoals(town: Town, reserved: Goals = {}): Goals {
  const goals: Goals = {};
  for (const routine of town.coffee?.routines ?? []) {
    if (
      routine.status !== "active" ||
      routine.controlDay !== town.day ||
      eligibility(town, agreementFor(town, routine.agreementId))
    )
      continue;
    if (reserved[routine.worker]) {
      stopTrusted(
        town,
        routine.agreementId,
        "An earlier appointment has priority. Service paused.",
      );
      continue;
    }
    const order = assignedOrder(town, routine);
    const worker = person(town, routine.worker);
    goals[routine.worker] =
      order?.phase === "brewing"
        ? COFFEE_BREW_STAND
        : order?.phase === "placing"
          ? COFFEE_PLACE_STAND
          : zoneAt(worker.tile.x, worker.tile.y) === "cafe"
            ? { ...worker.tile }
            : { x: 7, y: 18 };
  }
  return goals;
}

export function coffeeWorkView(town: Town, worker: AgentId = "player") {
  const agreements =
    town.economy?.work?.agreements.filter(
      (item) => item.worker === worker && item.kind === "cafe-shift" && item.payer === "till:cafe",
    ) ?? [];
  const agreement =
    agreements.find((item) => ["active", "suspended"].includes(item.status)) ?? agreements.at(-1);
  const routine = agreement && routineFor(town, agreement.id);
  const order = routine && assignedOrder(town, routine);
  const startReason =
    eligibility(town, agreement) ??
    drainResumeReason(town, agreement, routine) ??
    (!town.coffee
      ? "Open the café pilot first."
      : routine?.status === "active"
        ? "Service is already running."
        : null);
  const status = !agreement
    ? "unavailable"
    : (routine?.status ?? (["active", "suspended"].includes(agreement.status) ? "ready" : "ended"));
  const phase =
    order?.phase === "brewing"
      ? `Brewing ${person(town, order.buyer).name}'s coffee · ${order.brewMinutes}/20`
      : order?.phase === "placing"
        ? `Placing ${person(town, order.buyer).name}'s coffee · ${order.placeMinutes}/10`
        : status === "active"
          ? town.coffee?.orders.filter((item) => item.phase === "ready").length === 2
            ? "Pickup counter full"
            : "Waiting for orders"
          : status === "ended"
            ? "Shift ended"
            : status === "ready"
              ? "Ready to start serving"
              : "Service paused";
  return {
    agreementId: agreement?.id ?? null,
    status,
    reason: routine?.reason ?? startReason ?? phase,
    eligibleMinutes: agreement?.eligibleMinutes ?? 0,
    requiredMinutes: agreement?.requiredMinutes ?? 180,
    fee: agreement?.fee ?? 5,
    phase,
    canStart: !startReason,
    startReason,
    drainNotice:
      coffeeRecordBudgetReason(town) && routine && !routine.drainResumeUsed
        ? "One final uninterrupted continuation is available within the remaining shift window. You can still pause, but another automatic resume will require storage recovery; your wage stays reserved."
        : null,
  };
}

export function refreshCoffeeStatus(town: Town) {
  for (const routine of town.coffee?.routines ?? []) {
    if (routine.status !== "active") continue;
    person(town, routine.worker).status = coffeeWorkView(town, routine.worker).phase;
  }
}
