import { mulberry32, normalSampler } from './rng';
import { histogram, mean, quantileSorted, stdev, type Histogram } from './stats';

export interface GbmParams {
  /** Initial value of the asset or portfolio. */
  s0: number;
  /** Annualised drift (e.g. 0.06 for 6%). */
  mu: number;
  /** Annualised volatility (e.g. 0.2 for 20%). */
  sigma: number;
  /** Horizon in trading days. */
  days: number;
  paths: number;
  seed: number;
  /** Trading days per year used to scale mu and sigma. */
  daysPerYear?: number;
  /** Optional one-off event shock (Strategy Lab scenarios). */
  jump?: JumpParams;
}

export interface JumpParams {
  /** Trading day on which the event may occur (1..days). */
  day: number;
  /** Probability that the event occurs on any given path (0..1). */
  probability: number;
  /** Mean simple return applied if it occurs, e.g. -0.1 for -10%. */
  mean: number;
  /** Standard deviation of that return. */
  sd: number;
}

export interface FanPoint {
  day: number;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface GbmResult {
  params: Required<Omit<GbmParams, 'jump'>> & Pick<GbmParams, 'jump'>;
  fan: FanPoint[];
  terminal: Float64Array;
  /** 1 where the jump event occurred on that path (all 0 without a jump). */
  jumped: Uint8Array;
  histogram: Histogram;
  stats: {
    mean: number;
    median: number;
    stdev: number;
    /** 95% confidence interval for the expected terminal value (normal approximation). */
    meanCi95: [number, number];
    /** Analytical expectation s0·e^(μT) for verification. */
    analyticMean: number;
    probLoss: number;
    /** 95% Value-at-Risk, as a positive loss amount relative to s0. */
    var95: number;
    /** 95% Conditional VaR / Expected Shortfall. */
    cvar95: number;
    p05: number;
    p95: number;
  };
  elapsedMs: number;
}

export const MC_LIMITS = { maxPaths: 20000, maxDays: 2520 } as const;

/**
 * Geometric Brownian motion Monte Carlo using the exact log-normal step
 * S(t+dt) = S(t)·exp((μ − σ²/2)dt + σ√dt·Z). Percentiles are recorded at up to
 * ~80 checkpoints to keep memory bounded.
 */
export function simulateGbm(input: GbmParams): GbmResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const params: Required<Omit<GbmParams, 'jump'>> & Pick<GbmParams, 'jump'> = {
    daysPerYear: 252,
    ...input,
    paths: Math.max(100, Math.min(MC_LIMITS.maxPaths, Math.round(input.paths))),
    days: Math.max(1, Math.min(MC_LIMITS.maxDays, Math.round(input.days))),
  };
  const { s0, mu, sigma, days, paths, seed, daysPerYear } = params;
  if (!(s0 > 0) || !(sigma >= 0)) throw new Error('Initial value must be positive and volatility non-negative.');

  const dt = 1 / daysPerYear;
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const diff = sigma * Math.sqrt(dt);
  const z = normalSampler(mulberry32(seed));
  // The jump draws come from a separate stream, so the diffusion paths are identical with and without a
  // scenario (common random numbers): differences between baseline and scenario come from the event alone.
  const jump = input.jump;
  const ju = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const jz = normalSampler(mulberry32((seed ^ 0x85ebca6b) >>> 0));
  const jumped = new Uint8Array(paths);

  const stride = Math.max(1, Math.ceil(days / 80));
  const checkpoints: number[] = [];
  for (let d = stride; d < days; d += stride) checkpoints.push(d);
  checkpoints.push(days);
  const snap = checkpoints.map(() => new Float64Array(paths));
  const terminal = new Float64Array(paths);

  for (let p = 0; p < paths; p++) {
    let logS = Math.log(s0);
    let c = 0;
    const hits = jump ? ju() < jump.probability : false;
    const jumpReturn = jump && hits ? Math.max(-0.99, jump.mean + jump.sd * jz()) : 0;
    if (hits) jumped[p] = 1;
    for (let d = 1; d <= days; d++) {
      logS += drift + diff * z();
      if (hits && d === jump!.day) logS += Math.log1p(jumpReturn);
      if (d === checkpoints[c]) {
        snap[c]![p] = Math.exp(logS);
        c++;
      }
    }
    terminal[p] = Math.exp(logS);
  }

  const fan: FanPoint[] = [{ day: 0, p05: s0, p25: s0, p50: s0, p75: s0, p95: s0 }];
  checkpoints.forEach((day, i) => {
    const s = snap[i]!.sort();
    fan.push({
      day,
      p05: quantileSorted(s, 0.05),
      p25: quantileSorted(s, 0.25),
      p50: quantileSorted(s, 0.5),
      p75: quantileSorted(s, 0.75),
      p95: quantileSorted(s, 0.95),
    });
  });

  const sorted = Float64Array.from(terminal).sort();
  const m = mean(sorted);
  const sd = stdev(sorted);
  const se = sd / Math.sqrt(paths);
  const p05 = quantileSorted(sorted, 0.05);
  let tail = 0;
  let tailN = 0;
  let losses = 0;
  for (let i = 0; i < paths; i++) {
    if (sorted[i]! < s0) losses++;
    if (sorted[i]! <= p05) {
      tail += sorted[i]!;
      tailN++;
    }
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    params,
    fan,
    terminal,
    jumped,
    histogram: histogram(sorted, 40),
    stats: {
      mean: m,
      median: quantileSorted(sorted, 0.5),
      stdev: sd,
      meanCi95: [m - 1.96 * se, m + 1.96 * se],
      analyticMean: s0 * Math.exp(mu * days * dt),
      probLoss: losses / paths,
      var95: Math.max(0, s0 - p05),
      cvar95: Math.max(0, s0 - tail / Math.max(1, tailN)),
      p05,
      p95: quantileSorted(sorted, 0.95),
    },
    elapsedMs: t1 - t0,
  };
}
