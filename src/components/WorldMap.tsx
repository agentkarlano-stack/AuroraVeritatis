import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { GeoEvent } from '../../shared/types';
import { countryByNumeric } from '../lib/countries';
import { CATEGORY_COLOR } from '../lib/events';

const W = 960;
const H = 500;

type CountryFeature = Feature<Geometry, { name: string }> & { id?: string };

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRY_FEATURES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as CountryFeature[];

interface Props {
  events: GeoEvent[];
  selectedEventId?: string | null;
  highlightIso3?: string[];
  onEventClick?: (e: GeoEvent) => void;
  onCountryClick?: (iso3: string, name: string) => void;
  className?: string;
}

export function WorldMap({ events, selectedEventId, highlightIso3 = [], onEventClick, onCountryClick, className = '' }: Props) {
  const projection = useMemo(() => geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' }), []);
  const path = useMemo(() => geoPath(projection), [projection]);
  const shapes = useMemo(
    () =>
      COUNTRY_FEATURES.map((f) => {
        const ref = countryByNumeric(f.id);
        return { key: String(f.id ?? f.properties.name), d: path(f) ?? '', name: ref?.name ?? f.properties.name, iso3: ref?.iso3 };
      }),
    [path],
  );
  const graticule = useMemo(() => path(geoGraticule10()) ?? '', [path]);
  const sphere = useMemo(() => path({ type: 'Sphere' }) ?? '', [path]);

  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ label: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const zoomAt = (factor: number, cx = W / 2, cy = H / 2) =>
    setView((v) => {
      const k = Math.min(12, Math.max(1, v.k * factor));
      const f = k / v.k;
      return clamp({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f });
    });

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey && view.k === 1 && e.deltaY > 0) return;
    const p = toSvg(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = svgRef.current!.getBoundingClientRect();
    const dx = ((e.clientX - d.px) / r.width) * W;
    const dy = ((e.clientY - d.py) / r.height) * H;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      if (!d.moved) {
        svgRef.current!.setPointerCapture(e.pointerId);
        setGrabbing(true);
      }
      d.moved = true;
    }
    if (d.moved) setView((v) => clamp({ ...v, x: d.x + dx, y: d.y + dy }));
  };
  const endDrag = () => {
    setGrabbing(false);
    // Cleared after the click handlers run, so a drag never counts as a click.
    setTimeout(() => (drag.current = null), 0);
  };
  const wasDrag = () => drag.current?.moved ?? false;

  const highlight = new Set(highlightIso3);

  return (
    <div className={`relative overflow-hidden rounded-lg bg-ink-950 ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-full w-full touch-none select-none"
        role="img"
        aria-label="World map with event markers"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          endDrag();
          setHover(null);
        }}
        style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <path d={sphere} fill="#141416" />
          <path d={graticule} fill="none" stroke="#1f1f23" strokeWidth={0.5 / view.k} />
          {shapes.map((s) => (
            <path
              key={s.key}
              d={s.d}
              fill={s.iso3 && highlight.has(s.iso3) ? '#3b3528' : '#26262a'}
              stroke="#3a3a40"
              strokeWidth={0.5 / view.k}
              className={s.iso3 && onCountryClick ? 'cursor-pointer transition-colors hover:fill-[#3a372f]' : ''}
              onMouseMove={(e) => {
                const p = toSvg(e.clientX, e.clientY);
                setHover({ label: s.name, x: p.x, y: p.y });
              }}
              onClick={() => {
                if (!wasDrag() && s.iso3 && onCountryClick) onCountryClick(s.iso3, s.name);
              }}
            />
          ))}
          {events.map((ev) => {
            const pt = projection([ev.lon, ev.lat]);
            if (!pt) return null;
            const selected = ev.id === selectedEventId;
            const r = (2.5 + ev.severity * 1.4) / view.k;
            return (
              <g key={ev.id} transform={`translate(${pt[0]},${pt[1]})`}>
                {ev.severity >= 4 && <circle r={r * 2.2} fill={CATEGORY_COLOR[ev.category]} opacity={0.15} />}
                <circle
                  r={r}
                  fill={CATEGORY_COLOR[ev.category]}
                  fillOpacity={ev.provenance === 'simulated' ? 0.55 : 0.85}
                  stroke={selected ? '#f1f0ec' : '#0d0d0e'}
                  strokeWidth={(selected ? 2 : 0.8) / view.k}
                  strokeDasharray={ev.provenance === 'simulated' ? `${2 / view.k} ${1.5 / view.k}` : undefined}
                  className="cursor-pointer"
                  role="button"
                  aria-label={ev.title}
                  tabIndex={0}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                    const p = toSvg(e.clientX, e.clientY);
                    setHover({ label: ev.title, x: p.x, y: p.y });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!wasDrag()) onEventClick?.(ev);
                  }}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEventClick?.(ev)}
                />
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-full rounded border border-line bg-ink-900/95 px-2 py-1 text-xs text-platinum shadow-lg"
          style={{ left: `${(hover.x / W) * 100}%`, top: `calc(${(hover.y / H) * 100}% - 8px)` }}
        >
          {hover.label}
        </div>
      )}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => zoomAt(1.5)}>
          <Plus className="h-4 w-4" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomAt(1 / 1.5)}>
          <Minus className="h-4 w-4" />
        </MapButton>
        <MapButton label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
          <RotateCcw className="h-3.5 w-3.5" />
        </MapButton>
      </div>
    </div>
  );
}

function clamp(v: { k: number; x: number; y: number }) {
  const minX = W - W * v.k;
  const minY = H - H * v.k;
  return { k: v.k, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-ink-900/90 text-mist hover:border-gold-dim hover:text-gold-soft"
    >
      {children}
    </button>
  );
}
