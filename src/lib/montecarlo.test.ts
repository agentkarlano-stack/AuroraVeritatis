import { describe, expect, it } from 'vitest';
import { simulateGbm } from './montecarlo';

const base = { s0: 100, mu: 0.08, sigma: 0.2, days: 252, paths: 20000, seed: 7 };

describe('simulateGbm', () => {
  it('is reproducible for the same seed', () => {
    const a = simulateGbm({ ...base, paths: 500 });
    const b = simulateGbm({ ...base, paths: 500 });
    expect(Array.from(a.terminal)).toEqual(Array.from(b.terminal));
    expect(simulateGbm({ ...base, paths: 500, seed: 8 }).stats.mean).not.toBe(a.stats.mean);
  });

  it('matches the analytical expectation S0·e^(μT) within sampling error', () => {
    const r = simulateGbm(base);
    expect(r.stats.analyticMean).toBeCloseTo(100 * Math.exp(0.08), 6);
    const se = r.stats.stdev / Math.sqrt(base.paths);
    expect(Math.abs(r.stats.mean - r.stats.analyticMean)).toBeLessThan(4 * se);
  });

  it('matches the analytical log-normal median S0·e^((μ−σ²/2)T)', () => {
    const r = simulateGbm(base);
    expect(r.stats.median / (100 * Math.exp(0.08 - 0.02)) - 1).toBeLessThan(0.01);
  });

  it('is deterministic when volatility is zero', () => {
    const r = simulateGbm({ ...base, sigma: 0, paths: 100 });
    expect(r.stats.p05).toBeCloseTo(100 * Math.exp(0.08), 8);
    expect(r.stats.var95).toBe(0);
    expect(r.stats.probLoss).toBe(0);
  });

  it('produces ordered percentile bands and coherent risk measures', () => {
    const r = simulateGbm({ ...base, paths: 3000 });
    for (const f of r.fan) {
      expect(f.p05).toBeLessThanOrEqual(f.p25);
      expect(f.p25).toBeLessThanOrEqual(f.p50);
      expect(f.p50).toBeLessThanOrEqual(f.p75);
      expect(f.p75).toBeLessThanOrEqual(f.p95);
    }
    expect(r.fan.at(-1)!.day).toBe(252);
    expect(r.stats.cvar95).toBeGreaterThanOrEqual(r.stats.var95);
    expect(r.histogram.counts.reduce((a, b) => a + b, 0)).toBe(3000);
  });

  it('clamps path count and rejects invalid inputs', () => {
    expect(simulateGbm({ ...base, paths: 10, days: 5 }).params.paths).toBe(100);
    expect(() => simulateGbm({ ...base, s0: 0 })).toThrow();
  });
});

describe('simulateGbm with an event shock', () => {
  it('applies a certain, fixed shock exactly', () => {
    const r = simulateGbm({ ...base, sigma: 0, paths: 100, jump: { day: 10, probability: 1, mean: -0.2, sd: 0 } });
    expect(r.stats.median).toBeCloseTo(100 * Math.exp(0.08) * 0.8, 8);
    expect(r.jumped.every((j) => j === 1)).toBe(true);
  });

  it('leaves baseline paths unchanged when the event never happens (common random numbers)', () => {
    const p = { ...base, paths: 500 };
    const baseline = simulateGbm(p);
    const never = simulateGbm({ ...p, jump: { day: 10, probability: 0, mean: -0.5, sd: 0.1 } });
    expect(Array.from(never.terminal)).toEqual(Array.from(baseline.terminal));
  });

  it('hits roughly the requested share of paths and is reproducible', () => {
    const p = { ...base, paths: 10000, jump: { day: 30, probability: 0.3, mean: -0.1, sd: 0.05 } };
    const a = simulateGbm(p);
    const share = a.jumped.reduce((s, j) => s + j, 0) / 10000;
    expect(share).toBeGreaterThan(0.28);
    expect(share).toBeLessThan(0.32);
    expect(Array.from(simulateGbm(p).terminal)).toEqual(Array.from(a.terminal));
    expect(a.stats.mean).toBeLessThan(simulateGbm({ ...base, paths: 10000 }).stats.mean);
  });
});
