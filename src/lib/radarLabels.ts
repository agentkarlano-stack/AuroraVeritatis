/** Small display helpers for Global Radar and the country panel. */
/** Regional indicator flag emoji for an ISO 3166-1 alpha-2 code ("" when invalid). */
export function flagEmoji(iso2: string): string {
  return /^[A-Z]{2}$/.test(iso2) ? String.fromCodePoint(...[...iso2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';
}

/** "12 min ago", "3 h ago", "2 days ago". */
export function age(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
