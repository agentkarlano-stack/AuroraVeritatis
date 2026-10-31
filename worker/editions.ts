/**
 * Operations Briefing editions (plan §13D, §25A): ONE canonical voiced edition per schedule date, generated once by the
 * Worker's scheduled job and shared by every viewer. Records live in Supabase (`briefing_editions`, migration
 * 20261029000000); one MP3 per spoken line lives in the Storage bucket `briefing-audio`. Playback and archive views
 * only read stored files: they never call the voice service.
 *
 * Writes need the Supabase service role (Worker secret SUPABASE_SERVICE_ROLE_KEY); without it the job does nothing and
 * the public endpoints report that the generator is not configured. Reads use the public key and RLS (published,
 * unexpired editions only).
 */
import type { Story } from '../shared/news';
import type { GeoEvent } from '../shared/types';
import { countriesInHeadline, countryName } from '../shared/countryNames';
import { buildPlan, framePlan, type Line, type Plan } from '../src/lib/briefingPlan';
import { json } from './http';
import { speakRole, voiceChain, voiceEnabled, VOICE_CONFIG_VERSION, VOICE_MODEL, type VoiceEnv, type VoiceRole } from './voice';

export interface EditionsEnv extends VoiceEnv {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** PostHog personal API key with read access (query), project id and API host, for the peak-hour measurement. */
  POSTHOG_PERSONAL_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;
  POSTHOG_API_HOST?: string;
}

// ---------- Publication time from measured activity (plan §13D) ----------

export interface PeakResult {
  status: 'measured' | 'insufficient' | 'unavailable';
  /** Busiest hour of the day in UTC (0–23) when measured. */
  peakUtcHour?: number;
  pageviews?: number;
  detail?: string;
}

/** Minimum pageviews before a peak is considered evidence rather than noise. */
export const MIN_PAGEVIEWS = 300;
/** The edition must be available this long before the peak hour starts. */
export const LEAD_MINUTES = 60;

/** Busiest UTC hour from PostHog pageviews over the last 28 days (HogQL query API, read-only). */
export async function measurePeak(env: EditionsEnv, f: F): Promise<PeakResult> {
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) return { status: 'unavailable', detail: 'POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID not set' };
  const host = (env.POSTHOG_API_HOST || 'https://eu.posthog.com').replace(/\/$/, '');
  const res = await f(`${host}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: "SELECT toHour(timestamp) AS h, count() AS c FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 28 DAY GROUP BY h ORDER BY c DESC" } }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) return { status: 'unavailable', detail: `PostHog query answered ${res?.status ?? 'network error'}` };
  const rows = (((await res.json().catch(() => null)) as { results?: unknown[][] } | null)?.results ?? []).filter((r): r is [number, number] => typeof r[0] === 'number' && typeof r[1] === 'number');
  const total = rows.reduce((n, r) => n + r[1], 0);
  if (total < MIN_PAGEVIEWS || !rows.length) return { status: 'insufficient', pageviews: total, detail: `${total} pageviews in 28 days (needs ${MIN_PAGEVIEWS})` };
  return { status: 'measured', peakUtcHour: rows[0]![0], pageviews: total };
}

/** Local publication time (HH:MM in the schedule's zone) that is LEAD_MINUTES before the UTC peak hour, today. */
export function publishBeforePeak(peakUtcHour: number, tz: string, now: number): string {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), peakUtcHour) - LEAD_MINUTES * 60_000;
  const p = parts(t, tz);
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

export interface Schedule {
  timezone: string;
  publish_local: string;
  generation_buffer_minutes: number;
  max_characters: number;
  retention_days: number;
  active: boolean;
  verified: boolean;
  evidence: string;
}

export const BUCKET = 'briefing-audio';
const AUDIO_PATH = /^\d{4}-\d{2}-\d{2}\/r\d{1,3}\/\d{1,3}\.mp3$/;

// ---------- Time-zone arithmetic (DST-safe, no libraries) ----------

function parts(t: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
  const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
}
/** Local calendar date (YYYY-MM-DD) of instant `t` in `tz`. */
export function localDate(t: number, tz: string): string {
  const { y, m, d } = parts(t, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** The instant when the wall clock in `tz` shows `date` `time` (HH:MM). Two refinement steps handle DST offsets. */
export function zonedTime(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const target = Date.UTC(y, m - 1, d, h, mi);
  let t = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(t, tz);
    t += target - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return t;
}

export interface EditionWindow {
  /** Schedule date: the edition key. */
  date: string;
  publishAt: number;
  /** Generation start and editorial cutoff; the edition covers the 24 hours before it. */
  cutoff: number;
  coverageStart: number;
}
/** Today's edition window in the schedule's zone, or null before today's generation start. */
export function editionWindow(now: number, s: Pick<Schedule, 'timezone' | 'publish_local' | 'generation_buffer_minutes'>): EditionWindow | null {
  const date = localDate(now, s.timezone);
  const publishAt = zonedTime(date, s.publish_local.slice(0, 5), s.timezone);
  const cutoff = publishAt - s.generation_buffer_minutes * 60_000;
  if (now < cutoff) return null;
  return { date, publishAt, cutoff, coverageStart: cutoff - 24 * 3_600_000 };
}

// ---------- Supabase REST with the service role ----------

type F = typeof fetch;
const svc = (env: EditionsEnv) => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}` });
const pub = (env: EditionsEnv) => ({ apikey: env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${env.SUPABASE_ANON_KEY!}` });

async function rest<T>(f: F, env: EditionsEnv, path: string, init: RequestInit & { service?: boolean } = {}): Promise<T> {
  const { service = true, ...rest } = init;
  const res = await f(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...rest,
    headers: { ...(service ? svc(env) : pub(env)), 'Content-Type': 'application/json', ...(rest.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]} answered ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---------- The scheduled job ----------

export interface JobDeps {
  fetchImpl?: F;
  now?: () => number;
  events: () => Promise<GeoEvent[]>;
  stories: () => Promise<Story[]>;
}

export interface JobResult {
  action: 'disabled' | 'not-due' | 'not-claimed' | 'published' | 'failed';
  detail?: string;
}

const spoken = (lines: Line[]) => lines.reduce((n, l) => n + l.text.length, 0);
const linesOf = (p: Plan) => [p.intro, p.agenda, ...p.scenes.flatMap((s) => s.lines), p.outro];

/** Builds the edition plan within the character limit (whole stories are dropped from the end, never shortened). */
export function editionPlan(events: GeoEvent[], stories: Story[], w: EditionWindow, maxChars: number): Plan {
  const plan = buildPlan({
    window: '24h',
    now: w.cutoff,
    until: w.cutoff,
    events,
    stories,
    countryOf: (t) => countriesInHeadline(t)[0] ?? null,
    placeName: (iso3) => countryName(iso3) ?? null,
    mode: 'play',
  });
  while (plan.scenes.length > 1 && spoken(linesOf(plan)) > maxChars) plan.scenes.pop();
  // The opening, closing and Security Officer line must match the stories that remain.
  return framePlan(plan);
}

export async function runEditionJob(env: EditionsEnv, deps: JobDeps): Promise<JobResult> {
  const f = deps.fetchImpl ?? fetch;
  const now = (deps.now ?? Date.now)();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { action: 'disabled', detail: 'SUPABASE_SERVICE_ROLE_KEY is not set' };
  const [schedule] = await rest<Schedule[]>(f, env, 'briefing_schedule?id=eq.1&select=*');
  if (!schedule?.active) return { action: 'disabled', detail: 'schedule inactive' };
  // Once a day, align the publication time with the measured activity peak (the schedule records its evidence).
  if (Date.parse((schedule as Schedule & { updated_at?: string }).updated_at ?? '0') < now - 23 * 3_600_000) {
    const peak = await measurePeak(env, f).catch((): PeakResult => ({ status: 'unavailable', detail: 'measurement failed' }));
    const patch: Record<string, unknown> = { updated_at: new Date(now).toISOString() };
    if (peak.status === 'measured') {
      const local = publishBeforePeak(peak.peakUtcHour!, schedule.timezone, now);
      Object.assign(patch, { publish_local: local, verified: true, evidence: `PostHog pageviews, last 28 days (n=${peak.pageviews}): busiest hour ${String(peak.peakUtcHour).padStart(2, '0')}:00 UTC; edition published ${LEAD_MINUTES} minutes earlier (${local} ${schedule.timezone}).` });
      schedule.publish_local = local;
    } else Object.assign(patch, { verified: false, evidence: `Provisional editorial slot: peak not measured (${peak.detail}).` });
    await rest(f, env, 'briefing_schedule?id=eq.1', { method: 'PATCH', body: JSON.stringify(patch) }).catch((e: unknown) => console.warn('Schedule update failed', (e as Error).message));
  }
  await cleanup(env, f, now).catch((e: unknown) => console.warn('Edition cleanup failed', (e as Error).message));
  const w = editionWindow(now, schedule);
  if (!w) return { action: 'not-due' };
  const id = await rest<string | null>(f, env, 'rpc/briefing_claim', {
    method: 'POST',
    body: JSON.stringify({ p_date: w.date, p_coverage_start: new Date(w.coverageStart).toISOString(), p_coverage_end: new Date(w.cutoff).toISOString(), p_scheduled: new Date(w.publishAt).toISOString() }),
  });
  if (!id) return { action: 'not-claimed' };
  const patch = (body: Record<string, unknown>) => rest(f, env, `briefing_editions?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });
  try {
    if (!voiceEnabled(env)) throw new Error('voice service disabled (ELEVENLABS_ENABLED=off or no key)');
    const [events, stories] = await Promise.all([deps.events().catch(() => []), deps.stories().catch(() => [])]);
    const plan = editionPlan(events, stories, w, schedule.max_characters);
    if (!plan.scenes.length) throw new Error('no qualifying, located developments in the covered period');
    const lines = linesOf(plan);
    const audio: { key: string; path: string; bytes: number; role: VoiceRole; voice_source: string; seconds: number }[] = [];
    for (const [i, l] of lines.entries()) {
      const r = await speakRole(env, f, l.speaker, l.text, now, { previous: lines[i - 1]?.text, next: lines[i + 1]?.text });
      if ('failure' in r) throw new Error(`voice ${r.failure.kind}:${r.failure.code} on line ${i + 1}`);
      const path = `${w.date}/r1/${i}.mp3`;
      const up = await f(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...svc(env), 'Content-Type': 'audio/mpeg', 'x-upsert': 'true', 'Cache-Control': '31536000' },
        body: r.audio,
        signal: AbortSignal.timeout(20_000),
      });
      if (!up.ok) throw new Error(`audio upload answered ${up.status}`);
      // CBR 64 kbit/s MP3: duration from size (the player measures the real duration).
      audio.push({ key: `${l.speaker}|${l.text}`, path, bytes: r.audio.byteLength, role: l.speaker, voice_source: r.voice.source, seconds: Math.round((r.audio.byteLength * 8) / 640) / 100 });
    }
    const voiceConfig = { model: VOICE_MODEL, config_version: VOICE_CONFIG_VERSION, roles: Object.fromEntries((['lead', 'knox', 'eve'] as const).map((role) => [role, voiceChain(env, role)[0]!.source])) };
    const publishedAt = new Date(Math.max(Date.now(), w.cutoff));
    await patch({
      status: 'published',
      plan,
      audio,
      voice_config: voiceConfig,
      content_version: plan.version,
      characters: spoken(lines),
      published_at: publishedAt.toISOString(),
      expires_at: new Date(publishedAt.getTime() + schedule.retention_days * 86_400_000).toISOString(),
      locked_until: null,
      error: null,
    });
    return { action: 'published', detail: `${w.date}: ${plan.scenes.length} stories, ${spoken(lines)} characters` };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await patch({ status: 'failed', error: msg, locked_until: null }).catch(() => undefined);
    console.warn('Edition generation failed', msg);
    return { action: 'failed', detail: msg };
  }
}

/** Removes editions past their retention and their audio files. */
async function cleanup(env: EditionsEnv, f: F, now: number) {
  const old = await rest<{ id: string; audio: { path: string }[] }[]>(f, env, `briefing_editions?select=id,audio&expires_at=lt.${new Date(now).toISOString()}`);
  for (const e of old) {
    const prefixes = (e.audio ?? []).map((a) => a.path).filter((p) => AUDIO_PATH.test(p));
    if (prefixes.length) {
      const del = await f(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...svc(env), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes }) });
      if (!del.ok) throw new Error(`audio delete answered ${del.status}`);
    }
    await rest(f, env, `briefing_editions?id=eq.${e.id}`, { method: 'DELETE' });
  }
}

// ---------- Public reads ----------

interface EditionRow {
  edition_date: string;
  revision: number;
  coverage_start: string;
  coverage_end: string;
  published_at: string;
  expires_at: string;
  content_version: string;
  plan: Plan;
  audio: { key: string; path: string; role: VoiceRole; voice_source: string; seconds: number }[];
  voice_config: unknown;
  correction_note: string | null;
}

const SELECT = 'edition_date,revision,coverage_start,coverage_end,published_at,expires_at,content_version,plan,audio,voice_config,correction_note';

function shape(r: EditionRow) {
  return { ...r, audio: r.audio.map((a) => ({ ...a, url: `/api/briefing/audio/${a.path}` })) };
}

/** GET /api/briefing/latest | /api/briefing/edition/:date | /api/briefing/archive | /api/briefing/status */
export async function briefingRoute(path: string, env: EditionsEnv, f: F = fetch): Promise<Response | null> {
  if (!path.startsWith('/api/briefing/')) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: 'Editions are not configured.' }, { status: 503 });
  try {
    if (path === '/api/briefing/latest') {
      const rows = await rest<EditionRow[]>(f, env, `briefing_editions?select=${SELECT}&order=edition_date.desc,revision.desc&limit=1`, { service: false });
      return json({ edition: rows[0] ? shape(rows[0]) : null }, { maxAge: 60 });
    }
    const m = path.match(/^\/api\/briefing\/edition\/(\d{4}-\d{2}-\d{2})$/);
    if (m) {
      const rows = await rest<EditionRow[]>(f, env, `briefing_editions?select=${SELECT}&edition_date=eq.${m[1]}&order=revision.desc&limit=1`, { service: false });
      return rows[0] ? json({ edition: shape(rows[0]) }, { maxAge: 300 }) : json({ error: 'No published edition for that date.' }, { status: 404 });
    }
    if (path === '/api/briefing/archive') {
      const rows = await rest<{ edition_date: string; revision: number; coverage_start: string; coverage_end: string; published_at: string; plan: Plan }[]>(
        f,
        env,
        'briefing_editions?select=edition_date,revision,coverage_start,coverage_end,published_at,plan&order=edition_date.desc,revision.desc&limit=40',
        { service: false },
      );
      return json({ editions: rows.map((r) => ({ date: r.edition_date, revision: r.revision, coverageStart: r.coverage_start, coverageEnd: r.coverage_end, publishedAt: r.published_at, stories: r.plan?.scenes?.map((s) => s.title) ?? [] })) }, { maxAge: 300 });
    }
    if (path === '/api/briefing/status') {
      const [s] = await rest<Schedule[]>(f, env, 'briefing_schedule?id=eq.1&select=publish_local,active,verified,evidence,retention_days', { service: false });
      const latest = await rest<{ edition_date: string; published_at: string; coverage_start: string; coverage_end: string }[]>(f, env, 'briefing_editions?select=edition_date,published_at,coverage_start,coverage_end&order=edition_date.desc&limit=1', { service: false });
      return json({ generator: !!env.SUPABASE_SERVICE_ROLE_KEY, schedule: s ?? null, latest: latest[0] ?? null }, { maxAge: 60 });
    }
    const a = path.match(/^\/api\/briefing\/audio\/(.+)$/);
    if (a && AUDIO_PATH.test(a[1]!)) {
      const res = await f(`${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${a[1]}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return json({ error: 'Audio not found.' }, { status: 404 });
      // Published audio never changes (a correction is a new revision with new paths).
      return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=2592000, immutable' } });
    }
    return json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    const msg = (e as Error).message;
    // Before the migration is applied the tables do not exist: say so plainly.
    return json({ error: /answered 404/.test(msg) ? 'Editions are not set up yet.' : 'Editions are unavailable right now.', detail: msg }, { status: 503 });
  }
}
