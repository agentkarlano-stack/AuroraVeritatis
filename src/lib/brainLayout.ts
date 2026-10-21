import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { NODE_KINDS, type BrainGraph, type NodeKind } from './brain';
import { mulberry32 } from './rng';

type Pos = Map<string, { x: number; y: number }>;

/** Rendered node size in world units (pill height and label-dependent width). */
export const NODE_HEIGHT = 34;
export function nodeWidth(label: string, members?: number): number {
  return Math.min(260, Math.max(96, label.length * 7 + 44 + (members ? 26 : 0)));
}

/** Boxes for fitting: node pill plus room for the connect handle on the right. */
export function nodeBoxes(nodes: Iterable<{ x: number; y: number; label: string; members?: number }>): Box[] {
  return [...nodes].map((n) => ({ x: n.x + 12, y: n.y, w: nodeWidth(n.label, n.members) + 24, h: NODE_HEIGHT + 8 }));
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: NodeKind;
}

/**
 * Force-directed layout (d3-force), run synchronously for a fixed number of ticks with a seeded random source, so the
 * same graph always produces the same layout. Existing positions are the starting point.
 */
export function forceLayout(g: BrainGraph, ticks = 300, seed = 7): Pos {
  const nodes: SimNode[] = g.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y }));
  const ids = new Set(nodes.map((n) => n.id));
  const links = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to }));
  const sim = forceSimulation(nodes)
    .randomSource(mulberry32(seed))
    .force('charge', forceManyBody().strength(-420))
    .force('link', forceLink<SimNode, { source: string; target: string }>(links).id((d) => d.id).distance(150).strength(0.6))
    .force('collide', forceCollide(62))
    .force('x', forceX(0).strength(0.03))
    .force('y', forceY(0).strength(0.03))
    .force('center', forceCenter(0, 0))
    .stop();
  for (let i = 0; i < ticks; i++) sim.tick();
  return new Map(nodes.map((n) => [n.id, { x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) }]));
}

/** Columns by node kind (catalogue order), nodes sorted by label within each column. */
export function columnsLayout(g: BrainGraph, colGap = 240, rowGap = 90): Pos {
  const kinds = (Object.keys(NODE_KINDS) as NodeKind[]).filter((k) => g.nodes.some((n) => n.kind === k));
  const out: Pos = new Map();
  kinds.forEach((k, c) => {
    const col = g.nodes.filter((n) => n.kind === k).sort((a, b) => a.label.localeCompare(b.label));
    col.forEach((n, r) => out.set(n.id, { x: (c - (kinds.length - 1) / 2) * colGap, y: (r - (col.length - 1) / 2) * rowGap }));
  });
  return out;
}

/** Chronological left-to-right by date (undated nodes in a separate lower row). */
export function timelineLayout(g: BrainGraph, gap = 200): Pos {
  const dated = g.nodes.filter((n) => n.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.label.localeCompare(b.label));
  const undated = g.nodes.filter((n) => !n.date).sort((a, b) => a.label.localeCompare(b.label));
  const out: Pos = new Map();
  dated.forEach((n, i) => out.set(n.id, { x: (i - (dated.length - 1) / 2) * gap, y: (i % 2 ? 70 : -70) }));
  undated.forEach((n, i) => out.set(n.id, { x: (i - (undated.length - 1) / 2) * gap, y: 260 }));
  return out;
}

/** A point, optionally with the size of the box drawn around it (world units). */
export interface Box {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export function bounds(points: Iterable<Box>): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let b: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const p of points) {
    const [hw, hh] = [(p.w ?? 0) / 2, (p.h ?? 0) / 2];
    const q = { minX: p.x - hw, minY: p.y - hh, maxX: p.x + hw, maxY: p.y + hh };
    b = b ? { minX: Math.min(b.minX, q.minX), minY: Math.min(b.minY, q.minY), maxX: Math.max(b.maxX, q.maxX), maxY: Math.max(b.maxY, q.maxY) } : q;
  }
  return b;
}

/** Viewport (pan + zoom) that fits every box completely into a width × height area with `pad` screen pixels to spare. */
export function fitView(points: Iterable<Box>, width: number, height: number, pad = 24): { x: number; y: number; zoom: number } {
  const b = bounds(points);
  if (!b || width <= 0 || height <= 0) return { x: width / 2, y: height / 2, zoom: 1 };
  const zoom = Math.min(1.6, Math.max(0.15, Math.min((width - pad * 2) / Math.max(1, b.maxX - b.minX), (height - pad * 2) / Math.max(1, b.maxY - b.minY))));
  return { zoom, x: width / 2 - ((b.minX + b.maxX) / 2) * zoom, y: height / 2 - ((b.minY + b.maxY) / 2) * zoom };
}
