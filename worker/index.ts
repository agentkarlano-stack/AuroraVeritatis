import type { PublicConfig } from '../shared/types';
import { error, json } from './http';
import { RateLimiter } from './ratelimit';
import { disasters } from './gdacs';
import { withRouteMeta } from './meta';
import { earthquakes } from './usgs';
import { ISO3_RE, compareYear, countryProfile, indicatorSeries } from './worldbank';

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
async function cached(request: Request, ctx: ExecutionContext, produce: () => Promise<Response>): Promise<Response> {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : undefined;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return hit;
  const res = await produce();
  if (cache && res.ok) ctx.waitUntil(cache.put(key, res.clone()));
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
