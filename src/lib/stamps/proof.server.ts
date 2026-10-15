import { Address, Verifier } from "bip322-js";
import type { StampChallenge, StampScope } from "./types";

const WORLD_ID = /^world_[0-9a-f]{64}$/;
const CHARACTER_ID = /^character_[0-9a-f]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Only canonical mainnet native SegWit public-key-hash addresses are supported. */
export function validateP2wpkhAddress(address: unknown): address is string {
  if (typeof address !== "string" || !/^bc1q[ac-hj-np-z02-9]{38}$/.test(address)) return false;
  try {
    const script = Address.convertAdressToScriptPubkey(address);
    return script.length === 22 && script[0] === 0 && script[1] === 20;
  } catch {
    return false;
  }
}

/** Strict DER, including minimally encoded nonnegative R and S integers. */
function canonicalDer(signature: Uint8Array): boolean {
  if (signature.length < 9 || signature.length > 73 || signature.at(-1) !== 1) return false;
  const der = signature.subarray(0, -1);
  if (der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 2) return false;
  const rLength = der[3];
  const sTag = 4 + rLength;
  if (rLength < 1 || rLength > 33 || sTag + 2 >= der.length || der[sTag] !== 2) return false;
  const sLength = der[sTag + 1];
  if (sLength < 1 || sLength > 33 || sTag + 2 + sLength !== der.length) return false;
  for (const [start, length] of [
    [4, rLength],
    [sTag + 2, sLength],
  ]) {
    if (der[start] & 0x80) return false;
    if (length > 1 && der[start] === 0 && !(der[start + 1] & 0x80)) return false;
  }
  return true;
}

/**
 * Accept only unprefixed BIP-322-simple P2WPKH witnesses. The library also
 * accepts legacy BIP-137 signatures; the framing check deliberately excludes
 * them, full transactions, proof-of-funds and noncanonical CompactSize values.
 */
export function verifyStampProof(address: unknown, message: unknown, signature: unknown): boolean {
  if (
    !validateP2wpkhAddress(address) ||
    typeof message !== "string" ||
    !message.length ||
    message.length > 4096 ||
    typeof signature !== "string" ||
    signature.length < 60 ||
    signature.length > 148 ||
    !BASE64.test(signature)
  )
    return false;
  try {
    const witness = Buffer.from(signature, "base64");
    if (witness.toString("base64") !== signature || witness[0] !== 2) return false;
    // Both element lengths are below 253, so their canonical CompactSize
    // representation is exactly one byte. No generic permissive parser needed.
    const signatureLength = witness[1];
    if (signatureLength < 9 || signatureLength > 73) return false;
    const publicKeyLengthOffset = 2 + signatureLength;
    if (
      witness[publicKeyLengthOffset] !== 33 ||
      witness.length !== publicKeyLengthOffset + 34 ||
      ![2, 3].includes(witness[publicKeyLengthOffset + 1]) ||
      !canonicalDer(witness.subarray(2, publicKeyLengthOffset))
    )
      return false;
    return Verifier.verifySignature(address, message, signature, true) === true;
  } catch {
    return false;
  }
}

export function buildStampChallenge(input: {
  id: string;
  address: string;
  scope: StampScope;
  origin: string;
  expiresAt: number;
}): StampChallenge {
  const { id, address, scope, origin, expiresAt } = input;
  if (
    !NONCE.test(id) ||
    !validateP2wpkhAddress(address) ||
    !WORLD_ID.test(scope.worldId) ||
    !CHARACTER_ID.test(scope.characterId) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    expiresAt > 8_640_000_000_000_000
  )
    throw new Error("Invalid read-only stamp challenge.");
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol) || url.origin !== origin)
    throw new Error("A stamp challenge requires its exact HTTP origin.");
  const message = [
    "THE GAME: read-only Bitcoin Stamp appearance proof",
    "",
    "Purpose: view Bitcoin Stamps and select a cosmetic portrait or sprite head.",
    "This does not authorize spending BTC, transferring stamps, account ownership, or character ownership.",
    "No transaction, funds transfer, or signing authority is requested.",
    "",
    "Network: Bitcoin mainnet",
    `Origin: ${origin}`,
    `World ID: ${scope.worldId}`,
    `Character ID: ${scope.characterId}`,
    `Bitcoin address: ${address}`,
    `Challenge ID / nonce: ${id}`,
    `Expires at (UTC): ${new Date(expiresAt).toISOString()}`,
    `Expires at (Unix milliseconds): ${expiresAt}`,
    "",
    "Sign this exact message using BIP-322 simple.",
  ].join("\n");
  return { id, address, message, expiresAt };
}
