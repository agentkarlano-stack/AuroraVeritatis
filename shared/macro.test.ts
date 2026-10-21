import { describe, expect, it } from 'vitest';
import { MACRO_MAP, crossRates, lastChange, macroCsv, summariseMacro, valueDaysAgo, type MacroObs } from './macro';

const daily = (start: string, values: number[]): MacroObs[] =>
  values.map((value, i) => ({ date: new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10), value }));

describe('macro analytics', () => {
  it('finds the observation at or before a look-back date', () => {
    const obs = daily('2026-01-01', Array.from({ length: 40 }, (_, i) => i));
    expect(valueDaysAgo(obs, 30)).toEqual({ date: '2026-01-10', value: 9 });
    expect(valueDaysAgo(obs, 365)).toBeNull();
    expect(valueDaysAgo([], 1)).toBeNull();
  });

  it('reports FX changes as relative and rate changes in percentage points', () => {
    const fx = summariseMacro(MACRO_MAP.get('EURUSD')!, daily('2026-01-01', [1.0, 1.1]))!;
    expect(fx.change1).toBeCloseTo(0.1);
    const rate = summariseMacro(MACRO_MAP.get('ECB-DFR')!, daily('2026-01-01', [2.25, 2.0]))!;
    expect(rate.change1).toBeCloseTo(-0.25);
    expect(rate.change30).toBeNull();
  });

  it('handles monthly dates', () => {
    const m = [
      { date: '2025-09', value: 2.2 },
      { date: '2025-10', value: 2.1 },
      { date: '2026-09', value: 2.0 },
    ];
    expect(valueDaysAgo(m, 365)?.date).toBe('2025-09');
    expect(summariseMacro(MACRO_MAP.get('HICP')!, m)!.change365).toBeCloseTo(-0.2);
  });

  it('computes cross rates on shared dates only', () => {
    const usd = [
      { date: '2026-10-19', value: 1.1 },
      { date: '2026-10-20', value: 1.2 },
    ];
    const jpy = [
      { date: '2026-10-20', value: 180 },
      { date: '2026-10-21', value: 181 },
    ];
    expect(crossRates(jpy, usd)).toEqual([{ date: '2026-10-20', value: 150 }]);
    expect(crossRates('EUR', usd)[1]!.value).toBeCloseTo(1 / 1.2);
  });

  it('finds the last policy-rate change', () => {
    expect(lastChange(daily('2026-01-01', [2.5, 2.5, 2.25, 2.25]))).toEqual({ date: '2026-01-03', from: 2.5, to: 2.25 });
    expect(lastChange(daily('2026-01-01', [2, 2]))).toBeNull();
  });

  it('exports a sourced CSV', () => {
    const lines = macroCsv(MACRO_MAP.get('EURUSD')!, daily('2026-10-20', [1.08]), 'test').split('\n');
    expect(lines[0]).toContain('Source: ECB statistics');
    expect(lines[0]).toContain('EXR.D.USD.EUR.SP00.A');
    expect(lines.slice(1)).toEqual(['date,value', '2026-10-20,1.08']);
  });
});
