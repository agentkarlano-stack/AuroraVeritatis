import { describe, expect, it } from 'vitest';
import { COT_LINKS, change, correlation, lastIndex, monthAt, percentile, rebased, toCsv, volatility, type CommodityData } from './commodities';
import { COT_MARKET_MAP } from '../../shared/cot';

describe('commodity analytics', () => {
  it('counts months and finds the last value', () => {
    expect(monthAt('1990-01', 0)).toBe('1990-01');
    expect(monthAt('1990-01', 13)).toBe('1991-02');
    expect(monthAt('2026-12', 1)).toBe('2027-01');
    expect(lastIndex([1, 2, null])).toBe(1);
    expect(lastIndex([null])).toBe(-1);
  });

  it('computes changes, volatility and the historical position', () => {
    const v = [100, 110, 121, null, 133.1];
    expect(change(v, 1)).toBeNull(); // the month before is missing
    expect(change([100, 110, 121], 2)).toBeCloseTo(21);
    // Constant 10% monthly growth has zero volatility.
    expect(volatility(Array.from({ length: 13 }, (_, i) => 100 * 1.1 ** i))).toBeCloseTo(0);
    // Alternating ±10% log returns: sd ≈ 0.1044 (sample) → about 36% a year.
    const alt = Array.from({ length: 13 }, (_, i) => 100 * Math.exp(i % 2 ? 0.1 : 0));
    expect(volatility(alt)).toBeCloseTo(Math.sqrt((12 * 0.1 ** 2) / 11) * Math.sqrt(12) * 100, 6);
    expect(volatility([1, 2, 3])).toBeNull();
    expect(percentile(Array.from({ length: 24 }, (_, i) => i))).toBe(100);
    expect(percentile([...Array.from({ length: 23 }, (_, i) => i + 10), 0])).toBeCloseTo((1 / 24) * 100);
  });

  it('rebases and correlates monthly returns', () => {
    const r = rebased([50, 100, 75], '2026-01', 3);
    expect(r).toEqual([{ date: '2026-01', value: 100 }, { date: '2026-02', value: 200 }, { date: '2026-03', value: 150 }]);
    const a = Array.from({ length: 30 }, (_, i) => 100 * Math.exp(Math.sin(i)));
    expect(correlation(a, a)).toBeCloseTo(1);
    expect(correlation(a, a.map((v) => 1e4 / v))).toBeCloseTo(-1);
    expect(correlation([1, 2], [1, 2])).toBeNull();
  });

  it('exports CSV with attribution and links only to known CFTC markets', () => {
    const data: CommodityData = { source: { name: 'WB', url: '', file: '', license: 'CC BY 4.0', attribution: 'Source: WB' }, kind: 'Monthly', publisherUpdated: 'Oct 2026', converted: '2026-10-23', start: '2026-01', end: '2026-02', series: [{ id: 'x', name: 'X', group: 'Energy', benchmark: '', unit: '$/bbl', values: [1, null] }] };
    expect(toCsv(data, ['x'])).toBe('# Source: WB. Monthly. Publisher update: Oct 2026.\nmonth,"X ($/bbl)"\n2026-01,1\n2026-02,\n');
    for (const code of Object.values(COT_LINKS)) expect(COT_MARKET_MAP.has(code)).toBe(true);
  });

});
