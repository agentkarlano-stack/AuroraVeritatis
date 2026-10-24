-- Aurora Veritatis: AI gateway usage control (EVE and KNOX). Run once after 20261024000200_organisations.sql. Idempotent.
--
-- How it works
-- - The Worker calls ai_begin() with the signed-in user's own token before every AI request. It checks that AI is
--   switched on, that the user's session is active, the user's daily allowance for their plan, the organisation's
--   monthly AI budget (organisation members) and Aurora's global monthly AI budget. It then reserves the estimated cost.
-- - After the provider answers, the Worker calls ai_finish() with the actual tokens and cost. The charged cost is never
--   lower than the reservation, so a user cannot lower their own usage by calling the functions directly; calling
--   ai_begin() directly only uses up the caller's own allowance.
-- - No service-role key is needed in the Worker. AI stays switched off until an administrator enables it.

create schema if not exists aurora_private;

create table if not exists aurora_private.ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- Global monthly budget for all AI requests (euro cents); requests stop when it is reached.
  monthly_budget_cents integer not null default 3000 check (monthly_budget_cents >= 0),
  -- Requests per user per day, by plan. Never unlimited.
  daily_requests jsonb not null default '{"free": 5, "premium": 30, "prime": 100, "intelligence": 300}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into aurora_private.ai_settings (id) values (true) on conflict (id) do nothing;

create table if not exists aurora_private.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  org_id uuid,
  at timestamptz not null default now(),
  feature text not null check (char_length(feature) between 2 and 40),
  status text not null default 'reserved' check (status in ('reserved', 'done', 'failed')),
  provider text not null default '' check (char_length(provider) <= 40),
  model text not null default '' check (char_length(model) <= 80),
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  est_cost_cents numeric(10, 4) not null check (est_cost_cents >= 0),
  cost_cents numeric(10, 4) not null check (cost_cents >= 0)
);
create index if not exists ai_requests_user_idx on aurora_private.ai_requests (user_id, at desc);
create index if not exists ai_requests_at_idx on aurora_private.ai_requests (at desc);
alter table aurora_private.ai_settings enable row level security;
alter table aurora_private.ai_requests enable row level security;
revoke all on aurora_private.ai_settings, aurora_private.ai_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function aurora_private.ai_month_spend() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost_cents), 0) from aurora_private.ai_requests where at >= date_trunc('month', now()) and status <> 'failed';
$$;

create or replace function aurora_private.ai_today_count(uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from aurora_private.ai_requests where user_id = uid and at >= date_trunc('day', now()) and status <> 'failed';
$$;

/** The caller's AI allowance today (shown in the app) without reserving anything. */
create or replace function aurora_private.my_ai_usage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enabled', s.enabled,
    'tier', aurora_private.tier_of(auth.uid()),
    'used_today', aurora_private.ai_today_count(auth.uid()),
    'limit_today', coalesce((s.daily_requests ->> aurora_private.tier_of(auth.uid()))::integer, 0),
    'resets_at', date_trunc('day', now()) + interval '1 day')
  from aurora_private.ai_settings s where s.id and auth.uid() is not null;
$$;

/** Checks every limit and reserves the estimated cost. Returns {allowed, reason?, request_id?}. */
create or replace function aurora_private.ai_begin(feature text, est_cents numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s aurora_private.ai_settings;
  lim integer;
  org uuid;
  allowance jsonb;
  rid uuid;
begin
  if me is null or not aurora_private.session_active() then return jsonb_build_object('allowed', false, 'reason', 'sign-in required'); end if;
  if feature is null or char_length(feature) not between 2 and 40 then raise exception 'Invalid feature' using errcode = '22023'; end if;
  if est_cents is null or est_cents < 0 or est_cents > 100 then raise exception 'Invalid estimate' using errcode = '22023'; end if;
  select * into s from aurora_private.ai_settings where id;
  if not coalesce(s.enabled, false) then return jsonb_build_object('allowed', false, 'reason', 'AI is switched off'); end if;
  lim := coalesce((s.daily_requests ->> aurora_private.tier_of(me))::integer, 0);
  if aurora_private.ai_today_count(me) >= lim then
    return jsonb_build_object('allowed', false, 'reason', 'daily allowance used', 'limit_today', lim);
  end if;
  if aurora_private.ai_month_spend() + est_cents > s.monthly_budget_cents then
    return jsonb_build_object('allowed', false, 'reason', 'Aurora''s monthly AI budget is used up');
  end if;
  org := aurora_private.org_of(me);
  if org is not null then
    allowance := aurora_private.ai_allowance(me);
    if not coalesce((allowance ->> 'allowed')::boolean, false) then
      return jsonb_build_object('allowed', false, 'reason', coalesce(allowance ->> 'reason', 'organisation AI budget'));
    end if;
  end if;
  insert into aurora_private.ai_requests (user_id, org_id, feature, est_cost_cents, cost_cents)
    values (me, org, feature, est_cents, est_cents) returning id into rid;
  return jsonb_build_object('allowed', true, 'request_id', rid, 'used_today', aurora_private.ai_today_count(me), 'limit_today', lim);
end;
$$;

/**
 * Completes the caller's own reservation (within 10 minutes). The cost charged is the larger of the estimate and the
 * reported cost; a failed request is not counted against the allowance or the budget.
 */
create or replace function aurora_private.ai_finish(request uuid, ok boolean, prov text, mdl text, t_in integer, t_out integer, cents numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r aurora_private.ai_requests;
begin
  select * into r from aurora_private.ai_requests where id = request and user_id = auth.uid() and status = 'reserved' and at > now() - interval '10 minutes' for update;
  if r.id is null then raise exception 'Unknown or completed request' using errcode = '22023'; end if;
  update aurora_private.ai_requests set
    status = case when ok then 'done' else 'failed' end,
    provider = left(coalesce(prov, ''), 40), model = left(coalesce(mdl, ''), 80),
    tokens_in = greatest(0, coalesce(t_in, 0)), tokens_out = greatest(0, coalesce(t_out, 0)),
    cost_cents = case when ok then greatest(r.est_cost_cents, least(coalesce(cents, 0), 100)) else 0 end
  where id = request;
  if ok and r.org_id is not null then
    insert into aurora_private.ai_usage (user_id, org_id, feature, provider, model, tokens_in, tokens_out, cost_cents)
      values (r.user_id, r.org_id, r.feature, left(coalesce(prov, ''), 40), left(coalesce(mdl, ''), 80), greatest(0, coalesce(t_in, 0)), greatest(0, coalesce(t_out, 0)), greatest(r.est_cost_cents, least(coalesce(cents, 0), 100)));
  end if;
  return jsonb_build_object('ok', ok);
end;
$$;

-- Administrators -------------------------------------------------------------------------------------------------
create or replace function aurora_private.admin_ai_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform aurora_private.require_admin();
  return jsonb_build_object(
    'settings', (select jsonb_build_object('enabled', enabled, 'monthly_budget_cents', monthly_budget_cents, 'daily_requests', daily_requests, 'updated_at', updated_at) from aurora_private.ai_settings where id),
    'month_spend_cents', aurora_private.ai_month_spend(),
    'month_requests', (select count(*) from aurora_private.ai_requests where at >= date_trunc('month', now()) and status = 'done'),
    'month_failed', (select count(*) from aurora_private.ai_requests where at >= date_trunc('month', now()) and status = 'failed'),
    'by_provider', coalesce((select jsonb_agg(x) from (
        select provider, model, count(*) as requests, sum(tokens_in) as tokens_in, sum(tokens_out) as tokens_out, sum(cost_cents) as cost_cents
        from aurora_private.ai_requests where at >= date_trunc('month', now()) and status = 'done' group by provider, model order by 6 desc) x), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(x order by x.day) from (
        select date_trunc('day', at)::date as day, count(*) as requests, sum(cost_cents) as cost_cents
        from aurora_private.ai_requests where at >= now() - interval '30 days' and status = 'done' group by 1) x), '[]'::jsonb),
    'top_users', coalesce((select jsonb_agg(x) from (
        select u.email, count(*) as requests, sum(r.cost_cents) as cost_cents
        from aurora_private.ai_requests r join auth.users u on u.id = r.user_id
        where r.at >= date_trunc('month', now()) and r.status = 'done' group by u.email order by 3 desc limit 10) x), '[]'::jsonb));
end;
$$;

create or replace function aurora_private.admin_set_ai_settings(on_off boolean, budget_cents integer, limits jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k text;
begin
  perform aurora_private.require_admin();
  if budget_cents is null or budget_cents < 0 or budget_cents > 100000 then raise exception 'Budget must be 0 to 100000 cents' using errcode = '22023'; end if;
  if limits is null or jsonb_typeof(limits) <> 'object' then raise exception 'Limits must be an object' using errcode = '22023'; end if;
  foreach k in array array['free', 'premium', 'prime', 'intelligence'] loop
    if coalesce(jsonb_typeof(limits -> k), '') <> 'number' or (limits ->> k)::integer < 0 or (limits ->> k)::integer > 10000 then
      raise exception 'Limit for % must be 0 to 10000 requests a day', k using errcode = '22023';
    end if;
  end loop;
  update aurora_private.ai_settings set enabled = on_off, monthly_budget_cents = budget_cents,
    daily_requests = jsonb_build_object('free', (limits ->> 'free')::integer, 'premium', (limits ->> 'premium')::integer, 'prime', (limits ->> 'prime')::integer, 'intelligence', (limits ->> 'intelligence')::integer),
    updated_at = now(), updated_by = auth.uid() where id;
  perform aurora_private.audit('ai.settings', null, jsonb_build_object('enabled', on_off, 'monthly_budget_cents', budget_cents, 'daily_requests', limits));
  return aurora_private.admin_ai_overview() -> 'settings';
end;
$$;

-- Privileges and public wrappers -----------------------------------------------------------------------------------
revoke all on function aurora_private.ai_month_spend(), aurora_private.ai_today_count(uuid), aurora_private.my_ai_usage(),
  aurora_private.ai_begin(text, numeric), aurora_private.ai_finish(uuid, boolean, text, text, integer, integer, numeric),
  aurora_private.admin_ai_overview(), aurora_private.admin_set_ai_settings(boolean, integer, jsonb) from public, anon;
revoke execute on function aurora_private.ai_month_spend(), aurora_private.ai_today_count(uuid) from authenticated;
grant execute on function aurora_private.my_ai_usage(), aurora_private.ai_begin(text, numeric), aurora_private.ai_finish(uuid, boolean, text, text, integer, integer, numeric),
  aurora_private.admin_ai_overview(), aurora_private.admin_set_ai_settings(boolean, integer, jsonb) to authenticated;

create or replace function public.my_ai_usage() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.my_ai_usage(); $$;
create or replace function public.ai_begin(feature text, est_cents numeric) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.ai_begin(feature, est_cents); $$;
create or replace function public.ai_finish(request uuid, ok boolean, prov text, mdl text, t_in integer, t_out integer, cents numeric) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.ai_finish(request, ok, prov, mdl, t_in, t_out, cents); $$;
create or replace function public.admin_ai_overview() returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_ai_overview(); $$;
create or replace function public.admin_set_ai_settings(on_off boolean, budget_cents integer, limits jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select aurora_private.admin_set_ai_settings(on_off, budget_cents, limits); $$;
revoke all on function public.my_ai_usage(), public.ai_begin(text, numeric), public.ai_finish(uuid, boolean, text, text, integer, integer, numeric),
  public.admin_ai_overview(), public.admin_set_ai_settings(boolean, integer, jsonb) from public, anon;
grant execute on function public.my_ai_usage(), public.ai_begin(text, numeric), public.ai_finish(uuid, boolean, text, text, integer, integer, numeric),
  public.admin_ai_overview(), public.admin_set_ai_settings(boolean, integer, jsonb) to authenticated;
