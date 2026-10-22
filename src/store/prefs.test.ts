import { describe, expect, it } from 'vitest';
import { WIDGETS, normalizeLayout } from './prefs';

describe('Headquarters layout', () => {
  it('drops unknown and duplicate widgets and inserts new ones at their default position', () => {
    const all = WIDGETS.map((w) => w.id);
    expect(normalizeLayout(undefined)).toEqual(all);
    // A layout saved before the Brain and Data Freshness widgets existed, reordered by the user.
    const old = normalizeLayout(['notes', 'briefing', 'tension', 'events', 'markets', 'watchlist', 'countries', 'alerts', 'gone', 'notes']);
    expect(old.slice(0, 8)).toEqual(['notes', 'briefing', 'tension', 'events', 'markets', 'watchlist', 'countries', 'alerts']);
    expect(old).toContain('brain');
    expect(old).toContain('freshness');
    expect(old).toHaveLength(all.length);
    expect(new Set(old).size).toBe(all.length);
  });
});
