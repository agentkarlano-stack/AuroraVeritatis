import { describe, expect, it } from 'vitest';
import { mulberry32, normalSampler } from './rng';
import { aggregate, backtestVar, cholesky, covariance, erfc, historicalRisk, kupiec, maxDrawdown, monteCarloRisk, normInv, normalRisk, portfolioReturns, riskContributions, simpleReturns } from './risk';

describe('normal distribution helpers', () => {
  it('matches reference quantiles', () => {
    expect(normInv(0.05)).toBeCloseTo(-1.644854, 5);
    expect(normInv(0.01)).toBeCloseTo(-2.326348, 5);
    expect(normInv(0.5)).toBeCloseTo(0, 8);
    expect(normInv(0.999)).toBeCloseTo(3.090232, 5);
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(1)).toBeCloseTo(0.157299, 6);
  });
});

describe('VaR and CVaR', () => {
  it('normal VaR/CVaR follow the closed form', () => {
    const r = normalRisk(0, 0.02, 0.95);
    expect(r.var).toBeCloseTo(0.0328971, 6);
    expect(r.cvar).toBeCloseTo(0.0412543, 6);
    expect(r.cvar).toBeGreaterThan(r.var);
  });
  it('historical VaR is the loss quantile and CVaR the mean beyond it', () => {
    const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000); // −0.050 … 0.049
    const r = historicalRisk(returns, 0.95);
    expect(r.var).toBeCloseTo(0.04505, 5);
    expect(r.cvar).toBeCloseTo(0.048, 5);
  });
  it('historical risk converges to the normal formula on normal data', () => {
    const n = normalSampler(mulberry32(7));
    const xs = Array.from({ length: 200000 }, () => 0.01 * n());
    const h = historicalRisk(xs, 0.99);
    const p = normalRisk(0, 0.01, 0.99);
    expect(h.var).toBeCloseTo(p.var, 3);
    expect(h.cvar).toBeCloseTo(p.cvar, 3);
  });
});

describe('portfolio maths', () => {
  const a = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02];
  const b = [0.02, -0.01, 0.01, -0.005, -0.015, 0.01];
  it('covariance and Cholesky reproduce the matrix', () => {
    const c = covariance([a, b]);
    const L = cholesky(c);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(L[i]![0]! * L[j]![0]! + L[i]![1]! * L[j]![1]!).toBeCloseTo(c[i]![j]!, 12);
    expect(c[0]![1]).toBeCloseTo(c[1]![0]!, 15);
  });
  it('weights returns and splits risk with contributions summing to 1', () => {
    expect(portfolioReturns([a, b], [0.5, 0.5])[0]).toBeCloseTo(0.015);
    const rc = riskContributions([a, b], [0.6, 0.4]);
    expect(rc[0]! + rc[1]!).toBeCloseTo(1, 12);
  });
  it('Monte Carlo agrees with the normal formula for one asset and is reproducible', () => {
    const n = normalSampler(mulberry32(3));
    const xs = Array.from({ length: 5000 }, () => 0.001 + 0.02 * n());
    const mc = monteCarloRisk([xs], [1], 0.95, 1, 40000, 11);
    const p = normalRisk(xs.reduce((s, v) => s + v, 0) / xs.length, Math.sqrt(covariance([xs])[0]![0]!), 0.95);
    expect(mc.var).toBeCloseTo(p.var, 3);
    expect(monteCarloRisk([xs], [1], 0.95, 1, 1000, 11).var).toBe(monteCarloRisk([xs], [1], 0.95, 1, 1000, 11).var);
    // Horizon h: VaR grows roughly with √h when the mean is small.
    const h4 = monteCarloRisk([xs], [1], 0.95, 4, 20000, 5).var;
    expect(h4 / mc.var).toBeGreaterThan(1.7);
    expect(h4 / mc.var).toBeLessThan(2.2);
  });
});

describe('backtest and helpers', () => {
  it('Kupiec test: expected exceptions give a high p-value, too many a low one', () => {
    expect(kupiec(5, 100, 0.95).pValue).toBeCloseTo(1, 6);
    expect(kupiec(15, 100, 0.95).pValue).toBeLessThan(0.01);
    expect(kupiec(15, 100, 0.95).lr).toBeCloseTo(14.05, 2);
    expect(kupiec(0, 100, 0.99).lr).toBeCloseTo(2.0101, 3);
  });
  it('rolling backtest counts exceptions against past windows only', () => {
    const n = normalSampler(mulberry32(1));
    const xs = Array.from({ length: 1000 }, () => 0.01 * n());
    const bt = backtestVar(xs, 0.95, 250)!;
    expect(bt.n).toBe(750);
    expect(Math.abs(bt.exceptions - bt.expected)).toBeLessThan(15);
    expect(backtestVar(xs.slice(0, 100), 0.95, 250)).toBeNull();
  });
  it('drawdown, aggregation and simple returns', () => {
    expect(maxDrawdown([0.1, -0.5, 0.2])).toBeCloseTo(0.5);
    expect(aggregate([1, 2, 3, 4, 5], 2)).toEqual([5, 9]);
    expect(simpleReturns([100, 110, null, 120])).toEqual([expect.closeTo(0.1), null, null]);
  });
});
