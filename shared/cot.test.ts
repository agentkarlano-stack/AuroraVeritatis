import { describe, expect, it } from 'vitest';
import { COT_MARKETS, cotCsv, cotIndexSeries, summariseCot, toPoints, type CotRow } from './cot';

const row = (date: string, ncLong: number, ncShort: number, oi = 1000): CotRow => ({
  date,
  openInterest: oi,
  nonCommercialLong: ncLong,
  nonCommercialShort: ncShort,
  commercialLong: 400,
  commercialShort: 500,
  nonReportableLong: 50,
  nonReportableShort: 30,
});

/** Weekly rows with net speculative positions `nets` (long = 500 + net/2, short = 500 − net/2). */
const weekly = (nets: number[]) =>
  nets.map((n, i) => row(new Date(Date.UTC(2020, 0, 7) + i * 7 * 86_400_000).toISOString().slice(0, 10), 500 + n / 2, 500 - n / 2));

describe('COT analytics', () => {
  it('derives net positions per trader group', () => {
    expect(toPoints([row('2026-10-13', 600, 200)])[0]).toEqual({ date: '2026-10-13', openInterest: 1000, netSpec: 400, netCommercial: -100, netSmall: 20 });
  });

  it('places the latest position within its lookback range', () => {
    const s = summariseCot(weekly([-100, 0, 100, 50]))!;
    expect(s.latest.netSpec).toBe(50);
    expect(s.weeklyChange).toBe(-50);
    expect(s.index).toBeCloseTo(75); // (50 − (−100)) / (100 − (−100))
    expect(s.percentile).toBeCloseTo((2 / 3) * 100); // 2 of the 3 other weeks are lower
    expect(s.netSpecPctOi).toBeCloseTo(0.05);
    expect(s.extreme).toBeNull(); // too little history to call an extreme
  });

  it('only uses the lookback window and flags extremes with at least a year of data', () => {
    const nets = Array.from({ length: 200 }, (_, i) => (i < 44 ? 10_000 : i)); // early outliers fall outside 156 weeks
    const s = summariseCot(weekly(nets))!;
    expect(s.weeks).toBe(156);
    expect(s.index).toBe(100);
    expect(s.extreme).toBe('long');
    const low = summariseCot(weekly([...nets.slice(0, 199), -5]))!;
    expect(low.index).toBe(0);
    expect(low.extreme).toBe('short');
  });

  it('handles empty and flat input', () => {
    expect(summariseCot([])).toBeNull();
    const flat = summariseCot(weekly([5, 5, 5]))!;
    expect(flat.index).toBe(50);
    expect(flat.weeklyChange).toBe(0);
  });

  it('computes a rolling index without look-ahead', () => {
    const nets = Array.from({ length: 60 }, (_, i) => i);
    const series = cotIndexSeries(weekly(nets));
    expect(series).toHaveLength(60 - 51);
    expect(series.every((p) => p.value === 100)).toBe(true); // a rising series is always at its running maximum
    const changed = cotIndexSeries(weekly([...nets.slice(0, 59), -1]));
    expect(changed.slice(0, -1)).toEqual(series.slice(0, -1)); // changing the last week never alters earlier values
  });

  it('exports CSV with a sourced header and derived nets', () => {
    const lines = cotCsv(COT_MARKETS[0]!, [row('2026-10-13', 600, 200)]).split('\n');
    expect(lines[0]).toContain('CFTC code 067651');
    expect(lines[2]!.split(',')).toHaveLength(11);
    expect(lines[3]).toBe('2026-10-13,1000,600,200,400,400,500,-100,50,30,20');
  });
});
