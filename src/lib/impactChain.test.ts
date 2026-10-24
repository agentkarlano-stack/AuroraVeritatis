import { describe, expect, it } from 'vitest';
import { beforeAfter, exposuresFor, linkedCommodities, monthIndex } from './impactChain';

describe('exposure rules', () => {
  it('flags only values at or above the documented thresholds', () => {
    const ex = exposuresFor({ 'TX.VAL.FUEL.ZS.UN': { value: 85.2, year: 2023 }, 'EG.IMP.CONS.ZS': { value: -300, year: 2022 }, 'TX.VAL.FOOD.ZS.UN': { value: 19.9, year: 2023 } });
    expect(ex.map((e) => e.rule.id)).toEqual(['fuel-exports']);
    expect(ex[0]).toMatchObject({ value: 85.2, year: 2023 });
  });
  it('never invents an exposure from missing data', () => {
    expect(exposuresFor({})).toEqual([]);
    expect(exposuresFor({ 'TX.VAL.FUEL.ZS.UN': { value: NaN, year: 2023 } })).toEqual([]);
  });
  it('lists linked commodities once, with every rule that links them', () => {
    const ex = exposuresFor({ 'TX.VAL.FUEL.ZS.UN': { value: 60, year: 2023 }, 'NY.GDP.PETR.RT.ZS': { value: 20, year: 2021 } });
    const brent = linkedCommodities(ex).find((c) => c.id === 'brent');
    expect(brent?.via).toEqual(['Fuel exporter', 'Oil-dependent economy']);
    expect(new Set(linkedCommodities(ex).map((c) => c.id)).size).toBe(linkedCommodities(ex).length);
  });
});

describe('before and after an event', () => {
  // 48 months of flat prices with alternating ±1% noise, then a jump.
  const values: (number | null)[] = Array.from({ length: 48 }, (_, i) => 100 * (i % 2 ? 1.01 : 1));
  values.push(120, 125, null);
  const start = '2022-01';
  it('indexes months', () => {
    expect(monthIndex(start, '2022-01')).toBe(0);
    expect(monthIndex(start, '2026-01')).toBe(48);
  });
  it('compares the event month and the following months with the month before', () => {
    const r = beforeAfter(values, start, '2026-01-15T10:00:00Z');
    expect(r.baseMonth).toBe('2025-12');
    expect(r.base).toBeCloseTo(101);
    expect(r.points.map((p) => p.month)).toEqual(['2026-01', '2026-02']);
    expect(r.points[0]!.change).toBeCloseTo((120 / 101 - 1) * 100);
    expect(r.points[0]!.z!).toBeGreaterThan(2);
    expect(r.pending).toBe(false);
  });
  it('reports an event month that is not published yet', () => {
    const r = beforeAfter(values, start, '2026-03-02');
    expect(r.pending).toBe(true);
    expect(r.points).toEqual([]);
    expect(beforeAfter(values, start, '2026-07-01').pending).toBe(true);
  });
  it('gives no z-score without a year of history', () => {
    const r = beforeAfter([100, 101, 102, 110], '2026-01', '2026-04-03');
    expect(r.points[0]!.z).toBeNull();
    expect(r.points[0]!.change).toBeCloseTo((110 / 102 - 1) * 100);
  });
});
