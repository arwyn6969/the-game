import type { AgentId, Town } from "./types";

/** Additive contract until save/UI integration is complete. */
export type FundedTown = Town & { economy?: EconomyState };
import type { FundedWorkState } from "./funded-work";

export type AccountId = `agent:${AgentId}` | "till:cafe" | "till:grocery" | `project:${string}`;
export type EconomyAuthority = "ui" | "simulation" | "model";
export type JSONValue =
  null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type GameTime = { day: number; minute: number };

export type LedgerTransaction = {
  id: string;
  kind: "transfer" | "issuance" | "retirement";
  from: AccountId | null;
  to: AccountId | null;
  amount: number;
  purpose: string;
  agreementId: string | null;
  authority: Exclude<EconomyAuthority, "model">;
  actor: AgentId;
  commandId: string;
  day: number;
  minute: number;
  holdId: string | null;
  authorization: "authored-event" | "correction" | null;
  reason: string | null;
  reversalOf?: string;
};

export type HoldRelease = {
  id: string;
  amount: number;
  reason: string;
  commandId: string;
  day: number;
  minute: number;
};

export type MoneyHold = {
  id: string;
  account: AccountId;
  amount: number;
  remaining: number;
  agreementId: string;
  purpose: string;
  commandId: string;
  createdAt: GameTime;
  releases: HoldRelease[];
};

export type QuoteEligibility = { eligible: boolean; key: string; reason?: string };
export type EconomyQuote = {
  id: string;
  kind: string;
  actor: AgentId;
  terms: JSONValue;
  revision: number;
  issuedAt: GameTime;
  expiresAt: GameTime;
  eligibility: QuoteEligibility;
};

/** Authority describes the trusted entry point, never a value read from model prose. */
export type EconomyCommand = {
  id: string;
  kind: string;
  actor: AgentId;
  authority: EconomyAuthority;
  terms: JSONValue;
  expectedRevision?: number;
  quote?: EconomyQuote;
};

export type EconomyCommandReceipt = {
  id: string;
  kind: string;
  actor: AgentId;
  authority: Exclude<EconomyAuthority, "model">;
  payload: string;
  value: JSONValue;
  revisionBefore: number;
  revisionAfter: number;
  day: number;
  minute: number;
  transactionIds: string[];
  holdIds: string[];
  releaseIds: string[];
};

export type EconomyState = {
  schemaVersion: 1;
  initializedAt: GameTime;
  /** An import snapshot, not earnings or another independently mutable purse. */
  openingBalances: Readonly<Record<AccountId, number>>;
  projectBalances: Record<`project:${string}`, number>;
  transactions: LedgerTransaction[];
  holds: MoneyHold[];
  quotes: EconomyQuote[];
  commandReceipts: EconomyCommandReceipt[];
  revision: number;
  work?: FundedWorkState;
  projects?: Record<string, JSONValue>;
  events?: JSONValue[];
};

export type EconomyContext = { readonly command: Readonly<EconomyCommand>; economy: EconomyState };
export type EconomyResult<T> =
  | { ok: true; replayed: boolean; value: T; receipt: EconomyCommandReceipt }
  | { ok: false; code: string; reason: string };
