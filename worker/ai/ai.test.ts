import { describe, expect, it, vi } from 'vitest';
import type { CountryProfile } from '../../shared/types';
import { buildMessages, checkCitations, numberSources } from './grounding';
import { aiAsk, gatherSources, parseAsk } from './handler';
import { costCents, estimateCents, providerOrder, route } from './providers';

const okOpenAi = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: 'GDP grew [S1]. Unknown claim [S9].' } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } }), { status: 200 });

describe('providers', () => {
  it('orders configured providers and skips unconfigured ones', () => {
    expect(providerOrder({})).toEqual([]);
    expect(providerOrder({ OPENAI_API_KEY: 'k' })).toEqual(['openai']);
    expect(providerOrder({ OPENAI_API_KEY: 'k', AI: { run: async () => ({}) }, AI_PROVIDERS: 'workers-ai,openai' })).toEqual(['workers-ai', 'openai']);
  });
  it('prices known models and falls back to the most expensive price for unknown ones', () => {
    expect(costCents('gpt-4o-mini', 1e6, 0)).toBeCloseTo(0.15 * 0.92 * 100);
    expect(costCents('mystery', 1e6, 0)).toBeCloseTo(2.5 * 0.92 * 100);
    expect(estimateCents({ OPENAI_API_KEY: 'k' }, [{ role: 'user', content: 'x'.repeat(4000) }], 500)).toBeGreaterThan(0);
  });
  it('falls back to Workers AI when OpenAI fails, without leaking the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('busy', { status: 503 }));
    const env = { OPENAI_API_KEY: 'sk-secret', AI: { run: async () => ({ response: 'Answer [S1]', usage: { prompt_tokens: 10, completion_tokens: 5 } }) } };
    const { result, failures } = await route(env, [{ role: 'user', content: 'q' }], { maxTokens: 50, timeoutMs: 1000, fetchImpl });
    expect(result.provider).toBe('workers-ai');
    expect(failures[0]).toMatch(/^openai: openai responded 503/);
    expect(JSON.stringify(failures)).not.toContain('sk-secret');
  });
  it('reports a combined failure when every provider fails', async () => {
    const env = { AI: { run: async () => ({ response: '' }) } };
    await expect(route(env, [{ role: 'user', content: 'q' }], { maxTokens: 50, timeoutMs: 1000 })).rejects.toThrow('All AI providers failed');
  });
});

describe('grounding', () => {
  const sources = numberSources([
    { title: 'A', publisher: 'World Bank', provenance: 'confirmed', text: 'GDP' },
    { title: 'B', publisher: 'USGS', provenance: 'confirmed', text: 'Quake' },
  ]);
  it('keeps only citations to provided sources', () => {
    const r = checkCitations('Fact [S1]. Other [S2, S7]. Invented [S9].', sources);
    expect(r.text).toBe('Fact [S1]. Other [S2]. Invented.');
    expect(r.cited).toEqual(['S1', 'S2']);
    expect(r.removed).toBe(2);
  });
  it('puts the rules in the system message and the sources in the user message', () => {
    const m = buildMessages('knox', 'Q?', sources);
    expect(m[0]!.content).toMatch(/KNOX/);
    expect(m[0]!.content).toMatch(/Never invent sources/);
    expect(m[1]!.content).toMatch(/\[S2\] B \| USGS/);
  });
});

describe('request handling', () => {
  it('validates the body', () => {
    expect(parseAsk({ assistant: 'x', question: 'hello' })).toBe('Choose EVE or KNOX.');
    expect(parseAsk({ assistant: 'eve', question: 'hi' })).toMatch(/3 to 1,000/);
    const ok = parseAsk({ assistant: 'eve', question: 'What changed?', country: 'HUN', includeEvents: true, notes: [{ title: 't', text: 'x'.repeat(5000) }, { bad: 1 }] });
    expect(ok).toMatchObject({ assistant: 'eve', country: 'HUN', includeEvents: true });
    expect(typeof ok !== 'string' && ok.notes![0]!.text.length).toBe(1200);
    expect(typeof ok !== 'string' && ok.notes!.length).toBe(1);
  });
  const profile: CountryProfile = {
    iso3: 'HUN', name: 'Hungary', region: 'Europe & Central Asia', incomeLevel: 'High income', capital: 'Budapest', fetchedAt: '2026-10-24T00:00:00Z',
    source: { name: 'World Bank', url: 'https://data.worldbank.org', license: 'CC BY 4.0' },
    indicators: { 'NY.GDP.MKTP.CD': { id: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)', unit: 'usd', value: 2.1e11, date: '2024' } },
  };
  const deps = { countryProfile: async () => profile, events: async () => [] };
  it('gathers official data and labels user notes as unverified', async () => {
    const s = await gatherSources({ assistant: 'eve', question: 'q', country: 'HUN', notes: [{ title: 'Idea', text: 'Maybe' }] }, deps);
    expect(s.map((x) => x.id)).toEqual(['S1', 'S2']);
    expect(s[0]!.text).toMatch(/GDP \(current US\$\): US\$210,000,000,000 \(2024\)/);
    expect(s[1]).toMatchObject({ provenance: 'unverified', publisher: 'User-provided note' });
  });

  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', OPENAI_API_KEY: 'sk' };
  const req = (body: unknown, token = 'eyJ'.padEnd(40, 'a')) =>
    new Request('https://aurorav.app/api/ai/ask', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': `ip-${Math.random()}` }, body: JSON.stringify(body) });

  it('reserves, answers with checked citations and completes the reservation', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u.split('/').pop()!);
      if (u.endsWith('/ai_begin')) return new Response(JSON.stringify({ allowed: true, request_id: 'r1', used_today: 1, limit_today: 5 }));
      if (u.endsWith('/ai_finish')) {
        expect(JSON.parse(String(init!.body))).toMatchObject({ request: 'r1', ok: true, prov: 'openai' });
        return new Response('{}');
      }
      return okOpenAi();
    }) as unknown as typeof fetch;
    const res = await aiAsk(req({ assistant: 'eve', question: 'How large is the economy?', country: 'HUN' }), env, { ...deps, fetchImpl });
    const j = (await res.json()) as { answer: string; cited: string[]; removedCitations: number; notice: string };
    expect(res.status).toBe(200);
    expect(j.answer).toBe('GDP grew [S1]. Unknown claim.');
    expect(j.cited).toEqual(['S1']);
    expect(j.removedCitations).toBe(1);
    expect(j.notice).toMatch(/AI-generated/);
    expect(calls).toEqual(['ai_begin', 'completions', 'ai_finish']);
  });
  it('refuses without sign-in, when limits are reached, and when the database update is missing', async () => {
    expect((await aiAsk(req({ assistant: 'eve', question: 'Hello there' }, ''), env, deps)).status).toBe(401);
    const limited = vi.fn(async () => new Response(JSON.stringify({ allowed: false, reason: 'daily allowance used', limit_today: 5 }))) as unknown as typeof fetch;
    const r1 = await aiAsk(req({ assistant: 'eve', question: 'Hello there' }), env, { ...deps, fetchImpl: limited });
    expect(r1.status).toBe(429);
    expect(((await r1.json()) as { error: string }).error).toMatch(/daily allowance used/);
    const missing = vi.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    expect((await aiAsk(req({ assistant: 'eve', question: 'Hello there' }), env, { ...deps, fetchImpl: missing })).status).toBe(503);
    expect((await aiAsk(req({ assistant: 'eve', question: 'Hello there' }), { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'y' }, deps)).status).toBe(503);
  });
  it('releases the reservation when every provider fails', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/ai_begin')) return new Response(JSON.stringify({ allowed: true, request_id: 'r2' }));
      if (u.endsWith('/ai_finish')) return bodies.push(JSON.parse(String(init!.body))), new Response('{}');
      return new Response('down', { status: 500 });
    }) as unknown as typeof fetch;
    const res = await aiAsk(req({ assistant: 'knox', question: 'Explain value at risk' }), env, { ...deps, fetchImpl });
    expect(res.status).toBe(502);
    expect(bodies[0]).toMatchObject({ request: 'r2', ok: false });
  });
});
