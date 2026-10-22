import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { useEffect, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { GeoEvent } from '../../shared/types';
import { CATEGORY_COLOR } from '../lib/events';

const SIZE = 520;
const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as (Feature<Geometry, { name: string }> & { id?: string })[];
const GRATICULE = geoGraticule10();

type Rot = { lon: number; lat: number };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Shortest way round in longitude. */
const lonDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/**
 * Orthographic globe for the guided World Briefing: it turns to centre the focused event (about 1.2 s, instant with
 * reduced motion). Natural Earth 110m boundaries (public domain); markers on the far side are hidden.
 */
export function BriefingGlobe({ events, focus, selectedId, onSelect }: { events: GeoEvent[]; focus: Rot | null; selectedId?: string | null; onSelect?: (e: GeoEvent) => void }) {
  const [rot, setRot] = useState<Rot>(() => focus ?? { lon: 15, lat: 20 });
  const rotRef = useRef(rot);
  const target = focus ? `${focus.lon},${focus.lat}` : null;

  useEffect(() => {
    if (!focus) return;
    const from = rotRef.current;
    const dLon = lonDelta(from.lon, focus.lon);
    const dLat = focus.lat - from.lat;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 0 : 1200;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const k = ease(t);
      const next = { lon: from.lon + dLon * k, lat: from.lat + dLat * k };
      rotRef.current = next;
      setRot(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Re-run only when the target coordinate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const r = SIZE / 2 - 4;
  const projection = geoOrthographic().scale(r).translate([SIZE / 2, SIZE / 2]).rotate([-rot.lon, -rot.lat]).clipAngle(90);
  const path = geoPath(projection);
  const centre: [number, number] = [rot.lon, rot.lat];

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block h-auto w-full max-w-[520px]" role="img" aria-label="Globe turning to each briefing event">
      <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="#121214" />
      <path d={path(GRATICULE) ?? undefined} fill="none" stroke="#232327" strokeWidth={0.6} />
      {COUNTRIES.map((c, i) => (
        <path key={c.id ?? i} d={path(c) ?? undefined} fill="#26262b" stroke="#55534e" strokeWidth={0.45} />
      ))}
      {events.map((e) => {
        if (geoDistance([e.lon, e.lat], centre) > Math.PI / 2 - 0.02) return null;
        const p = projection([e.lon, e.lat]);
        if (!p) return null;
        const sel = e.id === selectedId;
        const rad = 3 + e.severity * 1.3;
        return (
          <g key={e.id} transform={`translate(${p[0]} ${p[1]})`} className={onSelect ? 'cursor-pointer' : undefined} onClick={() => onSelect?.(e)}>
            {sel && <circle r={rad * 2.6} fill="none" stroke="#f1f0ec" strokeOpacity={0.7} strokeWidth={1.2} />}
            <circle
              r={rad}
              fill={CATEGORY_COLOR[e.category]}
              fillOpacity={e.provenance === 'simulated' ? 0.5 : 0.9}
              stroke={sel ? '#f1f0ec' : '#0d0d0e'}
              strokeWidth={sel ? 1.6 : 0.8}
              strokeDasharray={e.provenance === 'simulated' ? '2 1.5' : undefined}
            >
              <title>{e.title}</title>
            </circle>
          </g>
        );
      })}
      <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="#c9a35a" strokeOpacity={0.55} strokeWidth={1.2} />
    </svg>
  );
}
