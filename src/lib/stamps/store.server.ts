import { createHash } from "node:crypto";
import type { Sql } from "../db";
import { validateP2wpkhAddress } from "./proof.server";
import { isStampAppearance } from "./validation";
import type { StampAppearance, StampChallenge, StampScope } from "./types";

export const STAMP_SESSION_TTL_MS = 30 * 60_000;
export const STAMP_PROOF_TTL_MS = 15 * 60_000;
export const STAMP_CHALLENGE_TTL_MS = 5 * 60_000;
export const STAMP_CHALLENGE_INTERVAL_MS = 5_000;
export const STAMP_APPEARANCE_TTL_MS = 2 * 60_000;

export type WalletStampSession = StampScope & {
  sessionHash: string;
  createdAt: number;
  expiresAt: number;
  address: string | null;
  proofExpiresAt: number | null;
  challengeId?: string;
  challengeMessage?: string;
  challengeAddress?: string;
  challengeExpiresAt?: number;
  challengeUsedAt?: number;
  appearance: StampAppearance | null;
  appearanceRevision: number;
};

type Row = Record<string, unknown>;
const WORLD_ID = /^world_[0-9a-f]{64}$/;
const CHARACTER_ID = /^character_[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function timestamp(value: unknown): number {
  if (!(
    typeof value === "number" ||
    typeof value === "bigint" ||
    (typeof value === "string" && /^\d+$/.test(value))
  ))
    throw new Error("Invalid stamp session timestamp.");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error("Invalid stamp session timestamp.");
  return result;
}

function key(sessionHash: string, scope: StampScope): unknown[] {
  if (
    !HASH.test(sessionHash) ||
    !WORLD_ID.test(scope.worldId) ||
    !CHARACTER_ID.test(scope.characterId)
  )
    throw new Error("Invalid stamp session scope.");
  return [sessionHash, scope.worldId, scope.characterId];
}

function validAppearance(value: unknown, scope: StampScope): value is StampAppearance {
  if (!isStampAppearance(value)) return false;
  const item = value;
  if (
    item.worldId !== scope.worldId ||
    item.characterId !== scope.characterId ||
    item.expiresAt - item.verifiedAt > STAMP_APPEARANCE_TTL_MS
  )
    return false;
  const base64 = item.pngDataUrl.slice("data:image/png;base64,".length);
  if (!BASE64.test(base64)) return false;
  const image = Buffer.from(base64, "base64");
  return (
    image.toString("base64") === base64 &&
    image.length >= 33 &&
    image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    image.toString("ascii", 12, 16) === "IHDR" &&
    image.readUInt32BE(16) === 256 &&
    image.readUInt32BE(20) === 256 &&
    createHash("sha256").update(image).digest("hex") === item.contentHash
  );
}

function decode(row: Row, scope: StampScope, now: number): WalletStampSession {
  const createdAt = timestamp(row.created_at);
  const expiresAt = timestamp(row.expires_at);
  const address = row.address;
  const proofExpiresAt = row.proof_expires_at === null ? null : timestamp(row.proof_expires_at);
  if (
    typeof row.session_hash !== "string" ||
    !HASH.test(row.session_hash) ||
    row.world_id !== scope.worldId ||
    row.character_id !== scope.characterId ||
    (address !== null && !validateP2wpkhAddress(address)) ||
    (address === null) !== (proofExpiresAt === null) ||
    (proofExpiresAt !== null && proofExpiresAt > expiresAt)
  )
    throw new Error("Invalid stored stamp session.");
  const result: WalletStampSession = {
    sessionHash: row.session_hash,
    ...scope,
    createdAt,
    expiresAt,
    address: address as string | null,
    proofExpiresAt,
    appearance: null,
    appearanceRevision: timestamp(row.appearance_revision),
  };
  if (row.challenge_id !== null) {
    if (
      typeof row.challenge_id !== "string" ||
      !NONCE.test(row.challenge_id) ||
      typeof row.challenge_message !== "string" ||
      !row.challenge_message.length ||
      row.challenge_message.length > 4096 ||
      !validateP2wpkhAddress(row.challenge_address)
    )
      throw new Error("Invalid stored stamp challenge.");
    result.challengeId = row.challenge_id;
    result.challengeMessage = row.challenge_message;
    result.challengeAddress = row.challenge_address;
    result.challengeExpiresAt = timestamp(row.challenge_expires_at);
    if (row.challenge_used_at !== null) result.challengeUsedAt = timestamp(row.challenge_used_at);
  }
  if (
    address &&
    proofExpiresAt !== null &&
    proofExpiresAt > now &&
    validAppearance(row.appearance, scope) &&
    row.appearance.verifiedAt <= now &&
    row.appearance.expiresAt <= proofExpiresAt
  )
    result.appearance = row.appearance;
  return result;
}

/** SQL contains only scoped read-only proofs, never a raw browser cookie or key. */
export class SqlStampStore {
  constructor(private readonly sql: Pick<Sql, "query">) {}

  async get(
    sessionHash: string,
    scope: StampScope,
    now: number,
  ): Promise<WalletStampSession | null> {
    const rows = await this.sql.query<Row>(
      "select * from stamp_identity_sessions where session_hash=$1 and world_id=$2 and character_id=$3 and expires_at>$4",
      [...key(sessionHash, scope), timestamp(now)],
    );
    return rows[0] ? decode(rows[0], scope, now) : null;
  }

  async issue(
    sessionHash: string,
    scope: StampScope,
    challenge: StampChallenge,
    now: number,
  ): Promise<boolean> {
    const params = key(sessionHash, scope);
    timestamp(now);
    if (
      !NONCE.test(challenge.id) ||
      !validateP2wpkhAddress(challenge.address) ||
      typeof challenge.message !== "string" ||
      !challenge.message.length ||
      challenge.message.length > 4096 ||
      !Number.isSafeInteger(challenge.expiresAt) ||
      challenge.expiresAt <= now ||
      challenge.expiresAt > now + STAMP_CHALLENGE_TTL_MS
    )
      throw new Error("Invalid stamp challenge lease.");
    const rows = await this.sql.query<Row>(
      `insert into stamp_identity_sessions as existing
        (session_hash,world_id,character_id,created_at,expires_at,last_challenge_at,challenge_id,challenge_message,challenge_address,challenge_issued_at,challenge_expires_at)
       values($1,$2,$3,$4,$5,$4,$6,$7,$8,$4,$9)
       on conflict(session_hash,world_id,character_id) do update set
         created_at=case when existing.expires_at<=$4 then $4 else existing.created_at end,
         expires_at=$5,last_challenge_at=$4,
         address=case when existing.expires_at>$4 then existing.address else null end,
         proof_expires_at=case when existing.expires_at>$4 then existing.proof_expires_at else null end,
         appearance=case when existing.expires_at>$4 then existing.appearance else null end,
         challenge_id=$6,challenge_message=$7,challenge_address=$8,challenge_issued_at=$4,challenge_expires_at=$9,challenge_used_at=null
       where existing.expires_at<=$4 or existing.last_challenge_at<=$10
       returning session_hash`,
      [
        ...params,
        now,
        now + STAMP_SESSION_TTL_MS,
        challenge.id,
        challenge.message,
        challenge.address,
        challenge.expiresAt,
        now - STAMP_CHALLENGE_INTERVAL_MS,
      ],
    );
    return rows.length === 1;
  }

  async consume(
    sessionHash: string,
    scope: StampScope,
    challengeId: string,
    now: number,
  ): Promise<StampChallenge | null> {
    const params = key(sessionHash, scope);
    if (!NONCE.test(challengeId)) return null;
    const rows = await this.sql.query<Row>(
      `update stamp_identity_sessions set challenge_used_at=$5
       where session_hash=$1 and world_id=$2 and character_id=$3 and challenge_id=$4
         and expires_at>$5 and challenge_expires_at>$5 and challenge_issued_at<=$5 and challenge_used_at is null
       returning challenge_id,challenge_address,challenge_message,challenge_expires_at`,
      [...params, challengeId, timestamp(now)],
    );
    const row = rows[0];
    if (!row) return null;
    if (
      typeof row.challenge_id !== "string" ||
      !validateP2wpkhAddress(row.challenge_address) ||
      typeof row.challenge_message !== "string"
    )
      throw new Error("Invalid stored stamp challenge.");
    return {
      id: row.challenge_id,
      address: row.challenge_address,
      message: row.challenge_message,
      expiresAt: timestamp(row.challenge_expires_at),
    };
  }

  async prove(
    sessionHash: string,
    scope: StampScope,
    challengeId: string,
    address: string,
    proofExpiresAt: number,
    now: number,
  ): Promise<boolean> {
    const params = key(sessionHash, scope);
    timestamp(now);
    if (
      !NONCE.test(challengeId) ||
      !validateP2wpkhAddress(address) ||
      !Number.isSafeInteger(proofExpiresAt) ||
      proofExpiresAt <= now ||
      proofExpiresAt > now + STAMP_PROOF_TTL_MS
    )
      return false;
    const rows = await this.sql.query<Row>(
      `update stamp_identity_sessions set address=$5,proof_expires_at=$6,
         appearance=case when address=$5 then appearance else null end,
         appearance_revision=appearance_revision+1,
         challenge_id=null,challenge_message=null,challenge_address=null,challenge_issued_at=null,challenge_expires_at=null,challenge_used_at=null
       where session_hash=$1 and world_id=$2 and character_id=$3 and challenge_id=$4 and challenge_address=$5
         and challenge_used_at is not null and challenge_used_at<=$7 and challenge_expires_at>$7
         and expires_at>$7 and expires_at>=$6
       returning session_hash`,
      [...params, challengeId, address, proofExpiresAt, now],
    );
    return rows.length === 1;
  }

  async setAppearance(
    sessionHash: string,
    scope: StampScope,
    address: string,
    appearance: StampAppearance,
    now: number,
    expectedProofExpiresAt?: number,
    expectedAppearanceRevision?: number,
  ): Promise<boolean> {
    const params = key(sessionHash, scope);
    timestamp(now);
    if (
      !validateP2wpkhAddress(address) ||
      !validAppearance(appearance, scope) ||
      appearance.verifiedAt > now ||
      appearance.expiresAt <= now ||
      appearance.expiresAt > now + STAMP_APPEARANCE_TTL_MS ||
      (expectedProofExpiresAt !== undefined &&
        (!Number.isSafeInteger(expectedProofExpiresAt) || expectedProofExpiresAt <= now)) ||
      (expectedAppearanceRevision !== undefined &&
        (!Number.isSafeInteger(expectedAppearanceRevision) || expectedAppearanceRevision < 0))
    )
      return false;
    const rows = await this.sql.query<Row>(
      `update stamp_identity_sessions set appearance=$5::jsonb,appearance_revision=appearance_revision+1
       where session_hash=$1 and world_id=$2 and character_id=$3 and address=$4
         and expires_at>$6 and proof_expires_at>$6 and proof_expires_at>=$7
         and ($8::bigint is null or proof_expires_at=$8)
         and ($9::bigint is null or appearance_revision=$9)
       returning session_hash`,
      [
        ...params,
        address,
        JSON.stringify(appearance),
        now,
        appearance.expiresAt,
        expectedProofExpiresAt ?? null,
        expectedAppearanceRevision ?? null,
      ],
    );
    return rows.length === 1;
  }

  async clearAppearance(sessionHash: string, scope: StampScope, now: number): Promise<void> {
    await this.sql.query(
      "update stamp_identity_sessions set appearance=null,appearance_revision=appearance_revision+1 where session_hash=$1 and world_id=$2 and character_id=$3 and expires_at>$4",
      [...key(sessionHash, scope), timestamp(now)],
    );
  }

  async clear(sessionHash: string, scope: StampScope): Promise<void> {
    await this.sql.query(
      "delete from stamp_identity_sessions where session_hash=$1 and world_id=$2 and character_id=$3",
      key(sessionHash, scope),
    );
  }

  async cleanup(now: number, limit = 100): Promise<void> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("Invalid stamp cleanup limit.");
    await this.sql.query(
      `delete from stamp_identity_sessions where (session_hash,world_id,character_id) in
        (select session_hash,world_id,character_id from stamp_identity_sessions where expires_at<=$1 order by expires_at limit $2)`,
      [timestamp(now), limit],
    );
  }
}
