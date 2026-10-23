import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeEmail, signLink, verifyLink } from './brevo';
import { handleApi, type Env } from './index';
import { freshnessOf, normalizeSeries, redact, resetBudgetForTests, utcDateTime } from './twelvedata';

const TD_KEY = 'td_secret_key_123456';
const BREVO_KEY = 'xkeysib-secret-abcdef';
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const base = { ASSETS: {} as Fetcher } as Env;
const full: Env = { ...base, TWELVE_DATA_API_KEY: TD_KEY, BREVO_API_KEY: BREVO_KEY, BREVO_LIST_ID: '7', BREVO_DOI_TEMPLATE_ID: '3', BREVO_SENDER_EMAIL: 'news@aurorav.app' };
const req = (path: string, env: Env, init: RequestInit = {}) =>
  handleApi(new Request(`https://aurorav.app${path}`, { ...init, headers: { 'CF-Connecting-IP': String(Math.random()), ...(init.headers ?? {}) } }), env, ctx);
const post = (path: string, env: Env, body: unknown, origin = 'https://aurorav.app') =>
  req(path, env, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: origin } });

afterEach(() => {
  resetBudgetForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Twelve Data', () => {
  it('parses provider timestamps as UTC (requested with timezone=UTC)', () => {
    expect(new Date(utcDateTime('2026-10-22 15:30:00')).toISOString()).toBe('2026-10-22T15:30:00.000Z');
    expect(new Date(utcDateTime('2026-10-22')).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(utcDateTime('22/10/2026')).toBeNaN();
  });

  it('labels observed freshness honestly', () => {
    const now = Date.parse('2026-10-22T14:00:00Z');
    expect(freshnessOf('1m', now - 2 * 60_000, now).freshness).toBe('near-real-time');
    expect(freshnessOf('1m', now - 20 * 60_000, now)).toEqual({ freshness: 'delayed', ageMinutes: 20 });
    expect(freshnessOf('1h', now - 3 * 86_400_000, now).freshness).toBe('historical');
    expect(freshnessOf('1D', now - 86_400_000, now).freshness).toBe('end-of-day');
    expect(freshnessOf('1D', now + 3_600_000, now).freshness).toBe('session-in-progress');
  });

  it('normalises provider bars oldest first and never invents bars', () => {
    const s = normalizeSeries(
      { meta: { symbol: 'AAPL', interval: '1min', exchange_timezone: 'America/New_York', exchange: 'NASDAQ', currency: 'USD', type: 'Common Stock' }, values: [{ datetime: '2026-10-22 14:01:00', open: '2', high: '3', low: '1', close: '2.5', volume: '100' }, { datetime: '2026-10-22 14:00:00', open: '1', high: '2', low: '1', close: '2', volume: '50' }, { datetime: '2026-10-22 13:59:00', open: 'x', high: '1', low: '1', close: '1' }] },
      '1m',
      Date.parse('2026-10-22T14:03:00Z'),
    );
    expect(s.bars.map((b) => b.time)).toEqual(['2026-10-22T14:00:00.000Z', '2026-10-22T14:01:00.000Z']);
    expect(s.freshness).toBe('near-real-time');
    expect(s.ageMinutes).toBe(2);
    expect(s.exchangeTimeZone).toBe('America/New_York');
  });

  it('refuses to claim freshness for bars stamped in the future', () => {
    const s = normalizeSeries({ meta: { symbol: 'EUR/USD', interval: '1min' }, values: [{ datetime: '2026-10-23 11:27:00', open: '1', high: '1', low: '1', close: '1' }] }, '1m', Date.parse('2026-10-23T00:28:00Z'));
    expect(s.freshness).toBeNull();
    expect(s.warning).toMatch(/future/);
  });

  it('redacts the key from any text', () => {
    expect(redact(`GET https://api.twelvedata.com/x?apikey=${TD_KEY}&a=1 failed (${TD_KEY})`, TD_KEY)).toBe('GET https://api.twelvedata.com/x?apikey=[redacted]&a=1 failed ([redacted])');
  });

  it('keeps prices private until public display is licensed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await req('/api/market/series?symbol=AAPL&interval=1m', full);
    expect(res.status).toBe(451);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await req('/api/market/series?symbol=AAPL;drop&interval=1m', full)).status).toBe(400);
    expect((await req('/api/market/series?symbol=AAPL&interval=1m', base)).status).toBe(503);
  });

  it('serves licensed series and search without leaking the key', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('apikey=');
      if (url.includes('/symbol_search')) return Response.json({ data: [{ symbol: 'SAP', instrument_name: 'SAP SE', exchange: 'XETR', mic_code: 'XETR', country: 'Germany', currency: 'EUR', instrument_type: 'Common Stock' }], status: 'ok' });
      if (url.includes('symbol=BAD')) return Response.json({ code: 400, message: `**symbol** not found, apikey=${TD_KEY}`, status: 'error' });
      return Response.json({ meta: { symbol: 'EUR/USD', interval: '1day', exchange_timezone: 'UTC', type: 'Physical Currency' }, values: [{ datetime: '2026-10-21', open: '1.1', high: '1.2', low: '1.0', close: '1.15' }], status: 'ok' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const licensed = { ...full, MARKET_DATA_DISPLAY: 'licensed' };
    const series = await req('/api/market/series?symbol=EUR/USD&interval=1D', licensed);
    expect(series.status).toBe(200);
    expect(((await series.json()) as { bars: unknown[]; provider: string }).bars).toHaveLength(1);
    const search = await req('/api/market/search?q=SAP', full);
    expect(((await search.json()) as { results: { micCode: string }[] }).results[0]!.micCode).toBe('XETR');
    const bad = await req('/api/market/series?symbol=BAD&interval=1D', licensed);
    expect(bad.status).toBe(404);
    expect(await bad.text()).not.toContain(TD_KEY);
  });
});

describe('integration status and check', () => {
  it('reports configuration without values', async () => {
    const body = (await (await req('/api/integrations', full)).json()) as Record<string, unknown>;
    expect(body).toEqual({ build: 'dev', twelveData: { configured: true, publicDisplay: 'pending-licence-confirmation' }, brevo: { configured: true, listConfigured: true, doubleOptInConfigured: true, senderConfigured: true } });
    expect(JSON.stringify(body)).not.toContain(TD_KEY);
    const none = (await (await req('/api/integrations', base)).json()) as { twelveData: { configured: boolean }; brevo: { configured: boolean } };
    expect(none.twelveData.configured).toBe(false);
    expect(none.brevo.configured).toBe(false);
  });

  it('runs the limited connection test with no prices and no contact data', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(url.replace(/apikey=[^&]+/, 'apikey=*'));
        if (url.includes('/api_usage')) return Response.json({ plan_category: 'basic', daily_usage: 12, plan_daily_limit: 800 });
        if (url.includes('twelvedata')) return Response.json({ meta: { symbol: 'EUR/USD', interval: '1min', exchange_timezone: 'UTC' }, values: [{ datetime: new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' '), open: '1', high: '1', low: '1', close: '1.1' }], status: 'ok' });
        expect((init?.headers as Record<string, string>)['api-key']).toBe(BREVO_KEY);
        if (url.endsWith('/account')) return Response.json({ email: 'owner@example.com', plan: [{ type: 'free' }] });
        if (url.endsWith('/senders/domains')) return Response.json({ domains: [{ domain_name: 'aurorav.app', authenticated: false, verified: true }] });
        if (url.includes('/contacts/lists/7')) return Response.json({ id: 7 });
        return new Response('{}', { status: 404 });
      }),
    );
    const res = await req('/api/integrations/check', full);
    const text = await res.text();
    expect(text).not.toContain(TD_KEY);
    expect(text).not.toContain(BREVO_KEY);
    expect(text).not.toContain('owner@example.com');
    expect(text).not.toContain('"close"');
    const body = JSON.parse(text) as { twelveData: { plan: string; probes: { ok: boolean; freshness: string }[] }; brevo: { plan: string; domains: { authenticated: boolean }[]; listFound: boolean } };
    expect(body.twelveData.plan).toBe('basic');
    expect(body.twelveData.probes).toHaveLength(6);
    expect(body.twelveData.probes.every((p) => p.ok)).toBe(true);
    expect(body.brevo).toMatchObject({ plan: 'free', domains: [{ domain: 'aurorav.app', authenticated: false, verified: true }], listFound: true });
    // Seven Twelve Data requests at most (plan check + six probes), within the free plan's 8 per minute.
    expect(calls.filter((c) => c.includes('twelvedata')).length).toBe(7);
  });
});

describe('newsletter', () => {
  it('validates addresses', () => {
    expect(normalizeEmail(' Reader@Example.COM ')).toBe('reader@example.com');
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail(`${'x'.repeat(250)}@example.com`)).toBeNull();
  });

  it('starts double opt-in only with explicit consent from the same origin', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await post('/api/newsletter/subscribe', full, { email: 'a@example.com', consent: true }, 'https://evil.example')).status).toBe(403);
    expect((await post('/api/newsletter/subscribe', full, { email: 'b@example.com', consent: false })).status).toBe(400);
    expect((await post('/api/newsletter/subscribe', full, { email: 'bad' })).status).toBe(400);
    // Honeypot filled: generic success, nothing sent.
    expect((await post('/api/newsletter/subscribe', full, { email: 'bot@example.com', consent: true, website: 'spam.example' })).status).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();
    const ok = await post('/api/newsletter/subscribe', full, { email: 'Reader@Example.com', consent: true });
    expect(ok.status).toBe(202);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
    expect(JSON.parse(call[1].body as string)).toEqual({ email: 'reader@example.com', includeListIds: [7], templateId: 3, redirectionUrl: 'https://aurorav.app/newsletter?status=confirmed' });
    // The same address again within 10 minutes is refused.
    expect((await post('/api/newsletter/subscribe', full, { email: 'reader@example.com', consent: true })).status).toBe(429);
    // Not open until list and template are configured.
    expect((await post('/api/newsletter/subscribe', { ...base, BREVO_API_KEY: BREVO_KEY }, { email: 'c@example.com', consent: true })).status).toBe(503);
  });

  it('confirms unsubscribe and deletion through signed, expiring links', async () => {
    const now = Date.now();
    const link = await signLink(full, 'delete', 'reader@example.com', now);
    expect(await verifyLink(full, link, now)).toBe(true);
    expect(await verifyLink(full, { ...link, e: 'other@example.com' }, now)).toBe(false);
    expect(await verifyLink(full, { ...link, a: 'unsubscribe' }, now)).toBe(false);
    expect(await verifyLink(full, link, now + 49 * 3_600_000)).toBe(false);
    expect(await verifyLink({ ...full, BREVO_API_KEY: 'another-key' }, link, now)).toBe(false);

    const calls: [string, string][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([init?.method ?? 'GET', url]);
        if (url.endsWith('/contacts/reader%40example.com') && (init?.method ?? 'GET') === 'GET') return Response.json({ email: 'reader@example.com', listIds: [7, 12] });
        return new Response(null, { status: 204 });
      }),
    );
    const res = await req(`/api/newsletter/confirm?${new URLSearchParams(link)}`, full);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('https://aurorav.app/newsletter?status=deleted');
    // On another list too: only removed from the Aurora list, never deleted.
    expect(calls).toEqual([
      ['GET', 'https://api.brevo.com/v3/contacts/reader%40example.com'],
      ['POST', 'https://api.brevo.com/v3/contacts/lists/7/contacts/remove'],
    ]);
    const forged = await req(`/api/newsletter/confirm?${new URLSearchParams({ ...link, t: 'x'.repeat(43) })}`, full);
    expect(forged.headers.get('Location')).toBe('https://aurorav.app/newsletter?status=invalid');
  });

  it('sends a confirmation email for unsubscribe requests', async () => {
    const fetchMock = vi.fn(async () => Response.json({ messageId: 'm1' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await post('/api/newsletter/request', full, { email: 'leave@example.com', action: 'unsubscribe' });
    expect(res.status).toBe(202);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const body = JSON.parse(init.body as string) as { to: { email: string }[]; textContent: string; sender: { email: string } };
    expect(body.to).toEqual([{ email: 'leave@example.com' }]);
    expect(body.sender.email).toBe('news@aurorav.app');
    expect(body.textContent).toContain('https://aurorav.app/api/newsletter/confirm?');
    expect(body.textContent).not.toContain(BREVO_KEY);
  });
});

describe('business quote requests', () => {
  const quote = {
    organization: 'Example Research <b>Ltd</b>',
    contact: 'Dana Example',
    email: 'dana@example.org',
    country: 'Germany',
    industry: 'Consulting',
    seats: '10',
    functions: ['Global Radar and briefings'],
    aiUsage: 'Not sure yet',
    duration: '12 months',
    consent: true,
  };

  it('emails the team only, with reply-to the requester and no prices', async () => {
    const fetchMock = vi.fn(async () => Response.json({ messageId: 'm1' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await post('/api/business/quote', full, quote, 'https://evil.example')).status).toBe(403);
    expect((await post('/api/business/quote', full, { ...quote, consent: false })).status).toBe(400);
    expect((await post('/api/business/quote', full, { ...quote, website: 'spam' })).status).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();

    const res = await post('/api/business/quote', { ...full, BUSINESS_QUOTE_TO: 'sales@aurorav.app' }, quote);
    expect(res.status).toBe(202);
    expect(((await res.json()) as { reference: string }).reference).toMatch(/^Q-[0-9A-F]{6}$/);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const body = JSON.parse(init.body as string) as { to: { email: string }[]; replyTo: { email: string }; htmlContent: string; textContent: string };
    expect(body.to).toEqual([{ email: 'sales@aurorav.app' }]);
    expect(body.replyTo.email).toBe('dana@example.org');
    expect(body.htmlContent).toContain('&lt;b&gt;Ltd');
    expect(body.textContent).not.toMatch(/€|price per/i);
  });

  it('falls back to email when Brevo is not configured', async () => {
    const res = await post('/api/business/quote', base, quote);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain('auroraveritatissup@gmail.com');
  });
});
