import { describe, expect, it } from 'vitest';
import { PAGES, searchItems } from './search';

describe('quick search', () => {
  it('returns pages when the query is empty', () => {
    expect(searchItems('')).toEqual(PAGES.slice(0, 8));
  });

  it('ranks exact and prefix matches first across groups', () => {
    const r = searchItems('germ');
    expect(r[0]).toMatchObject({ group: 'Countries', label: 'Germany', to: '/countries/DEU' });
    expect(searchItems('DEU')[0]?.to).toBe('/countries/DEU');
    expect(searchItems('gold')[0]).toMatchObject({ group: 'Instruments', label: 'GOLD.D' });
    expect(searchItems('radar').map((x) => x.label)).toContain('Global Radar');
  });

  it('returns nothing for nonsense and respects the limit', () => {
    expect(searchItems('zzzqqq')).toEqual([]);
    expect(searchItems('a', undefined, 5)).toHaveLength(5);
  });
});
