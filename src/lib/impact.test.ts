import { describe, expect, it } from 'vitest';
import { correlation, correlationMatrix, eventWindow } from './impact';

describe('market impact statistics', () => {
  it('computes Pearson correlation', () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNaN();
  });

  it('builds a symmetric matrix with unit diagonal', () => {
    const a = [100, 101, 99, 102, 103, 101];
    const b = [50, 50.5, 49.4, 51.2, 51.4, 50.6];
    const m = correlationMatrix([a, b], 10);
    expect(m[0]![0]).toBeCloseTo(1);
    expect(m[0]![1]).toBeCloseTo(m[1]![0]!);
    expect(m[0]![1]!).toBeGreaterThan(0.9);
  });

  it('flags an abnormal post-event move', () => {
    const calm = Array.from({ length: 80 }, (_, i) => 100 * (1 + 0.001 * Math.sin(i)));
    const closes = [...calm, ...[110, 111, 112, 112, 113, 113]];
    const w = eventWindow(closes, 80, 5, 60)!;
    expect(w.cumulative).toBeGreaterThan(0.1);
    expect(w.zScore).toBeGreaterThan(5);
    expect(eventWindow(closes, 3, 5, 60)).toBeNull();
  });
});
