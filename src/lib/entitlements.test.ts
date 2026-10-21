import { describe, expect, it } from 'vitest';
import { checkLimit, hasFeature, limitOf, minTierFor } from './entitlements';

describe('entitlements', () => {
  it('reads limits from the plan table', () => {
    expect(limitOf('free', 'assetsPerWatchlist')).toBe(10);
    expect(limitOf('intelligence', 'alertRules')).toBe(100);
  });

  it('checks usage against limits', () => {
    expect(checkLimit('free', 'alertRules', 1)).toEqual({ allowed: true, limit: 2, remaining: 1 });
    expect(checkLimit('free', 'alertRules', 2).allowed).toBe(false);
    expect(checkLimit('prime', 'alertRules', 2).allowed).toBe(true);
  });

  it('gates features by tier order unless early access is on', () => {
    expect(minTierFor('strategyLab')).toBe('prime');
    expect(hasFeature('premium', 'strategyLab', false)).toBe(false);
    expect(hasFeature('prime', 'strategyLab', false)).toBe(true);
    expect(hasFeature('intelligence', 'scenarioDesk', false)).toBe(true);
    expect(hasFeature('free', 'strategyLab', true)).toBe(true);
  });
});

describe('Brain quotas', () => {
  it('uses the proposed per-plan limits, with the Premium quota during early access', async () => {
    const { brainLimits } = await import('./entitlements');
    expect(brainLimits('free', false)).toEqual({ graphs: 1, nodesPerGraph: 10, edgesPerGraph: 40 });
    expect(brainLimits('free', true)).toEqual({ graphs: 3, nodesPerGraph: 100, edgesPerGraph: 400 });
    expect(brainLimits('prime', true)).toEqual({ graphs: 15, nodesPerGraph: 500, edgesPerGraph: 2000 });
    expect(brainLimits('intelligence', false).nodesPerGraph).toBe(2000);
  });
});
