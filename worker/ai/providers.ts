/**
 * AI providers behind Aurora's own assistants (EVE, KNOX). Provider-independent: each provider turns chat messages into
 * text and reports token usage. Keys and bindings stay in the Worker; nothing here is sent to the browser.
 */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletion {
  text: string;
  provider: ProviderId;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Estimated cost in euro cents from the price table below (list prices, converted at ~0.92 EUR/USD). */
  costCents: number;
}

export interface WorkersAiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

export interface AiEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  /** Cloudflare Workers AI binding (wrangler.jsonc "ai"). */
  AI?: WorkersAiBinding;
  WORKERS_AI_MODEL?: string;
  /** Provider order, comma separated (default "openai,workers-ai"). */
  AI_PROVIDERS?: string;
}

export type ProviderId = 'openai' | 'workers-ai';

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: 'gpt-4o-mini',
  'workers-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

/** USD per million tokens (input, output). Unknown models use the most expensive known price so budgets stay safe. */
const PRICES_USD: Record<string, [number, number]> = {
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1': [2, 8],
  'gpt-4o': [2.5, 10],
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': [0.29, 2.25],
  '@cf/meta/llama-3.1-8b-instruct': [0.28, 0.83],
};
const FALLBACK_PRICE: [number, number] = [2.5, 10];
const EUR_PER_USD = 0.92;

export function costCents(model: string, tokensIn: number, tokensOut: number): number {
  const [pin, pout] = PRICES_USD[model] ?? FALLBACK_PRICE;
  return ((tokensIn * pin + tokensOut * pout) / 1e6) * EUR_PER_USD * 100;
}

export const modelOf = (env: AiEnv, id: ProviderId) => (id === 'openai' ? env.OPENAI_MODEL : env.WORKERS_AI_MODEL) || DEFAULT_MODELS[id];

export function configured(env: AiEnv): Record<ProviderId, boolean> {
  return { openai: !!env.OPENAI_API_KEY, 'workers-ai': !!env.AI };
}

/** Configured providers in the configured order. */
export function providerOrder(env: AiEnv): ProviderId[] {
  const wanted = (env.AI_PROVIDERS || 'openai,workers-ai')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ProviderId => s === 'openai' || s === 'workers-ai');
  const ok = configured(env);
  return [...new Set(wanted)].filter((p) => ok[p]);
}

export interface CallOptions {
  maxTokens: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export async function callProvider(env: AiEnv, id: ProviderId, messages: AiMessage[], o: CallOptions): Promise<AiCompletion> {
  const model = modelOf(env, id);
  if (id === 'openai') {
    const res = await (o.fetchImpl ?? fetch)('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: o.maxTokens, temperature: 0.2 }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    if (!res.ok) throw new Error(`openai responded ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('openai returned no text');
    const tokensIn = j.usage?.prompt_tokens ?? 0;
    const tokensOut = j.usage?.completion_tokens ?? 0;
    return { text, provider: id, model, tokensIn, tokensOut, costCents: costCents(model, tokensIn, tokensOut) };
  }
  if (!env.AI) throw new Error('workers-ai binding missing');
  const run = env.AI.run(model, { messages, max_tokens: o.maxTokens, temperature: 0.2 });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('workers-ai timed out')), o.timeoutMs));
  const j = (await Promise.race([run, timeout])) as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = typeof j?.response === 'string' ? j.response.trim() : '';
  if (!text) throw new Error('workers-ai returned no text');
  const chars = messages.reduce((s, m) => s + m.content.length, 0);
  const tokensIn = j.usage?.prompt_tokens ?? Math.ceil(chars / 4);
  const tokensOut = j.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  return { text, provider: id, model, tokensIn, tokensOut, costCents: costCents(model, tokensIn, tokensOut) };
}

/**
 * Tries each configured provider in order and returns the first answer. Errors are collected without any key or
 * request content, so they can be logged and reported safely.
 */
export async function route(env: AiEnv, messages: AiMessage[], o: CallOptions): Promise<{ result: AiCompletion; failures: string[] }> {
  const failures: string[] = [];
  for (const id of providerOrder(env)) {
    try {
      return { result: await callProvider(env, id, messages, o), failures };
    } catch (e) {
      failures.push(`${id}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  throw Object.assign(new Error('All AI providers failed'), { failures });
}

/** Reservation estimate: the most expensive configured provider, for the prompt plus the maximum answer length. */
export function estimateCents(env: AiEnv, messages: AiMessage[], maxTokens: number): number {
  const tokensIn = Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
  const costs = providerOrder(env).map((p) => costCents(modelOf(env, p), tokensIn, maxTokens));
  return Math.max(0.01, ...costs);
}
