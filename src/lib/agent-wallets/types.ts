import type { AgentId } from "../../game/types";
import type { StampHoldingsPage } from "../stamps/types";

export type WorldRegistrationInput = {
  sourceWorldId: string;
  title: string;
  characters: { role: AgentId; sourceCharacterId: string; name: string }[];
};
export type RegisteredResident = {
  residentId: string;
  sourceCharacterId: string;
  role: AgentId;
  name: string;
};
export type RegisteredWorld = {
  registrationId: string;
  sourceWorldId: string;
  title: string;
  createdAt: number;
  residents: RegisteredResident[];
};
export type ReceivingProfile = {
  profileId: string;
  residentId: string;
  revision: number;
  state: "unconfigured" | "draft" | "retired";
  address: string | null;
  verifiedAt: number | null;
  updatedAt: number;
  network: "mainnet";
  fundingPublished: false;
};
export type RegisteredWorldView = {
  ownerRef: string;
  world: RegisteredWorld;
  profiles: ReceivingProfile[];
};
export type ReceivingProof = {
  id: string;
  registrationId: string;
  residentId: string;
  profileId: string;
  revision: number;
  address: string;
  message: string;
  expiresAt: number;
};
export type ReceivingInventory = {
  profileId: string;
  revision: number;
  address: string;
  observedAt: number;
  holdings: StampHoldingsPage;
  btc: "not-checked";
};
export type OwnerAccess = {
  available: boolean;
  authenticated: boolean;
  ownerRef: string | null;
  message: string;
};
export type RegistryErrorCode =
  | "unavailable"
  | "unauthenticated"
  | "owner-mismatch"
  | "invalid"
  | "not-found"
  | "conflict"
  | "expired"
  | "rate-limited"
  | "limit"
  | "stale";
export type RegistryResult<T> =
  { ok: true; value: T } | { ok: false; error: RegistryErrorCode; message: string };
