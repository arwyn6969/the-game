import { AGENT_IDS, type AgentId } from "./types";
import type { FundedTown as Town } from "./economy-types";
import { validateFundedWork } from "./funded-work";
import type {
  AccountId,
  EconomyCommand,
  EconomyContext,
  EconomyQuote,
  EconomyResult,
  EconomyState,
  GameTime,
  JSONValue,
  LedgerTransaction,
  MoneyHold,
  QuoteEligibility,
} from "./economy-types";

export type * from "./economy-types";

export class EconomyError extends Error {
  readonly code: string;

  constructor(code: string, reason: string) {
    super(reason);
    this.name = "EconomyError";
    this.code = code;
  }
}

export function failEconomy(code: string, reason: string): never {
  throw new EconomyError(code, reason);
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function label(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

function cash(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function positiveCash(value: unknown): value is number {
  return cash(value) && value > 0;
}

function agentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}

function accountId(value: unknown): value is AccountId {
  return (
    typeof value === "string" &&
    (value === "till:cafe" ||
      value === "till:grocery" ||
      (value.startsWith("agent:") && agentId(value.slice(6))) ||
      /^project:[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value))
  );
}

function gameTime(value: unknown): value is GameTime {
  return (
    object(value) && cash(value.day) && value.day >= 1 && cash(value.minute) && value.minute < 1440
  );
}

function timestamp(value: GameTime): number {
  return (value.day - 1) * 1440 + value.minute;
}

function timeOf(town: Town): GameTime {
  return { day: town.day, minute: town.minute };
}

function jsonValue(value: unknown, ancestors = new Set<object>(), depth = 0): value is JSONValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 50 || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => jsonValue(entry, ancestors, depth + 1))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((entry) => jsonValue(entry, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
}

/** Stable payload binding: object key order cannot defeat retry detection. */
export function canonicalEconomyPayload(value: unknown): string {
  if (!jsonValue(value))
    failEconomy("invalid-payload", "The command must contain finite, serializable terms.");
  function ordered(entry: JSONValue): JSONValue {
    if (Array.isArray(entry)) return entry.map(ordered);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, ordered(entry[key])]),
      );
    }
    return entry;
  }
  return JSON.stringify(ordered(value));
}

function commandPayload(command: EconomyCommand): string {
  return canonicalEconomyPayload({
    id: command.id,
    kind: command.kind,
    actor: command.actor,
    authority: command.authority,
    terms: command.terms,
    ...(command.expectedRevision === undefined
      ? {}
      : { expectedRevision: command.expectedRevision }),
    ...(command.quote === undefined ? {} : { quote: command.quote }),
  });
}

function validQuote(value: unknown): value is EconomyQuote {
  return (
    object(value) &&
    jsonValue(value) &&
    label(value.id) &&
    label(value.kind) &&
    agentId(value.actor) &&
    jsonValue(value.terms) &&
    cash(value.revision) &&
    gameTime(value.issuedAt) &&
    gameTime(value.expiresAt) &&
    timestamp(value.expiresAt) >= timestamp(value.issuedAt) &&
    object(value.eligibility) &&
    typeof value.eligibility.eligible === "boolean" &&
    label(value.eligibility.key) &&
    (value.eligibility.reason === undefined || label(value.eligibility.reason))
  );
}

function commandAuthority(command: EconomyCommand): void {
  if (
    !object(command) ||
    !label(command.id) ||
    !label(command.kind) ||
    !agentId(command.actor) ||
    !jsonValue(command.terms)
  ) {
    failEconomy("invalid-command", "The command's identity, actor, or terms are invalid.");
  }
  if (command.authority === "model")
    failEconomy("unauthorized", "Model proposals cannot authorize financial commands.");
  if (command.authority !== "ui" && command.authority !== "simulation")
    failEconomy("unauthorized", "A trusted command authority is required.");
  if (command.authority === "ui" && command.actor !== "player")
    failEconomy("wrong-actor", "The player controls only their own financial choices.");
  if (command.expectedRevision !== undefined && !cash(command.expectedRevision))
    failEconomy("invalid-command", "The command revision is invalid.");
  if (command.quote !== undefined && !validQuote(command.quote))
    failEconomy("invalid-quote", "The quoted offer is invalid.");
}

/** Personal purses and business tills are authoritative; only custody has a new balance. */
export function accountBalance(town: Town, id: AccountId): number {
  if (!accountId(id)) failEconomy("unknown-account", `Unknown financial account ${String(id)}.`);
  let balance: unknown;
  if (id.startsWith("agent:"))
    balance = town.agents.find((agent) => agent.id === id.slice(6))?.money;
  else if (id === "till:cafe") balance = town.tills?.cafe;
  else if (id === "till:grocery") balance = town.tills?.grocery;
  else balance = town.economy?.projectBalances[id as `project:${string}`];
  if (!cash(balance))
    failEconomy("invalid-balance", `Account ${id} is missing or has invalid cash.`);
  return balance;
}

function writeBalance(town: Town, id: AccountId, amount: number): void {
  if (!cash(amount))
    failEconomy("invalid-balance", "A financial balance must be a nonnegative safe integer.");
  if (id.startsWith("agent:"))
    town.agents.find((agent) => agent.id === id.slice(6))!.money = amount;
  else if (id === "till:cafe") town.tills.cafe = amount;
  else if (id === "till:grocery") town.tills.grocery = amount;
  else requireEconomy(town).projectBalances[id as `project:${string}`] = amount;
}

export function requireEconomy(town: Town): EconomyState {
  if (!town.economy)
    failEconomy("not-initialized", "Funded accounts have not been initialized for this town.");
  return town.economy;
}

/** Explicit S1 opt-in only: ordinary gameplay continues to use the released economy. */
export function initializeEconomy(town: Town): EconomyState {
  if (Object.hasOwn(town, "economy")) {
    const issues = auditEconomy(town);
    if (issues.length) failEconomy("invalid-economy", issues.join(" "));
    return requireEconomy(town);
  }
  if (!gameTime(timeOf(town)))
    failEconomy("invalid-time", "Opening balances need a valid game day and minute.");
  const opening: Record<string, number> = {};
  for (const id of AGENT_IDS) {
    if (town.agents.filter((agent) => agent.id === id).length !== 1)
      failEconomy("invalid-account", `Account agent:${id} needs exactly one resident.`);
    opening[`agent:${id}`] = accountBalance(town, `agent:${id}`);
  }
  opening["till:cafe"] = accountBalance(town, "till:cafe");
  opening["till:grocery"] = accountBalance(town, "till:grocery");
  if (!Number.isSafeInteger(Object.values(opening).reduce((sum, amount) => sum + amount, 0)))
    failEconomy("invalid-balance", "The opening total exceeds safe integer accounting.");
  const economy: EconomyState = {
    schemaVersion: 1,
    initializedAt: timeOf(town),
    openingBalances: Object.freeze(opening) as Readonly<Record<AccountId, number>>,
    projectBalances: {},
    transactions: [],
    holds: [],
    quotes: [],
    commandReceipts: [],
    revision: 0,
  };
  town.economy = economy;
  return economy;
}

export function availableFunds(town: Town, id: AccountId): number {
  const economy = requireEconomy(town);
  return (
    accountBalance(town, id) -
    economy.holds.reduce((sum, hold) => sum + (hold.account === id ? hold.remaining : 0), 0)
  );
}

export function accountSummary(town: Town, id: AccountId) {
  const economy = requireEconomy(town);
  const issues = auditEconomy(town);
  if (issues.length) failEconomy("invalid-economy", issues.join(" "));
  return structuredClone({
    id,
    balance: accountBalance(town, id),
    available: availableFunds(town, id),
    openingBalance: economy.openingBalances[id],
    holds: economy.holds.filter((hold) => hold.account === id),
    transactions: economy.transactions.filter(
      (transaction) => transaction.from === id || transaction.to === id,
    ),
  });
}

/** Reconstructs every account as well as the total, so old-runtime transfers cannot hide. */
export function auditEconomy(town: Town): string[] {
  if (!Object.hasOwn(town, "economy")) return [];
  const value: unknown = town.economy;
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !gameTime(value.initializedAt) ||
    !cash(value.revision) ||
    !object(value.openingBalances) ||
    !object(value.projectBalances) ||
    !Array.isArray(value.transactions) ||
    !Array.isArray(value.holds) ||
    !Array.isArray(value.commandReceipts) ||
    !Array.isArray(value.quotes)
  ) {
    return [
      "The funded-account extension has an invalid structure; keep the raw save for recovery.",
    ];
  }
  const economy = value as unknown as EconomyState;
  const issues: string[] = [];
  const now = timeOf(town);
  if (!gameTime(now)) issues.push("Funded accounts require a valid game date.");
  const nowStamp = gameTime(now) ? timestamp(now) : Infinity;
  if (timestamp(economy.initializedAt) > nowStamp)
    issues.push("Opening balances are dated after the town.");
  const expected: Record<string, number> = {};
  const known = new Set<string>([
    ...AGENT_IDS.map((id) => `agent:${id}`),
    "till:cafe",
    "till:grocery",
  ]);
  for (const [id, balance] of Object.entries(economy.projectBalances)) {
    if (!accountId(id) || !id.startsWith("project:") || !cash(balance))
      issues.push(`Invalid project custody account ${id}.`);
    else known.add(id);
  }
  for (const [id, balance] of Object.entries(economy.openingBalances)) {
    if (!accountId(id) || !known.has(id) || !cash(balance))
      issues.push(`Invalid opening balance for ${id}.`);
    else {
      expected[id] = balance;
      if (id.startsWith("project:") && balance !== 0)
        issues.push(`Custody account ${id} must begin empty and receive recorded contributions.`);
    }
  }
  for (const id of known)
    if (!Object.hasOwn(expected, id)) issues.push(`Account ${id} has no opening balance.`);
  for (const id of AGENT_IDS)
    if (!Array.isArray(town.agents) || town.agents.filter((agent) => agent.id === id).length !== 1)
      issues.push(`Account agent:${id} does not resolve to one resident.`);
  const receipts = new Map<string, EconomyState["commandReceipts"][number]>();
  let revision = 0;
  for (const raw of economy.commandReceipts) {
    if (
      !object(raw) ||
      !label(raw.id) ||
      !label(raw.kind) ||
      !agentId(raw.actor) ||
      (raw.authority !== "ui" && raw.authority !== "simulation") ||
      typeof raw.payload !== "string" ||
      !jsonValue(raw.value) ||
      !cash(raw.revisionBefore) ||
      !cash(raw.revisionAfter) ||
      !gameTime(raw) ||
      !Array.isArray(raw.transactionIds) ||
      !raw.transactionIds.every(label) ||
      !Array.isArray(raw.holdIds) ||
      !raw.holdIds.every(label) ||
      !Array.isArray(raw.releaseIds) ||
      !raw.releaseIds.every(label)
    ) {
      issues.push("A persisted command receipt is malformed.");
      continue;
    }
    const receipt = raw as EconomyState["commandReceipts"][number];
    if (receipts.has(receipt.id)) issues.push(`Duplicate command receipt ${receipt.id}.`);
    if (receipt.authority === "ui" && receipt.actor !== "player")
      issues.push(`Receipt ${receipt.id} uses the player's authority for another resident.`);
    if (receipt.revisionBefore !== revision || receipt.revisionAfter !== revision + 1)
      issues.push(`Receipt ${receipt.id} breaks the command revision history.`);
    revision = receipt.revisionAfter;
    if (timestamp(receipt) < timestamp(economy.initializedAt) || timestamp(receipt) > nowStamp)
      issues.push(`Receipt ${receipt.id} has invalid game time.`);
    try {
      const decoded: unknown = JSON.parse(receipt.payload);
      if (
        !object(decoded) ||
        canonicalEconomyPayload(decoded) !== receipt.payload ||
        decoded.id !== receipt.id ||
        decoded.kind !== receipt.kind ||
        decoded.actor !== receipt.actor ||
        decoded.authority !== receipt.authority ||
        !jsonValue(decoded.terms)
      ) {
        issues.push(`Receipt ${receipt.id} does not bind its command payload.`);
      } else commandAuthority(decoded as EconomyCommand);
    } catch {
      issues.push(`Receipt ${receipt.id} has an invalid command payload.`);
    }
    for (const ids of [receipt.transactionIds, receipt.holdIds, receipt.releaseIds])
      if (new Set(ids).size !== ids.length)
        issues.push(`Receipt ${receipt.id} repeats an effect ID.`);
    receipts.set(receipt.id, receipt);
  }
  if (economy.revision !== revision)
    issues.push("The funded-account revision disagrees with its command receipts.");
  const transactions = new Map<string, LedgerTransaction>();
  let issuance = 0;
  let retirement = 0;
  for (const raw of economy.transactions) {
    if (
      !object(raw) ||
      !label(raw.id) ||
      !["transfer", "issuance", "retirement"].includes(String(raw.kind)) ||
      !positiveCash(raw.amount) ||
      !label(raw.purpose) ||
      !(raw.agreementId === null || label(raw.agreementId)) ||
      (raw.authority !== "ui" && raw.authority !== "simulation") ||
      !agentId(raw.actor) ||
      !label(raw.commandId) ||
      !gameTime(raw) ||
      !(raw.holdId === null || label(raw.holdId)) ||
      !(
        raw.authorization === null ||
        raw.authorization === "authored-event" ||
        raw.authorization === "correction"
      ) ||
      !(raw.reason === null || label(raw.reason)) ||
      !(raw.reversalOf === undefined || label(raw.reversalOf))
    ) {
      issues.push("A ledger transaction is malformed.");
      continue;
    }
    const transaction = raw as LedgerTransaction;
    if (transactions.has(transaction.id)) issues.push(`Duplicate transaction ${transaction.id}.`);
    transactions.set(transaction.id, transaction);
    const sourceValid = transaction.from !== null && known.has(transaction.from);
    const recipientValid = transaction.to !== null && known.has(transaction.to);
    if (
      (transaction.kind === "transfer" &&
        (!sourceValid ||
          !recipientValid ||
          transaction.from === transaction.to ||
          transaction.authorization !== null ||
          (transaction.reversalOf === undefined && transaction.reason !== null))) ||
      (transaction.kind === "issuance" &&
        (transaction.from !== null || !recipientValid || transaction.holdId !== null)) ||
      (transaction.kind === "retirement" &&
        (!sourceValid || transaction.to !== null || transaction.holdId !== null))
    ) {
      issues.push(`Transaction ${transaction.id} has invalid account endpoints or event fields.`);
      continue;
    }
    const receipt = receipts.get(transaction.commandId);
    if (
      !receipt ||
      !receipt.transactionIds.includes(transaction.id) ||
      receipt.actor !== transaction.actor ||
      receipt.authority !== transaction.authority
    )
      issues.push(`Transaction ${transaction.id} has no matching authorized command receipt.`);
    if (
      transaction.kind !== "transfer" &&
      (transaction.authority !== "simulation" ||
        !transaction.authorization ||
        !transaction.reason ||
        receipt?.kind !== `money.${transaction.kind === "issuance" ? "issue" : "retire"}`)
    )
      issues.push(`Transaction ${transaction.id} lacks explicit issuance or retirement authority.`);
    if (transaction.reversalOf !== undefined) {
      const original = transactions.get(transaction.reversalOf);
      if (
        transaction.kind !== "transfer" ||
        transaction.authority !== "simulation" ||
        receipt?.kind !== "money.reverse" ||
        !transaction.reason ||
        transaction.holdId !== null ||
        !original ||
        original.id === transaction.id ||
        original.kind !== "transfer" ||
        original.reversalOf !== undefined ||
        original.from !== transaction.to ||
        original.to !== transaction.from ||
        original.amount !== transaction.amount ||
        original.actor !== transaction.actor ||
        [...transactions.values()].filter((entry) => entry.reversalOf === transaction.reversalOf)
          .length !== 1
      )
        issues.push(
          `Transaction ${transaction.id} is not an authorized reversal of its original transfer.`,
        );
    }
    if (
      timestamp(transaction) < timestamp(economy.initializedAt) ||
      timestamp(transaction) > nowStamp
    )
      issues.push(`Transaction ${transaction.id} has invalid game time.`);
    if (sourceValid) expected[transaction.from!] -= transaction.amount;
    if (recipientValid) expected[transaction.to!] += transaction.amount;
    if (transaction.kind === "issuance") issuance += transaction.amount;
    if (transaction.kind === "retirement") retirement += transaction.amount;
    for (const id of [transaction.from, transaction.to])
      if (id !== null && !cash(expected[id]))
        issues.push(
          `Transaction ${transaction.id} leaves account ${id} outside safe nonnegative cash.`,
        );
  }
  const holds = new Map<string, MoneyHold>();
  const releases = new Map<string, MoneyHold["releases"][number]>();
  const heldTotals: Record<string, number> = {};
  for (const raw of economy.holds) {
    if (
      !object(raw) ||
      !label(raw.id) ||
      !accountId(raw.account) ||
      !known.has(raw.account) ||
      !positiveCash(raw.amount) ||
      !cash(raw.remaining) ||
      !label(raw.agreementId) ||
      !label(raw.purpose) ||
      !label(raw.commandId) ||
      !gameTime(raw.createdAt) ||
      !Array.isArray(raw.releases)
    ) {
      issues.push("A money hold is malformed.");
      continue;
    }
    const hold = raw as MoneyHold;
    if (holds.has(hold.id)) issues.push(`Duplicate hold ${hold.id}.`);
    holds.set(hold.id, hold);
    if (!receipts.get(hold.commandId)?.holdIds.includes(hold.id))
      issues.push(`Hold ${hold.id} has no accepting command receipt.`);
    if (
      timestamp(hold.createdAt) < timestamp(economy.initializedAt) ||
      timestamp(hold.createdAt) > nowStamp
    )
      issues.push(`Hold ${hold.id} has invalid game time.`);
    let released = 0;
    for (const rawRelease of hold.releases) {
      if (
        !object(rawRelease) ||
        !label(rawRelease.id) ||
        !positiveCash(rawRelease.amount) ||
        !label(rawRelease.reason) ||
        !label(rawRelease.commandId) ||
        !gameTime(rawRelease)
      ) {
        issues.push(`Hold ${hold.id} has a malformed release.`);
        continue;
      }
      const release = rawRelease as MoneyHold["releases"][number];
      if (releases.has(release.id)) issues.push(`Duplicate release ${release.id}.`);
      releases.set(release.id, release);
      if (!receipts.get(release.commandId)?.releaseIds.includes(release.id))
        issues.push(`Release ${release.id} has no authorized command receipt.`);
      if (timestamp(release) < timestamp(hold.createdAt) || timestamp(release) > nowStamp)
        issues.push(`Release ${release.id} has invalid game time.`);
      released += release.amount;
    }
    const settled = [...transactions.values()].reduce(
      (sum, transaction) => sum + (transaction.holdId === hold.id ? transaction.amount : 0),
      0,
    );
    if (!cash(released) || !cash(settled) || hold.remaining !== hold.amount - released - settled)
      issues.push(`Hold ${hold.id} disagrees with its releases and settlements.`);
    heldTotals[hold.account] = (heldTotals[hold.account] ?? 0) + hold.remaining;
  }
  for (const transaction of transactions.values()) {
    if (transaction.holdId !== null) {
      const hold = holds.get(transaction.holdId);
      if (
        !hold ||
        hold.account !== transaction.from ||
        hold.agreementId !== transaction.agreementId ||
        transaction.kind !== "transfer" ||
        timestamp(transaction) < timestamp(hold.createdAt)
      )
        issues.push(`Transaction ${transaction.id} has no matching reserved agreement.`);
    }
  }
  for (const receipt of receipts.values()) {
    if (
      receipt.transactionIds.some((id) => transactions.get(id)?.commandId !== receipt.id) ||
      receipt.holdIds.some((id) => holds.get(id)?.commandId !== receipt.id) ||
      receipt.releaseIds.some((id) => releases.get(id)?.commandId !== receipt.id)
    )
      issues.push(`Receipt ${receipt.id} refers to missing or foreign effects.`);
  }
  // Final totals alone could conceal spending an active hold and releasing it
  // in a later command. Rebuild reservations at every committed boundary too.
  const historicalBalances = { ...economy.openingBalances };
  const historicalHolds = new Map<string, number>();
  for (const receipt of receipts.values()) {
    for (const id of receipt.holdIds) {
      const hold = holds.get(id);
      if (hold) historicalHolds.set(id, hold.amount);
    }
    for (const id of receipt.transactionIds) {
      const transaction = transactions.get(id);
      if (!transaction) continue;
      if (transaction.from !== null) historicalBalances[transaction.from] -= transaction.amount;
      if (transaction.to !== null) historicalBalances[transaction.to] += transaction.amount;
      if (transaction.holdId !== null) {
        const reserved = historicalHolds.get(transaction.holdId);
        if (reserved === undefined || reserved < transaction.amount)
          issues.push(
            `Transaction ${id} spends a reservation before it was funded or beyond its remaining amount.`,
          );
        else historicalHolds.set(transaction.holdId, reserved - transaction.amount);
      }
    }
    for (const id of receipt.releaseIds) {
      const release = releases.get(id);
      const hold = [...holds.values()].find((entry) =>
        entry.releases.some((entryRelease) => entryRelease.id === id),
      );
      const reserved = hold ? historicalHolds.get(hold.id) : undefined;
      if (!release || !hold || reserved === undefined || reserved < release.amount)
        issues.push(`Release ${id} exceeds its reservation at the command's commit.`);
      else historicalHolds.set(hold.id, reserved - release.amount);
    }
    const reservedByAccount: Record<string, number> = {};
    for (const [id, amount] of historicalHolds) {
      const hold = holds.get(id)!;
      reservedByAccount[hold.account] = (reservedByAccount[hold.account] ?? 0) + amount;
    }
    for (const [id, amount] of Object.entries(reservedByAccount))
      if (!cash(amount) || amount > historicalBalances[id as AccountId])
        issues.push(`Command ${receipt.id} leaves active reservations unfunded in account ${id}.`);
  }
  let closingTotal = 0;
  for (const id of known) {
    try {
      const actual = accountBalance(town, id as AccountId);
      closingTotal += actual;
      if (actual !== expected[id])
        issues.push(
          `Account ${id} does not reconcile: recorded ${String(expected[id])}, actual ${actual}. An older runtime or edit may have changed this balance.`,
        );
      if (!cash(heldTotals[id] ?? 0) || (heldTotals[id] ?? 0) > actual)
        issues.push(`Active holds exceed account ${id}'s cash.`);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : `Invalid cash for ${id}.`);
    }
  }
  const openingTotal = Object.values(economy.openingBalances).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  if (
    !cash(openingTotal) ||
    !cash(closingTotal) ||
    !cash(issuance) ||
    !cash(retirement) ||
    closingTotal !== openingTotal + issuance - retirement
  )
    issues.push(
      "The closing money total differs from opening balances plus issuance minus retirement.",
    );
  const quoteIds = new Set<string>();
  for (const quote of economy.quotes) {
    if (!validQuote(quote)) {
      issues.push("An issued economy quote is malformed.");
      continue;
    }
    if (quoteIds.has(quote.id)) issues.push(`Duplicate quote ${quote.id}.`);
    quoteIds.add(quote.id);
    if (
      quote.revision > economy.revision ||
      timestamp(quote.issuedAt) < timestamp(economy.initializedAt) ||
      timestamp(quote.issuedAt) > nowStamp
    )
      issues.push(`Quote ${quote.id} has an invalid revision or issue time.`);
  }
  if (economy.projects !== undefined && (!object(economy.projects) || !jsonValue(economy.projects)))
    issues.push("The eventual project state is malformed.");
  if (
    economy.events !== undefined &&
    (!Array.isArray(economy.events) || !jsonValue(economy.events))
  )
    issues.push("The eventual public-event state is malformed.");
  if (economy.work !== undefined) {
    try {
      issues.push(...validateFundedWork(town, economy));
    } catch {
      issues.push("The funded-work state is malformed; keep the raw save for recovery.");
    }
  }
  return issues;
}

export function createEconomyQuote(
  town: Town,
  options: Pick<EconomyQuote, "id" | "kind" | "actor" | "terms" | "expiresAt" | "eligibility">,
): EconomyQuote {
  const economy = requireEconomy(town);
  const issues = auditEconomy(town);
  if (issues.length) failEconomy("invalid-economy", issues.join(" "));
  const eligibility: QuoteEligibility = {
    eligible: options.eligibility.eligible,
    key: options.eligibility.key,
    ...(options.eligibility.reason === undefined ? {} : { reason: options.eligibility.reason }),
  };
  const quote: EconomyQuote = structuredClone({
    ...options,
    eligibility,
    revision: economy.revision,
    issuedAt: timeOf(town),
  });
  if (!validQuote(quote))
    failEconomy("invalid-quote", "The quote has invalid actor, terms, eligibility, or expiry.");
  const existing = economy.quotes.find((saved) => saved.id === quote.id);
  if (existing) {
    if (canonicalEconomyPayload(existing) !== canonicalEconomyPayload(quote))
      failEconomy("quote-conflict", "That quote ID already belongs to different terms.");
    return structuredClone(existing);
  }
  economy.quotes.push(structuredClone(quote));
  return quote;
}

/** Call from action validation with current eligibility, after checking its other terms. */
export function assertQuoteEligibility(quote: EconomyQuote, current: QuoteEligibility): void {
  if (!current.eligible)
    failEconomy(
      "ineligible",
      current.reason ?? "This actor is no longer eligible for the quoted work.",
    );
  if (!quote.eligibility.eligible || quote.eligibility.key !== current.key)
    failEconomy("stale-quote", "Eligibility changed; read the current offer before accepting.");
}

function validateCommandQuote(town: Town, command: EconomyCommand): void {
  const economy = requireEconomy(town);
  if (command.expectedRevision !== undefined && command.expectedRevision !== economy.revision)
    failEconomy("stale-command", "The financial terms changed; read the current offer again.");
  if (!command.quote) return;
  const quote = command.quote;
  const issued = economy.quotes.find((saved) => saved.id === quote.id);
  if (!issued || canonicalEconomyPayload(issued) !== canonicalEconomyPayload(quote))
    failEconomy("invalid-quote", "This offer does not match the town's issued terms.");
  if (quote.actor !== command.actor || quote.kind !== command.kind)
    failEconomy("wrong-actor", "This quoted offer belongs to a different actor or action.");
  if (canonicalEconomyPayload(quote.terms) !== canonicalEconomyPayload(command.terms))
    failEconomy("changed-terms", "The command differs from the quoted financial terms.");
  if (quote.revision !== economy.revision)
    failEconomy("stale-quote", "The town's financial terms changed after this quote.");
  const now = timestamp(timeOf(town));
  if (now < timestamp(quote.issuedAt) || now > timestamp(quote.expiresAt))
    failEconomy("expired-quote", "This offer has expired; read the current terms again.");
  if (!quote.eligibility.eligible)
    failEconomy("ineligible", quote.eligibility.reason ?? "This offer is currently unavailable.");
}

function freezeJSON<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freezeJSON(nested);
    Object.freeze(value);
  }
  return value;
}

type ActiveCommand = {
  town: Town;
  transactions: Map<string, string>;
  holds: Map<string, string>;
  releases: Map<string, string>;
  projectAccounts: Set<string>;
};
const activeCommands = new WeakMap<EconomyContext, ActiveCommand>();

function immutableHold(hold: MoneyHold): object {
  const { remaining: _remaining, releases: _releases, ...metadata } = hold;
  return metadata;
}

function unchangedPrefix(before: unknown[], after: unknown[], record: string): void {
  if (
    after.length < before.length ||
    before.some(
      (entry, index) => canonicalEconomyPayload(entry) !== canonicalEconomyPayload(after[index]),
    )
  ) {
    failEconomy(
      "history-rewrite",
      `Existing ${record} are immutable; append an authorized correction with its reason.`,
    );
  }
}

function assertAppendOnly(before: EconomyState, after: EconomyState, active: ActiveCommand): void {
  if (
    before.schemaVersion !== after.schemaVersion ||
    canonicalEconomyPayload(before.initializedAt) !==
      canonicalEconomyPayload(after.initializedAt) ||
    before.revision !== after.revision
  )
    failEconomy(
      "history-rewrite",
      "The command cannot rewrite the accounting origin or its revision.",
    );
  for (const [id, amount] of Object.entries(before.openingBalances))
    if (after.openingBalances[id as AccountId] !== amount)
      failEconomy("history-rewrite", "Opening balances are immutable migration snapshots.");
  for (const [id, amount] of Object.entries(after.openingBalances))
    if (
      !Object.hasOwn(before.openingBalances, id) &&
      (amount !== 0 || !active.projectAccounts.has(id))
    )
      failEconomy(
        "history-rewrite",
        "Only an explicitly created zero-balance custody account can extend opening balances.",
      );
  for (const id of Object.keys(before.projectBalances))
    if (!Object.hasOwn(after.projectBalances, id))
      failEconomy("history-rewrite", "A recorded custody account cannot be removed.");
  unchangedPrefix(before.transactions, after.transactions, "ledger transactions");
  unchangedPrefix(before.commandReceipts, after.commandReceipts, "command receipts");
  unchangedPrefix(before.quotes, after.quotes, "issued quotes");
  if (after.holds.length < before.holds.length)
    failEconomy("history-rewrite", "Reservations must retain their original record.");
  for (let index = 0; index < before.holds.length; index++) {
    const original = before.holds[index];
    const updated = after.holds[index];
    if (
      canonicalEconomyPayload(immutableHold(original)) !==
      canonicalEconomyPayload(immutableHold(updated))
    )
      failEconomy("history-rewrite", "A hold's original agreement and amount cannot be rewritten.");
    unchangedPrefix(original.releases, updated.releases, "reservation releases");
  }
  const newTransactions = after.transactions.slice(before.transactions.length);
  const newHolds = after.holds.slice(before.holds.length);
  const priorReleases = new Set(
    before.holds.flatMap((hold) => hold.releases.map((release) => release.id)),
  );
  const newReleases = after.holds.flatMap((hold) =>
    hold.releases.filter((release) => !priorReleases.has(release.id)),
  );
  if (
    newTransactions.length !== active.transactions.size ||
    newTransactions.some(
      (transaction) =>
        active.transactions.get(transaction.id) !== canonicalEconomyPayload(transaction),
    ) ||
    newHolds.length !== active.holds.size ||
    newHolds.some(
      (hold) => active.holds.get(hold.id) !== canonicalEconomyPayload(immutableHold(hold)),
    ) ||
    newReleases.length !== active.releases.size ||
    newReleases.some(
      (release) => active.releases.get(release.id) !== canonicalEconomyPayload(release),
    )
  )
    failEconomy(
      "unauthorized-effect",
      "Ledger effects must use the active command's financial helpers.",
    );
  if (before.work) {
    if (!after.work)
      failEconomy(
        "history-rewrite",
        "Funded work and its labelled legacy claims cannot be removed.",
      );
    unchangedPrefix(before.work.evidence, after.work.evidence, "work evidence");
    unchangedPrefix(before.work.receipts, after.work.receipts, "earned work receipts");
    for (const offer of before.work.offers) {
      const updated = after.work.offers.find((entry) => entry.id === offer.id);
      if (!updated) failEconomy("history-rewrite", "Original funded offers must remain recorded.");
      const { status: _oldStatus, ...oldTerms } = offer;
      const { status: _newStatus, ...newTerms } = updated;
      if (
        canonicalEconomyPayload(oldTerms) !== canonicalEconomyPayload(newTerms) ||
        (offer.status !== "open" && offer.status !== updated.status)
      )
        failEconomy(
          "history-rewrite",
          "The worker's original offered terms cannot be rewritten or reopened.",
        );
    }
    for (const agreement of before.work.agreements) {
      const updated = after.work.agreements.find((entry) => entry.id === agreement.id);
      if (!updated)
        failEconomy("history-rewrite", "Accepted work agreements must remain recorded.");
      const immutableKeys = [
        "id",
        "offerId",
        "worker",
        "payer",
        "issuer",
        "task",
        "fee",
        "holdId",
        "kind",
        "requiredEvidence",
        "accepted",
        "cancellation",
        "requiredMinutes",
        "payrollApprovalId",
      ] as const;
      for (const key of immutableKeys)
        if (canonicalEconomyPayload(agreement[key]) !== canonicalEconomyPayload(updated[key]))
          failEconomy("history-rewrite", "Accepted work terms cannot be rewritten.");
      unchangedPrefix(
        agreement.attendance,
        updated.attendance,
        "employer-bound attendance minutes",
      );
      unchangedPrefix(agreement.evidenceIds, updated.evidenceIds, "agreement evidence references");
      if (updated.eligibleMinutes < agreement.eligibleMinutes)
        failEconomy("history-rewrite", "Accrued work minutes cannot be erased.");
    }
    for (const payable of before.work.payables) {
      const updated = after.work.payables.find((entry) => entry.id === payable.id);
      if (!updated) failEconomy("history-rewrite", "Earned payables must remain recorded.");
      for (const key of ["id", "agreementId", "worker", "payer", "amount", "holdId"] as const)
        if (payable[key] !== updated[key])
          failEconomy("history-rewrite", "Earned payment ownership and terms cannot be rewritten.");
      if (
        payable.status === "settled" &&
        (updated.status !== "settled" || payable.transactionId !== updated.transactionId)
      )
        failEconomy(
          "history-rewrite",
          "A settled payable cannot become unpaid or lose its original payment.",
        );
    }
    for (const key of ["approvals", "payrollApprovals"] as const) {
      for (const approval of before.work[key]) {
        const updated = after.work[key].find((entry) => entry.id === approval.id);
        if (!updated)
          failEconomy("history-rewrite", "Original issuer funding approvals must remain recorded.");
        const { consumed: _wasConsumed, ...oldTerms } = approval;
        const { consumed: _isConsumed, ...newTerms } = updated;
        if (
          canonicalEconomyPayload(oldTerms) !== canonicalEconomyPayload(newTerms) ||
          (approval.consumed && !updated.consumed)
        )
          failEconomy(
            "history-rewrite",
            "Original issuer-approved terms cannot be changed or reused.",
          );
      }
    }
    for (const claim of before.work.legacyClaims) {
      const updated = after.work.legacyClaims.find((entry) => entry.id === claim.id);
      if (
        !updated ||
        canonicalEconomyPayload(claim.evidence) !== canonicalEconomyPayload(updated.evidence) ||
        claim.worker !== updated.worker ||
        claim.classification !== updated.classification
      )
        failEconomy(
          "history-rewrite",
          "Original labelled legacy payroll evidence must be retained.",
        );
    }
  }
}

/** A callback may throw after any step: balances, reservations, work and receipt all roll back. */
export function runEconomyCommand<T>(
  town: Town,
  command: EconomyCommand,
  apply: (draft: Town, context: EconomyContext) => T,
): EconomyResult<T> {
  try {
    commandAuthority(command);
    const economy = requireEconomy(town);
    const issues = auditEconomy(town);
    if (issues.length) failEconomy("invalid-economy", issues.join(" "));
    const payload = commandPayload(command);
    const existing = economy.commandReceipts.find((receipt) => receipt.id === command.id);
    if (existing) {
      if (existing.payload !== payload)
        failEconomy(
          "command-conflict",
          "This command ID was already used for a different actor or different terms.",
        );
      return {
        ok: true,
        replayed: true,
        value: structuredClone(existing.value) as T,
        receipt: structuredClone(existing),
      };
    }
    validateCommandQuote(town, command);
    const draft = structuredClone(town);
    const draftEconomy = requireEconomy(draft);
    const transactionStart = draftEconomy.transactions.length;
    const holdStart = draftEconomy.holds.length;
    const previousReleases = new Set(
      draftEconomy.holds.flatMap((hold) => hold.releases.map((release) => release.id)),
    );
    const context: EconomyContext = {
      command: freezeJSON(structuredClone(command)),
      economy: draftEconomy,
    };
    let value: T;
    const active: ActiveCommand = {
      town: draft,
      transactions: new Map(),
      holds: new Map(),
      releases: new Map(),
      projectAccounts: new Set(),
    };
    activeCommands.set(context, active);
    try {
      value = apply(draft, context);
    } finally {
      activeCommands.delete(context);
    }
    if (!jsonValue(value))
      failEconomy("invalid-result", "An atomic command must return a serializable receipt result.");
    assertAppendOnly(economy, draftEconomy, active);
    const receipt: EconomyState["commandReceipts"][number] = {
      id: command.id,
      kind: command.kind,
      actor: command.actor,
      authority: command.authority as "ui" | "simulation",
      payload,
      value: structuredClone(value),
      revisionBefore: economy.revision,
      revisionAfter: economy.revision + 1,
      ...timeOf(draft),
      transactionIds: draftEconomy.transactions
        .slice(transactionStart)
        .map((transaction) => transaction.id),
      holdIds: draftEconomy.holds.slice(holdStart).map((hold) => hold.id),
      releaseIds: draftEconomy.holds.flatMap((hold) =>
        hold.releases
          .filter((release) => !previousReleases.has(release.id))
          .map((release) => release.id),
      ),
    };
    draftEconomy.commandReceipts.push(receipt);
    draftEconomy.revision = receipt.revisionAfter;
    const finalIssues = auditEconomy(draft);
    if (finalIssues.length) failEconomy("invalid-economy", finalIssues.join(" "));
    // Keep additive gameplay projections stable across financial commits.
    for (const [key, value] of Object.entries(draftEconomy.projects ?? {})) {
      const original = economy.projects?.[key];
      if (
        original &&
        value &&
        typeof original === "object" &&
        typeof value === "object" &&
        !Array.isArray(original) &&
        !Array.isArray(value)
      ) {
        Object.assign(original, value);
        draftEconomy.projects![key] = original;
      }
    }
    // Retain resident/debt object identity for existing simulation callers.
    const agents = draft.agents.map((value) => {
      const existingAgent = town.agents.find((item) => item.id === value.id);
      if (!existingAgent) return value;
      Object.assign(existingAgent, value);
      return existingAgent;
    });
    const favors = draft.favors.map((value) => {
      const existingFavor = town.favors.find((item) => item.id === value.id);
      if (!existingFavor) return value;
      Object.assign(existingFavor, value);
      return existingFavor;
    });
    Object.assign(town, draft, { agents, favors });
    return {
      ok: true,
      replayed: false,
      value: structuredClone(value),
      receipt: structuredClone(receipt),
    };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof EconomyError ? error.code : "command-failed",
      reason:
        error instanceof Error
          ? error.message
          : "The command could not be completed; no changes were applied.",
    };
  }
}

function assertContext(town: Town, context: EconomyContext): EconomyState {
  if (activeCommands.get(context)?.town !== town || requireEconomy(town) !== context.economy)
    failEconomy("invalid-context", "Financial helpers require the active atomic command's draft.");
  commandAuthority(context.command);
  return context.economy;
}

/** Trusted callbacks must validate current eligibility; these checks also protect source consent. */
function assertSourceAuthority(
  town: Town,
  context: EconomyContext,
  account: AccountId,
  agreementId: string | undefined,
  amount: number,
  action: "reserve" | "release" | "transfer",
  payment?: { to: AccountId; holdId?: string },
): void {
  if (context.command.authority === "simulation" || account === `agent:${context.command.actor}`)
    return;
  const work = requireEconomy(town).work;
  if (agreementId && work) {
    const agreement = work.agreements.find((entry) => entry.id === agreementId);
    if (agreement?.worker === context.command.actor && agreement.payer === account) {
      const payable = work.payables.find((entry) => entry.agreementId === agreement.id);
      if (
        action === "transfer" &&
        payment &&
        payable?.status === "earned" &&
        payable.amount === amount &&
        payable.holdId === payment.holdId &&
        payment.to === `agent:${agreement.worker}`
      )
        return;
      if (
        action === "release" &&
        context.command.kind === "cancel-work" &&
        !payable &&
        (agreement.kind === "check" || agreement.eligibleMinutes === 0) &&
        ["active", "suspended"].includes(agreement.status)
      )
        return;
    }
    const offer = work.offers.find((entry) => `work:${entry.id}` === agreementId);
    if (
      action === "reserve" &&
      context.command.kind === "accept-work" &&
      offer?.status === "open" &&
      offer.worker === context.command.actor &&
      offer.payer === account &&
      offer.fee === amount
    )
      return;
    const terms = context.command.terms;
    const approvalId =
      terms !== null && !Array.isArray(terms) && typeof terms === "object"
        ? terms.approvalId
        : null;
    const approval = work.payrollApprovals.find((entry) => entry.id === approvalId);
    if (
      action === "reserve" &&
      approval &&
      !approval.consumed &&
      approval.worker === context.command.actor &&
      approval.payer === account &&
      approval.fee === amount &&
      timestamp(approval.expires) >= timestamp(timeOf(town)) &&
      ((context.command.kind === "recognise-legacy-payroll" &&
        approval.kind === "legacy-recognition" &&
        agreementId === `recognition:${approval.claimId}`) ||
        (context.command.kind === "accept-funded-cafe-shift" &&
          approval.kind === "cafe-replacement"))
    )
      return;
    const claim = work.legacyClaims.find((entry) => entry.id === agreementId);
    if (
      action === "release" &&
      context.command.kind === "recognise-legacy-payroll" &&
      approval &&
      !approval.consumed &&
      approval.kind === "legacy-recognition" &&
      approval.claimId === claim?.id &&
      approval.worker === context.command.actor &&
      approval.payer === account &&
      approval.fee === amount &&
      approval.confirmedMinutes === 0 &&
      timestamp(approval.expires) >= timestamp(timeOf(town)) &&
      claim?.classification === "active-unworked" &&
      claim.resolution === "protected" &&
      claim.payer === account &&
      claim.amount === amount &&
      claim.worker === context.command.actor
    )
      return;
  }
  failEconomy(
    "unauthorized-source",
    "The player's command cannot spend or reserve another account without its recorded issuer-approved agreement.",
  );
}

export function ensureProjectAccount(
  town: Town,
  context: EconomyContext,
  projectId: string,
): `project:${string}` {
  const economy = assertContext(town, context);
  const id = `project:${projectId}` as const;
  if (!accountId(id)) failEconomy("invalid-account", "The project custody ID is invalid.");
  if (!Object.hasOwn(economy.projectBalances, id)) {
    economy.projectBalances[id] = 0;
    economy.openingBalances = Object.freeze({ ...economy.openingBalances, [id]: 0 });
    activeCommands.get(context)!.projectAccounts.add(id);
  }
  return id;
}

export function reserveFunds(
  town: Town,
  context: EconomyContext,
  options: Pick<MoneyHold, "id" | "account" | "amount" | "agreementId" | "purpose">,
): MoneyHold {
  const economy = assertContext(town, context);
  if (
    !label(options.id) ||
    !label(options.agreementId) ||
    !label(options.purpose) ||
    !positiveCash(options.amount)
  )
    failEconomy(
      "invalid-hold",
      "A hold needs stable IDs, disclosed purpose, and a positive integer amount.",
    );
  if (economy.holds.some((hold) => hold.id === options.id))
    failEconomy("hold-conflict", "That reservation ID is already in use.");
  assertSourceAuthority(
    town,
    context,
    options.account,
    options.agreementId,
    options.amount,
    "reserve",
  );
  if (availableFunds(town, options.account) < options.amount)
    failEconomy(
      "insufficient-funds",
      `Account ${options.account} cannot reserve the full disclosed amount.`,
    );
  const hold: MoneyHold = {
    ...options,
    remaining: options.amount,
    createdAt: timeOf(town),
    commandId: context.command.id,
    releases: [],
  };
  economy.holds.push(hold);
  activeCommands.get(context)!.holds.set(hold.id, canonicalEconomyPayload(immutableHold(hold)));
  return hold;
}

export function releaseFunds(
  town: Town,
  context: EconomyContext,
  holdId: string,
  reason: string,
  amount?: number,
): MoneyHold {
  const economy = assertContext(town, context);
  const hold = economy.holds.find((entry) => entry.id === holdId);
  if (!hold) failEconomy("unknown-hold", "The money reservation does not exist.");
  const released = amount ?? hold.remaining;
  if (!label(reason) || !positiveCash(released) || released > hold.remaining)
    failEconomy(
      "invalid-release",
      "Release only a positive unearned reserved amount, with its reason.",
    );
  const work = economy.work;
  if (
    work?.payables.some((payable) => payable.holdId === hold.id) ||
    work?.agreements.some(
      (agreement) =>
        agreement.holdId === hold.id &&
        agreement.kind === "cafe-shift" &&
        agreement.eligibleMinutes > 0,
    )
  )
    failEconomy(
      "earned-reservation",
      "Earned payables and accrued shift minutes retain their full reservation.",
    );
  assertSourceAuthority(town, context, hold.account, hold.agreementId, released, "release");
  const release = {
    id: `${context.command.id}:release:${hold.id}:${hold.releases.length}`,
    amount: released,
    reason,
    commandId: context.command.id,
    ...timeOf(town),
  };
  hold.releases.push(release);
  activeCommands.get(context)!.releases.set(release.id, canonicalEconomyPayload(release));
  hold.remaining -= released;
  return hold;
}

export function transferFunds(
  town: Town,
  context: EconomyContext,
  options: {
    id: string;
    from: AccountId;
    to: AccountId;
    amount: number;
    purpose: string;
    agreementId?: string;
    holdId?: string;
    reversalOf?: string;
    reason?: string;
  },
): LedgerTransaction {
  const economy = assertContext(town, context);
  if (
    !label(options.id) ||
    !label(options.purpose) ||
    !positiveCash(options.amount) ||
    options.from === options.to ||
    (options.agreementId !== undefined && !label(options.agreementId))
  )
    failEconomy(
      "invalid-transfer",
      "A transfer needs distinct accounts, stable ID, purpose, and a positive integer amount.",
    );
  if (economy.transactions.some((transaction) => transaction.id === options.id))
    failEconomy("transaction-conflict", "That transaction ID is already in use.");
  assertSourceAuthority(
    town,
    context,
    options.from,
    options.agreementId,
    options.amount,
    "transfer",
    options,
  );
  if (
    options.reversalOf !== undefined &&
    (context.command.authority !== "simulation" ||
      context.command.kind !== "money.reverse" ||
      !label(options.reversalOf) ||
      !label(options.reason))
  )
    failEconomy(
      "unauthorized",
      "A reversal requires an explicit trusted correction and its reason.",
    );
  if (options.reversalOf === undefined && options.reason !== undefined)
    failEconomy("invalid-transfer", "A correction reason must refer to its original transfer.");
  const source = accountBalance(town, options.from);
  const recipient = accountBalance(town, options.to);
  if (!cash(recipient + options.amount))
    failEconomy("recipient-capacity", "The recipient account cannot safely receive this amount.");
  if (options.to.startsWith("agent:") && recipient + options.amount > 999)
    failEconomy(
      "recipient-capacity",
      "The recipient's purse is full; the earned payable must remain unsettled.",
    );
  let hold: MoneyHold | undefined;
  if (options.holdId !== undefined) {
    hold = economy.holds.find((entry) => entry.id === options.holdId);
    if (
      !hold ||
      hold.account !== options.from ||
      hold.agreementId !== options.agreementId ||
      hold.remaining < options.amount
    )
      failEconomy(
        "invalid-hold",
        "This payment does not match its funded reservation and agreement.",
      );
    if (source < options.amount)
      failEconomy("insufficient-funds", "The reserved source cash is missing.");
  } else if (availableFunds(town, options.from) < options.amount) {
    failEconomy(
      "insufficient-funds",
      "Available cash cannot cover this transfer while protecting existing reservations.",
    );
  }
  const transaction: LedgerTransaction = {
    id: options.id,
    kind: "transfer",
    from: options.from,
    to: options.to,
    amount: options.amount,
    purpose: options.purpose,
    agreementId: options.agreementId ?? null,
    holdId: options.holdId ?? null,
    authority: context.command.authority as "ui" | "simulation",
    actor: context.command.actor,
    commandId: context.command.id,
    ...timeOf(town),
    authorization: null,
    reason: options.reason ?? null,
    ...(options.reversalOf === undefined ? {} : { reversalOf: options.reversalOf }),
  };
  writeBalance(town, options.from, source - options.amount);
  writeBalance(town, options.to, recipient + options.amount);
  if (hold) hold.remaining -= options.amount;
  economy.transactions.push(transaction);
  activeCommands
    .get(context)!
    .transactions.set(transaction.id, canonicalEconomyPayload(transaction));
  return transaction;
}

/** Cash creation/destruction is explicit and reserved for authored simulation events. */
export function changeMoneySupply(
  town: Town,
  context: EconomyContext,
  options: {
    id: string;
    kind: "issuance" | "retirement";
    account: AccountId;
    amount: number;
    purpose: string;
    authorization: "authored-event" | "correction";
    reason: string;
  },
): LedgerTransaction {
  const economy = assertContext(town, context);
  if (
    context.command.authority !== "simulation" ||
    context.command.kind !== `money.${options.kind === "issuance" ? "issue" : "retire"}`
  )
    failEconomy(
      "unauthorized",
      "Only an explicit trusted money-supply command can create or retire cash.",
    );
  if (
    !label(options.id) ||
    !label(options.purpose) ||
    !label(options.reason) ||
    !positiveCash(options.amount) ||
    (options.authorization !== "authored-event" && options.authorization !== "correction") ||
    (options.kind !== "issuance" && options.kind !== "retirement")
  )
    failEconomy(
      "invalid-supply-event",
      "Money-supply events need a positive integer amount, restricted authorization, and a reason.",
    );
  if (economy.transactions.some((transaction) => transaction.id === options.id))
    failEconomy("transaction-conflict", "That transaction ID is already in use.");
  const current = accountBalance(town, options.account);
  const next = current + (options.kind === "issuance" ? options.amount : -options.amount);
  if (options.kind === "retirement" && availableFunds(town, options.account) < options.amount)
    failEconomy("insufficient-funds", "Retirement cannot destroy reserved cash.");
  if (
    !cash(next) ||
    (options.kind === "issuance" && options.account.startsWith("agent:") && next > 999)
  )
    failEconomy("recipient-capacity", "This money-supply event exceeds safe account capacity.");
  const transaction: LedgerTransaction = {
    id: options.id,
    kind: options.kind,
    from: options.kind === "retirement" ? options.account : null,
    to: options.kind === "issuance" ? options.account : null,
    amount: options.amount,
    purpose: options.purpose,
    agreementId: null,
    holdId: null,
    authority: "simulation",
    actor: context.command.actor,
    commandId: context.command.id,
    ...timeOf(town),
    authorization: options.authorization,
    reason: options.reason,
  };
  writeBalance(town, options.account, next);
  economy.transactions.push(transaction);
  activeCommands
    .get(context)!
    .transactions.set(transaction.id, canonicalEconomyPayload(transaction));
  return transaction;
}

/** An accounting correction appends an inverse transfer; it cannot confiscate earned wages. */
export function reverseTransfer(
  town: Town,
  command: EconomyCommand,
  transactionId: string,
  reason: string,
): EconomyResult<{ originalTransactionId: string; reversalTransactionId: string }> {
  return runEconomyCommand(town, command, (draft, context) => {
    if (command.authority !== "simulation" || command.kind !== "money.reverse")
      failEconomy(
        "unauthorized",
        "Transfer corrections require an explicit trusted simulation command.",
      );
    if (
      !label(reason) ||
      canonicalEconomyPayload(command.terms) !== canonicalEconomyPayload({ transactionId, reason })
    )
      failEconomy(
        "changed-terms",
        "A correction must bind the original transaction and its reason.",
      );
    const economy = requireEconomy(draft);
    const original = economy.transactions.find((transaction) => transaction.id === transactionId);
    if (
      !original ||
      original.kind !== "transfer" ||
      original.reversalOf !== undefined ||
      !original.from ||
      !original.to
    )
      failEconomy("invalid-reversal", "Only an original recorded transfer can be reversed.");
    if (original.actor !== command.actor)
      failEconomy("wrong-actor", "Only the original authorized actor can correct this transfer.");
    if (economy.transactions.some((transaction) => transaction.reversalOf === transactionId))
      failEconomy(
        "already-reversed",
        "The original transfer already has an accounting correction.",
      );
    if (
      original.holdId ||
      economy.work?.payables.some((payable) => payable.transactionId === original.id)
    )
      failEconomy(
        "earned-payment",
        "Earned work is paid even after a failed result; its wage cannot be reversed.",
      );
    const reversal = transferFunds(draft, context, {
      id: `${command.id}:reversal`,
      from: original.to,
      to: original.from,
      amount: original.amount,
      purpose: "Authorized correction of the original transfer",
      ...(original.agreementId === null ? {} : { agreementId: original.agreementId }),
      reversalOf: original.id,
      reason,
    });
    // A correction of an original personal tab restores that same obligation and creditor.
    const debt = draft.favors.find(
      (favor) =>
        favor.id === original.agreementId &&
        favor.status === "paid" &&
        original.from === `agent:${favor.from}` &&
        original.to === `agent:${favor.to}` &&
        original.amount === favor.amount,
    );
    if (debt) debt.status = "owed";
    return { originalTransactionId: original.id, reversalTransactionId: reversal.id };
  });
}

export function settleLegacyDebt(
  town: Town,
  command: EconomyCommand,
  debtId: string,
): EconomyResult<{
  debtId: string;
  amount: number;
  creditor: AgentId;
  transactionId: string | null;
}> {
  return runEconomyCommand(town, command, (draft, context) => {
    if (
      command.kind !== "debt.settle" ||
      canonicalEconomyPayload(command.terms) !== canonicalEconomyPayload({ debtId })
    )
      failEconomy("changed-terms", "Debt settlement must name its exact recorded tab.");
    const debts = draft.favors.filter((favor) => favor.id === debtId);
    if (debts.length !== 1)
      failEconomy("unknown-debt", "The recorded debt ID is missing or ambiguous.");
    const debt = debts[0];
    if (debt.status !== "owed") failEconomy("debt-closed", "That tab is no longer owed.");
    if (debt.from !== command.actor)
      failEconomy("wrong-actor", "Only the recorded debtor can authorize this payment.");
    if (!agentId(debt.to) || !cash(debt.amount))
      failEconomy("invalid-debt", "The original creditor or debt amount is invalid.");
    const transactionId = debt.amount ? `${command.id}:debt` : null;
    if (transactionId)
      transferFunds(draft, context, {
        id: transactionId,
        from: `agent:${debt.from}`,
        to: `agent:${debt.to}`,
        amount: debt.amount,
        purpose: "Settlement of the original personal tab",
        agreementId: debt.id,
      });
    debt.status = "paid";
    return { debtId: debt.id, amount: debt.amount, creditor: debt.to, transactionId };
  });
}
