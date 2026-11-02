import type { AgentId, Town } from "./types";

export const COFFEE_PRICE = 2 as const;
export const COFFEE_BREW_MINUTES = 20;
export const COFFEE_PLACE_MINUTES = 10;
export const COFFEE_CUSTOMER_STAND = { x: 7, y: 19 } as const;
export const COFFEE_BREW_STAND = { x: 5, y: 18 } as const;
export const COFFEE_PLACE_STAND = { x: 6, y: 18 } as const;
export const COFFEE_ADMISSION_BYTES = 3 * 1024 * 1024;
export const COFFEE_MAX_ORDERS = 50;
export const COFFEE_MAX_SHIFTS = 14;
export const COFFEE_WORKERS: readonly AgentId[] = ["player", "sub", "northern"];

export type CoffeePhase =
  | "queued"
  | "brewing"
  | "placing"
  | "ready"
  | "collected"
  | "consumed"
  | "refund-pending"
  | "refunded";
export type CoffeeContribution = {
  worker: AgentId;
  agreementId: string;
  phase: "brewing" | "placing";
  /** Half-open authoritative game-minute range. */
  start: number;
  end: number;
};
export type CoffeeOrder = {
  id: string;
  buyer: AgentId;
  price: 2;
  holdId: string;
  saleId: string;
  phase: CoffeePhase;
  revision: number;
  brewMinutes: number;
  placeMinutes: number;
  assignedAgreementId: string | null;
  assignmentRevision: number;
  pickupSlot: 0 | 1 | null;
  contributions: CoffeeContribution[];
  createdAt: number;
  readyAt: number | null;
  refundId: string | null;
};
export type CoffeeCup = {
  id: string;
  orderId: string;
  owner: AgentId;
  custody: "counter" | "inventory" | "consumed";
  revision: number;
};
export type CoffeeRoutine = {
  worker: AgentId;
  agreementId: string;
  status: "active" | "paused" | "ended";
  controlDay: number;
  stopAfterCurrent: boolean;
  orderId: string | null;
  lastInterval: number | null;
  revision: number;
  reason: string | null;
  /** At most one completion-only resume after the normal record budget closes. */
  drainResumeUsed?: boolean;
};
export type CoffeeState = {
  version: 1;
  openedDay: number;
  enabled: boolean;
  nextOrder: number;
  revision: number;
  orders: CoffeeOrder[];
  cups: CoffeeCup[];
  routines: CoffeeRoutine[];
};
export type CoffeeTown = Town & { coffee?: CoffeeState };
export type CoffeeActionKind =
  | "enable"
  | "buy"
  | "cancel"
  | "collect"
  | "drink"
  | "start"
  | "pause"
  | "resume"
  | "finish-current"
  | "staff-request";
export type CoffeeCommand = {
  id: string;
  worldId: string;
  characterId: string;
  actor: AgentId;
  authority: "ui" | "simulation" | "model";
  expectedRevision: number;
  kind: CoffeeActionKind;
  targetId?: string;
  acceptLaterPickup?: boolean;
};
