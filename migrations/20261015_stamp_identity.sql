-- Read-only wallet proofs and cosmetics, private to an opaque HTTP session.
-- No account ownership, signing keys, spending authority or token custody.
create table stamp_identity_sessions (
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  world_id text not null check (world_id ~ '^world_[0-9a-f]{64}$'),
  character_id text not null check (character_id ~ '^character_[0-9a-f]{64}$'),
  created_at bigint not null check (created_at between 0 and 9007199254740991),
  expires_at bigint not null check (expires_at between 0 and 9007199254740991),
  last_challenge_at bigint not null,
  address text,
  proof_expires_at bigint check (proof_expires_at between 0 and 9007199254740991),
  appearance jsonb,
  appearance_revision bigint not null default 0 check (appearance_revision between 0 and 9007199254740991),
  challenge_id text,
  challenge_message text,
  challenge_address text,
  challenge_issued_at bigint,
  challenge_expires_at bigint,
  challenge_used_at bigint,
  primary key (session_hash, world_id, character_id),
  check ((address is null) = (proof_expires_at is null)),
  check (proof_expires_at is null or proof_expires_at <= expires_at),
  check (appearance is null or (address is not null and jsonb_typeof(appearance) = 'object')),
  check (
    (challenge_id is null and challenge_message is null and challenge_address is null
      and challenge_issued_at is null and challenge_expires_at is null and challenge_used_at is null)
    or
    (challenge_id is not null and challenge_message is not null and challenge_address is not null
      and challenge_issued_at is not null and challenge_expires_at is not null
      and challenge_expires_at <= expires_at
      and (challenge_used_at is null or challenge_used_at >= challenge_issued_at))
  )
);
create index stamp_identity_sessions_expiry on stamp_identity_sessions(expires_at);
