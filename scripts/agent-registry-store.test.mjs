import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { Address } from "bip322-js";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { SqlAgentRegistryStore } = await server.ssrLoadModule(
  "/src/lib/agent-wallets/store.server.ts",
);
const { AGENT_IDS } = await server.ssrLoadModule("/src/game/types.ts");
const database = new PGlite();
const store = new SqlAgentRegistryStore({
  query: async (text, params) => (await database.query(text, params)).rows,
});
before(async () => {
  await database.exec(
    await readFile(new URL("../migrations/auth/0001_auth.sql", import.meta.url), "utf8"),
  );
  await database.exec(
    await readFile(new URL("../migrations/20261016_agent_registry.sql", import.meta.url), "utf8"),
  );
});
beforeEach(async () => {
  await database.exec(
    'truncate agent_receiving_address_reservations,agent_receiving_profiles,agent_registered_residents,agent_registered_worlds,"user" cascade',
  );
  await database.query(
    'insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true),($3,$3,$4,true)',
    ["owner-one", "one@example.test", "owner-two", "two@example.test"],
  );
});
after(async () => {
  await database.close();
  await server.close();
});
const now = 1_800_000_000_000;
const hex = (value) => BigInt(value).toString(16).padStart(64, "0");
const address = Address.convertPubKeyIntoAddress(
  Buffer.from("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "hex"),
  "p2wpkh",
).mainnet;
const secondAddress = Address.convertPubKeyIntoAddress(
  Buffer.from("0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "hex"),
  "p2wpkh",
).mainnet;
function input(index = 1) {
  return {
    sourceWorldId: `world_${hex(index)}`,
    title: `Private town ${index}`,
    characters: AGENT_IDS.map((role, i) => ({
      role,
      sourceCharacterId: `character_${hex(index * 100 + i)}`,
      name: role,
    })),
  };
}
async function setup(ownerId = "owner-one", index = 1) {
  const world = await store.registerWorld(ownerId, input(index), now);
  const result = await store.getWorld(ownerId, world.registrationId);
  return { ownerId, world, profile: result.profiles[0], profiles: result.profiles };
}
function proof(record, at = now, changes = {}) {
  return {
    id: randomBytes(24).toString("hex"),
    registrationId: record.world.registrationId,
    residentId: record.profile.residentId,
    profileId: record.profile.profileId,
    revision: record.profile.revision,
    address,
    message: "Register this private, mainnet, watch-only receiving draft.",
    expiresAt: at + 300_000,
    ...changes,
  };
}
async function consumed(record, at = now, changes = {}) {
  const challenge = proof(record, at, changes);
  assert.equal(await store.issueProof(record.ownerId, challenge, at), true);
  assert.deepEqual(
    await store.consumeProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      challenge.id,
      at,
    ),
    challenge,
  );
  return challenge;
}
async function confirm(record, at = now, changes = {}) {
  const challenge = await consumed(record, at, changes);
  const profile = await store.confirmProof(
    record.ownerId,
    record.world.registrationId,
    record.profile.profileId,
    challenge.id,
    at,
  );
  assert.ok(profile);
  return { ...record, profile, challenge };
}
const hasCode = (code) => (error) => error.code === code;

test("registration atomically assigns eight server residents and unpublished empty receiving profiles", async () => {
  const { world, profiles } = await setup();
  assert.match(world.registrationId, /^registration_[a-f0-9]{64}$/);
  assert.equal(world.sourceWorldId, input().sourceWorldId);
  assert.equal(world.residents.length, 8);
  assert.equal(new Set(world.residents.map((resident) => resident.residentId)).size, 8);
  assert.equal(profiles.length, 8);
  for (const profile of profiles) {
    assert.match(profile.profileId, /^profile_[a-f0-9]{64}$/);
    assert.equal(profile.state, "unconfigured");
    assert.equal(profile.address, null);
    assert.equal(profile.verifiedAt, null);
    assert.equal(profile.revision, 0);
    assert.equal(profile.network, "mainnet");
    assert.equal(profile.fundingPublished, false);
    assert.ok(world.residents.some((resident) => resident.residentId === profile.residentId));
  }
});

test("parallel duplicate registrations return one idempotent private copy without regenerating its people", async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () => store.registerWorld("owner-one", input(), now)),
  );
  for (const world of results) assert.deepEqual(world, results[0]);
  assert.equal(
    (await database.query("select count(*)::int as count from agent_registered_worlds")).rows[0]
      .count,
    1,
  );
  assert.equal(
    (await database.query("select count(*)::int as count from agent_receiving_profiles")).rows[0]
      .count,
    8,
  );
  assert.deepEqual(await store.findWorld("owner-one", input().sourceWorldId), results[0]);
});

test("identical portable world and character IDs under another owner create independent private registrations", async () => {
  const first = await setup("owner-one");
  const second = await setup("owner-two");
  assert.notEqual(first.world.registrationId, second.world.registrationId);
  assert.deepEqual(
    first.world.residents.map((person) => person.sourceCharacterId),
    second.world.residents.map((person) => person.sourceCharacterId),
  );
  const ids = new Set(first.world.residents.map((person) => person.residentId));
  for (const person of second.world.residents) assert.equal(ids.has(person.residentId), false);
  assert.equal(await store.getWorld("owner-two", first.world.registrationId), null);
  assert.equal(
    await store.getProfile("owner-two", first.world.registrationId, first.profile.profileId),
    null,
  );
  assert.equal(
    await store.getProfile("owner-one", second.world.registrationId, first.profile.profileId),
    null,
  );
});

test("an idempotent registration preserves its original roster for the service's source-ID comparison", async () => {
  const original = await setup();
  const changed = input();
  changed.characters[0].sourceCharacterId = `character_${"f".repeat(64)}`;
  const returned = await store.registerWorld("owner-one", changed, now + 1);
  assert.deepEqual(returned, original.world);
});

test("ten unique owner slots enforce the world cap during parallel creation, while existing worlds remain readable", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) => store.registerWorld("owner-one", input(i + 1), now)),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 10);
  for (const result of results.filter((item) => item.status === "rejected"))
    assert.equal(result.reason.code, "limit");
  const rows = await database.query("select count(*)::int as count from agent_receiving_profiles");
  assert.equal(rows.rows[0].count, 80);
  const first = results.find((result) => result.status === "fulfilled").value;
  assert.deepEqual(
    await store.registerWorld(
      "owner-one",
      input(Number(BigInt(`0x${first.sourceWorldId.slice(6)}`))),
      now + 1,
    ),
    first,
  );
  assert.ok(await store.registerWorld("owner-two", input(50), now));
});

test("invalid input, missing owners and profile insertion failure leave no partial registration", async () => {
  const malformed = input();
  malformed.characters.pop();
  await assert.rejects(store.registerWorld("owner-one", malformed, now), hasCode("invalid"));
  await assert.rejects(store.registerWorld("missing-owner", input(), now), hasCode("invalid"));
  await database.exec(
    "alter table agent_receiving_profiles add constraint fixture_insert_failure check (state='draft')",
  );
  try {
    await assert.rejects(store.registerWorld("owner-one", input(), now));
  } finally {
    await database.exec(
      "alter table agent_receiving_profiles drop constraint fixture_insert_failure",
    );
  }
  for (const table of [
    "agent_registered_worlds",
    "agent_registered_residents",
    "agent_receiving_profiles",
  ])
    assert.equal(
      (await database.query(`select count(*)::int as count from ${table}`)).rows[0].count,
      0,
    );
});

test("proof issue, consume and confirm enforce owner, world, resident, revision and one-use boundaries", async () => {
  const record = await setup();
  const another = await setup("owner-one", 2);
  const challenge = proof(record);
  assert.equal(await store.issueProof("owner-two", challenge, now), false);
  assert.equal(
    await store.issueProof(
      record.ownerId,
      { ...challenge, residentId: another.profile.residentId },
      now,
    ),
    false,
  );
  assert.equal(await store.issueProof(record.ownerId, { ...challenge, revision: 1 }, now), false);
  assert.equal(await store.issueProof(record.ownerId, challenge, now), true);
  assert.equal(
    await store.consumeProof(
      "owner-two",
      record.world.registrationId,
      record.profile.profileId,
      challenge.id,
      now,
    ),
    null,
  );
  assert.equal(
    await store.consumeProof(
      record.ownerId,
      another.world.registrationId,
      record.profile.profileId,
      challenge.id,
      now,
    ),
    null,
  );
  assert.equal(
    await store.confirmProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      challenge.id,
      now,
    ),
    null,
    "a signature must first consume its exact challenge",
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      store.consumeProof(
        record.ownerId,
        record.world.registrationId,
        record.profile.profileId,
        challenge.id,
        now,
      ),
    ),
  );
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(
    await store.consumeProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      challenge.id,
      now,
    ),
    null,
    "a failed signature cannot retry the same nonce",
  );
  assert.equal(
    await store.confirmProof(
      "owner-two",
      record.world.registrationId,
      record.profile.profileId,
      challenge.id,
      now,
    ),
    null,
  );
  const confirms = await Promise.all(
    [1, 2].map(() =>
      store.confirmProof(
        record.ownerId,
        record.world.registrationId,
        record.profile.profileId,
        challenge.id,
        now,
      ),
    ),
  );
  assert.equal(confirms.filter(Boolean).length, 1);
  assert.equal(confirms.find(Boolean).revision, 1);
  assert.equal(confirms.find(Boolean).state, "draft");
});

test("nonce issue is rate limited, superseded and bounded by five minutes", async () => {
  const record = await setup();
  const first = proof(record);
  assert.equal(await store.issueProof(record.ownerId, first, now), true);
  assert.equal(await store.issueProof(record.ownerId, proof(record, now + 1), now + 1), false);
  const second = proof(record, now + 5000);
  assert.equal(await store.issueProof(record.ownerId, second, now + 5000), true);
  assert.equal(
    await store.consumeProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      first.id,
      now + 5000,
    ),
    null,
  );
  assert.equal(
    await store.consumeProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      second.id,
      second.expiresAt,
    ),
    null,
  );
  await assert.rejects(
    store.issueProof(record.ownerId, proof(record, now, { expiresAt: now + 300001 }), now),
    hasCode("invalid"),
  );
  await assert.rejects(
    store.issueProof(record.ownerId, proof(record, now, { address: "bc1qbad" }), now),
    hasCode("invalid"),
  );
});

test("the same mainnet address can be reserved by only one profile across concurrent owners", async () => {
  const first = await setup("owner-one");
  const second = await setup("owner-two");
  const [one, two] = await Promise.all([consumed(first), consumed(second)]);
  const results = await Promise.allSettled([
    store.confirmProof(
      first.ownerId,
      first.world.registrationId,
      first.profile.profileId,
      one.id,
      now,
    ),
    store.confirmProof(
      second.ownerId,
      second.world.registrationId,
      second.profile.profileId,
      two.id,
      now,
    ),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled" && result.value).length, 1);
  assert.equal(
    results.filter((result) => result.status === "rejected" && result.reason.code === "conflict")
      .length,
    1,
  );
  const reservations = await database.query("select * from agent_receiving_address_reservations");
  assert.equal(reservations.rows.length, 1);
  const profiles = await database.query(
    "select * from agent_receiving_profiles where state='draft'",
  );
  assert.equal(profiles.rows.length, 1);
  assert.equal(profiles.rows[0].profile_id, reservations.rows[0].profile_id);
});

test("retirement is revision guarded, clears pending proofs and preserves its address and reservation", async () => {
  const record = await confirm(await setup());
  const pending = proof(record, now + 5000);
  assert.equal(await store.issueProof(record.ownerId, pending, now + 5000), true);
  assert.equal(
    await store.retireProfile(
      "owner-two",
      record.world.registrationId,
      record.profile.profileId,
      record.profile.revision,
      now + 5001,
    ),
    false,
  );
  assert.equal(
    await store.retireProfile(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      0,
      now + 5001,
    ),
    false,
  );
  assert.equal(
    await store.retireProfile(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      1,
      now + 5001,
    ),
    true,
  );
  assert.equal(
    await store.consumeProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      pending.id,
      now + 5002,
    ),
    null,
  );
  const retired = await store.getProfile(
    record.ownerId,
    record.world.registrationId,
    record.profile.profileId,
  );
  assert.equal(retired.state, "retired");
  assert.equal(retired.revision, 2);
  assert.equal(retired.address, address);
  assert.equal(retired.verifiedAt, now);
  assert.equal(retired.fundingPublished, false);
  const refreshed = await confirm({ ...record, profile: retired }, now + 10000);
  assert.equal(refreshed.profile.state, "draft");
  assert.equal(refreshed.profile.revision, 3);
  const reservation = (await database.query("select * from agent_receiving_address_reservations"))
    .rows[0];
  assert.equal(Number(reservation.first_verified_at), now);
  assert.equal(Number(reservation.last_verified_at), now + 10000);
});

test("retired and replaced addresses remain reserved and cannot be reassigned to another profile", async () => {
  const first = await confirm(await setup());
  const changed = await confirm(first, now + 5000, { address: secondAddress });
  assert.equal(changed.profile.address, secondAddress);
  assert.equal(
    (
      await database.query(
        "select count(*)::int as count from agent_receiving_address_reservations",
      )
    ).rows[0].count,
    2,
  );
  await store.retireProfile(
    first.ownerId,
    first.world.registrationId,
    first.profile.profileId,
    changed.profile.revision,
    now + 5001,
  );
  const other = await setup("owner-two");
  for (const [index, reserved] of [address, secondAddress].entries()) {
    const challenge = await consumed(other, now + index * 5000, { address: reserved });
    await assert.rejects(
      store.confirmProof(
        other.ownerId,
        other.world.registrationId,
        other.profile.profileId,
        challenge.id,
        now + index * 5000,
      ),
      hasCode("conflict"),
    );
  }
});

test("confirmation failure rolls back the address reservation and leaves a consumed proof retryable", async () => {
  const record = await setup();
  const challenge = await consumed(record);
  await database.exec(
    "alter table agent_receiving_profiles add constraint fixture_confirm_failure check (address is null)",
  );
  try {
    await assert.rejects(
      store.confirmProof(
        record.ownerId,
        record.world.registrationId,
        record.profile.profileId,
        challenge.id,
        now,
      ),
    );
    assert.equal(
      (
        await database.query(
          "select count(*)::int as count from agent_receiving_address_reservations",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await store.getProfile(
          record.ownerId,
          record.world.registrationId,
          record.profile.profileId,
        )
      ).state,
      "unconfigured",
    );
  } finally {
    await database.exec(
      "alter table agent_receiving_profiles drop constraint fixture_confirm_failure",
    );
  }
  assert.equal(
    (
      await store.confirmProof(
        record.ownerId,
        record.world.registrationId,
        record.profile.profileId,
        challenge.id,
        now,
      )
    ).state,
    "draft",
  );
});

test("the database rejects associating one profile with another profile's reserved address", async () => {
  const first = await confirm(await setup());
  const second = await setup("owner-two");
  await assert.rejects(
    database.query(
      "update agent_receiving_profiles set address=$1,verified_at=$2,state='draft' where profile_id=$3",
      [address, now, second.profile.profileId],
    ),
    (error) => error.code === "23503",
  );
  assert.equal(
    (await store.getProfile(second.ownerId, second.world.registrationId, second.profile.profileId))
      .address,
    null,
  );
  assert.equal(
    (await store.getProfile(first.ownerId, first.world.registrationId, first.profile.profileId))
      .address,
    address,
  );
});

test("a consumed proof cannot confirm after retirement, a revision change or its expiry", async () => {
  const record = await setup();
  const challenge = await consumed(record);
  assert.equal(
    await store.retireProfile(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      0,
      now + 1,
    ),
    true,
  );
  assert.equal(
    await store.confirmProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      challenge.id,
      now + 2,
    ),
    null,
  );
  const retired = await store.getProfile(
    record.ownerId,
    record.world.registrationId,
    record.profile.profileId,
  );
  const second = await consumed({ ...record, profile: retired }, now + 5000);
  assert.equal(
    await store.confirmProof(
      record.ownerId,
      record.world.registrationId,
      record.profile.profileId,
      second.id,
      second.expiresAt,
    ),
    null,
  );
});

test("cleanup is bounded and never clears an active nonce or an existing address", async () => {
  const record = await confirm(await setup());
  const first = await consumed(record, now + 5000);
  const another = { ...record, profile: record.profiles[1] };
  const full = await store.getWorld(record.ownerId, record.world.registrationId);
  another.profile = full.profiles.find((profile) => profile.profileId !== record.profile.profileId);
  const second = await consumed(another, now + 5000);
  const third = {
    ...record,
    profile: full.profiles.find(
      (profile) =>
        ![record.profile.profileId, another.profile.profileId].includes(profile.profileId),
    ),
  };
  const active = proof(third, first.expiresAt);
  await store.issueProof(third.ownerId, active, first.expiresAt);
  await store.cleanup(first.expiresAt, 1);
  const expired = await database.query(
    "select count(*)::int as count from agent_receiving_profiles where challenge_id in ($1,$2)",
    [first.id, second.id],
  );
  assert.equal(expired.rows[0].count, 1);
  assert.equal(
    (await store.getProfile(record.ownerId, record.world.registrationId, record.profile.profileId))
      .address,
    address,
  );
  assert.ok(
    await store.consumeProof(
      third.ownerId,
      third.world.registrationId,
      third.profile.profileId,
      active.id,
      first.expiresAt,
    ),
  );
  await assert.rejects(store.cleanup(now, 1001), hasCode("invalid"));
});

test("schema constraints prohibit publication, another network and incomplete proof records", async () => {
  const record = await setup();
  for (const assignment of [
    "funding_published=true",
    "network='testnet'",
    "challenge_id='" + "f".repeat(48) + "'",
  ])
    await assert.rejects(
      database.query(`update agent_receiving_profiles set ${assignment} where profile_id=$1`, [
        record.profile.profileId,
      ]),
    );
});

test("deleting an owner removes its private registry while retaining permanent address tombstones", async () => {
  const first = await confirm(await setup());
  await database.query('delete from "user" where id=$1', [first.ownerId]);
  assert.equal(await store.getWorld(first.ownerId, first.world.registrationId), null);
  assert.equal(
    (
      await database.query(
        "select count(*)::int as count from agent_receiving_address_reservations",
      )
    ).rows[0].count,
    1,
  );
  const second = await setup("owner-two");
  const challenge = await consumed(second);
  await assert.rejects(
    store.confirmProof(
      second.ownerId,
      second.world.registrationId,
      second.profile.profileId,
      challenge.id,
      now,
    ),
    hasCode("conflict"),
  );
});
