import type { FeatureCollection, Geometry } from "geojson";
import {
  Map as MlMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type LayerSpecification,
  type MapMouseEvent,
  type MapGeoJSONFeature,
  type SourceSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-50m.json";
import type { GeoEvent } from "../../../shared/types";
import { countryByNumeric } from "../../lib/countries";
import { CATEGORY_COLOR } from "../../lib/events";
import {
  LAYER_MAP,
  effectiveDate,
  gibsTiles,
  type ChoroplethLayer,
  type GibsLayer,
} from "../../lib/geo/layers";
import type { MapState } from "../../lib/geo/state";
import { nightPolygon } from "../../lib/geo/terminator";
import { formatLngLat } from "../../lib/geo/coords";

setWorkerUrl(workerUrl);

export interface CameraStage {
  lon: number;
  lat: number;
  zoom: number;
  /** Milliseconds for this leg. */
  duration: number;
}

export interface GeoMapHandle {
  /**
   * Flies through several zoom levels in sequence (Earth → region → country → local). A new call cancels the previous
   * path. Resolves when the last stage is reached or the path was cancelled.
   */
  flyStages: (stages: CameraStage[], padding?: { top: number; right: number; bottom: number; left: number }, onStage?: (i: number) => void) => Promise<void>;
  /** PNG of the current view with a source footer, or null when the browser refuses (e.g. tainted canvas). */
  exportPng: (footer: string) => Promise<Blob | null>;
  /** `padding` (px) keeps the point clear of panels drawn over the map. */
  flyTo: (lon: number, lat: number, zoom: number, padding?: { top: number; right: number; bottom: number; left: number }) => void;
  /**
   * Fits the view to a country; false when the country is not on the map. `padding` (px) keeps it clear of panels
   * drawn over the map, e.g. `{ right: 480 }` for a side dossier.
   */
  focusCountry: (iso3: string, padding?: number | { top: number; right: number; bottom: number; left: number }) => boolean;
}

/** SVG tactical marker (static markup; the label is set as text). States: wide ring, regional lock-on, local reticle. */
function tacticalMarker(label: string, precise: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `av-target${precise ? "" : " av-target--area"}`;
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<svg viewBox="-60 -60 120 120" width="120" height="120">
    <g class="av-t-wide"><circle r="16" class="av-t-ring"/><g class="av-t-spin"><path d="M0 -26 A26 26 0 0 1 22.5 -13"/><path d="M22.5 13 A26 26 0 0 1 -22.5 13"/><path d="M-22.5 -13 A26 26 0 0 1 0 -26"/></g><circle r="2.2" class="av-t-dot"/></g>
    <g class="av-t-region"><path d="M-30 -18 V-30 H-18 M18 -30 H30 V-18 M30 18 V30 H18 M-18 30 H-30 V18"/><path d="M0 -14 V-6 M0 6 V14 M-14 0 H-6 M6 0 H14"/><circle r="2" class="av-t-dot"/></g>
    <g class="av-t-local"><circle r="22" class="av-t-ring"/><circle r="40" class="av-t-ring av-t-faint"/><path d="M0 -52 V-28 M0 28 V52 M-52 0 H-28 M28 0 H52"/><line class="av-t-scan" x1="-40" y1="0" x2="40" y2="0"/><circle r="2" class="av-t-dot"/></g>
  </svg><span class="av-t-label"></span>`;
  const span = el.querySelector(".av-t-label");
  if (span) span.textContent = label;
  return el;
}

/** Bounding box of a geometry as [west, south, east, north]; uses the largest part for countries spanning the antimeridian. */
function bbox(g: Geometry): [number, number, number, number] | null {
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
const COUNTRIES: FeatureCollection<
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
const BORDERS = borderLines(COUNTRIES);

/** A licensed imagery provider for close-up views (see `lib/geo/imagery.ts`). */
export interface DetailImagery {
  tiles: string;
  attribution: string;
  maxZoom: number;
}

/** Point the presentation is focused on; drawn as a tactical marker that changes with the zoom level. */
export interface MapTarget {
  lon: number;
  lat: number;
  label: string;
  /** False for approximate locations: the marker shows an area, never a falsely precise point. */
  precise: boolean;
}

interface Props {
  ref?: Ref<GeoMapHandle>;
  state: MapState;
  events: GeoEvent[];
  /** YYYY-MM-DD, used to cap daily layers at the newest date each product publishes. */
  today: string;
  /** Per choropleth layer: ISO3 → value. */
  values: Record<string, Map<string, number>>;
  onView: (v: { center: [number, number]; zoom: number }) => void;
  onCountry: (iso3: string | null, name?: string) => void;
  onEvent: (e: GeoEvent) => void;
  onTileError: (layerId: string) => void;
  onHover?: (label: string | null) => void;
  /** Shade the night side of the Earth for this moment (epoch ms); null or absent: no shading. */
  nightAt?: number | null;
  /** Event drawn with a highlighted outline. */
  selectedEventId?: string | null;
  /** false: the camera is controlled by the app only (presentations); dragging, zooming and clicks are ignored. */
  interactive?: boolean;
  /**
   * Area covered by panels drawn over the map (px). The camera centres in the remaining visible canvas, so the globe is
   * not displaced behind a side panel. Camera calls without their own padding keep this.
   */
  padding?: { top: number; right: number; bottom: number; left: number };
  /** Show the geographic coordinates under the cursor (not the camera centre). */
  coordinates?: boolean;
  /** Close-up colour view: natural colour base, plus licensed high-resolution imagery when configured. */
  detail?: boolean;
  detailImagery?: DetailImagery | null;
  target?: MapTarget | null;
}


/** MapLibre style for the current state. Rebuilt on every change and applied with `setStyle(…, { diff: true })`. */
function buildStyle(
  s: MapState,
  today: string,
  events: GeoEvent[],
  values: Props["values"],
  extra: { nightAt?: number | null; selectedEventId?: string | null; detail?: boolean; detailImagery?: DetailImagery | null } = {},
): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {};
  const layers: LayerSpecification[] = [];
  const satelliteBase =
    s.style === "satellite" || s.style === "grayscale" || s.style === "terrain";
  layers.push({
    id: "background",
    type: "background",
    paint: {
      "background-color":
        s.style === "terrain"
          ? "#1d2328"
          : s.style === "political"
            ? "#161a1d"
            : "#0e0e10",
    },
  });
  if (satelliteBase) {
    const bm = LAYER_MAP.get("blue-marble") as GibsLayer;
    sources.base = {
      type: "raster",
      tiles: [gibsTiles(bm, s.date)],
      tileSize: 256,
      maxzoom: bm.gibs.maxZoom,
      attribution: bm.attribution,
    };
    layers.push({
      id: "base",
      type: "raster",
      source: "base",
      paint:
        s.style === "grayscale"
          ? {
              // Close-up views restore the composite's natural colour (a timed transition, not a cut).
              "raster-saturation": extra.detail ? 0 : -1,
              "raster-contrast": extra.detail ? 0.05 : 0.1,
              "raster-brightness-max": extra.detail ? 1 : 0.85,
              "raster-saturation-transition": { duration: 900, delay: 0 },
              "raster-brightness-max-transition": { duration: 900, delay: 0 },
            }
          : s.style === "terrain"
            ? {
                "raster-saturation": -0.45,
                "raster-contrast": 0.25,
                "raster-brightness-min": 0.12,
              }
            : { "raster-saturation": -0.1, "raster-brightness-max": 0.92 },
    });
  }
  // High-resolution colour imagery for close-up views (only when a licensed provider is configured).
  if (satelliteBase && extra.detailImagery) {
    sources.detail = { type: "raster", tiles: [extra.detailImagery.tiles], tileSize: 256, minzoom: 5, maxzoom: extra.detailImagery.maxZoom, attribution: extra.detailImagery.attribution };
    layers.push({
      id: "detail",
      type: "raster",
      source: "detail",
      minzoom: 6,
      paint: { "raster-opacity": extra.detail ? 1 : 0, "raster-opacity-transition": { duration: 900, delay: 250 } },
    });
  }
  // Country polygons: land fill for vector styles, choropleths and selection.
  const props: Record<string, Map<string, number>> = values;
  sources.countries = {
    type: "geojson",
    data: {
      ...COUNTRIES,
      features: COUNTRIES.features.map((f) => {
        const iso3 = f.properties.iso3 as string | null;
        const extra: Record<string, number> = {};
        for (const [id, m] of Object.entries(props)) {
          const v = iso3 ? m.get(iso3) : undefined;
          if (v !== undefined) extra[`v_${id}`] = v;
        }
        return { ...f, properties: { ...f.properties, ...extra } };
      }),
    },
  };
  sources.borders = { type: "geojson", data: BORDERS };
  if (!satelliteBase) {
    layers.push({
      id: "land",
      type: "fill",
      source: "countries",
      paint: {
        "fill-color": s.style === "political" ? ["get", "tint"] : "#1f1f23",
      },
    });
  }
  // Data layers, in the user's order (first = bottom).
  // Rasters first, then country statistics, so a satellite layer never hides a choropleth; events always go on top.
  const rank = (id: string) => (LAYER_MAP.get(id)?.kind === "gibs" ? 0 : 1);
  for (const ls of [...s.layers].sort((a, b) => rank(a.id) - rank(b.id))) {
    const def = LAYER_MAP.get(ls.id);
    if (!def) continue;
    if (def.kind === "gibs" && def.gibs.ext === "mvt") {
      // Vector tiles (e.g. fire detections): drawn as points.
      sources[`gibs-${def.id}`] = {
        type: "vector",
        tiles: [gibsTiles(def, effectiveDate(def, s.date, today))],
        maxzoom: def.gibs.maxZoom,
        attribution: def.attribution,
      };
      layers.push({
        id: `gibs-${def.id}`,
        type: "circle",
        source: `gibs-${def.id}`,
        "source-layer": def.gibs.sourceLayer ?? def.gibs.layer,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.5, 8, 4],
          "circle-color": "#ff6a2a",
          "circle-opacity": 0.85 * ls.opacity,
          "circle-stroke-color": "#3a0d00",
          "circle-stroke-width": 0.4,
        },
      });
    } else if (def.kind === "gibs") {
      sources[`gibs-${def.id}`] = {
        type: "raster",
        tiles: [gibsTiles(def, effectiveDate(def, s.date, today))],
        tileSize: 256,
        maxzoom: def.gibs.maxZoom,
        attribution: def.attribution,
      };
      layers.push({
        id: `gibs-${def.id}`,
        type: "raster",
        source: `gibs-${def.id}`,
        paint: { "raster-opacity": ls.opacity },
      });
    } else if (def.kind === "choropleth") {
      const c = def as ChoroplethLayer;
      const key = `v_${c.id}`;
      const step: ExpressionSpecification = [
        "step",
        ["get", key],
        c.palette[0]!,
        ...c.breaks.flatMap((b, i) => [b, c.palette[i + 1]!]),
      ] as unknown as ExpressionSpecification;
      layers.push({
        id: `choro-${c.id}`,
        type: "fill",
        source: "countries",
        filter: ["has", key],
        paint: { "fill-color": step, "fill-opacity": 0.85 * ls.opacity },
      });
    }
  }
  // Borders: on imagery a dark casing under a light line keeps them readable over bright and dark ground alike.
  if (satelliteBase) {
    layers.push({
      id: "borders-casing",
      type: "line",
      source: "borders",
      paint: {
        "line-color": "#050506",
        "line-opacity": 0.55,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.4, 4, 2.2, 7, 3.4],
        "line-blur": 0.6,
      },
    });
  }
  layers.push({
    id: "borders",
    type: "line",
    source: "borders",
    paint: {
      "line-color": s.style === "dark" ? "#7a6b42" : s.style === "political" ? "#c9c3b2" : "#ece7da",
      "line-opacity": satelliteBase ? 0.8 : s.style === "dark" ? 0.85 : 0.75,
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 4, 0.9, 7, 1.6],
    },
  });
  layers.push({
    id: "selected",
    type: "line",
    source: "countries",
    filter: ["==", ["get", "iso3"], s.country ?? ""],
    paint: { "line-color": "#e3c98f", "line-width": 2 },
  });
  // Night side (computed from the sun's position), under the borders' highlight and the events.
  if (extra.nightAt) {
    sources.night = { type: "geojson", data: nightPolygon(new Date(extra.nightAt)) };
    layers.push({ id: "night", type: "fill", source: "night", paint: { "fill-color": "#05060a", "fill-opacity": 0.42 } });
  }
  // Events on top.
  const feeds = new Set(
    s.layers
      .map((l) => LAYER_MAP.get(l.id))
      .flatMap((d) => (d?.kind === "events" ? [d.feed] : [])),
  );
  const shown = events.filter((e) =>
    e.provenance === "simulated"
      ? feeds.has("scenarios")
      : e.id.startsWith("usgs-")
        ? feeds.has("earthquakes")
        : e.id.startsWith("gdacs-")
          ? feeds.has("disasters")
          : false,
  );
  // Nearby events are clustered (count shown on hover; a click zooms in), so dense areas stay readable.
  sources.events = {
    type: "geojson",
    cluster: true,
    clusterRadius: 36,
    clusterMaxZoom: 6,
    clusterProperties: { maxSeverity: ["max", ["get", "severity"]], selected: ["max", ["get", "selected"]] },
    data: {
      type: "FeatureCollection",
      features: shown.map((e) => ({
        type: "Feature",
        id: e.id,
        geometry: { type: "Point", coordinates: [e.lon, e.lat] },
        properties: {
          id: e.id,
          severity: e.severity,
          color: CATEGORY_COLOR[e.category],
          simulated: e.provenance === "simulated" ? 1 : 0,
          selected: e.id === extra.selectedEventId ? 1 : 0,
        },
      })),
    },
  };
  const opacityOf = (feed: string) =>
    s.layers.find(
      (l) =>
        LAYER_MAP.get(l.id)?.kind === "events" &&
        (LAYER_MAP.get(l.id) as { feed: string }).feed === feed,
    )?.opacity ?? 1;
  layers.push({
    id: "event-clusters",
    type: "circle",
    source: "events",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 9, 10, 14, 50, 20],
      "circle-color": "#c9a35a",
      "circle-opacity": 0.28,
      "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], "#f1f0ec", "#c9a35a"],
      "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2.5, 1.4],
    },
  });
  layers.push({
    id: "events",
    type: "circle",
    source: "events",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "severity"],
        1,
        4,
        5,
        11,
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": [
        "case",
        ["==", ["get", "simulated"], 1],
        0.45 * opacityOf("scenarios"),
        0.9 * Math.min(opacityOf("earthquakes"), opacityOf("disasters")),
      ],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "selected"], 1],
        "#f1f0ec",
        ["==", ["get", "simulated"], 1],
        "#c9a35a",
        "#0d0d0e",
      ],
      "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2.5, 1.2],
    },
  });
  return {
    version: 8,
    projection: { type: s.mode === "3d" ? "globe" : "mercator" },
    sky: {
      "atmosphere-blend": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        0.8,
        5,
        0.3,
        8,
        0,
      ],
    },
    sources,
    layers,
  };
}

export default function GeoMap({
  ref,
  state,
  today,
  events,
  values,
  onView,
  onCountry,
  onEvent,
  onTileError,
  onHover,
  nightAt = null,
  selectedEventId = null,
  interactive = true,
  padding,
  coordinates = false,
  detail = false,
  detailImagery = null,
  target = null,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const coordBox = useRef<HTMLDivElement>(null);
  /** Persistent panel padding; camera calls add their own margin to it (MapLibre replaces padding per call). */
  const basePad = useRef({ top: 0, right: 0, bottom: 0, left: 0 });
  useEffect(() => {
    basePad.current = padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  });
  const mapRef = useRef<MlMap | null>(null);
  const handlers = useRef({
    onView,
    onCountry,
    onEvent,
    onTileError,
    onHover,
    events,
    interactive,
  });
  useEffect(() => {
    handlers.current = {
      interactive,
      onView,
      onCountry,
      onEvent,
      onTileError,
      onHover,
      events,
    };
  });

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    const map = new MlMap({
      container: box.current,
      style: buildStyle(state, today, events, values, { nightAt, selectedEventId, detail, detailImagery }),
      center: state.center,
      zoom: state.zoom,
      maxZoom: 9,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true },
      cooperativeGestures: false,
    });
    mapRef.current = map;
    // Presentations move the camera themselves: no zoom buttons.
    if (handlers.current.interactive) map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.on("moveend", () => {
      const c = map.getCenter();
      handlers.current.onView({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });
    map.on("error", (e) => {
      const { sourceId, error: err } = e as unknown as { sourceId?: string; error?: { status?: number } };
      // Vector tile services answer 404 for tiles without any features (e.g. no fires there): not an error.
      if (err?.status === 404 && sourceId && map.getSource(sourceId)?.type === "vector") return;
      if (sourceId?.startsWith("gibs-"))
        handlers.current.onTileError(sourceId.slice(5));
      else if (sourceId === "base") handlers.current.onTileError("blue-marble");
    });
    map.on("click", (e: MapMouseEvent) => {
      if (!handlers.current.interactive) return;
      const cluster = map.queryRenderedFeatures(e.point, { layers: ["event-clusters"] })[0];
      if (cluster) {
        const src = map.getSource("events") as unknown as { getClusterExpansionZoom: (id: number) => Promise<number> };
        void src.getClusterExpansionZoom(cluster.properties?.cluster_id as number).then((z) =>
          map.easeTo({ center: (cluster.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom: Math.min(z + 0.5, 9) }),
        );
        return;
      }
      const hit = map.queryRenderedFeatures(e.point, { layers: ["events"] })[0];
      if (hit) {
        const ev = handlers.current.events.find(
          (x) => x.id === hit.properties?.id,
        );
        if (ev) handlers.current.onEvent(ev);
        return;
      }
      const c = map
        .queryRenderedFeatures(e.point)
        .find((f: MapGeoJSONFeature) => f.source === "countries");
      handlers.current.onCountry(
        (c?.properties?.iso3 as string | undefined) ?? null,
        c?.properties?.name as string | undefined,
      );
    });
    map.on("mousemove", (e: MapMouseEvent) => {
      // Cursor position, written straight to the readout (no React render per mouse move).
      if (coordBox.current) coordBox.current.textContent = formatLngLat(e.lngLat.lng, e.lngLat.lat);
      if (!handlers.current.interactive) return;
      const cl = map.queryRenderedFeatures(e.point, { layers: ["event-clusters"] })[0];
      if (cl) {
        map.getCanvas().style.cursor = "pointer";
        handlers.current.onHover?.(`${cl.properties?.point_count} events here: click to zoom in`);
        return;
      }
      const ev = map.queryRenderedFeatures(e.point, { layers: ["events"] })[0];
      const c = ev
        ? null
        : map
            .queryRenderedFeatures(e.point)
            .find((f: MapGeoJSONFeature) => f.source === "countries");
      map.getCanvas().style.cursor = ev || c?.properties?.iso3 ? "pointer" : "";
      const label = ev
        ? (handlers.current.events.find((x) => x.id === ev.properties?.id)
            ?.title ?? null)
        : ((c?.properties?.name as string | undefined) ?? null);
      handlers.current.onHover?.(label);
    });
    map.on("mouseout", () => {
      handlers.current.onHover?.(null);
      if (coordBox.current) coordBox.current.textContent = "";
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Created once; later changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply state changes (style, layers, date, projection, data) as a style diff; the camera is not part of the style,
  // so panning and zooming never rebuild it.
  const styleState = useRef(state);
  useEffect(() => {
    styleState.current = state;
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(styleState.current, today, events, values, { nightAt, selectedEventId, detail, detailImagery }), { diff: true });
  }, [state.mode, state.style, state.layers, state.date, state.country, today, events, values, nightAt, selectedEventId, detail, detailImagery]);

  // Tactical marker anchored to the target's real coordinates; its form follows the zoom level.
  const targetKey = target ? JSON.stringify([target.lon, target.lat, target.label, target.precise]) : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !targetKey) return;
    const [lon, lat, label, precise] = JSON.parse(targetKey) as [number, number, string, boolean];
    const el = tacticalMarker(label, precise);
    const marker = new Marker({ element: el, anchor: 'center' }).setLngLat([lon, lat]).addTo(map);
    const scale = () => {
      const z = map.getZoom();
      el.dataset.scale = z < 3.5 ? 'wide' : z < 6.5 ? 'region' : 'local';
    };
    scale();
    map.on('zoom', scale);
    return () => {
      map.off('zoom', scale);
      marker.remove();
    };
  }, [targetKey]);

  // Keep the camera centred in the canvas left visible by overlaid panels.
  const padKey = padding ? `${padding.top},${padding.right},${padding.bottom},${padding.left}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !padKey) return;
    const [top, right, bottom, left] = padKey.split(",").map(Number) as [number, number, number, number];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ padding: { top, right, bottom, left }, duration: reduced ? 0 : 300 });
  }, [padKey]);

  // Presentations control the camera alone.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const h = [map.dragPan, map.scrollZoom, map.boxZoom, map.dragRotate, map.keyboard, map.doubleClickZoom, map.touchZoomRotate];
    for (const x of h) {
      if (interactive) x.enable();
      else x.disable();
    }
  }, [interactive]);

  // Follow camera changes that come from outside (shared links, search, saved views).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (
      Math.abs(c.lng - state.center[0]) > 0.01 ||
      Math.abs(c.lat - state.center[1]) > 0.01 ||
      Math.abs(map.getZoom() - state.zoom) > 0.01
    ) {
      map.jumpTo({ center: state.center, zoom: state.zoom });
    }
  }, [state.center, state.zoom]);

  const pathId = useRef(0);
  useImperativeHandle(ref, () => ({
    flyStages: async (stages, padding, onStage) => {
      const map = mapRef.current;
      if (!map) return;
      const id = ++pathId.current;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      for (const [i, st] of stages.entries()) {
        if (id !== pathId.current) return;
        onStage?.(i);
        if (reduced) {
          map.jumpTo({ center: [st.lon, st.lat], zoom: st.zoom, padding: padding ?? basePad.current });
          continue;
        }
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          map.once("moveend", done);
          map.flyTo({ center: [st.lon, st.lat], zoom: st.zoom, padding: padding ?? basePad.current, duration: st.duration, essential: true, curve: 1.3 });
          // Safety net if moveend never fires (e.g. no movement needed).
          setTimeout(done, st.duration + 400);
        });
      }
    },
    flyTo: (lon, lat, zoom, padding) => {
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      mapRef.current?.[reduced ? "jumpTo" : "flyTo"]({
        center: [lon, lat],
        zoom,
        padding: padding ?? basePad.current,
        ...(reduced ? {} : { duration: 1600, essential: true }),
      });
    },
    focusCountry: (iso3, padding = 40) => {
      const f = COUNTRIES.features.find((x) => x.properties.iso3 === iso3);
      const b = f ? bbox(f.geometry) : null;
      if (!b || !mapRef.current) return false;
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      mapRef.current.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        {
          padding:
            typeof padding === "number"
              ? {
                  top: basePad.current.top + padding,
                  right: basePad.current.right + padding,
                  bottom: basePad.current.bottom + padding,
                  left: basePad.current.left + padding,
                }
              : padding,
          maxZoom: 6,
          duration: reduced ? 0 : 1200,
        },
      );
      return true;
    },
    exportPng: async (footer) => {
      const map = mapRef.current;
      if (!map) return null;
      const src = map.getCanvas();
      const out = document.createElement("canvas");
      const pad = 44;
      out.width = src.width;
      out.height = src.height + pad;
      const g = out.getContext("2d");
      if (!g) return null;
      g.fillStyle = "#0e0e10";
      g.fillRect(0, 0, out.width, out.height);
      try {
        g.drawImage(src, 0, 0);
      } catch {
        return null;
      }
      g.fillStyle = "#c9a35a";
      g.font = "600 15px Montserrat, system-ui, sans-serif";
      g.fillText("AURORA VERITATIS", 14, src.height + 27);
      g.fillStyle = "#a9a69e";
      g.font = "13px Inter, system-ui, sans-serif";
      g.fillText(footer, 180, src.height + 27, out.width - 194);
      return new Promise((resolve) => {
        try {
          out.toBlob((b) => resolve(b), "image/png");
        } catch {
          resolve(null);
        }
      });
    },
  }));

  return (
    <div className="relative h-full w-full">
      <div
        ref={box}
        className={`h-full w-full ${state.mode === "3d" ? "av-starfield" : ""}`}
        role="region"
        aria-label="Interactive map. Drag to move, scroll or pinch to zoom, click a country or event for details."
      />
      {coordinates && (
        <div
          ref={coordBox}
          className="num pointer-events-none absolute bottom-2 z-10 rounded bg-ink-950/80 px-2 py-0.5 text-[11px] text-mist empty:hidden"
          style={{ left: (padding?.left ?? 0) + 8 }}
          aria-hidden
        />
      )}
    </div>
  );
}
