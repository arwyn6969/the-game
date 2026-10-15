-- Shared conservative call/cost reservations. No prompts, replies or credentials.
create table mind_budget_lock (id integer primary key check (id = 1));
insert into mind_budget_lock(id) values (1);
create table mind_budget_attempts (
  id text primary key,
  user_hash text not null,
  kind text not null check (kind in ('plan','reflect','talk','player')),
  started_at bigint not null,
  expires_at bigint not null,
  completed_at bigint,
  reserved_calls integer not null check (reserved_calls between 1 and 4),
  charged_calls integer not null check (charged_calls between 0 and 4),
  reserved_microusd bigint not null check (reserved_microusd >= 0),
  charged_microusd bigint not null check (charged_microusd >= 0)
);
create index mind_budget_attempts_time on mind_budget_attempts(started_at);
create index mind_budget_attempts_user_time on mind_budget_attempts(user_hash,started_at);

create function mind_budget_reserve(p_user text, p_kind text, p_calls integer, p_cost bigint, p_lease integer, p_policy jsonb)
returns table(id text) language plpgsql as $$
declare
  v_now bigint;
  v_calls bigint; v_cost bigint; v_user_day bigint; v_user_minute bigint; v_live bigint; v_background bigint;
  v_id text := gen_random_uuid()::text;
  v_is_background boolean := p_kind <> 'player';
begin
  if p_user is null or length(p_user) = 0 or length(p_user) > 128 or
     p_kind not in ('plan','reflect','talk','player') or p_calls < 1 or p_calls > 4 or
     p_cost < 0 or p_lease < 1 or p_lease > 120000 then raise exception 'invalid budget reservation'; end if;
  perform 1 from mind_budget_lock where mind_budget_lock.id = 1 for update;
  v_now := floor(extract(epoch from clock_timestamp()) * 1000);
  delete from mind_budget_attempts where started_at <= v_now - 2764800000;
  select coalesce(sum(charged_calls),0), coalesce(sum(charged_microusd),0),
    coalesce(sum(charged_calls) filter(where user_hash = p_user),0),
    coalesce(sum(charged_calls) filter(where user_hash = p_user and started_at > v_now - 60000),0),
    count(*) filter(where completed_at is null and expires_at > v_now),
    count(*) filter(where completed_at is null and expires_at > v_now and kind <> 'player')
  into v_calls,v_cost,v_user_day,v_user_minute,v_live,v_background
  from mind_budget_attempts where started_at > v_now - 86400000;
  if v_calls + p_calls > (p_policy->>'dailyCalls')::bigint - (case when v_is_background then (p_policy->>'interactiveReserveCalls')::bigint else 0 end) or
     v_cost + p_cost > (p_policy->>'dailyMicrousd')::bigint - (case when v_is_background then (p_policy->>'interactiveReserveMicrousd')::bigint else 0 end) or
     v_user_day + p_calls > (p_policy->>'playerDailyCalls')::bigint - (case when v_is_background then (p_policy->>'playerInteractiveReserveCalls')::bigint else 0 end) or
     v_user_minute + p_calls > (p_policy->>'playerMinuteCalls')::bigint - (case when v_is_background then (p_policy->>'playerInteractiveReserveMinuteCalls')::bigint else 0 end) or
     v_live >= (p_policy->>'concurrent')::bigint or
     (v_is_background and v_background >= (p_policy->>'backgroundConcurrent')::bigint) then return; end if;
  insert into mind_budget_attempts values(v_id,p_user,p_kind,v_now,v_now+p_lease,null,p_calls,p_calls,p_cost,p_cost);
  return query select v_id;
end;
$$;

create function mind_budget_finish(p_id text, p_attempts integer) returns void language plpgsql as $$
declare v_now bigint;
begin
  perform 1 from mind_budget_lock where mind_budget_lock.id = 1 for update;
  v_now := floor(extract(epoch from clock_timestamp()) * 1000);
  -- Unknown/aborted calls retain the full reservation; refunds only follow a
  -- trusted adapter's known attempt count, never a provider timeout guess.
  update mind_budget_attempts set completed_at = v_now,
    charged_calls = case when p_attempts between 0 and reserved_calls then p_attempts else charged_calls end,
    charged_microusd = case when p_attempts between 0 and reserved_calls
      then ceil(reserved_microusd::numeric * p_attempts / reserved_calls)::bigint else charged_microusd end
  where id = p_id and completed_at is null;
end;
$$;
