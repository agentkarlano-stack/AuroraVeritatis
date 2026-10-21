import { describe, expect, it } from 'vitest';
import { INSTRUMENT_MAP } from '../data/instruments';
import { SCENARIO_TEMPLATES, scenarioTree } from './scenario';

describe('scenario tree', () => {
  it('splits paths by event occurrence', () => {
    const terminal = Float64Array.from([80, 90, 110, 120, 130]);
    const jumped = Uint8Array.from([1, 1, 0, 0, 0]);
    const t = scenarioTree(terminal, jumped, 100);
    expect(t.occurred).toMatchObject({ n: 2, share: 0.4, median: 85, probLoss: 1 });
    expect(t.notOccurred).toMatchObject({ n: 3, share: 0.6, median: 120, probLoss: 0 });
  });

  it('returns null for an empty branch', () => {
    expect(scenarioTree(Float64Array.from([1, 2]), Uint8Array.from([0, 0]), 1).occurred).toBeNull();
  });

  it('templates reference demo instruments and valid parameters', () => {
    for (const t of SCENARIO_TEMPLATES) {
      expect(INSTRUMENT_MAP.has(t.symbol)).toBe(true);
      expect(t.probability).toBeGreaterThan(0);
      expect(t.probability).toBeLessThanOrEqual(1);
      expect(t.sd).toBeGreaterThanOrEqual(0);
    }
  });
});
