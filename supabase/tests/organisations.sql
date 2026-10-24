-- Organisations, named seats and AI budgets. Every check raises 'FAIL ...' on a wrong outcome.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'lead@uni.test'), ('00000000-0000-0000-0000-0000000000f2', 'analyst@uni.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'third@uni.test'), ('00000000-0000-0000-0000-0000000000f4', 'outsider@test')
  on conflict do nothing;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000f5', 'unconfirmed@test', null) on conflict do nothing;
insert into aurora_private.admins (user_id, note) values ('00000000-0000-0000-0000-00000000000a', 'owner bootstrap') on conflict do nothing;
set role authenticated;

-- Ordinary users cannot create organisations, add themselves or record AI usage.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f4"}';
do $$ begin perform public.admin_create_org('Mine', 'intelligence', 100, current_date + 365, 100000, 'self'); raise exception 'FAIL: user created an organisation'; exception when insufficient_privilege then null; end $$;
do $$ begin perform aurora_private.record_ai_usage('00000000-0000-0000-0000-0000000000f4', 'chat', 'x', 'y', 1, 1, 0); raise exception 'FAIL: user recorded AI usage'; exception when insufficient_privilege then null; end $$;
do $$ begin perform aurora_private.ai_allowance('00000000-0000-0000-0000-0000000000f4'); raise exception 'FAIL: user called ai_allowance'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from aurora_private.organizations; raise exception 'FAIL: user read organizations'; exception when insufficient_privilege then null; end $$;

-- The administrator creates a 2-seat organisation with a €50 monthly AI budget.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a"}';
create temporary table t_org as select (public.admin_create_org('Example University', 'prime', 2, current_date + 365, 5000, 'Quote Q-ABC123 accepted')->>'id')::uuid as id;
do $$ declare o uuid := (select id from t_org); begin
  perform public.admin_add_member(o, 'lead@uni.test', 'org_admin');
  perform public.admin_add_member(o, 'ANALYST@uni.test', 'member');
  begin perform public.admin_add_member(o, 'third@uni.test', 'member'); raise exception 'FAIL: more members than seats'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_add_member(o, 'unconfirmed@test', 'member'); raise exception 'FAIL: unconfirmed account added'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_update_org(o, 'prime', 1, current_date + 365, 5000, true, 'active', 'shrink'); raise exception 'FAIL: seats reduced below members'; exception when invalid_parameter_value then null; end;
  if (public.admin_list_orgs()->0->>'seats_used')::int <> 2 then raise exception 'FAIL: seat count %', public.admin_list_orgs(); end if;
end $$;
grant select on t_org to authenticated;

-- Members get the organisation plan; only the organisation admin sees members and usage.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2"}';
do $$ declare m jsonb := public.my_organization(); begin
  if public.my_entitlements()->>'tier' <> 'prime' then raise exception 'FAIL: member plan %', public.my_entitlements(); end if;
  if m->>'role' <> 'member' or m->'members' <> 'null'::jsonb or m->'ai' <> 'null'::jsonb then raise exception 'FAIL: member sees admin data %', m; end if;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1"}';
do $$ declare m jsonb := public.my_organization(); begin
  if jsonb_array_length(m->'members') <> 2 or (m->'ai'->>'budget_cents')::int <> 5000 then raise exception 'FAIL: org admin view %', m; end if;
  begin perform public.admin_add_member((m->>'id')::uuid, 'third@uni.test', 'member'); raise exception 'FAIL: org admin used Aurora admin functions'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f4"}';
do $$ begin if public.my_organization() is not null then raise exception 'FAIL: outsider sees an organisation'; end if; end $$;

-- The one-device rule does not apply to organisation seats.
reset role;
update aurora_private.session_settings set single_session_paid = true;
insert into auth.sessions (id, user_id) values ('f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f2'),
  ('f2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f2') on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "session_id": "f2000000-0000-0000-0000-000000000001"}';
do $$ declare r jsonb := public.claim_session(); begin
  if (r->>'enforced')::boolean or jsonb_array_length(public.my_sessions()) <> 2 then raise exception 'FAIL: one-device rule applied to a seat %', r; end if;
end $$;
reset role;
update aurora_private.session_settings set single_session_paid = false;

-- AI budget: the server records usage; the hard cap blocks at the budget; alerts at 80%.
reset role;
do $$ declare a jsonb; begin
  a := aurora_private.ai_allowance('00000000-0000-0000-0000-0000000000f2');
  if not (a->>'allowed')::boolean or (a->>'alert')::boolean then raise exception 'FAIL: fresh allowance %', a; end if;
  perform aurora_private.record_ai_usage('00000000-0000-0000-0000-0000000000f2', 'briefing', 'provider', 'model', 1000, 500, 4100);
  a := aurora_private.ai_allowance('00000000-0000-0000-0000-0000000000f1');
  if not (a->>'allowed')::boolean or not (a->>'alert')::boolean then raise exception 'FAIL: 82%% not alerted %', a; end if;
  perform aurora_private.record_ai_usage('00000000-0000-0000-0000-0000000000f1', 'chat', 'provider', 'model', 100, 100, 900);
  a := aurora_private.ai_allowance('00000000-0000-0000-0000-0000000000f2');
  if (a->>'allowed')::boolean or a->>'reason' <> 'monthly AI budget reached' then raise exception 'FAIL: hard cap not enforced %', a; end if;
  if not (aurora_private.ai_allowance('00000000-0000-0000-0000-0000000000f4')->>'allowed')::boolean then raise exception 'FAIL: individual blocked by an org budget'; end if;
  -- Contract ended: members fall back to their own plan.
  update aurora_private.organizations set contract_start = current_date - 400, contract_end = current_date - 1;
  if aurora_private.tier_of('00000000-0000-0000-0000-0000000000f2') <> 'free' then raise exception 'FAIL: ended contract still grants a plan'; end if;
  if (select count(*) from aurora_private.admin_audit where action like 'org.%') < 3 then raise exception 'FAIL: organisation actions not audited'; end if;
end $$;
select 'Organisation test: all checks passed' as result;
