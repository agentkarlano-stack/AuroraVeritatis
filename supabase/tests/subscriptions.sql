-- Period subscriptions, trials and cancellations. Every check raises 'FAIL ...' on a wrong outcome.
-- O is the administrator (admin.sql), A and B are ordinary users.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'a@test'), ('00000000-0000-0000-0000-0000000000e2', 'b@test') on conflict do nothing;
insert into aurora_private.admins (user_id, note) values ('00000000-0000-0000-0000-00000000000a', 'owner bootstrap') on conflict do nothing;

set role authenticated;
-- A user cannot give itself a subscription or touch the table.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1"}';
do $$ begin perform public.admin_start_subscription('00000000-0000-0000-0000-0000000000e1', 'intelligence', 12, 'complimentary', 'self'); raise exception 'FAIL: user started a subscription'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into aurora_private.subscriptions (user_id, tier, period_months, kind, current_period_end, reason) values ('00000000-0000-0000-0000-0000000000e1', 'prime', 1, 'paid', now() + interval '1 month', 'self'); raise exception 'FAIL: user inserted a subscription'; exception when insufficient_privilege then null; end $$;
do $$ begin if public.my_subscription() is not null then raise exception 'FAIL: phantom subscription'; end if; end $$;

-- Administrator starts a 3-month trial for A.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a"}';
do $$ begin perform public.admin_start_subscription('00000000-0000-0000-0000-0000000000e1', 'prime', 3, 'paid', 'should fail'); raise exception 'FAIL: paid subscription created while payments are off'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform public.admin_start_subscription('00000000-0000-0000-0000-0000000000e1', 'prime', 2, 'trial', 'bad period'); raise exception 'FAIL: 2-month period accepted'; exception when invalid_parameter_value then null; end $$;
do $$ declare r jsonb := public.admin_start_subscription('00000000-0000-0000-0000-0000000000e1', 'prime', 3, 'trial', 'Beta tester trial'); begin
  if r->>'tier' <> 'prime' then raise exception 'FAIL: trial tier %', r; end if;
end $$;
-- Upgrade keeps the period end; the audit log records both actions.
do $$ declare r jsonb := public.admin_change_subscription('00000000-0000-0000-0000-0000000000e1', 'intelligence', 'Upgrade for research project'); begin
  if r->>'tier' <> 'intelligence' then raise exception 'FAIL: upgrade %', r; end if;
end $$;
do $$ begin
  if jsonb_array_length(public.admin_expiring(120)) <> 1 then raise exception 'FAIL: expiring list %', public.admin_expiring(120); end if;
  if jsonb_array_length(public.admin_expiring(14)) <> 0 then raise exception 'FAIL: a 3-month trial is not expiring within 14 days'; end if;
end $$;

-- A sees the subscription, sets a renewal preference, cancels (keeps access) and resumes.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1"}';
do $$ declare s jsonb := public.my_subscription(); begin
  if s->>'tier' <> 'intelligence' or s->>'kind' <> 'trial' or (s->>'period_months')::int <> 3 or s->>'payments' <> 'disabled' then raise exception 'FAIL: my_subscription %', s; end if;
  if public.my_entitlements()->>'tier' <> 'intelligence' then raise exception 'FAIL: entitlements ignore the subscription'; end if;
  if not (public.set_auto_renew(true)->>'auto_renew')::boolean then raise exception 'FAIL: renewal preference not stored'; end if;
  s := public.cancel_my_subscription();
  if not (s->>'cancel_at_period_end')::boolean or (s->>'auto_renew')::boolean then raise exception 'FAIL: cancel %', s; end if;
  if public.my_entitlements()->>'tier' <> 'intelligence' then raise exception 'FAIL: cancelling removed access before the period end'; end if;
  s := public.resume_my_subscription();
  if (s->>'cancel_at_period_end')::boolean then raise exception 'FAIL: resume %', s; end if;
end $$;
-- B sees nothing of A's subscription and cannot cancel it.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2"}';
do $$ begin if public.my_subscription() is not null then raise exception 'FAIL: B sees a subscription'; end if; end $$;
do $$ begin perform public.cancel_my_subscription(); raise exception 'FAIL: B cancelled something'; exception when invalid_parameter_value then null; end $$;

-- Expiry: once the period is over, the plan falls back to Free without any job running.
reset role;
update aurora_private.subscriptions set started_at = now() - interval '4 months', current_period_end = now() - interval '1 day' where user_id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1"}';
do $$ begin
  if public.my_entitlements()->>'tier' <> 'free' then raise exception 'FAIL: expired subscription still active'; end if;
  if (public.my_subscription()->>'active')::boolean then raise exception 'FAIL: expired subscription reported active'; end if;
end $$;
-- An administrator ends it; a higher manual grant still wins over a lower subscription.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a"}';
do $$ begin
  perform public.admin_end_subscription('00000000-0000-0000-0000-0000000000e1', 'Trial finished');
  perform public.admin_start_subscription('00000000-0000-0000-0000-0000000000e1', 'premium', 1, 'complimentary', 'Thank-you month');
  perform public.admin_grant_plan('00000000-0000-0000-0000-0000000000e1', 'prime', null, 'Research partner');
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1"}';
do $$ begin if public.my_entitlements()->>'tier' <> 'prime' then raise exception 'FAIL: highest of grant and subscription not used'; end if; end $$;
reset role;
do $$ begin
  if (select count(*) from aurora_private.admin_audit where action like 'subscription.%') < 4 then raise exception 'FAIL: subscription actions not audited'; end if;
  if (select count(*) from aurora_private.subscriptions where user_id = '00000000-0000-0000-0000-0000000000e1' and ended_at is null) <> 1 then raise exception 'FAIL: more than one current subscription'; end if;
end $$;
select 'Subscription test: all checks passed' as result;
