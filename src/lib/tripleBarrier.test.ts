import { describe, expect, it } from 'vitest';
import { barrierStats, crossSignals, ewmaVol, tripleBarrier, uniqueness } from './tripleBarrier';

const params = { up: 1, down: 1, maxHold: 4, volSpan: 3, costBps: 0 };

describe('triple barrier', () => {
  it('labels the first barrier touched and the time limit', () => {
    // Constant ±1 % noise gives σ ≈ 1 %; width = σ·√4 = 2 %.
    const base = [100, 101, 100, 101, 100, 101];
    const up = [...base, 101.5, 104, 99, 99];
    const down = [...base, 100.5, 97, 105, 105];
    const flat = [...base, 101.2, 100.8, 101.2, 100.8];
    const e = 5;
    expect(tripleBarrier(up, [e], params)[0]).toMatchObject({ label: 1, exit: 7 });
    expect(tripleBarrier(down, [e], params)[0]).toMatchObject({ label: -1, exit: 7 });
    expect(tripleBarrier(flat, [e], params)[0]).toMatchObject({ label: 0, exit: 9 });
  });

  it('uses only past information for the barrier width (no look-ahead)', () => {
    const a = [100, 101, 100, 101, 100, 101, 101.5, 104, 99, 99];
    const b = [...a.slice(0, 6), 140, 60, 140, 140];
    const va = ewmaVol(a, 3);
    const vb = ewmaVol(b, 3);
    expect(va[5]).toBe(vb[5]);
    expect(tripleBarrier(a, [5], params)[0]!.upper).toBe(tripleBarrier(b, [5], params)[0]!.upper);
  });

  it('skips events that cannot be resolved and charges costs', () => {
    const c = [100, 101, 100, 101, 100, 101, 101.5, 104];
    expect(tripleBarrier(c, [5], params)).toHaveLength(0); // needs 4 future periods
    const d = [100, 101, 100, 101, 100, 101, 101.5, 104, 99, 99, 99];
    const [ev] = tripleBarrier(d, [5], { ...params, costBps: 20 });
    expect(ev!.ret).toBeCloseTo(104 / 101 - 1 - 0.002, 10);
  });

  it('measures overlap with average uniqueness', () => {
    const events = [
      { entry: 0, exit: 4, label: 0 as const, ret: 0, upper: 0, lower: 0, sigma: 0 },
      { entry: 2, exit: 6, label: 0 as const, ret: 0, upper: 0, lower: 0, sigma: 0 },
    ];
    // Periods 3-4 are shared by both; each event has 2 of 4 periods alone: uniqueness (1+1+0.5+0.5)/4 = 0.75.
    expect(uniqueness(events, 10)).toEqual([0.75, 0.75]);
  });

  it('crossover signals and summary statistics', () => {
    const closes = Array.from({ length: 300 }, (_, t) => 100 * Math.exp(0.002 * t + 0.05 * Math.sin(t / 7)));
    const sig = crossSignals(closes, 5, 20);
    expect(sig.length).toBeGreaterThan(3);
    const ev = tripleBarrier(closes, sig, { up: 2, down: 1, maxHold: 10, volSpan: 20, costBps: 10 });
    const s = barrierStats(closes, ev);
    expect(s.upper + s.lower + s.timeout).toBe(s.events);
    expect(s.effectiveN).toBeLessThanOrEqual(s.events + 1e-9);
    if (s.meanCi) expect(s.meanCi[0]).toBeLessThanOrEqual(s.meanCi[1]);
  });
});
