import { describe, expect, it } from 'vitest';
import { locateCountry } from './locate';

describe('locateCountry', () => {
  it('finds the country containing a point', () => {
    expect(locateCountry(10.45, 51.17)).toMatchObject({ country: { iso3: 'DEU' }, how: 'inside' });
    expect(locateCountry(-64.6, -31.4)).toMatchObject({ country: { iso3: 'ARG' }, how: 'inside' });
  });
  it('prefers the source country name', () => {
    expect(locateCountry(0, 0, 'Indonesia')).toMatchObject({ country: { iso3: 'IDN' }, how: 'name' });
  });
  it('uses the nearest country for offshore points, within the limit only', () => {
    const off = locateCountry(142.4, 37.8); // off the coast of Honshu
    expect(off?.country.iso3).toBe('JPN');
    expect(off?.how).toBe('nearest');
    expect(locateCountry(-140, -40)).toBeUndefined(); // South Pacific
  });
});
