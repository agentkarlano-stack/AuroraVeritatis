import { describe, expect, it } from 'vitest';
import { linearScale, linearTicks, logScale, logTicks, padExtent } from './scales';

describe('scales', () => {
  it('produces nice linear ticks', () => {
    expect(linearTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(linearTicks(40, 85, 5)).toEqual([40, 50, 60, 70, 80]);
  });

  it('produces 1-2-5 log ticks', () => {
    expect(logTicks(300, 120000)).toEqual([500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]);
  });

  it('maps domains to ranges', () => {
    expect(linearScale(0, 10, 0, 100)(5)).toBe(50);
    const log = logScale(10, 1000, 0, 100);
    expect(log(100)).toBeCloseTo(50);
    expect(log(1)).toBe(0); // clamped to domain minimum
  });

  it('pads extents and ignores invalid values', () => {
    expect(padExtent([0, 10], false, 0.1)).toEqual([-1, 11]);
    const [lo, hi] = padExtent([100, 10000, -5, NaN], true, 0.5);
    expect(lo).toBeCloseTo(10);
    expect(hi).toBeCloseTo(100000);
    expect(padExtent([], true)).toEqual([1, 10]);
  });
});
