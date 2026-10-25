-- Two-account test for HQ saved items (migration 20261025000200). Raises 'FAIL ...' on a wrong outcome.
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'sa@test'), ('bbbbbbbb-0000-0000-0000-0000000000b2', 'sb@test')
  on conflict do nothing;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-0000000000a1';
insert into public.saved_items (user_id, kind, title, href, collection, note)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'country', 'Germany', '/countries/DEU', 'Energy', 'Watch gas storage');
do $$ begin
  insert into public.saved_items (user_id, kind, title) values ('bbbbbbbb-0000-0000-0000-0000000000b2', 'event', 'x');
  raise exception 'FAIL: A saved an item for B';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.saved_items (user_id, kind, title) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'weapon', 'x');
  raise exception 'FAIL: unknown kind accepted';
exception when check_violation then null; end $$;

set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-0000000000b2';
do $$ begin
  if (select count(*) from public.saved_items) <> 0 then raise exception 'FAIL: B sees A''s saved items'; end if;
  update public.saved_items set note = 'changed';
  delete from public.saved_items;
end $$;
reset role;
do $$ begin
  if (select note from public.saved_items where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') <> 'Watch gas storage' then raise exception 'FAIL: B changed A''s item'; end if;
end $$;

set role anon;
do $$ begin
  perform 1 from public.saved_items;
  raise exception 'FAIL: guests can read saved items';
exception when insufficient_privilege then null; end $$;
reset role;

-- Deleting the account removes its saved items.
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
do $$ begin
  if (select count(*) from public.saved_items) <> 0 then raise exception 'FAIL: saved items survive account deletion'; end if;
end $$;
\echo 'saved.sql: all checks passed'
