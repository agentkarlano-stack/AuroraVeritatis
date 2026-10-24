import { describe, expect, it } from 'vitest';
import { TIERS } from '../data/tiers';
import { PERIODS, daysUntil, periodMargin, periodPrice } from './billing';

describe('subscription periods', () => {
  it('shows the upfront total, monthly equivalent and real savings', () => {
    expect(periodPrice(12.99, 1)).toEqual({ months: 1, upfront: 12.99, perMonth: 12.99, savings: 0, discount: 0 });
    // 12.99 × 12 = 155.88; 15% off = 132.50 (to the cent); 11.04 a month; saves 23.38.
    expect(periodPrice(12.99, 12)).toEqual({ months: 12, upfront: 132.5, perMonth: 11.04, savings: 23.38, discount: 0.15 });
    const q = periodPrice(4.99, 3);
    expect(q.upfront).toBeCloseTo(14.22, 2);
    expect(q.savings).toBeCloseTo(0.75, 2);
    for (const t of TIERS) for (const p of PERIODS) {
      const r = periodPrice(t.priceEur, p.months);
      expect(r.upfront + r.savings).toBeCloseTo(t.priceEur * p.months, 1);
      expect(r.perMonth).toBeLessThanOrEqual(t.priceEur);
    }
  });
  it('checks margins and counts days', () => {
    // 132.50 upfront, 3% fee, €4/month cost over 12 months: (128.53 - 48) / 132.50 ≈ 0.608
    expect(periodMargin(periodPrice(12.99, 12), 4, 0.03)).toBeCloseTo(0.6077, 3);
    expect(periodMargin(periodPrice(0, 1), 1)).toBeNull();
    expect(daysUntil('2026-10-31T00:00:00Z', Date.parse('2026-10-24T12:00:00Z'))).toBe(7);
  });
});
