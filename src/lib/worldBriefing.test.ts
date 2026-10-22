import { describe, expect, it } from 'vitest';
import type { GeoEvent } from '../../shared/types';
import { countryByName } from './countries';
import { centerOn, MAX_ZOOM } from './mapView';
import { MAX_SINCE_LAST_DAYS, backgroundOf, briefingItems, briefingWindow, countryNameOf, dedupeEvents, reliabilityOf, severityLabel, statusOf } from './worldBriefing';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const H = 3_600_000;
const ev = (over: Partial<GeoEvent> & Pick<GeoEvent, 'id'>): GeoEvent => ({
  title: over.id,
  summary: 's',
  category: 'natural-disaster',
  severity: 3,
  lat: 10,
  lon: 20,
  region: 'Somewhere',
  time: new Date(NOW - 2 * H).toISOString(),
  provenance: 'confirmed',
  source: { name: 'src', url: `https://example.org/${over.id}`, license: 'x' },
  ...over,
});

describe('World Briefing', () => {
  it('labels status honestly: simulated is never confirmed, GDACS hazards are reported, estimates are modelled', () => {
    expect(statusOf({ id: 'usgs-1', provenance: 'confirmed' })).toBe('confirmed');
    expect(statusOf({ id: 'gdacs-EQ-1-1', provenance: 'estimate' })).toBe('reported');
    expect(statusOf({ id: 'demo-01', provenance: 'simulated' })).toBe('simulated');
    expect(statusOf({ id: 'usgs-2', provenance: 'simulated' })).toBe('simulated');
    expect(statusOf({ id: 'x-1', provenance: 'estimate' })).toBe('modelled');
    expect(statusOf({ id: 'x-2', provenance: 'unverified' })).toBe('unverified');
    expect(reliabilityOf({ id: 'demo-01', provenance: 'simulated' })).toMatch(/no real event/);
    expect(reliabilityOf({ id: 'gdacs-TC-1-1', provenance: 'estimate' })).toMatch(/alert level is a model estimate/);
    expect(backgroundOf('energy').consequences).toMatch(/^Typical effects/);
    expect(severityLabel(4)).toBe('4/5 · Severe');
  });

  it('computes the briefing window, including "since my last briefing" with fallbacks', () => {
    expect(briefingWindow('24h', NOW, null)).toEqual({ from: NOW - 24 * H, to: NOW });
    expect(briefingWindow('7d', NOW, null).from).toBe(NOW - 168 * H);
    expect(briefingWindow('since-last', NOW, new Date(NOW - 5 * H).toISOString())).toEqual({ from: NOW - 5 * H, to: NOW });
    const none = briefingWindow('since-last', NOW, null);
    expect(none.from).toBe(NOW - 24 * H);
    expect(none.note).toMatch(/No earlier briefing/);
    const old = briefingWindow('since-last', NOW, '2026-01-01T00:00:00Z');
    expect(old.from).toBe(NOW - MAX_SINCE_LAST_DAYS * 24 * H);
    expect(old.note).toMatch(/more than 7 days ago/);
    expect(briefingWindow('since-last', NOW, new Date(NOW + H).toISOString()).note).toMatch(/No earlier briefing/);
  });

  it('removes duplicate ids and merges the same real event reported by two sources', () => {
    const quake = ev({ id: 'usgs-a', lat: 35, lon: 140 });
    const gdacs = ev({ id: 'gdacs-EQ-9-1', lat: 35.3, lon: 140.2, provenance: 'estimate', time: new Date(NOW - 1.5 * H).toISOString() });
    const far = ev({ id: 'gdacs-EQ-8-1', lat: -20, lon: -70, provenance: 'estimate' });
    const items = dedupeEvents([gdacs, quake, quake, far]);
    expect(items).toHaveLength(2);
    const merged = items.find((i) => i.event.id === 'usgs-a')!;
    expect(merged.status).toBe('confirmed');
    expect(merged.related.map((e) => e.id)).toEqual(['gdacs-EQ-9-1']);
    expect(merged.sources).toHaveLength(2);
    // Two reports from the same source are distinct events; simulated scenarios never merge with real ones.
    expect(dedupeEvents([ev({ id: 'usgs-b' }), ev({ id: 'usgs-c' })])).toHaveLength(2);
    expect(dedupeEvents([ev({ id: 'usgs-d' }), ev({ id: 'demo-x', provenance: 'simulated' })])).toHaveLength(2);
    // Different categories at the same place are not merged.
    expect(dedupeEvents([ev({ id: 'usgs-e' }), ev({ id: 'gdacs-FL-1-1', category: 'humanitarian', provenance: 'estimate' })])).toHaveLength(2);
  });

  it('selects and orders the tour', () => {
    const list = [
      ev({ id: 'usgs-old', time: new Date(NOW - 30 * H).toISOString(), severity: 5 }),
      ev({ id: 'usgs-1', time: new Date(NOW - 10 * H).toISOString(), severity: 2, lat: 0, lon: 0 }),
      ev({ id: 'usgs-2', time: new Date(NOW - 3 * H).toISOString(), severity: 4, lat: 50, lon: 50 }),
      ev({ id: 'demo-1', time: new Date(NOW - 1 * H).toISOString(), severity: 5, provenance: 'simulated', lat: -40, lon: -40 }),
    ];
    const w = briefingWindow('24h', NOW, null);
    expect(briefingItems(list, w, 'chronological', false).map((i) => i.event.id)).toEqual(['usgs-1', 'usgs-2']);
    expect(briefingItems(list, w, 'severity', true).map((i) => i.event.id)).toEqual(['demo-1', 'usgs-2', 'usgs-1']);
  });

  it('finds the country named in a location for the dossier link', () => {
    expect(countryNameOf({ id: 'usgs-1', region: '45 km SSW of Sarangani, Philippines' })).toBe('Philippines');
    expect(countryNameOf({ id: 'usgs-2', region: 'Fiji region' })).toBe('Fiji');
    expect(countryNameOf({ id: 'gdacs-EQ-1-1', region: 'Japan' })).toBe('Japan');
    expect(countryNameOf({ id: 'gdacs-EQ-1-1', region: 'Unknown' })).toBeNull();
    expect(countryNameOf({ id: 'demo-01', region: 'Middle East' })).toBeNull();
    expect(countryByName('Philippines')?.iso3).toBe('PHL');
    expect(countryByName('Fiji')?.iso3).toBe('FJI');
    expect(countryByName('Mid-Atlantic Ridge')).toBeUndefined();
  });

  it('centres the map on a point', () => {
    const v = centerOn(480, 250, 4, 960, 500);
    expect(v.k).toBe(4);
    expect(480 * v.k + v.x).toBeCloseTo(480);
    expect(250 * v.k + v.y).toBeCloseTo(250);
    // Near the edge the view is clamped, never showing empty space.
    const edge = centerOn(0, 0, 4, 960, 500);
    expect(edge.x).toBe(0);
    expect(edge.y).toBe(0);
    expect(centerOn(10, 10, 99, 960, 500).k).toBe(MAX_ZOOM);
  });
});

describe('Briefing preferences', () => {
  it('keeps the last-briefing time only with consent and repairs bad shapes', async () => {
    const { normalizeBriefingPrefs, DEFAULT_BRIEFING_PREFS } = await import('./worldBriefing');
    expect(normalizeBriefingPrefs(undefined)).toEqual(DEFAULT_BRIEFING_PREFS);
    expect(normalizeBriefingPrefs({ remember: false, lastAt: '2026-10-22T10:00:00Z' }).lastAt).toBeNull();
    expect(normalizeBriefingPrefs({ remember: true, lastAt: '2026-10-22T10:00:00Z', order: 'severity', includeSimulated: true })).toEqual({ remember: true, lastAt: '2026-10-22T10:00:00Z', order: 'severity', includeSimulated: true });
    expect(normalizeBriefingPrefs({ remember: true, lastAt: 'soon', order: 'random' })).toEqual({ ...DEFAULT_BRIEFING_PREFS, remember: true });
  });
});
