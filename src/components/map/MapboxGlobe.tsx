import mapboxgl, { type GeoJSONSource, type Map as MbMap, type MapMouseEvent } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { GeoEvent } from '../../../shared/types';
import { CATEGORY_COLOR } from '../../lib/events';
import { formatLngLat } from '../../lib/geo/coords';
import { reticleShape, type ReticleShape, type TargetKind } from '../../lib/geo/reticle';
import { countMapLoad as countLoad } from '../../lib/geo/mapLoads';
import { COUNTRIES, bbox } from '../../lib/geo/worldShapes';
import type { CameraStage, GeoMapHandle, MapTarget } from '../geo/GeoMap';

type Pad = { top: number; right: number; bottom: number; left: number };

interface Props {
  ref?: Ref<GeoMapHandle>;
  token: string;
  events: GeoEvent[];
  selectedEventId?: string | null;
  onView?: (v: { center: [number, number]; zoom: number }) => void;
  onCountry?: (iso3: string | null, name?: string) => void;
  onEvent?: (e: GeoEvent) => void;
  /** false: the camera is driven by the app (briefings); input is ignored and the pointer hides when idle. */
  interactive?: boolean;
  padding?: Pad;
  /** Coordinates under the cursor (not the camera centre). */
  coordinates?: boolean;
  target?: MapTarget | null;
  /** Fires once when the map has loaded its style (or failed). */
  onReady?: (ok: boolean, reason?: string) => void;
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const ZERO: Pad = { top: 0, right: 0, bottom: 0, left: 0 };

function eventsGeoJson(events: GeoEvent[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      id: e.id,
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: { id: e.id, color: CATEGORY_COLOR[e.category] ?? '#c9a35a', severity: e.severity, title: e.title },
    })),
  };
}

/** Kind of geographic target: a story without coordinates is country-wide; an approximate location is an area. */
const kindOf = (t: MapTarget): TargetKind => t.kind ?? (t.precise ? 'point' : 'area');

/**
 * Global Radar and briefing renderer on Mapbox GL JS (owner decision, canonical 16): one map instance, globe projection,
 * a grayscale strategic base that crossfades into Mapbox satellite imagery at city zoom (real imagery only; Mapbox
 * attribution kept), country hover outlines, live cursor coordinates and the narrative reticle, whose shape follows the
 * target's geometry and the camera (lib/geo/reticle.ts) and is redrawn on every rendered frame.
 */
export default function MapboxGlobe({ ref, token, events, selectedEventId = null, onView, onCountry, onEvent, interactive = true, padding = ZERO, coordinates = false, target = null, onReady }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const basePad = useRef<Pad>(padding);
  const flight = useRef(0);
  const cb = useRef({ onView, onCountry, onEvent, onReady, events });
  const reticleEl = useRef<HTMLDivElement>(null);
  const lockAt = useRef<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    cb.current = { onView, onCountry, onEvent, onReady, events };
  });

  // One map for the lifetime of the component (a new instance is a new billed load).
  useEffect(() => {
    if (!box.current) return;
    mapboxgl.accessToken = token;
    let map: MbMap;
    try {
      map = new mapboxgl.Map({
        container: box.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        projection: 'globe',
        center: [12, 24],
        zoom: 1.3,
        attributionControl: true,
        interactive,
        cooperativeGestures: false,
        maxPitch: 60,
      });
    } catch (e) {
      queueMicrotask(() => {
        setFailure(e instanceof Error ? e.message : 'The map could not start.');
        cb.current.onReady?.(false, 'init');
      });
      return;
    }
    countLoad();
    mapRef.current = map;
    map.setPadding(basePad.current);
    map.on('error', (e) => {
      const status = (e.error as { status?: number } | undefined)?.status;
      if (status === 401 || status === 403) {
        setFailure('The map provider refused this site’s access token.');
        cb.current.onReady?.(false, String(status));
      }
    });
    map.on('style.load', () => {
      map.setFog({ color: 'rgb(12,14,18)', 'high-color': 'rgb(28,34,44)', 'horizon-blend': 0.04, 'space-color': 'rgb(5,6,9)', 'star-intensity': 0.08 });
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      // Real satellite imagery fades in only at regional/city zoom; the strategic view stays grayscale.
      map.addSource('satellite', { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
      map.addLayer(
        {
          id: 'satellite',
          type: 'raster',
          source: 'satellite',
          minzoom: 5,
          paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 8, 1], 'raster-saturation': ['interpolate', ['linear'], ['zoom'], 6, -0.8, 9, 0], 'raster-fade-duration': 250 },
        },
        firstSymbol,
      );
      map.addSource('countries', { type: 'geojson', data: COUNTRIES as GeoJSON.FeatureCollection, promoteId: 'iso3' });
      map.addLayer({ id: 'country-hit', type: 'fill', source: 'countries', paint: { 'fill-color': '#ffffff', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.05, 0] } }, firstSymbol);
      map.addLayer({ id: 'country-focus', type: 'line', source: 'countries', paint: { 'line-color': '#9fc3e6', 'line-width': ['case', ['boolean', ['feature-state', 'focus'], false], 1.6, ['boolean', ['feature-state', 'hover'], false], 0.9, 0], 'line-opacity': 0.9 } }, firstSymbol);
      map.addSource('events', { type: 'geojson', data: eventsGeoJson(cb.current.events) });
      map.addLayer({ id: 'events-halo', type: 'circle', source: 'events', paint: { 'circle-radius': ['+', 4, ['*', 1.6, ['get', 'severity']]], 'circle-color': ['get', 'color'], 'circle-opacity': 0.18, 'circle-pitch-alignment': 'map' } });
      map.addLayer({
        id: 'events',
        type: 'circle',
        source: 'events',
        paint: {
          'circle-radius': ['+', 2, ['*', 0.6, ['get', 'severity']]],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': ['case', ['==', ['get', 'id'], selectedEventId ?? ''], '#f1f0ec', 'rgba(10,12,16,0.8)'],
          'circle-stroke-width': ['case', ['==', ['get', 'id'], selectedEventId ?? ''], 2, 0.8],
          'circle-pitch-alignment': 'map',
        },
      });
      setLoaded(true);
      cb.current.onReady?.(true);
    });

    let hovered: string | null = null;
    const setHover = (iso: string | null) => {
      if (hovered === iso) return;
      if (hovered) map.setFeatureState({ source: 'countries', id: hovered }, { hover: false });
      hovered = iso;
      if (iso) map.setFeatureState({ source: 'countries', id: iso }, { hover: true });
    };
    if (interactive) {
      map.on('mousemove', (e: MapMouseEvent) => {
        if (coordinates) setCursor(formatLngLat(e.lngLat.lng, e.lngLat.lat));
        if (!map.getLayer('events')) return;
        const ev = map.queryRenderedFeatures(e.point, { layers: ['events'] })[0];
        const c = ev ? null : map.queryRenderedFeatures(e.point, { layers: ['country-hit'] })[0];
        setHover((c?.properties?.iso3 as string | undefined) ?? null);
        map.getCanvas().style.cursor = ev || c ? 'pointer' : '';
      });
      map.on('mouseout', () => {
        setCursor(null);
        setHover(null);
      });
      map.on('click', (e: MapMouseEvent) => {
        const ev = map.getLayer('events') ? map.queryRenderedFeatures(e.point, { layers: ['events'] })[0] : undefined;
        if (ev) {
          const found = cb.current.events.find((x) => x.id === ev.properties?.id);
          if (found) cb.current.onEvent?.(found);
          return;
        }
        const c = map.getLayer('country-hit') ? map.queryRenderedFeatures(e.point, { layers: ['country-hit'] })[0] : undefined;
        cb.current.onCountry?.((c?.properties?.iso3 as string | undefined) ?? null, c?.properties?.name as string | undefined);
      });
      map.on('moveend', () => {
        const c = map.getCenter();
        cb.current.onView?.({ center: [c.lng, c.lat], zoom: map.getZoom() });
      });
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Events and selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource('events') as GeoJSONSource | undefined)?.setData(eventsGeoJson(events));
    map.setPaintProperty('events', 'circle-stroke-color', ['case', ['==', ['get', 'id'], selectedEventId ?? ''], '#f1f0ec', 'rgba(10,12,16,0.8)']);
    map.setPaintProperty('events', 'circle-stroke-width', ['case', ['==', ['get', 'id'], selectedEventId ?? ''], 2, 0.8]);
  }, [events, selectedEventId, loaded]);

  // Panels drawn over the map: the camera centres in the remaining canvas.
  useEffect(() => {
    basePad.current = padding;
    mapRef.current?.easeTo({ padding, duration: reduced() ? 0 : 300 });
  }, [padding]);

  // Country-wide targets: outline the country instead of drawing a centre mark.
  useEffect(() => {
    const map = mapRef.current;
    const iso = target && kindOf(target) === 'country' ? (target.iso3 ?? null) : null;
    if (!map || !loaded || !iso) return;
    map.setFeatureState({ source: 'countries', id: iso }, { focus: true });
    return () => {
      if (map.getSource('countries')) map.setFeatureState({ source: 'countries', id: iso }, { focus: false });
    };
  }, [target, loaded]);

  // Narrative reticle: recomputed on every rendered frame from the target's geography and the camera.
  useEffect(() => {
    const map = mapRef.current;
    const el = reticleEl.current;
    if (!map || !el) return;
    lockAt.current = null;
    if (!target) {
      el.style.opacity = '0';
      return;
    }
    const t = { lon: target.lon, lat: target.lat, kind: kindOf(target), radiusKm: target.radiusKm ?? null };
    const draw = () => {
      const p = map.project([t.lon, t.lat]);
      const canvas = map.getCanvas();
      // Behind the globe: hidden (a marker must never be painted through the Earth).
      const c = map.getCenter();
      const behind = map.getProjection().name === 'globe' && angularDistance(c.lng, c.lat, t.lon, t.lat) > 88;
      const s = reticleShape(t, map.getZoom(), lockAt.current === null ? null : performance.now() - lockAt.current, { width: canvas.clientWidth, height: canvas.clientHeight });
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      el.style.opacity = behind ? '0' : String(s.opacity);
      paint(el, s, target.label);
    };
    map.on('render', draw);
    const onMoveEnd = () => {
      if (lockAt.current === null) lockAt.current = performance.now();
      map.triggerRepaint();
    };
    map.on('moveend', onMoveEnd);
    // Keep repainting while settling (the reticle fades after it has locked).
    const settle = window.setInterval(() => map.triggerRepaint(), 250);
    draw();
    return () => {
      map.off('render', draw);
      map.off('moveend', onMoveEnd);
      window.clearInterval(settle);
    };
  }, [target, loaded]);

  useImperativeHandle(ref, () => ({
    flyStages: (stages: CameraStage[], pad?: Pad, onStage?: (i: number) => void) => {
      const map = mapRef.current;
      const id = ++flight.current;
      if (!map || !stages.length) return Promise.resolve();
      lockAt.current = null;
      return new Promise<void>((resolve) => {
        const leg = (i: number) => {
          if (id !== flight.current || i >= stages.length) return resolve();
          const s = stages[i]!;
          onStage?.(i);
          const opts = { center: [s.lon, s.lat] as [number, number], zoom: s.zoom, padding: pad ?? basePad.current };
          if (reduced()) map.jumpTo(opts);
          else map.flyTo({ ...opts, duration: s.duration, curve: 1.3, essential: true });
          map.once('moveend', () => leg(i + 1));
        };
        leg(0);
      });
    },
    flyTo: (lon: number, lat: number, zoom: number, pad?: Pad) => {
      const map = mapRef.current;
      if (!map) return;
      lockAt.current = null;
      const opts = { center: [lon, lat] as [number, number], zoom, padding: pad ?? basePad.current };
      if (reduced()) map.jumpTo(opts);
      else map.flyTo({ ...opts, duration: 1600, essential: true });
    },
    focusCountry: (iso3: string, pad: number | Pad = 40) => {
      const f = COUNTRIES.features.find((x) => x.properties.iso3 === iso3);
      const b = f ? bbox(f.geometry) : null;
      const map = mapRef.current;
      if (!b || !map) return false;
      const p = basePad.current;
      map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: typeof pad === 'number' ? { top: p.top + pad, right: p.right + pad, bottom: p.bottom + pad, left: p.left + pad } : pad, maxZoom: 6, duration: reduced() ? 0 : 1300 },
      );
      return true;
    },
    exportPng: async () => null,
  }));

  return (
    <div className="relative h-full w-full bg-ink-950" data-map-provider="mapbox" data-map-loaded={loaded ? '1' : '0'}>
      <div ref={box} className={`absolute inset-0 ${interactive ? '' : 'av-map-passive'}`} />
      <div ref={reticleEl} className="av-reticle pointer-events-none absolute left-0 top-0 z-[5]" style={{ opacity: 0 }} aria-hidden />
      {coordinates && cursor && <div className="num pointer-events-none absolute bottom-7 left-2 z-[5] rounded bg-ink-950/70 px-1.5 py-0.5 text-[11px] text-mist">{cursor}</div>}
      {failure && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/90 p-6 text-center text-sm text-mist" role="alert">
          {failure}
        </div>
      )}
    </div>
  );
}

/** Great-circle angle (degrees) between two points; > 90° means the far side of the globe. */
function angularDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const c = Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}

/** Draws the reticle form into its element (SVG markup only; the label is set as text). */
function paint(el: HTMLDivElement, s: ReticleShape, label: string) {
  const key = `${s.form}|${Math.round(s.size)}|${s.label ?? ''}|${label}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.dataset.phase = s.phase;
  const r = Math.round(s.size);
  const d = r * 2 + 8;
  const arm = Math.max(6, Math.round(r * 0.35));
  let shape = '';
  if (s.form === 'mark') shape = `<path d="M0 -${r} L${r} 0 L0 ${r} L-${r} 0Z" class="av-r-line"/>`;
  else if (s.form === 'brackets')
    shape = [
      `M-${r} -${r - arm} V-${r} H-${r - arm}`,
      `M${r - arm} -${r} H${r} V-${r - arm}`,
      `M${r} ${r - arm} V${r} H${r - arm}`,
      `M-${r - arm} ${r} H-${r} V${r - arm}`,
    ]
      .map((p) => `<path d="${p}" class="av-r-line"/>`)
      .join('') + '<circle r="1.6" class="av-r-dot"/>';
  else if (s.form === 'ring') shape = `<circle r="${r}" class="av-r-line"/><path d="M0 -${r + 6} V-${r + 2} M0 ${r + 2} V${r + 6} M-${r + 6} 0 H-${r + 2} M${r + 2} 0 H${r + 6}" class="av-r-line"/><circle r="1.6" class="av-r-dot"/>`;
  else if (s.form === 'circle') shape = `<circle r="${r}" class="av-r-line av-r-dash"/><circle r="1.4" class="av-r-dot"/>`;
  el.innerHTML = s.form === 'none' ? '' : `<svg width="${d}" height="${d}" viewBox="${-d / 2} ${-d / 2} ${d} ${d}" style="transform:translate(-50%,-50%)">${shape}</svg><span class="av-r-label"></span>`;
  const span = el.querySelector('.av-r-label');
  if (span) {
    span.textContent = s.label ? `${label} · ${s.label}` : s.form === 'mark' ? '' : label;
    (span as HTMLElement).style.transform = `translate(${r + 10}px, -50%)`;
  }
}

