-- Shared request/token reservations. Never stores prompts, outputs or keys.
create table mind_pool_health (
  scope text primary key,
  blocked boolean not null default false,
  cooldown_until bigint not null default 0,
  json_mode boolean not null default true
);

create table mind_pool_attempts (
  id text primary key,
  provider text not null,
  model text not null,
  kind text not null,
  started_at bigint not null,
  expires_at bigint not null,
  completed_at bigint,
  reserved_tokens integer not null,
  actual_tokens integer,
  outcome text,
  status integer,
  latency_ms integer
);
create index mind_pool_attempts_provider_time on mind_pool_attempts (provider, started_at);

-- The account row lock serializes reservations across every process and model.
-- Rolling windows avoid doubling RPM at a minute boundary, and avoid assuming
-- a provider's daily/monthly timezone. Failed/unknown attempts consume quota.
create function mind_pool_reserve(
  p_provider text, p_model text, p_kind text, p_tokens integer,
  p_limits jsonb, p_lease_ms integer
) returns table (attempt_id text, json_mode boolean) language plpgsql as $$
declare
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_account mind_pool_health%rowtype;
  v_model mind_pool_health%rowtype;
  v_rpm bigint; v_rpd bigint; v_month bigint; v_tpm bigint; v_tpd bigint; v_live bigint;
  v_id text := gen_random_uuid()::text;
begin
  insert into mind_pool_health(scope) values ('account/' || p_provider) on conflict do nothing;
  select * into v_account from mind_pool_health where scope = 'account/' || p_provider for update;
  insert into mind_pool_health(scope) values ('model/' || p_provider || '/' || p_model) on conflict do nothing;
  select * into v_model from mind_pool_health where scope = 'model/' || p_provider || '/' || p_model for update;
  if v_account.blocked or v_model.blocked or v_account.cooldown_until > v_now or v_model.cooldown_until > v_now then
    return;
  end if;
  delete from mind_pool_attempts where provider = p_provider and started_at < v_now - 2764800000;
  select
    count(*) filter (where started_at > v_now - 60000),
    count(*) filter (where started_at > v_now - 86400000),
    count(*) filter (where started_at > v_now - 2678400000),
    coalesce(sum(greatest(reserved_tokens, coalesce(actual_tokens, 0))) filter (where started_at > v_now - 60000), 0),
    coalesce(sum(greatest(reserved_tokens, coalesce(actual_tokens, 0))) filter (where started_at > v_now - 86400000), 0),
    count(*) filter (where completed_at is null and expires_at > v_now)
  into v_rpm, v_rpd, v_month, v_tpm, v_tpd, v_live
  from mind_pool_attempts where provider = p_provider;
  if v_rpm >= (p_limits->>'rpm')::bigint or v_rpd >= (p_limits->>'rpd')::bigint or
    v_month >= (p_limits->>'monthly')::bigint or v_tpm + p_tokens > (p_limits->>'tpm')::bigint or
    v_tpd + p_tokens > (p_limits->>'tpd')::bigint or v_live >= (p_limits->>'concurrent')::bigint then
    return;
  end if;
  insert into mind_pool_attempts(id, provider, model, kind, started_at, expires_at, reserved_tokens)
    values (v_id, p_provider, p_model, p_kind, v_now, v_now + p_lease_ms, p_tokens);
  return query select v_id, v_model.json_mode;
end;
$$;

create function mind_pool_finish(
  p_id text, p_provider text, p_model text, p_outcome text, p_status integer,
  p_latency integer, p_actual integer, p_account_cooldown bigint, p_model_cooldown bigint,
  p_disable_account boolean, p_disable_model boolean, p_disable_json boolean
) returns void language plpgsql as $$
declare
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  -- Same lock order as reserve. A late success cannot clear another call's 429.
  perform 1 from mind_pool_health where scope = 'account/' || p_provider for update;
  update mind_pool_attempts set completed_at = v_now, outcome = p_outcome, status = p_status,
    latency_ms = p_latency, actual_tokens = p_actual
    where id = p_id and provider = p_provider and model = p_model and completed_at is null;
  if not found then return; end if;
  update mind_pool_health set
    blocked = blocked or p_disable_account,
    cooldown_until = greatest(cooldown_until, case when p_account_cooldown > 0 then v_now + p_account_cooldown else 0 end)
    where scope = 'account/' || p_provider;
  update mind_pool_health set
    blocked = blocked or p_disable_model,
    cooldown_until = greatest(cooldown_until, case when p_model_cooldown > 0 then v_now + p_model_cooldown else 0 end),
    json_mode = json_mode and not p_disable_json
    where scope = 'model/' || p_provider || '/' || p_model;
end;
$$;
