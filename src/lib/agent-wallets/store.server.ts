import { randomBytes } from "node:crypto";
import type { Sql } from "../db";
import { AGENT_IDS } from "../../game/types";
import { validateP2wpkhAddress } from "../stamps/proof.server";
import {
  worldRegistrationSchema,
  registrationIdSchema,
  residentIdSchema,
  profileIdSchema,
} from "./validation";
import type {
  WorldRegistrationInput,
  RegisteredWorld,
  RegisteredResident,
  ReceivingProfile,
  ReceivingProof,
} from "./types";

type Row = Record<string, unknown>;
const NONCE = /^[0-9a-f]{48}$/;
const CLEAR_PROOF = `challenge_id=null,challenge_revision=null,challenge_address=null,
  challenge_message=null,challenge_issued_at=null,challenge_expires_at=null,challenge_used_at=null`;

export class AgentRegistryStoreError extends Error {
  constructor(readonly code: "conflict" | "limit" | "invalid") {
    super(
      code === "conflict"
        ? "That address is reserved for another receiving profile."
        : code === "limit"
          ? "This owner has reached the private world registration limit."
          : "The receiving registry data is invalid.",
    );
    this.name = "AgentRegistryStoreError";
  }
}

function integer(value: unknown): number {
  if (!(
    typeof value === "number" ||
    typeof value === "bigint" ||
    (typeof value === "string" && /^\d+$/.test(value))
  ))
    throw new AgentRegistryStoreError("invalid");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new AgentRegistryStoreError("invalid");
  return result;
}
function owner(value: string): void {
  if (typeof value !== "string" || !value.length || value.length > 256)
    throw new AgentRegistryStoreError("invalid");
}
function scope(ownerId: string, registrationId: string, profileId?: string): void {
  owner(ownerId);
  if (
    !registrationIdSchema.safeParse(registrationId).success ||
    (profileId !== undefined && !profileIdSchema.safeParse(profileId).success)
  )
    throw new AgentRegistryStoreError("invalid");
}
function decodeProfile(row: Row): ReceivingProfile {
  if (
    !profileIdSchema.safeParse(row.profile_id).success ||
    !residentIdSchema.safeParse(row.resident_id).success ||
    !["unconfigured", "draft", "retired"].includes(String(row.state)) ||
    row.network !== "mainnet" ||
    row.funding_published !== false ||
    (row.address !== null && !validateP2wpkhAddress(row.address)) ||
    (row.address === null) !== (row.verified_at === null) ||
    (row.state === "draft" && row.address === null) ||
    (row.state === "unconfigured" && row.address !== null)
  )
    throw new AgentRegistryStoreError("invalid");
  return {
    profileId: row.profile_id as string,
    residentId: row.resident_id as string,
    revision: integer(row.revision),
    state: row.state as ReceivingProfile["state"],
    address: row.address as string | null,
    verifiedAt: row.verified_at === null ? null : integer(row.verified_at),
    updatedAt: integer(row.updated_at),
    network: "mainnet",
    fundingPublished: false,
  };
}
function decodeWorld(row: Row): RegisteredWorld {
  if (
    !registrationIdSchema.safeParse(row.registration_id).success ||
    typeof row.source_world_id !== "string" ||
    !/^world_[0-9a-f]{64}$/.test(row.source_world_id) ||
    typeof row.title !== "string" ||
    !row.title.trim() ||
    row.title.length > 80 ||
    !Array.isArray(row.residents) ||
    row.residents.length !== AGENT_IDS.length
  )
    throw new AgentRegistryStoreError("invalid");
  const residents = row.residents as Row[];
  const input = worldRegistrationSchema.safeParse({
    sourceWorldId: row.source_world_id,
    title: row.title,
    characters: residents.map((resident) => ({
      role: resident.role,
      sourceCharacterId: resident.source_character_id,
      name: resident.name,
    })),
  });
  if (
    !input.success ||
    residents.some((resident) => !residentIdSchema.safeParse(resident.resident_id).success) ||
    new Set(residents.map((resident) => resident.resident_id)).size !== AGENT_IDS.length
  )
    throw new AgentRegistryStoreError("invalid");
  return {
    registrationId: row.registration_id as string,
    sourceWorldId: row.source_world_id,
    title: row.title,
    createdAt: integer(row.created_at),
    residents: residents.map((resident) => ({
      residentId: resident.resident_id,
      sourceCharacterId: resident.source_character_id,
      role: resident.role,
      name: resident.name,
    })) as RegisteredResident[],
  };
}
function decodeProof(row: Row): ReceivingProof {
  if (
    typeof row.challenge_id !== "string" ||
    !NONCE.test(row.challenge_id) ||
    !registrationIdSchema.safeParse(row.registration_id).success ||
    !residentIdSchema.safeParse(row.resident_id).success ||
    !profileIdSchema.safeParse(row.profile_id).success ||
    !validateP2wpkhAddress(row.challenge_address) ||
    typeof row.challenge_message !== "string" ||
    !row.challenge_message.length ||
    row.challenge_message.length > 4096
  )
    throw new AgentRegistryStoreError("invalid");
  return {
    id: row.challenge_id,
    registrationId: row.registration_id as string,
    residentId: row.resident_id as string,
    profileId: row.profile_id as string,
    revision: integer(row.challenge_revision),
    address: row.challenge_address,
    message: row.challenge_message,
    expiresAt: integer(row.challenge_expires_at),
  };
}

/** Every operation receives its owner from verified server authentication. */
export class SqlAgentRegistryStore {
  constructor(private readonly sql: Pick<Sql, "query">) {}

  async registerWorld(
    ownerId: string,
    input: WorldRegistrationInput,
    now: number,
  ): Promise<RegisteredWorld> {
    owner(ownerId);
    integer(now);
    const checked = worldRegistrationSchema.safeParse(input);
    if (!checked.success) throw new AgentRegistryStoreError("invalid");
    const value = checked.data;
    const registrationId = `registration_${randomBytes(32).toString("hex")}`;
    const characters = value.characters.map((character) => ({
      resident_id: `resident_${randomBytes(32).toString("hex")}`,
      profile_id: `profile_${randomBytes(32).toString("hex")}`,
      source_character_id: character.sourceCharacterId,
      role: character.role,
      name: character.name,
    }));
    // Ten unique owner slots enforce the cap even when a waiting statement's
    // snapshot predates a concurrent registration. Retry only a lost slot race.
    for (let attempt = 0; attempt < 12; attempt++) {
      const rows = await this.sql.query<Row>(
        `
        with locked_owner as materialized (
          select id from "user" where id=$1 for update
        ), existing as materialized (
          select * from agent_registered_worlds where owner_id=$1 and source_world_id=$2
        ), available_slot as materialized (
          select slot from generate_series(0,9) slot where not exists (
            select 1 from agent_registered_worlds where owner_id=$1 and owner_slot=slot
          ) order by slot limit 1
        ), inserted_world as (
          insert into agent_registered_worlds(registration_id,owner_id,source_world_id,owner_slot,title,created_at)
          select $3,$1,$2,s.slot,$4,$5 from locked_owner cross join available_slot s
          where not exists(select 1 from existing)
          on conflict do nothing returning *
        ), inserted_residents as (
          insert into agent_registered_residents(resident_id,registration_id,source_character_id,role,name)
          select c.resident_id,w.registration_id,c.source_character_id,c.role,c.name
          from inserted_world w cross join jsonb_to_recordset($6::jsonb) as
            c(resident_id text,profile_id text,source_character_id text,role text,name text)
          returning *
        ), inserted_profiles as (
          insert into agent_receiving_profiles(profile_id,registration_id,resident_id,updated_at)
          select c.profile_id,r.registration_id,r.resident_id,$5 from inserted_residents r
          join jsonb_to_recordset($6::jsonb) as
            c(resident_id text,profile_id text,source_character_id text,role text,name text)
            on c.resident_id=r.resident_id
          returning profile_id
        ), selected as (select * from existing union all select * from inserted_world)
        select 'ready' as status,s.*,
          case when exists(select 1 from inserted_world) then
            (select jsonb_agg(to_jsonb(r) order by role) from inserted_residents r)
          else (select jsonb_agg(to_jsonb(r) order by role) from agent_registered_residents r
            where r.registration_id=s.registration_id) end as residents
        from selected s where not exists(select 1 from inserted_world)
          or (select count(*) from inserted_profiles)=8
        union all
        select case when not exists(select 1 from locked_owner) then 'invalid'
          when not exists(select 1 from available_slot) then 'limit' else 'retry' end,
          null,null,null,null,null,null,null
        where not exists(select 1 from selected)
      `,
        [
          ownerId,
          value.sourceWorldId,
          registrationId,
          value.title,
          now,
          JSON.stringify(characters),
        ],
      );
      const row = rows[0];
      if (row?.status === "ready") return decodeWorld(row);
      if (row?.status === "limit") throw new AgentRegistryStoreError("limit");
      if (row?.status !== "retry") throw new AgentRegistryStoreError("invalid");
    }
    throw new AgentRegistryStoreError("conflict");
  }

  async findWorld(ownerId: string, sourceWorldId: string): Promise<RegisteredWorld | null> {
    owner(ownerId);
    if (!/^world_[0-9a-f]{64}$/.test(sourceWorldId)) throw new AgentRegistryStoreError("invalid");
    const rows = await this.sql.query<Row>(
      `
      select w.*,(select jsonb_agg(to_jsonb(r) order by role) from agent_registered_residents r
        where r.registration_id=w.registration_id) as residents
      from agent_registered_worlds w where w.owner_id=$1 and w.source_world_id=$2
    `,
      [ownerId, sourceWorldId],
    );
    return rows[0] ? decodeWorld(rows[0]) : null;
  }

  async getWorld(
    ownerId: string,
    registrationId: string,
  ): Promise<{ world: RegisteredWorld; profiles: ReceivingProfile[] } | null> {
    scope(ownerId, registrationId);
    const rows = await this.sql.query<Row>(
      `
      select w.*,(select jsonb_agg(to_jsonb(r) order by role) from agent_registered_residents r
        where r.registration_id=w.registration_id) as residents,
        (select jsonb_agg(to_jsonb(p) order by resident_id) from agent_receiving_profiles p
          where p.registration_id=w.registration_id) as profiles
      from agent_registered_worlds w where w.owner_id=$1 and w.registration_id=$2
    `,
      [ownerId, registrationId],
    );
    if (!rows[0]) return null;
    if (!Array.isArray(rows[0].profiles) || rows[0].profiles.length !== AGENT_IDS.length)
      throw new AgentRegistryStoreError("invalid");
    return { world: decodeWorld(rows[0]), profiles: rows[0].profiles.map(decodeProfile) };
  }

  async getProfile(
    ownerId: string,
    registrationId: string,
    profileId: string,
  ): Promise<ReceivingProfile | null> {
    scope(ownerId, registrationId, profileId);
    const rows = await this.sql.query<Row>(
      `
      select p.* from agent_receiving_profiles p join agent_registered_worlds w using(registration_id)
      where w.owner_id=$1 and p.registration_id=$2 and p.profile_id=$3
    `,
      [ownerId, registrationId, profileId],
    );
    return rows[0] ? decodeProfile(rows[0]) : null;
  }

  async issueProof(ownerId: string, proof: ReceivingProof, now: number): Promise<boolean> {
    scope(ownerId, proof.registrationId, proof.profileId);
    integer(now);
    if (
      !NONCE.test(proof.id) ||
      !residentIdSchema.safeParse(proof.residentId).success ||
      !validateP2wpkhAddress(proof.address) ||
      !Number.isSafeInteger(proof.revision) ||
      proof.revision < 0 ||
      typeof proof.message !== "string" ||
      !proof.message.length ||
      proof.message.length > 4096 ||
      !Number.isSafeInteger(proof.expiresAt) ||
      proof.expiresAt <= now ||
      proof.expiresAt > now + 300_000
    )
      throw new AgentRegistryStoreError("invalid");
    const rows = await this.sql.query<Row>(
      `
      update agent_receiving_profiles p set last_challenge_at=$10,
        challenge_id=$6,challenge_revision=$5,challenge_address=$7,challenge_message=$8,
        challenge_issued_at=$10,challenge_expires_at=$9,challenge_used_at=null
      from agent_registered_worlds w where w.registration_id=p.registration_id and w.owner_id=$1
        and p.registration_id=$2 and p.profile_id=$3 and p.resident_id=$4 and p.revision=$5
        and (p.last_challenge_at is null or p.last_challenge_at<=$10::bigint-5000)
      returning p.profile_id
    `,
      [
        ownerId,
        proof.registrationId,
        proof.profileId,
        proof.residentId,
        proof.revision,
        proof.id,
        proof.address,
        proof.message,
        proof.expiresAt,
        now,
      ],
    );
    return rows.length === 1;
  }

  async consumeProof(
    ownerId: string,
    registrationId: string,
    profileId: string,
    challengeId: string,
    now: number,
  ): Promise<ReceivingProof | null> {
    scope(ownerId, registrationId, profileId);
    integer(now);
    if (!NONCE.test(challengeId)) return null;
    const rows = await this.sql.query<Row>(
      `
      update agent_receiving_profiles p set challenge_used_at=$5 from agent_registered_worlds w
      where w.registration_id=p.registration_id and w.owner_id=$1
        and p.registration_id=$2 and p.profile_id=$3 and p.challenge_id=$4
        and p.challenge_used_at is null and p.challenge_issued_at<=$5 and p.challenge_expires_at>$5
        and p.challenge_revision=p.revision returning p.*
    `,
      [ownerId, registrationId, profileId, challengeId, now],
    );
    return rows[0] ? decodeProof(rows[0]) : null;
  }

  async confirmProof(
    ownerId: string,
    registrationId: string,
    profileId: string,
    challengeId: string,
    now: number,
  ): Promise<ReceivingProfile | null> {
    scope(ownerId, registrationId, profileId);
    integer(now);
    if (!NONCE.test(challengeId)) return null;
    const rows = await this.sql.query<Row>(
      `
      with selected as materialized (
        select p.* from agent_receiving_profiles p join agent_registered_worlds w using(registration_id)
        where w.owner_id=$1 and p.registration_id=$2 and p.profile_id=$3 and p.challenge_id=$4
          and p.challenge_used_at is not null and p.challenge_used_at<=$5
          and p.challenge_issued_at<=$5 and p.challenge_expires_at>$5
          and p.challenge_revision=p.revision
        for update of p
      ), reserved as (
        insert into agent_receiving_address_reservations as existing
          (network,address,profile_id,first_verified_at,last_verified_at)
        select 'mainnet',challenge_address,profile_id,$5,$5 from selected
        on conflict(network,address) do update set last_verified_at=excluded.last_verified_at
          where existing.profile_id=excluded.profile_id
        returning address
      ), updated as (
        update agent_receiving_profiles p set address=s.challenge_address,verified_at=$5,
          updated_at=$5,state='draft',revision=p.revision+1,${CLEAR_PROOF}
        from selected s,reserved r where p.profile_id=s.profile_id and r.address=s.challenge_address
        returning p.*
      ) select 'ready' as status,to_jsonb(u) as profile from updated u
        union all select 'conflict',null where exists(select 1 from selected)
          and not exists(select 1 from reserved)
    `,
      [ownerId, registrationId, profileId, challengeId, now],
    );
    if (rows[0]?.status === "conflict") throw new AgentRegistryStoreError("conflict");
    return rows[0]?.profile ? decodeProfile(rows[0].profile as Row) : null;
  }

  async retireProfile(
    ownerId: string,
    registrationId: string,
    profileId: string,
    revision: number,
    now: number,
  ): Promise<boolean> {
    scope(ownerId, registrationId, profileId);
    integer(revision);
    integer(now);
    const rows = await this.sql.query<Row>(
      `
      update agent_receiving_profiles p set state='retired',revision=p.revision+1,updated_at=$5,${CLEAR_PROOF}
      from agent_registered_worlds w where w.registration_id=p.registration_id and w.owner_id=$1
        and p.registration_id=$2 and p.profile_id=$3 and p.revision=$4 returning p.profile_id
    `,
      [ownerId, registrationId, profileId, revision, now],
    );
    return rows.length === 1;
  }

  async cleanup(now: number, limit = 100): Promise<void> {
    integer(now);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new AgentRegistryStoreError("invalid");
    await this.sql.query(
      `
      with expired as (
        select profile_id from agent_receiving_profiles where challenge_expires_at<=$1
          order by challenge_expires_at limit $2 for update skip locked
      ) update agent_receiving_profiles p set ${CLEAR_PROOF}
        from expired e where p.profile_id=e.profile_id and p.challenge_expires_at<=$1
    `,
      [now, limit],
    );
  }
}
