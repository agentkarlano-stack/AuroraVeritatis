/**
 * Minimal TopoJSON → GeoJSON decoder for Polygon / MultiPolygon objects.
 *
 * Supports quantised (delta-encoded) and non-quantised topologies, which
 * covers the `world-atlas` country files used by the Global Radar basemap.
 * Kept in-house to avoid an extra runtime dependency.
 */

export interface Topology {
  type: "Topology";
  arcs: number[][][];
  transform?: { scale: [number, number]; translate: [number, number] };
  objects: Record<string, TopoGeometryCollection>;
}

export interface TopoGeometryCollection {
  type: "GeometryCollection";
  geometries: TopoGeometry[];
}

export type TopoGeometry =
  | { type: "Polygon"; arcs: number[][]; id?: string | number; properties?: Record<string, unknown> }
  | { type: "MultiPolygon"; arcs: number[][][]; id?: string | number; properties?: Record<string, unknown> }
  | { type: null; id?: string | number; properties?: Record<string, unknown> };

export type Position = [number, number];

export interface Feature {
  type: "Feature";
  id?: string;
  properties: Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] } | null;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

/** Decode all arcs to absolute longitude/latitude positions. */
export function decodeArcs(topology: Topology): Position[][] {
  const t = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map((p) => {
      if (t) {
        x += p[0]!;
        y += p[1]!;
        return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] as Position;
      }
      return [p[0]!, p[1]!] as Position;
    });
  });
}

function ring(indices: number[], arcs: Position[][]): Position[] {
  const out: Position[] = [];
  indices.forEach((index, k) => {
    const arc = index < 0 ? arcs[~index]!.slice().reverse() : arcs[index]!;
    if (!arc) throw new Error(`Arc ${index} missing`);
    // Consecutive arcs share their joining point; skip the duplicate.
    arc.forEach((pt, i) => {
      if (k > 0 && i === 0) return;
      out.push(pt);
    });
  });
  return out;
}

export function feature(topology: Topology, objectName: string): FeatureCollection {
  const obj = topology.objects[objectName];
  if (!obj) throw new Error(`Object "${objectName}" not found in topology`);
  const arcs = decodeArcs(topology);
  const features: Feature[] = obj.geometries.map((g) => {
    let geometry: Feature["geometry"] = null;
    if (g.type === "Polygon") {
      geometry = { type: "Polygon", coordinates: g.arcs.map((r) => ring(r, arcs)) };
    } else if (g.type === "MultiPolygon") {
      geometry = { type: "MultiPolygon", coordinates: g.arcs.map((poly) => poly.map((r) => ring(r, arcs))) };
    }
    const f: Feature = { type: "Feature", properties: g.properties ?? {}, geometry };
    if (g.id !== undefined) f.id = String(g.id);
    return f;
  });
  return { type: "FeatureCollection", features };
}
