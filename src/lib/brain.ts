/**
 * Personal Intelligence Brain — a user-owned research graph of events, countries, companies, instruments, indicators
 * and hypotheses with typed, sourced relationships. Pure model logic (no storage, no React); see `brainStore.ts`.
 *
 * Nothing here asserts facts: every relationship is authored by the user and carries the user's own certainty label.
 */

export const BRAIN_SCHEMA = 1;

export const NODE_KINDS = {
  event: { label: 'Event', color: '#d0705f' },
  episode: { label: 'Historical episode', color: '#b4846c' },
  country: { label: 'Country / region', color: '#7d9cc0' },
  company: { label: 'Company', color: '#9d8bb8' },
  institution: { label: 'Institution', color: '#8f9fb3' },
  instrument: { label: 'Instrument', color: '#c9a35a' },
  exchange: { label: 'Exchange / sector', color: '#b89d6a' },
  indicator: { label: 'Economic indicator', color: '#6fae9a' },
  commodity: { label: 'Commodity', color: '#c7894a' },
  document: { label: 'Research document', color: '#a9a69e' },
  scenario: { label: 'Scenario', color: '#d8c27a' },
  note: { label: 'Note / hypothesis', color: '#8a8780' },
} as const;
export type NodeKind = keyof typeof NODE_KINDS;

export const EDGE_TYPES = {
  causes: { label: 'causes / may contribute to', directed: true },
  precedes: { label: 'precedes', directed: true },
  influences: { label: 'influences', directed: true },
  'affects-economically': { label: 'affects economically', directed: true },
  owns: { label: 'owns', directed: true },
  supplies: { label: 'supplies', directed: true },
  correlates: { label: 'correlates with', directed: false },
  related: { label: 'related to', directed: false },
  custom: { label: 'custom', directed: true },
} as const;
export type EdgeType = keyof typeof EDGE_TYPES;

/** User-assigned confidence in a relationship. Not a probability and not verified by Aurora. */
export const CERTAINTY = {
  established: 'Established (well documented)',
  likely: 'Likely',
  possible: 'Possible',
  speculative: 'Speculative / hypothesis',
} as const;
export type Certainty = keyof typeof CERTAINTY;

export interface BrainSource {
  title: string;
  url?: string;
  /** YYYY-MM-DD */
  date?: string;
}

/** Link from a node to an Aurora entity, so the node can open the matching dossier, chart or dataset. */
export type BrainRef =
  | { type: 'country'; iso3: string }
  | { type: 'instrument'; symbol: string }
  | { type: 'cot'; code: string }
  | { type: 'macro'; id: string }
  | { type: 'event'; id: string }
  | { type: 'url'; url: string };

export interface BrainNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  notes?: string;
  /** YYYY-MM-DD (start date for events/episodes) */
  date?: string;
  ref?: BrainRef;
  group?: string;
  sources: BrainSource[];
}

export interface BrainEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  customLabel?: string;
  directed: boolean;
  certainty: Certainty;
  dateFrom?: string;
  dateTo?: string;
  notes?: string;
  sources: BrainSource[];
}

export interface BrainView {
  id: string;
  name: string;
  x: number;
  y: number;
  zoom: number;
  hiddenKinds: NodeKind[];
  collapsedGroups: string[];
}

export interface BrainGraph {
  schema: typeof BRAIN_SCHEMA;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: BrainNode[];
  edges: BrainEdge[];
  views: BrainView[];
}

export interface BrainLimits {
  graphs: number;
  nodesPerGraph: number;
  edgesPerGraph: number;
}

/** Hard ceilings that keep imports and rendering bounded regardless of plan. */
export const MAX = { label: 120, notes: 5000, sources: 20, url: 2048, groupName: 60, viewName: 60, views: 20, importBytes: 5_000_000 } as const;

export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rnd.replace(/-/g, '').slice(0, 16)}`;
}

export function emptyGraph(name: string, now = new Date().toISOString()): BrainGraph {
  return { schema: BRAIN_SCHEMA, id: newId('g'), name: name.trim().slice(0, MAX.label) || 'Untitled graph', createdAt: now, updatedAt: now, nodes: [], edges: [], views: [] };
}

const touch = (g: BrainGraph, now = new Date().toISOString()): BrainGraph => ({ ...g, updatedAt: now });

export class BrainLimitError extends Error {}

export function addNode(g: BrainGraph, node: Omit<BrainNode, 'id' | 'sources'> & { id?: string; sources?: BrainSource[] }, limits?: BrainLimits): { graph: BrainGraph; node: BrainNode } {
  if (limits && g.nodes.length >= limits.nodesPerGraph) throw new BrainLimitError(`This graph has reached its limit of ${limits.nodesPerGraph} nodes.`);
  const n: BrainNode = { ...node, id: node.id ?? newId('n'), label: node.label.trim().slice(0, MAX.label) || NODE_KINDS[node.kind].label, sources: node.sources ?? [] };
  return { graph: touch({ ...g, nodes: [...g.nodes, n] }), node: n };
}

export function updateNode(g: BrainGraph, id: string, patch: Partial<Omit<BrainNode, 'id'>>): BrainGraph {
  return touch({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch, label: (patch.label ?? n.label).slice(0, MAX.label) } : n)) });
}

/** Moves several nodes at once without bumping `updatedAt` per frame (callers persist after the drag ends). */
export function moveNodes(g: BrainGraph, positions: Map<string, { x: number; y: number }>): BrainGraph {
  return { ...g, nodes: g.nodes.map((n) => (positions.has(n.id) ? { ...n, ...positions.get(n.id)! } : n)) };
}

export function removeNodes(g: BrainGraph, ids: Set<string>): BrainGraph {
  return touch({ ...g, nodes: g.nodes.filter((n) => !ids.has(n.id)), edges: g.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)) });
}

export function connect(
  g: BrainGraph,
  from: string,
  to: string,
  type: EdgeType = 'related',
  limits?: BrainLimits,
): { graph: BrainGraph; edge: BrainEdge | null; reason?: string } {
  if (from === to) return { graph: g, edge: null, reason: 'A node cannot be connected to itself.' };
  if (!g.nodes.some((n) => n.id === from) || !g.nodes.some((n) => n.id === to)) return { graph: g, edge: null, reason: 'Unknown node.' };
  const directed = EDGE_TYPES[type].directed;
  const dup = g.edges.find((e) => e.type === type && ((e.from === from && e.to === to) || (!directed && e.from === to && e.to === from)));
  if (dup) return { graph: g, edge: null, reason: 'These nodes already have this relationship.' };
  if (limits && g.edges.length >= limits.edgesPerGraph) throw new BrainLimitError(`This graph has reached its limit of ${limits.edgesPerGraph} connections.`);
  const edge: BrainEdge = { id: newId('e'), from, to, type, directed, certainty: 'possible', sources: [] };
  return { graph: touch({ ...g, edges: [...g.edges, edge] }), edge };
}

export function updateEdge(g: BrainGraph, id: string, patch: Partial<Omit<BrainEdge, 'id' | 'from' | 'to'>>): BrainGraph {
  return touch({ ...g, edges: g.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
}

export function reverseEdge(g: BrainGraph, id: string): BrainGraph {
  return touch({ ...g, edges: g.edges.map((e) => (e.id === id ? { ...e, from: e.to, to: e.from } : e)) });
}

export function removeEdges(g: BrainGraph, ids: Set<string>): BrainGraph {
  return touch({ ...g, edges: g.edges.filter((e) => !ids.has(e.id)) });
}

export function edgeLabel(e: BrainEdge): string {
  return e.type === 'custom' ? e.customLabel?.trim() || 'custom' : EDGE_TYPES[e.type].label;
}

/** Case-insensitive match on label, notes, group and source titles. */
export function searchNodes(g: BrainGraph, query: string): BrainNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return g.nodes.filter((n) => [n.label, n.notes, n.group, ...n.sources.map((s) => s.title)].some((v) => v?.toLowerCase().includes(q)));
}

export interface VisibleGraph {
  nodes: (BrainNode & { members?: number })[];
  edges: (BrainEdge & { count?: number })[];
}

/**
 * What the canvas draws: hidden kinds are removed; each collapsed group is replaced by one aggregate node placed at
 * its members' centroid, and edges are rerouted to it (parallel edges merged, internal edges dropped).
 */
export function visibleGraph(g: BrainGraph, hiddenKinds: ReadonlySet<NodeKind>, collapsedGroups: ReadonlySet<string>): VisibleGraph {
  const shown = g.nodes.filter((n) => !hiddenKinds.has(n.kind));
  const owner = new Map<string, string>();
  const groups = new Map<string, BrainNode[]>();
  for (const n of shown) {
    if (n.group && collapsedGroups.has(n.group)) {
      owner.set(n.id, `group:${n.group}`);
      groups.set(n.group, [...(groups.get(n.group) ?? []), n]);
    } else owner.set(n.id, n.id);
  }
  const nodes: VisibleGraph['nodes'] = shown.filter((n) => owner.get(n.id) === n.id);
  for (const [name, members] of groups) {
    nodes.push({
      id: `group:${name}`,
      kind: 'note',
      label: name,
      group: name,
      x: members.reduce((s, m) => s + m.x, 0) / members.length,
      y: members.reduce((s, m) => s + m.y, 0) / members.length,
      sources: [],
      members: members.length,
    });
  }
  const merged = new Map<string, BrainEdge & { count?: number }>();
  for (const e of g.edges) {
    const from = owner.get(e.from);
    const to = owner.get(e.to);
    if (!from || !to || from === to) continue;
    if (from === e.from && to === e.to) {
      merged.set(e.id, e);
      continue;
    }
    const key = `${from}>${to}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, count: (prev.count ?? 1) + 1 } : { ...e, id: key, from, to, type: 'related', directed: false, count: 1 });
  }
  return { nodes, edges: [...merged.values()] };
}

export function groupsOf(g: BrainGraph): string[] {
  return [...new Set(g.nodes.map((n) => n.group).filter((x): x is string => !!x))].sort();
}

// ---------- Import / export ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const date = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, v)) : 0);
const isHttp = (u: string) => /^https?:\/\//i.test(u);

function sources(v: unknown): BrainSource[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX.sources).flatMap((s) => {
    const title = str((s as BrainSource)?.title, MAX.label)?.trim();
    if (!title) return [];
    const url = str((s as BrainSource).url, MAX.url);
    return [{ title, ...(url && isHttp(url) ? { url } : {}), ...(date((s as BrainSource).date) ? { date: (s as BrainSource).date } : {}) }];
  });
}

function ref(v: unknown): BrainRef | undefined {
  const r = v as Record<string, unknown> | undefined;
  if (!r || typeof r !== 'object') return undefined;
  if (r.type === 'country' && typeof r.iso3 === 'string' && /^[A-Z]{3}$/.test(r.iso3)) return { type: 'country', iso3: r.iso3 };
  if (r.type === 'instrument' && typeof r.symbol === 'string' && /^[A-Z0-9.-]{1,20}$/.test(r.symbol)) return { type: 'instrument', symbol: r.symbol };
  if (r.type === 'cot' && typeof r.code === 'string' && /^[0-9A-Z]{6}$/.test(r.code)) return { type: 'cot', code: r.code };
  if (r.type === 'macro' && typeof r.id === 'string' && /^[A-Z0-9-]{3,12}$/.test(r.id)) return { type: 'macro', id: r.id };
  if (r.type === 'event' && typeof r.id === 'string' && r.id.length <= 120) return { type: 'event', id: r.id };
  if (r.type === 'url' && typeof r.url === 'string' && isHttp(r.url) && r.url.length <= MAX.url) return { type: 'url', url: r.url };
  return undefined;
}

export class BrainImportError extends Error {}

/**
 * Strict import of a graph file (`exportJson` format). Unknown fields are dropped, strings are truncated, non-http URLs
 * removed, dangling edges discarded, and ids regenerated when they collide with `existingIds`.
 */
export function parseGraph(text: string, limits: BrainLimits, existingIds: ReadonlySet<string> = new Set()): BrainGraph {
  if (text.length > MAX.importBytes) throw new BrainImportError('The file is too large to import.');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new BrainImportError('The file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || raw.format !== 'aurora-brain' || !raw.graph) throw new BrainImportError('This is not an Aurora Brain export.');
  const g = raw.graph as Record<string, unknown>;
  if (g.schema !== BRAIN_SCHEMA) throw new BrainImportError(`Unsupported graph version (${String(g.schema)}).`);
  const rawNodes = Array.isArray(g.nodes) ? g.nodes : [];
  const rawEdges = Array.isArray(g.edges) ? g.edges : [];
  if (rawNodes.length > limits.nodesPerGraph) throw new BrainImportError(`The graph has ${rawNodes.length} nodes; your limit is ${limits.nodesPerGraph}.`);
  if (rawEdges.length > limits.edgesPerGraph) throw new BrainImportError(`The graph has ${rawEdges.length} connections; your limit is ${limits.edgesPerGraph}.`);

  const idMap = new Map<string, string>();
  const nodes: BrainNode[] = rawNodes.flatMap((v) => {
    const n = v as Record<string, unknown>;
    const kind = n.kind as NodeKind;
    const label = str(n.label, MAX.label)?.trim();
    if (!(kind in NODE_KINDS) || !label || typeof n.id !== 'string' || idMap.has(n.id)) return [];
    idMap.set(n.id, newId('n'));
    const notes = str(n.notes, MAX.notes);
    const group = str(n.group, MAX.groupName)?.trim();
    const r = ref(n.ref);
    return [{ id: idMap.get(n.id)!, kind, label, x: num(n.x), y: num(n.y), sources: sources(n.sources), ...(notes ? { notes } : {}), ...(date(n.date) ? { date: n.date as string } : {}), ...(r ? { ref: r } : {}), ...(group ? { group } : {}) }];
  });
  const edges: BrainEdge[] = rawEdges.flatMap((v) => {
    const e = v as Record<string, unknown>;
    const from = idMap.get(e.from as string);
    const to = idMap.get(e.to as string);
    const type = e.type as EdgeType;
    if (!from || !to || from === to || !(type in EDGE_TYPES)) return [];
    const certainty = (e.certainty as Certainty) in CERTAINTY ? (e.certainty as Certainty) : 'possible';
    const notes = str(e.notes, MAX.notes);
    const customLabel = str(e.customLabel, MAX.label);
    return [{ id: newId('e'), from, to, type, certainty, directed: typeof e.directed === 'boolean' ? e.directed : EDGE_TYPES[type].directed, sources: sources(e.sources), ...(notes ? { notes } : {}), ...(customLabel ? { customLabel } : {}), ...(date(e.dateFrom) ? { dateFrom: e.dateFrom as string } : {}), ...(date(e.dateTo) ? { dateTo: e.dateTo as string } : {}) }];
  });
  const views: BrainView[] = (Array.isArray(g.views) ? g.views : []).slice(0, MAX.views).flatMap((v) => {
    const w = v as Record<string, unknown>;
    const name = str(w.name, MAX.viewName)?.trim();
    if (!name) return [];
    return [{ id: newId('v'), name, x: num(w.x), y: num(w.y), zoom: Math.min(4, Math.max(0.1, num(w.zoom) || 1)), hiddenKinds: (Array.isArray(w.hiddenKinds) ? w.hiddenKinds : []).filter((k): k is NodeKind => typeof k === 'string' && k in NODE_KINDS), collapsedGroups: (Array.isArray(w.collapsedGroups) ? w.collapsedGroups : []).filter((s): s is string => typeof s === 'string').slice(0, 50) }];
  });
  const now = new Date().toISOString();
  const id = typeof g.id === 'string' && /^g_[a-z0-9]{1,32}$/.test(g.id) && !existingIds.has(g.id) ? g.id : newId('g');
  return { schema: BRAIN_SCHEMA, id, name: str(g.name, MAX.label)?.trim() || 'Imported graph', createdAt: typeof g.createdAt === 'string' ? g.createdAt : now, updatedAt: now, nodes, edges, views };
}

export function exportJson(g: BrainGraph): string {
  return JSON.stringify({ format: 'aurora-brain', exportedAt: new Date().toISOString(), graph: g }, null, 2);
}

const mdEscape = (s: string) => s.replace(/[[\]|]/g, ' ').trim();

/**
 * Obsidian-compatible Markdown: one section per node with `[[wiki links]]` to related nodes, so the export can be
 * dropped into a personal vault. (Not reimported — JSON is the lossless format.)
 */
export function exportMarkdown(g: BrainGraph): string {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = [`# ${g.name}`, '', `Exported from Aurora Veritatis Brain on ${new Date().toISOString().slice(0, 10)}. Relationships and certainty labels are the author's own assessments.`, ''];
  for (const n of [...g.nodes].sort((a, b) => a.label.localeCompare(b.label))) {
    out.push(`## ${mdEscape(n.label)}`, `- Type: ${NODE_KINDS[n.kind].label}${n.date ? ` · Date: ${n.date}` : ''}${n.group ? ` · Group: ${n.group}` : ''}`);
    if (n.notes) out.push('', n.notes.trim());
    const rels = g.edges.filter((e) => e.from === n.id || (!e.directed && e.to === n.id));
    for (const e of rels) {
      const other = byId.get(e.from === n.id ? e.to : e.from);
      if (!other) continue;
      const when = e.dateFrom || e.dateTo ? ` (${e.dateFrom ?? '…'} – ${e.dateTo ?? '…'})` : '';
      out.push(`- ${edgeLabel(e)} [[${mdEscape(other.label)}]] (${CERTAINTY[e.certainty]})${when}`);
      for (const s of e.sources) out.push(`  - Source: ${s.url ? `[${mdEscape(s.title)}](${s.url})` : s.title}${s.date ? `, ${s.date}` : ''}`);
    }
    for (const s of n.sources) out.push(`- Source: ${s.url ? `[${mdEscape(s.title)}](${s.url})` : s.title}${s.date ? `, ${s.date}` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

// ---------- Templates ----------

export interface BrainTemplate {
  id: string;
  name: string;
  description: string;
  build: () => BrainGraph;
}

type Spec = [key: string, kind: NodeKind, label: string, x: number, y: number, extra?: Partial<BrainNode>];

function fromSpec(name: string, specs: Spec[], links: [string, string, EdgeType][]): BrainGraph {
  let g = emptyGraph(name);
  const ids = new Map<string, string>();
  for (const [key, kind, label, x, y, extra] of specs) {
    const r = addNode(g, { kind, label, x, y, ...extra });
    g = r.graph;
    ids.set(key, r.node.id);
  }
  for (const [a, b, type] of links) g = connect(g, ids.get(a)!, ids.get(b)!, type).graph;
  return { ...g, edges: g.edges.map((e) => ({ ...e, certainty: 'speculative' as Certainty })) };
}

/**
 * Starting structures, not research findings: every relationship is marked "speculative" until the user documents it.
 * Nodes link to Aurora datasets so the template can be explored against real data immediately.
 */
export const TEMPLATES: BrainTemplate[] = [
  {
    id: 'energy-shock',
    name: 'Energy supply shock → inflation → rates',
    description: 'A transmission chain to adapt: supply disruption, energy prices, euro-area inflation, ECB policy, the euro and positioning.',
    build: () =>
      fromSpec(
        'Energy shock transmission',
        [
          ['shock', 'event', 'Energy supply disruption (describe)', -320, 0, { notes: 'Replace with a documented event and add sources.' }],
          ['gas', 'commodity', 'Natural gas', -120, -110, { ref: { type: 'cot', code: '023651' } }],
          ['oil', 'commodity', 'Crude oil', -120, 110, { ref: { type: 'cot', code: '067651' } }],
          ['hicp', 'indicator', 'Euro-area HICP inflation', 90, 0, { ref: { type: 'macro', id: 'HICP' } }],
          ['dfr', 'indicator', 'ECB deposit facility rate', 290, -90, { ref: { type: 'macro', id: 'ECB-DFR' } }],
          ['eur', 'instrument', 'EUR/USD reference rate', 290, 90, { ref: { type: 'macro', id: 'EURUSD' } }],
          ['note', 'note', 'Hypothesis: how persistent is the pass-through?', 90, 190],
        ],
        [
          ['shock', 'gas', 'affects-economically'],
          ['shock', 'oil', 'affects-economically'],
          ['gas', 'hicp', 'influences'],
          ['oil', 'hicp', 'influences'],
          ['hicp', 'dfr', 'influences'],
          ['dfr', 'eur', 'correlates'],
          ['note', 'hicp', 'related'],
        ],
      ),
  },
  {
    id: 'country-exposure',
    name: 'Country exposure map',
    description: 'A country at the centre with its key commodities, trading partners, currency and policy indicators.',
    build: () =>
      fromSpec(
        'Country exposure',
        [
          ['c', 'country', 'Germany', 0, 0, { ref: { type: 'country', iso3: 'DEU' } }],
          ['p1', 'country', 'France', -260, -120, { ref: { type: 'country', iso3: 'FRA' } }],
          ['p2', 'country', 'China', -260, 120, { ref: { type: 'country', iso3: 'CHN' } }],
          ['gas', 'commodity', 'Natural gas', 240, -140, { ref: { type: 'cot', code: '023651' } }],
          ['fx', 'instrument', 'EUR/USD reference rate', 260, 20, { ref: { type: 'macro', id: 'EURUSD' } }],
          ['y10', 'indicator', 'Euro-area 10-year yield', 240, 160, { ref: { type: 'macro', id: 'EA-10Y' } }],
        ],
        [
          ['c', 'p1', 'related'],
          ['c', 'p2', 'related'],
          ['gas', 'c', 'affects-economically'],
          ['c', 'fx', 'related'],
          ['c', 'y10', 'related'],
        ],
      ),
  },
  {
    id: 'blank',
    name: 'Blank graph',
    description: 'Start from an empty canvas.',
    build: () => emptyGraph('New graph'),
  },
];
