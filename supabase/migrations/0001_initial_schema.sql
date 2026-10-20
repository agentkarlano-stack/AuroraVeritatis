-- Aurora Veritatis — initial schema (Supabase / Postgres)
-- Apply with: supabase db push   (or paste into the SQL editor of the project)
-- All user data is protected by Row Level Security: users can only see their own rows.

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 80),
  plan          text not null default 'free' check (plan in ('free', 'premium', 'prime', 'intelligence')),
  preferred_agent text not null default 'EVE' check (preferred_agent in ('EVE', 'KNOX')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

-- Users may edit their display name / agent, but never their plan.
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Plan changes are reserved for trusted server-side code (service role / billing webhooks).
create or replace function public.guard_profile_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.plan is distinct from old.plan and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'plan can only be changed by the billing system';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_plan before update on public.profiles
  for each row execute function public.guard_profile_plan();

-- ---------------------------------------------------------------------------
-- User preferences (Headquarters layout etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  hq          jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint hq_size check (pg_column_size(hq) < 16384)
);

alter table public.user_preferences enable row level security;

create policy "prefs: read own"   on public.user_preferences for select using (auth.uid() = user_id);
create policy "prefs: insert own" on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "prefs: update own" on public.user_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Watchlists (countries and instruments)
-- ---------------------------------------------------------------------------
create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now()
);

create table if not exists public.watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references public.watchlists (id) on delete cascade,
  kind          text not null check (kind in ('country', 'instrument')),
  ref           text not null check (char_length(ref) between 1 and 32),
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  unique (watchlist_id, kind, ref)
);

create index if not exists watchlists_user_idx on public.watchlists (user_id);
create index if not exists watchlist_items_list_idx on public.watchlist_items (watchlist_id);

alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;

create policy "watchlists: own" on public.watchlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "watchlist_items: via own list" on public.watchlist_items
  for all using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Plan limits (reference table, read-only to clients). Enforcement comes later.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_limits (
  plan                 text primary key,
  watchlists           int not null,
  assets_per_watchlist int not null,
  ai_requests_per_day  int not null,
  alert_rules          int not null
);

alter table public.plan_limits enable row level security;
create policy "plan_limits: public read" on public.plan_limits for select using (true);

insert into public.plan_limits values
  ('free', 1, 10, 3, 2),
  ('premium', 3, 25, 15, 10),
  ('prime', 10, 50, 40, 30),
  ('intelligence', 25, 100, 100, 100)
on conflict (plan) do nothing;

-- ---------------------------------------------------------------------------
-- Automatic profile creation on sign-up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger prefs_touch before update on public.user_preferences
  for each row execute function public.touch_updated_at();
