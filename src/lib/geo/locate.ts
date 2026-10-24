import { geoContains, geoDistance } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { countryByNumeric, COUNTRIES, type CountryRef } from '../countries';

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const FEATURES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as Feature<Geometry, { name: string }>[];
const EARTH_KM = 6371;

export interface Located {
  country: CountryRef;
  /** inside: the point is within the borders; name: matched from the source's country field; nearest: offshore. */
  how: 'inside' | 'name' | 'nearest';
  /** Distance to the nearest border vertex, for `nearest` (km, approximate at 1:110m). */
  km?: number;
}

function vertices(g: Geometry): Position[] {
  if (g.type === 'Polygon') return g.coordinates.flat();
  if (g.type === 'MultiPolygon') return g.coordinates.flat(2);
  return [];
}

/**
 * The country of an event: a match on the source's own country name first (GDACS), then the borders containing the
 * point (Natural Earth 1:110m), then the nearest country within `maxKm` for offshore events. Undefined beyond that.
 */
export function locateCountry(lon: number, lat: number, sourceName?: string, maxKm = 400): Located | undefined {
  const name = sourceName?.split(/[,;]/)[0]?.trim().toLowerCase();
  if (name) {
    const c = COUNTRIES.find((x) => x.name.toLowerCase() === name);
    if (c) return { country: c, how: 'name' };
  }
  const inside = FEATURES.find((f) => geoContains(f, [lon, lat]));
  const c = inside && countryByNumeric(inside.id);
  if (c) return { country: c, how: 'inside' };
  let best: { f: Feature<Geometry, { name: string }>; d: number } | undefined;
  for (const f of FEATURES) {
    for (const p of vertices(f.geometry)) {
      const d = geoDistance([lon, lat], p as [number, number]);
      if (!best || d < best.d) best = { f, d };
    }
  }
  const km = best ? best.d * EARTH_KM : Infinity;
  const near = best && km <= maxKm ? countryByNumeric(best.f.id) : undefined;
  return near ? { country: near, how: 'nearest', km: Math.round(km) } : undefined;
}
