/**
 * Narration for presentations: speaks a scene's lines in order with one voice per analyst, and can pause, resume and
 * cancel exactly. Two backends with the same interface:
 * - browser speech synthesis (free, every visitor): two distinct system voices, or pitch-separated if only one exists;
 * - ElevenLabs audio prepared in advance by the caller (signed-in users; cached by the Worker per text and voice).
 * Nothing here calls an AI model; the text comes from the frozen briefing plan.
 */
import type { Analyst, Line } from './briefingPlan';

export interface Narrator {
  /** Speaks the lines; `onLine` reports the line being spoken. Resolves when done or cancelled. */
  speak(lines: Line[], onLine: (i: number) => void): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  readonly kind: 'browser' | 'natural';
}

const FEMALE = /samantha|victoria|zira|susan|serena|karen|moira|tessa|female|libby|sonia|hazel|aria|jenny/i;
const MALE = /daniel|alex|david|george|ryan|arthur|oliver|male|guy|james|fred/i;

/** Picks two distinguishable English voices (EVE, KNOX); null when the browser has no speech synthesis. */
export function pickVoices(voices: SpeechSynthesisVoice[]): Record<Analyst, { voice: SpeechSynthesisVoice | null; pitch: number }> {
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = en.length ? en : voices;
  const eve = pool.find((v) => FEMALE.test(v.name)) ?? pool[0] ?? null;
  const knox = pool.find((v) => MALE.test(v.name) && v !== eve) ?? pool.find((v) => v !== eve) ?? eve;
  // Same voice for both: separate them by pitch so the two roles stay distinguishable.
  const same = !!eve && eve === knox;
  return { eve: { voice: eve, pitch: same ? 1.15 : 1 }, knox: { voice: knox, pitch: same ? 0.8 : 1 } };
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
  };
}

/** Plays prepared audio clips (one per line, same order as the scene's lines). */
export function audioNarrator(clips: Map<string, string>): Narrator {
  let current: HTMLAudioElement | null = null;
  let cancelled = false;
  return {
    kind: 'natural',
    async speak(lines, onLine) {
      cancelled = false;
      for (let i = 0; i < lines.length && !cancelled; i++) {
        onLine(i);
        const src = clips.get(clipKey(lines[i]!));
        if (!src) continue;
        await new Promise<void>((resolve) => {
          const a = new Audio(src);
          current = a;
          a.onended = () => resolve();
          a.onerror = () => resolve();
          void a.play().catch(() => resolve());
        });
      }
      current = null;
    },
    pause: () => current?.pause(),
    resume: () => void current?.play().catch(() => undefined),
    cancel: () => {
      cancelled = true;
      current?.pause();
      current = null;
    },
  };
}

export const clipKey = (l: Line) => `${l.speaker}|${l.text}`;

/**
 * Prepares ElevenLabs audio for every line through the Worker (cached there per text and voice, so replays and other
 * viewers of the same briefing reuse it). Rejects if any line fails, so the caller can fall back to browser speech.
 */
export async function prepareNaturalVoice(lines: Line[], token: string): Promise<Map<string, string>> {
  const unique = [...new Map(lines.map((l) => [clipKey(l), l])).values()];
  const out = new Map<string, string>();
  for (const l of unique) {
    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: l.text, voice: l.speaker }),
    });
    if (!res.ok) {
      const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
      throw new Error(msg ?? `voice service answered ${res.status}`);
    }
    out.set(clipKey(l), URL.createObjectURL(await res.blob()));
  }
  return out;
}
