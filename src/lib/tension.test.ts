import { describe, expect, it } from 'vitest';
import type { GeoEvent } from '../../shared/types';
import { DEFAULT_WEIGHTS, normaliseWeights, tensionHistory, weightSensitivity, worldTension } from './tension';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const ev = (daysAgo: number, category: GeoEvent['category'], severity: GeoEvent['severity']): GeoEvent => ({
  id: `${daysAgo}-${category}`,
  title: 't',
  summary: 's',
  category,
  severity,
  lat: 0,
  lon: 0,
  region: 'x',
  time: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  provenance: 'simulated',
  source: { name: 'test', url: '', license: '' },
});

describe('world tension index', () => {
  it('normalises weights to sum to 1 and guards bad input', () => {
    const w = normaliseWeights({ conflict: 3, security: 1, political: 0, energy: 0, humanitarian: 0, markets: 0 });
    expect(w.conflict).toBeCloseTo(0.75);
    expect(Object.values(normaliseWeights()).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(normaliseWeights({ conflict: -5, security: 0, political: 0, energy: 0, humanitarian: 0, markets: 0 })).toEqual(normaliseWeights());
    expect(normaliseWeights().conflict).toBeCloseTo(DEFAULT_WEIGHTS.conflict);
  });

  it('applies the published formula', () => {
    const r = worldTension([ev(1, 'conflict', 4)], 0.2, NOW, 14, { conflict: 1, security: 0, political: 0, energy: 0, humanitarian: 0, markets: 1 });
    // conflict: 100·(1 − e^(−4/8)); markets: 0.2/0.4·100 = 50; equal weights 0.5/0.5
    expect(r.value).toBeCloseTo(0.5 * 100 * (1 - Math.exp(-0.5)) + 0.5 * 50, 6);
  });

  it('ignores events outside the window and in the future', () => {
    const r = worldTension([ev(20, 'conflict', 5), ev(-2, 'conflict', 5)], 0, NOW, 14);
    expect(r.eventsConsidered).toBe(0);
    expect(r.value).toBe(0);
  });

  it('builds a daily history that responds when events enter the window', () => {
    const h = tensionHistory([ev(3, 'conflict', 5)], () => 0, 10, NOW, 2);
    expect(h).toHaveLength(10);
    expect(h.at(-1)!.date).toBe('2026-10-21');
    const day = (d: string) => h.find((p) => p.date === d)!.value;
    expect(day('2026-10-17')).toBe(0);
    expect(day('2026-10-18')).toBeGreaterThan(0);
    expect(day('2026-10-21')).toBe(0); // the event has left the 2-day window again
  });

  it('reports weight sensitivity bracketing the base value', () => {
    const s = weightSensitivity([ev(1, 'conflict', 5), ev(2, 'energy', 2)], 0.15, NOW);
    expect(s.range[0]).toBeLessThanOrEqual(s.base);
    expect(s.range[1]).toBeGreaterThanOrEqual(s.base);
    expect(s.perComponent).toHaveLength(6);
    const conflict = s.perComponent.find((p) => p.key === 'conflict')!;
    expect(conflict.doubled).toBeGreaterThan(s.base);
  });
});
