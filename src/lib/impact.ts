import { logReturns } from './technical';

/** Pearson correlation of two equal-length series. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va && vb ? cov / Math.sqrt(va * vb) : NaN;
}

/** Correlation matrix of daily log returns over the trailing `window` observations. */
export function correlationMatrix(closes: number[][], window = 252): number[][] {
  const rets = closes.map((c) => logReturns(c.slice(-(window + 1))));
  return rets.map((a) => rets.map((b) => correlation(a, b)));
}

export interface EventWindow {
  /** Cumulative simple return from the close before the event to `after` sessions later. */
  cumulative: number;
  /** Daily return volatility estimated on the pre-event estimation window. */
  dailyVol: number;
  /** Cumulative return divided by its expected standard deviation under the estimation-window volatility. */
  zScore: number;
  sessions: number;
}

/**
 * Simple event study (constant-mean-zero model): compares the post-event cumulative return with
 * the volatility of an estimation window ending before the event. |z| > 2 is unusual, not causal proof.
 */
export function eventWindow(closes: number[], eventIndex: number, after = 5, estimation = 60): EventWindow | null {
  if (eventIndex < 1 || eventIndex >= closes.length) return null;
  const end = Math.min(closes.length - 1, eventIndex + after);
  const base = closes[eventIndex - 1];
  if (base === undefined) return null;
  const est = logReturns(closes.slice(Math.max(0, eventIndex - 1 - estimation), eventIndex));
  if (est.length < 10) return null; // too little pre-event history to estimate volatility
  const m = est.reduce((s, x) => s + x, 0) / est.length;
  const dailyVol = Math.sqrt(est.reduce((s, x) => s + (x - m) ** 2, 0) / (est.length - 1));
  const sessions = end - eventIndex + 1;
  const cumulative = closes[end]! / base - 1;
  return { cumulative, dailyVol, sessions, zScore: Math.log(1 + cumulative) / (dailyVol * Math.sqrt(sessions)) };
}
