-- Two-account security test for the user schema. Every check raises 'FAIL ...' on a wrong outcome (ON_ERROR_STOP).
-- Run by scripts/test-migrations.sh after applying the migrations twice (idempotency).
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test');
do $$ begin if (select count(*) from public.profiles) <> 2 then raise exception 'FAIL: sign-up trigger did not create profiles'; end if; end $$;

-- Account A writes its own data.
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.user_preferences (user_id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', '{"watchlist":["X.D"]}');
insert into public.research_notes (user_id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'A note');
update public.profiles set display_name = 'A' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$ begin
  insert into public.user_preferences (user_id, data) values ('bbbbbbbb-0000-0000-0000-000000000002', '{}');
  raise exception 'FAIL: A wrote preferences for B';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.research_notes (user_id, title) values ('bbbbbbbb-0000-0000-0000-000000000002', 'x');
  raise exception 'FAIL: A wrote a note for B';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.profiles set tier = 'intelligence' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'FAIL: A raised its own plan tier';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.aurora_handle_new_user();
  raise exception 'FAIL: A called an internal function';
exception when insufficient_privilege then null; end $$;

-- Account B sees and changes nothing of A's.
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: B sees other profiles'; end if;
  if (select count(*) from public.user_preferences) <> 0 then raise exception 'FAIL: B sees A''s preferences'; end if;
  if (select count(*) from public.research_notes) <> 0 then raise exception 'FAIL: B sees A''s notes'; end if;
  update public.research_notes set title = 'changed';
  delete from public.user_preferences;
  update public.profiles set display_name = 'B was here' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
end $$;
reset role;
do $$ begin
  if (select title from public.research_notes) <> 'A note' then raise exception 'FAIL: B changed A''s note'; end if;
  if (select count(*) from public.user_preferences) <> 1 then raise exception 'FAIL: B deleted A''s preferences'; end if;
  if (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 'A' then raise exception 'FAIL: B renamed A'; end if;
end $$;

-- Guests (anon) have no access at all.
set role anon;
do $$ begin
  perform 1 from public.profiles;
  raise exception 'FAIL: guests can query profiles';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: guests can call delete_my_account';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform aurora_private.delete_account();
  raise exception 'FAIL: guests can call the private deletion function';
exception when insufficient_privilege then null; end $$;
reset role;

-- A deletes its own account: refused without a recent sign-in, then allowed. Only A's rows go; B's stay.
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
  'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 3600)))::text, false) \g /dev/null
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: deletion allowed with a sign-in older than 10 minutes';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
  'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 30)))::text, false) \g /dev/null
do $$ begin perform public.delete_my_account(); end $$;
reset role;
do $$ begin
  if (select count(*) from auth.users) <> 1 then raise exception 'FAIL: account deletion'; end if;
  if exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') then raise exception 'FAIL: profile left behind'; end if;
  if (select count(*) from public.user_preferences) + (select count(*) from public.research_notes) <> 0 then raise exception 'FAIL: data left behind'; end if;
  if not exists (select 1 from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') then raise exception 'FAIL: B was affected'; end if;
end $$;
-- The exposed wrapper must not be SECURITY DEFINER (Security Advisor lint 0029).
do $$ begin
  if (select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure) then raise exception 'FAIL: public.delete_my_account is SECURITY DEFINER'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef
             and has_function_privilege('authenticated', p.oid, 'execute')) then raise exception 'FAIL: an exposed SECURITY DEFINER function is executable by authenticated'; end if;
end $$;
\echo 'RLS test: all checks passed'
