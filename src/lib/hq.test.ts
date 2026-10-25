import { describe, expect, it } from 'vitest';
import type { Story } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';
import { frequent, normalizeRecent, recordVisit, updatesSince, visitFor, type RecentItem } from './hq';

const name = (iso3: string) => ({ DEU: 'Germany', JPN: 'Japan' })[iso3] ?? null;
const T0 = '2026-10-25T10:00:00.000Z';
const plus = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

describe('HQ: continue where you left off', () => {
  it('maps pages to resumable items with their settings', () => {
    expect(visitFor('/countries/deu', '', name)).toMatchObject({ key: 'country:DEU', label: 'Germany', href: '/countries/DEU' });
    expect(visitFor('/', '?k=JPN', name)).toMatchObject({ key: 'country:JPN', href: '/countries/JPN' });
    expect(visitFor('/markets', '?symbol=GOLD.D', name)).toMatchObject({ key: 'chart:GOLD.D', href: '/markets?symbol=GOLD.D' });
    expect(visitFor('/geo', '?m=2d&l=quakes', name)).toMatchObject({ key: 'map', href: '/geo?m=2d&l=quakes' });
    expect(visitFor('/lab', '?tool=risk', name)).toMatchObject({ key: 'tool:/lab?tool=risk', label: 'Portfolio risk' });
    expect(visitFor('/account', '', name)).toBeNull();
    expect(visitFor('/', '', name)).toBeNull();
    expect(visitFor('/countries/ZZZ', '', name)).toBeNull();
  });

  it('keeps one entry per item, newest first, counting sessions not page updates', () => {
    const map = { key: 'map', kind: 'map' as const, label: 'Map', href: '/geo' };
    const tool = { key: 'tool:/brain', kind: 'tool' as const, label: 'Brain', href: '/brain' };
    let l: RecentItem[] = recordVisit([], map, T0);
    l = recordVisit(l, { ...map, href: '/geo?x=1' }, plus(1));
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ href: '/geo?x=1', count: 1 });
    l = recordVisit(l, tool, plus(2));
    l = recordVisit(l, map, plus(60));
    expect(l.map((r) => r.key)).toEqual(['map', 'tool:/brain']);
    expect(l[0]!.count).toBe(2);
    expect(frequent(l).map((r) => r.key)).toEqual(['map']);
  });

  it('drops malformed or external entries', () => {
    expect(normalizeRecent([{ key: 'a', href: 'https://evil.example', label: 'x', at: T0 }, { key: 'b', href: '/brain', label: 'Brain', at: T0, count: -1 }, null])).toEqual([
      { key: 'b', href: '/brain', label: 'Brain', at: T0, count: 1 },
    ]);
  });
});

describe('HQ: changes since the last visit', () => {
  const ev = (id: string, time: string, region: string, extra: Partial<GeoEvent> = {}): GeoEvent => ({
    id,
    title: id,
    summary: '',
    category: 'natural-disaster',
    severity: 3,
    lat: 36,
    lon: 138,
    region,
    time,
    provenance: 'confirmed',
    source: { name: 'USGS', url: `https://usgs.gov/${id}`, license: '' },
    ...extra,
  });
  const story = (title: string, last: string, status: Story['status']): Story =>
    ({ id: title, title, status, independent: ['a', 'b'], articles: [{ url: `https://a.com/${title}`, domain: 'a.com', title }], first: last, last }) as unknown as Story;

  it('lists real signals and verified stories after the last visit, per followed country and region', () => {
    const out = updatesSince({
      countries: [{ iso3: 'JPN', name: 'Japan' }],
      regions: ['East Asia'],
      events: [ev('usgs-new', plus(30), 'Honshu, Japan'), ev('usgs-old', plus(-30), 'Honshu, Japan'), ev('usgs-sim', plus(30), 'Japan', { provenance: 'simulated' })],
      stories: [story('Japan raises rates', plus(20), 'corroborated'), story('Japan rumour', plus(20), 'unverified')],
      since: Date.parse(T0),
      now: Date.parse(plus(90)),
      eventCountry: (e) => (e.region.endsWith('Japan') ? 'JPN' : null),
      storyCountries: (t) => (t.startsWith('Japan') ? ['JPN'] : []),
      regionOf: () => 'East Asia',
    });
    expect(out[0]!.updates.map((u) => u.title)).toEqual(['usgs-new', 'Japan raises rates']);
    expect(out[1]).toMatchObject({ key: 'region:East Asia', updates: [{ title: 'usgs-new' }] });
  });
});
