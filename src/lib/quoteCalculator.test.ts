import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, calculateQuote, grossMargin, marginToMarkup, markup, markupToMargin, minPriceFor } from './quoteCalculator';

describe('quotation calculator', () => {
  it('keeps gross margin and markup apart', () => {
    expect(grossMargin(150, 100)).toBeCloseTo(1 / 3);
    expect(markup(150, 100)).toBeCloseTo(0.5);
    expect(markupToMargin(0.5)).toBeCloseTo(1 / 3);
    expect(marginToMarkup(0.6)).toBeCloseTo(1.5);
  });

  it('computes the minimum price as cost / (1 − margin − fee)', () => {
    expect(minPriceFor(100, 0.6)).toBeCloseTo(250);
    expect(minPriceFor(100, 0.6, 0.05)).toBeCloseTo(100 / 0.35);
    expect(minPriceFor(100, 0.7, 0.3)).toBe(Infinity);
  });

  it('builds three scenarios and a recommendation from entered costs', () => {
    const r = calculateQuote({
      ...DEFAULT_INPUTS,
      seats: 10,
      months: 12,
      infraPerSeat: 2,
      aiRequestsPerSeat: 200,
      tokensIn: 3000,
      tokensOut: 1000,
      pricePerMIn: 3,
      pricePerMOut: 15,
      supportHours: 2,
      supportRate: 50,
      onboarding: 1200,
      buffer: 0,
      feeRate: 0,
      targetMargin: 0.6,
    });
    const [low, exp, heavy] = r.scenarios;
    // Expected AI: 2,000 requests × (3,000 × 3 + 1,000 × 15) / 1e6 = 48 €; infra 20; support 100; onboarding 100.
    expect(exp!.costs.ai).toBeCloseTo(48);
    expect(exp!.costs.total).toBeCloseTo(268);
    expect(low!.costs.ai).toBeCloseTo(24);
    expect(heavy!.costs.ai).toBeCloseTo(96);
    expect(exp!.minPrice).toBeCloseTo(670);
    expect(r.recommendation!.pricePerSeat).toBe(67);
    expect(r.recommendation!.margins.expected.grossMargin).toBeCloseTo(0.6, 2);
    expect(r.recommendation!.margins.heavy.grossMargin).toBeLessThan(0.6);
    expect(r.warnings).toEqual([]);
  });

  it('warns when AI usage has no price and gives no recommendation without costs', () => {
    const r = calculateQuote({ ...DEFAULT_INPUTS, aiRequestsPerSeat: 100, tokensIn: 1000 });
    expect(r.warnings.join(' ')).toMatch(/token price is 0/);
    expect(r.recommendation).toBeNull();
  });

  it('recommends an AI cap when heavy use would erase the margin', () => {
    const r = calculateQuote({ ...DEFAULT_INPUTS, seats: 5, aiRequestsPerSeat: 1000, tokensIn: 5000, tokensOut: 2000, pricePerMIn: 3, pricePerMOut: 15, buffer: 0, targetMargin: 0.3, scenarios: { low: 0.5, expected: 1, heavy: 4 } });
    expect(r.recommendation!.basis).toMatch(/AI allowance of about 1000 requests per seat/);
    expect(r.warnings.join(' ')).toMatch(/AI cap is required/);
  });
});
