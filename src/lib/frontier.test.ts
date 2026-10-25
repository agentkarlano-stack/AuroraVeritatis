import { describe, expect, it } from 'vitest';
import { mulberry32, normalSampler } from './rng';
import { efficientFrontier, ledoitWolf, outOfSample, projectCapped, riskParity, solveMeanVariance } from './frontier';

/** Independent normal returns with given monthly means and volatilities (seeded). */
function simulate(mus: number[], sds: number[], n: number, seed = 1): number[][] {
  const z = normalSampler(mulberry32(seed));
  return mus.map((m, i) => Array.from({ length: n }, () => m + sds[i]! * z()));
}

describe('efficient frontier', () => {
  it('projects onto the capped simplex', () => {
    const w = projectCapped([0.9, 0.5, -0.2], 0, 0.6);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(Math.max(...w)).toBeLessThanOrEqual(0.6 + 1e-12);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(-1e-12);
    expect(() => projectCapped([1, 1], 0, 0.4)).toThrow();
  });

  it('minimum variance of uncorrelated assets is proportional to 1/σ² (analytic)', () => {
    const sigma = [
      [0.04, 0],
      [0, 0.01],
    ];
    const w = solveMeanVariance(sigma, [0, 0], 0, 0, 1);
    expect(w[0]).toBeCloseTo(0.2, 6);
    expect(w[1]).toBeCloseTo(0.8, 6);
  });

  it('risk parity of uncorrelated assets is proportional to 1/σ (analytic)', () => {
    const w = riskParity([
      [0.04, 0, 0],
      [0, 0.01, 0],
      [0, 0, 0.0025],
    ]);
    const inv = [1 / 0.2, 1 / 0.1, 1 / 0.05];
    const s = inv.reduce((a, b) => a + b, 0);
    w.forEach((x, i) => expect(x).toBeCloseTo(inv[i]! / s, 6));
  });

  it('Ledoit-Wolf shrinks more when there are few observations', () => {
    const few = ledoitWolf(simulate([0, 0, 0, 0, 0], [0.05, 0.05, 0.05, 0.05, 0.05], 12, 3)).shrinkage;
    const many = ledoitWolf(simulate([0, 0, 0, 0, 0], [0.02, 0.05, 0.08, 0.03, 0.06], 2000, 3)).shrinkage;
    expect(few).toBeGreaterThan(many);
    expect(few).toBeLessThanOrEqual(1);
    expect(many).toBeGreaterThanOrEqual(0);
  });

  it('max Sharpe matches the analytic tangency portfolio when unconstrained and long-only is not binding', () => {
    // Monthly μ and σ; tangency weights ∝ Σ⁻¹(μ − rf) for uncorrelated assets: (μᵢ − rf)/σᵢ².
    const series = simulate([0.01, 0.006], [0.05, 0.03], 3000, 7);
    const r = efficientFrontier({ series, periodsPerYear: 12, rf: 0, lo: 0, hi: 1, shrink: false, randomCount: 50, seed: 1 });
    // Off-diagonal sample covariance is small but not zero, so solve the 2×2 system exactly.
    const [[a, b], [, d]] = r.sigma as [[number, number], [number, number]];
    const det = a * d - b * b;
    const t = [(d * r.mu[0]! - b * r.mu[1]!) / det, (a * r.mu[1]! - b * r.mu[0]!) / det];
    const s = t[0]! + t[1]!;
    expect(r.maxSharpe.weights[0]).toBeCloseTo(t[0]! / s, 2);
    // Every random portfolio lies on or below the frontier's best Sharpe ratio, and min variance has the lowest vol.
    expect(Math.max(...r.random.map((p) => p.ret / p.vol))).toBeLessThanOrEqual(r.maxSharpe.sharpe + 1e-6);
    expect(Math.min(...r.random.map((p) => p.vol))).toBeGreaterThanOrEqual(r.minVariance.vol - 1e-9);
  });

  it('respects weight limits and evaluates out of sample', () => {
    const series = simulate([0.012, 0.004, 0.006, 0.008], [0.06, 0.02, 0.04, 0.05], 240, 9);
    const inp = { series, periodsPerYear: 12, rf: 0.02, lo: 0, hi: 0.4, shrink: true, randomCount: 200, seed: 2 };
    const r = efficientFrontier(inp);
    for (const p of [r.minVariance, r.maxSharpe, ...r.frontier]) {
      expect(Math.max(...p.weights)).toBeLessThanOrEqual(0.4 + 1e-9);
      expect(p.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
    }
    expect(r.shrinkage).not.toBeNull();
    const oos = outOfSample(inp);
    expect(oos.trainPeriods).toBe(168);
    expect(oos.testPeriods).toBe(72);
    expect(oos.rows.map((x) => x.name)).toContain('Maximum Sharpe');
  });
});
