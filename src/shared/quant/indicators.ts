/**
 * Technical and statistical indicators.
 *
 * All functions are pure and return arrays aligned to the input
 * (leading positions that cannot be computed are `null`).
 */

export type Series = readonly number[];
export type Aligned = (number | null)[];

/** Simple moving average. */
export function sma(values: Series, period: number): Aligned {
  assertPeriod(period);
  const out: Aligned = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` values. */
export function ema(values: Series, period: number): Aligned {
  assertPeriod(period);
  const out: Aligned = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Relative Strength Index (Wilder smoothing). */
export function rsi(values: Series, period = 14): Aligned {
  assertPeriod(period);
  const out: Aligned = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = toRsi(gain, loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = toRsi(gain, loss);
  }
  return out;
}

function toRsi(gain: number, loss: number): number {
  if (loss === 0) return gain === 0 ? 50 : 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: Aligned;
  signal: Aligned;
  histogram: Aligned;
}

/** MACD (fast EMA − slow EMA) with signal line. */
export function macd(values: Series, fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Aligned = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const firstIdx = line.findIndex((v) => v != null);
  const signal: Aligned = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[];
    const sig = ema(compact, signalPeriod);
    sig.forEach((v, j) => (signal[firstIdx + j] = v));
  }
  const histogram: Aligned = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i]! : null));
  return { macd: line, signal, histogram };
}

/** Simple period-over-period returns. Length is `values.length - 1`. */
export function returns(values: Series): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(values[i]! / values[i - 1]! - 1);
  return out;
}

export function mean(values: Series): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sample standard deviation (n − 1). */
export function stdev(values: Series): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

/** Maximum peak-to-trough decline of an equity curve, as a positive fraction. */
export function maxDrawdown(equity: Series): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > worst) worst = dd;
  }
  return worst;
}

/** Pearson correlation of two equal-length series. */
export function correlation(a: Series, b: Series): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? NaN : num / Math.sqrt(da * db);
}

/** Rolling sample volatility of returns, annualised. */
export function rollingVolatility(values: Series, window: number, periodsPerYear = 252): Aligned {
  assertPeriod(window);
  const r = returns(values);
  const out: Aligned = new Array(values.length).fill(null);
  for (let i = window; i <= r.length; i++) {
    out[i] = stdev(r.slice(i - window, i)) * Math.sqrt(periodsPerYear);
  }
  return out;
}

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) throw new RangeError(`Invalid period: ${period}`);
}
