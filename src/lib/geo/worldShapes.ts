/** World country shapes (Natural Earth via world-atlas, public domain) shared by the map renderers. */
import type { FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-50m.json';
import { countryByNumeric } from '../countries';

/** Bounding box of a geometry as [west, south, east, north]; uses the largest part for countries spanning the antimeridian. */
export function bbox(g: Geometry): [number, number, number, number] | null {
  const polys =
    g.type === "Polygon"
      ? [g.coordinates]
      : g.type === "MultiPolygon"
        ? g.coordinates
        : [];
  let best: [number, number, number, number] | null = null;
  let bestArea = -1;
  for (const poly of polys) {
    let w = 180,
      so = 90,
      e = -180,
      n = -90;
    for (const [x, y] of poly[0] ?? []) {
      w = Math.min(w, x!);
      e = Math.max(e, x!);
      so = Math.min(so, y!);
      n = Math.max(n, y!);
    }
    const area = (e - w) * (n - so);
    if (area > bestArea) {
      bestArea = area;
      best = [w, so, e, n];
    }
  }
  return best;
}

/**
 * Country outlines as lines without the artificial edges of the data: segments along the antimeridian or the south pole
 * and jumps across the antimeridian (which a flat projection draws as lines across the whole map).
 */
function borderLines(fc: FeatureCollection<Geometry, Record<string, unknown>>): FeatureCollection<Geometry, Record<string, unknown>> {
  const artificial = (a: number[], b: number[]) =>
    Math.abs(a[0]! - b[0]!) > 180 ||
    (Math.abs(a[0]!) >= 179.999 && Math.abs(b[0]!) >= 179.999) ||
    (a[1]! <= -89.9 && b[1]! <= -89.9);
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const lines: number[][][] = [];
      for (const ring of polys.flat()) {
        let cur: number[][] = [];
        for (let i = 0; i < ring.length; i++) {
          const pt = ring[i]!;
          if (i > 0 && artificial(ring[i - 1]!, pt)) {
            if (cur.length > 1) lines.push(cur);
            cur = [];
          }
          cur.push(pt);
        }
        if (cur.length > 1) lines.push(cur);
      }
      return { ...f, geometry: { type: "MultiLineString", coordinates: lines } };
    }),
  };
}

const topo = world as unknown as Topology<{
  countries: GeometryCollection<{ name: string }>;
}>;
const POLITICAL = [
  "#3a3630",
  "#33393a",
  "#3b3437",
  "#36392f",
  "#3d3a2c",
  "#30353b",
];
/** Countries with ISO3, name and a stable political tint (computed once). */
export const COUNTRIES: FeatureCollection<
  Geometry,
  Record<string, string | number | null>
> = (() => {
  const fc = feature(topo, topo.objects.countries) as FeatureCollection<
    Geometry,
    { name: string }
  >;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f, i) => {
      const ref = countryByNumeric((f as { id?: string }).id);
      return {
        ...f,
        id: i,
        properties: {
          iso3: ref?.iso3 ?? null,
          name: ref?.name ?? f.properties.name,
          tint: POLITICAL[
            (Number((f as { id?: string }).id) || i) % POLITICAL.length
          ]!,
        },
      };
    }),
  };
})();
/** Border lines (computed once). */
export const BORDERS = borderLines(COUNTRIES);

/** Centre of a country's main landmass bounding box as [lon, lat], or null when unknown. */
export function countryCentre(iso3: string): [number, number] | null {
  const f = COUNTRIES.features.find((x) => x.properties.iso3 === iso3);
  const b = f ? bbox(f.geometry) : null;
  return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}
