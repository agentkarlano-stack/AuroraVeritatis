import { describe, expect, it } from 'vitest';
import { metaFor, SITE } from './meta';

describe('page metadata', () => {
  it('uses the default title on the homepage', () => {
    expect(metaFor('/')).toMatchObject({ title: SITE.defaultTitle, canonical: 'https://aurorav.app/' });
  });

  it('suffixes the site name and normalises trailing slashes', () => {
    expect(metaFor('/radar/')).toMatchObject({ title: 'Global Radar · Aurora Veritatis', canonical: 'https://aurorav.app/radar' });
  });

  it('names country dossiers and canonicalises the code', () => {
    const m = metaFor('/countries/deu');
    expect(m.title).toBe('Germany: country dossier · Aurora Veritatis');
    expect(m.canonical).toBe('https://aurorav.app/countries/DEU');
    expect(m.description).toContain('World Bank');
  });

  it('marks private, legal-draft and unknown pages noindex', () => {
    expect(metaFor('/account').noindex).toBe(true);
    expect(metaFor('/legal/privacy')).toMatchObject({ title: 'Privacy Policy (draft) · Aurora Veritatis', noindex: true });
    expect(metaFor('/nope')).toMatchObject({ title: 'Page not found · Aurora Veritatis', noindex: true });
    expect(metaFor('/countries/XXX').noindex).toBe(true);
    expect(metaFor('/radar').noindex).toBeFalsy();
  });
});

describe('countryName', () => {
  it('matches the library alias naming without loading every locale', async () => {
    const { countryName } = await import('./countryNames');
    expect(countryName('DEU')).toBe('Germany');
    expect(countryName('usa')).toBe('United States');
    expect(countryName('XXX')).toBeUndefined();
  });
});
