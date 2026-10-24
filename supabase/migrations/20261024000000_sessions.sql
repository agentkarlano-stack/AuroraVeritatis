-- Aurora Veritatis: device and session management, optional one-session rule for paid plans. Run once after
-- 20261023000000_profiles_admin_entitlements.sql. Idempotent; adds tables and functions, changes no existing data.
--
-- How it works
-- - Supabase keeps one row per signed-in device in auth.sessions and puts its id in every access token
--   (claim `session_id`). Deleting the row also deletes its refresh tokens (cascade), so that device cannot renew.
-- - An access token already issued stays valid until it expires (Supabase default: 1 hour). To close that window for
--   paid features and administration, my_entitlements() and every admin function check that the token's session still
--   exists (aurora_private.session_active()). A revoked device keeps reading its own notes until its token expires, but
--   loses paid entitlements and admin rights at once.
-- - Optional rule (off by default; an administrator switches it on): one active session per paid individual account.
--   The newest interactive sign-in takes over; the other devices are signed out and told why. Tabs of the same browser
--   share one session, so they are never affected. No fingerprinting, no IP addresses, no location.

create schema if not exists aurora_private;

-- Settings (single row).
create table if not exists aurora_private.session_settings (
  id boolean primary key default true check (id),
  single_session_paid boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into aurora_private.session_settings (id) values (true) on conflict (id) do nothing;

-- Session events: why a session ended (shown to the device that was signed out) and a security trail.
create table if not exists aurora_private.session_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid,
  action text not null check (action in ('revoked', 'others_revoked', 'takeover', 'ended_by_takeover')),
  at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create index if not exists session_events_user_idx on aurora_private.session_events (user_id, at desc);
create index if not exists session_events_session_idx on aurora_private.session_events (session_id);
alter table aurora_private.session_settings enable row level security;
alter table aurora_private.session_events enable row level security;
revoke all on aurora_private.session_settings, aurora_private.session_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function aurora_private.current_session_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'session_id', '')::uuid;
$$;

/** True while the caller's session exists. Tokens without a session id (e.g. server keys) count as active. */
create or replace function aurora_private.session_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    aurora_private.current_session_id() is null
    or exists (select 1 from auth.sessions s where s.id = aurora_private.current_session_id() and s.user_id = auth.uid()
               and (s.not_after is null or s.not_after > now())));
$$;

-- Administration requires an active session as well as the role.
create or replace function aurora_private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not aurora_private.caller_is_admin() then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;
  if not aurora_private.session_active() then
    raise exception 'This session has been signed out' using errcode = '42501';
  end if;
end;
$$;

-- Entitlements: a signed-out session gets Free and no admin rights until its token expires.
create or replace function aurora_private.my_entitlements() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when aurora_private.session_active() then jsonb_build_object(
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
    'payments', 'disabled',
    'session', 'active')
  else jsonb_build_object('tier', 'free', 'is_admin', false, 'grant', null,
    'limits', jsonb_build_object('researchNotes', aurora_private.limit_for('free', 'researchNotes'), 'assetsPerWatchlist', aurora_private.limit_for('free', 'assetsPerWatchlist'), 'alertRules', aurora_private.limit_for('free', 'alertRules')),
    'payments', 'disabled', 'session', 'ended') end
  where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The caller's own devices: no IP addresses or locations, only what the user needs to recognise a device.
create or replace function aurora_private.my_sessions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'created_at', s.created_at,
      'last_active', coalesce(s.refreshed_at, s.updated_at, s.created_at),
      'user_agent', left(coalesce(s.user_agent, ''), 300),
      'current', s.id = aurora_private.current_session_id())
    order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc), '[]'::jsonb)
  from auth.sessions s
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now());
$$;

/** Signs out one of the caller's other devices. The current session is ended with a normal sign-out instead. */
create or replace function aurora_private.revoke_my_session(target uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null or not aurora_private.session_active() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if target = aurora_private.current_session_id() then
    raise exception 'Use sign out for this device' using errcode = '22023';
  end if;
  delete from auth.sessions where id = target and user_id = auth.uid();
  get diagnostics n = row_count;
  if n > 0 then
    insert into aurora_private.session_events (user_id, session_id, action) values (auth.uid(), target, 'revoked');
  end if;
  return n;
end;
$$;

/**
 * Called by the app after an interactive sign-in. With the one-session rule on and a paid plan, the other sessions
 * are signed out (the newest sign-in wins) and recorded so those devices can explain what happened.
 */
create or replace function aurora_private.claim_session() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sid uuid := aurora_private.current_session_id();
  enforced boolean;
  ended uuid[];
begin
  if me is null or sid is null or not aurora_private.session_active() then
    return jsonb_build_object('enforced', false, 'revoked', 0);
  end if;
  select single_session_paid into enforced from aurora_private.session_settings where id;
  enforced := coalesce(enforced, false) and aurora_private.tier_of(me) <> 'free';
  if not enforced then
    return jsonb_build_object('enforced', false, 'revoked', 0);
  end if;
  with gone as (delete from auth.sessions where user_id = me and id <> sid returning id)
  select coalesce(array_agg(id), '{}') into ended from gone;
  if cardinality(ended) > 0 then
    insert into aurora_private.session_events (user_id, session_id, action, details) select me, x, 'ended_by_takeover', jsonb_build_object('by', sid) from unnest(ended) x;
    insert into aurora_private.session_events (user_id, session_id, action, details) values (me, sid, 'takeover', jsonb_build_object('ended', cardinality(ended)));
  end if;
  return jsonb_build_object('enforced', true, 'revoked', cardinality(ended));
end;
$$;

/** Whether the caller's session is still active, and if not, why (so the app can explain the sign-out). */
create or replace function aurora_private.session_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'active', aurora_private.session_active(),
    'reason', case when aurora_private.session_active() then null else
      (select e.action from aurora_private.session_events e
        where e.user_id = auth.uid() and e.session_id = aurora_private.current_session_id() order by e.at desc limit 1) end,
    'single_session_paid', (select single_session_paid from aurora_private.session_settings where id))
  where auth.uid() is not null;
$$;

/** Records that the caller signed out all other devices (the sign-out itself is done by Supabase Auth). */
create or replace function aurora_private.note_others_signed_out() returns void
language sql security definer set search_path = '' as $$
  insert into aurora_private.session_events (user_id, session_id, action)
  select auth.uid(), aurora_private.current_session_id(), 'others_revoked' where auth.uid() is not null;
$$;

/** Administrators: switch the one-session rule for paid individual plans (audited). */
create or replace function aurora_private.admin_set_session_policy(single_session boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  update aurora_private.session_settings set single_session_paid = single_session, updated_at = now(), updated_by = auth.uid() where id;
  perform aurora_private.audit('session.policy', null, jsonb_build_object('single_session_paid', single_session));
  return jsonb_build_object('single_session_paid', single_session);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges and public wrappers (SECURITY INVOKER; the private functions check the caller).
revoke all on function aurora_private.current_session_id(), aurora_private.session_active(), aurora_private.my_sessions(),
  aurora_private.revoke_my_session(uuid), aurora_private.claim_session(), aurora_private.session_status(),
  aurora_private.note_others_signed_out(), aurora_private.admin_set_session_policy(boolean) from public, anon;
revoke execute on function aurora_private.current_session_id(), aurora_private.session_active() from authenticated;
grant execute on function aurora_private.my_sessions(), aurora_private.revoke_my_session(uuid), aurora_private.claim_session(),
  aurora_private.session_status(), aurora_private.note_others_signed_out(), aurora_private.admin_set_session_policy(boolean) to authenticated;

create or replace function public.my_sessions() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.my_sessions(); $$;
create or replace function public.revoke_my_session(target uuid) returns integer language sql security invoker set search_path = '' as $$ select aurora_private.revoke_my_session(target); $$;
create or replace function public.claim_session() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.claim_session(); $$;
create or replace function public.session_status() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.session_status(); $$;
create or replace function public.note_others_signed_out() returns void language sql security invoker set search_path = '' as $$ select aurora_private.note_others_signed_out(); $$;
create or replace function public.admin_set_session_policy(single_session boolean) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_set_session_policy(single_session); $$;
revoke all on function public.my_sessions(), public.revoke_my_session(uuid), public.claim_session(), public.session_status(),
  public.note_others_signed_out(), public.admin_set_session_policy(boolean) from public, anon;
grant execute on function public.my_sessions(), public.revoke_my_session(uuid), public.claim_session(), public.session_status(),
  public.note_others_signed_out(), public.admin_set_session_policy(boolean) to authenticated;
