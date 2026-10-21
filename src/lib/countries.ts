import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(en);

export interface CountryRef {
  iso3: string;
  iso2: string;
  numeric: string;
  name: string;
}

export const COUNTRIES: CountryRef[] = Object.entries(countries.getNames('en', { select: 'official' }))
  .map(([iso2]) => ({
    iso2,
    iso3: countries.alpha2ToAlpha3(iso2) ?? '',
    numeric: countries.alpha2ToNumeric(iso2) ?? '',
    name: countries.getName(iso2, 'en', { select: 'alias' }) ?? countries.getName(iso2, 'en') ?? iso2,
  }))
  .filter((c) => c.iso3)
  .sort((a, b) => a.name.localeCompare(b.name));

const byIso3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
const byNumeric = new Map(COUNTRIES.map((c) => [c.numeric, c]));

export function countryByIso3(iso3: string | undefined): CountryRef | undefined {
  return iso3 ? byIso3.get(iso3.toUpperCase()) : undefined;
}

/** world-atlas features use zero-padded ISO 3166-1 numeric ids, e.g. "004". */
export function countryByNumeric(id: string | number | undefined): CountryRef | undefined {
  if (id === undefined) return undefined;
  return byNumeric.get(String(id).padStart(3, '0'));
}

export function searchCountries(q: string, limit = 8): CountryRef[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return COUNTRIES.filter((c) => c.name.toLowerCase().includes(s) || c.iso3.toLowerCase() === s).slice(0, limit);
}

/** Parse a comma-separated list such as "deu,FRA,xx" into unique, well-formed ISO3 codes (at most `max`). */
export function parseIsoList(raw: string | null, max = 4): string[] {
  const out: string[] = [];
  for (const c of (raw ?? '').toUpperCase().split(',')) {
    const code = c.trim();
    if (/^[A-Z]{3}$/.test(code) && !out.includes(code)) out.push(code);
  }
  return out.slice(0, max);
}
