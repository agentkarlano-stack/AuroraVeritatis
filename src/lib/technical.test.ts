import { describe, expect, it } from 'vitest';
import { annualisedVol, bollinger, ema, maxDrawdown, periodReturn, rsi, sma } from './technical';
import { quantileSorted } from './stats';

describe('technical indicators', () => {
  it('computes SMA', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('seeds EMA with the SMA and then smooths', () => {
    const out = ema([1, 2, 3, 4], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2);
    expect(out[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5);
  });

  it('gives RSI 100 for a strictly rising series and ~0 for a falling one', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up, 14).at(-1)).toBe(100);
    const down = up.slice().reverse();
    expect(rsi(down, 14).at(-1)).toBeCloseTo(0);
    expect(rsi(up, 14).slice(0, 14).every((v) => v === null)).toBe(true);
  });

  it('builds symmetric Bollinger bands', () => {
    const v = [1, 2, 3, 4, 5, 6];
    const b = bollinger(v, 3, 2);
    expect(b.upper[2]! - b.mid[2]!).toBeCloseTo(b.mid[2]! - b.lower[2]!);
  });

  it('computes returns, drawdown and volatility', () => {
    expect(periodReturn([100, 110, 121], 2)).toBeCloseTo(0.21);
    expect(periodReturn([100], 5)).toBeNull();
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(-0.25);
    expect(annualisedVol([100, 100, 100])).toBe(0);
  });

  it('computes type-7 quantiles', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileSorted([1, 2, 3, 4], 0)).toBe(1);
    expect(quantileSorted([1, 2, 3, 4], 1)).toBe(4);
  });
});

describe('rebase', () => {
  it('rebases to 100 and handles empty or zero starts', async () => {
    const { rebase } = await import('./technical');
    rebase([50, 55, 45]).forEach((v, i) => expect(v).toBeCloseTo([100, 110, 90][i]!, 10));
    expect(rebase([])).toEqual([]);
    expect(rebase([0, 1]).every(Number.isNaN)).toBe(true);
  });
});

describe('plural', () => {
  it('pluralises', async () => {
    const { plural } = await import('./format');
    expect(plural(1, 'alert')).toBe('1 alert');
    expect(plural(0, 'alert')).toBe('0 alerts');
    expect(plural(2, 'country', 'countries')).toBe('2 countries');
  });
});
