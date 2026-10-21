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
