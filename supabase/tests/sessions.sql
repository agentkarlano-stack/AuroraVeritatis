-- Device and session management. Every check raises 'FAIL ...' on a wrong outcome.
-- U has a phone (S1) and a laptop (S2); P (paid plan) has three sessions; X is another user.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'u@test'), ('00000000-0000-0000-0000-0000000000d2', 'p@test'), ('00000000-0000-0000-0000-0000000000d3', 'x@test')
  on conflict do nothing;
insert into auth.sessions (id, user_id, user_agent) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Mozilla/5.0 (iPhone)'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'Mozilla/5.0 (Windows NT 10.0) Chrome/126'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', 'A'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', 'B'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d2', 'C'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d3', 'X');
insert into auth.refresh_tokens (token, session_id) values ('t1', '10000000-0000-0000-0000-000000000001');
insert into aurora_private.plan_grants (user_id, tier, reason) values ('00000000-0000-0000-0000-0000000000d2', 'premium', 'test grant');

set role authenticated;
-- U on the laptop (S2).
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "session_id": "10000000-0000-0000-0000-000000000002"}';
do $$ declare s jsonb := public.my_sessions(); begin
  if jsonb_array_length(s) <> 2 then raise exception 'FAIL: U sees % sessions', jsonb_array_length(s); end if;
  if not exists (select 1 from jsonb_array_elements(s) e where (e->>'current')::boolean and e->>'id' = '10000000-0000-0000-0000-000000000002') then raise exception 'FAIL: current session not marked'; end if;
  if s::text like '%ip%' and s::text ~ '"ip"' then raise exception 'FAIL: IP exposed'; end if;
end $$;
do $$ begin perform 1 from auth.sessions; raise exception 'FAIL: user read auth.sessions directly'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from aurora_private.session_events; raise exception 'FAIL: user read session_events'; exception when insufficient_privilege then null; end $$;
-- Cannot revoke another user's session or the current one through this function.
do $$ begin if public.revoke_my_session('30000000-0000-0000-0000-000000000001') <> 0 then raise exception 'FAIL: revoked another user''s session'; end if; end $$;
do $$ begin perform public.revoke_my_session('10000000-0000-0000-0000-000000000002'); raise exception 'FAIL: revoked the current session'; exception when invalid_parameter_value then null; end $$;
-- Revoke the phone: its row and refresh token go, and it is recorded.
do $$ begin if public.revoke_my_session('10000000-0000-0000-0000-000000000001') <> 1 then raise exception 'FAIL: phone not revoked'; end if; end $$;
reset role;
do $$ begin
  if exists (select 1 from auth.sessions where id = '10000000-0000-0000-0000-000000000001') then raise exception 'FAIL: phone session remains'; end if;
  if exists (select 1 from auth.refresh_tokens where token = 't1') then raise exception 'FAIL: refresh token remains'; end if;
  if not exists (select 1 from auth.sessions where id = '30000000-0000-0000-0000-000000000001') then raise exception 'FAIL: other user lost a session'; end if;
end $$;
-- The phone's still-valid access token: entitlements drop to Free immediately and the status explains why.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "session_id": "10000000-0000-0000-0000-000000000001"}';
do $$ declare e jsonb := public.my_entitlements(); st jsonb := public.session_status(); begin
  if e->>'session' <> 'ended' or e->>'tier' <> 'free' then raise exception 'FAIL: ended session entitlements %', e; end if;
  if (st->>'active')::boolean or st->>'reason' <> 'revoked' then raise exception 'FAIL: status %', st; end if;
end $$;
do $$ begin perform public.revoke_my_session('10000000-0000-0000-0000-000000000002'); raise exception 'FAIL: ended session revoked another'; exception when insufficient_privilege then null; end $$;

-- Paid user P signs in on C. Rule off: nothing changes.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "session_id": "20000000-0000-0000-0000-000000000003"}';
do $$ declare r jsonb := public.claim_session(); begin
  if (r->>'enforced')::boolean or (r->>'revoked')::int <> 0 then raise exception 'FAIL: rule off but %', r; end if;
  if jsonb_array_length(public.my_sessions()) <> 3 then raise exception 'FAIL: sessions removed with the rule off'; end if;
end $$;
-- Only an administrator may switch the rule on.
do $$ begin perform public.admin_set_session_policy(true); raise exception 'FAIL: user changed the session policy'; exception when insufficient_privilege then null; end $$;
reset role;
update aurora_private.session_settings set single_session_paid = true;
set role authenticated;
do $$ declare r jsonb := public.claim_session(); begin
  if not (r->>'enforced')::boolean or (r->>'revoked')::int <> 2 then raise exception 'FAIL: takeover %', r; end if;
  if jsonb_array_length(public.my_sessions()) <> 1 then raise exception 'FAIL: other sessions survived the takeover'; end if;
  if public.my_entitlements()->>'tier' <> 'premium' then raise exception 'FAIL: new session lost the plan'; end if;
end $$;
-- The displaced device (A) learns why.
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "session_id": "20000000-0000-0000-0000-000000000001"}';
do $$ declare st jsonb := public.session_status(); begin
  if (st->>'active')::boolean or st->>'reason' <> 'ended_by_takeover' then raise exception 'FAIL: displaced status %', st; end if;
  if public.my_entitlements()->>'tier' <> 'free' then raise exception 'FAIL: displaced device kept the paid plan'; end if;
end $$;
-- Free users are never limited, even with the rule on.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d3';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d3", "session_id": "30000000-0000-0000-0000-000000000001"}';
do $$ begin if (public.claim_session()->>'enforced')::boolean then raise exception 'FAIL: rule applied to a free user'; end if; end $$;
-- Tokens without a session id (server keys) are not treated as ended.
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d3"}';
do $$ begin if public.my_entitlements()->>'session' <> 'active' then raise exception 'FAIL: token without session id treated as ended'; end if; end $$;
reset role;
update aurora_private.session_settings set single_session_paid = false;
select 'Session test: all checks passed' as result;
