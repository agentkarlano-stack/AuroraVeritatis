import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CHARS, narrationText, resetVoiceForTests, voiceSpeak, USER_DAILY_CHARS } from './voice';

afterEach(resetVoiceForTests);
const env = { ELEVENLABS_API_KEY: 'xi-secret-key', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
const req = (body: unknown, token = 'eyJ'.padEnd(40, 'a')) =>
  new Request('https://aurorav.app/api/voice/speak', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': `ip-${Math.random()}` }, body: JSON.stringify(body) });

function provider(opts: { count?: number; limit?: number; user?: string } = {}) {
  const calls: string[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(u.includes('/auth/v1/user') ? 'user' : u.includes('subscription') ? 'balance' : 'tts');
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: opts.user ?? 'u1' }));
    if (u.includes('subscription')) return new Response(JSON.stringify({ character_count: opts.count ?? 1000, character_limit: opts.limit ?? 30000 }));
    expect(JSON.parse(String(init!.body))).toMatchObject({ model_id: 'eleven_flash_v2_5' });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('natural voice', () => {
  it('cleans narration text', () => {
    expect(narrationText('GDP grew [S1, S2] **fast** .  Next')).toBe('GDP grew fast. Next');
  });

  it('is off without a key or when switched off, and needs sign-in', async () => {
    expect((await voiceSpeak(req({ text: 'Hello there' }), {})).status).toBe(503);
    expect((await voiceSpeak(req({ text: 'Hello there' }), { ...env, ELEVENLABS_ENABLED: 'off' })).status).toBe(503);
    expect((await voiceSpeak(req({ text: 'Hello there' }, ''), env)).status).toBe(401);
    expect((await voiceSpeak(req({ text: 'x'.repeat(MAX_CHARS + 1) }), env, { fetchImpl: provider().f })).status).toBe(400);
  });

  it('synthesises once and serves repeats from the cache', async () => {
    const store = new Map<string, ArrayBuffer>();
    const cache = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: ArrayBuffer) => void store.set(k, v) };
    const { f, calls } = provider();
    const a = await voiceSpeak(req({ text: 'Inflation eased in October.', voice: 'knox' }), env, { fetchImpl: f, cache });
    expect(a.status).toBe(200);
    expect(a.headers.get('X-Voice-Cache')).toBe('miss');
    const b = await voiceSpeak(req({ text: 'Inflation eased in October.', voice: 'knox' }), env, { fetchImpl: f, cache });
    expect(b.headers.get('X-Voice-Cache')).toBe('hit');
    expect(calls.filter((c) => c === 'tts')).toHaveLength(1);
  });

  it('keeps a 10 % reserve of the plan and a per-user daily limit', async () => {
    // 30,000 limit, 27,000 used: 3,000 left = the reserve, so nothing more is synthesised.
    const low = provider({ count: 27_000 });
    expect((await voiceSpeak(req({ text: 'Short text here.' }), env, { fetchImpl: low.f })).status).toBe(503);
    expect(low.calls).not.toContain('tts');
    resetVoiceForTests();
    const { f } = provider();
    const text = 'y'.repeat(MAX_CHARS);
    let last = 200;
    for (let i = 0; i * MAX_CHARS <= USER_DAILY_CHARS; i++) last = (await voiceSpeak(req({ text: text.slice(0, MAX_CHARS - i) }), env, { fetchImpl: f })).status;
    expect(last).toBe(429);
  });

  it('never returns the key in errors', async () => {
    const f = vi.fn(async (u: string | URL | Request) =>
      String(u).includes('/auth/v1/user') ? new Response(JSON.stringify({ id: 'u1' })) : String(u).includes('subscription') ? new Response(JSON.stringify({ character_count: 0, character_limit: 30000 })) : new Response('bad xi-secret-key', { status: 401 }),
    ) as unknown as typeof fetch;
    const res = await voiceSpeak(req({ text: 'Hello there' }), env, { fetchImpl: f });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('xi-secret-key');
  });
});
