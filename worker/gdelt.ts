/**
 * GDELT DOC 2.0 article search (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/). Free, no key; GDELT data
 * may be used for any purpose with attribution. Only headlines, publication times and links are passed on.
 */
import { gdeltTime, groupStories, type NewsArticle, type Story } from '../shared/news';
import { fetchJson } from './http';

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

export async function newsSearch(query: string, timespan: Timespan): Promise<NewsResult> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${query} sourcelang:english`)}&mode=ArtList&format=json&maxrecords=100&sort=DateDesc&timespan=${timespan}`;
  const j = await fetchJson<{ articles?: { url: string; title: string; seendate: string; domain: string; language: string; sourcecountry: string }[] } | null>(url, 10_000);
  const articles: NewsArticle[] = (j?.articles ?? [])
    .filter((a) => a.url?.startsWith('http') && a.title)
    .map((a) => ({ url: a.url, title: a.title.trim().slice(0, 300), domain: (a.domain || new URL(a.url).hostname).toLowerCase().replace(/^www\./, ''), seen: gdeltTime(a.seendate), language: a.language, sourceCountry: a.sourcecountry }));
  return {
    query,
    timespan,
    articles: articles.length,
    stories: groupStories(articles).slice(0, 40),
    source: { name: 'GDELT Project (DOC 2.0 API)', url: 'https://www.gdeltproject.org/', license: 'Free use with attribution; headlines and links only' },
    fetchedAt: new Date().toISOString(),
  };
}
