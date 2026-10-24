-- AI gateway usage control. Every check raises 'FAIL ...' on a wrong outcome.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'ai-user@test'), ('00000000-0000-0000-0000-0000000000c2', 'ai-other@test') on conflict do nothing;
insert into aurora_private.admins (user_id, note) values ('00000000-0000-0000-0000-00000000000a', 'owner bootstrap') on conflict do nothing;
set role authenticated;

-- Off by default: nothing is reserved.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1"}';
do $$ declare r jsonb := public.ai_begin('research', 0.5); begin
  if (r->>'allowed')::boolean or r->>'reason' <> 'AI is switched off' then raise exception 'FAIL: AI not off by default %', r; end if;
end $$;
-- Users cannot change the settings, read the overview or the tables.
do $$ begin perform public.admin_set_ai_settings(true, 999999, '{}'); raise exception 'FAIL: user changed AI settings'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.admin_ai_overview(); raise exception 'FAIL: user read the AI overview'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from aurora_private.ai_requests; raise exception 'FAIL: user read ai_requests'; exception when insufficient_privilege then null; end $$;

-- The administrator switches AI on: Free = 2 requests a day, global budget 2 cents (amounts are euro cents).
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a"}';
do $$ begin
  begin perform public.admin_set_ai_settings(true, 100, '{"free": 2, "premium": 3}'); raise exception 'FAIL: incomplete limits accepted'; exception when invalid_parameter_value then null; end;
  perform public.admin_set_ai_settings(true, 2, '{"free": 2, "premium": 30, "prime": 100, "intelligence": 300}');
end $$;

-- Daily allowance, reservation, completion and the minimum charge.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1"}';
create temporary table t_req (id uuid);
grant all on t_req to authenticated;
do $$ declare a jsonb; b jsonb; c jsonb; begin
  a := public.ai_begin('research', 0.4);
  if not (a->>'allowed')::boolean then raise exception 'FAIL: first request refused %', a; end if;
  insert into t_req values ((a->>'request_id')::uuid);
  -- Reporting a lower cost cannot reduce the charge; a failed request is not counted.
  perform public.ai_finish((a->>'request_id')::uuid, true, 'workers-ai', 'llama', 100, 50, 0);
  begin perform public.ai_finish((a->>'request_id')::uuid, true, 'x', 'y', 1, 1, 0); raise exception 'FAIL: request completed twice'; exception when invalid_parameter_value then null; end;
  b := public.ai_begin('research', 0.4);
  perform public.ai_finish((b->>'request_id')::uuid, false, 'openai', 'm', 0, 0, 0);
  c := public.ai_begin('research', 0.4);
  if not (c->>'allowed')::boolean then raise exception 'FAIL: failed request counted %', c; end if;
  perform public.ai_finish((c->>'request_id')::uuid, true, 'openai', 'm', 10, 10, 0.6);
  c := public.ai_begin('research', 0.4);
  if (c->>'allowed')::boolean or c->>'reason' <> 'daily allowance used' then raise exception 'FAIL: daily allowance not enforced %', c; end if;
  if (public.my_ai_usage()->>'used_today')::int <> 2 then raise exception 'FAIL: usage %', public.my_ai_usage(); end if;
end $$;
-- Another user cannot complete someone else's request.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2"}';
do $$ declare r jsonb := public.ai_begin('research', 0.95); begin
  begin perform public.ai_finish((select id from t_req), true, 'x', 'y', 1, 1, 50); raise exception 'FAIL: finished another user''s request'; exception when invalid_parameter_value then null; end;
  -- Global budget 2 cents: 0.4 + 0.6 charged + 0.95 reserved = 1.95; another 0.1 would exceed it.
  r := public.ai_begin('research', 0.1);
  if (r->>'allowed')::boolean then raise exception 'FAIL: global budget not enforced %', r; end if;
end $$;

-- Overview for the administrator.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a"}';
do $$ declare o jsonb := public.admin_ai_overview(); begin
  if (o->>'month_spend_cents')::numeric < 1.0 or (o->>'month_failed')::int <> 1 then raise exception 'FAIL: overview %', o; end if;
end $$;
reset role;
update aurora_private.ai_settings set enabled = false;
delete from aurora_private.ai_requests;
select 'AI gateway test: all checks passed' as result;
