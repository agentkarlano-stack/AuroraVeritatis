import { describe, expect, it } from 'vitest';
import { timeToString, trendPoints } from './chart';

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
