-- Aurora Veritatis: period-based individual subscriptions (1, 3, 6 or 12 months), trials and complimentary periods,
-- renewal preferences and cancellation. Run once after 20261023000000_profiles_admin_entitlements.sql. Idempotent.
--
-- - Payments are switched off: only administrators create subscriptions, and only of kind 'trial' or 'complimentary'.
--   Kind 'paid' exists for the future checkout and cannot be created by any function in this migration.
-- - The effective plan is the highest of an active manual grant (plan_grants) and an active subscription.
-- - Cancelling keeps access until the end of the paid or granted period; nothing renews automatically while payments
--   are off (the renewal preference is stored for when they are switched on, with the owner's approval).

create schema if not exists aurora_private;

create table if not exists aurora_private.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('premium', 'prime', 'intelligence')),
  period_months integer not null check (period_months in (1, 3, 6, 12)),
  kind text not null check (kind in ('trial', 'complimentary', 'paid')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null,
  auto_renew boolean not null default false,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  ended_at timestamptz,
  reason text not null check (char_length(reason) between 3 and 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint subscriptions_period check (current_period_end > started_at)
);
-- One current subscription per user (ended ones are kept as history).
create unique index if not exists subscriptions_one_current on aurora_private.subscriptions (user_id) where ended_at is null;
alter table aurora_private.subscriptions enable row level security;
revoke all on aurora_private.subscriptions from public, anon, authenticated;

-- Effective plan: the highest of an active grant and an active subscription.
create or replace function aurora_private.tier_of(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select t from (
      select g.tier as t from aurora_private.plan_grants g
        where g.user_id = uid and g.revoked_at is null and g.starts_at <= now() and (g.expires_at is null or g.expires_at > now())
      union all
      select s.tier from aurora_private.subscriptions s
        where s.user_id = uid and s.ended_at is null and s.started_at <= now() and s.current_period_end > now()
    ) x order by case t when 'intelligence' then 3 when 'prime' then 2 when 'premium' then 1 else 0 end desc limit 1),
    'free');
$$;
revoke execute on function aurora_private.tier_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function aurora_private.my_subscription() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tier', s.tier, 'kind', s.kind, 'period_months', s.period_months, 'started_at', s.started_at,
    'current_period_end', s.current_period_end, 'auto_renew', s.auto_renew, 'cancel_at_period_end', s.cancel_at_period_end,
    'active', s.current_period_end > now(), 'payments', 'disabled')
  from aurora_private.subscriptions s
  where s.user_id = auth.uid() and s.ended_at is null
  limit 1;
$$;

/** Stores the renewal preference. Nothing renews automatically while payments are switched off. */
create or replace function aurora_private.set_auto_renew(on_off boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update aurora_private.subscriptions set auto_renew = on_off where user_id = auth.uid() and ended_at is null;
  if not found then raise exception 'No current subscription' using errcode = '22023'; end if;
  return aurora_private.my_subscription();
end;
$$;

/** Cancels at the end of the current period: access continues until then. Reversible until the period ends. */
create or replace function aurora_private.cancel_my_subscription() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update aurora_private.subscriptions set cancel_at_period_end = true, auto_renew = false, cancelled_at = now()
    where user_id = auth.uid() and ended_at is null and current_period_end > now();
  if not found then raise exception 'No active subscription' using errcode = '22023'; end if;
  return aurora_private.my_subscription();
end;
$$;

create or replace function aurora_private.resume_my_subscription() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update aurora_private.subscriptions set cancel_at_period_end = false, cancelled_at = null
    where user_id = auth.uid() and ended_at is null and current_period_end > now();
  if not found then raise exception 'No active subscription' using errcode = '22023'; end if;
  return aurora_private.my_subscription();
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Administrators (each checks the role and writes an audit row).
create or replace function aurora_private.admin_start_subscription(target uuid, new_tier text, months integer, sub_kind text, why text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  perform aurora_private.require_admin();
  if not exists (select 1 from auth.users where id = target) then raise exception 'Unknown user' using errcode = '22023'; end if;
  if new_tier not in ('premium', 'prime', 'intelligence') then raise exception 'Unknown plan' using errcode = '22023'; end if;
  if months not in (1, 3, 6, 12) then raise exception 'Period must be 1, 3, 6 or 12 months' using errcode = '22023'; end if;
  if sub_kind not in ('trial', 'complimentary') then raise exception 'Only trials and complimentary periods while payments are off' using errcode = '22023'; end if;
  if why is null or char_length(trim(why)) < 3 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update aurora_private.subscriptions set ended_at = now() where user_id = target and ended_at is null;
  insert into aurora_private.subscriptions (user_id, tier, period_months, kind, current_period_end, reason, created_by)
    values (target, new_tier, months, sub_kind, now() + make_interval(months => months), trim(why), auth.uid()) returning id into sid;
  perform aurora_private.audit('subscription.start', target, jsonb_build_object('tier', new_tier, 'months', months, 'kind', sub_kind, 'reason', trim(why), 'subscription_id', sid));
  return jsonb_build_object('subscription_id', sid, 'tier', aurora_private.tier_of(target));
end;
$$;

/** Upgrade or downgrade the current subscription; the period end stays the same. */
create or replace function aurora_private.admin_change_subscription(target uuid, new_tier text, why text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  old text;
begin
  perform aurora_private.require_admin();
  if new_tier not in ('premium', 'prime', 'intelligence') then raise exception 'Unknown plan' using errcode = '22023'; end if;
  if why is null or char_length(trim(why)) < 3 then raise exception 'A reason is required' using errcode = '22023'; end if;
  select tier into old from aurora_private.subscriptions where user_id = target and ended_at is null;
  if old is null then raise exception 'No current subscription' using errcode = '22023'; end if;
  update aurora_private.subscriptions set tier = new_tier where user_id = target and ended_at is null;
  perform aurora_private.audit('subscription.change', target, jsonb_build_object('from', old, 'to', new_tier, 'reason', trim(why)));
  return jsonb_build_object('tier', aurora_private.tier_of(target));
end;
$$;

create or replace function aurora_private.admin_end_subscription(target uuid, why text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  update aurora_private.subscriptions set ended_at = now() where user_id = target and ended_at is null;
  if not found then raise exception 'No current subscription' using errcode = '22023'; end if;
  perform aurora_private.audit('subscription.end', target, jsonb_build_object('reason', why));
  return jsonb_build_object('tier', aurora_private.tier_of(target));
end;
$$;

/** Subscriptions and grants ending within `days` days (for reminders and the admin dashboard). */
create or replace function aurora_private.admin_expiring(days integer default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  return coalesce((select jsonb_agg(x order by x.ends) from (
    select 'subscription' as source, s.user_id, u.email, s.tier, s.kind, s.current_period_end as ends, s.cancel_at_period_end as cancelling
      from aurora_private.subscriptions s join auth.users u on u.id = s.user_id
      where s.ended_at is null and s.current_period_end > now() and s.current_period_end <= now() + make_interval(days => greatest(1, least(days, 366)))
    union all
    select 'grant', g.user_id, u.email, g.tier, 'grant', g.expires_at, false
      from aurora_private.plan_grants g join auth.users u on u.id = g.user_id
      where g.revoked_at is null and g.expires_at > now() and g.expires_at <= now() + make_interval(days => greatest(1, least(days, 366)))
  ) x), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
revoke all on function aurora_private.my_subscription(), aurora_private.set_auto_renew(boolean), aurora_private.cancel_my_subscription(),
  aurora_private.resume_my_subscription(), aurora_private.admin_start_subscription(uuid, text, integer, text, text),
  aurora_private.admin_change_subscription(uuid, text, text), aurora_private.admin_end_subscription(uuid, text), aurora_private.admin_expiring(integer) from public, anon;
grant execute on function aurora_private.my_subscription(), aurora_private.set_auto_renew(boolean), aurora_private.cancel_my_subscription(),
  aurora_private.resume_my_subscription(), aurora_private.admin_start_subscription(uuid, text, integer, text, text),
  aurora_private.admin_change_subscription(uuid, text, text), aurora_private.admin_end_subscription(uuid, text), aurora_private.admin_expiring(integer) to authenticated;

create or replace function public.my_subscription() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.my_subscription(); $$;
create or replace function public.set_auto_renew(on_off boolean) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.set_auto_renew(on_off); $$;
create or replace function public.cancel_my_subscription() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.cancel_my_subscription(); $$;
create or replace function public.resume_my_subscription() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.resume_my_subscription(); $$;
create or replace function public.admin_start_subscription(target uuid, new_tier text, months integer, sub_kind text, why text) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_start_subscription(target, new_tier, months, sub_kind, why); $$;
create or replace function public.admin_change_subscription(target uuid, new_tier text, why text) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_change_subscription(target, new_tier, why); $$;
create or replace function public.admin_end_subscription(target uuid, why text) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_end_subscription(target, why); $$;
create or replace function public.admin_expiring(days integer default 14) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_expiring(days); $$;
revoke all on function public.my_subscription(), public.set_auto_renew(boolean), public.cancel_my_subscription(), public.resume_my_subscription(),
  public.admin_start_subscription(uuid, text, integer, text, text), public.admin_change_subscription(uuid, text, text),
  public.admin_end_subscription(uuid, text), public.admin_expiring(integer) from public, anon;
grant execute on function public.my_subscription(), public.set_auto_renew(boolean), public.cancel_my_subscription(), public.resume_my_subscription(),
  public.admin_start_subscription(uuid, text, integer, text, text), public.admin_change_subscription(uuid, text, text),
  public.admin_end_subscription(uuid, text), public.admin_expiring(integer) to authenticated;
