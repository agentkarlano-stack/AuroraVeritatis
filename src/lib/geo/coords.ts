/** Geographic coordinates for display, e.g. "38.21° N, 141.40° E" (longitude wrapped to ±180°). */
export function formatLngLat(lng: number, lat: number): string {
  const w = ((((lng + 180) % 360) + 360) % 360) - 180;
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(w).toFixed(2)}° ${w >= 0 ? 'E' : 'W'}`;
}
