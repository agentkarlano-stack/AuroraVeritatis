import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompareYear, LatestValues, CountryProfile, IndicatorSeries, PublicConfig } from '../shared/types';
import { handleApi, type Env } from './index';
import { RateLimiter } from './ratelimit';
import { magnitudeToSeverity, normalizeUsgs } from './usgs';
import { compareYears } from './worldbank';
import { cotUrl, normalizeCot } from './cftc';
import { ecbUrls, normalizeEcb, parseCsv } from './ecb';
import { MACRO_MAP, MACRO_SERIES, type MacroResponse } from '../shared/macro';
import type { CotResponse } from '../shared/cot';
import type { CurrencyProfile } from '../shared/currency';

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
    expect(off).toEqual({ environment: 'production', supabase: null, posthog: null, imagery: null });
    const on = await body<PublicConfig>(get('/api/config', { ...env, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }));
    expect(on.supabase).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' });
    const img = await body<PublicConfig>(get('/api/config', { ...env, ARCGIS_BASEMAP_KEY: 'browser key' }));
    expect(img.imagery?.tiles).toBe('https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=browser%20key');
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

  it('serves the most recent value per economy with its own year, without aggregates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const u = new URL(input);
        if (u.pathname === '/v2/country') {
          return Response.json([{ page: 1 }, [
            { id: 'DEU', name: 'Germany', region: { id: 'ECS', value: 'Europe & Central Asia' } },
            { id: 'KEN', name: 'Kenya', region: { id: 'SSF', value: 'Sub-Saharan Africa ' } },
            { id: 'WLD', name: 'World', region: { id: 'NA', value: 'Aggregates' } },
          ]]);
        }
        expect(u.searchParams.get('mrnev')).toBe('1');
        const indicator = { id: 'FB.CBK.BRCH.P5', value: 'Commercial bank branches (per 100,000 adults)' };
        return Response.json([{ page: 1 }, [
          { indicator, countryiso3code: 'DEU', date: '2024', value: 9.2 },
          { indicator, countryiso3code: 'KEN', date: '2022', value: 5.1 },
          { indicator, countryiso3code: 'WLD', date: '2024', value: 11 },
          { indicator, countryiso3code: '', date: '2024', value: 3 },
        ]]);
      }),
    );
    const res = await get('/api/map/FB.CBK.BRCH.P5');
    expect(res.status).toBe(200);
    const data = await body<LatestValues>(res);
    expect(data.label).toBe('Commercial bank branches (per 100,000 adults)');
    expect(data.points).toEqual([
      { iso3: 'DEU', name: 'Germany', value: 9.2, year: 2024 },
      { iso3: 'KEN', name: 'Kenya', value: 5.1, year: 2022 },
    ]);
    expect(data.years).toEqual({ min: 2022, max: 2024 });
    expect((await get('/api/map/NOT.ALLOWED')).status).toBe(400);
    expect((await get('/api/map/x;drop')).status).toBe(404);
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
    expect(events[0]).toMatchObject({ id: 'gdacs-TC-1001', title: 'Tropical Cyclone TEST-26', lat: 14.2, lon: 125.5, severity: 3, provenance: 'estimate', category: 'natural-disaster', region: 'Philippines' });
    expect(events[0]!.summary).toContain('150 km/h');
    expect(events[0]!.source.url).toBe('https://www.gdacs.org/report.aspx?eventid=1001');
    expect(events[1]).toMatchObject({ title: 'Drought', severity: 5, region: 'Unknown' });
    expect(events[1]!.source.url).toBe('https://www.gdacs.org/'); // unsafe/non-http report links are never passed through
    expect(alertToSeverity(undefined)).toBe(1);
  });

  it('merges episodes of one event and never maps placeholder coordinates', async () => {
    const { normalizeGdacs } = await import('./gdacs');
    const ep = (episodeid: number, lon: number, todate: string) => ({
      geometry: { type: 'Point', coordinates: [lon, 15] },
      properties: { eventtype: 'TC', eventid: 77, episodeid, name: 'Typhoon X', alertlevel: 'Orange', todate },
    });
    const events = normalizeGdacs([
      ep(1, 140, '2026-10-20T00:00:00'),
      ep(3, 136, '2026-10-22T00:00:00'),
      ep(2, 138, '2026-10-21T00:00:00'),
      { geometry: { type: 'Point', coordinates: [0, 0] }, properties: { eventtype: 'FL', eventid: 5 } },
      { geometry: { type: 'Point', coordinates: [200, 95] }, properties: { eventtype: 'FL', eventid: 6 } },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'gdacs-TC-77', lon: 136 });
    expect(events[0]!.summary).toContain('3 GDACS updates');
  });

  it('serves the feed and reports upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ features: [{ geometry: { type: 'Point', coordinates: [1, 2] }, properties: { eventtype: 'VO', eventid: 9, alertlevel: 'Green' } }] })));
    const ok = await body<{ events: { id: string }[] }>(get('/api/events/disasters'));
    expect(ok.events.map((e) => e.id)).toEqual(['gdacs-VO-9']);
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

describe('CFTC Commitments of Traders', () => {
  const socrata = (code: string, date: string, extra: Record<string, string> = {}) => ({
    cftc_contract_market_code: code,
    market_and_exchange_names: 'GOLD - COMMODITY EXCHANGE INC.',
    report_date_as_yyyy_mm_dd: `${date}T00:00:00.000`,
    open_interest_all: '500000',
    noncomm_positions_long_all: '250000',
    noncomm_positions_short_all: '50000',
    comm_positions_long_all: '100000',
    comm_positions_short_all: '330000',
    nonrept_positions_long_all: '40000',
    nonrept_positions_short_all: '10000',
    ...extra,
  });

  it('normalises rows, sorts by date, de-duplicates and drops incomplete or unknown rows', () => {
    const out = normalizeCot([
      socrata('088691', '2026-10-13'),
      socrata('088691', '2026-10-06'),
      socrata('088691', '2026-10-06'),
      socrata('088691', '2026-09-29', { open_interest_all: '' }),
      socrata('088691', '2026-09-22', { noncomm_positions_long_all: 'n/a' }),
      socrata('999999', '2026-10-13'),
    ]);
    expect([...out.keys()]).toEqual(['088691']);
    expect(out.get('088691')!.map((r) => r.date)).toEqual(['2026-10-06', '2026-10-13']);
    expect(out.get('088691')![0]).toMatchObject({ openInterest: 500000, nonCommercialLong: 250000, commercialShort: 330000, cftcName: 'GOLD - COMMODITY EXCHANGE INC.' });
  });

  it('builds a bounded SoQL query', () => {
    const u = new URL(cotUrl(['088691', '067651'], Date.UTC(2023, 9, 1)));
    expect(u.host).toBe('publicreporting.cftc.gov');
    expect(u.searchParams.get('$where')).toBe("cftc_contract_market_code in('088691','067651') AND report_date_as_yyyy_mm_dd >= '2023-10-01T00:00:00'");
    expect(u.searchParams.get('$order')).toBe('report_date_as_yyyy_mm_dd ASC');
  });

  it('serves the overview with missing markets listed and validates the history route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([socrata('088691', '2026-10-13'), socrata('067651', '2026-10-13')])));
    const res = await body<CotResponse>(get('/api/cot'));
    expect(res.markets.map((m) => m.code)).toEqual(['067651', '088691']);
    expect(res.missing).toContain('133741');
    expect(res.source.url).toContain('cftc.gov');
    expect((await get('/api/cot/088691?years=5')).status).toBe(200);
    expect((await get('/api/cot/088691?years=50')).status).toBe(400);
    expect((await get('/api/cot/123456')).status).toBe(400);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    expect((await get('/api/cot')).status).toBe(502);
  });
});

describe('ECB Data Portal', () => {
  const csv = [
    'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
    'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-21,1.0812',
    'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-20,1.0790',
    'EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,A,2026-10-21,',
    'EXR.D.XXX.EUR.SP00.A,D,XXX,EUR,SP00,A,2026-10-21,1',
  ].join('\r\n');

  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('normalises observations by series, sorted, skipping blanks and unknown keys', () => {
    const out = normalizeEcb(csv);
    expect([...out.keys()]).toEqual(['EURUSD']);
    expect(out.get('EURUSD')).toEqual([{ date: '2026-10-20', value: 1.079 }, { date: '2026-10-21', value: 1.0812 }]);
    expect(normalizeEcb('').size).toBe(0);
    expect(normalizeEcb('A,B\n1,2').size).toBe(0);
  });

  it('combines FX keys into one request and keeps other series separate', () => {
    const urls = ecbUrls([MACRO_MAP.get('EURUSD')!, MACRO_MAP.get('EURJPY')!, MACRO_MAP.get('HICP')!], Date.UTC(2025, 0, 1));
    expect(urls).toEqual([
      'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+JPY.EUR.SP00.A?startPeriod=2025-01-01&format=csvdata&detail=dataonly',
      'https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?startPeriod=2025-01-01&format=csvdata&detail=dataonly',
    ]);
  });

  it('serves the overview, lists missing series, tolerates 404 and validates history requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('/EXR/') ? new Response(csv) : new Response('No results found', { status: 404 }))));
    const res = await body<MacroResponse>(get('/api/macro'));
    expect(res.series.map((s) => s.id)).toEqual(['EURUSD']);
    expect(res.missing).toHaveLength(MACRO_SERIES.length - 1);
    expect(res.source.name).toContain('ECB');
    expect((await get('/api/macro/EURUSD?years=25')).status).toBe(200);
    expect((await get('/api/macro/EURUSD?years=26')).status).toBe(400);
    expect((await get('/api/macro/NOPE')).status).toBe(400);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));
    expect((await get('/api/macro')).status).toBe(502);
  });
});

describe('currency endpoint', () => {
  it('returns annual CPI, inflation, FX and PPP series for an economy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname === '/v2/country/AUT') return Response.json([{ page: 1 }, [{ id: 'AUT', name: 'Austria', capitalCity: 'Vienna', region: { id: 'ECS', value: 'Europe' }, incomeLevel: { id: 'HIC', value: 'High' } }]]);
        const ind = u.pathname.split('/').at(-1)!;
        const v = { 'FP.CPI.TOTL': 100, 'FP.CPI.TOTL.ZG': 2, 'PA.NUS.FCRF': 0.9, 'PA.NUS.PPP': 0.75 }[ind];
        return Response.json([{ page: 1 }, [{ date: '2021', value: v }, { date: '2020', value: v }, { date: '2019', value: null }]]);
      }),
    );
    const res = await get('/api/currency/aut');
    expect(res.status).toBe(200);
    const p = await body<CurrencyProfile>(res);
    expect(p).toMatchObject({ iso3: 'AUT', name: 'Austria' });
    expect(p.series.cpi).toEqual([{ year: 2020, value: 100 }, { year: 2021, value: 100 }]);
    expect(p.series.ppp[0]).toEqual({ year: 2020, value: 0.75 });
    expect(p.source.license).toBe('CC BY 4.0');
  });

  it('rejects aggregates, unknown codes and bad input', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ page: 1 }, [{ id: 'WLD', name: 'World', region: { id: 'NA', value: 'Aggregates' } }]])));
    expect((await get('/api/currency/WLD')).status).toBe(404);
    expect((await get('/api/currency/AU')).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    expect((await get('/api/currency/FRA')).status).toBe(502);
  });
});

describe('stale fallback', () => {
  it('serves the last good response, flagged stale, when the upstream source fails', async () => {
    const store = new Map<string, Response>();
    const cache = {
      match: async (r: Request) => store.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => void store.set(r.url, res),
    };
    vi.stubGlobal('caches', { default: cache });
    const pending: Promise<unknown>[] = [];
    const ctx2 = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
    const req = (path: string) => handleApi(new Request(`https://aurorav.app${path}`, { headers: { 'CF-Connecting-IP': String(Math.random()) } }), env, ctx2);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ type: 'FeatureCollection', features: [] })));
    expect((await req('/api/events/earthquakes')).status).toBe(200);
    await Promise.all(pending);
    // The fresh entry expires; the upstream is down.
    store.delete('https://aurorav.app/api/events/earthquakes');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const res = await req('/api/events/earthquakes');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[]; stale?: { since: string; reason: string } };
    expect(body.events).toEqual([]);
    expect(body.stale?.reason).toMatch(/unavailable/);
    expect(body.stale?.since).toMatch(/^\d{4}-/);
  });

  it('serves the last good copy at once when the source is slow, and refreshes it in the background', async () => {
    const store = new Map<string, Response>();
    const cache = {
      match: async (r: Request) => store.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => void store.set(r.url, res),
    };
    vi.stubGlobal('caches', { default: cache });
    const pending: Promise<unknown>[] = [];
    const ctx2 = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
    const req = (path: string) => handleApi(new Request(`https://aurorav.app${path}`, { headers: { 'CF-Connecting-IP': String(Math.random()) } }), env, ctx2);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ type: 'FeatureCollection', features: [] })));
    await req('/api/events/earthquakes');
    await Promise.all(pending.splice(0));
    store.delete('https://aurorav.app/api/events/earthquakes');
    // The upstream now hangs until released.
    let release: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (release = r))));
    vi.useFakeTimers();
    const resP = req('/api/events/earthquakes');
    await vi.advanceTimersByTimeAsync(3100);
    const res = await resP;
    vi.useRealTimers();
    const body = (await res.json()) as { events: unknown[]; stale?: { reason: string } };
    expect(res.status).toBe(200);
    expect(body.stale?.reason).toMatch(/responding slowly/);
    // The background refresh completes and stores a fresh copy for the next request.
    expect(pending).toHaveLength(1);
    release(Response.json({ type: 'FeatureCollection', features: [] }));
    await Promise.all(pending);
    const next = (await (await req('/api/events/earthquakes')).json()) as { stale?: unknown };
    expect(next.stale).toBeUndefined();
  });

  it('passes the error through when there is no saved copy', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    expect((await get('/api/events/disasters')).status).toBe(502);
  });
});
