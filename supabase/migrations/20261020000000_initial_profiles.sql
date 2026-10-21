-- Aurora Veritatis: initial user schema. NOT YET APPLIED. Run once, in the Aurora Veritatis Supabase project only
-- (never in another project of the same organisation). Additive and idempotent: safe to run again, touches no existing data.
-- Reviewed 2026-10-21; the two-account RLS test (scripts/rls.test.ts) checks every rule below against a live project.

-- Safety guard: stop if this database already has a `profiles` table that is not Aurora's (wrong project selected).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'tier') then
    raise exception 'public.profiles exists but is not the Aurora Veritatis table. Check that the Aurora project is selected.';
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  tier text not null default 'free' check (tier in ('free', 'premium', 'prime', 'intelligence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Mirrors the client-side prefs store: layout, hidden widgets, watchlist, favourites, alerts.
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 65536),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists research_notes_user_idx on public.research_notes (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.research_notes enable row level security;

-- Table privileges. Guests (anon) get nothing. Signed-in users may change only their display name: a column-level
-- REVOKE does not override Supabase's default table-level UPDATE grant, so the table grant is removed and only the
-- allowed columns are granted back. `tier` is changed server-side only (billing webhook, service role).
revoke all on public.profiles, public.user_preferences, public.research_notes from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences, public.research_notes to authenticated;

-- Row-level security: each user sees and changes only their own rows. `(select auth.uid())` is evaluated once per query.
drop policy if exists "profiles: own read" on public.profiles;
drop policy if exists "profiles: own update" on public.profiles;
drop policy if exists "prefs: own all" on public.user_preferences;
drop policy if exists "notes: own all" on public.research_notes;
create policy "profiles: own read" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: own update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "prefs: own all" on public.user_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes: own all" on public.research_notes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Abuse limit: at most 1000 notes per account (the app shows the newest 100).
create or replace function public.aurora_notes_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.research_notes where user_id = new.user_id) >= 1000 then
    raise exception 'Note limit reached (1000 per account)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists aurora_notes_quota on public.research_notes;
create trigger aurora_notes_quota before insert on public.research_notes
  for each row execute function public.aurora_notes_quota();

-- Create a profile row on sign-up. Aurora-specific names so no other trigger on auth.users is replaced.
create or replace function public.aurora_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists aurora_on_auth_user_created on auth.users;
create trigger aurora_on_auth_user_created after insert on auth.users
  for each row execute function public.aurora_handle_new_user();

-- Account deletion (GDPR erasure): a signed-in user can delete only their own account. Profile, preferences and notes
-- are removed by the ON DELETE CASCADE foreign keys.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- Functions are not callable by guests; only delete_my_account is callable by signed-in users.
revoke all on function public.aurora_notes_quota() from public, anon, authenticated;
revoke all on function public.aurora_handle_new_user() from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
