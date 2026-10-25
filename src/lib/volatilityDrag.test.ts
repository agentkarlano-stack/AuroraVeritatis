import { describe, expect, it } from 'vitest';
import { logParams, simulateDrag } from './volatilityDrag';

describe('volatility drag', () => {
  it('log-normal parameters reproduce the arithmetic mean and volatility exactly', () => {
    const { mu, sigma } = logParams(0.08, 0.2);
    const mean = Math.exp(mu + sigma ** 2 / 2) - 1;
    const sd = Math.sqrt((Math.exp(sigma ** 2) - 1) * Math.exp(2 * mu + sigma ** 2));
    expect(mean).toBeCloseTo(0.08, 12);
    expect(sd).toBeCloseTo(0.2, 12);
    // Zero volatility: no drag.
    expect(logParams(0.05, 0).mu).toBeCloseTo(Math.log(1.05), 12);
  });

  it('matches the analytical mean and median of terminal wealth and shows the drag', () => {
    const [calm, wild] = simulateDrag({
      strategies: [
        { label: 'Calm', mean: 0.07, vol: 0.08 },
        { label: 'Volatile', mean: 0.09, vol: 0.35 },
      ],
      capital: 10_000,
      years: 20,
      monthlyContribution: 0,
      target: 30_000,
      paths: 5000,
      seed: 7,
    });
    // Mean within 4 standard errors-ish; median within 3 % (5,000 paths).
    expect(calm!.sim.medianTerminal / calm!.theory.medianTerminalNoContrib).toBeGreaterThan(0.97);
    expect(calm!.sim.medianTerminal / calm!.theory.medianTerminalNoContrib).toBeLessThan(1.03);
    expect(calm!.sim.meanTerminal / calm!.theory.meanTerminalNoContrib).toBeGreaterThan(0.97);
    expect(calm!.sim.meanTerminal / calm!.theory.meanTerminalNoContrib).toBeLessThan(1.03);
    expect(wild!.sim.medianTerminal / wild!.theory.medianTerminalNoContrib).toBeGreaterThan(0.94);
    expect(wild!.sim.medianTerminal / wild!.theory.medianTerminalNoContrib).toBeLessThan(1.06);
    // Higher average return, lower median outcome: the point of the tool.
    expect(wild!.input.mean).toBeGreaterThan(calm!.input.mean);
    expect(wild!.sim.medianTerminal).toBeLessThan(calm!.sim.medianTerminal);
    expect(wild!.theory.medianCagr).toBeLessThan(calm!.theory.medianCagr);
    // The sample average of annual returns stays near the arithmetic mean.
    expect(wild!.sim.avgAnnualReturn).toBeCloseTo(0.09, 1);
    // Drawdowns and downside probabilities are larger for the volatile strategy.
    expect(wild!.sim.medianMaxDrawdown).toBeGreaterThan(calm!.sim.medianMaxDrawdown);
    expect(wild!.sim.probBelowInvested).toBeGreaterThan(calm!.sim.probBelowInvested);
    expect(calm!.sim.medianCagr).not.toBeNull();
  });

  it('is reproducible with a seed and handles contributions', () => {
    const p = { strategies: [{ label: 'A', mean: 0.05, vol: 0.1 }], capital: 1000, years: 5, monthlyContribution: 100, target: 0, paths: 500, seed: 3 };
    const a = simulateDrag(p)[0]!;
    const b = simulateDrag(p)[0]!;
    expect(a.sim.medianTerminal).toBe(b.sim.medianTerminal);
    expect(a.invested).toBe(1000 + 100 * 60);
    expect(a.sim.medianCagr).toBeNull();
    expect(a.sim.probTarget).toBeNull();
    expect(a.fan[0]!.p50).toBe(1000);
    expect(a.fan.at(-1)!.day).toBe(60);
    expect(() => simulateDrag({ ...p, capital: 0 })).toThrow();
  });
});
