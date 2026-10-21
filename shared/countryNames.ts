// Direct imports of the data files: the i18n-iso-countries entry point `require()`s every locale at runtime,
// which the Workers runtime does not support. This module is safe for both the Worker and the browser.
import codes from 'i18n-iso-countries/codes.json';
import en from 'i18n-iso-countries/langs/en.json';

const alpha3To2 = new Map((codes as string[][]).map(([a2, a3]) => [a3!, a2!]));
const names = en.countries as Record<string, string | string[]>;

/** English short name for an ISO 3166-1 alpha-3 code (the library's "alias" form), or undefined if unknown. */
export function countryName(iso3: string): string | undefined {
  const a2 = alpha3To2.get(iso3.toUpperCase());
  const v = a2 ? names[a2] : undefined;
  return Array.isArray(v) ? (v[1] ?? v[0]) : v;
}
