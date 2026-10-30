import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Line } from './briefingPlan';
import { audioNarrator, clipKey, readingMs } from './narration';

/** Minimal stand-in for the unlocked audio element: `play()` resolves and the clip "ends" on the next tick. */
function fakeAudio() {
  const el = {
    src: '',
    onended: null as null | (() => void),
    onerror: null as null | (() => void),
    played: [] as string[],
    play() {
      el.played.push(el.src);
      setTimeout(() => el.onended?.(), 0);
      return Promise.resolve();
    },
    pause() {},
    dispatchEvent() {
      return true;
    },
  };
  return el;
}

const lines: Line[] = [
  { speaker: 'lead', text: "All right, let's get started. Operator, what's our current assessment?" },
  { speaker: 'eve', text: 'First, Japan. A magnitude 6.1 earthquake struck off the coast.' },
];

describe('audio narrator', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a caption only once its audio is ready (audio is the clock)', async () => {
    const el = fakeAudio();
    let release: (u: string) => void = () => undefined;
    const first = new Promise<string>((r) => (release = r));
    const clips = new Map([
      [clipKey(lines[0]!), first],
      [clipKey(lines[1]!), Promise.resolve('blob:two')],
    ]);
    const n = audioNarrator(el as unknown as HTMLAudioElement, clips);
    const seen: number[] = [];
    const done = n.speak(lines, (i) => seen.push(i));
    await new Promise((r) => setTimeout(r, 5));
    expect(seen).toEqual([]);
    release('blob:one');
    await done;
    expect(seen).toEqual([0, 1]);
    expect(el.played).toEqual(['blob:one', 'blob:two']);
  });

  it('keeps a failed line on screen for its reading time and reports the failure once', async () => {
    vi.useFakeTimers();
    const el = fakeAudio();
    const failed = Promise.reject(new Error('quota exceeded.'));
    failed.catch(() => undefined);
    const clips = new Map([
      [clipKey(lines[0]!), failed],
      [clipKey(lines[1]!), Promise.resolve('blob:two')],
    ]);
    const n = audioNarrator(el as unknown as HTMLAudioElement, clips);
    const reports: string[] = [];
    n.reportTo((m) => reports.push(m));
    const seen: number[] = [];
    const done = n.speak(lines, (i) => seen.push(i));
    await vi.advanceTimersByTimeAsync(10);
    expect(seen).toEqual([0]);
    await vi.advanceTimersByTimeAsync(readingMs(lines[0]!.text));
    await done;
    expect(seen).toEqual([0, 1]);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(/quota exceeded/);
  });

  it('stops for good when cancelled (no second loop competes for the element)', async () => {
    const el = fakeAudio();
    const clips = new Map(lines.map((l, i) => [clipKey(l), Promise.resolve(`blob:${i}`)]));
    const n = audioNarrator(el as unknown as HTMLAudioElement, clips);
    const seen: number[] = [];
    const done = n.speak(lines, (i) => {
      seen.push(i);
      n.cancel();
    });
    await done;
    expect(seen).toEqual([0]);
  });
});
