/**
 * POST /api/voice/speak: narration with ElevenLabs (owner's Starter plan). Signed-in users only. The plan is metered in
 * characters, so before each synthesis the Worker reads the remaining character balance from ElevenLabs' free
 * subscription endpoint and refuses when the request would eat into a 10 % reserve. Audio is cached at the edge for
 * 30 days by a hash of model, voice and text, so repeated narration costs nothing. Per-user daily character limit and
 * per-IP rate limit on top. The browser's own voice remains the fallback in the app.
 */
import { error } from './http';
import { RateLimiter } from './ratelimit';

export interface VoiceEnv {
  ELEVENLABS_API_KEY?: string;
  /** "off" disables narration without removing the key. */
  ELEVENLABS_ENABLED?: string;
  ELEVENLABS_VOICE_EVE?: string;
  ELEVENLABS_VOICE_KNOX?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface VoiceDeps {
  fetchImpl?: typeof fetch;
  cache?: { get(key: string): Promise<ArrayBuffer | null>; put(key: string, audio: ArrayBuffer): Promise<void> };
  now?: () => number;
}

/** Flash v2.5: ElevenLabs' lowest-cost multilingual model (fewer credits per character than the standard models). */
export const VOICE_MODEL = 'eleven_flash_v2_5';
/** Premade ElevenLabs voices; replaceable with Worker variables. */
const DEFAULT_VOICES = { eve: '21m00Tcm4TlvDq8ikWAM', knox: 'JBFqnCBsd6RMkjVDRZzb' } as const;
export const MAX_CHARS = 1500;
export const USER_DAILY_CHARS = 6000;
const RESERVE_SHARE = 0.1;

const ipLimiter = new RateLimiter(4, 1 / 15);
let usage: Map<string, { day: string; chars: number }> = new Map();
let balance: { at: number; remaining: number; limit: number } | null = null;
export const resetVoiceForTests = () => {
  usage = new Map();
  balance = null;
};

export const voiceEnabled = (env: VoiceEnv) => !!env.ELEVENLABS_API_KEY && env.ELEVENLABS_ENABLED !== 'off';

/** Text that is narrated: whitespace collapsed, citation markers and Markdown symbols removed. */
export function narrationText(raw: string): string {
  return raw
    .replace(/\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g, '')
    .replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function voiceSpeak(request: Request, env: VoiceEnv, deps: VoiceDeps = {}): Promise<Response> {
  const f = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  if (!voiceEnabled(env)) return error(503, 'Natural voice is not available. Your browser can read the text aloud instead.');
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!ipLimiter.allow(ip)) return error(429, 'Too many narration requests. Please wait a few seconds.');
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return error(401, 'Sign in to use the natural voice.');
  const body = (await request.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
  const text = narrationText(typeof body?.text === 'string' ? body.text : '');
  if (text.length < 2 || text.length > MAX_CHARS) return error(400, `Narration text must be 2 to ${MAX_CHARS.toLocaleString('en-US')} characters.`);
  const voiceName = body?.voice === 'knox' ? 'knox' : 'eve';
  const voiceId = (voiceName === 'knox' ? env.ELEVENLABS_VOICE_KNOX : env.ELEVENLABS_VOICE_EVE) || DEFAULT_VOICES[voiceName];

  // Who is asking (free Supabase call); the id keys the per-user daily limit.
  const who = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!who?.ok) return error(401, 'Your session has expired. Please sign in again.');
  const userId = ((await who.json().catch(() => null)) as { id?: string } | null)?.id;
  if (!userId) return error(401, 'Sign in to use the natural voice.');

  const key = await sha256(`${VOICE_MODEL}|${voiceId}|${text}`);
  const hit = await deps.cache?.get(key).catch(() => null);
  if (hit) return audio(hit, 'hit', 0);

  const day = new Date(now()).toISOString().slice(0, 10);
  const u = usage.get(userId);
  const used = u?.day === day ? u.chars : 0;
  if (used + text.length > USER_DAILY_CHARS) return error(429, 'Your natural-voice allowance for today is used. The browser voice is still available.');

  // Plan balance, refreshed at most every 5 minutes (free endpoint).
  if (!balance || now() - balance.at > 5 * 60_000) {
    const s = await f('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY! }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    const j = s?.ok ? ((await s.json().catch(() => null)) as { character_count?: number; character_limit?: number } | null) : null;
    if (!j || typeof j.character_limit !== 'number' || typeof j.character_count !== 'number') return error(503, 'The voice service is unavailable. The browser voice is still available.');
    balance = { at: now(), remaining: j.character_limit - j.character_count, limit: j.character_limit };
  }
  if (balance.remaining - text.length < balance.limit * RESERVE_SHARE) {
    return error(503, "This month's natural-voice allowance is nearly used. The browser voice is still available.");
  }

  const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: VOICE_MODEL }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.warn('ElevenLabs synthesis failed', res?.status ?? 'network');
    return error(502, 'The voice service did not answer. The browser voice is still available.');
  }
  const buf = await res.arrayBuffer();
  usage.set(userId, { day, chars: used + text.length });
  balance.remaining -= text.length;
  await deps.cache?.put(key, buf).catch(() => {});
  return audio(buf, 'miss', text.length);
}

function audio(buf: ArrayBuffer, cache: 'hit' | 'miss', chars: number): Response {
  return new Response(buf, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400', 'X-Voice-Cache': cache, 'X-Voice-Characters': String(chars) },
  });
}
