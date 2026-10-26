import { describe, expect, it } from 'vitest';
import { groupLayers, panelCategoryOf, PANEL_CATEGORIES, searchLayers } from './layerFinder';
import { GEO_LAYERS, LAYER_MAP } from './layers';

describe('layer finder', () => {
  it('finds common layers by everyday words', () => {
    expect(searchLayers('airports').map((l) => l.id)).toContain('airports');
    expect(searchLayers('coat of arms').map((l) => l.id)).toContain('coats-of-arms');
    expect(searchLayers('arms').map((l) => l.id)).toContain('coats-of-arms');
    expect(searchLayers('ships').map((l) => l.id)).toContain('maritime');
    expect(searchLayers('NATO').map((l) => l.id)).toContain('alliances');
    expect(searchLayers('flood').map((l) => l.id)).toContain('disasters');
    expect(searchLayers('')).toHaveLength(GEO_LAYERS.length);
  });

  it('places every layer in a panel category and every spec category has at least one entry', () => {
    const groups = groupLayers(GEO_LAYERS);
    expect(groups.reduce((n, g) => n + g.layers.length, 0)).toBe(GEO_LAYERS.length);
    for (const c of PANEL_CATEGORIES) expect(groups.map((g) => g.category)).toContain(c);
    expect(panelCategoryOf(LAYER_MAP.get('earthquakes')!)).toBe('Events');
    expect(panelCategoryOf(LAYER_MAP.get('blue-marble')!)).toBe('Base Map');
  });
});
