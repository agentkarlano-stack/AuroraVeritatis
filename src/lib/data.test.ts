import { describe, expect, it } from 'vitest';
import { DEMO_EVENTS } from '../data/demoEvents';
import { INSTRUMENTS } from '../data/instruments';
import { countryByIso3, countryByNumeric, searchCountries } from './countries';
import { businessDays, demoBars } from './demoMarket';
import { regionOf } from './events';
import { worldTension } from './tension';

describe('synthetic market data', () => {
  it('generates only weekdays, ending on or before the given date', () => {
    const days = businessDays(10, new Date('2026-10-18T12:00:00Z')); // a Sunday
    expect(days.at(-1)).toBe('2026-10-16');
    expect(days.every((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))).toBe(true);
  });

  it('is deterministic and internally consistent for every instrument', () => {
    const end = new Date('2026-10-20T00:00:00Z');
    for (const i of INSTRUMENTS) {
      const a = demoBars(i.symbol, end);
      expect(a).toBe(demoBars(i.symbol, end));
      expect(a).toHaveLength(520);
      for (const b of a) {
        expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
        expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
        expect(b.close).toBeGreaterThan(0);
      }
    }
    expect(demoBars('NOPE')).toEqual([]);
  });

  it('labels every demo event as simulated and links only known instruments', () => {
    const symbols = new Set(INSTRUMENTS.map((i) => i.symbol));
    for (const e of DEMO_EVENTS) {
      expect(e.provenance).toBe('simulated');
      expect(e.title.startsWith('Simulated scenario')).toBe(true);
      expect(e.summary).not.toMatch(/\d+\s+(killed|dead|casualties|wounded)/i);
      for (const s of e.marketLinks ?? []) expect(symbols.has(s)).toBe(true);
      expect(regionOf(e.lat, e.lon)).toBe(e.region);
    }
  });
});

describe('countries', () => {
  it('maps ISO numeric and alpha-3 codes', () => {
    expect(countryByIso3('deu')?.numeric).toBe('276');
    expect(countryByNumeric('004')?.iso3).toBe('AFG');
    expect(countryByNumeric(4)?.iso3).toBe('AFG');
    expect(searchCountries('germ')[0]?.iso3).toBe('DEU');
  });
});

describe('world tension prototype', () => {
  it('stays within 0–100 and responds to events', () => {
    const now = Date.now();
    const calm = worldTension([], 0.1, now);
    const tense = worldTension(DEMO_EVENTS, 0.5, now, 3650);
    expect(calm.value).toBeGreaterThanOrEqual(0);
    expect(tense.value).toBeLessThanOrEqual(100);
    expect(tense.value).toBeGreaterThan(calm.value);
    expect(calm.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1);
  });
});

describe('event timeline', () => {
  it('buckets events into consecutive UTC days including empty ones', async () => {
    const { bucketByDay } = await import('./timeline');
    const now = Date.parse('2026-10-20T12:00:00Z');
    const ev = (time: string, category: 'conflict' | 'energy') => ({ ...DEMO_EVENTS[0]!, id: time, time, category });
    const b = bucketByDay([ev('2026-10-20T01:00:00Z', 'conflict'), ev('2026-10-20T09:00:00Z', 'energy'), ev('2026-10-18T09:00:00Z', 'conflict'), ev('2026-09-01T00:00:00Z', 'conflict')], 3, now);
    expect(b.map((x) => x.day)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20']);
    expect(b.map((x) => x.total)).toEqual([1, 0, 2]);
    expect(b[2]!.byCategory).toEqual({ conflict: 1, energy: 1 });
  });
});
