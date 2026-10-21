import { geoCircle, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as (Feature<Geometry, { name: string }> & { id?: string })[];

interface Props {
  /** Diameter in px of the drawing area (the SVG is square). */
  size: number;
  /** Longitude / latitude at the centre of the view. */
  lon?: number;
  lat?: number;
  /** ISO 3166 numeric ids drawn in gold (e.g. the focus of a card). */
  highlight?: string[];
  className?: string;
  title?: string;
}

/**
 * Orthographic globe on Natural Earth 110m boundaries (public domain). Flat fills and hairlines only: charcoal land,
 * platinum borders, a faint graticule, a gold rim. Pure SVG, no animation of its own (callers drive `lon`).
 */
export function Globe({ size, lon = 15, lat = 22, highlight = [], className = '', title = 'Globe' }: Props) {
  const r = size / 2 - 2;
  const projection = geoOrthographic().scale(r).translate([size / 2, size / 2]).rotate([-lon, -lat]).clipAngle(90);
  const path = geoPath(projection);
  const hi = new Set(highlight);
  // A soft terminator-free "limb": a slightly smaller circle used as a darker inner disc for depth without gradients.
  const limb = geoCircle().center([lon, lat]).radius(88)();
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className} role="img" aria-label={title}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="#121214" />
      <path d={path(limb) ?? undefined} fill="#151517" />
      <path d={path(geoGraticule10()) ?? undefined} fill="none" stroke="#2a2a2f" strokeWidth={0.6} />
      {COUNTRIES.map((c, i) => (
        <path
          key={c.id ?? i}
          d={path(c) ?? undefined}
          fill={c.id && hi.has(c.id) ? 'rgba(201,163,90,0.55)' : '#26262b'}
          stroke={c.id && hi.has(c.id) ? '#c9a35a' : '#5e5c57'}
          strokeWidth={c.id && hi.has(c.id) ? 0.9 : 0.45}
        />
      ))}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#c9a35a" strokeOpacity={0.55} strokeWidth={1.2} />
    </svg>
  );
}
