/**
 * POST /api/voice/speak: narration with ElevenLabs for signed-in users. Three presenter roles (plan §13C):
 * - lead (COMMAND / Commander): ELEVENLABS_VOICE_LEAD (Xavian);
 * - knox (SECURITY OFFICER): ELEVENLABS_VOICE_CHARLIE, then ELEVENLABS_VOICE_KNOX (Adam) as reserve;
 * - eve (RISK ANALYST / Operator): ELEVENLABS_VOICE_ANNA (Anna), then the Amelia variable (ELEVENLABS_VOICE_AME…),
 *   then ELEVENLABS_VOICE_EVE (the former EVE voice), in that order, only after a voice-specific failure.
 * Provider-wide failures (invalid key, missing permission, exhausted quota, rate limit, outage) are classified and
 * stop at once; they never loop through the reserves. Audio is cached at the edge for 30 days by model, configuration
 * version, resolved voice and text, so repeats cost nothing. The character balance from /v1/user/subscription keeps a
 * 10 % reserve when the key may read it; a key without that permission no longer blocks synthesis (the plan's own
 * hard limit and the per-user daily limit still apply). Errors returned to the browser carry a short code, never a key.
 */
import { json } from './http';
import { RateLimiter } from './ratelimit';

export interface VoiceEnv {
  ELEVENLABS_API_KEY?: string;
  /** "off" disables narration without removing the key. */
  ELEVENLABS_ENABLED?: string;
  ELEVENLABS_VOICE_LEAD?: string;
  /** Security Officer voice (owner choice of 29 October); the former KNOX voice is its reserve. */
  ELEVENLABS_VOICE_CHARLIE?: string;
  ELEVENLABS_VOICE_KNOX?: string;
  ELEVENLABS_VOICE_ANNA?: string;
  /** The former EVE voice; second reserve for the EVE role. */
  ELEVENLABS_VOICE_EVE?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  [key: string]: unknown;
}

export interface VoiceDeps {
  fetchImpl?: typeof fetch;
  cache?: { get(key: string): Promise<ArrayBuffer | null>; put(key: string, audio: ArrayBuffer): Promise<void> };
  now?: () => number;
}

/** Flash v2.5: ElevenLabs' lowest-cost model that supports the selected voices. */
export const VOICE_MODEL = 'eleven_flash_v2_5';
/** Part of the cache identity: bump when routing or voice settings change, so new audio never reuses an old voice. */
export const VOICE_CONFIG_VERSION = 'roles-2026-10-29c';
/** Premade ElevenLabs voices, used only when no voice is configured for a role. */
const DEFAULT_VOICES = { eve: '21m00Tcm4TlvDq8ikWAM', knox: 'JBFqnCBsd6RMkjVDRZzb', lead: 'JBFqnCBsd6RMkjVDRZzb' } as const;
export const MAX_CHARS = 1500;
export const USER_DAILY_CHARS = 6000;
const RESERVE_SHARE = 0.1;

export type VoiceRole = 'lead' | 'knox' | 'eve';

/**
 * Delivery per role (ElevenLabs voice settings, supported by Flash v2.5): lower stability gives livelier intonation.
 * Commander steady and authoritative, Analyst conversational, Security Officer firm.
 */
export const ROLE_SETTINGS: Record<VoiceRole, { stability: number; similarity_boost: number; use_speaker_boost: boolean }> = {
  lead: { stability: 0.55, similarity_boost: 0.8, use_speaker_boost: true },
  eve: { stability: 0.38, similarity_boost: 0.78, use_speaker_boost: true },
  knox: { stability: 0.6, similarity_boost: 0.8, use_speaker_boost: true },
};

/** Neighbouring lines sent with a line so intonation continues naturally across turns (not spoken). */
export interface LineContext {
  previous?: string;
  next?: string;
}
export const isRole = (v: unknown): v is VoiceRole => v === 'lead' || v === 'knox' || v === 'eve';

export interface VoiceChoice {
  role: VoiceRole;
  /** Variable that supplied the voice (a name, never a secret), or "default". */
  source: string;
  id: string;
}

/** Name of the Amelia variable: the owner's dashboard shows it truncated as ELEVENLABS_VOICE_AME… */
export const ameliaVar = (env: Record<string, unknown>) =>
  Object.keys(env)
    .filter((k) => /^ELEVENLABS_VOICE_AME/i.test(k) && typeof env[k] === 'string' && (env[k] as string).trim())
    .sort()[0];

/** Voices for a role in order of preference (configured ones only; the default when none is configured). */
export function voiceChain(env: VoiceEnv, role: VoiceRole): VoiceChoice[] {
  const v = (name: string): VoiceChoice | null => {
    const id = env[name];
    return typeof id === 'string' && id.trim() ? { role, source: name, id: id.trim() } : null;
  };
  const amelia = ameliaVar(env);
  const names = role === 'eve' ? ['ELEVENLABS_VOICE_ANNA', ...(amelia ? [amelia] : []), 'ELEVENLABS_VOICE_EVE'] : role === 'knox' ? ['ELEVENLABS_VOICE_CHARLIE', 'ELEVENLABS_VOICE_KNOX'] : ['ELEVENLABS_VOICE_LEAD'];
  const chain = names.map(v).filter((x): x is VoiceChoice => !!x);
  return chain.length ? chain : [{ role, source: 'default', id: DEFAULT_VOICES[role] }];
}

/** Failure classes: only `voice` moves on to the next reserve voice. */
export type FailureKind = 'voice' | 'auth' | 'permission' | 'quota' | 'rate' | 'provider' | 'network';
export interface ProviderFailure {
  kind: FailureKind;
  /** ElevenLabs' detail.status when given (e.g. "voice_not_found"), else "http_<status>". */
  code: string;
  status: number;
}

/** Classifies an ElevenLabs error response from its HTTP status and JSON `detail.status`. */
export function classify(status: number, body: unknown): ProviderFailure {
  const d = (body as { detail?: { status?: unknown } | string } | null)?.detail;
  const code = typeof d === 'object' && d && typeof d.status === 'string' ? d.status : `http_${status}`;
  const c = code.toLowerCase();
  const kind: FailureKind = /voice|model_not_supported|not_fine_tuned/.test(c) || status === 404
    ? 'voice'
    : /missing_permission/.test(c)
      ? 'permission'
      : /quota|credits|insufficient|payment|limit_reached/.test(c) || status === 402
        ? 'quota'
        : /invalid_api_key|unauthorized|unusual_activity/.test(c) || status === 401
          ? 'auth'
          : status === 429 || /too_many|concurrent|rate/.test(c)
            ? 'rate'
            : 'provider';
  return { kind, code, status };
}

const MESSAGES: Record<FailureKind, string> = {
  voice: 'The selected voice is not available to the voice service.',
  auth: 'The voice service refused the server credentials.',
  permission: 'The voice service key lacks a permission needed for speech.',
  quota: 'The voice service allowance is used up for this period.',
  rate: 'The voice service is busy. Please try again shortly.',
  provider: 'The voice service did not answer correctly.',
  network: 'The voice service could not be reached.',
};

const ipLimiter = new RateLimiter(30, 0.5);
let usage: Map<string, { day: string; chars: number }> = new Map();
let balance: { at: number; remaining: number | null; limit: number | null; lookup: string } | null = null;
/** Voices that failed with a voice-specific error in this Worker instance (skipped for an hour). */
let badVoices: Map<string, { at: number; code: string }> = new Map();
export const resetVoiceForTests = () => {
  usage = new Map();
  balance = null;
  badVoices = new Map();
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

const fail = (status: number, message: string, code: string, extra: Record<string, unknown> = {}) => json({ error: message, code, ...extra }, { status });

/** One synthesis request; returns the audio or a classified failure. */
export async function synthesize(env: VoiceEnv, f: typeof fetch, voiceId: string, text: string, role: VoiceRole = 'eve', ctx: LineContext = {}): Promise<{ audio: ArrayBuffer } | { failure: ProviderFailure }> {
  const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: VOICE_MODEL,
      voice_settings: ROLE_SETTINGS[role],
      ...(ctx.previous ? { previous_text: ctx.previous.slice(-300) } : {}),
      ...(ctx.next ? { next_text: ctx.next.slice(0, 300) } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) return { failure: { kind: 'network', code: 'network', status: 0 } };
  if (!res.ok) return { failure: classify(res.status, await res.json().catch(() => null)) };
  const audio = await res.arrayBuffer();
  if (audio.byteLength < 100) return { failure: { kind: 'provider', code: 'empty_audio', status: res.status } };
  return { audio };
}

/**
 * Speaks `text` with the role's first usable voice. Moves to a reserve only after a voice-specific failure, and at most
 * through the configured chain once; any other failure stops immediately.
 */
export async function speakRole(env: VoiceEnv, f: typeof fetch, role: VoiceRole, text: string, now: number, ctx: LineContext = {}): Promise<{ audio: ArrayBuffer; voice: VoiceChoice; skipped: string[] } | { failure: ProviderFailure; skipped: string[] }> {
  const skipped: string[] = [];
  let last: ProviderFailure | null = null;
  for (const v of voiceChain(env, role)) {
    const bad = badVoices.get(v.id);
    if (bad && now - bad.at < 3_600_000) {
      skipped.push(`${v.source}: ${bad.code}`);
      continue;
    }
    const r = await synthesize(env, f, v.id, text, role, ctx);
    if ('audio' in r) return { audio: r.audio, voice: v, skipped };
    last = r.failure;
    if (r.failure.kind !== 'voice') return { failure: r.failure, skipped };
    badVoices.set(v.id, { at: now, code: r.failure.code });
    skipped.push(`${v.source}: ${r.failure.code}`);
  }
  return { failure: last ?? { kind: 'voice', code: 'no_usable_voice', status: 404 }, skipped };
}

export async function voiceSpeak(request: Request, env: VoiceEnv, deps: VoiceDeps = {}): Promise<Response> {
  const f = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  if (!voiceEnabled(env)) return fail(503, 'Natural voice is not available. Your browser can read the text aloud instead.', 'disabled');
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!ipLimiter.allow(ip)) return fail(429, 'Too many narration requests. Please wait a few seconds.', 'rate_limited');
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return fail(401, 'Sign in to use the natural voice.', 'sign_in');
  const body = (await request.json().catch(() => null)) as { text?: unknown; voice?: unknown; previous?: unknown; next?: unknown } | null;
  const text = narrationText(typeof body?.text === 'string' ? body.text : '');
  if (text.length < 2 || text.length > MAX_CHARS) return fail(400, `Narration text must be 2 to ${MAX_CHARS.toLocaleString('en-US')} characters.`, 'bad_text');
  const role: VoiceRole = isRole(body?.voice) ? body.voice : 'eve';
  const ctx: LineContext = {
    previous: typeof body?.previous === 'string' ? narrationText(body.previous).slice(-300) : undefined,
    next: typeof body?.next === 'string' ? narrationText(body.next).slice(0, 300) : undefined,
  };

  // Who is asking (free Supabase call); the id keys the per-user daily limit.
  const who = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!who?.ok) return fail(401, 'Your session has expired. Please sign in again.', 'session');
  const userId = ((await who.json().catch(() => null)) as { id?: string } | null)?.id;
  if (!userId) return fail(401, 'Sign in to use the natural voice.', 'sign_in');

  // Cached audio for the preferred voice of this role (a reserve voice is cached under its own identity).
  const preferred = voiceChain(env, role)[0]!;
  const keyFor = (voiceId: string) => sha256(`${VOICE_MODEL}|${VOICE_CONFIG_VERSION}|${voiceId}|${ctx.previous ?? ''}|${text}|${ctx.next ?? ''}`);
  const hit = await deps.cache?.get(await keyFor(preferred.id)).catch(() => null);
  if (hit) return audio(hit, 'hit', 0, preferred, []);

  const day = new Date(now()).toISOString().slice(0, 10);
  const u = usage.get(userId);
  const used = u?.day === day ? u.chars : 0;
  if (used + text.length > USER_DAILY_CHARS) return fail(429, 'Your natural-voice allowance for today is used. The browser voice is still available.', 'user_daily_limit');

  // Plan balance, refreshed at most every 5 minutes (free endpoint). A key without the "User: read" permission cannot
  // read it; synthesis then continues within the plan's own hard limit and the per-user limit.
  if (!balance || now() - balance.at > 5 * 60_000) {
    const s = await f('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY! }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    const j = s?.ok ? ((await s.json().catch(() => null)) as { character_count?: number; character_limit?: number } | null) : null;
    if (j && typeof j.character_limit === 'number' && typeof j.character_count === 'number') balance = { at: now(), remaining: j.character_limit - j.character_count, limit: j.character_limit, lookup: 'ok' };
    else {
      const lookup = s ? classify(s.status, await s.json().catch(() => null)).code : 'network';
      console.warn('ElevenLabs balance lookup unavailable', lookup);
      balance = { at: now(), remaining: null, limit: null, lookup };
    }
  }
  if (balance.remaining !== null && balance.limit !== null && balance.remaining - text.length < balance.limit * RESERVE_SHARE) {
    return fail(503, "This month's natural-voice allowance is nearly used. The browser voice is still available.", 'reserve');
  }

  const r = await speakRole(env, f, role, text, now(), ctx);
  if ('failure' in r) {
    console.warn('ElevenLabs synthesis failed', r.failure.kind, r.failure.code, r.failure.status, r.skipped.join('; '));
    const status = r.failure.kind === 'rate' ? 429 : r.failure.kind === 'network' || r.failure.kind === 'provider' ? 502 : 503;
    return fail(status, `${MESSAGES[r.failure.kind]} The browser voice is still available.`, `${r.failure.kind}:${r.failure.code}`);
  }
  usage.set(userId, { day, chars: used + text.length });
  if (balance.remaining !== null) balance.remaining -= text.length;
  await deps.cache?.put(await keyFor(r.voice.id), r.audio).catch(() => {});
  return audio(r.audio, 'miss', text.length, r.voice, r.skipped);
}

function audio(buf: ArrayBuffer, cache: 'hit' | 'miss', chars: number, voice: VoiceChoice, skipped: string[]): Response {
  return new Response(buf, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=86400',
      'X-Voice-Cache': cache,
      'X-Voice-Characters': String(chars),
      'X-Voice-Role': voice.role,
      // Variable name only (never the id or a key); tells the client which configured voice spoke.
      'X-Voice-Source': voice.source,
      ...(skipped.length ? { 'X-Voice-Fallback': skipped.join('; ').slice(0, 200) } : {}),
    },
  });
}

/**
 * Free diagnostics for the integration check (no synthesis): subscription lookup, each configured voice (GET
 * /v1/voices/:id) and the model's text-to-speech support (GET /v1/models). Returns names and short codes only.
 */
export async function voiceDiagnostics(env: VoiceEnv, f: typeof fetch): Promise<Record<string, string | number | boolean | null>> {
  const key = env.ELEVENLABS_API_KEY!;
  const get = (url: string) => f(url, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const out: Record<string, string | number | boolean | null> = { enabled: env.ELEVENLABS_ENABLED !== 'off', model: VOICE_MODEL };
  const s = await get('https://api.elevenlabs.io/v1/user/subscription');
  if (s?.ok) {
    const j = (await s.json().catch(() => null)) as { tier?: string; character_count?: number; character_limit?: number } | null;
    out.subscriptionLookup = 'ok';
    out.plan = j?.tier ?? null;
    out.charactersUsed = j?.character_count ?? null;
    out.characterLimit = j?.character_limit ?? null;
  } else out.subscriptionLookup = s ? classify(s.status, await s.json().catch(() => null)).code : 'network';
  const m = await get('https://api.elevenlabs.io/v1/models');
  if (m?.ok) {
    const list = ((await m.json().catch(() => [])) as { model_id?: string; can_do_text_to_speech?: boolean }[]) ?? [];
    const model = list.find((x) => x.model_id === VOICE_MODEL);
    out.modelAvailable = model ? model.can_do_text_to_speech !== false : false;
  } else out.modelAvailable = m ? classify(m.status, await m.json().catch(() => null)).code : 'network';
  for (const role of ['lead', 'knox', 'eve'] as const) {
    for (const [i, v] of voiceChain(env, role).entries()) {
      const label = `voice.${role}${i ? `.reserve${i}` : ''}`;
      const r = await get(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(v.id)}`);
      if (r?.ok) {
        const j = (await r.json().catch(() => null)) as { name?: string; category?: string } | null;
        out[label] = `${v.source}: ${j?.name ?? 'unnamed'} (${j?.category ?? 'unknown category'})`;
      } else out[label] = `${v.source}: ${r ? classify(r.status, await r.json().catch(() => null)).code : 'network'}`;
    }
  }
  return out;
}
