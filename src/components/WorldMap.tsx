import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { GeoEvent } from '../../shared/types';
import { countryByNumeric } from '../lib/countries';
import { CATEGORY_COLOR } from '../lib/events';
import { canZoom, clampView, pinch, wheelFactor, zoomAround, type MapView } from '../lib/mapView';

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

  const [view, setViewState] = useState<MapView>({ k: 1, x: 0, y: 0 });
  // Latest view for the native wheel listener (registered once, outside React's render cycle).
  const viewRef = useRef<MapView>(view);
  const [animate, setAnimate] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hover, setHover] = useState<{ label: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef<{ px: number; py: number; x: number; y: number; moved: boolean; pinch?: { d: number; cx: number; cy: number; view: MapView } } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const setView = (next: MapView, smooth = false) => {
    viewRef.current = next;
    setAnimate(smooth);
    setViewState(next);
  };
  const flashHint = (text: string) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1600);
  };

  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const zoomAt = (factor: number, cx = W / 2, cy = H / 2, smooth = true) => setView(zoomAround(viewRef.current, factor, cx, cy, W, H), smooth);

  // Wheel: a native, non-passive listener so the page does not scroll while the map zooms (React's onWheel is
  // passive and cannot prevent scrolling). Wheel up zooms in, wheel down zooms out, around the cursor. At the zoom
  // limit the continuing gesture is absorbed; after a short pause the next wheel scrolls the page again.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let lastZoom = 0;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      const v = viewRef.current;
      if (!canZoom(v, e.deltaY)) {
        if (now - lastZoom < 350) {
          e.preventDefault();
          lastZoom = now;
          flashHint(e.deltaY > 0 ? 'Fully zoomed out. Pause, then scroll to move the page.' : 'Maximum zoom reached.');
        }
        return;
      }
      e.preventDefault();
      lastZoom = now;
      const r = el.getBoundingClientRect();
      const cx = ((e.clientX - r.left) / r.width) * W;
      const cy = ((e.clientY - r.top) / r.height) * H;
      setView(zoomAround(v, wheelFactor(e.deltaY, e.deltaMode), cx, cy, W, H));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // Registered once; it reads the latest view from viewRef.
  }, []);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      // Two fingers: pinch to zoom and move.
      const a = toSvg(pts[0]!.x, pts[0]!.y);
      const b = toSvg(pts[1]!.x, pts[1]!.y);
      gesture.current = { px: 0, py: 0, x: 0, y: 0, moved: true, pinch: { ...pinch(a, b), view: viewRef.current } };
      svgRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    gesture.current = { px: e.clientX, py: e.clientY, x: viewRef.current.x, y: viewRef.current.y, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const g = gesture.current;
    if (!g) return;
    if (g.pinch) {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const a = toSvg(pts[0]!.x, pts[0]!.y);
      const b = toSvg(pts[1]!.x, pts[1]!.y);
      const now = pinch(a, b);
      const start = g.pinch;
      const zoomed = zoomAround(start.view, now.d / Math.max(1, start.d), start.cx, start.cy, W, H);
      setView(clampView({ ...zoomed, x: zoomed.x + (now.cx - start.cx), y: zoomed.y + (now.cy - start.cy) }, W, H));
      return;
    }
    // One finger at full zoom-out scrolls the page (touch-action: pan-y); it pans only once zoomed in.
    if (e.pointerType === 'touch' && viewRef.current.k <= 1) return;
    const r = svgRef.current!.getBoundingClientRect();
    const dx = ((e.clientX - g.px) / r.width) * W;
    const dy = ((e.clientY - g.py) / r.height) * H;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      if (!g.moved) {
        svgRef.current!.setPointerCapture(e.pointerId);
        setGrabbing(true);
      }
      g.moved = true;
    }
    if (g.moved) setView(clampView({ ...viewRef.current, x: g.x + dx, y: g.y + dy }, W, H));
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    setGrabbing(false);
    if (gesture.current?.pinch && pointers.current.size < 2) {
      // Leaving a pinch never counts as a click on a country.
      const g = gesture.current;
      setTimeout(() => {
        if (gesture.current === g) gesture.current = null;
      }, 0);
      return;
    }
    // Cleared after the click handlers run, so a drag never counts as a click.
    setTimeout(() => (gesture.current = null), 0);
  };
  const wasDrag = () => gesture.current?.moved ?? false;

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = toSvg(e.clientX, e.clientY);
    zoomAt(e.shiftKey ? 0.5 : 2, p.x, p.y);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = 60;
    const v = viewRef.current;
    const keys: Record<string, () => void> = {
      '+': () => zoomAt(1.5),
      '=': () => zoomAt(1.5),
      '-': () => zoomAt(1 / 1.5),
      _: () => zoomAt(1 / 1.5),
      '0': () => setView({ k: 1, x: 0, y: 0 }, true),
      ArrowLeft: () => setView(clampView({ ...v, x: v.x + step }, W, H), true),
      ArrowRight: () => setView(clampView({ ...v, x: v.x - step }, W, H), true),
      ArrowUp: () => setView(clampView({ ...v, y: v.y + step }, W, H), true),
      ArrowDown: () => setView(clampView({ ...v, y: v.y - step }, W, H), true),
    };
    const run = keys[e.key];
    // Arrow keys only move the map once it is zoomed in, so they keep scrolling the page otherwise.
    if (!run || (e.key.startsWith('Arrow') && v.k <= 1)) return;
    e.preventDefault();
    run();
  };

  const highlight = new Set(highlightIso3);

  return (
    <div className={`relative overflow-hidden rounded-lg bg-ink-950 ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-full w-full select-none outline-none focus-visible:ring-1 focus-visible:ring-gold/60"
        role="application"
        aria-roledescription="interactive map"
        aria-label="World map. Scroll or pinch to zoom, drag to move. Keys: plus and minus zoom, arrows move, 0 resets."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') endDrag(e);
          setHover(null);
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        style={{ cursor: grabbing ? 'grabbing' : 'grab', touchAction: view.k > 1 ? 'none' : 'pan-y' }}
      >
        <g style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.k})`, transformOrigin: '0 0', transition: animate ? 'transform 180ms ease-out' : undefined }}>
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
        <MapButton label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 }, true)}>
          <RotateCcw className="h-3.5 w-3.5" />
        </MapButton>
      </div>
      {hint && (
        <div role="status" className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded border border-line bg-ink-900/95 px-2.5 py-1 text-xs text-mist shadow-lg">
          {hint}
        </div>
      )}
    </div>
  );
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
