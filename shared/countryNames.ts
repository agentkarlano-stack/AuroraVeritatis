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

/** All countries with their English names (every variant the library lists), for matching names in headlines. */
const ALL: { iso3: string; names: string[] }[] = (codes as string[][]).flatMap(([a2, a3]) => {
  const v = names[a2!];
  const list = (Array.isArray(v) ? v : v ? [v] : []).filter((n) => n.length > 3);
  return a3 && list.length ? [{ iso3: a3, names: list }] : [];
});

/** Countries (ISO3) named in a text, in order of first mention (whole words; names of four letters or more). */
export function countriesInHeadline(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ')} `;
  const hits: { iso3: string; at: number }[] = [];
  for (const c of ALL) {
    let at = -1;
    for (const n of c.names) {
      const i = t.indexOf(` ${n.toLowerCase().replace(/[^\p{L}\s]/gu, ' ')} `);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at >= 0) hits.push({ iso3: c.iso3, at });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.iso3);
}
