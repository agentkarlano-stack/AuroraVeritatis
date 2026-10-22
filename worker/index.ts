import type { PublicConfig } from '../shared/types';
import { cotHistory, cotOverview } from './cftc';
import { macroHistory, macroOverview } from './ecb';
import { error, json } from './http';
import { RateLimiter } from './ratelimit';
import { disasters } from './gdacs';
import { withRouteMeta } from './meta';
import { earthquakes } from './usgs';
import { ISO3_RE, compareYear, countryProfile, currencyProfile, indicatorSeries } from './worldbank';

export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
}

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
  };
}

/** Serve from the Cloudflare edge cache when possible; populate it on successful responses. */
const STALE_SECONDS = 7 * 86_400;

/**
 * Edge cache with a stale fallback. Every good response is also kept as a "last good" copy for a week. When the
 * upstream source fails (5xx), that copy is served instead, with `stale: { since, reason }` added to the JSON so the UI
 * can say the data is not current. Without a saved copy the error is passed through.
 */
async function cached(request: Request, ctx: ExecutionContext, produce: () => Promise<Response>): Promise<Response> {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : undefined;
  const url = new URL(request.url);
  const key = new Request(url.toString(), { method: 'GET' });
  const staleUrl = new URL(url);
  staleUrl.searchParams.set('__last_good', '1');
  const staleKey = new Request(staleUrl.toString(), { method: 'GET' });
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return hit;
  const res = await produce();
  if (cache && res.ok) {
    ctx.waitUntil(cache.put(key, res.clone()));
    const copy = new Response(res.clone().body, res);
    copy.headers.set('Cache-Control', `public, max-age=${STALE_SECONDS}`);
    copy.headers.set('X-Aurora-Saved', new Date().toISOString());
    ctx.waitUntil(cache.put(staleKey, copy));
    return res;
  }
  if (cache && res.status >= 500) {
    const last = await cache.match(staleKey);
    if (last) {
      const body = (await last.json().catch(() => null)) as Record<string, unknown> | null;
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const reason = ((await res.clone().json().catch(() => ({}))) as { error?: string }).error ?? 'Upstream source unavailable';
        return json({ ...body, stale: { since: last.headers.get('X-Aurora-Saved'), reason } }, { maxAge: 60 });
      }
    }
  }
  return res;
}

export async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (request.method !== 'GET') return error(405, 'Method not allowed');

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!limiter.allow(ip)) return error(429, 'Too many requests');

  if (path === '/api/health') {
    return json({ status: 'ok', service: 'aurora-veritatis', time: new Date().toISOString() });
  }

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

  return error(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    const res = await env.ASSETS.fetch(request);
    // Page navigations get route-specific <head> tags; everything else passes through untouched.
    if (request.method === 'GET' && (res.headers.get('content-type') ?? '').includes('text/html')) return withRouteMeta(res, url.pathname);
    return res;
  },
} satisfies ExportedHandler<Env>;
