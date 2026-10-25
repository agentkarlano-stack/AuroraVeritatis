/**
 * Efficient frontier on observed return series (assets × periods): Ledoit-Wolf covariance shrinkage, long-only
 * mean-variance optimisation with per-asset weight limits, minimum-variance, maximum-Sharpe, risk parity, a cloud of
 * random feasible portfolios and an out-of-sample check (estimate on the earlier part, evaluate on the later part).
 * Deterministic: random portfolios use a seeded generator. All figures annualised with `periodsPerYear`.
 */
import { mulberry32 } from './rng';

export type Matrix = number[][];

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
const matVec = (m: Matrix, v: number[]) => m.map((row) => dot(row, v));
export const quadForm = (m: Matrix, w: number[]) => dot(w, matVec(m, w));

export function means(series: number[][]): number[] {
  return series.map((s) => sum(s) / s.length);
}

/**
 * Ledoit-Wolf (2004) shrinkage towards a scaled identity: Σ = δ·m·I + (1 − δ)·S with S the sample covariance (divided
 * by n), m = tr(S)/p and the optimal intensity δ = min(b̄², d²)/d², where d² = ‖S − mI‖² and
 * b̄² = (1/n²) Σ_t ‖x_t x_tᵀ − S‖² (Frobenius norms). Returns the shrunk matrix and δ.
 */
export function ledoitWolf(series: number[][]): { sigma: Matrix; shrinkage: number } {
  const p = series.length;
  const n = series[0]?.length ?? 0;
  if (p === 0 || n < 2) throw new Error('Need at least two periods of returns.');
  const mu = means(series);
  const x = Array.from({ length: n }, (_, t) => series.map((s, i) => s[t]! - mu[i]!));
  const S: Matrix = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => sum(x.map((r) => r[i]! * r[j]!)) / n));
  const m = sum(S.map((r, i) => r[i]!)) / p;
  let d2 = 0;
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) d2 += (S[i]![j]! - (i === j ? m : 0)) ** 2;
  let b2 = 0;
  for (const r of x) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) b2 += (r[i]! * r[j]! - S[i]![j]!) ** 2;
  b2 /= n * n;
  const delta = d2 > 0 ? Math.min(b2, d2) / d2 : 1;
  return { sigma: S.map((r, i) => r.map((v, j) => delta * (i === j ? m : 0) + (1 - delta) * v)), shrinkage: delta };
}

/** Sample covariance divided by n − 1 (unbiased), for comparison with the shrunk estimate. */
export function sampleCovariance(series: number[][]): Matrix {
  const mu = means(series);
  const n = series[0]?.length ?? 0;
  return series.map((a, i) => series.map((b, j) => sum(a.map((v, t) => (v - mu[i]!) * (b[t]! - mu[j]!))) / (n - 1)));
}

/**
 * Euclidean projection onto {w : Σw = 1, lo ≤ wᵢ ≤ hi} (capped simplex) by bisection on the shift τ in
 * wᵢ = clip(vᵢ − τ, lo, hi). Requires p·lo ≤ 1 ≤ p·hi.
 */
export function projectCapped(v: number[], lo: number, hi: number): number[] {
  const p = v.length;
  if (p * lo > 1 + 1e-12 || p * hi < 1 - 1e-12) throw new Error('Weight limits leave no feasible portfolio.');
  const clip = (t: number) => v.map((x) => Math.min(hi, Math.max(lo, x - t)));
  let a = Math.min(...v) - hi - 1;
  let b = Math.max(...v) - lo + 1;
  for (let k = 0; k < 100; k++) {
    const mid = (a + b) / 2;
    if (sum(clip(mid)) > 1) a = mid;
    else b = mid;
  }
  return clip((a + b) / 2);
}

/** Minimises wᵀΣw − λ μᵀw over the capped simplex (projected gradient; convex, so the result is the optimum). */
export function solveMeanVariance(sigma: Matrix, mu: number[], lambda: number, lo: number, hi: number, start?: number[]): number[] {
  const p = mu.length;
  // Lipschitz constant of the gradient 2Σw + const: 2·λmax(Σ) ≤ 2·max row sum of |Σ|.
  const L = 2 * Math.max(...sigma.map((r) => sum(r.map(Math.abs)))) || 1;
  let w = projectCapped(start ?? Array(p).fill(1 / p), lo, hi);
  for (let k = 0; k < 4000; k++) {
    const g = matVec(sigma, w).map((x, i) => 2 * x - lambda * mu[i]!);
    const next = projectCapped(
      w.map((x, i) => x - g[i]! / L),
      lo,
      hi,
    );
    const moved = Math.max(...next.map((x, i) => Math.abs(x - w[i]!)));
    w = next;
    if (moved < 1e-12) break;
  }
  return w;
}

export interface PortfolioStats {
  weights: number[];
  /** Annualised expected (mean) return and volatility. */
  ret: number;
  vol: number;
  sharpe: number;
}

export function stats(w: number[], mu: number[], sigma: Matrix, periodsPerYear: number, rf: number): PortfolioStats {
  const ret = dot(w, mu) * periodsPerYear;
  const vol = Math.sqrt(Math.max(0, quadForm(sigma, w)) * periodsPerYear);
  return { weights: w, ret, vol, sharpe: vol > 0 ? (ret - rf) / vol : 0 };
}

/** Equal risk contributions (long-only, no caps): wᵢ·(Σw)ᵢ equal for all i, by a damped fixed-point iteration. */
export function riskParity(sigma: Matrix): number[] {
  const p = sigma.length;
  let w = sigma.map((r, i) => 1 / Math.sqrt(r[i]!));
  w = w.map((x) => x / sum(w));
  for (let k = 0; k < 2000; k++) {
    const mrc = matVec(sigma, w);
    const total = dot(w, mrc);
    const next = w.map((x, i) => x * Math.sqrt(total / p / (x * mrc[i]!)));
    const s = sum(next);
    const moved = Math.max(...next.map((x, i) => Math.abs(x / s - w[i]!)));
    w = next.map((x) => x / s);
    if (moved < 1e-13) break;
  }
  return w;
}

export interface FrontierInput {
  series: number[][];
  periodsPerYear: number;
  /** Annual risk-free rate for the Sharpe ratio (e.g. 0.02). */
  rf: number;
  lo: number;
  hi: number;
  shrink: boolean;
  randomCount: number;
  seed: number;
}

export interface FrontierResult {
  mu: number[];
  sigma: Matrix;
  shrinkage: number | null;
  correlation: Matrix;
  frontier: PortfolioStats[];
  minVariance: PortfolioStats;
  maxSharpe: PortfolioStats;
  riskParity: PortfolioStats | null;
  equal: PortfolioStats;
  random: { ret: number; vol: number }[];
}

export function efficientFrontier(inp: FrontierInput): FrontierResult {
  const p = inp.series.length;
  if (p < 2) throw new Error('Choose at least two assets.');
  const mu = means(inp.series);
  const lw = inp.shrink ? ledoitWolf(inp.series) : null;
  const sigma = lw ? lw.sigma : sampleCovariance(inp.series);
  const sd = sigma.map((r, i) => Math.sqrt(r[i]!));
  const correlation = sigma.map((r, i) => r.map((v, j) => v / (sd[i]! * sd[j]!)));
  const st = (w: number[]) => stats(w, mu, sigma, inp.periodsPerYear, inp.rf);

  const minW = solveMeanVariance(sigma, mu, 0, inp.lo, inp.hi);
  // λ sweep from the minimum-variance portfolio towards the highest-return feasible portfolio.
  const scale = Math.max(...sigma.map((r, i) => r[i]!)) / (Math.max(...mu.map(Math.abs)) || 1);
  const lambdas = [0, ...Array.from({ length: 40 }, (_, k) => scale * 10 ** (-2 + (k * 5) / 39))];
  const points: { l: number; s: PortfolioStats }[] = [];
  let prev = minW;
  for (const l of lambdas) {
    prev = solveMeanVariance(sigma, mu, l, inp.lo, inp.hi, prev);
    const s = st(prev);
    const last = points.at(-1)?.s;
    if (!last || Math.abs(s.ret - last.ret) > 1e-6 || Math.abs(s.vol - last.vol) > 1e-6) points.push({ l, s });
  }
  const frontier = points.map((x) => x.s);
  // Maximum Sharpe: best frontier point, refined by golden-section search on λ between its neighbours.
  let bi = 0;
  points.forEach((x, i) => {
    if (x.s.sharpe > points[bi]!.s.sharpe) bi = i;
  });
  let best = points[bi]!.s;
  {
    let a = points[Math.max(0, bi - 1)]!.l;
    let b = points[Math.min(points.length - 1, bi + 1)]!.l;
    const g = (Math.sqrt(5) - 1) / 2;
    const f = (l: number) => st(solveMeanVariance(sigma, mu, l, inp.lo, inp.hi, best.weights));
    for (let k = 0; k < 30 && b - a > 1e-12; k++) {
      const c = b - g * (b - a);
      const d = a + g * (b - a);
      if (f(c).sharpe > f(d).sharpe) b = d;
      else a = c;
    }
    const refined = f((a + b) / 2);
    if (refined.sharpe > best.sharpe) best = refined;
  }

  const rp = riskParity(sigma);
  const rpFeasible = rp.every((x) => x >= inp.lo - 1e-9 && x <= inp.hi + 1e-9);
  const rand = mulberry32(inp.seed);
  const random: { ret: number; vol: number }[] = [];
  for (let k = 0; k < inp.randomCount; k++) {
    const e = Array.from({ length: p }, () => -Math.log(1 - rand()));
    const s = sum(e);
    const w = projectCapped(
      e.map((x) => x / s),
      inp.lo,
      inp.hi,
    );
    const r = st(w);
    random.push({ ret: r.ret, vol: r.vol });
  }
  return {
    mu,
    sigma,
    shrinkage: lw ? lw.shrinkage : null,
    correlation,
    frontier,
    minVariance: st(minW),
    maxSharpe: best,
    riskParity: rpFeasible ? st(rp) : null,
    equal: st(projectCapped(Array(p).fill(1 / p), inp.lo, inp.hi)),
    random,
  };
}

export interface OutOfSampleRow {
  name: string;
  /** Realised annualised return and volatility in the test window with weights estimated on the training window. */
  ret: number;
  vol: number;
  sharpe: number;
}

/**
 * Estimates weights on the first `trainShare` of the periods and measures the realised performance of fixed weights
 * (rebalanced each period) on the rest. Shows how much of the in-sample optimum survives on unseen data.
 */
export function outOfSample(inp: FrontierInput, trainShare = 0.7): { rows: OutOfSampleRow[]; trainPeriods: number; testPeriods: number } {
  const n = inp.series[0]?.length ?? 0;
  const cut = Math.floor(n * trainShare);
  if (cut < 24 || n - cut < 12) throw new Error('Too few periods for an out-of-sample test.');
  const train = inp.series.map((s) => s.slice(0, cut));
  const test = inp.series.map((s) => s.slice(cut));
  const fit = efficientFrontier({ ...inp, series: train, randomCount: 0 });
  const realised = (name: string, w: number[]): OutOfSampleRow => {
    const r = Array.from({ length: n - cut }, (_, t) => dot(w, test.map((s) => s[t]!)));
    const m = sum(r) / r.length;
    const v = Math.sqrt(sum(r.map((x) => (x - m) ** 2)) / (r.length - 1));
    const ret = m * inp.periodsPerYear;
    const vol = v * Math.sqrt(inp.periodsPerYear);
    return { name, ret, vol, sharpe: vol > 0 ? (ret - inp.rf) / vol : 0 };
  };
  const rows = [realised('Minimum variance', fit.minVariance.weights), realised('Maximum Sharpe', fit.maxSharpe.weights), realised('Equal weight', fit.equal.weights)];
  if (fit.riskParity) rows.push(realised('Risk parity', fit.riskParity.weights));
  return { rows, trainPeriods: cut, testPeriods: n - cut };
}
