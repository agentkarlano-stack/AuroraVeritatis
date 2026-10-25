import { describe, expect, it } from 'vitest';
import { WIDGETS, normalizeLayout } from './prefs';

describe('HQ layout', () => {
  it('drops unknown and duplicate widgets and inserts new ones at their default position', () => {
    const all = WIDGETS.map((w) => w.id);
    expect(normalizeLayout(undefined)).toEqual(all);
    // A layout saved before the HQ workspace widgets, reordered by the user: retired widgets are dropped, the user's
    // order is kept, and the new widgets take their default places (resume, following, saved and quick access first).
    const old = normalizeLayout(['notes', 'briefing', 'tension', 'events', 'markets', 'watchlist', 'countries', 'alerts', 'gone', 'notes']);
    expect(old.slice(0, 4)).toEqual(['resume', 'following', 'saved', 'quick']);
    expect(old.filter((w) => ['notes', 'tension', 'markets', 'watchlist', 'countries', 'alerts'].includes(w))).toEqual(['notes', 'tension', 'markets', 'watchlist', 'countries', 'alerts']);
    expect(old).toContain('brain');
    expect(old).toContain('preferences');
    expect(old).toHaveLength(all.length);
    expect(new Set(old).size).toBe(all.length);
  });
});
