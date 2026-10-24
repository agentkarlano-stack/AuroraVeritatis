import { describe, expect, it } from 'vitest';
import { nightPolygon, solarElevation, subsolarPoint } from './terminator';

/** Ray-casting point-in-polygon on lon/lat (enough for the night polygon, which never crosses itself). */
function inside(ring: number[][], lon: number, lat: number) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > lat !== yj! > lat && lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) c = !c;
  }
  return c;
}

describe('day and night', () => {
  it('puts the sun over the tropics at the solstices and near noon meridian at 12:00 UTC', () => {
    const june = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
    expect(june.lat).toBeCloseTo(23.44, 1);
    expect(Math.abs(june.lon)).toBeLessThan(1);
    const dec = subsolarPoint(new Date('2026-12-21T12:00:00Z'));
    expect(dec.lat).toBeCloseTo(-23.44, 1);
    // Six hours later the sun is 90° further west.
    expect(subsolarPoint(new Date('2026-06-21T18:00:00Z')).lon).toBeCloseTo(june.lon - 90, 0);
  });

  it('shades the side away from the sun', () => {
    const t = new Date('2026-06-21T12:00:00Z');
    expect(solarElevation(51.5, 0, t)).toBeGreaterThan(50); // London at noon in June
    expect(solarElevation(-33.9, 151.2, t)).toBeLessThan(0); // Sydney at night
    const ring = nightPolygon(t).geometry.coordinates[0]!;
    expect(inside(ring, 151.2, -33.9)).toBe(true);
    expect(inside(ring, 0, 51.5)).toBe(false);
    expect(inside(ring, 0, -85)).toBe(true); // polar night in the Antarctic in June
  });

  it('agrees with the sun elevation everywhere (away from the terminator itself)', () => {
    for (const iso of ['2026-03-20T06:00:00Z', '2026-06-21T12:00:00Z', '2026-09-23T18:00:00Z', '2026-12-21T03:30:00Z', '2026-10-24T14:10:00Z']) {
      const t = new Date(iso);
      const ring = nightPolygon(t, 1).geometry.coordinates[0]!;
      for (let lat = -80; lat <= 80; lat += 10) {
        for (let lon = -170; lon <= 170; lon += 10) {
          const el = solarElevation(lat, lon, t);
          if (Math.abs(el) < 2) continue;
          expect(inside(ring, lon, lat), `${iso} ${lat},${lon} elevation ${el.toFixed(1)}`).toBe(el < 0);
        }
      }
    }
  });
});
