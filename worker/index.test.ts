import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompareYear, CountryProfile, IndicatorSeries, PublicConfig } from '../shared/types';
import { handleApi, type Env } from './index';
import { RateLimiter } from './ratelimit';
import { magnitudeToSeverity, normalizeUsgs } from './usgs';
import { compareYears } from './worldbank';

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const env = { ASSETS: {} as Fetcher } as Env;
const get = (path: string, e: Env = env, init?: RequestInit) =>
  handleApi(new Request(`https://aurorav.app${path}`, { headers: { 'CF-Connecting-IP': String(Math.random()) }, ...init }), e, ctx);

const body = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;

afterEach(() => vi.unstubAllGlobals());

describe('API routing', () => {
  it('reports health', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('exposes only public config, and null when unset', async () => {
    const off = await body<PublicConfig>(get('/api/config'));
    expect(off).toEqual({ environment: 'production', supabase: null, posthog: null });
    const on = await body<PublicConfig>(get('/api/config', { ...env, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }));
    expect(on.supabase).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' });
  });

  it('rejects unknown routes, bad methods and bad input', async () => {
    expect((await get('/api/nope')).status).toBe(404);
    expect((await get('/api/health', env, { method: 'POST' })).status).toBe(405);
    expect((await get('/api/countries/DE')).status).toBe(404);
    expect((await get('/api/countries/DEU/series/NOT.AN.INDICATOR')).status).toBe(400);
  });

  it('builds a country profile from World Bank responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname === '/v2/country/DEU') {
          return Response.json([{ page: 1, pages: 1, total: 1 }, [{ id: 'DEU', name: 'Germany', capitalCity: 'Berlin', region: { id: 'ECS', value: 'Europe & Central Asia ' }, incomeLevel: { id: 'HIC', value: 'High income' } }]]);
        }
        const ind = u.pathname.split('/').at(-1)!;
        if (ind === 'SP.POP.TOTL') return Response.json([{ page: 1 }, [{ indicator: { id: ind, value: '' }, country: { id: 'DE', value: 'Germany' }, countryiso3code: 'DEU', date: '2024', value: 83_000_000 }]]);
        if (ind === 'MS.MIL.TOTL.P1') return new Response('fail', { status: 500 });
        return Response.json([{ page: 1 }, null]);
      }),
    );
    const res = await get('/api/countries/deu');
    expect(res.status).toBe(200);
    const profile = await body<CountryProfile>(res);
    expect(profile).toMatchObject({ iso3: 'DEU', name: 'Germany', capital: 'Berlin', region: 'Europe & Central Asia' });
    expect(profile.indicators['SP.POP.TOTL']).toMatchObject({ value: 83_000_000, date: '2024' });
    expect(profile.indicators['MS.MIL.TOTL.P1']!.value).toBeNull();
    expect(profile.source.license).toBe('CC BY 4.0');
  });

  it('returns 404 for unknown countries and 502 when the upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ message: [{ id: '120', value: 'Invalid value' }] }])));
    expect((await get('/api/countries/XXX')).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const res = await get('/api/countries/FRA');
    expect(res.status).toBe(502);
  });

  it('returns sorted indicator history without nulls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([{ page: 1 }, [
          { date: '2023', value: 2 },
          { date: '2022', value: null },
          { date: '2021', value: 1 },
        ]]),
      ),
    );
    const series = await body<IndicatorSeries>(get('/api/countries/DEU/series/NY.GDP.MKTP.CD'));
    expect(series.points).toEqual([{ date: '2021', value: 1 }, { date: '2023', value: 2 }]);
  });
});

describe('USGS normalisation', () => {
  it('maps features to confirmed natural-disaster events', () => {
    const events = normalizeUsgs([
      { id: 'us1', properties: { mag: 6.7, place: '10 km S of Somewhere', time: 1_760_000_000_000, url: 'https://earthquake.usgs.gov/x', title: 'M 6.7 - Somewhere', tsunami: 1 }, geometry: { coordinates: [140, 35, 10] } },
      { id: 'us2', properties: { mag: null, place: null, time: 0, url: '', title: '', tsunami: 0 }, geometry: { coordinates: [0, 0, 0] } },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'usgs-us1', lat: 35, lon: 140, severity: 4, provenance: 'confirmed', category: 'natural-disaster' });
    expect(events[0]!.summary).toContain('tsunami');
    expect(magnitudeToSeverity(4.6)).toBe(1);
    expect(magnitudeToSeverity(7.2)).toBe(5);
  });
});

describe('RateLimiter', () => {
  it('allows a burst then throttles, and refills over time', () => {
    const rl = new RateLimiter(3, 1);
    expect([rl.allow('a', 0), rl.allow('a', 0), rl.allow('a', 0), rl.allow('a', 0)]).toEqual([true, true, true, false]);
    expect(rl.allow('b', 0)).toBe(true);
    expect(rl.allow('a', 1500)).toBe(true);
  });
});

describe('country comparison endpoint', () => {
  it('joins three indicators for economies only and validates input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname === '/v2/country') {
          return Response.json([{ page: 1 }, [
            { id: 'DEU', name: 'Germany', region: { id: 'ECS', value: 'Europe & Central Asia' } },
            { id: 'KEN', name: 'Kenya', region: { id: 'SSF', value: 'Sub-Saharan Africa ' } },
            { id: 'WLD', name: 'World', region: { id: 'NA', value: 'Aggregates' } },
          ]]);
        }
        const ind = u.pathname.split('/').at(-1)!;
        const v: Record<string, Record<string, number | null>> = {
          'NY.GDP.PCAP.CD': { DEU: 50000, KEN: 2000, WLD: 12000 },
          'SP.DYN.LE00.IN': { DEU: 81, KEN: null, WLD: 73 },
          'SP.POP.TOTL': { DEU: 83e6, KEN: 54e6, WLD: 8e9 },
        };
        return Response.json([{ page: 1 }, Object.entries(v[ind] ?? {}).map(([iso, value]) => ({ countryiso3code: iso, date: '2022', value }))]);
      }),
    );
    const res = await get('/api/compare/2022');
    expect(res.status).toBe(200);
    const data = await body<CompareYear>(res);
    expect(data.points).toEqual([{ iso3: 'DEU', name: 'Germany', region: 'Europe & Central Asia', x: 50000, y: 81, size: 83e6 }]);
    expect((await get('/api/compare/1800')).status).toBe(400);
    expect((await get('/api/compare/2022?x=BAD.ID')).status).toBe(400);
  });

  it('derives the valid year range from the request-time clock, not module load', () => {
    // Workers report the Unix epoch during global-scope initialisation; a load-time bound rejected every year.
    expect(compareYears(Date.UTC(2026, 9, 21))).toEqual({ min: 1990, max: 2025 });
    expect(compareYears(0).max).toBe(1969);
  });
});

describe('GDACS normalisation', () => {
  it('maps current alerts to estimated natural-disaster events and skips unusable features', async () => {
    const { normalizeGdacs, alertToSeverity } = await import('./gdacs');
    const events = normalizeGdacs([
      {
        geometry: { type: 'Point', coordinates: [125.5, 14.2] },
        properties: { eventtype: 'TC', eventid: 1001, episodeid: 7, name: 'Tropical Cyclone TEST-26', alertlevel: 'Orange', country: 'Philippines', todate: '2026-10-20T12:00:00', url: { report: 'https://www.gdacs.org/report.aspx?eventid=1001' }, severitydata: { severitytext: 'Maximum wind speed of 150 km/h' } },
      },
      { geometry: { type: 'Polygon', coordinates: [] }, properties: { eventtype: 'FL', eventid: 2 } },
      { geometry: { type: 'Point', coordinates: [10, 10] }, properties: { eventtype: 'EQ', eventid: 3 } },
      { geometry: { type: 'Point', coordinates: [30, -2] }, properties: { eventtype: 'DR', eventid: 4, alertlevel: 'Red', url: 'javascript:alert(1)' } },
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ id: 'gdacs-TC-1001-7', title: 'Tropical Cyclone TEST-26', lat: 14.2, lon: 125.5, severity: 3, provenance: 'estimate', category: 'natural-disaster', region: 'Philippines' });
    expect(events[0]!.summary).toContain('150 km/h');
    expect(events[0]!.source.url).toBe('https://www.gdacs.org/report.aspx?eventid=1001');
    expect(events[1]).toMatchObject({ title: 'Drought', severity: 5, region: 'Unknown' });
    expect(events[1]!.source.url).toBe('https://www.gdacs.org/'); // unsafe/non-http report links are never passed through
    expect(alertToSeverity(undefined)).toBe(1);
  });

  it('serves the feed and reports upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ features: [{ geometry: { type: 'Point', coordinates: [1, 2] }, properties: { eventtype: 'VO', eventid: 9, alertlevel: 'Green' } }] })));
    const ok = await body<{ events: { id: string }[] }>(get('/api/events/disasters'));
    expect(ok.events.map((e) => e.id)).toEqual(['gdacs-VO-9-0']);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    expect((await body<{ events: unknown[] }>(get('/api/events/disasters'))).events).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    expect((await get('/api/events/disasters')).status).toBe(502);
  });

  it('queries the documented search endpoint for the last 30 days', async () => {
    const { gdacsUrl } = await import('./gdacs');
    const u = new URL(gdacsUrl(Date.UTC(2026, 9, 21, 12)));
    expect(u.pathname).toBe('/gdacsapi/api/events/geteventlist/SEARCH');
    expect(u.searchParams.get('eventlist')).toBe('TC;FL;VO;DR;WF');
    expect(u.searchParams.get('fromdate')).toBe('2026-09-21');
    expect(u.searchParams.get('todate')).toBe('2026-10-21');
  });
});
