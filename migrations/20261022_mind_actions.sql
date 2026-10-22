-- Optional physical decisions share the existing authenticated background budget.
-- Preserve old rows, limits, locks, accounting and settlement; do not enable routes.
alter table mind_budget_attempts drop constraint mind_budget_attempts_kind_check;
alter table mind_budget_attempts add constraint mind_budget_attempts_kind_check
  check (kind in ('plan','reflect','talk','player','act'));

create or replace function mind_budget_reserve(p_user text, p_kind text, p_calls integer, p_cost bigint, p_lease integer, p_policy jsonb)
returns table(id text) language plpgsql as $$
declare
  v_now bigint;
  v_calls bigint; v_cost bigint; v_user_day bigint; v_user_minute bigint; v_live bigint; v_background bigint;
  v_id text := gen_random_uuid()::text;
  v_is_background boolean := p_kind <> 'player';
begin
  if p_user is null or length(p_user) = 0 or length(p_user) > 128 or
     p_kind not in ('plan','reflect','talk','player','act') or p_calls < 1 or p_calls > 4 or
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

