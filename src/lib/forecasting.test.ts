import { describe, expect, it } from 'vitest';
import { brier, byCategory, calibration, logScore, parsePercent, summarize, toCsv, type Forecast } from './forecasting';

const f = (p: number, outcome?: Forecast['outcome'], category = 'Economy'): Forecast => ({ id: `${p}-${outcome}`, question: `Q ${p}`, criteria: 'c', category, closes: '2026-12-31', history: [{ at: '2026-10-01', p: 0.5 }, { at: '2026-10-10', p }], ...(outcome ? { outcome } : {}) });

describe('forecast scoring', () => {
  it('scores with proper scoring rules, using the latest probability', () => {
    expect(brier(f(0.8, 'yes'))).toBeCloseTo(0.04);
    expect(brier(f(0.8, 'no'))).toBeCloseTo(0.64);
    expect(brier(f(0.8))).toBeNull();
    expect(brier(f(0.8, 'void'))).toBeNull();
    expect(logScore(f(0.8, 'yes'))).toBeCloseTo(Math.log(0.8));
    expect(logScore(f(0.8, 'no'))).toBeCloseTo(Math.log(0.2));
  });

  it('summarises against the coin-flip baseline', () => {
    const s = summarize([f(0.9, 'yes'), f(0.3, 'no'), f(0.5, 'yes'), f(0.7), f(0.6, 'void')]);
    expect(s.resolved).toBe(3);
    expect(s.open).toBe(1);
    expect(s.meanBrier).toBeCloseTo((0.01 + 0.09 + 0.25) / 3);
    expect(s.baselineBrier).toBe(0.25);
    expect(s.hitRate).toBeCloseTo((1 + 1 + 0.5) / 3);
    expect(summarize([]).meanBrier).toBeNull();
  });

  it('builds a reliability diagram and per-category scores', () => {
    const fs = [f(0.65, 'yes'), f(0.62, 'no'), f(0.68, 'yes'), f(0.15, 'no'), f(1, 'yes')];
    const bins = calibration(fs);
    expect(bins).toHaveLength(10);
    expect(bins[6]).toMatchObject({ count: 3, observed: 2 / 3 });
    expect(bins[6]!.meanForecast).toBeCloseTo(0.65);
    expect(bins[9]!.count).toBe(1); // 100% lands in the top bin
    expect(bins[3]).toMatchObject({ count: 0, observed: null });
    expect(byCategory([f(0.9, 'yes', 'Markets'), f(0.6, 'no', 'Economy')]).map((c) => c.category)).toEqual(['Markets', 'Economy']);
  });

  it('accepts 1–99% only and exports CSV', () => {
    expect(parsePercent('65')).toBeCloseTo(0.65);
    expect(parsePercent('12.5%')).toBeCloseTo(0.125);
    expect(parsePercent('0')).toBeNull();
    expect(parsePercent('100')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(toCsv([f(0.8, 'yes')])).toBe('question,category,closes,current_probability,revisions,outcome,brier\n"Q 0.8","Economy",2026-12-31,0.800,2,yes,0.0400\n');
  });
});
