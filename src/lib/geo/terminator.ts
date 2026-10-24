/**
 * Day and night on the map: the subsolar point from the standard low-precision solar position formulas (accurate to
 * about 0.01° in declination, good for display) and the night-side polygon bounded by the terminator.
 */
const RAD = Math.PI / 180;

/** Latitude and longitude (degrees) where the sun is overhead at `date`. */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const d = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) / RAD;
  // Equation of time in degrees, normalised to ±180.
  const eqt = ((((q - ra) % 360) + 540) % 360) - 180;
  const utcHours = (date.getTime() % 86_400_000) / 3_600_000;
  const lon = ((((-15 * (utcHours - 12) - eqt) % 360) + 540) % 360) - 180;
  return { lat: dec, lon };
}

/** Sun elevation (degrees) at a place; negative means night. */
export function solarElevation(lat: number, lon: number, date: Date): number {
  const s = subsolarPoint(date);
  const cosZ = Math.sin(lat * RAD) * Math.sin(s.lat * RAD) + Math.cos(lat * RAD) * Math.cos(s.lat * RAD) * Math.cos((lon - s.lon) * RAD);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
}

/** GeoJSON polygon covering the night side of the Earth at `date` (sun below the horizon). */
export function nightPolygon(date: Date, step = 2): GeoJSON.Feature<GeoJSON.Polygon> {
  const s = subsolarPoint(date);
  // Avoid tan(0) at the equinoxes.
  const dec = Math.abs(s.lat) < 0.01 ? (s.lat < 0 ? -0.01 : 0.01) : s.lat;
  const line: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += step) {
    const lat = Math.atan(-Math.cos((lon - s.lon) * RAD) / Math.tan(dec * RAD)) / RAD;
    line.push([lon, lat]);
  }
  // The pole away from the sun is in darkness; close the polygon over it.
  const pole = dec > 0 ? -90 : 90;
  const ring: [number, number][] = [...line, [180, pole], [-180, pole], line[0]!];
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
