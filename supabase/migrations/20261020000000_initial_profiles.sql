-- Aurora Veritatis — initial user schema (NOT YET APPLIED; review before running against the AuroraVeritatis project).
-- Additive only: creates new tables, touches no existing data.

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

-- Users can read and update only their own rows. `tier` is changed server-side only (billing webhook, Phase 5).
create policy "profiles: own read" on public.profiles for select using (auth.uid() = id);
create policy "profiles: own update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke update (tier) on public.profiles from authenticated, anon;

create policy "prefs: own all" on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes: own all" on public.research_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create a profile row on sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
