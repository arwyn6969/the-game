import { validateP2wpkhAddress } from "../stamps/proof.server";
import { ownerReference } from "./owner-reference";
import type { ReceivingProof } from "./types";

export { ownerReference } from "./owner-reference";

/** This purpose cannot be satisfied by the cosmetic stamp proof. */
export function receivingProofMessage(
  ownerId: string,
  origin: string,
  proof: Omit<ReceivingProof, "message">,
): string {
  if (
    !validateP2wpkhAddress(proof.address) ||
    new URL(origin).origin !== origin ||
    !Number.isSafeInteger(proof.expiresAt) ||
    !Number.isSafeInteger(proof.revision)
  )
    throw new Error("Invalid receiving draft proof.");
  return [
    "THE GAME: private agent receiving-address draft",
    "",
    "Purpose: reserve this externally controlled address for one private agent profile.",
    "This is a private watch-only draft. It does not publish funding instructions.",
    "Signing does not move BTC or stamps, authorize spending, or grant game account access.",
    "The owner keeps the wallet keys and must approve every future outgoing transfer.",
    "",
    "Network: Bitcoin mainnet",
    `Origin: ${origin}`,
    `Authenticated account reference: ${ownerReference(ownerId)}`,
    `Private world registration: ${proof.registrationId}`,
    `Registered resident: ${proof.residentId}`,
    `Receiving profile: ${proof.profileId}`,
    `Expected profile revision: ${proof.revision}`,
    `Bitcoin address: ${proof.address}`,
    `Single-use challenge: ${proof.id}`,
    `Expires at (UTC): ${new Date(proof.expiresAt).toISOString()}`,
    "",
    "Sign this exact message using BIP-322 simple.",
  ].join("\n");
}
