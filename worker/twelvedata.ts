import { RateLimiter } from './ratelimit';

/**
 * Twelve Data market data (server side only; the key never reaches the browser).
 *
 * Public display is OFF until the owner confirms the subscription's display/redistribution rights and sets the
 * Worker variable MARKET_DATA_DISPLAY=licensed. Until then only the instrument search, the integration status and a
 * cached diagnostic (no prices) are public. Candles are always the provider's own bars for the requested interval:
 * intraday bars are never synthesised from daily data.
 */

export interface TwelveDataEnv {
  TWELVE_DATA_API_KEY?: string;
  /** "licensed" once public display rights are confirmed in writing; anything else keeps prices private. */
  MARKET_DATA_DISPLAY?: string;
  /** Upstream requests per minute this Worker may spend (default 8, the free Basic plan). */
  TWELVE_DATA_RPM?: string;
}

const BASE = 'https://api.twelvedata.com';

/** Aurora interval id → Twelve Data interval, and how long a response stays fresh in the edge cache (seconds). */
export const TD_INTERVALS = {
  '1m': { td: '1min', ttl: 60, minutes: 1 },
  '5m': { td: '5min', ttl: 120, minutes: 5 },
  '15m': { td: '15min', ttl: 300, minutes: 15 },
  '1h': { td: '1h', ttl: 600, minutes: 60 },
  '1D': { td: '1day', ttl: 3600, minutes: 1440 },
} as const;
export type TdInterval = keyof typeof TD_INTERVALS;

export const isConfigured = (env: TwelveDataEnv) => !!env.TWELVE_DATA_API_KEY?.trim();
export const displayLicensed = (env: TwelveDataEnv) => env.MARKET_DATA_DISPLAY === 'licensed';

export class TwelveDataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Removes the API key from any text that might leave the Worker (error messages, URLs). */
export function redact(text: string, key: string | undefined): string {
  let out = text.replace(/apikey=[^&\s"']+/gi, 'apikey=[redacted]');
  if (key && key.length >= 6) out = out.split(key).join('[redacted]');
  return out;
}

const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9./:-]{0,23}$/;
const EXCHANGE = /^[A-Za-z0-9]{2,12}$/;
export const validSymbol = (s: string) => SYMBOL.test(s);
export const validExchange = (s: string) => EXCHANGE.test(s);

// One budget per isolate (best effort; the edge cache absorbs most traffic).
let budget: RateLimiter | null = null;
let budgetRpm = 0;
function spend(env: TwelveDataEnv): boolean {
  const rpm = Math.max(1, Math.min(600, Number(env.TWELVE_DATA_RPM) || 8));
  if (!budget || rpm !== budgetRpm) {
    budget = new RateLimiter(rpm, rpm / 60);
    budgetRpm = rpm;
  }
  return budget.allow('twelvedata');
}

async function call<T>(env: TwelveDataEnv, path: string, params: Record<string, string>, timeoutMs = 10_000): Promise<T> {
  const key = env.TWELVE_DATA_API_KEY?.trim();
  if (!key) throw new TwelveDataError('Twelve Data is not configured', 503);
  if (!spend(env)) throw new TwelveDataError('Market data request budget reached; try again in a minute', 503);
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', key);
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new TwelveDataError(redact(`Twelve Data unreachable: ${(e as Error).message}`, key), 502);
  }
  const body = (await res.json().catch(() => null)) as (T & { status?: string; code?: number; message?: string }) | null;
  if (!res.ok || !body || body.status === 'error') {
    const code = body?.code ?? res.status;
    const msg = redact(body?.message ?? `HTTP ${res.status}`, key);
    // 429 = credits exhausted for this minute; 401/403 = key or plan; 400/404 = symbol or interval not available.
    throw new TwelveDataError(`Twelve Data: ${msg}`, code === 429 ? 503 : code === 401 || code === 403 ? 502 : code === 400 || code === 404 ? 404 : 502);
  }
  return body;
}

export type Freshness = 'near-real-time' | 'delayed' | 'end-of-day' | 'historical';

/** "2026-10-22 15:30:00" (requested with timezone=UTC) → epoch milliseconds. */
export function utcDateTime(datetime: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(datetime);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) : NaN;
}

/**
 * Observed freshness of the latest bar. This describes what Aurora received, not a provider guarantee; a closed
 * market also produces "historical" (the last session).
 */
export function freshnessOf(interval: TdInterval, latestUtc: number, now: number): { freshness: Freshness; ageMinutes: number } {
  const ageMinutes = Math.max(0, Math.round((now - latestUtc) / 60_000));
  const step = TD_INTERVALS[interval].minutes;
  if (interval === '1D') return { freshness: ageMinutes <= 4 * 1440 ? 'end-of-day' : 'historical', ageMinutes };
  if (ageMinutes <= 2 * step + 3) return { freshness: 'near-real-time', ageMinutes };
  if (ageMinutes <= 24 * 60) return { freshness: 'delayed', ageMinutes };
  return { freshness: 'historical', ageMinutes };
}

export interface MarketBar {
  /** UTC ISO timestamp (intraday) or YYYY-MM-DD (daily). */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface MarketSeries {
  provider: 'Twelve Data';
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  instrumentType: string | null;
  interval: TdInterval;
  /** The exchange's own time zone (bars are delivered in UTC). */
  exchangeTimeZone: string | null;
  bars: MarketBar[];
  latest: string | null;
  freshness: Freshness | null;
  ageMinutes: number | null;
  /** Set when the data looks inconsistent (e.g. bars stamped in the future); freshness is then not claimed. */
  warning?: string;
  fetchedAt: string;
}

interface TdSeries {
  meta: { symbol: string; interval: string; currency?: string; exchange_timezone?: string; exchange?: string; mic_code?: string; type?: string };
  values: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[];
}

export function normalizeSeries(raw: TdSeries, interval: TdInterval, now: number): MarketSeries {
  const bars: MarketBar[] = [];
  for (const v of [...(raw.values ?? [])].reverse()) {
    const o = Number(v.open), h = Number(v.high), l = Number(v.low), c = Number(v.close);
    if (![o, h, l, c].every(Number.isFinite)) continue;
    const vol = v.volume === undefined ? null : Number(v.volume);
    const t = utcDateTime(v.datetime);
    if (!Number.isFinite(t)) continue;
    const time = interval === '1D' ? v.datetime.slice(0, 10) : new Date(t).toISOString();
    bars.push({ time, open: o, high: h, low: l, close: c, volume: vol !== null && Number.isFinite(vol) ? vol : null });
  }
  const last = bars.at(-1);
  // Daily bars are dated in the exchange's calendar; treat the session as ending at 23:59 UTC of that day.
  const latestUtc = last ? (interval === '1D' ? Date.parse(`${last.time}T23:59:00Z`) : Date.parse(last.time)) : NaN;
  const future = interval !== '1D' && Number.isFinite(latestUtc) && latestUtc > now + 5 * 60_000;
  const f = Number.isFinite(latestUtc) && !future ? freshnessOf(interval, latestUtc, now) : null;
  return {
    provider: 'Twelve Data',
    symbol: raw.meta.symbol,
    name: null,
    exchange: raw.meta.exchange ?? null,
    currency: raw.meta.currency ?? null,
    instrumentType: raw.meta.type ?? null,
    interval,
    exchangeTimeZone: raw.meta.exchange_timezone ?? null,
    bars,
    latest: last?.time ?? null,
    freshness: f?.freshness ?? null,
    ageMinutes: f?.ageMinutes ?? null,
    ...(future ? { warning: 'The latest bar is stamped in the future; freshness cannot be determined.' } : {}),
    fetchedAt: new Date(now).toISOString(),
  };
}

export async function timeSeries(env: TwelveDataEnv, symbol: string, interval: TdInterval, opts: { exchange?: string; outputsize?: number } = {}, now = Date.now()): Promise<MarketSeries> {
  const params: Record<string, string> = { symbol, interval: TD_INTERVALS[interval].td, outputsize: String(Math.min(5000, Math.max(2, opts.outputsize ?? 500))), timezone: 'UTC', order: 'desc' };
  if (opts.exchange) params.exchange = opts.exchange;
  return normalizeSeries(await call<TdSeries>(env, '/time_series', params), interval, now);
}

export interface InstrumentMatch {
  symbol: string;
  name: string;
  exchange: string;
  micCode: string | null;
  country: string | null;
  currency: string | null;
  type: string;
}

export async function symbolSearch(env: TwelveDataEnv, q: string): Promise<InstrumentMatch[]> {
  const r = await call<{ data?: { symbol: string; instrument_name: string; exchange: string; mic_code?: string; country?: string; currency?: string; instrument_type: string }[] }>(env, '/symbol_search', { symbol: q, outputsize: '20' });
  return (r.data ?? []).slice(0, 20).map((d) => ({ symbol: d.symbol, name: d.instrument_name, exchange: d.exchange, micCode: d.mic_code ?? null, country: d.country || null, currency: d.currency ?? null, type: d.instrument_type }));
}

export interface MarketDiagnostics {
  provider: 'Twelve Data';
  plan: string | null;
  creditsUsedToday: number | null;
  dailyLimit: number | null;
  probes: { symbol: string; interval: TdInterval; ok: boolean; latest: string | null; freshness: Freshness | null; ageMinutes: number | null; bars: number; error?: string }[];
  checkedAt: string;
  note: string;
}

/**
 * Probes used by the connection test: with the plan check, 7 requests, inside the free plan's 8 per minute. The
 * result is cached for 6 hours, so the test costs at most about 28 credits a day.
 */
export const PROBES: { symbol: string; interval: TdInterval }[] = [
  { symbol: 'EUR/USD', interval: '1m' },
  { symbol: 'EUR/USD', interval: '5m' },
  { symbol: 'EUR/USD', interval: '15m' },
  { symbol: 'EUR/USD', interval: '1h' },
  { symbol: 'EUR/USD', interval: '1D' },
  { symbol: 'AAPL', interval: '1D' },
];

/** Limited connection test: plan and usage, then the latest bars per probe. No prices are returned. */
export async function diagnostics(env: TwelveDataEnv, now = Date.now()): Promise<MarketDiagnostics> {
  let plan: string | null = null;
  let used: number | null = null;
  let limit: number | null = null;
  try {
    const u = await call<{ current_usage?: number; plan_limit?: number; plan_category?: string; daily_usage?: number; plan_daily_limit?: number }>(env, '/api_usage', {});
    plan = u.plan_category ?? null;
    used = u.daily_usage ?? null;
    limit = u.plan_daily_limit ?? null;
  } catch (e) {
    if (e instanceof TwelveDataError && e.message.includes('not configured')) throw e;
  }
  const probes: MarketDiagnostics['probes'] = [];
  for (const p of PROBES) {
    try {
      const s = await timeSeries(env, p.symbol, p.interval, { outputsize: 3 }, now);
      probes.push({ symbol: p.symbol, interval: p.interval, ok: s.bars.length > 0 && !s.warning, latest: s.latest, freshness: s.freshness, ageMinutes: s.ageMinutes, bars: s.bars.length, ...(s.warning ? { error: s.warning } : {}) });
    } catch (e) {
      probes.push({ symbol: p.symbol, interval: p.interval, ok: false, latest: null, freshness: null, ageMinutes: null, bars: 0, error: (e as Error).message.slice(0, 160) });
    }
  }
  return {
    provider: 'Twelve Data',
    plan,
    creditsUsedToday: used,
    dailyLimit: limit,
    probes,
    checkedAt: new Date(now).toISOString(),
    note: 'Freshness is what Aurora observed for the latest bar (a closed market shows its last session). It is not a provider guarantee.',
  };
}

/** Test hook: start each test with a full request budget. */
export function resetBudgetForTests(): void {
  budget = null;
}
