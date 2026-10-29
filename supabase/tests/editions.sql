-- Operations Briefing editions (migration 20261029000000): public read of published editions only, no client writes,
-- atomic claim for the server job. Raises 'FAIL ...' on a wrong outcome.
\set ON_ERROR_STOP 1
-- Server job (as the table owner here; the service role in production).
do $$ declare a uuid; b uuid; begin
  a := public.briefing_claim('2026-10-29', '2026-10-28 05:15+00', '2026-10-29 05:15+00', '2026-10-29 06:00+00');
  if a is null then raise exception 'FAIL: first claim refused'; end if;
  b := public.briefing_claim('2026-10-29', '2026-10-28 05:15+00', '2026-10-29 05:15+00', '2026-10-29 06:00+00');
  if b is not null then raise exception 'FAIL: a second worker claimed a locked edition'; end if;
  update public.briefing_editions set locked_until = now() - interval '1 minute', status = 'failed' where id = a;
  b := public.briefing_claim('2026-10-29', '2026-10-28 05:15+00', '2026-10-29 05:15+00', '2026-10-29 06:00+00');
  if b is distinct from a then raise exception 'FAIL: a failed edition was not retried on the same row'; end if;
  update public.briefing_editions set status = 'published', published_at = now(), expires_at = now() + interval '30 days', locked_until = null where id = a;
  b := public.briefing_claim('2026-10-29', '2026-10-28 05:15+00', '2026-10-29 05:15+00', '2026-10-29 06:00+00');
  if b is not null then raise exception 'FAIL: a published edition was claimed again'; end if;
  if (select count(*) from public.briefing_editions where edition_date = '2026-10-29') <> 1 then raise exception 'FAIL: duplicate edition rows'; end if;
end $$;
insert into public.briefing_editions (edition_date, status, coverage_start, coverage_end, scheduled_for) values ('2026-10-30', 'generating', now() - interval '1 day', now(), now());
insert into public.briefing_editions (edition_date, status, coverage_start, coverage_end, scheduled_for, published_at, expires_at) values ('2026-09-01', 'published', '2026-08-31', '2026-09-01', '2026-09-01', '2026-09-01', '2026-10-01');

set role anon;
do $$ begin
  if (select count(*) from public.briefing_editions) <> 1 then raise exception 'FAIL: guests see drafts or expired editions'; end if;
  if (select count(*) from public.briefing_schedule) <> 1 then raise exception 'FAIL: guests cannot read the schedule'; end if;
end $$;
do $$ begin
  insert into public.briefing_editions (edition_date, status, coverage_start, coverage_end, scheduled_for) values ('2026-11-01', 'published', now() - interval '1 day', now(), now());
  raise exception 'FAIL: a guest created an edition';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.briefing_claim('2026-11-02', now() - interval '1 day', now(), now());
  raise exception 'FAIL: a guest claimed an edition';
exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  update public.briefing_editions set plan = '{}'::jsonb;
  raise exception 'FAIL: a signed-in user changed an edition';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.briefing_schedule set active = false;
  raise exception 'FAIL: a signed-in user changed the schedule';
exception when insufficient_privilege then null; end $$;
reset role;
\echo 'editions.sql: all checks passed'
