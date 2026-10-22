-- Administrator role, manual plan grants and server-side quotas. Every check raises 'FAIL ...' on a wrong outcome.
-- Users: O (owner, made admin by the SQL bootstrap), U (ordinary user), V (user with a paid-tier grant, not admin).
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test'),
  ('00000000-0000-0000-0000-00000000000b', 'user@test'),
  ('00000000-0000-0000-0000-00000000000c', 'other@test');
-- Owner bootstrap (SQL editor, privileged): the only way an admin is created.
insert into aurora_private.admins (user_id, note) values ('00000000-0000-0000-0000-00000000000a', 'owner bootstrap');

-- Ordinary user: no way into the private schema, no self-promotion, no admin functions.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin perform 1 from aurora_private.admins; raise exception 'FAIL: user read admins'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into aurora_private.admins (user_id) values ('00000000-0000-0000-0000-00000000000b'); raise exception 'FAIL: user made itself admin'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into aurora_private.plan_grants (user_id, tier, reason) values ('00000000-0000-0000-0000-00000000000b', 'intelligence', 'self'); raise exception 'FAIL: user granted itself a plan'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from aurora_private.admin_audit; raise exception 'FAIL: user read the audit log'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.admin_stats(); raise exception 'FAIL: user ran admin_stats'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.admin_list_users(); raise exception 'FAIL: user listed users'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.admin_grant_plan('00000000-0000-0000-0000-00000000000b', 'intelligence', null, 'self grant'); raise exception 'FAIL: user ran admin_grant_plan'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.admin_audit_log(); raise exception 'FAIL: user read admin_audit_log'; exception when insufficient_privilege then null; end $$;
do $$ begin perform aurora_private.tier_of('00000000-0000-0000-0000-00000000000a'); raise exception 'FAIL: user called tier_of'; exception when insufficient_privilege then null; end $$;
do $$ begin perform aurora_private.audit('x', null, '{}'); raise exception 'FAIL: user wrote an audit row'; exception when insufficient_privilege then null; end $$;
do $$ begin update public.profiles set tier = 'intelligence' where id = '00000000-0000-0000-0000-00000000000b'; raise exception 'FAIL: user changed profiles.tier'; exception when insufficient_privilege then null; end $$;
do $$ declare e jsonb := public.my_entitlements(); begin
  if e->>'tier' <> 'free' or (e->>'is_admin')::boolean or e->>'payments' <> 'disabled' then raise exception 'FAIL: user entitlements %', e; end if;
end $$;

-- Profile editing: allowed fields save; invalid values are refused.
update public.profiles set display_name = 'U', bio = 'Analyst', region = 'AUT', language = 'en', timezone = 'Europe/Vienna', visibility = '{"display_name": true}' where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin update public.profiles set region = 'austria' where id = '00000000-0000-0000-0000-00000000000b'; raise exception 'FAIL: invalid region accepted'; exception when check_violation then null; end $$;
do $$ begin update public.profiles set visibility = '[1]' where id = '00000000-0000-0000-0000-00000000000b'; raise exception 'FAIL: non-object visibility accepted'; exception when check_violation then null; end $$;

-- Server-side quotas on the Free plan: 25 notes, 10 watchlist instruments, 2 alert rules.
insert into public.research_notes (user_id, title) select '00000000-0000-0000-0000-00000000000b', 'n' || g from generate_series(1, 25) g;
do $$ begin insert into public.research_notes (user_id, title) values ('00000000-0000-0000-0000-00000000000b', 'over'); raise exception 'FAIL: free note limit not enforced'; exception when raise_exception then null; end $$;
insert into public.user_preferences (user_id, data) values ('00000000-0000-0000-0000-00000000000b', jsonb_build_object('watchlist', (select jsonb_agg(g) from generate_series(1, 10) g)));
do $$ begin update public.user_preferences set data = jsonb_build_object('watchlist', (select jsonb_agg(g) from generate_series(1, 11) g)) where user_id = '00000000-0000-0000-0000-00000000000b'; raise exception 'FAIL: free watchlist limit not enforced'; exception when raise_exception then null; end $$;
do $$ begin update public.user_preferences set data = '{"alerts": [1, 2, 3]}' where user_id = '00000000-0000-0000-0000-00000000000b'; raise exception 'FAIL: free alert limit not enforced'; exception when raise_exception then null; end $$;

-- Owner (admin): statistics, user list, grants with reason and expiry, revocation, audit.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare s jsonb := public.admin_stats(); begin if (s->>'users')::int < 3 or (s->>'admins')::int <> 1 then raise exception 'FAIL: admin_stats %', s; end if; end $$;
do $$ begin if jsonb_array_length(public.admin_list_users('user@')) <> 1 then raise exception 'FAIL: admin_list_users search'; end if; end $$;
do $$ begin perform public.admin_grant_plan('00000000-0000-0000-0000-00000000000b', 'premium', now() + interval '1 day', 'x'); raise exception 'FAIL: grant without a reason'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform public.admin_grant_plan('00000000-0000-0000-0000-00000000000b', 'premium', now() - interval '1 day', 'Beta tester'); raise exception 'FAIL: grant with a past expiry'; exception when invalid_parameter_value then null; end $$;
do $$ begin if public.admin_grant_plan('00000000-0000-0000-0000-00000000000b', 'premium', now() + interval '30 days', 'Beta tester')->>'tier' <> 'premium' then raise exception 'FAIL: premium grant'; end if; end $$;
do $$ begin if public.admin_grant_plan('00000000-0000-0000-0000-00000000000c', 'intelligence', null, 'Research partner')->>'tier' <> 'intelligence' then raise exception 'FAIL: intelligence grant'; end if; end $$;

-- The user now has Premium: higher quotas apply on the server.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare e jsonb := public.my_entitlements(); begin
  if e->>'tier' <> 'premium' or e->'grant'->>'reason' <> 'Beta tester' or (e->'limits'->>'researchNotes')::int <> 100 then raise exception 'FAIL: premium entitlements %', e; end if;
end $$;
insert into public.research_notes (user_id, title) values ('00000000-0000-0000-0000-00000000000b', 'now allowed');
update public.user_preferences set data = jsonb_build_object('watchlist', (select jsonb_agg(g) from generate_series(1, 25) g)) where user_id = '00000000-0000-0000-0000-00000000000b';

-- A paid-tier grant never makes anyone an administrator.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin if (public.my_entitlements()->>'is_admin')::boolean then raise exception 'FAIL: intelligence grant made an admin'; end if; end $$;
do $$ begin perform public.admin_stats(); raise exception 'FAIL: intelligence user ran admin_stats'; exception when insufficient_privilege then null; end $$;
reset role;

-- Expiry: a grant that has ended falls back to Free automatically.
update aurora_private.plan_grants set starts_at = now() - interval '40 days', expires_at = now() - interval '1 day' where user_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin if aurora_private.tier_of('00000000-0000-0000-0000-00000000000b') <> 'free' then raise exception 'FAIL: expired grant still active'; end if; end $$;

-- Revocation and the audit trail.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare gid uuid; begin
  gid := (public.admin_grant_plan('00000000-0000-0000-0000-00000000000b', 'prime', null, 'Trial')->>'grant_id')::uuid;
  if public.admin_revoke_grant(gid, 'Trial ended')->>'tier' <> 'free' then raise exception 'FAIL: revoke'; end if;
  if public.admin_grant_plan('00000000-0000-0000-0000-00000000000c', 'free', null, 'Back to free')->>'tier' <> 'free' then raise exception 'FAIL: return to free'; end if;
  if jsonb_array_length(public.admin_audit_log()) < 5 then raise exception 'FAIL: audit log incomplete'; end if;
  if jsonb_array_length(public.admin_grants('00000000-0000-0000-0000-00000000000b')) < 2 then raise exception 'FAIL: grant history'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from aurora_private.admin_audit where actor is distinct from '00000000-0000-0000-0000-00000000000a') then raise exception 'FAIL: audit actor'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef
             and has_function_privilege('authenticated', p.oid, 'execute')) then raise exception 'FAIL: exposed SECURITY DEFINER function executable by authenticated'; end if;
end $$;
\echo 'Admin and entitlement test: all checks passed'
