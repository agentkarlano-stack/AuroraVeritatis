import { rsi, sma } from './technical';

export type StrategySpec =
  | { kind: 'hold' }
  | { kind: 'sma'; fast: number; slow: number }
  | { kind: 'rsi'; period: number; lower: number; upper: number };

/**
 * Long-only target positions (0 or 1). positions[t] is decided at the close of day t using data up to and
 * including t, and is held over the return from t to t+1 — so no future information is used.
 */
export function positions(closes: number[], spec: StrategySpec): number[] {
  const n = closes.length;
  if (spec.kind === 'hold') return new Array<number>(n).fill(1);
  if (spec.kind === 'sma') {
    const f = sma(closes, spec.fast);
    const s = sma(closes, spec.slow);
    return closes.map((_, t) => (f[t] != null && s[t] != null && f[t]! > s[t]! ? 1 : 0));
  }
  const r = rsi(closes, spec.period);
  const out: number[] = [];
  let pos = 0;
  for (let t = 0; t < n; t++) {
    const v = r[t];
    if (v != null) {
      if (pos === 0 && v < spec.lower) pos = 1;
      else if (pos === 1 && v > spec.upper) pos = 0;
    }
    out.push(pos);
  }
  return out;
}

export interface BacktestStats {
  totalReturn: number;
  cagr: number;
  vol: number;
  /** Annualised mean / volatility of daily returns, risk-free rate 0. */
  sharpe: number;
  maxDrawdown: number;
  trades: number;
  /** Share of days invested. */
  exposure: number;
}

export interface BacktestResult {
  equity: number[];
  benchmark: number[];
  strategy: BacktestStats;
  buyHold: BacktestStats;
}

function stats(equity: number[], dailyReturns: number[], trades: number, exposure: number, periodsPerYear: number): BacktestStats {
  const n = dailyReturns.length;
  const total = equity.at(-1)! / equity[0]! - 1;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  let peak = -Infinity;
  let mdd = 0;
  for (const v of equity) {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return {
    totalReturn: total,
    cagr: n ? (1 + total) ** (periodsPerYear / n) - 1 : 0,
    vol: sd * Math.sqrt(periodsPerYear),
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(periodsPerYear) : 0,
    maxDrawdown: mdd,
    trades,
    exposure,
  };
}

/**
 * Daily backtest with proportional transaction costs charged on every position change.
 * Equity starts at 1; the benchmark is buy-and-hold without costs.
 */
export function backtest(closes: number[], spec: StrategySpec, costBps = 5, periodsPerYear = 252): BacktestResult {
  const pos = positions(closes, spec);
  const cost = costBps / 10_000;
  const equity = [1];
  const benchmark = [1];
  const sRets: number[] = [];
  const bRets: number[] = [];
  let trades = 0;
  let invested = 0;
  let prev = 0;
  for (let t = 1; t < closes.length; t++) {
    const r = closes[t]! / closes[t - 1]! - 1;
    const p = pos[t - 1]!;
    const fee = p !== prev ? cost : 0;
    if (p !== prev) trades++;
    prev = p;
    invested += p;
    // The fee is charged on capital at the moment of the trade, before that day's return.
    const sr = (1 - fee) * (1 + p * r) - 1;
    sRets.push(sr);
    bRets.push(r);
    equity.push(equity.at(-1)! * (1 + sr));
    benchmark.push(benchmark.at(-1)! * (1 + r));
  }
  const days = Math.max(1, closes.length - 1);
  return {
    equity,
    benchmark,
    strategy: stats(equity, sRets, trades, invested / days, periodsPerYear),
    buyHold: stats(benchmark, bRets, 1, 1, periodsPerYear),
  };
}
