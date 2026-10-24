import { describe, expect, it } from 'vitest';
import { fibLevels, timeToString, trendPoints } from './chart';

describe('chart helpers', () => {
  it('normalises chart times', () => {
    expect(timeToString('2026-10-20')).toBe('2026-10-20');
    expect(timeToString({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
    expect(timeToString(1760000000)).toBeNull();
    expect(timeToString('nonsense')).toBeNull();
  });

  it('orders trend points and rejects vertical lines', () => {
    const a = { time: '2026-10-20', price: 10 };
    const b = { time: '2026-01-02', price: 5 };
    expect(trendPoints({ id: 'x', kind: 'trend', a, b })).toEqual([b, a]);
    expect(trendPoints({ id: 'y', kind: 'trend', a, b: { ...b, time: a.time } })).toBeNull();
  });
});

describe('Fibonacci retracement', () => {
  it('places 0% at the end of the move and 100% at its start', () => {
    const lv = fibLevels({ id: 'f', kind: 'fib', a: { time: '2026-01-02', price: 100 }, b: { time: '2026-03-02', price: 200 } });
    expect(lv.map((l) => l.ratio)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    expect(lv[0]!.price).toBe(200);
    expect(lv[3]!.price).toBe(150);
    expect(lv[4]!.price).toBeCloseTo(138.2);
    expect(lv[6]!.price).toBe(100);
  });
});
