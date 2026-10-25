-- Aurora Veritatis: owner role and last-owner protection. Run once after 20261025000000_ai_gateway.sql. Idempotent.
--
-- - Administrators gain a role: 'owner' or 'admin' (default). Owners are set only by SQL in the Supabase editor
--   (privileged); there is no API that creates or promotes an administrator.
-- - The last owner cannot be deleted or demoted, including through deletion of the owner's auth account (the cascade
--   is refused), so a mistaken change cannot lock the owner out.
-- - caller_is_owner() is the check for owner-only areas (for example the private trading workspace). Ordinary
--   administrators are not owners.

alter table aurora_private.admins add column if not exists role text not null default 'admin';
do $$ begin
  alter table aurora_private.admins add constraint admins_role_check check (role in ('owner', 'admin'));
exception when duplicate_object then null; end $$;

create or replace function aurora_private.protect_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (select 1 from aurora_private.admins a where a.role = 'owner' and a.user_id <> old.user_id) then
      raise exception 'The last owner cannot be removed or demoted' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists admins_protect_last_owner on aurora_private.admins;
create trigger admins_protect_last_owner before delete or update on aurora_private.admins
  for each row execute function aurora_private.protect_last_owner();

create or replace function aurora_private.caller_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and aurora_private.session_active()
    and exists (select 1 from aurora_private.admins a where a.user_id = auth.uid() and a.role = 'owner');
$$;
create or replace function public.am_i_owner() returns boolean language sql security invoker set search_path = '' as $$ select aurora_private.caller_is_owner(); $$;

revoke all on function aurora_private.protect_last_owner() from public, anon, authenticated;
revoke all on function aurora_private.caller_is_owner(), public.am_i_owner() from public, anon;
grant execute on function aurora_private.caller_is_owner(), public.am_i_owner() to authenticated;
