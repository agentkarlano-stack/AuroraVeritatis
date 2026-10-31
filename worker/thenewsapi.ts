/**
 * The News API (https://www.thenewsapi.com/documentation), Basic plan: the primary paid news source (owner decision,
 * 30 October 2026). Server side only: the key travels as the `api_token` query parameter, so a request URL is never
 * logged, returned or put in an error message. Basic supports `/v1/news/all` (search) and `/v1/news/top`;
 * `/v1/news/headlines` is Standard and above and is never called. The API returns metadata and excerpts (title,
 * description/snippet, link, source, time), not republication rights: Aurora shows the headline, a short excerpt and
 * the link. `image_url` is a candidate only and is not displayed until media rights are recorded per image.
 * Plan limit: 2,500 requests a day, up to 25 articles per request. Results are cached by /api/news (30 minutes per
 * query); each isolate also keeps a daily budget so a burst can never use the whole plan.
 */
import type { NewsArticle } from '../shared/news';
import type { Timespan } from './gdelt';

export interface TheNewsApiEnv {
  THE_NEWS_API_KEY?: string;
}

const BASE = 'https://api.thenewsapi.com/v1/news';
export const theNewsApiConfigured = (env: TheNewsApiEnv) => !!env.THE_NEWS_API_KEY;

/** Requests per isolate per day (the plan allows 2,500 in total; edge caching keeps real use far lower). */
const DAILY_BUDGET = 150;
let budget = { day: '', used: 0 };
export const resetTheNewsApiBudgetForTests = () => (budget = { day: '', used: 0 });
const take = (now: number) => {
  const day = new Date(now).toISOString().slice(0, 10);
  if (budget.day !== day) budget = { day, used: 0 };
  if (budget.used >= DAILY_BUDGET) throw new Error('The News API daily request budget for this server is used');
  budget.used++;
};

const HOURS: Record<Timespan, number> = { '24h': 24, '3d': 72, '7d': 168 };

/** Default topics for Global Radar: security, diplomacy, disasters, infrastructure and the economy. */
export const RADAR_TOPICS = 'conflict | military | ceasefire | sanctions | election | earthquake | cyberattack | blackout | inflation';

/** The News API search syntax: `|` for OR, `+` for AND, `-` for NOT, quotes for phrases. */
export function theNewsApiQuery(q: string, defaultQuery: string): string {
  if (q === defaultQuery) return RADAR_TOPICS;
  return q.replace(/\bOR\b/g, '|').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Error with status and a sanitized message (never the URL, which carries the key). */
export class TheNewsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface RawArticle {
  uuid?: string;
  title?: string;
  description?: string;
  snippet?: string;
  url?: string;
  image_url?: string;
  source?: string;
  published_at?: string;
  language?: string;
  categories?: string[];
  locale?: string | null;
}

const clean = (s: string | undefined, n: number) =>
  (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);

/** Validates and normalizes provider records; anything without a safe link, title or time is dropped. */
export function normalizeTheNewsApi(data: RawArticle[]): NewsArticle[] {
  const out: NewsArticle[] = [];
  for (const a of data) {
    if (!a.url || !/^https?:\/\//.test(a.url) || !a.title || !a.published_at) continue;
    const t = Date.parse(a.published_at);
    if (!Number.isFinite(t)) continue;
    let host: string;
    try {
      host = new URL(a.url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      continue;
    }
    const summary = clean(a.description || a.snippet, 420);
    out.push({
      url: a.url,
      title: clean(a.title, 300),
      domain: (a.source || host).toLowerCase().replace(/^www\./, ''),
      seen: new Date(t).toISOString(),
      language: a.language === 'en' ? 'English' : (a.language ?? ''),
      sourceCountry: (a.locale ?? '').toUpperCase(),
      ...(summary ? { summary } : {}),
      provider: 'thenewsapi',
      ...(a.uuid ? { providerId: a.uuid } : {}),
    });
  }
  return out;
}

async function call(env: TheNewsApiEnv, endpoint: 'all' | 'top', params: Record<string, string>, f: typeof fetch, now: number) {
  if (!env.THE_NEWS_API_KEY) throw new TheNewsApiError('The News API key is not configured', 0);
  take(now);
  const u = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('api_token', env.THE_NEWS_API_KEY);
  const res = await f(u.toString(), { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res) throw new TheNewsApiError('The News API did not respond', 0);
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new TheNewsApiError(`The News API answered ${res.status}${j?.error?.code ? ` (${String(j.error.code).slice(0, 40)})` : ''}`, res.status);
  }
  const j = (await res.json()) as { data?: RawArticle[]; meta?: { found?: number; returned?: number } };
  return { articles: normalizeTheNewsApi(j.data ?? []), found: j.meta?.found ?? null };
}

/** Search (`/v1/news/all`) for the period, English, newest first, up to 25 articles (the Basic maximum). */
export async function theNewsApiSearch(env: TheNewsApiEnv, query: string, timespan: Timespan, defaultQuery: string, f: typeof fetch = fetch, now = Date.now()): Promise<NewsArticle[]> {
  const after = new Date(now - HOURS[timespan] * 3_600_000).toISOString().slice(0, 19);
  const r = await call(env, 'all', { search: theNewsApiQuery(query, defaultQuery), language: 'en', published_after: after, sort: 'published_at', limit: '25' }, f, now);
  return r.articles;
}

/** Minimal authenticated health check: one top story. Says nothing about content beyond count and newest time. */
export async function theNewsApiProbe(env: TheNewsApiEnv, f: typeof fetch = fetch, now = Date.now()): Promise<{ ok: true; returned: number; newest: string | null } | { ok: false; status: number; error: string }> {
  try {
    const r = await call(env, 'top', { language: 'en', limit: '3' }, f, now);
    return { ok: true, returned: r.articles.length, newest: r.articles.map((a) => a.seen).sort().at(-1) ?? null };
  } catch (e) {
    return { ok: false, status: e instanceof TheNewsApiError ? e.status : 0, error: e instanceof Error ? e.message : 'error' };
  }
}
