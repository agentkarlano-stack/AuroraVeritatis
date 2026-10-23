import { describe, expect, it } from 'vitest';
import { DATA_NATURE, GEO_LAYERS, choroplethLegend, classOf, formatValue, gibsTiles, isActive, type ChoroplethLayer, type GibsLayer } from './layers';
import { MAX_LAYERS, decodeState, defaultState, encodeState, shiftDate, toggleLayer } from './state';

const TODAY = '2026-10-22';
const BOUNDS = { today: TODAY, minYear: 1990, maxYear: 2025 };
const base = defaultState('2026-10-21', 2024);

describe('layer catalogue', () => {
  it('documents provider, licence, freshness, coverage and interpretation for every available layer', () => {
    const ids = new Set<string>();
    for (const l of GEO_LAYERS) {
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(l.interpretation.length).toBeGreaterThan(30);
      expect(l.provider).toBeTruthy();
      if (!isActive(l)) {
        expect(l.needs.length).toBeGreaterThan(10);
        continue;
      }
      expect(l.nature in DATA_NATURE).toBe(true);
      for (const k of ['license', 'attribution', 'updateFrequency', 'coverage', 'resolution'] as const) expect(l[k], `${l.id}.${k}`).toBeTruthy();
      // Annual statistics and composites are never presented as live.
      if (l.kind === 'choropleth') expect(l.nature).toBe('historical');
      if (l.kind === 'gibs' && l.gibs.time !== 'daily') expect(['composite', 'modelled']).toContain(l.nature);
      if (l.kind === 'choropleth') expect(l.palette).toHaveLength(l.breaks.length + 1);
    }
    expect(GEO_LAYERS.filter(isActive).length).toBeGreaterThanOrEqual(20);
  });

  it('builds GIBS tile URLs for daily and fixed-date layers', () => {
    const daily = GEO_LAYERS.find((l) => l.id === 'true-color') as GibsLayer;
    expect(gibsTiles(daily, '2026-10-21')).toBe('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-10-21/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg');
    const fixed = GEO_LAYERS.find((l) => l.id === 'blue-marble') as GibsLayer;
    expect(gibsTiles(fixed, '2026-10-21')).toContain('/default/2004-08-01/GoogleMapsCompatible_Level8/');
  });

  it('classifies values and labels legends', () => {
    const inflation = GEO_LAYERS.find((l) => l.id === 'inflation') as ChoroplethLayer;
    expect(classOf(-1, inflation.breaks)).toBe(0);
    expect(classOf(2, inflation.breaks)).toBe(2);
    expect(classOf(35, inflation.breaks)).toBe(5);
    const legend = choroplethLegend(inflation);
    expect(legend[0]!.label).toBe('Below 0.0%');
    expect(legend[2]!.label).toBe('2.0% to 5.0%');
    expect(legend.at(-1)!.label).toBe('20.0% and above');
    expect(formatValue(52745, 'usd')).toBe('US$ 53k');
    expect(formatValue(4.2, 'density')).toBe('4.2 per km²');
  });
});

describe('shareable map state', () => {
  it('round-trips through the URL', () => {
    const s = { ...base, mode: '2d' as const, style: 'dark' as const, layers: [{ id: 'inflation', opacity: 0.8 }, { id: 'earthquakes', opacity: 1 }], center: [10.512, 48.2] as [number, number], zoom: 3.25, country: 'AUT' };
    const q = encodeState(s);
    expect(q).toBe('?m=2d&s=dark&l=inflation%3A80%2Cearthquakes&c=10.51%2C48.2&z=3.25&d=2026-10-21&y=2024&k=AUT');
    expect(decodeState(q, base, BOUNDS)).toEqual({ ...s, center: [10.51, 48.2] });
  });

  it('repairs bad links and drops planned or unknown layers', () => {
    const s = decodeState('?m=4d&s=neon&l=wind,bogus,inflation:5,inflation&c=999,-999&z=50&d=2099-01-01&y=1800&k=xx', base, BOUNDS);
    expect(s.mode).toBe(base.mode);
    expect(s.style).toBe(base.style);
    expect(s.layers).toEqual([{ id: 'inflation', opacity: 0.1 }]);
    expect(s.center).toEqual([180, -85]);
    expect(s.zoom).toBe(12);
    expect(s.date).toBe(base.date);
    expect(s.year).toBe(base.year);
    expect(s.country).toBeNull();
    expect(decodeState('?utm_source=x', base, BOUNDS)).toBe(base);
  });

  it('limits the number of combined layers and steps dates', () => {
    let s: typeof base = { ...base, layers: [] };
    for (const id of ['true-color', 'aerosol', 'inflation', 'earthquakes', 'disasters']) s = toggleLayer(s, id);
    expect(s.layers).toHaveLength(MAX_LAYERS);
    expect(toggleLayer(s, 'true-color').layers.map((l) => l.id)).toEqual(['aerosol', 'inflation', 'earthquakes']);
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
