import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const STORAGE_KEY = "the-game-agent-owner-hidden-v1";
const MAX_OWNERS = 64;
const HASH = /^[0-9a-f]{64}$/;
const hiddenOwners = new Set<string>();
let loaded = false;

function key(ownerId: unknown): string | null {
  if (
    typeof ownerId !== "string" ||
    !ownerId ||
    ownerId.length > 256 ||
    ownerId.trim() !== ownerId ||
    ownerId === "dev-user" ||
    [...ownerId].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  return bytesToHex(sha256(new TextEncoder().encode(`the-game:owner-presentation:v1\n${ownerId}`)));
}

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 5_000) return;
    const entries: unknown = JSON.parse(raw);
    if (
      !Array.isArray(entries) ||
      entries.length > MAX_OWNERS ||
      entries.some((entry) => typeof entry !== "string" || !HASH.test(entry))
    )
      return;
    for (const entry of entries) hiddenOwners.add(entry as string);
  } catch {
    // Blocked storage does not erase this tab's in-memory privacy preference.
  }
}

/** Presentation privacy only. This flag neither ends a session nor grants authority. */
export function isAgentOwnerHidden(ownerId: unknown): boolean {
  if (typeof window === "undefined") return false;
  load();
  const ownerKey = key(ownerId);
  return ownerKey !== null && hiddenOwners.has(ownerKey);
}

/** Clear only after explicit verified refresh or successful fresh sign-in. */
export function setAgentOwnerHidden(ownerId: unknown, hidden: boolean): void {
  if (typeof window === "undefined") return;
  load();
  const ownerKey = key(ownerId);
  if (ownerKey === null) return;
  hiddenOwners.delete(ownerKey);
  if (hidden) hiddenOwners.add(ownerKey);
  while (hiddenOwners.size > MAX_OWNERS) hiddenOwners.delete(hiddenOwners.values().next().value!);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenOwners]));
  } catch {
    // The memory latch still hides private details until an explicit recovery.
  }
}
