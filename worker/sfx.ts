/**
 * Briefing sound design assets, generated once with ElevenLabs Sound Effects on the owner's paid plan (commercial use
 * included) and then committed to the repository (public/media/sfx/), so playback never calls the provider. This
 * route exists only to produce those files: it answers on preview hosts (*.workers.dev) to requests that carry the
 * asset-build header, for a fixed catalogue only, at most a few generations per server per day, and every result is
 * cached at the edge. Production never generates sound effects.
 */
import type { VoiceEnv } from './voice';

export interface SfxSpec {
  text: string;
  duration: number;
  loop?: boolean;
  /** 0–1: how literally the model follows the text. */
  influence?: number;
}

/** Fixed catalogue: original operations-room sound design (no voices, music, weapons or alarms). */
export const SFX: Record<string, SfxSpec> = {
  'ops-room': {
    text: 'Quiet military operations center room tone: steady air conditioning, low hum of computer racks and monitors, faint distant equipment fans, no voices, no music, no beeps',
    duration: 22,
    loop: true,
    influence: 0.6,
  },
  'radio-hiss': { text: 'Very faint military field radio static hiss, steady and soft, no voices, no beeps, no music', duration: 12, loop: true, influence: 0.6 },
  'ptt-open': { text: 'Single short military radio push-to-talk key click with a brief soft squelch, clean, no voice', duration: 0.8, influence: 0.7 },
  'ptt-close': { text: 'Short soft military radio squelch tail as the transmit key is released, no voice', duration: 0.7, influence: 0.7 },
  'console-ack': { text: 'One subtle low electronic console confirmation tone in a military command center, short and soft', duration: 0.8, influence: 0.7 },
};

const DAILY = 6;
let used = { day: '', n: 0 };

export async function sfxRoute(request: Request, env: VoiceEnv, url: URL, name: string, f: typeof fetch = fetch): Promise<Response> {
  const spec = SFX[name];
  if (!spec) return Response.json({ error: 'Unknown sound' }, { status: 404 });
  if (!url.hostname.endsWith('.workers.dev') || request.headers.get('x-aurora-asset-build') !== '1') return Response.json({ error: 'Sound assets are served from /media/sfx/' }, { status: 403 });
  if (!env.ELEVENLABS_API_KEY) return Response.json({ error: 'ElevenLabs is not configured' }, { status: 503 });
  const day = new Date().toISOString().slice(0, 10);
  if (used.day !== day) used = { day, n: 0 };
  if (used.n >= DAILY) return Response.json({ error: 'Daily asset budget used' }, { status: 429 });
  used.n++;
  const res = await f('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192', {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: spec.text, duration_seconds: spec.duration, prompt_influence: spec.influence ?? 0.5, model_id: 'eleven_text_to_sound_v2', ...(spec.loop ? { loop: true } : {}) }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res) return Response.json({ error: 'ElevenLabs did not respond' }, { status: 502 });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 200).replace(/[\r\n]+/g, ' ');
    return Response.json({ error: `ElevenLabs answered ${res.status}`, detail: body }, { status: 502 });
  }
  return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Sfx-Model': 'eleven_text_to_sound_v2' } });
}
