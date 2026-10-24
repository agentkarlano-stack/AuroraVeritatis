import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUERY, cleanQuery, newsSearch } from './gdelt';

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
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));
    const r = await newsSearch('Japan', '24h');
    expect(String(spy.mock.calls[0]![0])).toMatch(/api\.gdeltproject\.org\/api\/v2\/doc\/doc\?query=Japan%20sourcelang%3Aenglish&mode=ArtList/);
    expect(r.articles).toBe(2);
    expect(r.stories[0]).toMatchObject({ status: 'corroborated', first: '2026-10-24T10:00:00Z' });
    expect(r.source.license).toMatch(/headlines and links only/);
  });
});
