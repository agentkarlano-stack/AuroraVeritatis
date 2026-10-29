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

/** Plays prepared clips through the unlocked element; a clip that fails is reported and its line is shown only. */
export function audioNarrator(el: HTMLAudioElement, clips: Map<string, Promise<string>>): Narrator {
  let cancelled = false;
  let reported = false;
  let report: (message: string) => void = () => undefined;
  const n: Narrator = {
    kind: 'natural',
    async speak(lines, onLine) {
      cancelled = false;
      for (let i = 0; i < lines.length && !cancelled; i++) {
        onLine(i);
        const p = clips.get(clipKey(lines[i]!));
        let src: string | null = null;
        try {
          src = p ? await p : null;
        } catch (e) {
          if (!reported) report(`Natural voice stopped: ${e instanceof Error ? e.message : 'unknown error'} Captions continue.`);
          reported = true;
        }
        if (!src || cancelled) continue;
        await new Promise<void>((resolve) => {
          el.onended = () => resolve();
          el.onerror = () => {
            report('This browser could not decode the voice audio. Captions continue.');
            resolve();
          };
          el.src = src!;
          el.play().catch((err: unknown) => {
            report(`This browser blocked audio playback (${err instanceof Error ? err.name : 'error'}). Press Pause and Resume to allow it.`);
            resolve();
          });
        });
      }
    },
    pause: () => el.pause(),
    resume: () => void el.play().catch(() => undefined),
    cancel: () => {
      cancelled = true;
      el.pause();
      el.dispatchEvent(new Event('ended'));
    },
    reportTo: (handler) => {
      report = handler;
    },
  };
  return n;
}
