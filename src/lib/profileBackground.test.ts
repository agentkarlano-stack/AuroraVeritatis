import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../data/landmarks';
import { COUNTRIES_WITH_LANDMARKS, credit, landmarkById, landmarksFor, normalizeBackground, suggestCountry } from './profileBackground';

describe('profile backgrounds', () => {
  it('ships only photos with an author, a free licence and a Commons source', () => {
    const ok = /^(CC0|Public domain|CC BY(-SA)? [0-9.]+( [a-z]{2})?)$/;
    for (const l of LANDMARKS) {
      expect(l.license, l.id).toMatch(ok);
      expect(l.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(l.author.length).toBeGreaterThan(0);
      if (l.license.startsWith('CC BY')) expect(l.licenseUrl).toMatch(/creativecommons\.org/);
    }
    expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length);
  });
  it('covers the countries named in the directive', () => {
    for (const c of ['HUN', 'RUS', 'AUT', 'USA', 'JPN', 'GBR']) expect(landmarksFor(c).length, c).toBeGreaterThan(0);
    expect(COUNTRIES_WITH_LANDMARKS).toContain('HUN');
  });
  it('keeps only valid choices', () => {
    expect(normalizeBackground({ landmark: 'hun-1' })).toEqual({ landmark: 'hun-1' });
    expect(normalizeBackground({ landmark: 'nope' })).toBeNull();
    expect(normalizeBackground(undefined)).toBeNull();
  });
  it('suggests the recent research country only when nothing is chosen', () => {
    expect(suggestCountry(null, 'HUN')).toBe('HUN');
    expect(suggestCountry({ landmark: 'jpn-1' }, 'HUN')).toBeNull();
    expect(suggestCountry(null, 'ZZZ')).toBeNull();
    expect(suggestCountry(null, null)).toBeNull();
  });
  it('credits authors and marks adapted copies', () => {
    expect(credit(landmarkById('hun-1')!)).toBe('Photo: Pierre Blaché (CC0), via Wikimedia Commons');
    expect(credit(landmarkById('hun-3')!)).toBe('Photo: Jakub Hałun (CC BY-SA 4.0, resized), via Wikimedia Commons');
  });
});
