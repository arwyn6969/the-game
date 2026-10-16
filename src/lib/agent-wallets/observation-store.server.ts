import { randomBytes } from "node:crypto";
import type { Sql } from "../db";
import { validateP2wpkhAddress } from "../stamps/proof.server";
import { ownerReference } from "./owner-reference";
import { profileIdSchema, registrationIdSchema } from "./validation";
import type {
  ChainAnchor,
  KnownObservation,
  ObservationProtocol,
  ObservationScan,
  ObservationSource,
  ReceivingObservations,
  TransferObservation,
} from "./observations";

const PROTOCOLS: ObservationProtocol[] = ["bitcoin", "counterparty"];
const HASH = /^[0-9a-f]{64}$/;
const UINT64_MAX = 18_446_744_073_709_551_615n;
const BITCOIN_MAX = 2_100_000_000_000_000n;
const MAX_EVENTS = 256;
type Row = Record<string, unknown>;
type Results = { bitcoin: ObservationScan | null; counterparty: ObservationScan | null };

export class AgentObservationStoreError extends Error {
  constructor(readonly code: "stale" | "invalid" | "rate-limited") {
    super(
      code === "stale"
        ? "This private profile changed. Refresh it."
        : "Invalid chain observation data.",
    );
    this.name = "AgentObservationStoreError";
  }
}
function invalid(): never {
  throw new AgentObservationStoreError("invalid");
}
function integer(value: unknown): number {
  if (typeof value === "bigint" || (typeof value === "string" && /^\d+$/.test(value)))
    value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Row;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !HASH.test(value)) invalid();
  return value;
}
function label(value: unknown, maximum = 256): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > maximum ||
    [...value].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)
  )
    invalid();
  return value;
}
function scope(ownerId: string, registrationId: string, profileId: string, revision: number): void {
  label(ownerId);
  if (
    ownerId === "dev-user" ||
    !registrationIdSchema.safeParse(registrationId).success ||
    !profileIdSchema.safeParse(profileId).success ||
    typeof revision !== "number"
  )
    invalid();
  integer(revision);
}
function block(value: unknown): ChainAnchor | null {
  if (value === null) return null;
  const b = object(value);
  if (typeof b.height !== "number") invalid();
  return { height: integer(b.height), hash: hash(b.hash) };
}
function transfer(
  value: unknown,
  protocol: ObservationProtocol,
  address: string,
): TransferObservation {
  const e = object(value);
  if (e.protocol !== protocol || e.destination !== address || typeof e.eventIndex !== "number")
    invalid();
  const txid = hash(e.txid),
    eventIndex = integer(e.eventIndex);
  if (
    e.eventId !== `${protocol}:${txid}:${eventIndex}` ||
    typeof e.quantity !== "string" ||
    !/^[1-9][0-9]{0,19}$/.test(e.quantity) ||
    BigInt(e.quantity) > UINT64_MAX
  )
    invalid();
  if (protocol === "bitcoin" && BigInt(e.quantity) > BITCOIN_MAX) invalid();
  const asset = label(e.asset, 250);
  if (protocol === "bitcoin" ? asset !== "BTC" : !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,249}$/.test(asset))
    invalid();
  return {
    eventId: e.eventId as string,
    protocol,
    txid,
    eventIndex,
    source: e.source === null ? null : label(e.source),
    destination: address,
    asset,
    quantity: e.quantity,
    block: block(e.block),
  };
}
function knownEvents(value: unknown, address: string): KnownObservation[] {
  if (!Array.isArray(value) || value.length > MAX_EVENTS) invalid();
  const seen = new Set<string>();
  return value.map((raw) => {
    const e = object(raw);
    if (
      !PROTOCOLS.includes(e.protocol as ObservationProtocol) ||
      !["pending", "confirmed", "reorged", "unknown"].includes(String(e.state)) ||
      typeof e.wasReorged !== "boolean"
    )
      invalid();
    const event = transfer(e, e.protocol as ObservationProtocol, address);
    if (
      seen.has(event.eventId) ||
      (e.state === "confirmed" && !event.block) ||
      (e.state === "pending" && event.block) ||
      (e.state === "reorged" && !e.wasReorged)
    )
      invalid();
    seen.add(event.eventId);
    const firstObservedAt = integer(e.firstObservedAt),
      lastObservedAt = integer(e.lastObservedAt);
    if (lastObservedAt < firstObservedAt) invalid();
    return {
      ...event,
      state: e.state as KnownObservation["state"],
      firstObservedAt,
      lastObservedAt,
      wasReorged: e.wasReorged,
    };
  });
}
function defaults(): ObservationSource[] {
  return PROTOCOLS.map((protocol) => ({
    protocol,
    status: "not-checked",
    observedAt: null,
    attemptedAt: null,
    anchor: null,
    indexedHeight: null,
    historyComplete: false,
    mempoolComplete: false,
  }));
}
function sources(value: unknown): ObservationSource[] {
  if (!Array.isArray(value) || value.length > 2) invalid();
  const result = defaults(),
    seen = new Set<string>();
  for (const raw of value) {
    const s = object(raw),
      protocol = s.protocol as ObservationProtocol;
    if (
      !PROTOCOLS.includes(protocol) ||
      seen.has(protocol) ||
      !["not-checked", "ready", "partial", "unavailable"].includes(String(s.status)) ||
      typeof s.historyComplete !== "boolean" ||
      typeof s.mempoolComplete !== "boolean"
    )
      invalid();
    seen.add(protocol);
    result[PROTOCOLS.indexOf(protocol)] = {
      protocol,
      status: s.status as ObservationSource["status"],
      observedAt: s.observedAt === null ? null : integer(s.observedAt),
      attemptedAt: s.attemptedAt === null ? null : integer(s.attemptedAt),
      anchor: block(s.anchor),
      indexedHeight: s.indexedHeight === null ? null : integer(s.indexedHeight),
      historyComplete: s.historyComplete,
      mempoolComplete: s.mempoolComplete,
    };
  }
  return result;
}
function checkedScan(
  value: ObservationScan | null,
  protocol: ObservationProtocol,
  address: string,
): ObservationScan | null {
  if (value === null) return null;
  const s = object(value),
    anchor = block(s.anchor);
  if (
    !anchor ||
    s.protocol !== protocol ||
    typeof s.indexedHeight !== "number" ||
    integer(s.indexedHeight) > anchor.height ||
    typeof s.historyComplete !== "boolean" ||
    typeof s.mempoolComplete !== "boolean" ||
    !Array.isArray(s.events) ||
    s.events.length > 200 ||
    !Array.isArray(s.orphanedEventIds) ||
    s.orphanedEventIds.length > MAX_EVENTS
  )
    invalid();
  const events = s.events.map((e) => transfer(e, protocol, address));
  if (
    new Set(events.map((e) => e.eventId)).size !== events.length ||
    events.some((e) => e.block && e.block.height > (s.indexedHeight as number))
  )
    invalid();
  const prefix = `${protocol}:`;
  const orphanedEventIds = s.orphanedEventIds.map((id) => {
    if (typeof id !== "string" || !id.startsWith(prefix)) invalid();
    const parts = id.split(":");
    if (
      parts.length !== 3 ||
      !HASH.test(parts[1]) ||
      !/^(0|[1-9][0-9]*)$/.test(parts[2]) ||
      !Number.isSafeInteger(Number(parts[2]))
    )
      invalid();
    return id;
  });
  if (new Set(orphanedEventIds).size !== orphanedEventIds.length) invalid();
  return {
    protocol,
    anchor,
    indexedHeight: s.indexedHeight as number,
    historyComplete: s.historyComplete,
    mempoolComplete: s.mempoolComplete,
    events,
    orphanedEventIds,
  };
}
function fingerprint(e: TransferObservation): string {
  return JSON.stringify([
    e.protocol,
    e.txid,
    e.eventIndex,
    e.source,
    e.destination,
    e.asset,
    e.quantity,
  ]);
}
function merge(
  oldEvents: KnownObservation[],
  oldSources: ObservationSource[],
  results: Results,
  now: number,
) {
  const events = new Map(oldEvents.map((e) => [e.eventId, { ...e }]));
  const nextSources = oldSources.map((source) => {
    const scan = results[source.protocol];
    if (scan === null) {
      for (const e of events.values())
        if (e.protocol === source.protocol && e.state === "pending") e.state = "unknown";
      return {
        ...source,
        status: "unavailable" as const,
        attemptedAt: now,
        historyComplete: false,
        mempoolComplete: false,
      };
    }
    let limited = false;
    const incoming = new Set(scan.events.map((e) => e.eventId));
    const orphaned = new Set(
      scan.orphanedEventIds.filter((id) => {
        const previous = events.get(id);
        return previous?.protocol === source.protocol && previous.block !== null;
      }),
    );
    for (const e of events.values()) {
      if (e.protocol !== source.protocol) continue;
      if (orphaned.has(e.eventId) && e.block) {
        e.state = "reorged";
        e.wasReorged = true;
        e.lastObservedAt = now;
      } else if (e.state === "pending" && !incoming.has(e.eventId)) e.state = "unknown";
    }
    for (const event of scan.events) {
      const previous = events.get(event.eventId);
      if (previous && fingerprint(previous) !== fingerprint(event)) {
        previous.state = "unknown";
        previous.lastObservedAt = now;
        limited = true;
        continue;
      }
      if (!previous && events.size >= MAX_EVENTS) {
        limited = true;
        continue;
      }
      // An old canonical confirmation is not undone by a lagging mempool view.
      if (
        previous?.state === "confirmed" &&
        previous.block &&
        !event.block &&
        !orphaned.has(event.eventId)
      ) {
        previous.lastObservedAt = now;
        continue;
      }
      const changedBlock =
        previous?.block &&
        event.block &&
        (previous.block.hash !== event.block.hash || previous.block.height !== event.block.height);
      events.set(event.eventId, {
        ...event,
        state: event.block ? "confirmed" : "pending",
        firstObservedAt: previous?.firstObservedAt ?? now,
        lastObservedAt: now,
        wasReorged: Boolean(previous?.wasReorged || orphaned.has(event.eventId) || changedBlock),
      });
    }
    return {
      protocol: source.protocol,
      status:
        limited ||
        !scan.historyComplete ||
        !scan.mempoolComplete ||
        scan.indexedHeight < scan.anchor.height
          ? ("partial" as const)
          : ("ready" as const),
      observedAt: now,
      attemptedAt: now,
      anchor: scan.anchor,
      indexedHeight: scan.indexedHeight,
      historyComplete: scan.historyComplete && !limited,
      mempoolComplete: scan.mempoolComplete && !limited,
    };
  });
  return { events: [...events.values()], sources: nextSources };
}

export class SqlAgentObservationStore {
  constructor(private readonly sql: Pick<Sql, "query">) {}

  async load(
    ownerId: string,
    registrationId: string,
    profileId: string,
    revision: number,
    address?: string,
    addressPage = 1,
  ): Promise<ReceivingObservations> {
    scope(ownerId, registrationId, profileId, revision);
    if (
      !Number.isSafeInteger(addressPage) ||
      addressPage < 1 ||
      addressPage > 1_000_000 ||
      (address !== undefined && !validateP2wpkhAddress(address))
    )
      invalid();
    const rows = await this.sql.query<Row>(
      `
      with owned as materialized (
        select p.* from agent_receiving_profiles p join agent_registered_worlds w using(registration_id)
        where w.owner_id=$1 and p.registration_id=$2 and p.profile_id=$3 and p.revision=$4
      ), reserved as materialized (
        select r.address,r.last_verified_at as verified_at,coalesce(r.address=p.address,false) as current
        from agent_receiving_address_reservations r join owned p on p.profile_id=r.profile_id
        where r.network='mainnet'
      ), windowed as materialized (
        select * from reserved order by current desc,verified_at desc,address limit 20 offset $6
      ), selected as (
        select case when $5::text is null then (select address from windowed order by current desc,verified_at desc,address limit 1)
          else (select address from windowed where address=$5) end as chosen
      ) select p.profile_id,p.revision,(select count(*) from reserved) as address_count,
        coalesce((select jsonb_agg(to_jsonb(a) order by current desc,verified_at desc,address) from windowed a),'[]') as addresses,
        s.chosen,o.sources,o.events
      from owned p cross join selected s left join agent_receiving_observations o on o.profile_id=p.profile_id and o.address=s.chosen
    `,
      [ownerId, registrationId, profileId, revision, address ?? null, (addressPage - 1) * 20],
    );
    if (!rows[0]) throw new AgentObservationStoreError("stale");
    const row = rows[0],
      count = integer(row.address_count),
      addressPages = Math.max(1, Math.ceil(count / 20));
    if (addressPage > addressPages || (address !== undefined && row.chosen !== address)) invalid();
    if (!Array.isArray(row.addresses) || row.addresses.length > 20) invalid();
    const addresses = row.addresses.map((raw) => {
      const a = object(raw);
      if (!validateP2wpkhAddress(a.address) || typeof a.current !== "boolean") invalid();
      return { address: a.address, verifiedAt: integer(a.verified_at), current: a.current };
    });
    const chosen = row.chosen === null ? null : row.chosen;
    if (
      chosen !== null &&
      (!validateP2wpkhAddress(chosen) || !addresses.some((a) => a.address === chosen))
    )
      invalid();
    const events = chosen ? knownEvents(row.events ?? [], chosen) : [];
    events.sort(
      (a, b) => b.lastObservedAt - a.lastObservedAt || a.eventId.localeCompare(b.eventId),
    );
    return {
      ownerRef: ownerReference(ownerId),
      registrationId,
      profileId,
      revision,
      address: chosen as string | null,
      addresses,
      addressPage,
      addressPages,
      sources: sources(row.sources ?? []),
      events: events.slice(0, 100),
      hasMoreEvents: events.length > 100,
      fundingPublished: false,
    };
  }

  async claim(
    ownerId: string,
    registrationId: string,
    profileId: string,
    revision: number,
    address: string,
    now: number,
  ): Promise<{ token: string; known: KnownObservation[] } | null> {
    scope(ownerId, registrationId, profileId, revision);
    integer(now);
    if (!validateP2wpkhAddress(address) || now > Number.MAX_SAFE_INTEGER - 45_000) invalid();
    const token = randomBytes(32).toString("hex");
    const rows = await this.sql.query<Row>(
      `
      with owned as materialized (
        select p.profile_id from agent_receiving_profiles p join agent_registered_worlds w using(registration_id)
        join agent_receiving_address_reservations r on r.profile_id=p.profile_id and r.network='mainnet' and r.address=$5
        where w.owner_id=$1 and p.registration_id=$2 and p.profile_id=$3 and p.revision=$4 for update of p
      ) insert into agent_receiving_observations as old(profile_id,address,last_attempt_at,lease_token,lease_expires_at)
        select profile_id,$5,$6,$7,$6::bigint+45000 from owned
        on conflict(profile_id,address) do update set last_attempt_at=excluded.last_attempt_at,
          lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at
        where (old.lease_expires_at is null or old.lease_expires_at<=$6)
          and old.last_attempt_at<=$6::bigint-30000
        returning events
    `,
      [ownerId, registrationId, profileId, revision, address, now, token],
    );
    return rows[0] ? { token, known: knownEvents(rows[0].events, address) } : null;
  }

  async complete(
    ownerId: string,
    registrationId: string,
    profileId: string,
    revision: number,
    address: string,
    token: string,
    results: Results,
    now: number,
  ): Promise<boolean> {
    scope(ownerId, registrationId, profileId, revision);
    integer(now);
    hash(token);
    if (!validateP2wpkhAddress(address) || !results || typeof results !== "object") invalid();
    const checked: Results = {
      bitcoin: checkedScan(results.bitcoin, "bitcoin", address),
      counterparty: checkedScan(results.counterparty, "counterparty", address),
    };
    const rows = await this.sql.query<Row>(
      `
      select o.* from agent_receiving_observations o join agent_receiving_profiles p using(profile_id)
      join agent_registered_worlds w using(registration_id)
      join agent_receiving_address_reservations r on r.profile_id=o.profile_id and r.address=o.address and r.network=o.network
      where w.owner_id=$1 and p.registration_id=$2 and p.profile_id=$3 and p.revision=$4 and o.address=$5
        and o.lease_token=$6 and o.lease_expires_at>$7 and o.last_attempt_at<=$7
    `,
      [ownerId, registrationId, profileId, revision, address, token, now],
    );
    if (!rows[0]) return false;
    const previous = rows[0],
      oldEvents = knownEvents(previous.events, address),
      oldSources = sources(previous.sources);
    if (
      oldEvents.some((e) => e.lastObservedAt > now) ||
      oldSources.some((s) => (s.attemptedAt ?? 0) > now)
    )
      return false;
    const merged = merge(oldEvents, oldSources, checked, now);
    const updated = await this.sql.query<Row>(
      `
      with owned as materialized (
        select p.profile_id from agent_receiving_profiles p join agent_registered_worlds w using(registration_id)
        join agent_receiving_address_reservations r on r.profile_id=p.profile_id and r.address=$5 and r.network='mainnet'
        where w.owner_id=$1 and p.registration_id=$2 and p.profile_id=$3 and p.revision=$4 for update of p
      ) update agent_receiving_observations o set sources=$8::jsonb,events=$9::jsonb,lease_token=null,lease_expires_at=null
      from owned p where o.profile_id=p.profile_id and o.address=$5 and o.lease_token=$6
        and o.lease_expires_at>$7 and o.last_attempt_at<=$7 returning o.profile_id
    `,
      [
        ownerId,
        registrationId,
        profileId,
        revision,
        address,
        token,
        now,
        JSON.stringify(merged.sources),
        JSON.stringify(merged.events),
      ],
    );
    return updated.length === 1;
  }
}
