import { useEffect, useRef, useState } from 'react';
import { NODE_KINDS, edgeLabel, type BrainEdge, type BrainNode, type Certainty, type VisibleGraph } from '../lib/brain';
import { NODE_HEIGHT as H, nodeWidth } from '../lib/brainLayout';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string } | null;

interface Props {
  graph: VisibleGraph;
  view: Viewport;
  selection: Selection;
  highlight: ReadonlySet<string>;
  onView: (v: Viewport) => void;
  onSelect: (s: Selection) => void;
  /** Live positions while dragging (not persisted). */
  onMove: (positions: Map<string, { x: number; y: number }>) => void;
  /** Drag finished: persist. */
  onMoveEnd: () => void;
  onConnect: (from: string, to: string) => void;
  onAddAt: (x: number, y: number) => void;
  onDelete: () => void;
  onFit: () => void;
  onToggleGroup: (group: string) => void;
}

const DASH: Record<Certainty, string | undefined> = { established: undefined, likely: undefined, possible: '7 5', speculative: '2 5' };
const WIDTH: Record<Certainty, number> = { established: 2.2, likely: 1.6, possible: 1.4, speculative: 1.2 };

const short = (s: string, max = 34) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Point where the segment from the centre of a w×h box towards (dx, dy) leaves the box. */
function boxExit(w: number, h: number, dx: number, dy: number): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const sx = dx === 0 ? Infinity : w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: dx * s, y: dy * s };
}

type Drag =
  | { kind: 'pan'; startX: number; startY: number; view: Viewport; moved: boolean }
  | { kind: 'node'; id: string; startX: number; startY: number; origin: { x: number; y: number }; moved: boolean }
  | { kind: 'link'; from: string; x: number; y: number };

export function BrainCanvas(props: Props) {
  const { graph, view, selection, highlight } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; view: Viewport } | null>(null);
  const [linkLine, setLinkLine] = useState<{ from: string; x: number; y: number } | null>(null);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const local = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const toWorld = (clientX: number, clientY: number) => {
    const p = local(clientX, clientY);
    return { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom };
  };
  const zoomAt = (px: number, py: number, zoom: number, base: Viewport = view) => {
    const z = Math.min(3, Math.max(0.15, zoom));
    props.onView({ zoom: z, x: px - ((px - base.x) / base.zoom) * z, y: py - ((py - base.y) / base.zoom) * z });
  };

  const nodeAt = (clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY)?.closest('[data-node]');
    return el?.getAttribute('data-node') ?? null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), view };
      drag.current = null;
      return;
    }
    const target = e.target as Element;
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    const node = target.closest('[data-node]')?.getAttribute('data-node');
    if (handle || (node && e.shiftKey)) {
      const w = toWorld(e.clientX, e.clientY);
      drag.current = { kind: 'link', from: (handle ?? node)!, ...w };
      setLinkLine({ from: (handle ?? node)!, ...w });
    } else if (node) {
      const n = byId.get(node);
      if (!n || node.startsWith('group:')) {
        drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, view, moved: false };
        return;
      }
      drag.current = { kind: 'node', id: node, startX: e.clientX, startY: e.clientY, origin: { x: n.x, y: n.y }, moved: false };
    } else {
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, view, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, pinch.current.view.zoom * (dist / pinch.current.dist), pinch.current.view);
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      props.onView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
    } else if (d.kind === 'node') {
      const dx = (e.clientX - d.startX) / view.zoom;
      const dy = (e.clientY - d.startY) / view.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      if (d.moved) props.onMove(new Map([[d.id, { x: Math.round(d.origin.x + dx), y: Math.round(d.origin.y + dy) }]]));
    } else {
      const w = toWorld(e.clientX, e.clientY);
      d.x = w.x;
      d.y = w.y;
      setLinkLine({ from: d.from, ...w });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pan') {
      if (!d.moved) {
        const node = nodeAt(e.clientX, e.clientY);
        if (node?.startsWith('group:')) props.onToggleGroup(node.slice(6));
        else {
          const edge = (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-edge]') as Element | null)?.getAttribute('data-edge');
          props.onSelect(edge ? { type: 'edge', id: edge } : null);
        }
      }
    } else if (d.kind === 'node') {
      if (d.moved) props.onMoveEnd();
      else props.onSelect({ type: 'node', id: d.id });
    } else {
      setLinkLine(null);
      const target = nodeAt(e.clientX, e.clientY);
      if (target && target !== d.from && !target.startsWith('group:')) props.onConnect(d.from, target);
    }
  };

  // Native, non-passive wheel listener so zooming the canvas does not also scroll the page.
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheel.current = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      zoomAt(p.x, p.y, view.zoom * Math.exp(-e.deltaY * 0.0015));
    };
  });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => wheel.current(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selection) {
        e.preventDefault();
        props.onDelete();
      }
    } else if (e.key === 'Escape') props.onSelect(null);
    else if (e.key === 'f' || e.key === 'F') props.onFit();
    else if (e.key === '+' || e.key === '=') zoomAt(r.width / 2, r.height / 2, view.zoom * 1.2);
    else if (e.key === '-') zoomAt(r.width / 2, r.height / 2, view.zoom / 1.2);
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = 40;
      props.onView({ ...view, x: view.x + (e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0), y: view.y + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0) });
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-node],[data-edge]')) return;
    const w = toWorld(e.clientX, e.clientY);
    props.onAddAt(Math.round(w.x), Math.round(w.y));
  };

  const edgePath = (e: BrainEdge) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const pa = boxExit(nodeWidth(a.label, (a as { members?: number }).members) + 6, H + 6, dx, dy);
    const pb = boxExit(nodeWidth(b.label, (b as { members?: number }).members) + 10, H + 10, -dx, -dy);
    return { x1: a.x + pa.x, y1: a.y + pa.y, x2: b.x + pb.x, y2: b.y + pb.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const selNode = selection?.type === 'node' ? selection.id : null;
  const selEdge = selection?.type === 'edge' ? selection.id : null;
  const showLabels = view.zoom >= 0.75;

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
      role="application"
      aria-label="Brain graph canvas. Drag to pan, scroll to zoom, drag nodes to move them, drag a node's gold handle (or Shift-drag a node) onto another node to connect them, double-click empty space to add a note. Keys: arrows pan, plus and minus zoom, F fits, Delete removes the selection, Escape clears it."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern id="brain-grid" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <circle cx="1" cy="1" r="1" fill="#2a2a2f" />
        </pattern>
        {(['#7f7c75', '#c9a35a'] as const).map((c) => (
          <marker key={c} id={`brain-arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={c} />
          </marker>
        ))}
      </defs>
      <rect width="100%" height="100%" fill="url(#brain-grid)" />
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {graph.edges.map((e) => {
          const p = edgePath(e);
          if (!p) return null;
          const sel = e.id === selEdge;
          const color = sel ? '#c9a35a' : '#7f7c75';
          return (
            <g key={e.id} data-edge={e.id.includes('>') ? undefined : e.id} className="cursor-pointer">
              <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="transparent" strokeWidth={14} />
              <line
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke={color}
                strokeWidth={WIDTH[e.certainty] + (sel ? 0.8 : 0)}
                strokeDasharray={DASH[e.certainty]}
                markerEnd={e.directed ? `url(#brain-arrow-${color.slice(1)})` : undefined}
              />
              {(showLabels || sel) && (
                <text x={p.mx} y={p.my - 6} textAnchor="middle" className="pointer-events-none" fontSize={10.5} fill={sel ? '#e3c98f' : '#8f8c85'} stroke="#0f0f11" strokeWidth={3} paintOrder="stroke">
                  {short(e.count ? `${e.count} links` : edgeLabel(e), 30)}
                </text>
              )}
            </g>
          );
        })}
        {linkLine && byId.get(linkLine.from) && (
          <line x1={byId.get(linkLine.from)!.x} y1={byId.get(linkLine.from)!.y} x2={linkLine.x} y2={linkLine.y} stroke="#c9a35a" strokeWidth={1.6} strokeDasharray="4 4" className="pointer-events-none" />
        )}
        {graph.nodes.map((n: BrainNode & { members?: number }) => {
          const w = nodeWidth(n.label, n.members);
          const sel = n.id === selNode;
          const hit = highlight.has(n.id);
          const color = NODE_KINDS[n.kind].color;
          const isGroup = !!n.members;
          return (
            <g key={n.id} data-node={n.id} transform={`translate(${n.x} ${n.y})`} className="cursor-grab active:cursor-grabbing">
              {hit && <rect x={-w / 2 - 6} y={-H / 2 - 6} width={w + 12} height={H + 12} rx={20} fill="none" stroke="#e3c98f" strokeWidth={2} opacity={0.75} />}
              <rect
                x={-w / 2}
                y={-H / 2}
                width={w}
                height={H}
                rx={isGroup ? 8 : H / 2}
                fill={isGroup ? '#1b1b1f' : '#17171a'}
                stroke={sel ? '#c9a35a' : isGroup ? '#5e5c57' : '#34343a'}
                strokeWidth={sel ? 2 : 1}
                strokeDasharray={isGroup ? '5 4' : undefined}
              />
              <circle cx={-w / 2 + 16} cy={0} r={5.5} fill={isGroup ? '#5e5c57' : color} />
              <text x={-w / 2 + 29} y={4} fontSize={12.5} fill="#ecebe6" className="pointer-events-none">
                {short(n.label)}
                {isGroup ? ` (${n.members})` : ''}
              </text>
              {n.ref && !isGroup && <circle cx={w / 2 - 12} cy={-H / 2 + 6} r={3} fill="#6fae9a" aria-hidden />}
              {sel && !isGroup && (
                <g data-handle={n.id} className="cursor-crosshair">
                  <circle cx={w / 2 + 12} cy={0} r={9} fill="#0f0f11" stroke="#c9a35a" strokeWidth={1.5} />
                  <path d={`M${w / 2 + 8} 0 h8 M${w / 2 + 12} -4 v8`} stroke="#c9a35a" strokeWidth={1.5} />
                  <title>Drag onto another node to connect</title>
                </g>
              )}
              <title>{`${n.label} — ${isGroup ? `collapsed group of ${n.members} (click to expand)` : NODE_KINDS[n.kind].label}`}</title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
