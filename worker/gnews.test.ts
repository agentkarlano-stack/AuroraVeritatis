import { afterEach, describe, expect, it, vi } from 'vitest';
import { gnewsEnabled, gnewsQuery, gnewsSearch, resetGnewsBudgetForTests } from './gnews';

afterEach(resetGnewsBudgetForTests);
const now = Date.parse('2026-10-25T12:00:00Z');
const ok = () =>
  new Response(
    JSON.stringify({
      articles: [
        { title: ' Talks resume ', url: 'https://www.example.com/a', publishedAt: '2026-10-25T10:00:00Z', source: { name: 'Example', url: 'https://www.example.com' } },
        { title: 'No link', url: 'ftp://x', publishedAt: '2026-10-25T10:00:00Z' },
      ],
    }),
  );

describe('GNews', () => {
  it('stays off until the key is set and display is licensed', async () => {
    const f = vi.fn(async () => ok()) as unknown as typeof fetch;
    expect(gnewsEnabled({ GNEWS_API_KEY: 'k' })).toBe(false);
    expect(await gnewsSearch({ GNEWS_API_KEY: 'k' }, 'x', '24h', f, now)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('maps headlines and links only, with publisher domain and publication time', async () => {
    let called = '';
    const f = vi.fn(async (u: string | URL | Request) => ((called = String(u)), ok())) as unknown as typeof fetch;
    const a = await gnewsSearch({ GNEWS_API_KEY: 'key-123', GNEWS_DISPLAY: 'licensed' }, '(sanctions OR election)', '3d', f, now);
    expect(a).toEqual([{ url: 'https://www.example.com/a', title: 'Talks resume', domain: 'example.com', seen: '2026-10-25T10:00:00.000Z', language: 'English', sourceCountry: '' }]);
    expect(called).toContain('q=sanctions%20OR%20election');
    expect(called).toContain('from=2026-10-22T12:00:00Z');
    expect(gnewsQuery('(a OR b)')).toBe('a OR b');
  });

  it('enforces a daily request budget', async () => {
    const f = vi.fn(async () => ok()) as unknown as typeof fetch;
    const env = { GNEWS_API_KEY: 'k', GNEWS_DISPLAY: 'licensed' };
    for (let i = 0; i < 80; i++) await gnewsSearch(env, 'x', '24h', f, now);
    await expect(gnewsSearch(env, 'x', '24h', f, now)).rejects.toThrow(/budget/);
    // A new day resets it.
    await expect(gnewsSearch(env, 'x', '24h', f, now + 86_400_000)).resolves.toHaveLength(1);
  });
});
