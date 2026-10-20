/**
 * Aurora Veritatis — Cloudflare Worker entry.
 *
 * Static assets (the React SPA) are served by Workers Static Assets.
 * Requests under /api/* run this Worker first (see wrangler.jsonc).
 */

import { CHOKEPOINTS } from "../shared/data/chokepoints";
import { COUNTRIES, countryByIso3, REGISTRY_REVIEWED } from "../shared/data/countries";
import { EVENT_CATEGORIES, SAMPLE_EVENTS } from "../shared/data/sampleEvents";
import {
  HISTORY_INDICATORS,
  historyUrl,
  latestUrl,
  parseHistory,
  parseLatest,
  PROFILE_INDICATORS,
  type HistoryPoint,
  type IndicatorValue,
} from "../shared/worldbank";

export interface Env {
  ASSETS?: { fetch(req: Request): Promise<Response> };
  APP_ENV?: string;
  APP_VERSION?: string;
  /** Public Supabase project URL — safe to expose to the browser. */
  SUPABASE_URL?: string;
  /** Public Supabase anon key — safe to expose; access is enforced by RLS. */
  SUPABASE_ANON_KEY?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export function json(data: unknown, init: ResponseInit & { maxAge?: number } = {}): Response {
  const headers = new Headers(JSON_HEADERS);
  headers.set("cache-control", init.maxAge ? `public, max-age=${init.maxAge}` : "no-store");
  new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

function notFound(message = "Not found"): Response {
  return json({ error: message }, { status: 404 });
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Fetch JSON with a timeout; uses the Workers Cache API when available. */
async function cachedJson(url: string, ttlSeconds: number, fetcher: FetchLike): Promise<unknown> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(url);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit.json();
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetcher(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const body = await res.json();
    if (cache) {
      await cache.put(key, new Response(JSON.stringify(body), { headers: { "cache-control": `public, max-age=${ttlSeconds}` } }));
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export interface IndicatorsResponse {
  iso3: string;
  covered: boolean;
  retrievedAt: string;
  indicators: IndicatorValue[];
  history: Record<string, HistoryPoint[]>;
  errors: string[];
  source: { name: string; url: string; licence: string };
}

export async function countryIndicators(iso3: string, fetcher: FetchLike): Promise<IndicatorsResponse> {
  const country = countryByIso3(iso3);
  const base: IndicatorsResponse = {
    iso3,
    covered: Boolean(country?.worldBank),
    retrievedAt: new Date().toISOString(),
    indicators: [],
    history: {},
    errors: [],
    source: {
      name: "World Bank Open Data — World Development Indicators",
      url: "https://data.worldbank.org/",
      licence: "CC BY 4.0",
    },
  };
  if (!country?.worldBank) return base;

  const day = 86_400;
  const latest = await Promise.allSettled(
    PROFILE_INDICATORS.map(async (def) => parseLatest(await cachedJson(latestUrl(iso3, def.id), day, fetcher), def)),
  );
  latest.forEach((r, i) => {
    if (r.status === "fulfilled") base.indicators.push(r.value);
    else base.errors.push(`${PROFILE_INDICATORS[i]!.id}: unavailable`);
  });

  const to = new Date().getUTCFullYear();
  const hist = await Promise.allSettled(
    HISTORY_INDICATORS.map(async (id) => [id, parseHistory(await cachedJson(historyUrl(iso3, id, to - 25, to), day, fetcher))] as const),
  );
  hist.forEach((r, i) => {
    if (r.status === "fulfilled") base.history[r.value[0]] = r.value[1];
    else base.errors.push(`${HISTORY_INDICATORS[i]}: history unavailable`);
  });
  return base;
}

export async function handleApi(request: Request, env: Env, fetcher: FetchLike = fetch): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  if (path === "/api/health") {
    return json({ status: "ok", service: "auroraveritatis", env: env.APP_ENV ?? "development", version: env.APP_VERSION ?? "0.1.0", time: new Date().toISOString() });
  }

  if (path === "/api/config") {
    const supabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
    return json({
      env: env.APP_ENV ?? "development",
      supabase: supabaseConfigured ? { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } : null,
      features: {
        auth: supabaseConfigured,
        liveEvents: false,
        liveMarkets: false,
        aiAgents: false,
        subscriptions: false,
      },
    }, { maxAge: 60 });
  }

  if (path === "/api/events") {
    const category = url.searchParams.get("category");
    const minSeverity = Number(url.searchParams.get("minSeverity") ?? 1);
    const events = SAMPLE_EVENTS.filter((e) => (!category || e.category === category) && e.severity >= minSeverity);
    return json({
      demo: true,
      notice: "Sample records only. No live OSINT feed is connected yet; these are not real events.",
      categories: EVENT_CATEGORIES,
      count: events.length,
      events,
    }, { maxAge: 300 });
  }

  if (path === "/api/chokepoints") {
    return json({ reference: true, notice: "Qualitative transmission framework — not a forecast.", chokepoints: CHOKEPOINTS }, { maxAge: 3600 });
  }

  if (path === "/api/countries") {
    return json({ reviewed: REGISTRY_REVIEWED, count: COUNTRIES.length, countries: COUNTRIES }, { maxAge: 3600 });
  }

  const m = /^\/api\/countries\/([A-Za-z]{3})(\/indicators)?$/.exec(path);
  if (m) {
    const iso3 = m[1]!.toUpperCase();
    const country = countryByIso3(iso3);
    if (!country) return notFound(`Unknown country ${iso3}`);
    if (!m[2]) return json({ reviewed: REGISTRY_REVIEWED, country }, { maxAge: 3600 });
    try {
      const data = await countryIndicators(iso3, fetcher);
      // Never let a partial or failed upstream response be cached for long.
      return json(data, { maxAge: data.errors.length === 0 ? 3600 : 60 });
    } catch {
      return json({ error: "Indicator source unavailable" }, { status: 502 });
    }
  }

  return notFound();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return notFound();
  },
};
