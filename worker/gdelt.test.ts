import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUERY, cleanQuery, filterUn, newsSearch, parseUnNews } from './gdelt';

afterEach(() => vi.restoreAllMocks());

describe('GDELT news', () => {
  it('accepts plain words and phrases only', () => {
    expect(cleanQuery(null)).toBe(DEFAULT_QUERY);
    expect(cleanQuery('Hungary')).toBe('Hungary');
    expect(cleanQuery('Red Sea shipping')).toBe('"Red Sea shipping"');
    expect(cleanQuery('a OR (b) sourcecountry:x')).toBeNull();
    expect(cleanQuery('x'.repeat(101))).toBeNull();
    expect(cleanQuery('ab')).toBeNull();
  });
  it('maps articles and groups them into stories', async () => {
    const body = { articles: [
      { url: 'https://www.reuters.com/a', title: 'Quake of magnitude 6 hits Japan coast', seendate: '20261024T100000Z', domain: 'reuters.com', language: 'English', sourcecountry: 'United Kingdom' },
      { url: 'https://bbc.co.uk/b', title: 'Magnitude 6 quake hits coast of Japan', seendate: '20261024T101500Z', domain: 'bbc.co.uk', language: 'English', sourcecountry: 'United Kingdom' },
      { url: 'javascript:alert(1)', title: 'bad', seendate: '20261024T101500Z', domain: 'x', language: 'English', sourcecountry: '' },
    ] };
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => (String(u).includes('gdeltproject') ? new Response(JSON.stringify(body)) : new Response('<rss></rss>')));
    const r = await newsSearch('Japan', '24h');
    expect(String(spy.mock.calls[0]![0])).toMatch(/api\.gdeltproject\.org\/api\/v2\/doc\/doc\?query=Japan%20sourcelang%3Aenglish&mode=ArtList/);
    expect(r.articles).toBe(2);
    expect(r.stories[0]).toMatchObject({ status: 'corroborated', first: '2026-10-24T10:00:00Z' });
    expect(r.source.license).toMatch(/headlines and links only/);
  });
});

const RSS = `<rss><channel><item><title>World News in Brief: Japan earthquake response &amp; aid</title><link>https://news.un.org/feed/view/en/story/1</link>
<guid isPermaLink="true">https://news.un.org/en/story/2026/10/1</guid><pubDate>Fri, 24 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title><![CDATA[Old item about Japan]]></title><guid>https://news.un.org/en/story/2026/09/2</guid><pubDate>Fri, 02 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>No date</title><guid>https://news.un.org/en/story/3</guid></item></channel></rss>`;

describe('UN News', () => {
  it('parses RSS items with links and times', () => {
    const items = parseUnNews(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: 'https://news.un.org/en/story/2026/10/1', title: 'World News in Brief: Japan earthquake response & aid', domain: 'news.un.org', seen: '2026-10-24T08:00:00.000Z' });
  });
  it('filters by time window and query words', () => {
    const items = parseUnNews(RSS);
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(filterUn(items, 'Japan', '24h', now)).toHaveLength(1);
    expect(filterUn(items, 'Japan', '7d', now)).toHaveLength(1);
    expect(filterUn(items, DEFAULT_QUERY, '24h', now)).toHaveLength(1);
    expect(filterUn(items, 'Brazil', '24h', now)).toHaveLength(0);
  });
  it('falls back to UN News when GDELT fails, and says so', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => (String(u).includes('gdeltproject') ? new Response('slow down', { status: 429 }) : new Response(RSS)));
    const r = await newsSearch('Japan', '7d');
    expect(r.partial).toMatch(/GDELT did not respond/);
    expect(r.stories[0]).toMatchObject({ status: 'confirmed', official: ['news.un.org'] });
  });
  it('fails when both sources fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));
    await expect(newsSearch('Japan', '24h')).rejects.toThrow(/GDELT.*UN News/);
  });
});
