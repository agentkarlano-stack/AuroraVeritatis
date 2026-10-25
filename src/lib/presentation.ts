/**
 * Presentation timeline (briefings and tours): scenes with durations on one clock. Pure functions; the player keeps
 * the clock and calls these to find the scene and offset for any time, so pause, resume and seeking are exact.
 */
export interface Timeline {
  durations: number[];
}

export const total = (t: Timeline) => t.durations.reduce((a, b) => a + b, 0);

export function startOf(t: Timeline, index: number): number {
  let s = 0;
  for (let i = 0; i < index && i < t.durations.length; i++) s += t.durations[i]!;
  return s;
}

/** Scene index and offset (ms) at time `ms`; clamps to the timeline; `done` once the end is reached. */
export function locate(t: Timeline, ms: number): { index: number; offset: number; done: boolean } {
  const end = total(t);
  if (!t.durations.length) return { index: 0, offset: 0, done: true };
  if (ms >= end) return { index: t.durations.length - 1, offset: t.durations.at(-1)!, done: true };
  let acc = 0;
  for (let i = 0; i < t.durations.length; i++) {
    const d = t.durations[i]!;
    if (ms < acc + d) return { index: i, offset: Math.max(0, ms - acc), done: false };
    acc += d;
  }
  return { index: t.durations.length - 1, offset: 0, done: true };
}

/** Clock that can be paused and moved: `now()` is the presentation time in ms. */
export class Clock {
  private base = 0;
  private since: number | null = null;
  constructor(private readonly wall: () => number = () => performance.now()) {}
  get playing() {
    return this.since !== null;
  }
  now(): number {
    return this.base + (this.since === null ? 0 : this.wall() - this.since);
  }
  play() {
    if (this.since === null) this.since = this.wall();
  }
  pause() {
    if (this.since !== null) {
      this.base += this.wall() - this.since;
      this.since = null;
    }
  }
  seek(ms: number) {
    this.base = Math.max(0, ms);
    if (this.since !== null) this.since = this.wall();
  }
}
