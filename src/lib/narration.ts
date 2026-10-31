/**
 * Narration for presentations: speaks a scene's lines in order with one voice per presenter role, and can pause,
 * resume and cancel exactly. Two backends with the same interface:
 * - ElevenLabs audio through the Worker (signed-in users; cached per text and voice): clips are fetched in parallel
 *   while earlier lines play, and played through ONE audio element unlocked during the user's click, so browsers do
 *   not block playback as autoplay after the (asynchronous) preparation;
 * - browser speech synthesis (every visitor): distinct system voices per role, or pitch-separated if only one exists.
 * Failures are reported to the caller (`onProblem`), never skipped silently.
 */
import type { Analyst, Line } from './briefingPlan';

export interface Narrator {
  /** Speaks the lines; `onLine` reports the line being spoken. Resolves when done or cancelled. */
  speak(lines: Line[], onLine: (i: number) => void): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  readonly kind: 'browser' | 'natural';
  /** Registers a callback that receives a short explanation when audio cannot be played (shown to the viewer). */
  reportTo(handler: (message: string) => void): void;
}

const FEMALE = /samantha|victoria|zira|susan|serena|karen|moira|tessa|female|libby|sonia|hazel|aria|jenny/i;
const MALE = /daniel|alex|david|george|ryan|arthur|oliver|male|guy|james|fred/i;

/** Picks distinguishable English voices per role; pitch separates roles that share a voice. */
export function pickVoices(voices: SpeechSynthesisVoice[]): Record<Analyst, { voice: SpeechSynthesisVoice | null; pitch: number }> {
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = en.length ? en : voices;
  const eve = pool.find((v) => FEMALE.test(v.name)) ?? pool[0] ?? null;
  const males = pool.filter((v) => MALE.test(v.name) && v !== eve);
  const knox = males[0] ?? pool.find((v) => v !== eve) ?? eve;
  const lead = males[1] ?? knox;
  return {
    eve: { voice: eve, pitch: eve && eve === knox ? 1.15 : 1 },
    knox: { voice: knox, pitch: knox && knox === eve ? 0.8 : 1 },
    lead: { voice: lead, pitch: lead === knox ? 0.92 : 1 },
  };
}

export function browserNarrator(rate = 1): Narrator | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const synth = window.speechSynthesis;
  let cancelled = false;
  return {
    kind: 'browser',
    async speak(lines, onLine) {
      cancelled = false;
      synth.cancel();
      const roles = pickVoices(synth.getVoices());
      for (let i = 0; i < lines.length && !cancelled; i++) {
        onLine(i);
        const line = lines[i]!;
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(line.text);
          const r = roles[line.speaker];
          if (r.voice) u.voice = r.voice;
          u.lang = r.voice?.lang ?? 'en-GB';
          u.pitch = r.pitch;
          u.rate = rate;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          synth.speak(u);
        });
      }
    },
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    cancel: () => {
      cancelled = true;
      synth.cancel();
    },
    reportTo: () => undefined,
  };
}

/** A short silent WAV as a blob URL (CSP allows blob: media; data: URIs are not allowed). */
function silentClip(): string {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Call synchronously inside the click/tap handler that starts narration: returns an audio element that the browser
 * now allows to play later, after asynchronous preparation.
 */
export function unlockAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  const el = new Audio();
  el.src = silentClip();
  el.play().catch(() => undefined);
  return el;
}

/** Loads audio into an unlocked element and plays it (rejects when the browser refuses playback). */
export function playBlob(el: HTMLAudioElement, blob: Blob, rate: number, onEnded: () => void): Promise<void> {
  el.src = URL.createObjectURL(blob);
  el.dataset.ready = '1';
  el.playbackRate = rate;
  el.onended = onEnded;
  return el.play();
}

export const clipKey = (l: Line) => `${l.speaker}|${l.text}`;

/** Reading time for a caption shown without audio: about 3 words per second, never under 2.4 s. */
export const readingMs = (text: string) => Math.max(2_400, (text.split(/\s+/).length / 3) * 1000 + 600);

export class VoiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** One clip through the Worker; rejects with the server's sanitized message and code. */
export async function fetchClip(line: Line, token: string, ctx: { previous?: string; next?: string } = {}): Promise<string> {
  const res = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: line.text, voice: line.speaker, previous: ctx.previous, next: ctx.next }),
  }).catch(() => null);
  if (!res) throw new VoiceError('The voice service could not be reached.', 'network');
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new VoiceError(j?.error ?? `The voice service answered ${res.status}.`, j?.code ?? `http_${res.status}`);
  }
  return URL.createObjectURL(await res.blob());
}

/**
 * Starts fetching every unique line (at most `concurrency` at a time, in order) and returns one promise per line key,
 * so playback can begin with the first clip while the rest are prepared.
 */
export function prepareClips(lines: Line[], token: string, concurrency = 3): Map<string, Promise<string>> {
  const unique = [...new Map(lines.map((l) => [clipKey(l), l])).values()];
  const out = new Map<string, Promise<string>>();
  let next = 0;
  const resolvers = new Map<string, { resolve: (u: string) => void; reject: (e: unknown) => void }>();
  for (const l of unique) out.set(clipKey(l), new Promise<string>((resolve, reject) => resolvers.set(clipKey(l), { resolve, reject })));
  const worker = async () => {
    while (next < unique.length) {
      const l = unique[next++]!;
      const r = resolvers.get(clipKey(l))!;
      const at = lines.findIndex((x) => clipKey(x) === clipKey(l));
      await fetchClip(l, token, { previous: lines[at - 1]?.text, next: lines[at + 1]?.text }).then(r.resolve, r.reject);
    }
  };
  for (let i = 0; i < Math.min(concurrency, unique.length); i++) void worker();
  // Rejections are handled by the narrator; avoid unhandled-rejection noise for clips never reached.
  for (const p of out.values()) p.catch(() => undefined);
  return out;
}

/**
 * Plays prepared clips through the unlocked element. Each `speak` call gets its own generation: cancelling (or a new
 * scene) ends the previous loop for good, so two loops never compete for the element (the earlier cause of
 * AbortError). Upcoming clips are fetched ahead so the next line starts without a gap. An AbortError from our own
 * source change is not a failure; a real NotAllowedError (no user gesture) is reported once with a recovery action.
 */
export function audioNarrator(el: HTMLAudioElement, clips: Map<string, Promise<string>>): Narrator {
  let generation = 0;
  let reported = false;
  let report: (message: string) => void = () => undefined;
  const warmed = new Set<string>();
  const warm = (key: string) => {
    if (warmed.has(key)) return;
    warmed.add(key);
    void clips
      .get(key)
      ?.then((url) => (url.startsWith('blob:') ? undefined : fetch(url).then((r) => r.blob())))
      .catch(() => undefined);
  };
  const playClip = (src: string, gen: number) =>
    new Promise<void>((resolve) => {
      const done = () => resolve();
      el.onended = done;
      el.onerror = () => {
        if (gen === generation) report('This browser could not decode the voice audio. Captions continue.');
        resolve();
      };
      el.src = src;
      el.play().catch((err: unknown) => {
        const name = err instanceof Error ? err.name : '';
        if (name === 'AbortError' || gen !== generation) return resolve();
        if (name === 'NotAllowedError') {
          report('SOUND_BLOCKED');
          // Wait for the viewer's tap (resume) instead of skipping the line.
          return;
        }
        if (!reported) report('The voice audio could not be played. Captions continue.');
        reported = true;
        resolve();
      });
    });
  const n: Narrator = {
    kind: 'natural',
    async speak(lines, onLine) {
      const gen = ++generation;
      for (let i = 0; i < lines.length && gen === generation; i++) {
        for (const next of lines.slice(i + 1, i + 3)) warm(clipKey(next));
        const p = clips.get(clipKey(lines[i]!));
        let src: string | null = null;
        try {
          src = p ? await p : null;
        } catch (e) {
          if (!reported) report(`Natural voice stopped: ${e instanceof Error ? e.message : 'unknown error'} Captions continue.`);
          reported = true;
        }
        if (gen !== generation) return;
        // The caption appears when its audio is ready (audio is the clock); a missing clip is shown for reading time.
        onLine(i);
        if (!src) {
          await new Promise((r) => setTimeout(r, readingMs(lines[i]!.text)));
          continue;
        }
        await playClip(src, gen);
      }
    },
    pause: () => el.pause(),
    resume: () => void el.play().catch(() => undefined),
    cancel: () => {
      generation++;
      el.pause();
      el.dispatchEvent(new Event('ended'));
    },
    reportTo: (handler) => {
      report = handler;
    },
  };
  return n;
}

/**
 * Creates (or resumes) the Web Audio context inside the user's click, so later scheduled playback is allowed.
 * Returns null where Web Audio is unavailable (the element-based narrator is used then).
 */
export function unlockContext(): AudioContext | null {
  const AC = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) return null;
  try {
    const ctx = new AC();
    void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** Speech region of a decoded clip: leading/trailing silence removed (with a short margin) and loudness evened out. */
export function speechBounds(data: Float32Array, sampleRate: number, threshold = 0.012): { start: number; end: number; gain: number } {
  let a = 0;
  let b = data.length - 1;
  while (a < data.length && Math.abs(data[a]!) < threshold) a++;
  while (b > a && Math.abs(data[b]!) < threshold) b--;
  if (a >= b) return { start: 0, end: data.length / sampleRate, gain: 1 };
  const margin = Math.round(0.035 * sampleRate);
  a = Math.max(0, a - margin);
  b = Math.min(data.length - 1, b + Math.round(0.06 * sampleRate));
  let sum = 0;
  let peak = 0;
  for (let i = a; i <= b; i++) {
    const v = data[i]!;
    sum += v * v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const rms = Math.sqrt(sum / (b - a + 1));
  // Even out the three voices around -20 dBFS, never above 0.95 peak.
  const gain = rms > 0 ? Math.min(2, Math.max(0.5, 0.1 / rms), 0.95 / Math.max(peak, 1e-6)) : 1;
  return { start: a / sampleRate, end: (b + 1) / sampleRate, gain };
}

/** Pause between turns of one story and between stories (seconds): conversational, never dead air. */
export const TURN_GAP = 0.16;
export const STORY_GAP = 0.35;

/**
 * Gapless narrator on the Web Audio clock (two-video audit B08/B13): every clip is fetched and decoded ahead, its
 * silent head and tail trimmed, its loudness evened out, and it is scheduled back to back with a short conversational
 * gap and 8 ms fades (no clicks, no clipped consonants). Captions change when a clip actually starts, measured on the
 * same clock, so pausing (context suspend) keeps voice, captions and scene in step. Decode failures are reported once
 * and the line stays on screen for its reading time.
 */
export function webAudioNarrator(ctx: AudioContext, clips: Map<string, Promise<string>>): Narrator {
  let generation = 0;
  let reported = false;
  let report: (message: string) => void = () => undefined;
  let nextAt = 0;
  const playing = new Set<AudioBufferSourceNode>();
  const decoded = new Map<string, Promise<{ buf: AudioBuffer; start: number; end: number; gain: number } | null>>();
  const decode = (key: string) => {
    let d = decoded.get(key);
    if (!d) {
      d = (clips.get(key) ?? Promise.reject(new Error('missing clip')))
        .then((url) => fetch(url))
        .then((r) => {
          if (!r.ok) throw new Error(`audio ${r.status}`);
          return r.arrayBuffer();
        })
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => ({ buf, ...speechBounds(buf.getChannelData(0), buf.sampleRate) }))
        .catch((e: unknown) => {
          if (!reported) report(`Natural voice stopped: ${e instanceof Error ? e.message : 'unknown error'} Captions continue.`);
          reported = true;
          return null;
        });
      decoded.set(key, d);
    }
    return d;
  };
  // Decode everything ahead, two at a time, in briefing order.
  const keys = [...clips.keys()];
  let k = 0;
  const pump = async () => {
    while (k < keys.length) await decode(keys[k++]!);
  };
  void pump();
  void pump();

  /** Waits on the audio clock (frozen while the context is suspended), checking the generation. */
  const until = (t: number, gen: number) =>
    new Promise<boolean>((resolve) => {
      const tick = () => {
        if (gen !== generation) return resolve(false);
        if (ctx.currentTime >= t) return resolve(true);
        setTimeout(tick, Math.min(50, Math.max(5, (t - ctx.currentTime) * 1000)));
      };
      tick();
    });

  return {
    kind: 'natural',
    async speak(lines, onLine) {
      const gen = ++generation;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined);
        if (ctx.state === 'suspended') report('SOUND_BLOCKED');
      }
      // A new scene starts after the previous one's last clip plus the story gap.
      let at = Math.max(ctx.currentTime + 0.03, nextAt ? nextAt - TURN_GAP + STORY_GAP : 0);
      let lastEnd = at;
      for (let i = 0; i < lines.length; i++) {
        const clip = await decode(clipKey(lines[i]!));
        if (gen !== generation) return;
        if (!clip) {
          // Not playable: show the line for its reading time on the same clock.
          at = Math.max(at, ctx.currentTime + 0.03);
          if (!(await until(at, gen))) return;
          onLine(i);
          at += readingMs(lines[i]!.text) / 1000 + TURN_GAP;
          lastEnd = at;
          continue;
        }
        at = Math.max(at, ctx.currentTime + 0.03);
        const dur = clip.end - clip.start;
        const src = ctx.createBufferSource();
        src.buffer = clip.buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(clip.gain, at + 0.008);
        g.gain.setValueAtTime(clip.gain, at + Math.max(0.01, dur - 0.012));
        g.gain.linearRampToValueAtTime(0, at + dur);
        src.connect(g).connect(ctx.destination);
        src.start(at, clip.start, dur);
        playing.add(src);
        src.onended = () => playing.delete(src);
        const startAt = at;
        void until(startAt, gen).then((ok) => ok && onLine(i));
        lastEnd = at + dur;
        at = lastEnd + TURN_GAP;
      }
      nextAt = at;
      await until(lastEnd, gen);
    },
    pause: () => void ctx.suspend().catch(() => undefined),
    resume: () => void ctx.resume().catch(() => undefined),
    cancel: () => {
      generation++;
      nextAt = 0;
      for (const s of playing) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      playing.clear();
    },
    reportTo: (handler) => {
      report = handler;
    },
  };
}
