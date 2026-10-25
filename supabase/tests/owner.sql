-- Owner role and last-owner protection. Every check raises 'FAIL ...' on a wrong outcome.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'owner-one@test'), ('00000000-0000-0000-0000-0000000000d2', 'owner-two@test') on conflict do nothing;
insert into aurora_private.admins (user_id, note, role) values ('00000000-0000-0000-0000-0000000000d1', 'owner', 'owner') on conflict (user_id) do update set role = 'owner';
-- Remove any other owners a previous suite left, so d1 is the only owner.
update aurora_private.admins set role = 'admin' where role = 'owner' and user_id <> '00000000-0000-0000-0000-0000000000d1';

do $$ begin
  begin delete from aurora_private.admins where user_id = '00000000-0000-0000-0000-0000000000d1'; raise exception 'FAIL: last owner deleted'; exception when insufficient_privilege then null; end;
  begin update aurora_private.admins set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000d1'; raise exception 'FAIL: last owner demoted'; exception when insufficient_privilege then null; end;
  begin delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1'; raise exception 'FAIL: last owner account deleted'; exception when insufficient_privilege then null; end;
end $$;

-- The owner check: true for the owner, false for an ordinary admin and for a user.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';
do $$ begin if not public.am_i_owner() then raise exception 'FAIL: owner not recognised'; end if; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a"}';
do $$ begin if public.am_i_owner() then raise exception 'FAIL: ordinary admin treated as owner'; end if; end $$;
reset role;

-- With a second owner, the first can be demoted; the second then becomes the protected last owner.
insert into aurora_private.admins (user_id, note, role) values ('00000000-0000-0000-0000-0000000000d2', 'second owner', 'owner') on conflict (user_id) do update set role = 'owner';
update aurora_private.admins set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  begin delete from aurora_private.admins where user_id = '00000000-0000-0000-0000-0000000000d2'; raise exception 'FAIL: new last owner deleted'; exception when insufficient_privilege then null; end;
end $$;
select 'Owner test: all checks passed' as result;
