import { AGENT_IDS, type AgentId } from "./types";
import type { EconomyCommand, EconomyContext, EconomyResult } from "./economy-types";
import {
  accountBalance,
  availableFunds,
  failEconomy,
  releaseFunds,
  reserveFunds,
  runEconomyCommand,
  transferFunds,
} from "./economy";
import { wageInterval } from "./funded-work";
import { activateFundedTown } from "./payroll-runtime";
import { zoneAt } from "./world";
import {
  COFFEE_ADMISSION_BYTES,
  COFFEE_CUSTOMER_STAND,
  COFFEE_MAX_ORDERS,
  COFFEE_PLACE_STAND,
  COFFEE_PRICE,
  COFFEE_WORKERS,
  type CoffeeActionKind,
  type CoffeeCommand,
  type CoffeeOrder,
  type CoffeeState,
  type CoffeeTown,
} from "./coffee-types";

export * from "./coffee-types";
export { validateCoffee } from "./coffee-validation";
export const coffeeTime = (town: CoffeeTown) => (town.day - 1) * 1440 + town.minute;
const beforeReady = (order: CoffeeOrder) => ["queued", "brewing", "placing"].includes(order.phase);
const unresolved = (order: CoffeeOrder) =>
  beforeReady(order) || ["ready", "refund-pending"].includes(order.phase);
const failure = (reason: string, code = "coffee-unavailable"): EconomyResult<never> => ({
  ok: false,
  code,
  reason,
});
const sameTile = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x === b.x && a.y === b.y;

/** The world envelope is checked before economic replay; historic local receipts survive forks. */
export function validateCoffeeCommand(town: CoffeeTown, command: CoffeeCommand): string | null {
  if (
    !command ||
    typeof command !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(command)) ||
    !Reflect.ownKeys(command).every(
      (key) =>
        typeof key === "string" &&
        [
          "id",
          "worldId",
          "characterId",
          "actor",
          "authority",
          "expectedRevision",
          "kind",
          "targetId",
          "acceptLaterPickup",
        ].includes(key),
    ) ||
    typeof command.id !== "string" ||
    !command.id ||
    command.id.length > 200 ||
    typeof command.worldId !== "string" ||
    !/^world_[0-9a-f]{64}$/.test(command.worldId) ||
    typeof command.characterId !== "string" ||
    !/^character_[0-9a-f]{64}$/.test(command.characterId) ||
    !(AGENT_IDS as readonly unknown[]).includes(command.actor) ||
    ![
      "enable",
      "buy",
      "cancel",
      "collect",
      "drink",
      "start",
      "pause",
      "resume",
      "finish-current",
      "staff-request",
    ].includes(command.kind) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    (command.targetId !== undefined &&
      (typeof command.targetId !== "string" ||
        !command.targetId ||
        command.targetId.length > 200)) ||
    (command.acceptLaterPickup !== undefined && typeof command.acceptLaterPickup !== "boolean")
  )
    return "The coffee command has invalid terms.";
  if (
    command.authority === "model" ||
    !["ui", "simulation"].includes(command.authority) ||
    (command.authority === "ui" && command.actor !== "player")
  )
    return "Only a resident's authorized local action can change coffee.";
  if (
    !town.identityRegistry ||
    town.identityRegistry.schemaVersion !== 1 ||
    town.identityRegistry.characters?.[command.actor]?.archetypeId !== command.actor ||
    command.worldId !== town.identityRegistry?.worldId ||
    command.characterId !== town.identityRegistry?.characters?.[command.actor]?.characterId
  )
    return "This coffee action belongs to a different town or resident. Review the current action.";
  return null;
}

/** Pure action construction: no stored quote, no counter change, no implicit consent. */
export function makeCoffeeCommand(
  town: CoffeeTown,
  actor: AgentId,
  kind: CoffeeActionKind,
  options: { id?: string; targetId?: string; acceptLaterPickup?: boolean } = {},
): CoffeeCommand {
  return {
    id:
      options.id ??
      `coffee:${kind}:${actor}:${town.coffee?.revision ?? 0}:${options.targetId ?? "new"}`,
    actor,
    kind,
    worldId: town.identityRegistry?.worldId ?? "",
    characterId: town.identityRegistry?.characters?.[actor]?.characterId ?? "",
    authority: actor === "player" ? "ui" : "simulation",
    expectedRevision: town.coffee?.revision ?? 0,
    ...(options.targetId === undefined ? {} : { targetId: options.targetId }),
    ...(options.acceptLaterPickup === undefined
      ? {}
      : { acceptLaterPickup: options.acceptLaterPickup }),
  };
}

export function coffeeEconomyCommand(command: CoffeeCommand): EconomyCommand {
  return {
    id: command.id,
    kind: `coffee.${command.kind}`,
    actor: command.actor,
    authority: command.authority,
    terms: {
      revision: command.expectedRevision,
      targetId: command.targetId ?? null,
      price: COFFEE_PRICE,
      acceptLaterPickup: command.acceptLaterPickup ?? false,
    },
  };
}

export function coffeeAdmissionReason(town: CoffeeTown): string | null {
  if (!town.coffee?.enabled) return "The coffee pilot is not open.";
  if (town.day >= town.coffee.openedDay + 7)
    return "The seven-day coffee pilot has closed to new orders and shifts.";
  if (town.coffee.orders.length >= COFFEE_MAX_ORDERS)
    return "The coffee pilot has reached its 50-order limit.";
  return coffeeRecordBudgetReason(town);
}

export function coffeeRecordBudgetReason(town: CoffeeTown): string | null {
  try {
    return new TextEncoder().encode(JSON.stringify(town)).length >= COFFEE_ADMISSION_BYTES
      ? "This town is keeping its remaining save space for existing work and refunds."
      : null;
  } catch {
    return "This town needs save recovery before another coffee commitment.";
  }
}

export function coffeeEligibleWorkers(town: CoffeeTown, buyer?: AgentId): AgentId[] {
  if (town.minute < 960 || town.minute >= 1140) return [];
  return (town.coffee?.routines ?? [])
    .filter((r) => {
      const agreement = town.economy?.work?.agreements.find((a) => a.id === r.agreementId);
      const worker = town.agents.find((a) => a.id === r.worker);
      const hold = town.economy?.holds.find((h) => h.id === agreement?.holdId);
      return (
        r.status === "active" &&
        r.controlDay === town.day &&
        !r.stopAfterCurrent &&
        r.worker !== buyer &&
        COFFEE_WORKERS.includes(r.worker) &&
        agreement?.status === "active" &&
        agreement.kind === "cafe-shift" &&
        agreement.payer === "till:cafe" &&
        agreement.fee === 5 &&
        agreement.requiredMinutes === 180 &&
        agreement.eligibleMinutes < 180 &&
        hold?.remaining === 5 &&
        hold.account === "till:cafe" &&
        hold.agreementId === agreement.id &&
        wageInterval(town, agreement) &&
        !!worker &&
        zoneAt(worker.tile.x, worker.tile.y) === "cafe"
      );
    })
    .map((r) => r.worker);
}

export function coffeeNpcBudget(town: CoffeeTown, who: AgentId): number {
  const wages = (town.economy?.work?.payables ?? [])
    .filter((p) => p.worker === who && p.payer === "till:cafe" && p.status === "settled")
    .reduce((sum, p) => sum + p.amount, 0);
  const spending =
    (town.coffee?.orders ?? []).filter((o) => o.buyer === who && o.phase !== "refunded").length * 2;
  return 2 + wages - spending;
}

function priorPayrollReason(town: CoffeeTown): string | null {
  return town.economy?.work?.legacyClaims.some(
    (c) =>
      (c.payer === "till:cafe" || c.payer === null) &&
      ["unresolved", "underfunded"].includes(c.resolution),
  )
    ? "Earlier café wages must be resolved and protected first."
    : null;
}

function buyReason(town: CoffeeTown, actor: AgentId, acceptLaterPickup: boolean): string | null {
  const closed = coffeeAdmissionReason(town) ?? priorPayrollReason(town);
  if (closed) return closed;
  const coffee = town.coffee!;
  const person = town.agents.find((a) => a.id === actor);
  if (!person || !sameTile(person.tile, COFFEE_CUSTOMER_STAND))
    return "Stand at the café pickup counter to order.";
  if (town.agents.some((a) => a.id !== actor && sameTile(a.tile, COFFEE_CUSTOMER_STAND)))
    return "The pickup counter is occupied. Wait for clear space before ordering.";
  if (town.minute < 960 || town.minute >= 1140)
    return "Coffee service takes orders from 16:00 to 19:00.";
  if (!coffeeEligibleWorkers(town, actor).length)
    return "A different consenting worker needs a funded active service shift.";
  if (coffee.orders.filter((o) => o.phase === "ready").length >= 2)
    return "The pickup counter is full. Existing owners can collect their cups.";
  const open = coffee.orders.filter(unresolved);
  if (open.some((o) => o.buyer === actor)) return "You already have an unresolved coffee ticket.";
  if (open.length >= 6) return "All six coffee tickets are in use.";
  if (
    coffee.cups.filter((c) => c.owner === actor && c.custody === "inventory").length +
      open.filter((o) => o.buyer === actor && o.phase !== "refund-pending").length >=
    4
  )
    return "Your four coffee spaces are full. You may keep or drink your own cups.";
  const debts = town.favors
    .filter((f) => f.from === actor && f.status === "owed")
    .reduce((sum, f) => sum + f.amount, 0);
  if (!town.economy || availableFunds(town, `agent:${actor}`) - debts < 2)
    return "Two uncommitted coins are needed; existing debts stay protected.";
  if (actor !== "player" && coffeeNpcBudget(town, actor) < 2)
    return "This resident has not chosen another coffee from their existing spending budget.";
  const remaining = coffee.orders
    .filter(beforeReady)
    .reduce((sum, o) => sum + 30 - o.brewMinutes - o.placeMinutes, 0);
  // A deliberately conservative estimate includes setup/walking; no time guarantee.
  if (
    !acceptLaterPickup &&
    (1140 - town.minute < remaining + 34 || coffee.orders.some((o) => o.phase === "ready"))
  )
    return "This order may need a later funded session. Accept later pickup explicitly to continue.";
  return null;
}

export function coffeeActionReason(
  town: CoffeeTown,
  actor: AgentId,
  kind: CoffeeActionKind,
  targetId?: string,
  acceptLaterPickup = false,
): string | null {
  if (kind === "enable")
    return town.coffee
      ? "This town already has its coffee pilot."
      : actor !== "player"
        ? "Only the human player can open this optional pilot."
        : null;
  if (!town.coffee) return "The coffee pilot is not open.";
  if (kind === "buy") return buyReason(town, actor, acceptLaterPickup);
  if (kind === "drink") {
    const cup = town.coffee.cups.find((c) => c.id === targetId);
    return !cup || cup.owner !== actor
      ? "Only the owner can drink this cup."
      : cup.custody !== "inventory"
        ? "Collect this cup before drinking it; a consumed cup cannot be used again."
        : null;
  }
  const order = town.coffee.orders.find((o) => o.id === targetId);
  if (!order || order.buyer !== actor) return "Only the original buyer can use this coffee ticket.";
  if (kind === "cancel") {
    if (!beforeReady(order) && order.phase !== "refund-pending")
      return "Only coffee that is not ready can be refunded.";
    if (order.phase === "refund-pending" && accountBalance(town, `agent:${actor}`) > 997)
      return "The full refund remains reserved until there is room in your purse.";
    return null;
  }
  if (kind === "collect") {
    if (order.phase !== "ready") return "Your coffee is not waiting for collection.";
    const person = town.agents.find((a) => a.id === actor);
    if (town.agents.some((a) => a.id !== actor && sameTile(a.tile, COFFEE_CUSTOMER_STAND)))
      return "The pickup counter is occupied. Wait for clear space before collecting.";
    return person && sameTile(person.tile, COFFEE_CUSTOMER_STAND)
      ? null
      : "Return to the café pickup counter to collect your cup.";
  }
  return "This coffee action belongs to the work controls.";
}

/** Clear only this order's assignment; partial attendance/wages are independent. */
function relinquish(state: CoffeeState, order: CoffeeOrder) {
  for (const r of state.routines)
    if (r.orderId === order.id) {
      r.orderId = null;
      r.revision++;
    }
  order.assignedAgreementId = null;
  order.assignmentRevision++;
}

function refund(town: CoffeeTown, context: EconomyContext, order: CoffeeOrder) {
  relinquish(town.coffee!, order);
  order.phase = "refund-pending";
  order.pickupSlot = null;
  order.revision++;
  if (accountBalance(town, `agent:${order.buyer}`) <= 997) {
    const transaction = transferFunds(town, context, {
      id: `${order.id}:refund`,
      from: "till:cafe",
      to: `agent:${order.buyer}`,
      amount: 2,
      purpose: "Unready coffee refund",
      agreementId: order.id,
      holdId: order.holdId,
    });
    order.refundId = transaction.id;
    order.phase = "refunded";
  }
}

export function applyCoffeeAction(
  town: CoffeeTown,
  command: CoffeeCommand,
): EconomyResult<{ orderId?: string; cupId?: string }> {
  const invalid = validateCoffeeCommand(town, command);
  if (invalid) return failure(invalid, "coffee-authority");
  if (!["enable", "buy", "cancel", "collect", "drink"].includes(command.kind))
    return failure("Use the work controls for this action.");
  if (command.kind === "enable" && !town.economy?.work) {
    // Enabling on a fresh paused town initializes its existing funded books on
    // a disposable copy. A rejected command must not leave migration effects.
    const staged = structuredClone(town);
    const initialized = activateFundedTown(staged);
    if (!initialized.ok)
      return failure(initialized.reason ?? "The existing wage records need recovery.");
    const result = applyCoffeeAction(staged, command);
    if (result.ok) {
      const agents = staged.agents.map((next) => {
        const current = town.agents.find((a) => a.id === next.id);
        if (!current) return next;
        Object.assign(current, next);
        return current;
      });
      const favors = staged.favors.map((next) => {
        const current = town.favors.find((f) => f.id === next.id);
        if (!current) return next;
        Object.assign(current, next);
        return current;
      });
      Object.assign(town, staged, { agents, favors });
    }
    return result;
  }
  return runEconomyCommand(town, coffeeEconomyCommand(command), (draft, context) => {
    const current = draft as CoffeeTown;
    if ((current.coffee?.revision ?? 0) !== command.expectedRevision)
      failEconomy("coffee-stale", "Coffee changed. Review the current action; no money was spent.");
    const reason = coffeeActionReason(
      current,
      command.actor,
      command.kind,
      command.targetId,
      command.acceptLaterPickup,
    );
    if (reason) failEconomy("coffee-unavailable", reason);
    if (command.kind === "enable") {
      if (command.actor !== "player")
        failEconomy("coffee-authority", "Only the human player can open this optional pilot.");
      current.coffee = {
        version: 1,
        openedDay: current.day,
        enabled: true,
        nextOrder: 1,
        revision: 1,
        orders: [],
        cups: [],
        routines: [],
      };
      return {};
    }
    const state = current.coffee!;
    state.revision++;
    if (command.kind === "buy") {
      const orderId = `coffee-order:${state.nextOrder++}`;
      const order: CoffeeOrder = {
        id: orderId,
        buyer: command.actor,
        price: 2,
        saleId: `${orderId}:sale`,
        holdId: `${orderId}:refund-hold`,
        phase: "queued",
        revision: 0,
        brewMinutes: 0,
        placeMinutes: 0,
        assignedAgreementId: null,
        assignmentRevision: 0,
        pickupSlot: null,
        contributions: [],
        createdAt: coffeeTime(current),
        readyAt: null,
        refundId: null,
      };
      state.orders.push(order);
      transferFunds(current, context, {
        id: order.saleId,
        from: `agent:${order.buyer}`,
        to: "till:cafe",
        amount: 2,
        purpose: "Coffee purchase",
        agreementId: order.id,
      });
      reserveFunds(current, context, {
        id: order.holdId,
        account: "till:cafe",
        amount: 2,
        agreementId: order.id,
        purpose: "Full coffee refund until ready",
      });
      if (coffeeRecordBudgetReason(current))
        failEconomy(
          "coffee-capacity",
          "The new order would consume save space reserved for existing obligations.",
        );
      return { orderId };
    }
    if (command.kind === "drink") {
      const cup = state.cups.find((c) => c.id === command.targetId)!;
      const order = state.orders.find((o) => o.id === cup.orderId)!;
      cup.custody = "consumed";
      cup.revision++;
      order.phase = "consumed";
      order.revision++;
      return { orderId: order.id, cupId: cup.id };
    }
    const order = state.orders.find((o) => o.id === command.targetId)!;
    if (command.kind === "cancel") {
      refund(current, context, order);
      return { orderId: order.id };
    }
    const cup = state.cups.find((c) => c.orderId === order.id)!;
    cup.custody = "inventory";
    cup.revision++;
    order.phase = "collected";
    order.pickupSlot = null;
    order.revision++;
    return { orderId: order.id, cupId: cup.id };
  });
}

/** Runtime-only completion. Real validated work, station and agreement are required. */
export function completeCoffeeOrder(
  town: CoffeeTown,
  orderId: string,
  agreementId: string,
  assignmentRevision: number,
) {
  const worker = town.economy?.work?.agreements.find((a) => a.id === agreementId)?.worker;
  if (!worker) return failure("The coffee worker has no funded agreement.");
  return runEconomyCommand(
    town,
    {
      id: `coffee:ready:${orderId}:${assignmentRevision}`,
      kind: "coffee.ready",
      actor: worker,
      authority: "simulation",
      terms: { orderId, agreementId, assignmentRevision },
    },
    (draft, context) => {
      const current = draft as CoffeeTown,
        state = current.coffee;
      const order = state?.orders.find((o) => o.id === orderId);
      const agreement = current.economy?.work?.agreements.find((a) => a.id === agreementId);
      const routine = state?.routines.find((r) => r.agreementId === agreementId);
      const person = current.agents.find((a) => a.id === worker);
      if (
        !order ||
        order.phase !== "placing" ||
        order.brewMinutes !== 20 ||
        order.placeMinutes !== 10 ||
        order.assignedAgreementId !== agreementId ||
        order.assignmentRevision !== assignmentRevision ||
        order.buyer === worker ||
        routine?.status !== "active" ||
        routine.controlDay !== current.day ||
        routine.orderId !== orderId ||
        agreement?.status !== "active" ||
        !wageInterval(current, agreement) ||
        !person ||
        !sameTile(person.tile, COFFEE_PLACE_STAND) ||
        current.agents.some((a) => a.id !== worker && sameTile(a.tile, COFFEE_PLACE_STAND))
      )
        failEconomy(
          "coffee-not-ready",
          "Only the current funded worker's completed physical preparation can make this cup ready.",
        );
      const cupId = `coffee-cup:${orderId}`;
      order.phase = "ready";
      order.readyAt = coffeeTime(current) + 1;
      order.revision++;
      relinquish(state!, order);
      state!.cups.push({ id: cupId, orderId, owner: order.buyer, custody: "counter", revision: 0 });
      state!.revision++;
      releaseFunds(
        current,
        context,
        order.holdId,
        "Coffee prepared and owned at the pickup counter",
        2,
      );
      return { orderId, cupId };
    },
  );
}

/** Closure/refund retry does not invent capacity or release any staff wage. */
export function settleCoffeeRefunds(
  town: CoffeeTown,
  closeUnready: boolean | ((order: CoffeeOrder) => boolean) = false,
) {
  if (!town.coffee) return;
  for (const saved of [...town.coffee.orders]) {
    const order = town.coffee.orders.find((o) => o.id === saved.id)!;
    if (
      !(order.phase === "refund-pending" && accountBalance(town, `agent:${order.buyer}`) <= 997) &&
      !(
        beforeReady(order) &&
        (typeof closeUnready === "function" ? closeUnready(order) : closeUnready)
      )
    )
      continue;
    runEconomyCommand(
      town,
      {
        id: `coffee:refund:${order.id}:${order.revision}`,
        kind: "coffee.refund",
        actor: "kevin",
        authority: "simulation",
        terms: { orderId: order.id, revision: order.revision },
      },
      (draft, context) => {
        const current = draft as CoffeeTown;
        const pending = current.coffee!.orders.find((o) => o.id === order.id)!;
        if (!beforeReady(pending) && pending.phase !== "refund-pending")
          failEconomy("coffee-stale", "This coffee refund already resolved.");
        refund(current, context, pending);
        current.coffee!.revision++;
        return { orderId: pending.id };
      },
    );
  }
}

export function coffeeView(town: CoffeeTown, actor: AgentId = "player") {
  const state = town.coffee;
  const enabled = !!state?.enabled;
  const observer = town.agents.find((a) => a.id === actor);
  const seesCounter = !!observer && zoneAt(observer.tile.x, observer.tile.y) === "cafe";
  return {
    enabled,
    price: COFFEE_PRICE,
    revision: state?.revision ?? 0,
    status: !state
      ? "Coffee pilot not started"
      : (coffeeAdmissionReason(town) ?? "Coffee sales support café wages"),
    buyReason: coffeeActionReason(town, actor, "buy"),
    orders: structuredClone(state?.orders.filter((o) => o.buyer === actor) ?? []),
    cups: structuredClone(state?.cups.filter((c) => c.owner === actor) ?? []),
    counter:
      state?.orders
        .filter((o) => o.phase === "ready" && (seesCounter || o.buyer === actor))
        .map((o) => ({ orderId: o.id, owner: o.buyer })) ?? [],
    canEnable: coffeeActionReason(town, actor, "enable") === null,
  };
}
