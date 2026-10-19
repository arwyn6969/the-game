import type { StampScope } from "./types";

const MAX_SCOPES = 64;
const KEY = /^world_[0-9a-f]{64}:character_[0-9a-f]{64}$/;
type ScopeFlags = { storageKey: string; values: Set<string>; loaded: boolean };
const suppressed: ScopeFlags = {
  storageKey: "the-game-stamp-suppressed-v1",
  values: new Set(),
  loaded: false,
};
const sessions: ScopeFlags = {
  storageKey: "the-game-stamp-sessions-v1",
  values: new Set(),
  loaded: false,
};
const verificationRequired: ScopeFlags = {
  storageKey: "the-game-stamp-verification-required-v1",
  values: new Set(),
  loaded: false,
};

function scopeKey(scope: StampScope): string | null {
  const key = `${scope.worldId}:${scope.characterId}`;
  return KEY.test(key) ? key : null;
}

function load(flags: ScopeFlags): void {
  if (flags.loaded || typeof window === "undefined") return;
  flags.loaded = true;
  try {
    const raw = window.sessionStorage.getItem(flags.storageKey);
    if (!raw || raw.length > 16_000) return;
    const values: unknown = JSON.parse(raw);
    if (
      !Array.isArray(values) ||
      values.length > MAX_SCOPES ||
      values.some((value) => typeof value !== "string" || !KEY.test(value))
    )
      return;
    for (const value of values) flags.values.add(value as string);
  } catch {
    // Browser storage may be unavailable. The in-memory disconnect still holds.
  }
}

function persist(flags: ScopeFlags): void {
  try {
    window.sessionStorage.setItem(flags.storageKey, JSON.stringify([...flags.values]));
  } catch {
    // This tab must honor the local choice even when browser storage is full.
  }
}

function contains(flags: ScopeFlags, scope: StampScope): boolean {
  if (typeof window === "undefined") return false;
  load(flags);
  const key = scopeKey(scope);
  return key !== null && flags.values.has(key);
}

function change(flags: ScopeFlags, scope: StampScope, value: boolean): void {
  if (typeof window === "undefined") return;
  load(flags);
  const key = scopeKey(scope);
  if (key === null) return;
  flags.values.delete(key);
  if (value) flags.values.add(key);
  while (flags.values.size > MAX_SCOPES) flags.values.delete(flags.values.values().next().value!);
  persist(flags);
}

/** A local presentation preference, containing no wallet address or authority. */
export function isStampSuppressed(scope: StampScope): boolean {
  return contains(suppressed, scope);
}

export function setStampSuppressed(scope: StampScope, value: boolean): void {
  change(suppressed, scope, value);
}

/** A polling opt-in hint only; the server must independently verify the session. */
export function hasStampSession(scope: StampScope): boolean {
  return contains(sessions, scope);
}

export function rememberStampSession(scope: StampScope, connected: boolean): void {
  change(sessions, scope, connected);
}

/** A local presentation reason only; reconnecting must still prove address control. */
export function isStampVerificationRequired(scope: StampScope): boolean {
  return contains(verificationRequired, scope);
}

export function setStampVerificationRequired(scope: StampScope, required: boolean): void {
  change(verificationRequired, scope, required);
}
