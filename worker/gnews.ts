/**
 * GNews (https://gnews.io/docs/v4): headline search with publisher and publication time. Headlines and links only,
 * never article text. Public display is off until GNEWS_DISPLAY=licensed (the owner confirms that the GNews plan
 * allows commercial display; the free plan is for development only). Requests are budgeted per isolate per day and
 * every result is cached for 30 minutes by /api/news.
 */
import type { NewsArticle } from '../shared/news';
import type { Timespan } from './gdelt';

export interface GnewsEnv {
  GNEWS_API_KEY?: string;
  /** "licensed" once the GNews plan permits public commercial display. */
  GNEWS_DISPLAY?: string;
}

export const gnewsEnabled = (env: GnewsEnv) => !!env.GNEWS_API_KEY && env.GNEWS_DISPLAY === 'licensed';

/** Daily request budget per isolate (the plan's own daily quota is the hard limit). */
const DAILY_BUDGET = 80;
let budget = { day: '', used: 0 };
export const resetGnewsBudgetForTests = () => (budget = { day: '', used: 0 });

const HOURS: Record<Timespan, number> = { '24h': 24, '3d': 72, '7d': 168 };

/** GNews accepts AND/OR/NOT and quoted phrases; GDELT's parenthesised default becomes a plain OR list. */
export function gnewsQuery(q: string): string {
  return q.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export async function gnewsSearch(env: GnewsEnv, query: string, timespan: Timespan, f: typeof fetch = fetch, now = Date.now()): Promise<NewsArticle[]> {
  if (!gnewsEnabled(env)) return [];
  const day = new Date(now).toISOString().slice(0, 10);
  if (budget.day !== day) budget = { day, used: 0 };
  if (budget.used >= DAILY_BUDGET) throw new Error('GNews daily request budget used');
  budget.used++;
  const from = new Date(now - HOURS[timespan] * 3_600_000).toISOString().slice(0, 19) + 'Z';
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(gnewsQuery(query))}&lang=en&max=10&sortby=publishedAt&from=${from}&apikey=${encodeURIComponent(env.GNEWS_API_KEY!)}`;
  const res = await f(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GNews answered ${res.status}`);
  const j = (await res.json()) as { articles?: { title?: string; url?: string; publishedAt?: string; source?: { name?: string; url?: string } }[] };
  return (j.articles ?? [])
    .filter((a) => a.url?.startsWith('http') && a.title && a.publishedAt)
    .map((a) => ({
      url: a.url!,
      title: a.title!.trim().slice(0, 300),
      domain: new URL(a.source?.url?.startsWith('http') ? a.source.url : a.url!).hostname.toLowerCase().replace(/^www\./, ''),
      seen: new Date(a.publishedAt!).toISOString(),
      language: 'English',
      sourceCountry: '',
    }));
}
