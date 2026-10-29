import { describe, expect, it, vi } from 'vitest';
import { integrationHealth, publicSummary, scrub, secretNames } from './health';

const now = () => new Date('2026-10-25T03:00:00Z');

describe('integration health', () => {
  it('finds secrets by name and never returns their values', () => {
    const env = { GNEWS_API_KEY: 'gnews-secret-123', OPENSKY_CLIENT_ID: 'id', OPENSKY_CLIENT_SECRET: 'sky-secret-456', ASSETS: {}, lower_case: 'x' };
    expect(secretNames(env, /GNEWS/)).toEqual(['GNEWS_API_KEY']);
    expect(scrub('failed for gnews-secret-123 and sky-secret-456', env)).toBe('failed for [redacted] and [redacted]');
  });

  it('marks missing credentials PENDING, licensed passes TESTED, unlicensed passes BLOCKED, failures BLOCKED with a redacted error', async () => {
    const env = { OPENAI_API_KEY: 'sk-openai-secret', GNEWS_API_KEY: 'gnews-secret-123', ELEVENLABS_API_KEY: 'eleven-secret-789' };
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('openai.com')) return new Response(JSON.stringify({ data: [{}, {}] }));
      if (u.includes('gnews.io')) return new Response(JSON.stringify({ articles: [{}] }));
      if (u.includes('elevenlabs')) return new Response(`bad key eleven-secret-789`, { status: 401 });
      return new Response('', { status: 500 });
    }) as unknown as typeof fetch;
    const rows = await integrationHealth(env, f, now);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.openai).toMatchObject({ status: 'TESTED', authenticated: true, secrets: ['OPENAI_API_KEY'] });
    expect(by.gnews).toMatchObject({ status: 'BLOCKED', authenticated: true });
    expect(by.elevenlabs).toMatchObject({ status: 'BLOCKED', authenticated: false });
    expect(by.eia).toMatchObject({ status: 'PENDING', authenticated: null });
    expect(by.ucdp!.ownerAction).toMatch(/requested/);
    const text = JSON.stringify(rows);
    for (const v of Object.values(env)) expect(text).not.toContain(v);
    // The public summary has statuses and names only.
    expect(Object.keys(publicSummary(rows)[0]!)).toEqual(['id', 'status', 'authenticated', 'secrets']);
    expect(publicSummary(rows).find((r) => r.id === 'elevenlabs')!.reason).toBe('ElevenLabs refused the key (http_401)');
  });

  it('reports voice routing without ids, and a key without the subscription permission still passes', async () => {
    const env = { ELEVENLABS_API_KEY: 'eleven-secret-789', ELEVENLABS_VOICE_ANNA: 'anna-id-0001', ELEVENLABS_VOICE_KNOX: 'adam-id-0002', ELEVENLABS_VOICE_LEAD: 'xav-id-0003' };
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('subscription')) return new Response(JSON.stringify({ detail: { status: 'missing_permissions' } }), { status: 401 });
      if (u.includes('/v1/models')) return new Response(JSON.stringify([{ model_id: 'eleven_flash_v2_5', can_do_text_to_speech: true }]));
      if (u.includes('anna-id')) return new Response(JSON.stringify({ name: 'Emma', category: 'professional' }));
      if (u.includes('/v1/voices/')) return new Response(JSON.stringify({ name: 'X', category: 'premade' }));
      return new Response('', { status: 500 });
    }) as unknown as typeof fetch;
    const rows = await integrationHealth(env, f, now);
    const el = publicSummary(rows).find((r) => r.id === 'elevenlabs')!;
    expect(el.status).toBe('TESTED');
    expect(el.voice).toMatchObject({ subscriptionLookup: 'missing_permissions', modelAvailable: true, 'voice.eve': 'ELEVENLABS_VOICE_ANNA: Emma (professional)' });
    expect(JSON.stringify(el)).not.toMatch(/anna-id|adam-id|xav-id|eleven-secret/);
  });

  it('needs both OpenSky client id and secret, and uses the OAuth2 client-credentials flow', async () => {
    const calls: { url: string; body: string }[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ access_token: 't', expires_in: 1800 }));
    }) as unknown as typeof fetch;
    const rows = await integrationHealth({ OPENSKY_CLIENT_ID: 'my-client', OPENSKY_CLIENT_SECRET: 'sky-secret-456' }, f, now);
    const sky = rows.find((r) => r.id === 'opensky')!;
    expect(sky).toMatchObject({ authenticated: true, status: 'BLOCKED', facts: { tokenExpiresInSeconds: 1800 } });
    expect(sky.secrets).toEqual(['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET']);
    expect(calls[0]!.body).toContain('grant_type=client_credentials');
    const only = await integrationHealth({ OPENSKY_CLIENT_ID: 'my-client' }, f, now);
    expect(only.find((r) => r.id === 'opensky')!.error).toMatch(/secret missing/);
  });
});

describe('secret name variants', () => {
  it('accepts common OpenSky and Cesium names and explains a half-configured OpenSky', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: 't', expires_in: 60, subscription: 'free' }))) as unknown as typeof fetch;
    const rows = await integrationHealth({ OPEN_SKY_CLIENT_ID: 'abc-client', OPEN_SKY_CLIENT_SECRET: 'sky-secret-456', CESIUM_ION_TOKEN: 'cesium-token-123' }, f, now);
    expect(rows.find((r) => r.id === 'opensky')!.authenticated).toBe(true);
    expect(rows.find((r) => r.id === 'cesium')!.authenticated).toBe(true);
    const half = await integrationHealth({ OPENSKY_TOKEN: 'abcdefghij' }, f, now);
    expect(half.find((r) => r.id === 'opensky')!.ownerAction).toMatch(/OPENSKY_TOKEN/);
  });
});
