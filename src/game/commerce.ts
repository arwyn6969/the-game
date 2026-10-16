import type { Town } from "./types";
import type { EconomyCommand, EconomyResult } from "./economy-types";
import { canonicalEconomyPayload, failEconomy, runEconomyCommand, transferFunds } from "./economy";
import { zoneAt } from "./world";

export const READING_REFRESHMENTS_PRICE = 2;
export type ReadingRefreshmentKind = "bread" | "tea";
export type ReadingRefreshmentSale = {
  eventId: string;
  kind: ReadingRefreshmentKind;
  amount: 2;
  transactionId: string;
};

const validEventId = (value: string) =>
  typeof value === "string" && /^[a-z][a-z0-9:-]{0,95}$/.test(value);
const validKind = (value: string): value is ReadingRefreshmentKind =>
  value === "bread" || value === "tea";
const recipient = (kind: ReadingRefreshmentKind) =>
  kind === "bread" ? ("till:grocery" as const) : ("till:cafe" as const);
const transactionId = (eventId: string, kind: ReadingRefreshmentKind) =>
  `sale:reading-refreshments:${eventId}:${kind}`;
function purchaseCommand(eventId: string, kind: ReadingRefreshmentKind): EconomyCommand {
  return {
    id: `commerce:reading-refreshments:${eventId}:${kind}`,
    kind: "commerce.buy-reading-refreshments",
    actor: "player",
    authority: "ui",
    terms: { eventId, kind, amount: READING_REFRESHMENTS_PRICE, to: recipient(kind) },
  };
}

/**
 * The trusted community action checks its current quote first; the atomic sale
 * also verifies the named active event and the buyer's actual venue.
 * This sale pays for that event's refreshments directly; it creates no portable
 * inventory, settles no personal tab and promises no wage or affection.
 */
export function buyReadingRefreshments(
  town: Town,
  eventId: string,
  kind: ReadingRefreshmentKind = "bread",
): EconomyResult<ReadingRefreshmentSale> {
  if (!validEventId(eventId) || !validKind(kind))
    return { ok: false, code: "invalid-event", reason: "Read the current reading event first." };
  const problems = validateReadingPurchases(town, eventId);
  if (problems.length) return { ok: false, code: "invalid-purchase", reason: problems.join(" ") };
  return runEconomyCommand<ReadingRefreshmentSale>(
    town,
    purchaseCommand(eventId, kind),
    (draft, context) => {
      const savedProject = draft.economy?.projects?.library;
      const library =
        savedProject && typeof savedProject === "object" && !Array.isArray(savedProject)
          ? savedProject
          : null;
      const evening = library?.evening;
      const player = draft.agents.find((agent) => agent.id === "player");
      if (
        !evening ||
        typeof evening !== "object" ||
        Array.isArray(evening) ||
        evening.version !== 1 ||
        !Number.isSafeInteger(library?.started) ||
        Number(library?.started) < 1 ||
        eventId !== `library-evening:${library?.started}:1` ||
        evening.eventId !== eventId ||
        !["routing", "ready"].includes(String(evening.status)) ||
        (evening.choice !== "park" && evening.choice !== "library") ||
        !player ||
        zoneAt(player.tile.x, player.tile.y) !== evening.choice
      )
        failEconomy(
          "reading-unavailable",
          "Bring refreshments to the current reading's venue before it ends.",
        );
      const payment = transferFunds(draft, context, {
        id: transactionId(eventId, kind),
        from: "agent:player",
        to: recipient(kind),
        amount: READING_REFRESHMENTS_PRICE,
        purpose: `${kind === "bread" ? "Bread" : "Tea"} refreshments for the named community reading`,
        agreementId: eventId,
      });
      return { eventId, kind, amount: READING_REFRESHMENTS_PRICE, transactionId: payment.id };
    },
  );
}

/** A paid event needs its exact UI receipt and matching actual cash transfer. */
export function readingRefreshmentReceipt(
  town: Town,
  eventId: string,
  kind: ReadingRefreshmentKind = "bread",
): ReadingRefreshmentSale | null {
  if (!validEventId(eventId) || !validKind(kind)) return null;
  const command = purchaseCommand(eventId, kind);
  const receipt = town.economy?.commandReceipts.find((item) => item.id === command.id);
  const payment = town.economy?.transactions.find(
    (item) => item.id === transactionId(eventId, kind),
  );
  if (
    !receipt ||
    !payment ||
    receipt.kind !== command.kind ||
    receipt.actor !== "player" ||
    receipt.authority !== "ui" ||
    receipt.payload !== canonicalEconomyPayload(command) ||
    receipt.transactionIds.length !== 1 ||
    receipt.transactionIds[0] !== payment.id ||
    payment.kind !== "transfer" ||
    payment.commandId !== command.id ||
    payment.actor !== "player" ||
    payment.authority !== "ui" ||
    payment.from !== "agent:player" ||
    payment.to !== recipient(kind) ||
    payment.amount !== READING_REFRESHMENTS_PRICE ||
    payment.agreementId !== eventId ||
    payment.holdId !== null ||
    payment.reversalOf !== undefined ||
    payment.day !== receipt.day ||
    payment.minute !== receipt.minute
  )
    return null;
  const value: ReadingRefreshmentSale = {
    eventId,
    kind,
    amount: READING_REFRESHMENTS_PRICE,
    transactionId: payment.id,
  };
  return canonicalEconomyPayload(receipt.value) === canonicalEconomyPayload(value) ? value : null;
}

/** A malformed recorded sale is recovery data, never an unpaid item to sell again. */
export function validateReadingPurchases(town: Town, eventId: string): string[] {
  return (["bread", "tea"] as const).flatMap((kind) => {
    const command = purchaseCommand(eventId, kind);
    const recorded =
      town.economy?.commandReceipts.some((item) => item.id === command.id) ||
      town.economy?.transactions.some((item) => item.id === transactionId(eventId, kind));
    return recorded && !readingRefreshmentReceipt(town, eventId, kind)
      ? [
          "The reading's recorded refreshment sale has a malformed cash-sale receipt; preserve the original save.",
        ]
      : [];
  });
}
