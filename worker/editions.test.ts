import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoEvent } from '../shared/types';
import { briefingRoute, editionPlan, editionWindow, localDate, runEditionJob, zonedTime } from './editions';
import { resetVoiceForTests } from './voice';

afterEach(resetVoiceForTests);
const sched = { timezone: 'Europe/Budapest', publish_local: '07:00:00', generation_buffer_minutes: 45, max_characters: 2400, retention_days: 30, active: true, verified: false, evidence: 'provisional' };
const env = { SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key', ELEVENLABS_API_KEY: 'xi-key', ELEVENLABS_VOICE_LEAD: 'lead-id', ELEVENLABS_VOICE_KNOX: 'knox-id', ELEVENLABS_VOICE_ANNA: 'anna-id' };
const quake = (h: number, id = 'usgs-1'): GeoEvent => ({
  id,
  title: 'M6.1 - 50 km E of Miyako, Japan',
  summary: 'Magnitude 6.1 earthquake at 20 km depth.',
  category: 'natural-disaster',
  severity: 4,
  lat: 39.6,
  lon: 142.5,
  region: '50 km E of Miyako, Japan',
  time: new Date(Date.parse('2026-10-29T05:15:00Z') - h * 3_600_000).toISOString(),
  provenance: 'confirmed',
  source: { name: 'USGS', url: `https://usgs.gov/${id}`, license: 'PD' },
});

describe('edition schedule (Europe/Budapest, DST-safe)', () => {
  it('converts local schedule times to instants in winter and summer', () => {
    expect(new Date(zonedTime('2026-10-29', '07:00', 'Europe/Budapest')).toISOString()).toBe('2026-10-29T06:00:00.000Z');
    expect(new Date(zonedTime('2026-07-01', '07:00', 'Europe/Budapest')).toISOString()).toBe('2026-07-01T05:00:00.000Z');
    // Clock change day (25 Oct 2026, 03:00 → 02:00): 07:00 is already winter time.
    expect(new Date(zonedTime('2026-10-25', '07:00', 'Europe/Budapest')).toISOString()).toBe('2026-10-25T06:00:00.000Z');
    expect(localDate(Date.parse('2026-10-29T23:30:00Z'), 'Europe/Budapest')).toBe('2026-10-30');
  });

  it('is due only after the generation start, with a 24-hour coverage ending at the cutoff', () => {
    expect(editionWindow(Date.parse('2026-10-29T05:00:00Z'), sched)).toBeNull();
    const w = editionWindow(Date.parse('2026-10-29T05:20:00Z'), sched)!;
    expect(w.date).toBe('2026-10-29');
    expect(new Date(w.cutoff).toISOString()).toBe('2026-10-29T05:15:00.000Z');
    expect(w.cutoff - w.coverageStart).toBe(24 * 3_600_000);
  });

  it('keeps whole stories within the character limit', () => {
    const w = editionWindow(Date.parse('2026-10-29T05:20:00Z'), sched)!;
    const events = [quake(2), { ...quake(3, 'usgs-2'), lat: -20, lon: -70, region: 'Tarapaca, Chile', title: 'M5.9 - Tarapaca, Chile' }];
    const full = editionPlan(events, [], w, 6000);
    const cut = editionPlan(events, [], w, 400);
    expect(full.scenes.length).toBe(2);
    expect(cut.scenes.length).toBe(1);
    expect(cut.intro.speaker).toBe('lead');
  });
});

function supabase(opts: { claim?: string | null; failTts?: boolean } = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    calls.push({ method, url: u, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    if (u.includes('briefing_schedule')) return new Response(JSON.stringify([sched]));
    if (u.includes('expires_at=lt.')) return new Response('[]');
    if (u.includes('rpc/briefing_claim')) return new Response(JSON.stringify(opts.claim === undefined ? 'edition-1' : opts.claim));
    if (u.includes('text-to-speech')) return opts.failTts ? new Response(JSON.stringify({ detail: { status: 'quota_exceeded' } }), { status: 401 }) : new Response(new Uint8Array(4000));
    if (u.includes('/storage/v1/object/')) return new Response('{}');
    if (u.includes('briefing_editions?id=eq.')) return new Response('');
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('edition job', () => {
  const deps = (f: typeof fetch) => ({ fetchImpl: f, now: () => Date.parse('2026-10-29T05:20:00Z'), events: async () => [quake(2)], stories: async () => [] });

  it('does nothing without the service role or before the slot', async () => {
    expect((await runEditionJob({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, deps(supabase().f))).action).toBe('disabled');
    const { f } = supabase();
    expect((await runEditionJob(env, { ...deps(f), now: () => Date.parse('2026-10-29T04:00:00Z') })).action).toBe('not-due');
  });

  it('generates once: claims, synthesises each line, uploads audio files and publishes the frozen plan', async () => {
    const { f, calls } = supabase();
    const r = await runEditionJob(env, deps(f));
    expect(r.action).toBe('published');
    const tts = calls.filter((c) => c.url.includes('text-to-speech'));
    const uploads = calls.filter((c) => c.url.includes('/storage/v1/object/briefing-audio/2026-10-29/r1/'));
    expect(uploads.length).toBe(tts.length);
    expect(tts.some((c) => c.url.includes('lead-id')) && tts.some((c) => c.url.includes('knox-id'))).toBe(true);
    const publish = calls.find((c) => c.method === 'PATCH')!.body as { status: string; plan: { scenes: unknown[] }; audio: { voice_source: string }[]; expires_at: string };
    expect(publish.status).toBe('published');
    expect(publish.plan.scenes.length).toBe(1);
    expect(publish.audio[0]!.voice_source).toBe('ELEVENLABS_VOICE_LEAD');
    expect(JSON.stringify(publish)).not.toMatch(/xi-key|service-key|lead-id|knox-id|anna-id/);
  });

  it('skips when another worker holds the edition, and records a failure without retrying voices endlessly', async () => {
    expect((await runEditionJob(env, deps(supabase({ claim: null }).f))).action).toBe('not-claimed');
    const { f, calls } = supabase({ failTts: true });
    const r = await runEditionJob(env, deps(f));
    expect(r.action).toBe('failed');
    expect(r.detail).toContain('quota');
    expect(calls.filter((c) => c.url.includes('text-to-speech'))).toHaveLength(1);
    expect((calls.find((c) => c.method === 'PATCH')!.body as { status: string }).status).toBe('failed');
  });
});

describe('edition reads', () => {
  it('serves only valid audio paths and reports a missing setup plainly', async () => {
    const f = vi.fn(async () => new Response('x', { status: 404 })) as unknown as typeof fetch;
    expect((await briefingRoute('/api/briefing/audio/../../secrets', env, f))!.status).toBe(404);
    const r = await briefingRoute('/api/briefing/latest', env, f);
    expect(r!.status).toBe(503);
    expect(((await r!.json()) as { error: string }).error).toBe('Editions are not set up yet.');
  });
});
