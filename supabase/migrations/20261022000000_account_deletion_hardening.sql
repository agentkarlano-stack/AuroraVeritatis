-- Aurora Veritatis: safer self-service account deletion. Run once in the Aurora Veritatis project, after
-- 20261020000000_initial_profiles.sql. Idempotent. Answers the Security Advisor finding
-- `authenticated_security_definer_function_executable` for public.delete_my_account().
--
-- Design:
-- - The privileged code moves to a schema the Data API does not expose (`aurora_private`). It takes no arguments and
--   can only delete the caller's own auth.users row (auth.uid()), so it cannot be aimed at another account.
-- - It requires a recent sign-in (within 10 minutes, from the JWT `amr` timestamps), so a stolen or long-lived session
--   cannot delete an account. The app asks for the password again before deleting.
-- - public.delete_my_account() becomes a SECURITY INVOKER wrapper: same name for the app, no elevated rights itself.
-- - Profile, preferences and notes are removed by the existing ON DELETE CASCADE foreign keys.

create schema if not exists aurora_private;
revoke all on schema aurora_private from public, anon;
grant usage on schema aurora_private to authenticated;

create or replace function aurora_private.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  last_auth bigint;
begin
  if uid is null or coalesce((claims ->> 'is_anonymous')::boolean, false) then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select max((m ->> 'timestamp')::bigint) into last_auth
    from jsonb_array_elements(case when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr' else '[]'::jsonb end) as m;
  if last_auth is null or last_auth < extract(epoch from now())::bigint - 600 then
    raise exception 'Recent sign-in required' using errcode = '42501', hint = 'Sign in again, then delete within 10 minutes.';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function aurora_private.delete_account() from public, anon;
grant execute on function aurora_private.delete_account() to authenticated;

create or replace function public.delete_my_account() returns void
language sql security invoker set search_path = '' as $$
  select aurora_private.delete_account();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
