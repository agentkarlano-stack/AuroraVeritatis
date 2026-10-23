import type { FeatureCollection, Geometry } from "geojson";
import {
  Map as MlMap,
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
  gibsTiles,
  type ChoroplethLayer,
  type GibsLayer,
} from "../../lib/geo/layers";
import type { MapState } from "../../lib/geo/state";

setWorkerUrl(workerUrl);

export interface GeoMapHandle {
  /** PNG of the current view with a source footer, or null when the browser refuses (e.g. tainted canvas). */
  exportPng: (footer: string) => Promise<Blob | null>;
  flyTo: (lon: number, lat: number, zoom: number) => void;
  /** Fits the view to a country; false when the country is not on the map. */
  focusCountry: (iso3: string) => boolean;
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

interface Props {
  ref?: Ref<GeoMapHandle>;
  state: MapState;
  events: GeoEvent[];
  /** Per choropleth layer: ISO3 → value. */
  values: Record<string, Map<string, number>>;
  onView: (v: { center: [number, number]; zoom: number }) => void;
  onCountry: (iso3: string | null, name?: string) => void;
  onEvent: (e: GeoEvent) => void;
  onTileError: (layerId: string) => void;
  onHover?: (label: string | null) => void;
}

/** MapLibre style for the current state. Rebuilt on every change and applied with `setStyle(…, { diff: true })`. */
function buildStyle(
  s: MapState,
  events: GeoEvent[],
  values: Props["values"],
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
              "raster-saturation": -1,
              "raster-contrast": 0.1,
              "raster-brightness-max": 0.85,
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
    if (def.kind === "gibs") {
      sources[`gibs-${def.id}`] = {
        type: "raster",
        tiles: [gibsTiles(def, s.date)],
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
  layers.push({
    id: "borders",
    type: "line",
    source: "countries",
    paint: {
      "line-color": s.style === "dark" ? "#5e5233" : "#d8d4c8",
      "line-opacity": satelliteBase ? 0.45 : 0.7,
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 6, 1.2],
    },
  });
  layers.push({
    id: "selected",
    type: "line",
    source: "countries",
    filter: ["==", ["get", "iso3"], s.country ?? ""],
    paint: { "line-color": "#e3c98f", "line-width": 2 },
  });
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
  sources.events = {
    type: "geojson",
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
    id: "events",
    type: "circle",
    source: "events",
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
        ["==", ["get", "simulated"], 1],
        "#c9a35a",
        "#0d0d0e",
      ],
      "circle-stroke-width": 1.2,
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
  events,
  values,
  onView,
  onCountry,
  onEvent,
  onTileError,
  onHover,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const handlers = useRef({
    onView,
    onCountry,
    onEvent,
    onTileError,
    onHover,
    events,
  });
  useEffect(() => {
    handlers.current = {
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
      style: buildStyle(state, events, values),
      center: state.center,
      zoom: state.zoom,
      maxZoom: 9,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true },
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(
      new NavigationControl({ visualizePitch: false }),
      "top-right",
    );
    map.on("moveend", () => {
      const c = map.getCenter();
      handlers.current.onView({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });
    map.on("error", (e) => {
      const sourceId = (e as unknown as { sourceId?: string }).sourceId;
      if (sourceId?.startsWith("gibs-"))
        handlers.current.onTileError(sourceId.slice(5));
      else if (sourceId === "base") handlers.current.onTileError("blue-marble");
    });
    map.on("click", (e: MapMouseEvent) => {
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
    map.on("mouseout", () => handlers.current.onHover?.(null));
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
    map.setStyle(buildStyle(styleState.current, events, values), { diff: true });
  }, [state.mode, state.style, state.layers, state.date, state.country, events, values]);

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

  useImperativeHandle(ref, () => ({
    flyTo: (lon, lat, zoom) => {
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      mapRef.current?.[reduced ? "jumpTo" : "flyTo"]({
        center: [lon, lat],
        zoom,
        ...(reduced ? {} : { duration: 1400 }),
      });
    },
    focusCountry: (iso3) => {
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
        { padding: 40, maxZoom: 6, duration: reduced ? 0 : 1200 },
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
    <div
      ref={box}
      className="h-full w-full"
      role="region"
      aria-label="Interactive map. Drag to move, scroll or pinch to zoom, click a country or event for details."
    />
  );
}
