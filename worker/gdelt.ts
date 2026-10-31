/**
 * News sources for coverage comparison, headlines and links only:
 * - GDELT DOC 2.0 article search (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/): free, no key, any use with
 *   attribution. It throttles bursts (about one request per 5 s per network) and can be slow, so it gets a long timeout
 *   and results are cached for 30 minutes with the 7-day saved-copy fallback.
 * - UN News RSS (https://news.un.org/): an official source, merged in so stories it covers count as confirmed, and
 *   shown on its own when GDELT is unavailable.
 */
import { gdeltTime, groupStories, type NewsArticle, type Story } from '../shared/news';
import { fetchJson, fetchText } from './http';

export const TIMESPANS = ['24h', '3d', '7d'] as const;
export type Timespan = (typeof TIMESPANS)[number];
export const DEFAULT_QUERY = '(geopolitics OR election OR sanctions OR conflict OR economy OR inflation OR earthquake)';

export interface NewsResult {
  query: string;
  timespan: Timespan;
  articles: number;
  stories: Story[];
  source: { name: string; url: string; license: string };
  fetchedAt: string;
  /** Set when one source failed and the result is incomplete. */
  partial?: string;
}

/** Plain search words and quoted phrases only (letters, digits, spaces, quotes, hyphens), at most 100 characters. */
export function cleanQuery(q: string | null): string | null {
  const s = (q ?? '').trim();
  if (!s) return DEFAULT_QUERY;
  if (s.length > 100 || !/^[\p{L}\p{N}\s"'\-.]+$/u.test(s)) return null;
  // GDELT needs at least one word of 3+ characters; quote multi-word phrases so they match as a phrase.
  if (!/[\p{L}\p{N}]{3,}/u.test(s)) return null;
  return /\s/.test(s) && !s.includes('"') ? `"${s}"` : s;
}

const UN_NEWS_RSS = 'https://news.un.org/feed/subscribe/en/news/all/rss.xml';

const decode = (x: string) =>
  x
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim();

/** UN News items (title, link, publication time) from its RSS feed. */
export function parseUnNews(xml: string): NewsArticle[] {
  const out: NewsArticle[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]!;
    const get = (tag: string) => decode(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(item)?.[1] ?? '');
    const url = get('guid').startsWith('https://') ? get('guid') : get('link');
    const title = get('title');
    const t = Date.parse(get('pubDate'));
    if (!url.startsWith('https://') || !title || !Number.isFinite(t)) continue;
    out.push({ url, title: title.slice(0, 300), domain: 'news.un.org', seen: new Date(t).toISOString(), language: 'English', sourceCountry: '' });
  }
  return out;
}

const SPAN_HOURS: Record<Timespan, number> = { '24h': 24, '3d': 72, '7d': 168 };

/** Keeps UN items in the time window that mention one of the query's words (all of them for the default query). */
export function filterUn(items: NewsArticle[], query: string, timespan: Timespan, now = Date.now()): NewsArticle[] {
  const from = now - SPAN_HOURS[timespan] * 3600_000;
  const words = query === DEFAULT_QUERY ? [] : query.replace(/"/g, '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return items.filter((a) => Date.parse(a.seen) >= from && (!words.length || words.every((w) => a.title.toLowerCase().includes(w))));
}

async function gdelt(query: string, timespan: Timespan): Promise<NewsArticle[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${query} sourcelang:english`)}&mode=ArtList&format=json&maxrecords=100&sort=DateDesc&timespan=${timespan}`;
  const j = await fetchJson<{ articles?: { url: string; title: string; seendate: string; domain: string; language: string; sourcecountry: string }[] } | null>(url, 25_000);
  return (j?.articles ?? [])
    .filter((a) => a.url?.startsWith('http') && a.title)
    .map((a) => ({ url: a.url, title: a.title.trim().slice(0, 300), domain: (a.domain || new URL(a.url).hostname).toLowerCase().replace(/^www\./, ''), seen: gdeltTime(a.seendate), language: a.language, sourceCountry: a.sourcecountry }));
}

/**
 * Merges GDELT, UN News and (when licensed for display) GNews. Duplicate URLs are kept once; story grouping and
 * statuses are the same for every source.
 */
export interface ExtraSource {
  name: string;
  search: () => Promise<NewsArticle[]>;
}

export async function newsSearch(query: string, timespan: Timespan, extra: ExtraSource | ExtraSource[] = []): Promise<NewsResult> {
  const extras = Array.isArray(extra) ? extra : [extra];
  const [g, un, ...xs] = await Promise.allSettled([gdelt(query, timespan), fetchText(UN_NEWS_RSS, 10_000).then(parseUnNews), ...extras.map((e) => e.search())]);
  if (g.status === 'rejected' && un.status === 'rejected' && xs.every((x) => x.status === 'rejected'))
    throw new Error(`GDELT: ${(g.reason as Error).message}; UN News: ${(un.reason as Error).message}`);
  const seen = new Set<string>();
  const articles = [
    ...xs.flatMap((x) => (x.status === 'fulfilled' ? x.value : [])),
    ...(g.status === 'fulfilled' ? g.value : []),
    ...(un.status === 'fulfilled' ? filterUn(un.value, query, timespan) : []),
  ].filter((a) => (seen.has(a.url) ? false : (seen.add(a.url), true)));
  const notes = [g.status === 'rejected' ? 'GDELT did not respond' : '', ...xs.map((x, i) => (x.status === 'rejected' ? `${extras[i]!.name} did not respond` : ''))].filter(Boolean);
  const names = ['GDELT Project (DOC 2.0 API)', 'UN News', ...extras.map((e) => e.name)];
  return {
    query,
    timespan,
    articles: articles.length,
    stories: groupStories(articles).slice(0, 40),
    source: {
      name: names.join(', '),
      url: 'https://www.gdeltproject.org/',
      license: 'Headlines, short provider excerpts and links only; article text and images belong to their publishers',
    },
    fetchedAt: new Date().toISOString(),
    ...(notes.length ? { partial: `${notes.join('; ')}; showing the other sources.` } : {}),
  };
}
