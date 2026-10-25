-- HQ saved intelligence: bookmarked events, briefings, countries, sources, charts and map views, grouped into the
-- user's collections with a personal note. One row per item; each account sees and changes only its own rows.
-- Idempotent (applied twice by scripts/test-migrations.sh).

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('event', 'briefing', 'country', 'source', 'chart', 'map', 'story')),
  title text not null check (char_length(title) between 1 and 200),
  href text not null default '' check (char_length(href) <= 600),
  url text not null default '' check (char_length(url) <= 600),
  collection text not null default '' check (char_length(collection) <= 60),
  note text not null default '' check (char_length(note) <= 2000),
  meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_items_user_idx on public.saved_items (user_id, created_at desc);

alter table public.saved_items enable row level security;
revoke all on public.saved_items from anon;
grant select, insert, update, delete on public.saved_items to authenticated;

drop policy if exists "saved: own all" on public.saved_items;
create policy "saved: own all" on public.saved_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Abuse limit: at most 500 saved items per account.
create or replace function public.aurora_saved_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.saved_items where user_id = new.user_id) >= 500 then
    raise exception 'Saved item limit reached (500 per account)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.aurora_saved_quota() from public, anon, authenticated;
drop trigger if exists aurora_saved_quota on public.saved_items;
create trigger aurora_saved_quota before insert on public.saved_items
  for each row execute function public.aurora_saved_quota();
