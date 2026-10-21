import { describe, expect, it } from 'vitest';
import {
  BrainImportError,
  BrainLimitError,
  TEMPLATES,
  addNode,
  connect,
  emptyGraph,
  exportJson,
  exportMarkdown,
  parseGraph,
  removeNodes,
  reverseEdge,
  searchNodes,
  updateEdge,
  visibleGraph,
  type BrainGraph,
} from './brain';
import { columnsLayout, fitView, forceLayout, nodeBoxes, timelineLayout } from './brainLayout';

const LIMITS = { graphs: 3, nodesPerGraph: 100, edgesPerGraph: 400 };

function sample(): { g: BrainGraph; a: string; b: string; c: string } {
  let g = emptyGraph('Test');
  const a = addNode(g, { kind: 'event', label: 'Pipeline outage', x: 0, y: 0, date: '2026-01-10', group: 'Energy' });
  g = a.graph;
  const b = addNode(g, { kind: 'commodity', label: 'Natural gas', x: 100, y: 0, group: 'Energy', ref: { type: 'cot', code: '023651' } });
  g = b.graph;
  const c = addNode(g, { kind: 'indicator', label: 'HICP inflation', x: 200, y: 50, notes: 'Euro area', ref: { type: 'macro', id: 'HICP' } });
  g = c.graph;
  return { g, a: a.node.id, b: b.node.id, c: c.node.id };
}

describe('Brain model', () => {
  it('adds nodes and typed edges, rejecting self-links and duplicates', () => {
    const { g, a, b } = sample();
    const r = connect(g, a, b, 'causes');
    expect(r.edge).toMatchObject({ from: a, to: b, type: 'causes', directed: true, certainty: 'possible' });
    expect(connect(r.graph, a, b, 'causes').reason).toMatch(/already/);
    expect(connect(r.graph, a, a, 'related').reason).toMatch(/itself/);
    // Undirected duplicates are detected in either direction.
    const u = connect(r.graph, a, b, 'correlates').graph;
    expect(connect(u, b, a, 'correlates').edge).toBeNull();
  });

  it('enforces node and edge limits', () => {
    const { g, a, b } = sample();
    expect(() => addNode(g, { kind: 'note', label: 'x', x: 0, y: 0 }, { ...LIMITS, nodesPerGraph: 3 })).toThrow(BrainLimitError);
    expect(() => connect(g, a, b, 'related', { ...LIMITS, edgesPerGraph: 0 })).toThrow(BrainLimitError);
  });

  it('removes nodes with their edges and reverses edges', () => {
    const { g, a, b, c } = sample();
    let h = connect(g, a, b, 'causes').graph;
    h = connect(h, b, c, 'influences').graph;
    const e = h.edges[0]!;
    expect(reverseEdge(h, e.id).edges[0]).toMatchObject({ from: b, to: a });
    const r = removeNodes(h, new Set([b]));
    expect(r.nodes.map((n) => n.id)).toEqual([a, c]);
    expect(r.edges).toHaveLength(0);
  });

  it('searches labels, notes, groups and sources', () => {
    const { g } = sample();
    expect(searchNodes(g, 'euro').map((n) => n.label)).toEqual(['HICP inflation']);
    expect(searchNodes(g, 'energy')).toHaveLength(2);
    expect(searchNodes(g, '  ')).toEqual([]);
  });

  it('collapses groups into one node and reroutes edges', () => {
    const { g, a, b, c } = sample();
    let h = connect(g, a, b, 'causes').graph; // internal to "Energy" → dropped when collapsed
    h = connect(h, a, c, 'influences').graph;
    h = connect(h, b, c, 'influences').graph; // merged with the previous one
    const v = visibleGraph(h, new Set(), new Set(['Energy']));
    expect(v.nodes.map((n) => n.id).sort()).toEqual([c, 'group:Energy'].sort());
    const grp = v.nodes.find((n) => n.id === 'group:Energy')!;
    expect(grp).toMatchObject({ members: 2, x: 50, y: 0 });
    expect(v.edges).toHaveLength(1);
    expect(v.edges[0]).toMatchObject({ from: 'group:Energy', to: c, count: 2 });
    const hidden = visibleGraph(h, new Set(['indicator']), new Set());
    expect(hidden.nodes).toHaveLength(2);
    expect(hidden.edges).toHaveLength(1);
  });
});

describe('Brain import / export', () => {
  it('round-trips through JSON with new ids', () => {
    const { g, a, b } = sample();
    let h = connect(g, a, b, 'supplies').graph;
    h = updateEdge(h, h.edges[0]!.id, { certainty: 'established', sources: [{ title: 'Operator notice', url: 'https://example.org/n', date: '2026-01-11' }], dateFrom: '2026-01-10' });
    const back = parseGraph(exportJson(h), LIMITS, new Set([h.id]));
    expect(back.id).not.toBe(h.id);
    expect(back.nodes.map((n) => n.label)).toEqual(h.nodes.map((n) => n.label));
    expect(back.nodes.map((n) => n.id)).not.toContain(a);
    expect(back.edges[0]).toMatchObject({ type: 'supplies', certainty: 'established', dateFrom: '2026-01-10', sources: [{ title: 'Operator notice', url: 'https://example.org/n', date: '2026-01-11' }] });
    expect(back.nodes.find((n) => n.label === 'Natural gas')!.ref).toEqual({ type: 'cot', code: '023651' });
  });

  it('sanitises hostile or malformed input', () => {
    const file = JSON.stringify({
      format: 'aurora-brain',
      graph: {
        schema: 1,
        name: 'x'.repeat(500),
        nodes: [
          { id: '1', kind: 'event', label: 'ok', x: 1e12, y: 'bad', sources: [{ title: 's', url: 'javascript:alert(1)' }], ref: { type: 'url', url: 'javascript:alert(1)' } },
          { id: '2', kind: 'not-a-kind', label: 'dropped' },
          { id: '3', kind: 'note', label: '' },
          { id: '1', kind: 'note', label: 'duplicate id' },
          { id: '4', kind: 'note', label: 'n', ref: { type: 'country', iso3: 'deu' } },
        ],
        edges: [
          { from: '1', to: '4', type: 'causes', certainty: 'certain!!' },
          { from: '1', to: '99', type: 'causes' },
          { from: '1', to: '4', type: 'teleports' },
        ],
        extra: 'ignored',
      },
    });
    const g = parseGraph(file, LIMITS);
    expect(g.name).toHaveLength(120);
    expect(g.nodes.map((n) => n.label)).toEqual(['ok', 'n']);
    expect(g.nodes[0]).toMatchObject({ x: 1e6, y: 0 });
    expect(g.nodes[0]!.sources[0]!.url).toBeUndefined();
    expect(g.nodes[0]!.ref).toBeUndefined();
    expect(g.nodes[1]!.ref).toBeUndefined(); // lower-case ISO code rejected
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.certainty).toBe('possible');
  });

  it('rejects non-graph files and files over the plan limit', () => {
    expect(() => parseGraph('{', LIMITS)).toThrow(BrainImportError);
    expect(() => parseGraph('{"format":"other"}', LIMITS)).toThrow(/not an Aurora Brain/);
    expect(() => parseGraph(JSON.stringify({ format: 'aurora-brain', graph: { schema: 2 } }), LIMITS)).toThrow(/version/);
    const big = { format: 'aurora-brain', graph: { schema: 1, nodes: Array.from({ length: 5 }, (_, i) => ({ id: String(i), kind: 'note', label: 'n' })), edges: [] } };
    expect(() => parseGraph(JSON.stringify(big), { ...LIMITS, nodesPerGraph: 4 })).toThrow(/limit is 4/);
  });

  it('exports Obsidian-style Markdown with wiki links, certainty and sources', () => {
    const { g, a, b } = sample();
    let h = connect(g, a, b, 'affects-economically').graph;
    h = updateEdge(h, h.edges[0]!.id, { certainty: 'likely', sources: [{ title: 'Regulator report', url: 'https://example.org/r' }] });
    const md = exportMarkdown(h);
    expect(md).toContain('## Pipeline outage');
    expect(md).toContain('- affects economically [[Natural gas]] — Likely');
    expect(md).toContain('[Regulator report](https://example.org/r)');
  });

  it('builds templates whose relationships are all marked speculative', () => {
    for (const t of TEMPLATES) {
      const g = t.build();
      expect(g.edges.every((e) => e.certainty === 'speculative')).toBe(true);
      expect(g.edges.every((e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to))).toBe(true);
    }
    expect(TEMPLATES[0]!.build().nodes.length).toBeGreaterThan(3);
  });
});

describe('Brain layouts', () => {
  it('force layout is deterministic and separates nodes', () => {
    const { g, a, b, c } = sample();
    const h = connect(connect(g, a, b, 'causes').graph, b, c, 'influences').graph;
    const one = forceLayout(h);
    expect(forceLayout(h)).toEqual(one);
    const [p, q] = [one.get(a)!, one.get(b)!];
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(60);
  });

  it('columns and timeline layouts', () => {
    const { g, a, b, c } = sample();
    const cols = columnsLayout(g);
    expect(new Set([cols.get(a)!.x, cols.get(b)!.x, cols.get(c)!.x]).size).toBe(3);
    const tl = timelineLayout(g);
    expect(tl.get(a)!.y).toBeLessThan(tl.get(b)!.y); // dated row above undated row
  });

  it('fits whole node boxes into the viewport', () => {
    const v = fitView([{ x: -100, y: -50 }, { x: 100, y: 50 }], 800, 600);
    expect(v.x).toBeCloseTo(400);
    expect(v.y).toBeCloseTo(300);
    expect(fitView([], 800, 600)).toEqual({ x: 400, y: 300, zoom: 1 });
    // A wide box must end up fully inside a narrow viewport (left edge ≥ pad, right edge ≤ width − pad).
    const boxes = nodeBoxes([{ x: 0, y: 0, label: 'A very long label for a node in the graph' }, { x: 300, y: 0, label: 'B' }]);
    const f = fitView(boxes, 360, 500);
    for (const b of boxes) {
      expect(f.x + (b.x - b.w! / 2) * f.zoom).toBeGreaterThanOrEqual(23.9);
      expect(f.x + (b.x + b.w! / 2) * f.zoom).toBeLessThanOrEqual(360 - 23.9);
    }
  });
});
