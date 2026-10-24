import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVOURITES, normalizeFavourites, toggleFavourite } from './favourites';

describe('chart favourites', () => {
  it('falls back to defaults and drops unknown or duplicate ids', () => {
    expect(normalizeFavourites(undefined)).toEqual(DEFAULT_FAVOURITES);
    const f = normalizeFavourites({ ranges: ['1Y', 'XX', '1Y', 'ALL'], intervals: ['4h', 'nope'], types: ['line', 'renko'], drawings: ['fib', 'laser'], templates: ['trend', 'bad id!'], bar: false });
    expect(f.ranges).toEqual(['1Y', 'ALL']);
    expect(f.intervals).toEqual(['4h']);
    expect(f.types).toEqual(['line']);
    expect(f.drawings).toEqual(['fib']);
    expect(f.templates).toEqual(['trend']);
    expect(f.bar).toBe(false);
  });
  it('takes indicator stars kept in this browser when none are synced yet', () => {
    expect(normalizeFavourites({}, ['rsi', 'unknown', 'atr']).indicators).toEqual(['rsi', 'atr']);
    expect(normalizeFavourites({ indicators: ['macd'] }, ['rsi']).indicators).toEqual(['macd']);
  });
  it('toggles favourites, keeps ranges in catalogue order and respects limits', () => {
    let f = toggleFavourite(DEFAULT_FAVOURITES, 'ranges', '3M');
    expect(f.ranges).toEqual(['1M', '3M', '6M', '1Y', '5Y', 'ALL']);
    f = toggleFavourite(f, 'ranges', '1M');
    expect(f.ranges).toEqual(['3M', '6M', '1Y', '5Y', 'ALL']);
    expect(toggleFavourite(f, 'intervals', 'bogus')).toBe(f);
    let g = { ...f, types: [] as typeof f.types };
    for (const t of ['candles', 'hollow', 'bars', 'line', 'lineMarkers', 'step', 'area', 'baseline', 'columns']) g = toggleFavourite(g, 'types', t);
    expect(g.types).toHaveLength(8);
  });
});
