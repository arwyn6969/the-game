import { AGENT_IDS } from "./types";
import type { CoffeeState } from "./coffee-types";
import type { EconomyState } from "./economy-types";

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && Number(v) >= min;
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
const actor = (v: unknown) => (AGENT_IDS as readonly unknown[]).includes(v);
const phases = [
  "queued",
  "brewing",
  "placing",
  "ready",
  "collected",
  "consumed",
  "refund-pending",
  "refunded",
];
function termsOf(receipt: { payload: string } | undefined): Record<string, unknown> {
  try {
    const payload = receipt && JSON.parse(receipt.payload);
    return record(payload?.terms) ? payload.terms : {};
  } catch {
    return {};
  }
}

/** Raw-data-safe, pure validator. It never repairs missing liabilities or imports. */
export function validateCoffee(value: unknown): string[] {
  try {
    if (!record(value)) return ["Coffee requires a town object."];
    const rawEconomy = record(value.economy) ? value.economy : undefined;
    const ledger = rawEconomy as EconomyState | undefined;
    const receipts = Array.isArray(rawEconomy?.commandReceipts) ? rawEconomy.commandReceipts : [];
    const holds = Array.isArray(rawEconomy?.holds) ? rawEconomy.holds : [];
    const transactions = Array.isArray(rawEconomy?.transactions) ? rawEconomy.transactions : [];
    const coffeeEffects =
      receipts.some(
        (r) => record(r) && typeof r.kind === "string" && r.kind.startsWith("coffee."),
      ) ||
      holds.some(
        (h) =>
          record(h) &&
          typeof h.agreementId === "string" &&
          h.agreementId.startsWith("coffee-order:"),
      ) ||
      transactions.some(
        (t) =>
          record(t) &&
          typeof t.agreementId === "string" &&
          t.agreementId.startsWith("coffee-order:"),
      );
    if (!Object.hasOwn(value, "coffee"))
      return coffeeEffects ? ["Coffee records are missing while their ledger effects remain."] : [];
    const raw = value.coffee;
    if (
      !record(raw) ||
      raw.version !== 1 ||
      !integer(raw.openedDay, 1) ||
      !integer(raw.revision) ||
      !integer(raw.nextOrder, 1) ||
      typeof raw.enabled !== "boolean" ||
      !Array.isArray(raw.orders) ||
      !Array.isArray(raw.cups) ||
      !Array.isArray(raw.routines) ||
      raw.orders.length > 50 ||
      raw.cups.length > 50 ||
      raw.routines.length > 14 ||
      !integer(value.day, 1) ||
      raw.openedDay > value.day ||
      !integer(value.minute) ||
      value.minute >= 1440
    )
      return ["Coffee state has an unsupported version or malformed bounded fields."];
    if (!ledger?.work || !Array.isArray(ledger.work.agreements))
      return ["Coffee requires audited funded work."];
    const now = (value.day - 1) * 1440 + value.minute;
    for (const o of raw.orders) {
      if (
        !record(o) ||
        !id(o.id) ||
        !/^coffee-order:[1-9][0-9]*$/.test(o.id) ||
        !actor(o.buyer) ||
        o.price !== 2 ||
        !id(o.holdId) ||
        !id(o.saleId) ||
        !phases.includes(String(o.phase)) ||
        !integer(o.revision) ||
        !integer(o.assignmentRevision) ||
        !integer(o.brewMinutes) ||
        o.brewMinutes > 20 ||
        !integer(o.placeMinutes) ||
        o.placeMinutes > 10 ||
        !Array.isArray(o.contributions) ||
        o.contributions.length > 30 ||
        !(o.assignedAgreementId === null || id(o.assignedAgreementId)) ||
        ![null, 0, 1].includes(o.pickupSlot as null) ||
        !integer(o.createdAt) ||
        o.createdAt > now ||
        !(o.readyAt === null || (integer(o.readyAt) && o.readyAt <= now + 1)) ||
        !(o.refundId === null || id(o.refundId))
      )
        return ["A coffee order has malformed fields."];
      for (const c of o.contributions)
        if (
          !record(c) ||
          !actor(c.worker) ||
          !id(c.agreementId) ||
          !["brewing", "placing"].includes(String(c.phase)) ||
          !integer(c.start) ||
          !integer(c.end) ||
          c.end <= c.start ||
          c.start < o.createdAt ||
          c.end > now + 1
        )
          return ["A coffee contribution has invalid worker, phase or time."];
    }
    for (const c of raw.cups)
      if (
        !record(c) ||
        !id(c.id) ||
        !id(c.orderId) ||
        !actor(c.owner) ||
        !integer(c.revision) ||
        !["counter", "inventory", "consumed"].includes(String(c.custody))
      )
        return ["A coffee cup has malformed fields."];
    for (const r of raw.routines)
      if (
        !record(r) ||
        !["player", "sub", "northern"].includes(String(r.worker)) ||
        !id(r.agreementId) ||
        !["active", "paused", "ended"].includes(String(r.status)) ||
        !integer(r.controlDay, 1) ||
        r.controlDay > value.day ||
        typeof r.stopAfterCurrent !== "boolean" ||
        !integer(r.revision) ||
        !(r.orderId === null || id(r.orderId)) ||
        !(r.lastInterval === null || (integer(r.lastInterval) && r.lastInterval <= now)) ||
        !(r.reason === null || (typeof r.reason === "string" && r.reason.length <= 500)) ||
        (r.drainResumeUsed !== undefined && typeof r.drainResumeUsed !== "boolean")
      )
        return ["A coffee routine has malformed fields."];
    const state = raw as CoffeeState;
    const issues: string[] = [];
    const opening = ledger.commandReceipts.filter((r) => r.kind === "coffee.enable");
    if (opening.length !== 1 || opening[0].actor !== "player" || opening[0].day !== state.openedDay)
      issues.push("The optional coffee pilot has no exact opening decision.");
    const orders = new Map(state.orders.map((o) => [o.id, o]));
    if (
      orders.size !== state.orders.length ||
      state.nextOrder !== state.orders.length + 1 ||
      state.orders.some((o, index) => o.id !== `coffee-order:${index + 1}`)
    )
      issues.push("Coffee order history or its monotonic counter is incomplete.");
    if (
      new Set(state.cups.map((c) => c.id)).size !== state.cups.length ||
      new Set(state.cups.map((c) => c.orderId)).size !== state.cups.length
    )
      issues.push("Coffee cup identities must be unique.");
    const assigned = new Set<string>();
    const slots = new Set<number>();
    const worked = new Set<string>();
    let brewing = 0;
    for (const o of state.orders) {
      const sale = ledger.transactions.find((t) => t.id === o.saleId);
      const hold = ledger.holds.find((h) => h.id === o.holdId);
      const committed = ["ready", "collected", "consumed"].includes(o.phase);
      const refunded = o.phase === "refunded";
      const refund = ledger.transactions.find((t) => t.id === o.refundId);
      const cup = state.cups.find((c) => c.orderId === o.id);
      const buying = ledger.commandReceipts.find((r) => r.id === sale?.commandId);
      if (
        o.saleId !== `${o.id}:sale` ||
        !sale ||
        sale.from !== `agent:${o.buyer}` ||
        sale.to !== "till:cafe" ||
        sale.amount !== 2 ||
        sale.agreementId !== o.id ||
        sale.holdId !== null ||
        buying?.kind !== "coffee.buy" ||
        buying.actor !== o.buyer
      )
        issues.push(`Coffee ${o.id} has no matching original purchase.`);
      if (
        o.holdId !== `${o.id}:refund-hold` ||
        !hold ||
        hold.account !== "till:cafe" ||
        hold.amount !== 2 ||
        hold.agreementId !== o.id ||
        hold.commandId !== sale?.commandId ||
        hold.remaining !== (committed || refunded ? 0 : 2)
      )
        issues.push(`Coffee ${o.id} has no exact independent refund reservation.`);
      const readyReceipt =
        hold?.releases.length === 1
          ? ledger.commandReceipts.find((r) => r.id === hold.releases[0].commandId)
          : undefined;
      const readyValue = record(readyReceipt?.value) ? readyReceipt.value : {};
      const readyTerms = termsOf(readyReceipt);
      if (
        hold &&
        (committed
          ? hold.releases.length !== 1 ||
            hold.releases[0].amount !== 2 ||
            readyReceipt?.kind !== "coffee.ready" ||
            readyValue.orderId !== o.id ||
            readyValue.cupId !== `coffee-cup:${o.id}` ||
            readyTerms.orderId !== o.id ||
            o.readyAt !== (readyReceipt.day - 1) * 1440 + readyReceipt.minute + 1 ||
            !o.contributions.some(
              (c) =>
                c.worker === readyReceipt.actor &&
                c.agreementId === readyTerms.agreementId &&
                c.phase === "placing" &&
                c.end === o.readyAt,
            )
          : hold.releases.length !== 0)
      )
        issues.push(`Coffee ${o.id} releases cash without one ready cup.`);
      if (
        refunded
          ? !refund ||
            refund.id !== `${o.id}:refund` ||
            refund.from !== "till:cafe" ||
            refund.to !== `agent:${o.buyer}` ||
            refund.amount !== 2 ||
            refund.holdId !== o.holdId ||
            refund.agreementId !== o.id
          : o.refundId !== null
      )
        issues.push(`Coffee ${o.id} has an invalid refund recipient or outcome.`);
      if (refunded || o.phase === "refund-pending") {
        const refundReceipt = ledger.commandReceipts.find(
          (r) =>
            (refund ? r.id === refund.commandId : true) &&
            record(r.value) &&
            r.value.orderId === o.id &&
            ((r.kind === "coffee.cancel" && r.actor === o.buyer && termsOf(r).targetId === o.id) ||
              (r.kind === "coffee.refund" && r.actor === "kevin" && termsOf(r).orderId === o.id)),
        );
        if (!refundReceipt)
          issues.push(`Coffee ${o.id} has no authorized cancellation or closure receipt.`);
      }
      if (
        committed
          ? !cup ||
            cup.owner !== o.buyer ||
            o.readyAt === null ||
            o.brewMinutes !== 20 ||
            o.placeMinutes !== 10
          : !!cup || o.readyAt !== null
      )
        issues.push(`Coffee ${o.id} disagrees with its unique ready cup.`);
      if (
        o.phase === "queued" &&
        (o.brewMinutes || o.placeMinutes || o.pickupSlot !== null || o.assignedAgreementId !== null)
      )
        issues.push(`Queued coffee ${o.id} already owns preparation resources.`);
      if (o.phase === "brewing") {
        brewing++;
        if (o.brewMinutes === 20)
          issues.push(`Coffee ${o.id} must leave the brewer when brewing completes.`);
      }
      if (o.phase === "placing" && o.brewMinutes !== 20)
        issues.push(`Coffee ${o.id} cannot be placed before brewing.`);
      if (o.placeMinutes && o.brewMinutes !== 20)
        issues.push(`Coffee ${o.id} has premature placement progress.`);
      if (["brewing", "placing", "ready"].includes(o.phase)) {
        if (o.pickupSlot === null || slots.has(o.pickupSlot))
          issues.push(`Coffee ${o.id} has no exclusive pickup slot.`);
        else slots.add(o.pickupSlot);
      } else if (o.pickupSlot !== null)
        issues.push(`Coffee ${o.id} retains a released pickup slot.`);
      if (o.assignedAgreementId !== null) {
        const a = ledger.work.agreements.find((w) => w.id === o.assignedAgreementId);
        const routine = state.routines.find((r) => r.agreementId === o.assignedAgreementId);
        if (
          !a ||
          a.worker === o.buyer ||
          a.kind !== "cafe-shift" ||
          a.payer !== "till:cafe" ||
          !["brewing", "placing"].includes(o.phase) ||
          routine?.orderId !== o.id ||
          assigned.has(a.id)
        )
          issues.push(`Coffee ${o.id} has invalid or overlapping worker assignment.`);
        if (a) assigned.add(a.id);
      }
      let brew = 0,
        place = 0;
      const intervals = new Set<number>();
      for (const c of o.contributions) {
        const a = ledger.work.agreements.find((w) => w.id === c.agreementId);
        if (
          !a ||
          a.worker !== c.worker ||
          a.worker === o.buyer ||
          a.kind !== "cafe-shift" ||
          a.payer !== "till:cafe" ||
          !["player", "sub", "northern"].includes(c.worker) ||
          c.start < (a.accepted.day - 1) * 1440 + a.accepted.minute
        )
          issues.push(`Coffee ${o.id} has an invalid contribution agreement.`);
        if (c.end - c.start > 30) {
          issues.push(`Coffee ${o.id} has an excessive contribution interval.`);
          continue;
        }
        for (let minute = c.start; minute < c.end; minute++) {
          const key = `${c.worker}:${minute}`;
          const attendanceKey = `${Math.floor(minute / 1440) + 1}:${minute % 1440}`;
          if (a && !a.attendance.includes(attendanceKey)) {
            const routine = state.routines.find((r) => r.agreementId === a.id);
            const people = Array.isArray(value.agents) ? value.agents : [];
            const person = people.find((p) => record(p) && p.id === c.worker);
            const tile = record(person) && record(person.tile) ? person.tile : {};
            const expectedX = c.phase === "brewing" ? 5 : 6;
            if (!(
              minute === now &&
              a.status === "active" &&
              a.eligibleMinutes < a.requiredMinutes &&
              routine?.status === "active" &&
              routine.controlDay === value.day &&
              routine.lastInterval === minute &&
              tile.x === expectedX &&
              tile.y === 18
            ))
              issues.push(`Coffee ${o.id} contribution lacks eligible attendance.`);
          }
          if (
            worked.has(key) ||
            intervals.has(minute) ||
            minute % 1440 < 960 ||
            minute % 1440 >= 1140
          )
            issues.push(`Coffee ${o.id} repeats or exceeds an eligible work interval.`);
          worked.add(key);
          intervals.add(minute);
        }
        if (c.phase === "brewing") brew += c.end - c.start;
        else place += c.end - c.start;
      }
      if (brew !== o.brewMinutes || place !== o.placeMinutes)
        issues.push(`Coffee ${o.id} progress disagrees with its contributors.`);
    }
    if (brewing > 1) issues.push("The single brewer has overlapping coffee orders.");
    for (const c of state.cups) {
      const o = orders.get(c.orderId);
      if (
        !o ||
        c.id !== `coffee-cup:${o.id}` ||
        c.owner !== o.buyer ||
        c.custody !==
          (o.phase === "ready"
            ? "counter"
            : o.phase === "collected"
              ? "inventory"
              : o.phase === "consumed"
                ? "consumed"
                : null)
      )
        issues.push("Coffee ownership, custody and order history disagree.");
      const collected = ledger.commandReceipts.filter(
        (r) =>
          r.kind === "coffee.collect" &&
          r.actor === c.owner &&
          termsOf(r).targetId === c.orderId &&
          record(r.value) &&
          r.value.orderId === c.orderId &&
          r.value.cupId === c.id,
      );
      const consumed = ledger.commandReceipts.filter(
        (r) =>
          r.kind === "coffee.drink" &&
          r.actor === c.owner &&
          termsOf(r).targetId === c.id &&
          record(r.value) &&
          r.value.orderId === c.orderId &&
          r.value.cupId === c.id,
      );
      if (
        c.revision !== (c.custody === "counter" ? 0 : c.custody === "inventory" ? 1 : 2) ||
        collected.length !== (c.custody === "counter" ? 0 : 1) ||
        consumed.length !== (c.custody === "consumed" ? 1 : 0)
      )
        issues.push("Coffee collection or consumption has no exact owner action receipt.");
    }
    const unresolved = state.orders.filter(
      (o) => !["collected", "consumed", "refunded"].includes(o.phase),
    );
    if (unresolved.length > 6) issues.push("The coffee ticket limit is exceeded.");
    for (const who of AGENT_IDS) {
      if (unresolved.filter((o) => o.buyer === who).length > 1)
        issues.push(`Resident ${who} has overlapping coffee tickets.`);
      if (
        state.cups.filter((c) => c.owner === who && c.custody === "inventory").length +
          unresolved.filter((o) => o.buyer === who && o.phase !== "refund-pending").length >
        4
      )
        issues.push(`Resident ${who} has exceeded coffee inventory capacity.`);
    }
    if (
      new Set(state.routines.map((r) => r.agreementId)).size !== state.routines.length ||
      state.routines.filter((r) => r.status === "active").length > 2 ||
      new Set(state.routines.filter((r) => r.status === "active").map((r) => r.worker)).size !==
        state.routines.filter((r) => r.status === "active").length
    )
      issues.push("Coffee routine identities or active staffing overlap.");
    for (const r of state.routines) {
      const a = ledger.work.agreements.find((w) => w.id === r.agreementId);
      const drainGrants = ledger.commandReceipts.filter(
        (receipt) =>
          ["coffee.start", "coffee.resume"].includes(receipt.kind) &&
          receipt.actor === r.worker &&
          record(receipt.value) &&
          receipt.value.agreementId === r.agreementId &&
          receipt.value.drainResumeGranted === true,
      );
      if (drainGrants.length > 1 || (r.drainResumeUsed === true) !== (drainGrants.length === 1))
        issues.push("A coffee completion-only resume disagrees with its single recorded grant.");
      if (
        !a ||
        a.worker !== r.worker ||
        a.kind !== "cafe-shift" ||
        a.payer !== "till:cafe" ||
        (r.orderId !== null && orders.get(r.orderId)?.assignedAgreementId !== r.agreementId)
      )
        issues.push("Coffee routine has no corresponding work agreement or order.");
    }
    for (const h of ledger.holds)
      if (h.agreementId.startsWith("coffee-order:") && orders.get(h.agreementId)?.holdId !== h.id)
        issues.push("An orphan coffee money hold remains.");
    for (const t of ledger.transactions)
      if (
        t.agreementId?.startsWith("coffee-order:") &&
        !state.orders.some(
          (o) => o.id === t.agreementId && (o.saleId === t.id || o.refundId === t.id),
        )
      )
        issues.push("An orphan coffee transfer remains.");
    for (const r of ledger.commandReceipts)
      if (
        r.kind === "coffee.buy" &&
        !state.orders.some(
          (o) => ledger.transactions.find((t) => t.id === o.saleId)?.commandId === r.id,
        )
      )
        issues.push("An accepted coffee order was removed from its receipt history.");
    return issues;
  } catch {
    return ["Coffee state could not be validated without repairing its records."];
  }
}
