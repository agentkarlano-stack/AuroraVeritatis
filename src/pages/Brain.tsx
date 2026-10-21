import { Download, ExternalLink, LayoutGrid, Maximize2, Network, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BrainCanvas, type Selection, type Viewport } from '../components/BrainCanvas';
import { PageHeader, Panel } from '../components/ui';
import {
  BrainImportError,
  BrainLimitError,
  CERTAINTY,
  EDGE_TYPES,
  NODE_KINDS,
  TEMPLATES,
  addNode,
  connect,
  edgeLabel,
  exportJson,
  exportMarkdown,
  groupsOf,
  moveNodes,
  newId,
  parseGraph,
  removeEdges,
  removeNodes,
  reverseEdge,
  searchNodes,
  updateEdge,
  updateNode,
  visibleGraph,
  type BrainEdge,
  type BrainGraph,
  type BrainNode,
  type BrainRef,
  type BrainSource,
  type Certainty,
  type EdgeType,
  type NodeKind,
} from '../lib/brain';
import { refHref, searchEntities } from '../lib/brainEntities';
import { columnsLayout, fitView, forceLayout, nodeBoxes, timelineLayout } from '../lib/brainLayout';
import { deleteGraph, getActiveGraphId, getGraph, listGraphs, requestPersistence, saveGraph, setActiveGraphId, type GraphSummary } from '../lib/brainStore';
import { brainLimits, useTier } from '../lib/entitlements';
import { plural } from '../lib/format';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };
const KINDS = Object.keys(NODE_KINDS) as NodeKind[];
const TYPES = Object.keys(EDGE_TYPES) as EdgeType[];
const CERTAINTIES = Object.keys(CERTAINTY) as Certainty[];

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const fileName = (g: BrainGraph, ext: string) => `aurora-brain-${g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graph'}.${ext}`;

export default function Brain() {
  const limits = brainLimits(useTier());
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [graph, setGraph] = useState<BrainGraph | null>(null);
  const [view, setView] = useState<Viewport>({ x: 400, y: 300, zoom: 1 });
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newKind, setNewKind] = useState<NodeKind>('event');
  const [newLabel, setNewLabel] = useState('');
  const [viewName, setViewName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef<BrainGraph | null>(null);
  const current = useRef<BrainGraph | null>(null);
  /** Set when a graph is opened before the canvas has a size (e.g. it is created from the empty state). */
  const pendingFit = useRef(false);

  const fit = (g: BrainGraph | null, hiddenKinds = hidden, groups = collapsed) => {
    const el = box.current;
    if (!g) return;
    if (!el || el.clientWidth === 0) {
      pendingFit.current = true;
      return;
    }
    pendingFit.current = false;
    setView(fitView(nodeBoxes(visibleGraph(g, hiddenKinds, groups).nodes), el.clientWidth, el.clientHeight));
  };

  const open = (g: BrainGraph) => {
    setGraph(g);
    setSelection(null);
    setHidden(new Set());
    setCollapsed(new Set());
    setConfirmDelete(false);
    fit(g, new Set(), new Set());
    void setActiveGraphId(g.id);
  };

  // Initial load from IndexedDB (async callbacks only — no synchronous state updates in the effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listGraphs();
      const active = await getActiveGraphId();
      const g = (active && list.some((s) => s.id === active) ? await getGraph(active) : undefined) ?? (list[0] ? await getGraph(list[0].id) : undefined);
      if (cancelled) return;
      setGraphs(list);
      if (g) open(g);
      setLoad({ status: 'ready' });
      setPersistent(await requestPersistence());
    })().catch((e: Error) => !cancelled && setLoad({ status: 'error', message: e.message }));
    return () => {
      cancelled = true;
    };
    // open/fit are stable in behaviour; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit a newly opened graph once the canvas container exists and has a size.
  const hasGraph = !!graph;
  useEffect(() => {
    current.current = graph;
  }, [graph]);
  useEffect(() => {
    const el = box.current;
    if (!hasGraph || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (pendingFit.current && current.current && el.clientWidth > 0) {
        pendingFit.current = false;
        setView(fitView(nodeBoxes(visibleGraph(current.current, new Set(), new Set()).nodes), el.clientWidth, el.clientHeight));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasGraph]);

  // Debounced autosave; also flushes on unmount so the last edit is never lost.
  useEffect(() => {
    if (!graph) return;
    latest.current = graph;
    const t = setTimeout(() => {
      saveGraph(graph)
        .then(() => {
          setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          return listGraphs();
        })
        .then(setGraphs)
        .catch((e: Error) => setMessage({ tone: 'error', text: `Could not save: ${e.message}` }));
      latest.current = null;
    }, 400);
    return () => clearTimeout(t);
  }, [graph]);
  useEffect(
    () => () => {
      if (latest.current) void saveGraph(latest.current);
    },
    [],
  );

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (e instanceof BrainLimitError) setMessage({ tone: 'error', text: e.message });
      else throw e;
    }
  };

  const createFrom = (templateId: string) => {
    if (graphs.length >= limits.graphs) {
      setMessage({ tone: 'error', text: `Your plan allows ${plural(limits.graphs, 'graph')}. Export and delete one to create another.` });
      return;
    }
    const t = TEMPLATES.find((x) => x.id === templateId)!;
    const g = t.build();
    void saveGraph(g).then(() => listGraphs().then(setGraphs));
    open(g);
    setMessage({ tone: 'info', text: `Created "${g.name}". Template relationships are marked speculative until you document them.` });
  };

  const switchTo = (id: string) => {
    if (id === graph?.id) return;
    void getGraph(id).then((g) => g && open(g));
  };

  const center = () => {
    const el = box.current;
    return el ? { x: Math.round((el.clientWidth / 2 - view.x) / view.zoom), y: Math.round((el.clientHeight / 2 - view.y) / view.zoom) } : { x: 0, y: 0 };
  };

  const add = (node: Omit<BrainNode, 'id' | 'sources' | 'x' | 'y'> & { x?: number; y?: number }) =>
    guard(() => {
      if (!graph) return;
      const c = center();
      const jitter = (graph.nodes.length % 5) * 18;
      const r = addNode(graph, { x: c.x + jitter, y: c.y + jitter, ...node }, limits);
      setGraph(r.graph);
      setSelection({ type: 'node', id: r.node.id });
    });

  const deleteSelection = () => {
    if (!graph || !selection) return;
    setGraph(selection.type === 'node' ? removeNodes(graph, new Set([selection.id])) : removeEdges(graph, new Set([selection.id])));
    setSelection(null);
  };

  const applyLayout = (kind: 'force' | 'columns' | 'timeline') => {
    if (!graph) return;
    const pos = kind === 'force' ? forceLayout(graph) : kind === 'columns' ? columnsLayout(graph) : timelineLayout(graph);
    const g = { ...moveNodes(graph, pos), updatedAt: new Date().toISOString() };
    setGraph(g);
    fit(g);
  };

  const onImport = async (file: File) => {
    try {
      if (graphs.length >= limits.graphs) throw new BrainImportError(`Your plan allows ${plural(limits.graphs, 'graph')}. Export and delete one first.`);
      const g = parseGraph(await file.text(), limits, new Set(graphs.map((s) => s.id)));
      await saveGraph(g);
      setGraphs(await listGraphs());
      open(g);
      setMessage({ tone: 'info', text: `Imported "${g.name}" (${plural(g.nodes.length, 'node')}, ${plural(g.edges.length, 'connection')}).` });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Import failed.' });
    }
  };

  const removeGraph = async () => {
    if (!graph) return;
    await deleteGraph(graph.id);
    latest.current = null;
    const list = await listGraphs();
    setGraphs(list);
    setConfirmDelete(false);
    const next = list[0] ? await getGraph(list[0].id) : undefined;
    if (next) open(next);
    else {
      setGraph(null);
      setSelection(null);
    }
    setMessage({ tone: 'info', text: 'Graph deleted from this browser.' });
  };

  const vis = graph ? visibleGraph(graph, hidden, collapsed) : { nodes: [], edges: [] };
  const matches = graph ? searchNodes(graph, query) : [];
  const highlight = new Set(matches.map((n) => n.id));
  const groups = graph ? groupsOf(graph) : [];
  const selNode = selection?.type === 'node' ? graph?.nodes.find((n) => n.id === selection.id) : undefined;
  const selEdge = selection?.type === 'edge' ? graph?.edges.find((e) => e.id === selection.id) : undefined;

  const focusNode = (n: BrainNode) => {
    const el = box.current;
    setSelection({ type: 'node', id: n.id });
    if (el) setView({ zoom: Math.max(view.zoom, 0.9), x: el.clientWidth / 2 - n.x * Math.max(view.zoom, 0.9), y: el.clientHeight / 2 - n.y * Math.max(view.zoom, 0.9) });
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8">
      <PageHeader eyebrow="Research workspace" title="Personal Intelligence Brain">
        Map how events, countries, companies, markets and indicators connect. Use your own words, sources and level of
        certainty. Nodes link straight to Aurora's dossiers, charts and datasets.
      </PageHeader>

      <div className="mb-4 rounded-lg border border-gold/25 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-mist" role="note">
        <strong className="text-platinum">Stored only in this browser.</strong> Your graphs live in this browser's local storage
        (IndexedDB) on this device. They are not on Aurora's servers and do not sync to other devices. Clearing site data, private
        browsing or uninstalling the browser deletes them. <strong className="text-platinum">Export regularly.</strong> A JSON export
        restores everything.{' '}
        {persistent === true && 'This browser has granted persistent storage.'}
        {persistent === false && 'This browser has not granted persistent storage, so it may evict data when space runs low.'}
      </div>

      {load.status === 'error' && (
        <p className="rounded-lg border border-down/40 bg-down/5 p-4 text-sm text-mist" role="alert">
          Local storage is unavailable: {load.message}. The Brain needs IndexedDB (private browsing modes may block it).
        </p>
      )}
      {message && (
        <div className={`mb-3 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${message.tone === 'error' ? 'border-down/40 bg-down/5 text-down' : 'border-line bg-ink-850 text-mist'}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          <span>{message.text}</span>
          <button className="text-slate-dim hover:text-platinum" aria-label="Dismiss message" onClick={() => setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {load.status === 'ready' && (
        <>
          {/* Graph bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="brain-graph">
              Graph
            </label>
            <select id="brain-graph" className="input h-9 w-auto min-w-48 max-w-full" value={graph?.id ?? ''} onChange={(e) => switchTo(e.target.value)} disabled={graphs.length === 0}>
              {graphs.length === 0 && <option value="">No graphs yet</option>}
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.nodes})
                </option>
              ))}
            </select>
            <select className="input h-9 w-auto max-w-full" value="" aria-label="Create a graph from a template" onChange={(e) => e.target.value && createFrom(e.target.value)}>
              <option value="">+ New graph…</option>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="btn-ghost h-9 text-xs" onClick={() => fileInput.current?.click()}>
              <Upload className="h-3.5 w-3.5" aria-hidden /> Import JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onImport(f);
              }}
            />
            <span className="ml-auto text-xs text-slate-dim">
              {plural(graphs.length, 'graph')} of {limits.graphs} · up to {limits.nodesPerGraph} nodes each {savedAt && `· saved locally ${savedAt}`}
            </span>
          </div>

          {!graph ? (
            <Panel title="Start a graph">
              <div className="grid gap-3 md:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <button key={t.id} className="rounded-lg border border-line p-4 text-left hover:border-gold/50 hover:bg-ink-800/50" onClick={() => createFrom(t.id)}>
                    <Network className="mb-2 h-5 w-5 text-gold" aria-hidden />
                    <span className="block font-medium text-platinum">{t.name}</span>
                    <span className="mt-1 block text-xs text-slate-dim">{t.description}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-dim">Or import a previously exported Aurora Brain JSON file.</p>
            </Panel>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-3">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input h-9 w-auto" value={newKind} onChange={(e) => setNewKind(e.target.value as NodeKind)} aria-label="New node type">
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {NODE_KINDS[k].label}
                      </option>
                    ))}
                  </select>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      add({ kind: newKind, label: newLabel });
                      setNewLabel('');
                    }}
                  >
                    <input className="input h-9 w-48" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} aria-label="New node label" maxLength={120} />
                    <button className="btn-primary h-9 text-xs" type="submit">
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add node
                    </button>
                  </form>
                  <EntityAdd onPick={(e) => add({ kind: e.kind, label: e.label, ref: e.ref })} />
                  <div className="relative ml-auto">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-dim" aria-hidden />
                    <input
                      className="input h-9 w-48 pl-8"
                      placeholder="Search graph…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && matches[0] && focusNode(matches[0])}
                      aria-label="Search nodes"
                    />
                  </div>
                </div>

                <div ref={box} className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-lg border border-line bg-[#111113]">
                  <BrainCanvas
                    graph={vis}
                    view={view}
                    selection={selection}
                    highlight={highlight}
                    onView={setView}
                    onSelect={setSelection}
                    onMove={(pos) => setGraph((g) => (g ? moveNodes(g, pos) : g))}
                    onMoveEnd={() => setGraph((g) => (g ? { ...g, updatedAt: new Date().toISOString() } : g))}
                    onConnect={(from, to) =>
                      guard(() => {
                        const r = connect(graph, from, to, 'related', limits);
                        if (r.edge) {
                          setGraph(r.graph);
                          setSelection({ type: 'edge', id: r.edge.id });
                        } else if (r.reason) setMessage({ tone: 'info', text: r.reason });
                      })
                    }
                    onAddAt={(x, y) => add({ kind: 'note', label: 'New note', x, y })}
                    onDelete={deleteSelection}
                    onFit={() => fit(graph)}
                    onToggleGroup={(name) => setCollapsed((s) => new Set([...s].filter((x) => x !== name)))}
                  />
                  <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                    <button className="chip bg-ink-900/90" onClick={() => fit(graph)} aria-label="Fit graph to view">
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Fit
                    </button>
                    <button className="chip bg-ink-900/90" onClick={() => applyLayout('force')}>
                      <Network className="h-3.5 w-3.5" aria-hidden /> Auto layout
                    </button>
                    <button className="chip bg-ink-900/90" onClick={() => applyLayout('columns')}>
                      <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> By type
                    </button>
                    <button className="chip bg-ink-900/90" onClick={() => applyLayout('timeline')}>
                      Timeline
                    </button>
                  </div>
                  {graph.nodes.length === 0 && (
                    <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-dim">
                      Add a node above, pick an Aurora entity, or double-click the canvas to add a note.
                    </p>
                  )}
                  <span className="pointer-events-none absolute right-2 top-2 rounded bg-ink-900/80 px-2 py-1 text-[11px] text-slate-dim">
                    {Math.round(view.zoom * 100)}% · {plural(graph.nodes.length, 'node')} / {limits.nodesPerGraph}
                  </span>
                </div>
                <p className="text-[11px] text-slate-dim">
                  Drag to pan · scroll or pinch to zoom · drag nodes to arrange · select a node and drag its gold handle onto another node (or Shift-drag) to
                  connect · double-click empty space for a note · Delete removes the selection · F fits. Line style shows your certainty: solid = established/likely,
                  dashed = possible, dotted = speculative.
                </p>
              </div>

              {/* Inspector */}
              <div className="space-y-4">
                {selNode && (
                  <NodeEditor
                    key={selNode.id}
                    node={selNode}
                    graph={graph}
                    groups={groups}
                    onChange={(patch) => setGraph(updateNode(graph, selNode.id, patch))}
                    onConnect={(to, type) =>
                      guard(() => {
                        const r = connect(graph, selNode.id, to, type, limits);
                        if (r.edge) {
                          setGraph(r.graph);
                          setSelection({ type: 'edge', id: r.edge.id });
                        } else if (r.reason) setMessage({ tone: 'info', text: r.reason });
                      })
                    }
                    onSelectEdge={(id) => setSelection({ type: 'edge', id })}
                    onDelete={deleteSelection}
                  />
                )}
                {selEdge && (
                  <EdgeEditor
                    key={selEdge.id}
                    edge={selEdge}
                    graph={graph}
                    onChange={(patch) => setGraph(updateEdge(graph, selEdge.id, patch))}
                    onReverse={() => setGraph(reverseEdge(graph, selEdge.id))}
                    onSelectNode={(id) => setSelection({ type: 'node', id })}
                    onDelete={deleteSelection}
                  />
                )}
                {!selection && (
                  <Panel title="Graph" eyebrow={`${plural(graph.nodes.length, 'node')} · ${plural(graph.edges.length, 'connection')}`}>
                    <div className="space-y-4 text-sm">
                      <label className="block">
                        <span className="label">Name</span>
                        <input className="input" value={graph.name} maxLength={120} onChange={(e) => setGraph({ ...graph, name: e.target.value, updatedAt: new Date().toISOString() })} />
                      </label>
                      <div>
                        <span className="label">Node types (click to hide)</span>
                        <div className="flex flex-wrap gap-1.5">
                          {KINDS.filter((k) => graph.nodes.some((n) => n.kind === k)).map((k) => (
                            <button
                              key={k}
                              className="chip"
                              aria-pressed={!hidden.has(k)}
                              onClick={() => setHidden((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])))}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ background: NODE_KINDS[k].color }} />
                              {NODE_KINDS[k].label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {groups.length > 0 && (
                        <div>
                          <span className="label">Groups (click to collapse)</span>
                          <div className="flex flex-wrap gap-1.5">
                            {groups.map((name) => (
                              <button
                                key={name}
                                className="chip"
                                aria-pressed={collapsed.has(name)}
                                onClick={() => setCollapsed((s) => (s.has(name) ? new Set([...s].filter((x) => x !== name)) : new Set([...s, name])))}
                              >
                                {collapsed.has(name) ? '▸' : '▾'} {name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="label">Saved views</span>
                        <ul className="space-y-1">
                          {graph.views.map((v) => (
                            <li key={v.id} className="flex items-center justify-between gap-2">
                              <button
                                className="text-left text-platinum hover:text-gold-soft"
                                onClick={() => {
                                  setView({ x: v.x, y: v.y, zoom: v.zoom });
                                  setHidden(new Set(v.hiddenKinds));
                                  setCollapsed(new Set(v.collapsedGroups));
                                }}
                              >
                                {v.name}
                              </button>
                              <button className="text-slate-dim hover:text-down" aria-label={`Delete view ${v.name}`} onClick={() => setGraph({ ...graph, views: graph.views.filter((x) => x.id !== v.id), updatedAt: new Date().toISOString() })}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <form
                          className="mt-2 flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const name = viewName.trim();
                            if (!name || graph.views.length >= 20) return;
                            setGraph({ ...graph, views: [...graph.views, { id: newId('v'), name: name.slice(0, 60), ...view, hiddenKinds: [...hidden], collapsedGroups: [...collapsed] }], updatedAt: new Date().toISOString() });
                            setViewName('');
                          }}
                        >
                          <input className="input h-8" placeholder="Save current view as…" value={viewName} onChange={(e) => setViewName(e.target.value)} aria-label="View name" />
                          <button className="btn-ghost h-8 text-xs" type="submit">
                            Save
                          </button>
                        </form>
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                        <button className="btn-ghost text-xs" onClick={() => download(fileName(graph, 'json'), exportJson(graph), 'application/json')}>
                          <Download className="h-3.5 w-3.5" aria-hidden /> Export JSON
                        </button>
                        <button className="btn-ghost text-xs" onClick={() => download(fileName(graph, 'md'), exportMarkdown(graph), 'text/markdown')}>
                          <Download className="h-3.5 w-3.5" aria-hidden /> Markdown (Obsidian)
                        </button>
                        <button className="btn-ghost text-xs text-down" onClick={() => setConfirmDelete(true)}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete graph
                        </button>
                      </div>
                      {confirmDelete && (
                        <div className="rounded-md border border-down/40 bg-down/5 p-3 text-xs" role="alertdialog" aria-label="Confirm graph deletion">
                          <p className="text-platinum">
                            Delete "{graph.name}" from this browser? This cannot be undone. Export it first if you may need it again.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button className="btn-ghost text-xs" onClick={() => download(fileName(graph, 'json'), exportJson(graph), 'application/json')}>
                              Export JSON first
                            </button>
                            <button className="btn-ghost text-xs text-down" onClick={() => void removeGraph()}>
                              Delete permanently
                            </button>
                            <button className="btn-ghost text-xs" onClick={() => setConfirmDelete(false)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Panel>
                )}
                <Panel title="Outline" eyebrow="Keyboard-friendly list" bodyClass="max-h-72 overflow-y-auto p-0">
                  <ul className="divide-y divide-line/60 text-sm">
                    {[...graph.nodes]
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((n) => {
                        const links = graph.edges.filter((e) => e.from === n.id || e.to === n.id).length;
                        return (
                          <li key={n.id}>
                            <button
                              className={`flex w-full items-center gap-2 px-4 py-1.5 text-left hover:bg-ink-800/60 ${selNode?.id === n.id ? 'bg-ink-800/60' : ''}`}
                              aria-label={`${n.label}, ${NODE_KINDS[n.kind].label}, ${plural(links, 'connection')}`}
                              onClick={() => focusNode(n)}
                            >
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NODE_KINDS[n.kind].color }} />
                              <span className="truncate text-platinum">{n.label}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-slate-dim">{links}</span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </Panel>
              </div>
            </div>
          )}
        </>
      )}
      {load.status === 'loading' && <p className="text-sm text-slate-dim">Opening local storage…</p>}
    </div>
  );
}

function EntityAdd({ onPick }: { onPick: (e: ReturnType<typeof searchEntities>[number]) => void }) {
  const [q, setQ] = useState('');
  const results = searchEntities(q, 8);
  return (
    <div className="relative">
      <input className="input h-9 w-56" placeholder="Add Aurora entity (country, series…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Aurora entities to add" />
      {results.length > 0 && (
        <ul className="absolute left-0 top-full z-20 mt-1 w-80 rounded-md border border-line bg-ink-900 py-1 shadow-xl">
          {results.map((r) => (
            <li key={JSON.stringify(r.ref)}>
              <button
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-ink-800"
                onClick={() => {
                  onPick(r);
                  setQ('');
                }}
              >
                <span className="text-platinum">{r.label}</span> <span className="text-xs text-slate-dim">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RefLink({ refValue }: { refValue: BrainRef }) {
  const h = refHref(refValue);
  return h.external ? (
    <a className="btn-ghost w-full justify-center text-xs" href={h.href} target="_blank" rel="noreferrer">
      {h.label} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  ) : (
    <Link className="btn-ghost w-full justify-center text-xs" to={h.href}>
      {h.label}
    </Link>
  );
}

function SourcesEditor({ sources, onChange }: { sources: BrainSource[]; onChange: (s: BrainSource[]) => void }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [date, setDate] = useState('');
  const urlOk = !url || /^https?:\/\/\S+$/i.test(url);
  return (
    <div>
      <span className="label">Sources</span>
      {sources.length === 0 && <p className="text-xs text-slate-dim">No sources yet.</p>}
      <ul className="space-y-1 text-xs">
        {sources.map((s, i) => (
          <li key={i} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              {s.url ? (
                <a className="text-gold hover:underline" href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                <span className="text-platinum">{s.title}</span>
              )}
              {s.date && <span className="text-slate-dim"> · {s.date}</span>}
            </span>
            <button className="text-slate-dim hover:text-down" aria-label={`Remove source ${s.title}`} onClick={() => onChange(sources.filter((_, j) => j !== i))}>
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 grid grid-cols-[1fr_auto] gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !urlOk || sources.length >= 20) return;
          onChange([...sources, { title: title.trim().slice(0, 120), ...(url ? { url } : {}), ...(date ? { date } : {}) }]);
          setTitle('');
          setUrl('');
          setDate('');
        }}
      >
        <input className="input h-8 col-span-2" placeholder="Source title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Source title" />
        <input className={`input h-8 ${urlOk ? '' : 'border-down'}`} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Source URL" aria-invalid={!urlOk} />
        <input className="input h-8 w-36" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Source date" />
        <button className="btn-ghost col-span-2 h-8 text-xs" type="submit" disabled={!title.trim() || !urlOk}>
          Add source
        </button>
      </form>
    </div>
  );
}

function NodeEditor({
  node,
  graph,
  groups,
  onChange,
  onConnect,
  onSelectEdge,
  onDelete,
}: {
  node: BrainNode;
  graph: BrainGraph;
  groups: string[];
  onChange: (patch: Partial<BrainNode>) => void;
  onConnect: (to: string, type: EdgeType) => void;
  onSelectEdge: (id: string) => void;
  onDelete: () => void;
}) {
  const [target, setTarget] = useState('');
  const [type, setType] = useState<EdgeType>('related');
  const [linkQ, setLinkQ] = useState('');
  const others = graph.nodes.filter((n) => n.id !== node.id).sort((a, b) => a.label.localeCompare(b.label));
  const rels = graph.edges.filter((e) => e.from === node.id || e.to === node.id);
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? '?';
  return (
    <Panel
      title="Node"
      eyebrow={NODE_KINDS[node.kind].label}
      actions={
        <button className="btn-ghost text-xs text-down" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="label">Label</span>
          <input className="input" value={node.label} maxLength={120} onChange={(e) => onChange({ label: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Type</span>
            <select className="input" value={node.kind} onChange={(e) => onChange({ kind: e.target.value as NodeKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {NODE_KINDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Date</span>
            <input className="input" type="date" value={node.date ?? ''} onChange={(e) => onChange({ date: e.target.value || undefined })} />
          </label>
        </div>
        <label className="block">
          <span className="label">Group</span>
          <input className="input" list="brain-groups" value={node.group ?? ''} maxLength={60} placeholder="Optional, e.g. Energy" onChange={(e) => onChange({ group: e.target.value.trim() ? e.target.value : undefined })} />
          <datalist id="brain-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input min-h-24" maxLength={5000} value={node.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} />
        </label>
        <div>
          <span className="label">Linked Aurora data</span>
          {node.ref ? (
            <div className="space-y-1.5">
              <RefLink refValue={node.ref} />
              <button className="text-xs text-slate-dim hover:text-down" onClick={() => onChange({ ref: undefined })}>
                Remove link
              </button>
            </div>
          ) : (
            <div className="relative">
              <input className="input h-8" placeholder="Search countries, ECB series, CFTC markets…" value={linkQ} onChange={(e) => setLinkQ(e.target.value)} aria-label="Link to Aurora data" />
              {searchEntities(linkQ, 6).length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-line bg-ink-900 py-1 shadow-xl">
                  {searchEntities(linkQ, 6).map((r) => (
                    <li key={JSON.stringify(r.ref)}>
                      <button
                        className="block w-full px-3 py-1.5 text-left text-xs hover:bg-ink-800"
                        onClick={() => {
                          onChange({ ref: r.ref });
                          setLinkQ('');
                        }}
                      >
                        {r.label} <span className="text-slate-dim">{r.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <SourcesEditor sources={node.sources} onChange={(s) => onChange({ sources: s })} />
        <div className="border-t border-line pt-3">
          <span className="label">Connections ({rels.length})</span>
          <ul className="space-y-1 text-xs">
            {rels.map((e) => (
              <li key={e.id}>
                <button className="text-left text-mist hover:text-platinum" onClick={() => onSelectEdge(e.id)}>
                  {e.from === node.id ? `→ ${edgeLabel(e)} → ${name(e.to)}` : `← ${name(e.from)} ${edgeLabel(e)}`}
                  <span className="text-slate-dim"> · {CERTAINTY[e.certainty]}</span>
                </button>
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <form
              className="mt-2 grid grid-cols-2 gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (target) onConnect(target, type);
              }}
            >
              <select className="input h-8 text-xs" value={type} onChange={(e) => setType(e.target.value as EdgeType)} aria-label="Relationship type">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EDGE_TYPES[t].label}
                  </option>
                ))}
              </select>
              <select className="input h-8 text-xs" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Connect to node">
                <option value="">Connect to…</option>
                {others.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <button className="btn-ghost col-span-2 h-8 text-xs" type="submit" disabled={!target}>
                Add connection
              </button>
            </form>
          )}
        </div>
      </div>
    </Panel>
  );
}

function EdgeEditor({
  edge,
  graph,
  onChange,
  onReverse,
  onSelectNode,
  onDelete,
}: {
  edge: BrainEdge;
  graph: BrainGraph;
  onChange: (patch: Partial<BrainEdge>) => void;
  onReverse: () => void;
  onSelectNode: (id: string) => void;
  onDelete: () => void;
}) {
  const from = graph.nodes.find((n) => n.id === edge.from);
  const to = graph.nodes.find((n) => n.id === edge.to);
  return (
    <Panel
      title="Connection"
      eyebrow="Your assessment. Not verified by Aurora."
      actions={
        <button className="btn-ghost text-xs text-down" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs">
          <button className="text-platinum hover:text-gold-soft" onClick={() => from && onSelectNode(from.id)}>
            {from?.label}
          </button>{' '}
          <span className="text-gold">{edge.directed ? '→' : '—'}</span>{' '}
          <button className="text-platinum hover:text-gold-soft" onClick={() => to && onSelectNode(to.id)}>
            {to?.label}
          </button>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Relationship</span>
            <select className="input" value={edge.type} onChange={(e) => onChange({ type: e.target.value as EdgeType, directed: EDGE_TYPES[e.target.value as EdgeType].directed })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {EDGE_TYPES[t].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Certainty</span>
            <select className="input" value={edge.certainty} onChange={(e) => onChange({ certainty: e.target.value as Certainty })}>
              {CERTAINTIES.map((c) => (
                <option key={c} value={c}>
                  {CERTAINTY[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {edge.type === 'custom' && (
          <label className="block">
            <span className="label">Custom label</span>
            <input className="input" maxLength={120} value={edge.customLabel ?? ''} onChange={(e) => onChange({ customLabel: e.target.value })} />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[#c9a35a]" checked={edge.directed} onChange={(e) => onChange({ directed: e.target.checked })} /> Directed
          </label>
          <button className="btn-ghost h-8 text-xs" onClick={onReverse} disabled={!edge.directed}>
            Reverse direction
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">From date</span>
            <input className="input" type="date" value={edge.dateFrom ?? ''} onChange={(e) => onChange({ dateFrom: e.target.value || undefined })} />
          </label>
          <label className="block">
            <span className="label">To date</span>
            <input className="input" type="date" value={edge.dateTo ?? ''} onChange={(e) => onChange({ dateTo: e.target.value || undefined })} />
          </label>
        </div>
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input min-h-20" maxLength={5000} value={edge.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} />
        </label>
        <SourcesEditor sources={edge.sources} onChange={(s) => onChange({ sources: s })} />
      </div>
    </Panel>
  );
}
