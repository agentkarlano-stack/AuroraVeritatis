-- Aurora Veritatis: Business & Institutional organisations with named seats, organisation administrators and AI
-- allowances with hard budget limits. Run once after 20261024000100_subscriptions.sql. Idempotent.
--
-- - Organisations are created by Aurora administrators after a private quote (no public prices, no self-service).
-- - Seats are named: each seat is one user account; an account belongs to at most one organisation.
-- - Members get the organisation's plan while the contract is active (the effective plan is the highest of grant,
--   subscription and organisation).
-- - AI usage is recorded only by the server (service role) and checked against a monthly budget with a hard cap by
--   default, so no organisation can run up unlimited AI costs. AI features are not switched on yet.

create schema if not exists aurora_private;

create table if not exists aurora_private.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  tier text not null check (tier in ('premium', 'prime', 'intelligence')),
  seats integer not null check (seats between 1 and 10000),
  contract_start date not null default current_date,
  contract_end date not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Monthly AI budget in euro cents (null: no AI allowance); hard cap blocks further AI use when reached.
  ai_monthly_budget_cents integer check (ai_monthly_budget_cents is null or ai_monthly_budget_cents >= 0),
  ai_hard_cap boolean not null default true,
  ai_alert_percent integer not null default 80 check (ai_alert_percent between 1 and 100),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organizations_contract check (contract_end > contract_start)
);

create table if not exists aurora_private.org_members (
  org_id uuid not null references aurora_private.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'org_admin')),
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null,
  primary key (org_id, user_id)
);
-- One organisation per account.
create unique index if not exists org_members_one_org on aurora_private.org_members (user_id);

create table if not exists aurora_private.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  org_id uuid references aurora_private.organizations (id) on delete set null,
  at timestamptz not null default now(),
  feature text not null check (char_length(feature) between 2 and 60),
  provider text not null default '' check (char_length(provider) <= 40),
  model text not null default '' check (char_length(model) <= 80),
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  cost_cents numeric(12, 4) not null default 0 check (cost_cents >= 0)
);
create index if not exists ai_usage_org_idx on aurora_private.ai_usage (org_id, at desc);
create index if not exists ai_usage_user_idx on aurora_private.ai_usage (user_id, at desc);

alter table aurora_private.organizations enable row level security;
alter table aurora_private.org_members enable row level security;
alter table aurora_private.ai_usage enable row level security;
revoke all on aurora_private.organizations, aurora_private.org_members, aurora_private.ai_usage from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function aurora_private.org_of(uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.org_id from aurora_private.org_members m join aurora_private.organizations o on o.id = m.org_id
  where m.user_id = uid and o.status = 'active' and current_date between o.contract_start and o.contract_end;
$$;

-- Effective plan: the highest of an active grant, subscription and organisation seat.
create or replace function aurora_private.tier_of(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select t from (
      select g.tier as t from aurora_private.plan_grants g
        where g.user_id = uid and g.revoked_at is null and g.starts_at <= now() and (g.expires_at is null or g.expires_at > now())
      union all
      select s.tier from aurora_private.subscriptions s
        where s.user_id = uid and s.ended_at is null and s.started_at <= now() and s.current_period_end > now()
      union all
      select o.tier from aurora_private.organizations o where o.id = aurora_private.org_of(uid)
    ) x order by case t when 'intelligence' then 3 when 'prime' then 2 when 'premium' then 1 else 0 end desc limit 1),
    'free');
$$;

/** Month-to-date AI spend of an organisation (cents). */
create or replace function aurora_private.org_ai_spend(org uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost_cents), 0) from aurora_private.ai_usage where org_id = org and at >= date_trunc('month', now());
$$;

/**
 * Whether a user may make an AI request now (for the server-side AI gateway). Organisation members are checked
 * against the organisation's monthly budget and hard cap; individual allowances are enforced by the gateway's plan
 * limits. Returns the reason when blocked.
 */
create or replace function aurora_private.ai_allowance(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when o.id is null then jsonb_build_object('allowed', true, 'scope', 'individual')
    when o.ai_monthly_budget_cents is null then jsonb_build_object('allowed', false, 'scope', 'organisation', 'reason', 'no AI allowance in this contract')
    when o.ai_hard_cap and aurora_private.org_ai_spend(o.id) >= o.ai_monthly_budget_cents then
      jsonb_build_object('allowed', false, 'scope', 'organisation', 'reason', 'monthly AI budget reached', 'spent_cents', aurora_private.org_ai_spend(o.id), 'budget_cents', o.ai_monthly_budget_cents)
    else jsonb_build_object('allowed', true, 'scope', 'organisation', 'spent_cents', aurora_private.org_ai_spend(o.id), 'budget_cents', o.ai_monthly_budget_cents,
      'alert', aurora_private.org_ai_spend(o.id) >= o.ai_monthly_budget_cents * o.ai_alert_percent / 100.0)
  end
  from (select 1) one left join aurora_private.organizations o on o.id = aurora_private.org_of(uid);
$$;

/** Records one AI request (server only: called with the service role by the AI gateway; never by browsers). */
create or replace function aurora_private.record_ai_usage(uid uuid, feature text, provider text, model text, tokens_in integer, tokens_out integer, cost_cents numeric) returns void
language sql security definer set search_path = '' as $$
  insert into aurora_private.ai_usage (user_id, org_id, feature, provider, model, tokens_in, tokens_out, cost_cents)
  values (uid, aurora_private.org_of(uid), feature, coalesce(provider, ''), coalesce(model, ''), greatest(0, tokens_in), greatest(0, tokens_out), greatest(0, cost_cents));
$$;

-- The optional one-device rule applies to paid individual accounts only: organisation seats are named and managed by
-- the organisation's contract, so a member's plan from the organisation does not trigger it.
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
  enforced := coalesce(enforced, false) and aurora_private.tier_of(me) <> 'free' and aurora_private.org_of(me) is null;
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

-- ---------------------------------------------------------------------------------------------------------------
-- Members: their own organisation; organisation administrators also see seats and usage.
create or replace function aurora_private.my_organization() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'tier', o.tier, 'seats', o.seats, 'contract_end', o.contract_end, 'role', m.role,
    'seats_used', (select count(*) from aurora_private.org_members x where x.org_id = o.id),
    'ai', case when m.role = 'org_admin' then jsonb_build_object('budget_cents', o.ai_monthly_budget_cents, 'hard_cap', o.ai_hard_cap,
      'alert_percent', o.ai_alert_percent, 'spent_cents', aurora_private.org_ai_spend(o.id)) else null end,
    'members', case when m.role = 'org_admin' then (
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', x.role, 'added_at', x.added_at,
        'ai_cents_month', (select coalesce(sum(a.cost_cents), 0) from aurora_private.ai_usage a where a.user_id = x.user_id and a.org_id = o.id and a.at >= date_trunc('month', now())))
        order by x.added_at)
      from aurora_private.org_members x join auth.users u on u.id = x.user_id where x.org_id = o.id) else null end)
  from aurora_private.org_members m join aurora_private.organizations o on o.id = m.org_id
  where m.user_id = auth.uid();
$$;

-- Aurora administrators (audited).
create or replace function aurora_private.admin_create_org(org_name text, plan text, seat_count integer, ends date, ai_budget_cents integer, why text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  oid uuid;
begin
  perform aurora_private.require_admin();
  if why is null or char_length(trim(why)) < 3 then raise exception 'A reason is required' using errcode = '22023'; end if;
  insert into aurora_private.organizations (name, tier, seats, contract_end, ai_monthly_budget_cents, created_by, notes)
    values (trim(org_name), plan, seat_count, ends, ai_budget_cents, auth.uid(), trim(why)) returning id into oid;
  perform aurora_private.audit('org.create', null, jsonb_build_object('org_id', oid, 'name', trim(org_name), 'tier', plan, 'seats', seat_count, 'contract_end', ends, 'ai_budget_cents', ai_budget_cents, 'reason', trim(why)));
  return jsonb_build_object('id', oid);
end;
$$;

create or replace function aurora_private.admin_update_org(org uuid, plan text, seat_count integer, ends date, ai_budget_cents integer, hard_cap boolean, new_status text, why text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  if why is null or char_length(trim(why)) < 3 then raise exception 'A reason is required' using errcode = '22023'; end if;
  if seat_count < (select count(*) from aurora_private.org_members where org_id = org) then
    raise exception 'More members than seats: remove members first' using errcode = '22023';
  end if;
  update aurora_private.organizations set tier = plan, seats = seat_count, contract_end = ends, ai_monthly_budget_cents = ai_budget_cents,
    ai_hard_cap = hard_cap, status = new_status where id = org;
  if not found then raise exception 'Unknown organisation' using errcode = '22023'; end if;
  perform aurora_private.audit('org.update', null, jsonb_build_object('org_id', org, 'tier', plan, 'seats', seat_count, 'contract_end', ends, 'ai_budget_cents', ai_budget_cents, 'hard_cap', hard_cap, 'status', new_status, 'reason', trim(why)));
  return jsonb_build_object('id', org);
end;
$$;

/** Adds a named seat (an existing, confirmed account). Fails when all seats are used. */
create or replace function aurora_private.admin_add_member(org uuid, member_email text, member_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  cap integer;
begin
  perform aurora_private.require_admin();
  select id into uid from auth.users where lower(email) = lower(trim(member_email)) and email_confirmed_at is not null;
  if uid is null then raise exception 'No confirmed account with this email' using errcode = '22023'; end if;
  select seats into cap from aurora_private.organizations where id = org for update;
  if cap is null then raise exception 'Unknown organisation' using errcode = '22023'; end if;
  if (select count(*) from aurora_private.org_members where org_id = org) >= cap then raise exception 'All seats are in use' using errcode = '22023'; end if;
  insert into aurora_private.org_members (org_id, user_id, role, added_by) values (org, uid, coalesce(member_role, 'member'), auth.uid());
  perform aurora_private.audit('org.member_add', uid, jsonb_build_object('org_id', org, 'role', coalesce(member_role, 'member')));
  return jsonb_build_object('user_id', uid);
exception when unique_violation then
  raise exception 'This account already belongs to an organisation' using errcode = '22023';
end;
$$;

create or replace function aurora_private.admin_remove_member(org uuid, member_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  perform aurora_private.require_admin();
  delete from aurora_private.org_members m using auth.users u where m.org_id = org and m.user_id = u.id and lower(u.email) = lower(trim(member_email)) returning m.user_id into uid;
  if uid is null then raise exception 'Not a member' using errcode = '22023'; end if;
  perform aurora_private.audit('org.member_remove', uid, jsonb_build_object('org_id', org));
  return jsonb_build_object('user_id', uid);
end;
$$;

create or replace function aurora_private.admin_list_orgs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'tier', o.tier, 'seats', o.seats, 'contract_end', o.contract_end, 'status', o.status,
      'seats_used', (select count(*) from aurora_private.org_members m where m.org_id = o.id),
      'ai_budget_cents', o.ai_monthly_budget_cents, 'ai_hard_cap', o.ai_hard_cap, 'ai_spent_cents', aurora_private.org_ai_spend(o.id),
      'members', (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) order by m.added_at), '[]'::jsonb)
                  from aurora_private.org_members m join auth.users u on u.id = m.user_id where m.org_id = o.id))
    order by o.created_at desc) from aurora_private.organizations o), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
revoke all on function aurora_private.org_of(uuid), aurora_private.org_ai_spend(uuid), aurora_private.ai_allowance(uuid),
  aurora_private.record_ai_usage(uuid, text, text, text, integer, integer, numeric), aurora_private.my_organization(),
  aurora_private.admin_create_org(text, text, integer, date, integer, text), aurora_private.admin_update_org(uuid, text, integer, date, integer, boolean, text, text),
  aurora_private.admin_add_member(uuid, text, text), aurora_private.admin_remove_member(uuid, text), aurora_private.admin_list_orgs() from public, anon;
-- Internal and server-only functions are not callable by signed-in users.
revoke execute on function aurora_private.org_of(uuid), aurora_private.org_ai_spend(uuid), aurora_private.ai_allowance(uuid),
  aurora_private.record_ai_usage(uuid, text, text, text, integer, integer, numeric), aurora_private.tier_of(uuid) from authenticated;
grant execute on function aurora_private.my_organization(), aurora_private.admin_create_org(text, text, integer, date, integer, text),
  aurora_private.admin_update_org(uuid, text, integer, date, integer, boolean, text, text), aurora_private.admin_add_member(uuid, text, text),
  aurora_private.admin_remove_member(uuid, text), aurora_private.admin_list_orgs() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema aurora_private to service_role';
    execute 'grant execute on function aurora_private.ai_allowance(uuid), aurora_private.record_ai_usage(uuid, text, text, text, integer, integer, numeric) to service_role';
  end if;
end $$;

create or replace function public.my_organization() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.my_organization(); $$;
create or replace function public.admin_create_org(org_name text, plan text, seat_count integer, ends date, ai_budget_cents integer, why text) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_create_org(org_name, plan, seat_count, ends, ai_budget_cents, why); $$;
create or replace function public.admin_update_org(org uuid, plan text, seat_count integer, ends date, ai_budget_cents integer, hard_cap boolean, new_status text, why text) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_update_org(org, plan, seat_count, ends, ai_budget_cents, hard_cap, new_status, why); $$;
create or replace function public.admin_add_member(org uuid, member_email text, member_role text default 'member') returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_add_member(org, member_email, member_role); $$;
create or replace function public.admin_remove_member(org uuid, member_email text) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_remove_member(org, member_email); $$;
create or replace function public.admin_list_orgs() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_list_orgs(); $$;
revoke all on function public.my_organization(), public.admin_create_org(text, text, integer, date, integer, text), public.admin_update_org(uuid, text, integer, date, integer, boolean, text, text),
  public.admin_add_member(uuid, text, text), public.admin_remove_member(uuid, text), public.admin_list_orgs() from public, anon;
grant execute on function public.my_organization(), public.admin_create_org(text, text, integer, date, integer, text), public.admin_update_org(uuid, text, integer, date, integer, boolean, text, text),
  public.admin_add_member(uuid, text, text), public.admin_remove_member(uuid, text), public.admin_list_orgs() to authenticated;
