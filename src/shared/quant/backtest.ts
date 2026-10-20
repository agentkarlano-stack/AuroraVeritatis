import { maxDrawdown, mean, returns, rsi, sma, stdev, type Aligned, type Series } from "./indicators";

export type StrategyKind = "sma-crossover" | "rsi-reversion" | "buy-and-hold";

export interface StrategyParams {
  kind: StrategyKind;
  fast?: number;
  slow?: number;
  rsiPeriod?: number;
  rsiLower?: number;
  rsiUpper?: number;
  /** Cost per position change, as a fraction (0.001 = 10 bp). */
  costPerTrade?: number;
  periodsPerYear?: number;
}

export interface BacktestResult {
  /** Position held during each period (0 = flat, 1 = long), aligned to prices. */
  positions: number[];
  /** Strategy equity curve starting at 1. */
  equity: number[];
  /** Buy-and-hold benchmark equity curve starting at 1. */
  benchmark: number[];
  trades: number;
  stats: BacktestStats;
  benchmarkStats: BacktestStats;
}

export interface BacktestStats {
  totalReturn: number;
  cagr: number;
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
  exposure: number;
}

/**
 * Long-only, close-to-close backtest.
 *
 * The signal computed at the close of bar `i` is applied to the return
 * from bar `i` to bar `i + 1`, so there is no look-ahead bias.
 * Risk-free rate is assumed to be zero.
 */
export function backtest(prices: Series, params: StrategyParams): BacktestResult {
  if (prices.length < 3) throw new RangeError("At least 3 prices are required.");
  if (prices.some((p) => !(p > 0) || !Number.isFinite(p))) {
    throw new RangeError("Prices must be finite positive numbers.");
  }
  const ppy = params.periodsPerYear ?? 252;
  const cost = params.costPerTrade ?? 0;
  const signal = buildSignal(prices, params);
  const r = returns(prices);

  const positions: number[] = new Array(prices.length).fill(0);
  const equity: number[] = [1];
  const benchmark: number[] = [1];
  let trades = 0;
  let held = 0;
  for (let i = 0; i < r.length; i++) {
    const want = signal[i] ?? held;
    let eq = equity[i]!;
    if (want !== held) {
      trades++;
      eq *= 1 - cost;
      held = want;
    }
    positions[i] = held;
    equity.push(eq * (1 + held * r[i]!));
    benchmark.push(benchmark[i]! * (1 + r[i]!));
  }
  positions[prices.length - 1] = held;

  return {
    positions,
    equity,
    benchmark,
    trades,
    stats: computeStats(equity, positions, ppy),
    benchmarkStats: computeStats(benchmark, positions.map(() => 1), ppy),
  };
}

function buildSignal(prices: Series, p: StrategyParams): (number | null)[] {
  switch (p.kind) {
    case "buy-and-hold":
      return prices.map(() => 1);
    case "sma-crossover": {
      const fast = p.fast ?? 20;
      const slow = p.slow ?? 50;
      if (fast >= slow) throw new RangeError("Fast period must be shorter than slow period.");
      const f = sma(prices, fast);
      const s = sma(prices, slow);
      return prices.map((_, i) => (f[i] == null || s[i] == null ? null : f[i]! > s[i]! ? 1 : 0));
    }
    case "rsi-reversion": {
      const lower = p.rsiLower ?? 30;
      const upper = p.rsiUpper ?? 70;
      if (lower >= upper) throw new RangeError("RSI lower band must be below upper band.");
      const values: Aligned = rsi(prices, p.rsiPeriod ?? 14);
      // Enter long when oversold, exit when overbought, otherwise hold state.
      let state = 0;
      return values.map((v) => {
        if (v == null) return null;
        if (v < lower) state = 1;
        else if (v > upper) state = 0;
        return state;
      });
    }
  }
}

export function computeStats(equity: Series, positions: Series, periodsPerYear: number): BacktestStats {
  const r = returns(equity);
  const total = equity[equity.length - 1]! / equity[0]! - 1;
  const years = r.length / periodsPerYear;
  const cagr = years > 0 ? Math.pow(1 + total, 1 / years) - 1 : NaN;
  const sd = stdev(r);
  const vol = sd * Math.sqrt(periodsPerYear);
  const sharpe = sd > 0 ? (mean(r) / sd) * Math.sqrt(periodsPerYear) : NaN;
  const exposure = positions.length ? positions.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, positions.length - 1) : 0;
  return { totalReturn: total, cagr, volatility: vol, sharpe, maxDrawdown: maxDrawdown(equity), exposure };
}
