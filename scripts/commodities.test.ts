import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMODITY_OPTIONS, type CommodityData } from '../src/lib/commodities';

describe('commodity data snapshot (public/data/commodities.json)', () => {
  it('ships a valid snapshot of the World Bank data', () => {
    const d = JSON.parse(readFileSync('public/data/commodities.json', 'utf8')) as CommodityData;
    expect(d.source.license).toBe('CC BY 4.0');
    expect(d.series.map((s) => [s.id, s.name])).toEqual(COMMODITY_OPTIONS.map((o) => [o.id, o.name]));
    expect(d.series.length).toBeGreaterThanOrEqual(25);
    const months = (Number(d.end.slice(0, 4)) - Number(d.start.slice(0, 4))) * 12 + Number(d.end.slice(5)) - Number(d.start.slice(5)) + 1;
    for (const s of d.series) {
      expect(s.values, s.id).toHaveLength(months);
      expect(s.values.at(-1), s.id).not.toBeNull();
      expect(s.unit, s.id).toMatch(/^\$|cents/);
    }
  });
});
