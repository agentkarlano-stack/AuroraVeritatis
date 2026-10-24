/**
 * POST /api/ai/ask and GET /api/ai/status: Aurora's AI gateway. Every request needs a signed-in user; usage limits and
 * budgets are checked in the database with the user's own token (ai_begin / ai_finish, migration 20261025000000).
 */
import type { CountryProfile, GeoEvent } from '../../shared/types';
import { error, json } from '../http';
import { RateLimiter } from '../ratelimit';
import { buildMessages, checkCitations, numberSources, type Assistant, type GroundSource } from './grounding';
import { configured, estimateCents, providerOrder, route, type AiEnv } from './providers';

export interface AiGatewayEnv extends AiEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface AiDeps {
  countryProfile: (iso3: string) => Promise<CountryProfile | null>;
  events: () => Promise<GeoEvent[]>;
  fetchImpl?: typeof fetch;
}

const aiLimiter = new RateLimiter(6, 1 / 10); // per IP: a burst of 6, then one request every 10 s
const MAX_TOKENS = 700;
const TIMEOUT_MS = 25_000;

export interface AskBody {
  assistant: Assistant;
  question: string;
  country?: string;
  includeEvents?: boolean;
  notes?: { title: string; text: string }[];
}

/** Validates the request body; returns a message for the user when it is not acceptable. */
export function parseAsk(raw: unknown): AskBody | string {
  if (!raw || typeof raw !== 'object') return 'Invalid request.';
  const b = raw as Record<string, unknown>;
  const assistant = b.assistant === 'knox' ? 'knox' : b.assistant === 'eve' ? 'eve' : null;
  if (!assistant) return 'Choose EVE or KNOX.';
  const question = typeof b.question === 'string' ? b.question.trim() : '';
  if (question.length < 3 || question.length > 1000) return 'Ask a question of 3 to 1,000 characters.';
  const country = typeof b.country === 'string' && /^[A-Z]{3}$/.test(b.country) ? b.country : undefined;
  const notes = Array.isArray(b.notes)
    ? b.notes
        .filter((n): n is { title: string; text: string } => !!n && typeof (n as { title?: unknown }).title === 'string' && typeof (n as { text?: unknown }).text === 'string')
        .slice(0, 8)
        .map((n) => ({ title: n.title.slice(0, 120), text: n.text.slice(0, 1200) }))
    : [];
  return { assistant, question, country, includeEvents: b.includeEvents === true, notes };
}

const fmt = (v: number, unit: string) =>
  unit === 'percent' ? `${v.toFixed(1)}%` : unit === 'usd' ? `US$${Math.round(v).toLocaleString('en-US')}` : Math.round(v).toLocaleString('en-US');

/** Sources from Aurora's own data for this request. */
export async function gatherSources(body: AskBody, deps: AiDeps): Promise<GroundSource[]> {
  const list: Omit<GroundSource, 'id'>[] = [];
  if (body.country) {
    const p = await deps.countryProfile(body.country).catch(() => null);
    if (p) {
      const lines = Object.values(p.indicators)
        .filter((i) => i.value !== null)
        .map((i) => `${i.label}: ${fmt(i.value!, i.unit)} (${i.date})`);
      list.push({
        title: `${p.name}: World Development Indicators`,
        publisher: 'World Bank',
        url: `https://data.worldbank.org/country/${p.iso3}`,
        date: p.fetchedAt.slice(0, 10),
        provenance: 'confirmed',
        text: [`Region: ${p.region ?? 'n/a'}. Income level: ${p.incomeLevel ?? 'n/a'}. Capital: ${p.capital ?? 'n/a'}.`, ...lines].join('\n').slice(0, 2500),
      });
    }
  }
  if (body.includeEvents) {
    const ev = await deps.events().catch(() => []);
    for (const e of ev.sort((a, b) => b.severity - a.severity || b.time.localeCompare(a.time)).slice(0, 6)) {
      list.push({
        title: e.title,
        publisher: e.source.name,
        url: e.source.url.startsWith('http') ? e.source.url : undefined,
        date: e.time.slice(0, 16).replace('T', ' ') + ' UTC',
        provenance: e.provenance === 'confirmed' ? 'confirmed' : 'estimate',
        text: `${e.summary} Severity ${e.severity}/5. Region: ${e.region}.`.slice(0, 600),
      });
    }
  }
  for (const n of body.notes ?? []) list.push({ title: `Your note: ${n.title}`, publisher: 'User-provided note', provenance: 'unverified', text: n.text });
  return numberSources(list);
}

async function rpc(env: AiGatewayEnv, token: string, fn: string, args: unknown, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
}

export function aiStatus(env: AiGatewayEnv): Response {
  const c = configured(env);
  return json({ providers: c, order: providerOrder(env), accounts: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY) });
}

export async function aiAsk(request: Request, env: AiGatewayEnv, deps: AiDeps): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!aiLimiter.allow(ip)) return error(429, 'Too many AI requests. Please wait a few seconds.');
  if (!providerOrder(env).length) return error(503, 'AI is not configured yet.');
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return error(503, 'Accounts are not configured.');
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
  if (!token) return error(401, 'Sign in to use the AI assistants.');
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > 32_000) return error(413, 'Request too large.');
  const body = parseAsk(await request.json().catch(() => null));
  if (typeof body === 'string') return error(400, body);

  const sources = await gatherSources(body, deps);
  const messages = buildMessages(body.assistant, body.question, sources);
  const est = estimateCents(env, messages, MAX_TOKENS);

  const begin = await rpc(env, token, 'ai_begin', { feature: body.assistant, est_cents: +est.toFixed(4) }, fetchImpl).catch(() => null);
  if (!begin) return error(503, 'Usage controls are unreachable. Please try again.');
  if (begin.status === 404) return error(503, 'AI usage controls are not installed yet (pending database update).');
  if (begin.status === 401 || begin.status === 403) return error(401, 'Your session has expired. Please sign in again.');
  if (!begin.ok) return error(503, 'Usage controls are unavailable.');
  const gate = (await begin.json()) as { allowed: boolean; reason?: string; request_id?: string; used_today?: number; limit_today?: number };
  if (!gate.allowed || !gate.request_id) return json({ error: `Not available: ${gate.reason ?? 'limit reached'}.`, reason: gate.reason, limit_today: gate.limit_today }, { status: 429 });

  try {
    const { result, failures } = await route(env, messages, { maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS, fetchImpl });
    const checked = checkCitations(result.text, sources);
    await rpc(env, token, 'ai_finish', { request: gate.request_id, ok: true, prov: result.provider, mdl: result.model, t_in: result.tokensIn, t_out: result.tokensOut, cents: +result.costCents.toFixed(4) }, fetchImpl).catch(() => null);
    return json({
      answer: checked.text,
      assistant: body.assistant,
      sources,
      cited: checked.cited,
      removedCitations: checked.removed,
      provider: result.provider,
      model: result.model,
      fallback: failures.length > 0,
      usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut, usedToday: gate.used_today, limitToday: gate.limit_today },
      notice: 'AI-generated from the listed sources. It may contain errors; check the sources before relying on it.',
    });
  } catch (e) {
    await rpc(env, token, 'ai_finish', { request: gate.request_id, ok: false, prov: '', mdl: '', t_in: 0, t_out: 0, cents: 0 }, fetchImpl).catch(() => null);
    console.warn('AI providers failed', (e as { failures?: string[] }).failures ?? []);
    return error(502, 'The AI providers did not answer. Nothing was charged to your allowance; please try again later.');
  }
}
