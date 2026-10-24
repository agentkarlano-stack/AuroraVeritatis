/**
 * Portfolio risk: Value-at-Risk and Expected Shortfall (CVaR) by three methods, risk contributions and a VaR backtest
 * (Kupiec proportion-of-failures test). Returns are simple period returns; losses are reported as positive fractions
 * of portfolio value. These are statistics of past data or of a stated model, not forecasts.
 */
import { mulberry32, normalSampler } from './rng';
import { mean, quantileSorted, stdev } from './stats';

/** Inverse of the standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let x: number;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - lo) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  return x;
}

/** Complementary error function (Numerical Recipes erfcc, fractional error < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

export const normPdf = (x: number) => Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);

export interface RiskFigure {
  var: number;
  cvar: number;
}

/** Historical simulation: the loss quantile of the observed returns and the mean loss beyond it. */
export function historicalRisk(returns: number[], confidence: number): RiskFigure {
  const sorted = [...returns].sort((x, y) => x - y);
  const q = quantileSorted(sorted, 1 - confidence);
  const tail = sorted.filter((r) => r <= q);
  return { var: -q, cvar: -mean(tail) };
}

/** Normal (variance-covariance) VaR and CVaR for a return with mean `mu` and standard deviation `sigma`. */
export function normalRisk(mu: number, sigma: number, confidence: number): RiskFigure {
  const z = normInv(1 - confidence);
  return { var: -(mu + z * sigma), cvar: -(mu - (sigma * normPdf(z)) / (1 - confidence)) };
}

/** Sample covariance matrix of asset return series (assets × periods, equal lengths). */
export function covariance(series: number[][]): number[][] {
  const means = series.map((s) => mean(s));
  const n = series[0]?.length ?? 0;
  return series.map((a, i) =>
    series.map((b, j) => {
      let s = 0;
      for (let t = 0; t < n; t++) s += (a[t]! - means[i]!) * (b[t]! - means[j]!);
      return n > 1 ? s / (n - 1) : NaN;
    }),
  );
}

/** Cholesky factor L (lower triangular, Σ = L Lᵀ). Tiny negative pivots from rounding are clipped to zero. */
export function cholesky(m: number[][]): number[][] {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i]![j]!;
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      if (i === j) L[i]![j] = Math.sqrt(Math.max(0, s));
      else L[i]![j] = L[j]![j]! > 0 ? s / L[j]![j]! : 0;
    }
  }
  return L;
}

/**
 * Monte Carlo: `paths` draws of the horizon return from a multivariate normal with the assets' sample means and
 * covariance (h independent periods summed), combined with the weights. Seeded, so results are reproducible.
 */
export function monteCarloRisk(series: number[][], weights: number[], confidence: number, horizon: number, paths: number, seed: number): RiskFigure & { returns: number[] } {
  const mu = series.map((s) => mean(s));
  const L = cholesky(covariance(series));
  const normal = normalSampler(mulberry32(seed));
  const n = series.length;
  const out = new Array<number>(paths);
  const z = new Array<number>(n);
  for (let p = 0; p < paths; p++) {
    let total = 0;
    for (let h = 0; h < horizon; h++) {
      for (let i = 0; i < n; i++) z[i] = normal();
      for (let i = 0; i < n; i++) {
        let x = mu[i]!;
        for (let k = 0; k <= i; k++) x += L[i]![k]! * z[k]!;
        total += weights[i]! * x;
      }
    }
    out[p] = total;
  }
  return { ...historicalRisk(out, confidence), returns: out };
}

/** Portfolio return per period (weights fixed, rebalanced each period). */
export function portfolioReturns(series: number[][], weights: number[]): number[] {
  const n = series[0]?.length ?? 0;
  return Array.from({ length: n }, (_, t) => series.reduce((s, r, i) => s + weights[i]! * r[t]!, 0));
}

/** Sums of `h` consecutive, non-overlapping returns (oldest leftovers dropped), for historical multi-period VaR. */
export function aggregate(returns: number[], h: number): number[] {
  const out: number[] = [];
  for (let end = returns.length; end - h >= 0; end -= h) out.unshift(returns.slice(end - h, end).reduce((s, v) => s + v, 0));
  return out;
}

/**
 * Each asset's share of the normal VaR's volatility part (Euler allocation): w_i (Σw)_i / σ_p². Shares sum to 1; a
 * negative share means the asset reduces portfolio risk.
 */
export function riskContributions(series: number[][], weights: number[]): number[] {
  const cov = covariance(series);
  const sw = cov.map((row) => row.reduce((s, v, j) => s + v * weights[j]!, 0));
  const variance = sw.reduce((s, v, i) => s + weights[i]! * v, 0);
  return sw.map((v, i) => (variance > 0 ? (weights[i]! * v) / variance : 0));
}

export interface Backtest {
  /** Periods tested. */
  n: number;
  /** Periods whose loss exceeded the VaR estimated from the preceding window. */
  exceptions: number;
  expected: number;
  /** Kupiec likelihood-ratio statistic (χ², 1 degree of freedom). */
  lr: number;
  pValue: number;
}

/** Kupiec proportion-of-failures test for `x` exceptions in `n` periods at VaR confidence `confidence`. */
export function kupiec(x: number, n: number, confidence: number): Omit<Backtest, 'n' | 'exceptions' | 'expected'> {
  const p = 1 - confidence;
  const ll = (q: number) => (n - x) * Math.log(1 - q) + (x > 0 ? x * Math.log(q) : 0);
  const phat = x / n;
  const lr = x === 0 ? -2 * n * Math.log(1 - p) : x === n ? -2 * n * Math.log(p) : -2 * (ll(p) - ll(phat));
  return { lr, pValue: erfc(Math.sqrt(Math.max(0, lr) / 2)) };
}

/** Rolling one-period historical-VaR backtest: each period is checked against the VaR of the `window` periods before it. */
export function backtestVar(returns: number[], confidence: number, window: number): Backtest | null {
  if (returns.length < window + 20) return null;
  let exceptions = 0;
  let n = 0;
  for (let t = window; t < returns.length; t++) {
    const v = historicalRisk(returns.slice(t - window, t), confidence).var;
    if (-returns[t]! > v) exceptions++;
    n++;
  }
  return { n, exceptions, expected: n * (1 - confidence), ...kupiec(exceptions, n, confidence) };
}

/** Largest peak-to-trough fall of the cumulative portfolio value (fraction). */
export function maxDrawdown(returns: number[]): number {
  let value = 1;
  let peak = 1;
  let worst = 0;
  for (const r of returns) {
    value *= 1 + r;
    peak = Math.max(peak, value);
    worst = Math.max(worst, 1 - value / peak);
  }
  return worst;
}

/** Simple returns between consecutive values; null where either value is missing. */
export function simpleReturns(values: (number | null)[]): (number | null)[] {
  return values.slice(1).map((v, i) => {
    const a = values[i];
    return a != null && v != null && a > 0 ? v / a - 1 : null;
  });
}

export { mean, stdev };
