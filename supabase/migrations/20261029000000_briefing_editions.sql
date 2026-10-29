-- Operations Briefing editions (plan §13D, §25A): ONE canonical voiced edition per schedule date, shared by every
-- viewer, kept for 30 days. Records, stories, sources, transcript and timing live here; audio files live in the
-- Storage bucket "briefing-audio" (never in rows). Only trusted server processes (the Worker's scheduled job with the
-- service role) create or change editions; everyone may read published, unexpired editions.
-- Idempotent (applied twice by scripts/test-migrations.sh).

create table if not exists public.briefing_editions (
  id uuid primary key default gen_random_uuid(),
  -- Schedule date in the schedule's time zone; with `revision` it is the edition key.
  edition_date date not null,
  revision integer not null default 1 check (revision >= 1),
  status text not null check (status in ('generating', 'published', 'failed')),
  coverage_start timestamptz not null,
  coverage_end timestamptz not null,
  scheduled_for timestamptz not null,
  published_at timestamptz,
  expires_at timestamptz,
  content_version text check (char_length(content_version) <= 40),
  -- Frozen plan: scenes, lines (speaker, text), sources, locations, opening and closing lines.
  plan jsonb check (pg_column_size(plan) <= 200000),
  -- One entry per spoken line: { key, path, bytes, role, voice_source, seconds }.
  audio jsonb not null default '[]'::jsonb check (pg_column_size(audio) <= 50000),
  -- Model, configuration version and the voice variable used per role (names only, never ids or keys).
  voice_config jsonb,
  characters integer not null default 0 check (characters >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  error text check (char_length(error) <= 500),
  correction_note text check (char_length(correction_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint briefing_edition_key unique (edition_date, revision),
  constraint briefing_coverage check (coverage_end > coverage_start)
);
create index if not exists briefing_editions_published_idx on public.briefing_editions (edition_date desc, revision desc) where status = 'published';

-- Single-row schedule. The publication time is a PROVISIONAL editorial slot until hourly traffic evidence for
-- comparable sites exists (plan §13D); `verified` records which it is.
create table if not exists public.briefing_schedule (
  id integer primary key default 1 check (id = 1),
  timezone text not null default 'Europe/Budapest',
  publish_local time not null default '07:00',
  generation_buffer_minutes integer not null default 45 check (generation_buffer_minutes between 5 and 240),
  max_characters integer not null default 2400 check (max_characters between 200 and 6000),
  retention_days integer not null default 30 check (retention_days between 1 and 90),
  active boolean not null default true,
  verified boolean not null default false,
  evidence text not null default 'Provisional editorial slot: no hourly traffic evidence for comparable sites yet.',
  updated_at timestamptz not null default now()
);
insert into public.briefing_schedule (id) values (1) on conflict (id) do nothing;

alter table public.briefing_editions enable row level security;
alter table public.briefing_schedule enable row level security;
revoke all on public.briefing_editions, public.briefing_schedule from anon, authenticated;
grant select on public.briefing_editions, public.briefing_schedule to anon, authenticated;

drop policy if exists "editions: read published" on public.briefing_editions;
create policy "editions: read published" on public.briefing_editions for select to anon, authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()));
drop policy if exists "schedule: read" on public.briefing_schedule;
create policy "schedule: read" on public.briefing_schedule for select to anon, authenticated using (true);

-- Atomic claim for the scheduled job: creates the edition row or takes over a stale/failed attempt (at most three
-- attempts); returns the edition id, or null when it is already published, locked by another worker or exhausted.
create or replace function public.briefing_claim(p_date date, p_coverage_start timestamptz, p_coverage_end timestamptz, p_scheduled timestamptz, p_lock_minutes integer default 20)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.briefing_editions (edition_date, revision, status, coverage_start, coverage_end, scheduled_for, attempts, locked_until)
  values (p_date, 1, 'generating', p_coverage_start, p_coverage_end, p_scheduled, 1, now() + make_interval(mins => p_lock_minutes))
  on conflict (edition_date, revision) do update
    set status = 'generating', attempts = public.briefing_editions.attempts + 1,
        locked_until = now() + make_interval(mins => p_lock_minutes), updated_at = now(), error = null
    where public.briefing_editions.status <> 'published'
      and (public.briefing_editions.locked_until is null or public.briefing_editions.locked_until < now())
      and public.briefing_editions.attempts < 3
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.briefing_claim(date, timestamptz, timestamptz, timestamptz, integer) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.briefing_editions, public.briefing_schedule to service_role';
    execute 'grant execute on function public.briefing_claim(date, timestamptz, timestamptz, timestamptz, integer) to service_role';
  end if;
  -- Audio bucket (public read; writes only with the service role, which bypasses Storage policies).
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('briefing-audio', 'briefing-audio', true, 2097152, array['audio/mpeg'])
      on conflict (id) do nothing$q$;
  end if;
end $$;
