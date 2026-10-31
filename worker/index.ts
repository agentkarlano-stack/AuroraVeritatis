import type { PublicConfig } from '../shared/types';
import { cotHistory, cotOverview } from './cftc';
import { macroHistory, macroOverview } from './ecb';
import { error, json } from './http';
import { aiAsk, aiModels, aiStatus, requireAdmin, type AiGatewayEnv } from './ai/handler';
import { integrationHealth, publicSummary, type ProviderHealth } from './health';
import { briefingRoute, runEditionJob, type EditionsEnv } from './editions';
import { voiceEnabled, voiceSpeak } from './voice';
import { RateLimiter } from './ratelimit';
import { disasters } from './gdacs';
import { withRouteMeta } from './meta';
import { earthquakes } from './usgs';
import { DEFAULT_QUERY, TIMESPANS, cleanQuery, newsSearch, type ExtraSource, type Timespan } from './gdelt';
import { gnewsEnabled, gnewsSearch, type GnewsEnv } from './gnews';
import { theNewsApiConfigured, theNewsApiSearch, type TheNewsApiEnv } from './thenewsapi';
import { quoteEmail, validateQuote } from '../shared/businessQuote';
import { BrevoError, allowQuote, allowRequest, brevoDiagnostics, brevoStatus, eraseForAurora, normalizeEmail, sendConfirmation, sendQuoteRequest, startDoubleOptIn, subscriptionsReady, unsubscribe, verifyLink, type BrevoEnv } from './brevo';
import { TD_INTERVALS, TwelveDataError, diagnostics as marketDiagnostics, displayLicensed, isConfigured as marketConfigured, symbolSearch, timeSeries, validExchange, validSymbol, type TdInterval, type TwelveDataEnv } from './twelvedata';
import { ISO3_RE, compareYear, countryProfile, currencyProfile, indicatorSeries, latestValues } from './worldbank';

/** Paid news adapters added to GDELT + UN News: The News API (primary, Basic plan) and GNews (only when licensed). */
function newsExtras(env: Env, q: string, t: Timespan): ExtraSource[] {
  const out: ExtraSource[] = [];
  if (theNewsApiConfigured(env)) out.push({ name: 'The News API', search: () => theNewsApiSearch(env, q, t, DEFAULT_QUERY) });
  if (gnewsEnabled(env)) out.push({ name: 'GNews', search: () => gnewsSearch(env, q, t) });
  return out;
}

export interface Env extends TwelveDataEnv, BrevoEnv, AiGatewayEnv, GnewsEnv, TheNewsApiEnv, EditionsEnv {
  ASSETS: Fetcher;
  /** Cloudflare version metadata binding (wrangler.jsonc); absent in tests and local tools. */
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
  ENVIRONMENT?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
  /** ArcGIS Location Platform API key (browser key, referrer-restricted) for close-up satellite imagery; optional. */
  ARCGIS_BASEMAP_KEY?: string;
  /** Mapbox public access token (`pk.`), restricted to Aurora's URLs in the Mapbox account. */
  MAPBOX_ACCESS_TOKEN?: string;
  /** Inbox for business quote requests (defaults to the support address). */
  BUSINESS_QUOTE_TO?: string;
}

/** Git commit of this build: Workers Builds sets WORKERS_CI_COMMIT_SHA (vite.config.ts `define`). Empty when unknown. */
declare const __BUILD_COMMIT__: string;
const BUILD_COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '';

const limiter = new RateLimiter(60, 1); // 60-request burst, 1 req/s sustained per client IP.
const DAY = 86_400;

function publicConfig(env: Env, url: URL): PublicConfig {
  const environment =
    env.ENVIRONMENT === 'production' || env.ENVIRONMENT === 'preview'
      ? env.ENVIRONMENT
      : url.hostname === 'aurorav.app' || url.hostname === 'www.aurorav.app'
        ? 'production'
        : url.hostname.endsWith('.workers.dev')
          ? 'preview'
          : 'development';
  return {
    environment,
    supabase: env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } : null,
    posthog: env.POSTHOG_KEY ? { key: env.POSTHOG_KEY, host: env.POSTHOG_HOST || 'https://eu.i.posthog.com' } : null,
    imagery: env.ARCGIS_BASEMAP_KEY
      ? {
          tiles: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(env.ARCGIS_BASEMAP_KEY)}`,
          attribution: 'Imagery: Esri, Maxar, Earthstar Geographics and the GIS User Community',
          maxZoom: 18,
        }
      : null,
    mapbox: mapboxPublicToken(env) ? { token: mapboxPublicToken(env)! } : null,
  };
}

/** Only a public `pk.` token may reach the browser; anything else (e.g. a secret `sk.` token) is withheld. */
export function mapboxPublicToken(env: Env): string | null {
  const t = env.MAPBOX_ACCESS_TOKEN?.trim();
  return t && /^pk\.[A-Za-z0-9._-]+$/.test(t) ? t : null;
}

/** Serve from the Cloudflare edge cache when possible; populate it on successful responses. */
const STALE_SECONDS = 7 * 86_400;

/**
 * Edge cache with a stale fallback. Every good response is also kept as a "last good" copy for a week. When the
 * upstream source fails (5xx), that copy is served instead, with `stale: { since, reason }` added to the JSON so the UI
 * can say the data is not current. Without a saved copy the error is passed through.
 */
/** How long a request waits for the upstream before the last good copy is served instead (refresh continues). */
const SLOW_MS = 3000;

/**
 * Edge cache with a last-good copy (kept 7 days). Fresh hits are served directly. On a miss the upstream is asked;
 * if it fails (5xx) or has not answered within `slowMs` while a last-good copy exists, that copy is served, flagged
 * `stale: { since, reason }`, and a slow refresh completes in the background so the next request is fresh.
 */
async function cached(request: Request, ctx: ExecutionContext, produce: () => Promise<Response>, slowMs = SLOW_MS): Promise<Response> {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : undefined;
  const url = new URL(request.url);
  const key = new Request(url.toString(), { method: 'GET' });
  const staleUrl = new URL(url);
  staleUrl.searchParams.set('__last_good', '1');
  const staleKey = new Request(staleUrl.toString(), { method: 'GET' });
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return hit;
  const last = cache ? await cache.match(staleKey) : undefined;

  const refresh = produce()
    .catch((e: Error) => error(502, 'Upstream source unavailable', e.message))
    .then(async (res) => {
      if (cache && res.ok) {
        const copy = new Response(res.clone().body, res);
        copy.headers.set('Cache-Control', `public, max-age=${STALE_SECONDS}`);
        copy.headers.set('X-Aurora-Saved', new Date().toISOString());
        await Promise.all([cache.put(key, res.clone()), cache.put(staleKey, copy)]);
      }
      return res;
    });
  if (!last) return refresh;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), slowMs)));
  const first = await Promise.race([refresh, slow]);
  if (timer !== undefined) clearTimeout(timer);
  if (first && first.status < 500) return first;
  if (!first) ctx.waitUntil(refresh);
  const reason = first
    ? (((await first.clone().json().catch(() => ({}))) as { error?: string }).error ?? 'Upstream source unavailable')
    : 'The source is responding slowly. Showing the last saved copy while it updates.';
  const body = (await last.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return first ?? refresh;
  return json({ ...body, stale: { since: last.headers.get('X-Aurora-Saved'), reason } }, { maxAge: 60 });
}

/**
 * Integration tests run at most once per deployment and isolate: the public check and the admin dashboard share the
 * result, so opening the dashboard repeatedly does not use provider quotas.
 */
let healthRun: { build: string; at: number; rows: Promise<ProviderHealth[]> } | null = null;
function healthOnce(env: Env): Promise<ProviderHealth[]> {
  const build = env.CF_VERSION_METADATA?.id ?? 'dev';
  if (!healthRun || healthRun.build !== build || Date.now() - healthRun.at > 30 * 60_000) {
    healthRun = { build, at: Date.now(), rows: integrationHealth(env as unknown as Record<string, unknown>) };
  }
  return healthRun.rows;
}

/** Narration audio cached at the edge for 30 days (hash of model, voice and text). */
const voiceCache = {
  async get(key: string) {
    const r = await caches.default.match(`https://voice-cache.aurora.internal/${key}`);
    return r ? r.arrayBuffer() : null;
  },
  async put(key: string, audio: ArrayBuffer) {
    await caches.default.put(`https://voice-cache.aurora.internal/${key}`, new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'max-age=2592000' } }));
  },
};

/** AI answers cached at the edge for 6 hours, keyed by a hash of assistant, question and sources (never notes). */
const answerCache = {
  async get(key: string) {
    const r = await caches.default.match(`https://ai-cache.aurora.internal/${key}`);
    return r ? r.text() : null;
  },
  async put(key: string, value: string) {
    await caches.default.put(`https://ai-cache.aurora.internal/${key}`, new Response(value, { headers: { 'Cache-Control': 'max-age=21600' } }));
  },
};

export async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  const ip0 = request.headers.get('CF-Connecting-IP') ?? 'local';
  const BUILD_ID = env.CF_VERSION_METADATA?.id?.slice(0, 12) ?? 'dev';
  if (request.method === 'POST' && path.startsWith('/api/newsletter/')) return newsletterPost(request, env, url, path, ip0);
  if (request.method === 'POST' && path === '/api/business/quote') return quotePost(request, env, url, ip0);
  if (request.method === 'POST' && path === '/api/ai/ask') {
    return aiAsk(request, env, {
      countryProfile,
      events: async () => [...(await earthquakes().catch(() => [])), ...(await disasters().catch(() => []))],
      cache: answerCache,
    });
  }
  if (request.method === 'POST' && path === '/api/voice/speak') return voiceSpeak(request, env, { cache: voiceCache });
  if (request.method !== 'GET') return error(405, 'Method not allowed');
  if (path.startsWith('/api/briefing/')) return (await briefingRoute(path, env))!;

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!limiter.allow(ip)) return error(429, 'Too many requests');

  if (path === '/api/health') {
    // `commit` lets post-merge checks wait for this exact deployment (set at build time by Workers Builds).
    return json({ status: 'ok', service: 'aurora-veritatis', time: new Date().toISOString(), commit: BUILD_COMMIT || null, version: env.CF_VERSION_METADATA?.id ?? null });
  }

  if (path === '/api/ai/status') return aiStatus(env);
  if (path === '/api/voice/status') return json({ natural: voiceEnabled(env) });
  if (path === '/api/ai/models') return aiModels(request, env);

  if (path === '/api/config') {
    return json(publicConfig(env, url), { maxAge: 300 });
  }

  if (path === '/api/events/earthquakes') {
    return cached(request, ctx, async () => {
      try {
        return json({ events: await earthquakes() }, { maxAge: 600 });
      } catch (e) {
        return error(502, 'Earthquake feed unavailable', (e as Error).message);
      }
    });
  }

  // News coverage comparison (GDELT): headlines and links grouped into stories with a support status.
  if (path === '/api/news') {
    const q = cleanQuery(url.searchParams.get('q'));
    if (!q) return error(400, 'Use plain search words (up to 100 characters).');
    const t = (TIMESPANS as readonly string[]).includes(url.searchParams.get('t') ?? '') ? (url.searchParams.get('t') as Timespan) : '24h';
    return cached(request, ctx, async () => {
      try {
        return json(await newsSearch(q, t, newsExtras(env, q, t)), { maxAge: 1800 });
      } catch (e) {
        return error(502, 'News source unavailable', (e as Error).message);
      }
    });
  }

  if (path === '/api/events/disasters') {
    return cached(request, ctx, async () => {
      try {
        return json({ events: await disasters() }, { maxAge: 1800 });
      } catch (e) {
        return error(502, 'Disaster alert feed unavailable', (e as Error).message);
      }
    });
  }

  const compare = path.match(/^\/api\/compare\/(\d{4})$/);
  if (compare) {
    const p = url.searchParams;
    const [x, y, size] = [p.get('x') ?? 'NY.GDP.PCAP.CD', p.get('y') ?? 'SP.DYN.LE00.IN', p.get('size') ?? 'SP.POP.TOTL'];
    return cached(request, ctx, async () => {
      try {
        const data = await compareYear(Number(compare[1]), x, y, size);
        return data ? json(data, { maxAge: DAY }) : error(400, 'Unsupported indicator or year');
      } catch (e) {
        return error(502, 'Country data source unavailable', (e as Error).message);
      }
    });
  }

  // Most recent value per economy for one map indicator (economic and financial map layers).
  const latest = path.match(/^\/api\/map\/([A-Z0-9.]{4,30})$/);
  if (latest) {
    return cached(request, ctx, async () => {
      try {
        const data = await latestValues(latest[1]!);
        return data ? json(data, { maxAge: DAY }) : error(400, 'Unsupported indicator');
      } catch (e) {
        return error(502, 'Country data source unavailable', (e as Error).message);
      }
    });
  }

  const profile = path.match(/^\/api\/countries\/([A-Za-z]{3})$/);
  if (profile) {
    const iso3 = profile[1]!.toUpperCase();
    if (!ISO3_RE.test(iso3)) return error(400, 'Invalid country code');
    return cached(request, ctx, async () => {
      try {
        const data = await countryProfile(iso3);
        return data ? json(data, { maxAge: DAY }) : error(404, 'Country not found in World Bank dataset');
      } catch (e) {
        return error(502, 'Country data source unavailable', (e as Error).message);
      }
    });
  }

  // Currency & purchasing power: annual CPI, inflation, exchange rate and PPP factor (World Bank, updated yearly).
  const currency = path.match(/^\/api\/currency\/([A-Za-z]{3})$/);
  if (currency) {
    const iso3 = currency[1]!.toUpperCase();
    return cached(request, ctx, async () => {
      try {
        const data = await currencyProfile(iso3);
        return data ? json(data, { maxAge: DAY }) : error(404, 'Economy not found in World Bank dataset');
      } catch (e) {
        return error(502, 'Currency data source unavailable', (e as Error).message);
      }
    });
  }

  const series = path.match(/^\/api\/countries\/([A-Za-z]{3})\/series\/([A-Z0-9.]{3,40})$/);
  if (series) {
    const iso3 = series[1]!.toUpperCase();
    return cached(request, ctx, async () => {
      try {
        const data = await indicatorSeries(iso3, series[2]!);
        return data ? json(data, { maxAge: DAY }) : error(400, 'Unsupported indicator');
      } catch (e) {
        return error(502, 'Country data source unavailable', (e as Error).message);
      }
    });
  }

  // CFTC publishes weekly (Friday 15:30 ET); a 6-hour edge cache picks up new reports the same evening.
  if (path === '/api/cot') {
    return cached(request, ctx, async () => {
      try {
        return json(await cotOverview(), { maxAge: 6 * 3600 });
      } catch (e) {
        return error(502, 'CFTC data source unavailable', (e as Error).message);
      }
    });
  }

  const cot = path.match(/^\/api\/cot\/([0-9A-Z]{6})$/);
  if (cot) {
    const years = Number(url.searchParams.get('years') ?? '10');
    return cached(request, ctx, async () => {
      try {
        const data = await cotHistory(cot[1]!, years);
        return data ? json(data, { maxAge: 6 * 3600 }) : error(400, 'Unsupported market or range');
      } catch (e) {
        return error(502, 'CFTC data source unavailable', (e as Error).message);
      }
    });
  }

  // ECB reference rates are published around 16:00 CET on TARGET working days; 3-hour edge cache.
  if (path === '/api/macro') {
    return cached(request, ctx, async () => {
      try {
        return json(await macroOverview(), { maxAge: 3 * 3600 });
      } catch (e) {
        return error(502, 'ECB data source unavailable', (e as Error).message);
      }
    });
  }

  const macro = path.match(/^\/api\/macro\/([A-Z0-9-]{3,12})$/);
  if (macro) {
    const years = Number(url.searchParams.get('years') ?? '10');
    return cached(request, ctx, async () => {
      try {
        const data = await macroHistory(macro[1]!, years);
        return data ? json(data, { maxAge: 3 * 3600 }) : error(400, 'Unsupported series or range');
      } catch (e) {
        return error(502, 'ECB data source unavailable', (e as Error).message);
      }
    });
  }

  // ---------- Integrations (status only; never key values) ----------
  if (path === '/api/integrations') {
    return json({
      build: BUILD_ID,
      twelveData: { configured: marketConfigured(env), publicDisplay: displayLicensed(env) ? 'licensed' : 'pending-licence-confirmation' },
      brevo: brevoStatus(env),
    });
  }

  // Limited live connection test for both providers. Cached for 6 hours at the edge; returns plans, freshness and
  // domain status but no prices and no contact data.
  if (path === '/api/integrations/check') {
    // One cache entry per deployment: query strings cannot force extra (credit-consuming) runs, and every new build
    // re-tests the providers.
    const key = new Request(`${url.origin}/api/integrations/check?build=${BUILD_ID}`);
    return cached(key, ctx, async () => {
      const [td, br, health] = await Promise.all([
        marketConfigured(env) ? marketDiagnostics(env).catch((e: Error) => ({ error: e.message })) : Promise.resolve({ error: 'TWELVE_DATA_API_KEY not configured' }),
        brevoStatus(env).configured ? brevoDiagnostics(env).catch((e: Error) => ({ error: e.message })) : Promise.resolve({ error: 'BREVO_API_KEY not configured' }),
        healthOnce(env),
      ]);
      // Cache a complete success for 6 hours; anything with an error only briefly, so fixes show up quickly.
      const failed = 'error' in td || 'error' in br || ('probes' in td && td.probes.some((p) => !p.ok));
      return json({ build: BUILD_ID, twelveData: td, brevo: br, providers: publicSummary(health) }, { maxAge: failed ? 300 : 6 * 3600 });
    });
  }

  // Administrators: full integration health (plan and quota facts, redacted errors). Same per-deployment test run.
  if (path === '/api/integrations/health') {
    const refused = await requireAdmin(request, env);
    if (refused) return refused;
    return json({ build: BUILD_ID, providers: await healthOnce(env) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  // ---------- Market data (Twelve Data) ----------
  if (path === '/api/market/search') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!marketConfigured(env)) return error(503, 'Market data provider not configured');
    if (q.length < 1 || q.length > 30 || !/^[\p{L}\p{N} .:/&-]+$/u.test(q)) return error(400, 'Invalid search');
    return cached(request, ctx, async () => {
      try {
        return json({ results: await symbolSearch(env, q), provider: 'Twelve Data' }, { maxAge: DAY });
      } catch (e) {
        return error(e instanceof TwelveDataError ? e.status : 502, (e as Error).message);
      }
    });
  }

  if (path === '/api/market/series') {
    const symbol = url.searchParams.get('symbol') ?? '';
    const interval = (url.searchParams.get('interval') ?? '1D') as TdInterval;
    const exchange = url.searchParams.get('exchange') ?? undefined;
    if (!validSymbol(symbol) || !(interval in TD_INTERVALS) || (exchange && !validExchange(exchange))) return error(400, 'Invalid symbol, interval or exchange');
    if (!marketConfigured(env)) return error(503, 'Market data provider not configured');
    // Prices stay private until the display/redistribution rights of the subscription are confirmed.
    if (!displayLicensed(env)) return error(451, 'Public display of market data is pending licence confirmation');
    return cached(request, ctx, async () => {
      try {
        return json(await timeSeries(env, symbol, interval, { exchange, outputsize: Number(url.searchParams.get('n')) || 500 }), { maxAge: TD_INTERVALS[interval].ttl });
      } catch (e) {
        return error(e instanceof TwelveDataError ? e.status : 502, (e as Error).message);
      }
    });
  }

  // ---------- Newsletter confirmation links (unsubscribe / delete) ----------
  if (path === '/api/newsletter/confirm') {
    const p = { e: url.searchParams.get('e') ?? '', a: url.searchParams.get('a') ?? '', x: url.searchParams.get('x') ?? '', t: url.searchParams.get('t') ?? '' };
    const go = (status: string) => Response.redirect(`${url.origin}/newsletter?status=${status}`, 303);
    if (!brevoStatus(env).configured || !brevoStatus(env).listConfigured) return go('unavailable');
    if (!(await verifyLink(env, p))) return go('invalid');
    try {
      if (p.a === 'delete') {
        await eraseForAurora(env, p.e);
        return go('deleted');
      }
      await unsubscribe(env, p.e);
      return go('unsubscribed');
    } catch {
      return go('error');
    }
  }

  return error(404, 'Not found');
}

/** POST /api/newsletter/subscribe and /api/newsletter/request (same-origin JSON only; generic answers). */
async function newsletterPost(request: Request, env: Env, url: URL, path: string, ip: string): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== url.origin) return error(403, 'Cross-site requests are not accepted');
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) return error(415, 'JSON expected');
  const body = (await request.json().catch(() => null)) as { email?: unknown; consent?: unknown; website?: unknown; action?: unknown } | null;
  if (!body) return error(400, 'Invalid request');
  // Honeypot: real people never fill this hidden field. Answer as if it worked.
  const accepted = json({ ok: true, message: 'If the address is valid, we have sent an email. Please check your inbox (and spam folder) to confirm.' }, { status: 202 });
  if (typeof body.website === 'string' && body.website.trim()) return accepted;
  const email = normalizeEmail(body.email);
  if (!email) return error(400, 'Please enter a valid email address');
  if (!allowRequest(ip, email)) return error(429, 'Too many requests. Please try again later.');
  try {
    if (path === '/api/newsletter/subscribe') {
      if (body.consent !== true) return error(400, 'Please confirm that you agree to receive the newsletter');
      if (!subscriptionsReady(env)) return error(503, 'Newsletter sign-up is not open yet');
      await startDoubleOptIn(env, email, `${url.origin}/newsletter?status=confirmed`);
      return accepted;
    }
    if (path === '/api/newsletter/request') {
      if (body.action !== 'unsubscribe' && body.action !== 'delete') return error(400, 'Unknown request');
      const st = brevoStatus(env);
      if (!st.configured || !st.listConfigured || !st.senderConfigured) return error(503, 'This request cannot be processed online yet. Email auroraveritatissup@gmail.com.');
      await sendConfirmation(env, url.origin, body.action, email);
      return accepted;
    }
    return error(404, 'Not found');
  } catch (e) {
    // Brevo rejects some addresses (e.g. already blocklisted); keep answers generic so addresses cannot be probed.
    if (e instanceof BrevoError && e.status === 400) return accepted;
    return error(502, 'The newsletter service is unavailable right now. Please try again later.');
  }
}

const QUOTE_FALLBACK = 'Online quote requests are not available right now. Please email auroraveritatissup@gmail.com with your organisation and needs.';

/** POST /api/business/quote: validates a business quote request and emails it to the team (no prices, no auto-reply). */
async function quotePost(request: Request, env: Env, url: URL, ip: string): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== url.origin) return error(403, 'Cross-site requests are not accepted');
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) return error(415, 'JSON expected');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return error(400, 'Invalid request');
  const reference = `Q-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const accepted = json({ ok: true, reference, message: `Thank you. Your request ${reference} has reached our team, and we will reply by email with a private proposal.` }, { status: 202 });
  // Honeypot: real people never fill this hidden field. Answer as if it worked.
  if (typeof body.website === 'string' && body.website.trim()) return accepted;
  const v = validateQuote(body);
  if (!v.ok) return error(400, v.error);
  if (!allowQuote(ip)) return error(429, 'Too many requests. Please try again later or email auroraveritatissup@gmail.com.');
  if (!brevoStatus(env).configured) return error(503, QUOTE_FALLBACK);
  try {
    const mail = quoteEmail(v.value, { freeMail: v.freeMail, receivedAt: new Date().toISOString(), reference });
    await sendQuoteRequest(env, mail, { email: v.value.email, name: v.value.contact }, reference);
    return accepted;
  } catch {
    return error(502, QUOTE_FALLBACK);
  }
}

export default {
  // Operations Briefing editions: the job runs every 15 minutes and generates today's edition once, when it is due.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runEditionJob(env, {
        events: async () => [...(await earthquakes().catch(() => [])), ...(await disasters().catch(() => []))],
        stories: async () => (await newsSearch(cleanQuery(null)!, '24h', newsExtras(env, cleanQuery(null)!, '24h'))).stories,
      }).then((r) => console.log('Edition job', r.action, r.detail ?? '')),
    );
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    const res = await env.ASSETS.fetch(request);
    // Page navigations get route-specific <head> tags; everything else passes through untouched.
    if (request.method === 'GET' && (res.headers.get('content-type') ?? '').includes('text/html')) return withRouteMeta(res, url.pathname);
    return res;
  },
} satisfies ExportedHandler<Env>;
