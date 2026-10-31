import { describe, expect, it } from 'vitest';
import { sfxRoute } from './sfx';

const req = (h: Record<string, string> = {}) => new Request('https://x/api/sfx/ops-room', { headers: h });

describe('sound asset route', () => {
  it('never generates in production or without the asset-build header', async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response('mp3');
    }) as unknown as typeof fetch;
    expect((await sfxRoute(req({ 'x-aurora-asset-build': '1' }), { ELEVENLABS_API_KEY: 'k' }, new URL('https://aurorav.app/api/sfx/ops-room'), 'ops-room', f)).status).toBe(403);
    expect((await sfxRoute(req(), { ELEVENLABS_API_KEY: 'k' }, new URL('https://pr-1.workers.dev/api/sfx/ops-room'), 'ops-room', f)).status).toBe(403);
    expect((await sfxRoute(req({ 'x-aurora-asset-build': '1' }), { ELEVENLABS_API_KEY: 'k' }, new URL('https://pr-1.workers.dev/api/sfx/x'), 'nope', f)).status).toBe(404);
    expect(calls).toBe(0);
  });
  it('generates a catalogue sound on a preview with the header', async () => {
    let body = '';
    const f = (async (_u: string, init: RequestInit) => {
      body = String(init.body);
      return new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } });
    }) as unknown as typeof fetch;
    const r = await sfxRoute(req({ 'x-aurora-asset-build': '1' }), { ELEVENLABS_API_KEY: 'k' }, new URL('https://pr-1.workers.dev/api/sfx/ops-room'), 'ops-room', f);
    expect(r.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ duration_seconds: 22, loop: true, model_id: 'eleven_text_to_sound_v2' });
    expect(r.headers.get('Cache-Control')).toContain('immutable');
  });
});
