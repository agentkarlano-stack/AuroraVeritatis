import { describe, expect, it } from 'vitest';
import { Clock, locate, startOf, total } from './presentation';

describe('presentation timeline', () => {
  const t = { durations: [1000, 2000, 3000] };
  it('locates scenes and offsets', () => {
    expect(total(t)).toBe(6000);
    expect(startOf(t, 2)).toBe(3000);
    expect(locate(t, 0)).toEqual({ index: 0, offset: 0, done: false });
    expect(locate(t, 2500)).toEqual({ index: 1, offset: 1500, done: false });
    expect(locate(t, 6000).done).toBe(true);
  });
  it('pauses, resumes from the same position and seeks backwards', () => {
    let wall = 0;
    const c = new Clock(() => wall);
    c.play();
    wall = 1500;
    c.pause();
    wall = 10_000; // time passes while paused
    expect(c.now()).toBe(1500);
    c.play();
    wall = 10_500;
    expect(c.now()).toBe(2000);
    c.seek(500);
    expect(c.now()).toBe(500);
    wall = 11_000;
    expect(c.now()).toBe(1000);
  });
});
