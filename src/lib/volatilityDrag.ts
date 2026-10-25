/**
 * Volatility drag: why the average (arithmetic) return overstates compound growth. Each strategy has an annual
 * arithmetic mean return a and annual volatility v. Annual gross returns 1 + R are log-normal with exactly
 * E[R] = a and SD[R] = v:
 *   σ_y² = ln(1 + v² / (1 + a)²),   μ_y = ln(1 + a) − σ_y² / 2
 * so the expected log growth per year is μ_y and the median growth factor is e^(μ_y T) while the mean is (1 + a)^T.
 * Paths are simulated monthly (μ_y/12, σ_y/√12), so annual returns keep these moments exactly.
 * The textbook approximation g ≈ a − v²/2 is shown only as an approximation (accurate for small a and v).
 */
import { mulberry32, normalSampler } from './rng';
import { mean, quantileSorted } from './stats';
import type { FanPoint } from './montecarlo';

export interface DragStrategy {
  label: string;
  /** Annual arithmetic mean return, e.g. 0.07. */
  mean: number;
  /** Annual volatility (standard deviation of annual returns), e.g. 0.15. */
  vol: number;
}

export interface DragParams {
  strategies: DragStrategy[];
  capital: number;
  years: number;
  /** Contribution added at the end of each month (0 for none). */
  monthlyContribution: number;
  /** Target wealth for the probability of reaching it (0 to skip). */
  target: number;
  paths: number;
  seed: number;
  /** Sample paths kept per strategy for drawing. */
  samplePaths?: number;
}

export interface DragResult {
  label: string;
  input: DragStrategy;
  theory: {
    /** Expected log growth per year μ_y. */
    logGrowth: number;
    /** Median annual growth rate e^μ_y − 1 (the compound rate of the median path). */
    medianCagr: number;
    /** a − v²/2: the common approximation. */
    approxGeometric: number;
    /** Mean terminal wealth without contributions, capital·(1 + a)^T. */
    meanTerminalNoContrib: number;
    /** Median terminal wealth without contributions, capital·e^(μ_y T). */
    medianTerminalNoContrib: number;
  };
  sim: {
    meanTerminal: number;
    medianTerminal: number;
    p05: number;
    p95: number;
    /** Average of all simulated annual returns (sample arithmetic mean). */
    avgAnnualReturn: number;
    /** Median of the per-path realised compound annual growth rates (no contributions only; null otherwise). */
    medianCagr: number | null;
    /** Probability of ending below the total amount invested. */
    probBelowInvested: number;
    /** Probability of ending at or above the target (null without a target). */
    probTarget: number | null;
    /** Median of the per-path maximum drawdown (monthly observations). */
    medianMaxDrawdown: number;
  };
  invested: number;
  /** Percentile fan by month. */
  fan: FanPoint[];
  /** A few sample paths (monthly values) for drawing. */
  samples: number[][];
}

export const DRAG_LIMITS = { maxPaths: 5000, maxYears: 50, maxStrategies: 4 } as const;

export function logParams(a: number, v: number): { mu: number; sigma: number } {
  if (!(a > -1)) throw new Error('The mean return must be above −100 %.');
  if (!(v >= 0)) throw new Error('Volatility cannot be negative.');
  const s2 = Math.log(1 + (v * v) / ((1 + a) * (1 + a)));
  return { mu: Math.log(1 + a) - s2 / 2, sigma: Math.sqrt(s2) };
}

export function simulateDrag(p: DragParams): DragResult[] {
  const years = Math.max(1, Math.min(DRAG_LIMITS.maxYears, Math.round(p.years)));
  const paths = Math.max(100, Math.min(DRAG_LIMITS.maxPaths, Math.round(p.paths)));
  const months = years * 12;
  if (!(p.capital > 0)) throw new Error('Starting capital must be positive.');
  if (p.monthlyContribution < 0) throw new Error('Contributions cannot be negative.');
  const keep = Math.min(p.samplePaths ?? 30, paths);
  const invested = p.capital + p.monthlyContribution * months;

  return p.strategies.slice(0, DRAG_LIMITS.maxStrategies).map((st) => {
    const { mu, sigma } = logParams(st.mean, st.vol);
    const m = mu / 12;
    const s = sigma / Math.sqrt(12);
    // Every strategy uses the same random numbers (common random numbers), so differences come from the parameters.
    const z = normalSampler(mulberry32(p.seed));
    const byMonth = Array.from({ length: months + 1 }, () => new Float64Array(paths));
    const terminal = new Float64Array(paths);
    const cagr = new Float64Array(paths);
    const mdd = new Float64Array(paths);
    const samples: number[][] = [];
    let annualSum = 0;
    let annualN = 0;
    for (let i = 0; i < paths; i++) {
      let w = p.capital;
      let peak = w;
      let dd = 0;
      let yearLog = 0;
      const sample = i < keep ? [w] : null;
      byMonth[0]![i] = w;
      for (let t = 1; t <= months; t++) {
        const step = m + s * z();
        yearLog += step;
        w = w * Math.exp(step) + p.monthlyContribution;
        if (w > peak) peak = w;
        else dd = Math.max(dd, 1 - w / peak);
        byMonth[t]![i] = w;
        sample?.push(w);
        if (t % 12 === 0) {
          annualSum += Math.exp(yearLog) - 1;
          annualN++;
          yearLog = 0;
        }
      }
      terminal[i] = w;
      cagr[i] = Math.pow(w / p.capital, 1 / years) - 1;
      mdd[i] = dd;
      if (sample) samples.push(sample);
    }
    const stride = Math.max(1, Math.ceil(months / 120));
    const fan: FanPoint[] = [];
    for (let t = 0; t <= months; t += stride) fan.push(fanPoint(t, byMonth[t]!));
    if (fan.at(-1)!.day !== months) fan.push(fanPoint(months, byMonth[months]!));
    const sorted = Float64Array.from(terminal).sort();
    let below = 0;
    let hit = 0;
    for (const v of sorted) {
      if (v < invested) below++;
      if (p.target > 0 && v >= p.target) hit++;
    }
    return {
      label: st.label,
      input: st,
      invested,
      theory: {
        logGrowth: mu,
        medianCagr: Math.exp(mu) - 1,
        approxGeometric: st.mean - (st.vol * st.vol) / 2,
        meanTerminalNoContrib: p.capital * Math.pow(1 + st.mean, years),
        medianTerminalNoContrib: p.capital * Math.exp(mu * years),
      },
      sim: {
        meanTerminal: mean(sorted),
        medianTerminal: quantileSorted(sorted, 0.5),
        p05: quantileSorted(sorted, 0.05),
        p95: quantileSorted(sorted, 0.95),
        avgAnnualReturn: annualSum / Math.max(1, annualN),
        medianCagr: p.monthlyContribution === 0 ? quantileSorted(Float64Array.from(cagr).sort(), 0.5) : null,
        probBelowInvested: below / paths,
        probTarget: p.target > 0 ? hit / paths : null,
        medianMaxDrawdown: quantileSorted(Float64Array.from(mdd).sort(), 0.5),
      },
      fan,
      samples,
    };
  });
}

function fanPoint(day: number, xs: Float64Array): FanPoint {
  const s = Float64Array.from(xs).sort();
  return { day, p05: quantileSorted(s, 0.05), p25: quantileSorted(s, 0.25), p50: quantileSorted(s, 0.5), p75: quantileSorted(s, 0.75), p95: quantileSorted(s, 0.95) };
}
