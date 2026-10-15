import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Public account-context check only; the server still authenticates every request. */
export function ownerReference(userId: string): string {
  return `owner_${bytesToHex(sha256(new TextEncoder().encode(`the-game:owner:v1:${userId}`)))}`;
}
