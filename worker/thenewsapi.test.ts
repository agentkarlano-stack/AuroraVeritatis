import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeTheNewsApi, RADAR_TOPICS, resetTheNewsApiBudgetForTests, theNewsApiProbe, theNewsApiQuery, theNewsApiSearch } from './thenewsapi';

const KEY = 'tna-secret-key-123456';
const now = Date.parse('2026-10-31T12:00:00Z');
const article = (o: Record<string, unknown> = {}) => ({
  uuid: 'u1',
  title: 'Ceasefire talks resume in Doha',
  description: '<p>Negotiators met on Friday.</p>',
  url: 'https://www.reuters.com/world/x',
  image_url: 'https://img.example/x.jpg',
  source: 'reuters.com',
  published_at: '2026-10-31T09:30:00.000000Z',
  language: 'en',
  locale: 'us',
  ...o,
});

describe('The News API adapter', () => {
  beforeEach(() => resetTheNewsApiBudgetForTests());

  it('calls /v1/news/all with Basic-plan parameters and never the headlines endpoint', async () => {
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      return Response.json({ meta: { found: 1, returned: 1 }, data: [article()] });
    }) as unknown as typeof fetch;
    const r = await theNewsApiSearch({ THE_NEWS_API_KEY: KEY }, 'DEFAULT', '24h', 'DEFAULT', f, now);
    const u = new URL(urls[0]!);
    expect(u.pathname).toBe('/v1/news/all');
    expect(urls.some((x) => x.includes('/headlines'))).toBe(false);
    expect(u.searchParams.get('search')).toBe(RADAR_TOPICS);
    expect(u.searchParams.get('limit')).toBe('25');
    expect(u.searchParams.get('published_after')).toBe('2026-10-30T12:00:00');
    expect(r).toEqual([
      {
        url: 'https://www.reuters.com/world/x',
        title: 'Ceasefire talks resume in Doha',
        domain: 'reuters.com',
        seen: '2026-10-31T09:30:00.000Z',
        language: 'English',
        sourceCountry: 'US',
        summary: 'Negotiators met on Friday.',
        provider: 'thenewsapi',
        providerId: 'u1',
      },
    ]);
    // The image URL is a candidate only and is not passed on.
    expect(JSON.stringify(r)).not.toContain('img.example');
  });

  it('translates OR syntax and strips parentheses', () => {
    expect(theNewsApiQuery('(sanctions OR election)', 'D')).toBe('sanctions | election');
  });

  it('drops records without a safe link, title or valid time', () => {
    expect(normalizeTheNewsApi([article({ url: 'javascript:alert(1)' }), article({ title: '' }), article({ published_at: 'never' })])).toEqual([]);
  });

  it('never puts the key in an error message', async () => {
    const f = (async () => Response.json({ error: { code: 'invalid_api_token' } }, { status: 401 })) as unknown as typeof fetch;
    const p = await theNewsApiProbe({ THE_NEWS_API_KEY: KEY }, f, now);
    expect(p).toEqual({ ok: false, status: 401, error: 'The News API answered 401 (invalid_api_token)' });
    expect(JSON.stringify(p)).not.toContain(KEY);
    const missing = await theNewsApiProbe({}, f, now);
    expect(missing.ok).toBe(false);
  });

  it('stops at the per-server daily budget and resets the next day', async () => {
    const f = (async () => Response.json({ data: [] })) as unknown as typeof fetch;
    for (let i = 0; i < 150; i++) await theNewsApiSearch({ THE_NEWS_API_KEY: KEY }, 'x', '24h', 'D', f, now);
    await expect(theNewsApiSearch({ THE_NEWS_API_KEY: KEY }, 'x', '24h', 'D', f, now)).rejects.toThrow(/budget/);
    await expect(theNewsApiSearch({ THE_NEWS_API_KEY: KEY }, 'x', '24h', 'D', f, now + 86_400_000)).resolves.toEqual([]);
  });
});
