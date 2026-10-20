/**
 * Deterministic pseudo-random utilities.
 *
 * Used ONLY to generate clearly labelled synthetic demonstration series.
 * Nothing produced here represents a real market price or indicator.
 */

/** Mulberry32 — small, fast, deterministic PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit seed (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Standard normal sample via Box–Muller. */
export function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SyntheticSeriesOptions {
  seed: string;
  points: number;
  start: number;
  /** Annualised drift, e.g. 0.05 for 5 %. */
  drift: number;
  /** Annualised volatility, e.g. 0.2 for 20 %. */
  volatility: number;
  /** Trading periods per year used to scale drift/volatility. */
  periodsPerYear?: number;
}

/** Geometric Brownian motion path — synthetic demonstration data only. */
export function syntheticPath(opts: SyntheticSeriesOptions): number[] {
  const { seed, points, start, drift, volatility } = opts;
  const periods = opts.periodsPerYear ?? 252;
  const rand = mulberry32(seedFrom(seed));
  const dt = 1 / periods;
  const out: number[] = [start];
  for (let i = 1; i < points; i++) {
    const shock = gaussian(rand);
    const prev = out[i - 1]!;
    const next = prev * Math.exp((drift - 0.5 * volatility ** 2) * dt + volatility * Math.sqrt(dt) * shock);
    out.push(next);
  }
  return out;
}

export interface Candle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Build synthetic OHLC candles from a seeded path. Demonstration only. */
export function syntheticCandles(opts: SyntheticSeriesOptions & { startTime: number; stepMs: number }): Candle[] {
  const closes = syntheticPath(opts);
  const rand = mulberry32(seedFrom(opts.seed + ":wicks"));
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]!;
    const range = Math.abs(close - open) + close * opts.volatility * 0.01 * (0.5 + rand());
    const high = Math.max(open, close) + range * rand() * 0.6;
    const low = Math.min(open, close) - range * rand() * 0.6;
    return { t: opts.startTime + i * opts.stepMs, open, high, low, close };
  });
}
