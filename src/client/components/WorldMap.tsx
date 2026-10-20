import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { CHOKEPOINTS, type Chokepoint } from "../../shared/data/chokepoints";
import { countryByNumeric, type CountryRecord } from "../../shared/data/countries";
import type { GeoEvent } from "../../shared/data/sampleEvents";
import { feature, type Feature, type Topology } from "../../shared/geo/topojson";

const W = 960;
const H = 500;

export const SEVERITY_COLORS = ["#6B5D4E", "#8F6C46", "#C98D4C", "#D9714F", "#E5534B"] as const;
export const severityColor = (s: number) => SEVERITY_COLORS[Math.max(1, Math.min(5, s)) - 1]!;

type WorldState = { status: "loading" } | { status: "ready"; features: Feature[] } | { status: "unavailable" };

let worldCache: Promise<Feature[]> | null = null;

function loadWorld(): Promise<Feature[]> {
  worldCache ??= fetch("/geo/countries-110m.json")
    .then((r) => {
      if (!r.ok) throw new Error("basemap missing");
      return r.json() as Promise<Topology>;
    })
    .then((topo) => feature(topo, "countries").features)
    .catch((e) => {
      worldCache = null;
      throw e;
    });
  return worldCache;
}

export function useWorld(): WorldState {
  const [state, setState] = useState<WorldState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    loadWorld()
      .then((features) => live && setState({ status: "ready", features }))
      .catch(() => live && setState({ status: "unavailable" }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export type MapSelection =
  | { kind: "country"; country: CountryRecord }
  | { kind: "chokepoint"; chokepoint: Chokepoint }
  | { kind: "event"; event: GeoEvent }
  | null;

interface WorldMapProps {
  events?: GeoEvent[];
  showChokepoints?: boolean;
  watched?: string[];
  selection?: MapSelection;
  onSelect?: (s: MapSelection) => void;
  interactive?: boolean;
  ariaLabel?: string;
}

interface View {
  k: number;
  x: number;
  y: number;
}

const clampView = (v: View): View => {
  const k = Math.max(1, Math.min(8, v.k));
  const x = Math.min(0, Math.max(W - W * k, v.x));
  const y = Math.min(0, Math.max(H - H * k, v.y));
  return { k, x, y };
};

export function WorldMap({
  events = [],
  showChokepoints = true,
  watched = [],
  selection = null,
  onSelect,
  interactive = true,
  ariaLabel = "World map",
}: WorldMapProps) {
  const world = useWorld();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: number; start: View; origin: { x: number; y: number }; pinch?: number } | null>(null);
  const suppressClick = useRef(false);

  const projection = useMemo(() => geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" }), []);
  const path = useMemo(() => geoPath(projection), [projection]);
  const sphere = useMemo(() => path({ type: "Sphere" }) ?? "", [path]);
  const graticule = useMemo(() => path(geoGraticule10()) ?? "", [path]);

  const countries = useMemo(() => {
    if (world.status !== "ready") return [];
    return world.features.map((f) => ({
      id: f.id ?? "",
      d: path(f as never) ?? "",
      record: countryByNumeric(f.id),
      name: String(f.properties.name ?? ""),
    }));
  }, [world, path]);

  const watchedSet = useMemo(() => new Set(watched), [watched]);

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
  };

  const zoomAt = (factor: number, cx = W / 2, cy = H / 2) => {
    setView((v) => {
      const k = Math.max(1, Math.min(8, v.k * factor));
      const f = k / v.k;
      return clampView({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f });
    });
  };

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const p = toSvg(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
  };

  // React wheel listeners are passive; block page scroll natively while zooming the map.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !interactive) return;
    const stop = (e: globalThis.WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, [interactive]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    pointers.current.set(e.pointerId, toSvg(e.clientX, e.clientY));
    const pts = [...pointers.current.values()];
    drag.current = {
      moved: 0,
      start: view,
      origin: pts[0]!,
      pinch: pts.length === 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : undefined,
    };
    suppressClick.current = false;
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, toSvg(e.clientX, e.clientY));
    const pts = [...pointers.current.values()];
    const d = drag.current;
    if (pts.length === 2 && d.pinch) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const cx = (pts[0]!.x + pts[1]!.x) / 2;
      const cy = (pts[0]!.y + pts[1]!.y) / 2;
      const k = Math.max(1, Math.min(8, d.start.k * (dist / d.pinch)));
      const f = k / d.start.k;
      setView(clampView({ k, x: cx - (cx - d.start.x) * f, y: cy - (cy - d.start.y) * f }));
      suppressClick.current = true;
      return;
    }
    const p = pts[0]!;
    const dx = p.x - d.origin.x;
    const dy = p.y - d.origin.y;
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));
    if (d.moved > 4) {
      suppressClick.current = true;
      if (!svgRef.current!.hasPointerCapture(e.pointerId)) svgRef.current!.setPointerCapture(e.pointerId);
      setView(clampView({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }));
    }
  };

  const endPointer = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) drag.current = null;
  };

  const select = (s: MapSelection) => {
    if (suppressClick.current) return;
    onSelect?.(s);
  };

  const r = 1 / view.k;
  const markerScale = (px: number) => px * r;

  const selectedCountry = selection?.kind === "country" ? selection.country.numeric : null;

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="application"
        aria-label={ariaLabel}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <path d={sphere} fill="#0c1524" />
          <path d={graticule} className="map-graticule" />
          {countries.map((c, i) => {
            const cls = [
              "map-land",
              c.record ? "is-profiled" : "",
              c.record && watchedSet.has(c.record.iso3) ? "is-watched" : "",
              c.record && c.record.numeric === selectedCountry ? "is-selected" : "",
            ].join(" ");
            return (
              <path
                key={`${c.id}-${i}`}
                d={c.d}
                className={cls}
                onClick={c.record ? () => select({ kind: "country", country: c.record! }) : undefined}
              >
                <title>{c.record ? `${c.record.name} — open profile` : c.name}</title>
              </path>
            );
          })}
          <path d={sphere} className="map-sphere" />

          {showChokepoints &&
            CHOKEPOINTS.map((cp) => {
              const p = projection([cp.lon, cp.lat]);
              if (!p) return null;
              const sel = selection?.kind === "chokepoint" && selection.chokepoint.id === cp.id;
              return (
                <g key={cp.id} transform={`translate(${p[0]},${p[1]})`} onClick={() => select({ kind: "chokepoint", chokepoint: cp })}>
                  <circle r={markerScale(12)} className="marker-hit" />
                  <circle r={markerScale(sel ? 8 : 6)} className="marker-choke" />
                  <circle r={markerScale(1.8)} className="marker-choke-core" />
                  <title>{cp.name} — strategic chokepoint</title>
                </g>
              );
            })}

          {events.map((ev) => {
            const p = projection([ev.lon, ev.lat]);
            if (!p) return null;
            const sel = selection?.kind === "event" && selection.event.id === ev.id;
            return (
              <g key={ev.id} transform={`translate(${p[0]},${p[1]})`} onClick={() => select({ kind: "event", event: ev })}>
                <circle r={markerScale(12)} className="marker-hit" />
                <rect
                  x={-markerScale(5)}
                  y={-markerScale(5)}
                  width={markerScale(10)}
                  height={markerScale(10)}
                  transform="rotate(45)"
                  fill={severityColor(ev.severity)}
                  className={sel ? "marker-event marker-selected" : "marker-event"}
                />
                <title>{ev.title} (sample record)</title>
              </g>
            );
          })}
        </g>
      </svg>
      {interactive && (
        <div className="map-controls">
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.5)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.5)}>−</button>
          <button type="button" aria-label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })}>⟲</button>
        </div>
      )}
      <div className="map-status" aria-live="polite">
        {world.status === "loading" && "Loading basemap…"}
        {world.status === "unavailable" && "Basemap file not found — run the build to install world-atlas geometry."}
        {world.status === "ready" && "Natural Earth 1:110m via world-atlas"}
      </div>
    </div>
  );
}
