-- Private, bounded chain observations. No balances, crediting or signing authority.
create table agent_receiving_observations (
  profile_id text not null references agent_receiving_profiles(profile_id) on delete cascade,
  network text not null default 'mainnet' check (network = 'mainnet'),
  address text not null,
  sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 2),
  events jsonb not null default '[]'::jsonb
    check (jsonb_typeof(events) = 'array' and jsonb_array_length(events) <= 256),
  lease_token text check (lease_token ~ '^[0-9a-f]{64}$'),
  lease_expires_at bigint check (lease_expires_at between 0 and 9007199254740991),
  last_attempt_at bigint not null check (last_attempt_at between 0 and 9007199254740991),
  primary key(profile_id,address),
  foreign key(network,address,profile_id)
    references agent_receiving_address_reservations(network,address,profile_id),
  check ((lease_token is null) = (lease_expires_at is null))
);
