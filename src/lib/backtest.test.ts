import { describe, expect, it } from 'vitest';
import { backtest, positions } from './backtest';
import { demoBars } from './demoMarket';

const closes = demoBars('GLB-EQ.D', new Date('2026-10-20T00:00:00Z')).map((b) => b.close);

describe('backtest', () => {
  it('uses no future information (look-ahead check)', () => {
    for (const spec of [{ kind: 'sma', fast: 10, slow: 30 }, { kind: 'rsi', period: 14, lower: 30, upper: 55 }] as const) {
      const k = 300;
      const base = positions(closes, spec);
      const tampered = closes.slice();
      for (let t = k + 1; t < tampered.length; t++) tampered[t] = tampered[t]! * (t % 2 ? 3 : 0.2);
      expect(positions(tampered, spec).slice(0, k + 1)).toEqual(base.slice(0, k + 1));
    }
  });

  it('buy-and-hold matches the benchmark apart from the single entry cost', () => {
    const r = backtest(closes, { kind: 'hold' }, 10);
    expect(r.strategy.trades).toBe(1);
    expect(r.equity.at(-1)! / r.benchmark.at(-1)!).toBeCloseTo(1 - 0.001, 6);
    expect(r.buyHold.totalReturn).toBeCloseTo(closes.at(-1)! / closes[0]! - 1, 10);
  });

  it('charges costs per position change and stays flat when never invested', () => {
    const flat = backtest(closes, { kind: 'rsi', period: 14, lower: -1, upper: 101 });
    expect(flat.strategy.trades).toBe(0);
    expect(flat.equity.every((v) => v === 1)).toBe(true);
    const cheap = backtest(closes, { kind: 'sma', fast: 5, slow: 20 }, 0);
    const dear = backtest(closes, { kind: 'sma', fast: 5, slow: 20 }, 50);
    expect(dear.strategy.trades).toBe(cheap.strategy.trades);
    expect(dear.equity.at(-1)!).toBeLessThan(cheap.equity.at(-1)!);
  });

  it('reports coherent statistics', () => {
    const r = backtest(closes, { kind: 'sma', fast: 20, slow: 50 });
    expect(r.equity).toHaveLength(closes.length);
    expect(r.strategy.exposure).toBeGreaterThan(0);
    expect(r.strategy.exposure).toBeLessThanOrEqual(1);
    expect(r.strategy.maxDrawdown).toBeLessThanOrEqual(0);
  });
});
