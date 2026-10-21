import { COT_MARKETS } from '../../shared/cot';
import { MACRO_SERIES } from '../../shared/macro';
import { INSTRUMENTS } from '../data/instruments';
import { addNode, emptyGraph, type BrainGraph, type BrainLimits, type BrainNode, type BrainRef, type NodeKind } from './brain';
import { getActiveGraphId, getGraph, listGraphs, saveGraph, setActiveGraphId } from './brainStore';
import { COUNTRIES } from './countries';

/** An Aurora entity a Brain node can link to. */
export interface BrainEntity {
  ref: BrainRef;
  label: string;
  kind: NodeKind;
  hint: string;
}

let cache: BrainEntity[] | null = null;

export function brainEntities(): BrainEntity[] {
  cache ??= [
    ...COUNTRIES.map((c): BrainEntity => ({ ref: { type: 'country', iso3: c.iso3 }, label: c.name, kind: 'country', hint: `Country dossier · ${c.iso3}` })),
    ...MACRO_SERIES.map((s): BrainEntity => ({ ref: { type: 'macro', id: s.id }, label: s.group === 'fx' ? `${s.id.slice(3)} per EUR (${s.label})` : s.label, kind: s.group === 'fx' ? 'instrument' : 'indicator', hint: 'ECB statistics' })),
    ...COT_MARKETS.map((m): BrainEntity => ({ ref: { type: 'cot', code: m.code }, label: `${m.name} futures positioning`, kind: m.group === 'Currencies' || m.group === 'Rates' || m.group === 'Equity indices' || m.group === 'Crypto' ? 'instrument' : 'commodity', hint: `CFTC · ${m.exchange}` })),
    ...INSTRUMENTS.map((i): BrainEntity => ({ ref: { type: 'instrument', symbol: i.symbol }, label: `${i.name} (${i.symbol})`, kind: 'instrument', hint: 'Market Terminal · simulated prices' })),
  ];
  return cache;
}

export function searchEntities(q: string, limit = 8): BrainEntity[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const scored: [number, BrainEntity][] = [];
  for (const e of brainEntities()) {
    const l = e.label.toLowerCase();
    const score = l === s ? 0 : l.startsWith(s) ? 1 : l.includes(s) ? 2 : e.hint.toLowerCase().includes(s) ? 3 : -1;
    if (score >= 0) scored.push([score, e]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].label.length - b[1].label.length).slice(0, limit).map(([, e]) => e);
}

export function sameRef(a: BrainRef | undefined, b: BrainRef | undefined): boolean {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

/** In-app route (or external URL) for a node's linked entity. */
export function refHref(ref: BrainRef): { href: string; external: boolean; label: string } {
  switch (ref.type) {
    case 'country':
      return { href: `/countries/${ref.iso3}`, external: false, label: 'Open country dossier' };
    case 'instrument':
      return { href: `/markets?symbol=${encodeURIComponent(ref.symbol)}`, external: false, label: 'Open chart (simulated prices)' };
    case 'cot':
      return { href: `/positioning?m=${ref.code}`, external: false, label: 'Open futures positioning' };
    case 'macro':
      return { href: `/macro?s=${ref.id}`, external: false, label: 'Open ECB series' };
    case 'event':
      return { href: '/radar', external: false, label: 'Open Global Radar' };
    case 'url':
      return { href: ref.url, external: true, label: 'Open link' };
  }
}

export type AddResult = { status: 'added' | 'exists'; graphName: string; graphId: string } | { status: 'limit'; message: string };

/**
 * Adds an entity to the user's active Brain graph (creating "My research" if there is none), skipping entities that are
 * already linked. Places new nodes in a loose spiral so repeated additions don't overlap.
 */
export async function addToActiveGraph(entity: Omit<BrainNode, 'id' | 'x' | 'y' | 'sources'> & { sources?: BrainNode['sources'] }, limits: BrainLimits): Promise<AddResult> {
  let g: BrainGraph | undefined;
  const activeId = await getActiveGraphId();
  if (activeId) g = await getGraph(activeId);
  if (!g) {
    const existing = await listGraphs();
    if (existing[0]) g = await getGraph(existing[0].id);
    else if (limits.graphs < 1) return { status: 'limit', message: 'Your plan does not include Brain graphs.' };
    else g = emptyGraph('My research');
  }
  if (!g) return { status: 'limit', message: 'Could not open your Brain graph.' };
  if (entity.ref && g.nodes.some((n) => sameRef(n.ref, entity.ref))) return { status: 'exists', graphName: g.name, graphId: g.id };
  if (g.nodes.length >= limits.nodesPerGraph) return { status: 'limit', message: `"${g.name}" has reached its limit of ${limits.nodesPerGraph} nodes.` };
  const k = g.nodes.length;
  const angle = k * 2.399963; // golden angle
  const r = 70 * Math.sqrt(k);
  const { graph } = addNode(g, { ...entity, x: Math.round(r * Math.cos(angle)), y: Math.round(r * Math.sin(angle)) }, limits);
  await saveGraph(graph);
  await setActiveGraphId(graph.id);
  return { status: 'added', graphName: graph.name, graphId: graph.id };
}
