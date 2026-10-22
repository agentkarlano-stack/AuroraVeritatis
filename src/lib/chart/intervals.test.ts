import { describe, expect, it } from 'vitest';
import type { Bar } from '../demoMarket';
import { heikinAshi } from './chartTypes';
import { intervalAvailability, periodKey, rangeWindow, resample } from './intervals';

const bar = (time: string, open: number, high: number, low: number, close: number, volume = 10): Bar => ({ time, open, high, low, close, volume });

describe('intervals', () => {
  it('never derives intraday bars from daily data', () => {
    const r = intervalAvailability('1D', '5m');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/intraday/);
    expect(intervalAvailability('1D', '1W').ok).toBe(true);
    expect(intervalAvailability('1D', '1Y').ok).toBe(true);
    expect(intervalAvailability('5m', '15m').ok).toBe(true);
    expect(intervalAvailability('5m', '3m').ok).toBe(false);
    expect(intervalAvailability('15m', '45m').ok).toBe(true);
    expect(intervalAvailability('10m', '45m').ok).toBe(false);
  });
  it('keys calendar periods (ISO weeks start on Monday)', () => {
    expect(periodKey('2024-01-07', '1W')).toBe('2024-01-01'); // Sunday → Monday of that week
    expect(periodKey('2024-01-08', '1W')).toBe('2024-01-08');
    expect(periodKey('2024-05-31', '1Mo')).toBe('2024-05');
    expect(periodKey('2024-05-31', '3Mo')).toBe('2024-Q2');
    expect(periodKey('2024-05-31', '1Y')).toBe('2024');
  });
  it('aggregates daily bars exactly', () => {
    const days = [bar('2024-01-04', 10, 12, 9, 11, 5), bar('2024-01-05', 11, 15, 10, 14, 7), bar('2024-01-08', 14, 14, 8, 9, 1)];
    expect(resample(days, '1W')).toEqual([bar('2024-01-04', 10, 15, 9, 14, 12), bar('2024-01-08', 14, 14, 8, 9, 1)]);
    expect(resample(days, '1Mo')).toEqual([bar('2024-01-04', 10, 15, 8, 9, 13)]);
    // The input is not mutated.
    expect(days[0]!.close).toBe(11);
  });
});

describe('ranges', () => {
  const bars = Array.from({ length: 400 }, (_, i) => bar(new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), 1, 1, 1, 1));
  it('counts calendar days back from the last bar', () => {
    expect(rangeWindow(bars, { preset: 'ALL' })).toEqual({ from: 0, to: 399 });
    expect(rangeWindow(bars, { preset: '5D' })).toEqual({ from: 395, to: 399 });
    const m = rangeWindow(bars, { preset: '1M' })!;
    expect(m.to - m.from).toBe(31);
  });
  it('supports custom date ranges', () => {
    expect(rangeWindow(bars, { from: '2024-01-10', to: '2024-01-20' })).toEqual({ from: 9, to: 19 });
    expect(rangeWindow(bars, { from: '2030-01-01', to: '2030-02-01' })).toBeNull();
  });
});

describe('Heikin Ashi', () => {
  it('matches the definition', () => {
    const ha = heikinAshi([bar('a', 10, 14, 8, 12), bar('b', 12, 16, 11, 15)]);
    expect(ha[0]).toMatchObject({ open: 11, close: 11, high: 14, low: 8 });
    // Second: close = (12 + 16 + 11 + 15) / 4 = 13.5; open = (11 + 11) / 2 = 11.
    expect(ha[1]).toMatchObject({ open: 11, close: 13.5, high: 16, low: 11 });
  });
});
