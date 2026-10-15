import type { StampScope } from "./types";

const STORAGE_KEY = "the-game-stamp-suppressed-v1";
const MAX_SCOPES = 64;
const KEY = /^world_[0-9a-f]{64}:character_[0-9a-f]{64}$/;
const suppressed = new Set<string>();
let loaded = false;

function scopeKey(scope: StampScope): string | null {
  const key = `${scope.worldId}:${scope.characterId}`;
  return KEY.test(key) ? key : null;
}

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 16_000) return;
    const values: unknown = JSON.parse(raw);
    if (
      !Array.isArray(values) ||
      values.length > MAX_SCOPES ||
      values.some((value) => typeof value !== "string" || !KEY.test(value))
    )
      return;
    for (const value of values) suppressed.add(value as string);
  } catch {
    // Browser storage may be unavailable. The in-memory disconnect still holds.
  }
}

function persist(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...suppressed]));
  } catch {
    // This tab must honor the local choice even when browser storage is full.
  }
}

/** A local presentation preference, containing no wallet address or authority. */
export function isStampSuppressed(scope: StampScope): boolean {
  if (typeof window === "undefined") return false;
  load();
  const key = scopeKey(scope);
  return key !== null && suppressed.has(key);
}

export function setStampSuppressed(scope: StampScope, value: boolean): void {
  if (typeof window === "undefined") return;
  load();
  const key = scopeKey(scope);
  if (key === null) return;
  suppressed.delete(key);
  if (value) suppressed.add(key);
  while (suppressed.size > MAX_SCOPES) suppressed.delete(suppressed.values().next().value!);
  persist();
}
