-- Aurora Veritatis: profile fields, administrator role, manual plan grants (no payments) and server-side quotas.
-- Run once in the Aurora Veritatis project after 20261020000000_initial_profiles.sql and
-- 20261022000000_account_deletion_hardening.sql. Idempotent; adds columns, tables and functions, changes no data.
--
-- Security model
-- - Roles, grants and the audit log live in `aurora_private`, which the Data API does not expose. Guests and
--   signed-in users have no table privileges there; they reach it only through the functions below.
-- - Every admin function checks the caller's admin role on the server and writes an audit row.
-- - The administrator role is separate from plans: no plan grants it, and no function grants it. The first admin is
--   added by the project owner in the SQL editor (see OWNER-ACTIONS in the Knowledge repository).
-- - Plans are manual, complimentary grants with a reason and optional expiry. They are not payments and create no
--   payment records. The effective plan is the highest active grant; expired or revoked grants fall back to Free.
-- - Quotas for data stored on the server (research notes, synced watchlist and alert rules) are enforced by triggers.

create schema if not exists aurora_private;
revoke all on schema aurora_private from public, anon;
grant usage on schema aurora_private to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Profile fields. Email stays in auth.users and is never copied here. `visibility` records which fields the user
-- allows to be shown publicly ({"display_name": true, ...}); everything is private by default.
alter table public.profiles
  add column if not exists bio text check (char_length(bio) <= 500),
  add column if not exists avatar_style text check (avatar_style ~ '^[a-z0-9-]{1,30}$'),
  add column if not exists region text check (region ~ '^[A-Z]{3}$'),
  add column if not exists language text check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  add column if not exists timezone text check (char_length(timezone) <= 64),
  add column if not exists visibility jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_visibility_object') then
    alter table public.profiles add constraint profiles_visibility_object check (jsonb_typeof(visibility) = 'object' and pg_column_size(visibility) < 2048);
  end if;
end;
$$;
grant update (display_name, bio, avatar_style, region, language, timezone, visibility, updated_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Private tables
create table if not exists aurora_private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 200)
);

create table if not exists aurora_private.plan_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('premium', 'prime', 'intelligence')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text not null check (char_length(reason) between 3 and 300),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text check (char_length(revoke_reason) <= 300),
  constraint plan_grants_expiry check (expires_at is null or expires_at > starts_at)
);
create index if not exists plan_grants_user_idx on aurora_private.plan_grants (user_id, created_at desc);

create table if not exists aurora_private.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  target_user uuid,
  details jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_at_idx on aurora_private.admin_audit (at desc);

alter table aurora_private.admins enable row level security;
alter table aurora_private.plan_grants enable row level security;
alter table aurora_private.admin_audit enable row level security;
revoke all on aurora_private.admins, aurora_private.plan_grants, aurora_private.admin_audit from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Internal helpers (not executable by users)
create or replace function aurora_private.tier_of(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select g.tier from aurora_private.plan_grants g
      where g.user_id = uid and g.revoked_at is null and g.starts_at <= now() and (g.expires_at is null or g.expires_at > now())
      order by case g.tier when 'intelligence' then 3 when 'prime' then 2 when 'premium' then 1 else 0 end desc
      limit 1),
    'free');
$$;

-- Plan limits for data stored on the server. Mirrors src/data/tiers.ts (a unit test checks they match).
create or replace function aurora_private.limit_for(tier text, key text) returns integer
language sql immutable set search_path = '' as $$
  select case key
    when 'researchNotes' then case tier when 'intelligence' then 1000 when 'prime' then 300 when 'premium' then 100 else 25 end
    when 'assetsPerWatchlist' then case tier when 'intelligence' then 100 when 'prime' then 50 when 'premium' then 25 else 10 end
    when 'alertRules' then case tier when 'intelligence' then 100 when 'prime' then 30 when 'premium' then 10 else 2 end
    else 0 end;
$$;

create or replace function aurora_private.caller_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from aurora_private.admins a where a.user_id = auth.uid());
$$;

create or replace function aurora_private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not aurora_private.caller_is_admin() then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;
end;
$$;

create or replace function aurora_private.audit(action text, target uuid, details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into aurora_private.admin_audit (actor, action, target_user, details) values (auth.uid(), action, target, coalesce(details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Server-side quotas
create or replace function public.aurora_notes_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cap integer := aurora_private.limit_for(aurora_private.tier_of(new.user_id), 'researchNotes');
begin
  if (select count(*) from public.research_notes where user_id = new.user_id) >= cap then
    raise exception 'Note limit reached for your plan (% notes)', cap using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Synced preferences: the watchlist and alert rules may not exceed the plan limits.
create or replace function aurora_private.prefs_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t text := aurora_private.tier_of(new.user_id);
  w integer := case when jsonb_typeof(new.data -> 'watchlist') = 'array' then jsonb_array_length(new.data -> 'watchlist') else 0 end;
  a integer := case when jsonb_typeof(new.data -> 'alerts') = 'array' then jsonb_array_length(new.data -> 'alerts') else 0 end;
begin
  if w > aurora_private.limit_for(t, 'assetsPerWatchlist') then
    raise exception 'Watchlist limit reached for your plan (% instruments)', aurora_private.limit_for(t, 'assetsPerWatchlist') using errcode = 'P0001';
  end if;
  if a > aurora_private.limit_for(t, 'alertRules') then
    raise exception 'Alert rule limit reached for your plan (% rules)', aurora_private.limit_for(t, 'alertRules') using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists aurora_prefs_quota on public.user_preferences;
create trigger aurora_prefs_quota before insert or update on public.user_preferences
  for each row execute function aurora_private.prefs_quota();

-- ---------------------------------------------------------------------------------------------------------------
-- Caller's own entitlements
create or replace function aurora_private.my_entitlements() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tier', aurora_private.tier_of(auth.uid()),
    'is_admin', aurora_private.caller_is_admin(),
    'grant', (select jsonb_build_object('tier', g.tier, 'expires_at', g.expires_at, 'reason', g.reason, 'since', g.starts_at)
              from aurora_private.plan_grants g
              where g.user_id = auth.uid() and g.revoked_at is null and g.starts_at <= now() and (g.expires_at is null or g.expires_at > now())
              order by case g.tier when 'intelligence' then 3 when 'prime' then 2 else 1 end desc limit 1),
    'limits', jsonb_build_object(
      'researchNotes', aurora_private.limit_for(aurora_private.tier_of(auth.uid()), 'researchNotes'),
      'assetsPerWatchlist', aurora_private.limit_for(aurora_private.tier_of(auth.uid()), 'assetsPerWatchlist'),
      'alertRules', aurora_private.limit_for(aurora_private.tier_of(auth.uid()), 'alertRules')),
    'payments', 'disabled')
  where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Administrator functions (each checks the role and is audited where it changes anything)
create or replace function aurora_private.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'admins', (select count(*) from aurora_private.admins),
    'grants', (select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb) from (
      select aurora_private.tier_of(u.id) as tier, count(*) as n from auth.users u group by 1) t),
    'research_notes', (select count(*) from public.research_notes),
    'synced_preferences', (select count(*) from public.user_preferences),
    'at', now());
end;
$$;

create or replace function aurora_private.admin_list_users(search text default '', lim integer default 50, off integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select u.id, u.email, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null) as confirmed,
             p.display_name, aurora_private.tier_of(u.id) as tier,
             (select g.expires_at from aurora_private.plan_grants g where g.user_id = u.id and g.revoked_at is null
                and (g.expires_at is null or g.expires_at > now()) order by g.created_at desc limit 1) as grant_expires_at,
             exists (select 1 from aurora_private.admins a where a.user_id = u.id) as is_admin
      from auth.users u left join public.profiles p on p.id = u.id
      where coalesce(search, '') = '' or u.email ilike '%' || search || '%' or p.display_name ilike '%' || search || '%'
      order by u.created_at desc
      limit least(greatest(coalesce(lim, 50), 1), 200) offset greatest(coalesce(off, 0), 0)
    ) x), '[]'::jsonb);
end;
$$;

create or replace function aurora_private.admin_grant_plan(target uuid, new_tier text, expires timestamptz, why text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  gid uuid;
begin
  perform aurora_private.require_admin();
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'Unknown user' using errcode = '22023';
  end if;
  if new_tier not in ('free', 'premium', 'prime', 'intelligence') then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;
  if why is null or char_length(trim(why)) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if expires is not null and expires <= now() then
    raise exception 'The expiry must be in the future' using errcode = '22023';
  end if;
  -- One active manual grant per user: end the current ones first.
  update aurora_private.plan_grants set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'Replaced: ' || left(trim(why), 280)
    where user_id = target and revoked_at is null and (expires_at is null or expires_at > now());
  if new_tier <> 'free' then
    insert into aurora_private.plan_grants (user_id, tier, expires_at, reason, granted_by) values (target, new_tier, expires, trim(why), auth.uid()) returning id into gid;
  end if;
  perform aurora_private.audit(case when new_tier = 'free' then 'plan.revoke_all' else 'plan.grant' end, target,
    jsonb_build_object('tier', new_tier, 'expires_at', expires, 'reason', trim(why), 'grant_id', gid));
  return jsonb_build_object('tier', aurora_private.tier_of(target), 'grant_id', gid);
end;
$$;

create or replace function aurora_private.admin_revoke_grant(grant_id uuid, why text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  perform aurora_private.require_admin();
  update aurora_private.plan_grants set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = left(coalesce(trim(why), ''), 300)
    where id = grant_id and revoked_at is null returning user_id into uid;
  if uid is null then
    raise exception 'No active grant with this id' using errcode = '22023';
  end if;
  perform aurora_private.audit('plan.revoke', uid, jsonb_build_object('grant_id', grant_id, 'reason', why));
  return jsonb_build_object('tier', aurora_private.tier_of(uid));
end;
$$;

create or replace function aurora_private.admin_grants(target uuid default null, lim integer default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select g.*, u.email from aurora_private.plan_grants g left join auth.users u on u.id = g.user_id
      where target is null or g.user_id = target
      order by g.created_at desc limit least(greatest(coalesce(lim, 100), 1), 500)
    ) x), '[]'::jsonb);
end;
$$;

create or replace function aurora_private.admin_audit_log(lim integer default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.at desc) from (
      select a.*, (select email from auth.users where id = a.actor) as actor_email, (select email from auth.users where id = a.target_user) as target_email
      from aurora_private.admin_audit a order by a.at desc limit least(greatest(coalesce(lim, 100), 1), 500)
    ) x), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges: internal helpers are not callable by users; the entitlement and admin functions are (they check roles).
revoke all on all functions in schema aurora_private from public, anon;
revoke execute on function aurora_private.tier_of(uuid), aurora_private.limit_for(text, text), aurora_private.audit(text, uuid, jsonb),
  aurora_private.prefs_quota(), aurora_private.require_admin(), aurora_private.caller_is_admin() from authenticated;
grant execute on function aurora_private.my_entitlements(), aurora_private.admin_stats(), aurora_private.admin_list_users(text, integer, integer),
  aurora_private.admin_grant_plan(uuid, text, timestamptz, text), aurora_private.admin_revoke_grant(uuid, text),
  aurora_private.admin_grants(uuid, integer), aurora_private.admin_audit_log(integer) to authenticated;
-- delete_my_account (previous migration) stays callable by signed-in users.
grant execute on function aurora_private.delete_account() to authenticated;

-- Public API: SECURITY INVOKER wrappers (no elevated rights of their own; Security Advisor lint 0029).
create or replace function public.my_entitlements() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.my_entitlements(); $$;
create or replace function public.admin_stats() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_stats(); $$;
create or replace function public.admin_list_users(search text default '', lim integer default 50, off integer default 0) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_list_users(search, lim, off); $$;
create or replace function public.admin_grant_plan(target uuid, new_tier text, expires timestamptz default null, why text default null) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_grant_plan(target, new_tier, expires, why); $$;
create or replace function public.admin_revoke_grant(grant_id uuid, why text default null) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_revoke_grant(grant_id, why); $$;
create or replace function public.admin_grants(target uuid default null, lim integer default 100) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_grants(target, lim); $$;
create or replace function public.admin_audit_log(lim integer default 100) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_audit_log(lim); $$;
revoke all on function public.my_entitlements(), public.admin_stats(), public.admin_list_users(text, integer, integer), public.admin_grant_plan(uuid, text, timestamptz, text),
  public.admin_revoke_grant(uuid, text), public.admin_grants(uuid, integer), public.admin_audit_log(integer) from public, anon;
grant execute on function public.my_entitlements(), public.admin_stats(), public.admin_list_users(text, integer, integer), public.admin_grant_plan(uuid, text, timestamptz, text),
  public.admin_revoke_grant(uuid, text), public.admin_grants(uuid, integer), public.admin_audit_log(integer) to authenticated;
