-- Private owner registrations and watch-only receiving drafts. No keys or custody.
create table agent_registered_worlds (
  registration_id text primary key check (registration_id ~ '^registration_[0-9a-f]{64}$'),
  owner_id text not null references "user"("id") on delete cascade,
  source_world_id text not null check (source_world_id ~ '^world_[0-9a-f]{64}$'),
  owner_slot smallint not null check (owner_slot between 0 and 9),
  title text not null check (length(btrim(title)) between 1 and 80),
  created_at bigint not null check (created_at between 0 and 9007199254740991),
  unique(owner_id, source_world_id),
  unique(owner_id, owner_slot)
);

create table agent_registered_residents (
  resident_id text primary key check (resident_id ~ '^resident_[0-9a-f]{64}$'),
  registration_id text not null references agent_registered_worlds(registration_id) on delete cascade,
  source_character_id text not null check (source_character_id ~ '^character_[0-9a-f]{64}$'),
  role text not null check (role in ('kevin','arwyn','northern','baba','sub','data','amelia','player')),
  name text not null check (length(btrim(name)) between 1 and 80),
  unique(registration_id, role),
  unique(registration_id, source_character_id),
  unique(resident_id, registration_id)
);

-- Deliberately retained without an owner/profile cascading FK: even deleting an
-- account must not make an old receiving address available to a different profile.
create table agent_receiving_address_reservations (
  network text not null check (network = 'mainnet'),
  address text not null check (address ~ '^bc1q[ac-hj-np-z02-9]{38}$'),
  profile_id text not null check (profile_id ~ '^profile_[0-9a-f]{64}$'),
  first_verified_at bigint not null check (first_verified_at between 0 and 9007199254740991),
  last_verified_at bigint not null check (last_verified_at between first_verified_at and 9007199254740991),
  primary key(network, address),
  unique(network,address,profile_id)
);
create index agent_address_reservations_profile on agent_receiving_address_reservations(profile_id);

create table agent_receiving_profiles (
  profile_id text primary key check (profile_id ~ '^profile_[0-9a-f]{64}$'),
  registration_id text not null references agent_registered_worlds(registration_id) on delete cascade,
  resident_id text not null unique,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  state text not null default 'unconfigured' check (state in ('unconfigured','draft','retired')),
  address text,
  verified_at bigint check (verified_at between 0 and 9007199254740991),
  updated_at bigint not null check (updated_at between 0 and 9007199254740991),
  network text not null default 'mainnet' check (network = 'mainnet'),
  funding_published boolean not null default false check (funding_published = false),
  last_challenge_at bigint check (last_challenge_at between 0 and 9007199254740991),
  challenge_id text,
  challenge_revision bigint,
  challenge_address text,
  challenge_message text,
  challenge_issued_at bigint,
  challenge_expires_at bigint,
  challenge_used_at bigint,
  foreign key(resident_id,registration_id) references agent_registered_residents(resident_id,registration_id) on delete cascade,
  foreign key(network,address,profile_id) references agent_receiving_address_reservations(network,address,profile_id),
  check ((address is null) = (verified_at is null)),
  check (state <> 'draft' or address is not null),
  check (state <> 'unconfigured' or address is null),
  check (
    (challenge_id is null and challenge_revision is null and challenge_address is null
      and challenge_message is null and challenge_issued_at is null
      and challenge_expires_at is null and challenge_used_at is null)
    or
    (challenge_id is not null and challenge_revision is not null and challenge_address is not null
      and challenge_message is not null and challenge_issued_at is not null and challenge_expires_at is not null
      and challenge_id ~ '^[0-9a-f]{48}$' and challenge_revision between 0 and 9007199254740991
      and challenge_address ~ '^bc1q[ac-hj-np-z02-9]{38}$'
      and length(challenge_message) between 1 and 4096
      and challenge_issued_at between 0 and 9007199254740991
      and challenge_expires_at > challenge_issued_at
      and challenge_expires_at <= challenge_issued_at + 300000
      and (challenge_used_at is null or challenge_used_at >= challenge_issued_at))
  )
);
create index agent_receiving_profiles_world on agent_receiving_profiles(registration_id);
create index agent_receiving_profiles_challenge_expiry on agent_receiving_profiles(challenge_expires_at)
  where challenge_id is not null;
