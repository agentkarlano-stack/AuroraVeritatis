/**
 * POST /api/ai/ask and GET /api/ai/status: Aurora's AI gateway. Every request needs a signed-in user; usage limits and
 * budgets are checked in the database with the user's own token (ai_begin / ai_finish, migration 20261025000000).
 */
import type { CountryProfile, GeoEvent } from '../../shared/types';
import { error, json } from '../http';
import { RateLimiter } from '../ratelimit';
import { buildMessages, checkCitations, numberSources, type Assistant, type GroundSource } from './grounding';
import { configured, estimateCents, modelOf, providerOrder, route, type AiEnv } from './providers';

export interface AiGatewayEnv extends AiEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface AiDeps {
  countryProfile: (iso3: string) => Promise<CountryProfile | null>;
  events: () => Promise<GeoEvent[]>;
  fetchImpl?: typeof fetch;
  /** Answer cache (the Workers Cache API in production). Answers that include the user's own notes are never cached. */
  cache?: AnswerCache;
}

export interface AnswerCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const aiLimiter = new RateLimiter(6, 1 / 10); // per IP: a burst of 6, then one request every 10 s
const MAX_TOKENS = 500;
/** Shorter answers once the monthly budget is 80 % used. */
const MAX_TOKENS_RESTRICTED = 300;
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

/**
 * GET /api/ai/models (administrators only): is the OpenAI key present and accepted, and which chat models does the
 * account offer? Uses OpenAI's free model list (no tokens, no cost). Never returns the key.
 */
export async function aiModels(request: Request, env: AiGatewayEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return error(401, 'Administrators only.');
  // admin_audit_log is refused for everyone except administrators (2026-10-23 migration).
  const adm = await rpc(env, token, 'admin_audit_log', { lim: 1 }, fetchImpl).catch(() => null);
  if (!adm?.ok) return error(403, 'Administrators only.');
  if (!env.OPENAI_API_KEY) return json({ key: 'missing', models: [], configured: modelOf(env, 'openai') });
  const res = await fetchImpl('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res) return json({ key: 'present', reachable: false, models: [], configured: modelOf(env, 'openai') });
  if (!res.ok) return json({ key: res.status === 401 ? 'rejected' : 'present', reachable: true, status: res.status, models: [], configured: modelOf(env, 'openai') });
  const ids = (((await res.json().catch(() => null)) as { data?: { id?: string }[] } | null)?.data ?? [])
    .map((m) => m.id ?? '')
    .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
    .sort();
  const configuredModel = modelOf(env, 'openai');
  return json({ key: 'accepted', reachable: true, models: ids, configured: configuredModel, configuredAvailable: ids.includes(configuredModel) });
}

export function aiStatus(env: AiGatewayEnv): Response {
  const c = configured(env);
  return json({ providers: c, order: providerOrder(env), accounts: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY) });
}

/** Cache key: the same assistant, question and source texts give the same answer (SHA-256, nothing readable). */
export async function answerKey(body: AskBody, sources: GroundSource[]): Promise<string> {
  const material = JSON.stringify([body.assistant, body.question.toLowerCase().replace(/\s+/g, ' ').trim(), sources.map((x) => [x.title, x.text])]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Identical questions arriving while one is being answered share that answer instead of a second provider call. */
const inFlight = new Map<string, Promise<Response>>();

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
  const cacheable = !body.notes?.length;
  const key = cacheable ? await answerKey(body, sources) : null;
  if (key && deps.cache) {
    const hit = await deps.cache.get(key).catch(() => null);
    if (hit) {
      // A cached answer costs nothing, but still needs a signed-in user and AI switched on.
      const u = await rpc(env, token, 'my_ai_usage', {}, fetchImpl).catch(() => null);
      const usage = u?.ok ? ((await u.json().catch(() => null)) as { enabled?: boolean } | null) : null;
      if (u?.status === 401 || u?.status === 403) return error(401, 'Your session has expired. Please sign in again.');
      if (usage?.enabled) return json({ ...(JSON.parse(hit) as object), cached: true });
    }
  }
  if (key) {
    const pending = inFlight.get(key);
    // Only a successful answer is shared; a refusal (for example another user's daily limit) is not.
    const shared = pending ? await pending.catch(() => null) : null;
    if (shared?.ok) return shared.clone();
  }
  const run = answer(env, deps, token, body, sources, key, fetchImpl);
  if (key) {
    inFlight.set(key, run);
    run.finally(() => inFlight.delete(key)).catch(() => {});
  }
  return (await run).clone();
}

async function answer(env: AiGatewayEnv, deps: AiDeps, token: string, body: AskBody, sources: GroundSource[], key: string | null, fetchImpl: typeof fetch): Promise<Response> {
  const messages = buildMessages(body.assistant, body.question, sources);
  const est = estimateCents(env, messages, MAX_TOKENS);

  const begin = await rpc(env, token, 'ai_begin', { feature: body.assistant, est_cents: +est.toFixed(4) }, fetchImpl).catch(() => null);
  if (!begin) return error(503, 'Usage controls are unreachable. Please try again.');
  if (begin.status === 404) return error(503, 'AI usage controls are not installed yet (pending database update).');
  if (begin.status === 401 || begin.status === 403) return error(401, 'Your session has expired. Please sign in again.');
  if (!begin.ok) return error(503, 'Usage controls are unavailable.');
  const gate = (await begin.json()) as { allowed: boolean; reason?: string; request_id?: string; used_today?: number; limit_today?: number; level?: string };
  if (!gate.allowed || !gate.request_id) return json({ error: `Not available: ${gate.reason ?? 'limit reached'}.`, reason: gate.reason, limit_today: gate.limit_today }, { status: 429 });

  try {
    // From 80 % of the monthly budget: free Workers AI first and shorter answers.
    const restricted = gate.level === 'restricted';
    if (gate.level && gate.level !== 'normal') console.warn('AI budget level', gate.level);
    const { result, failures } = await route(env, messages, {
      maxTokens: restricted ? MAX_TOKENS_RESTRICTED : MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
      fetchImpl,
      preferFree: restricted,
    });
    const checked = checkCitations(result.text, sources);
    await rpc(env, token, 'ai_finish', { request: gate.request_id, ok: true, prov: result.provider, mdl: result.model, t_in: result.tokensIn, t_out: result.tokensOut, cents: +result.costCents.toFixed(4) }, fetchImpl).catch(() => null);
    const payload = {
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
    };
    if (key && deps.cache) await deps.cache.put(key, JSON.stringify({ ...payload, usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut } })).catch(() => {});
    return json(payload);
  } catch (e) {
    await rpc(env, token, 'ai_finish', { request: gate.request_id, ok: false, prov: '', mdl: '', t_in: 0, t_out: 0, cents: 0 }, fetchImpl).catch(() => null);
    console.warn('AI providers failed', (e as { failures?: string[] }).failures ?? []);
    return error(502, 'The AI providers did not answer. Nothing was charged to your allowance; please try again later.');
  }
}
