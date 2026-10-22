import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addNode, emptyGraph } from './brain';
import { deleteGraph, getActiveGraphId, getGraph, listGraphs, saveGraph, setActiveGraphId } from './brainStore';

describe('Brain IndexedDB store', () => {
  it('saves, lists (newest first), loads and deletes graphs and remembers the active one', async () => {
    const a = { ...emptyGraph('A', '2026-10-20T10:00:00.000Z') };
    const b = addNode({ ...emptyGraph('B', '2026-10-21T10:00:00.000Z') }, { kind: 'note', label: 'n', x: 0, y: 0 }).graph;
    await saveGraph(a);
    await saveGraph({ ...b, updatedAt: '2026-10-21T10:00:00.000Z' });
    expect((await listGraphs()).map((s) => [s.name, s.nodes])).toEqual([
      ['B', 1],
      ['A', 0],
    ]);
    expect((await getGraph(b.id))?.nodes[0]?.label).toBe('n');
    await setActiveGraphId(b.id);
    expect(await getActiveGraphId()).toBe(b.id);
    await deleteGraph(a.id);
    expect((await listGraphs()).map((s) => s.name)).toEqual(['B']);
    expect(await getGraph(a.id)).toBeUndefined();
  });
});

describe('Add to Brain', () => {
  it('adds linked entities to the active graph once, creating a graph when needed, and respects limits', async () => {
    const { addToActiveGraph } = await import('./brainEntities');
    const { listGraphs: list, deleteGraph: del } = await import('./brainStore');
    for (const s of await list()) await del(s.id);
    const limits = { graphs: 3, nodesPerGraph: 2, edgesPerGraph: 8 };
    const de = { kind: 'country' as const, label: 'Germany', ref: { type: 'country' as const, iso3: 'DEU' } };
    const first = await addToActiveGraph(de, limits);
    expect(first).toMatchObject({ status: 'added', graphName: 'My research' });
    expect(await addToActiveGraph(de, limits)).toMatchObject({ status: 'exists' });
    await addToActiveGraph({ kind: 'country', label: 'France', ref: { type: 'country', iso3: 'FRA' } }, limits);
    expect(await addToActiveGraph({ kind: 'country', label: 'Italy', ref: { type: 'country', iso3: 'ITA' } }, limits)).toMatchObject({ status: 'limit' });
    const [only] = await list();
    expect(only).toMatchObject({ name: 'My research', nodes: 2 });
  });
});

describe('Unload stash', () => {
  it('restores a stashed graph only when it is newer than the stored copy and the graph still exists', async () => {
    const store: Record<string, string> = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    };
    const { recoverPending, stashPending } = await import('./brainStore');
    const g = { ...emptyGraph('Stash', '2026-10-22T10:00:00.000Z') };
    await saveGraph(g);
    const edited = { ...addNode(g, { kind: 'note', label: 'late edit', x: 0, y: 0 }).graph, updatedAt: '2026-10-22T10:00:05.000Z' };
    stashPending(edited);
    expect(await recoverPending()).toBe(true);
    expect((await getGraph(g.id))?.nodes.map((n) => n.label)).toEqual(['late edit']);
    expect(store['av-brain-pending']).toBeUndefined();
    // An older stash never overwrites newer stored data.
    stashPending({ ...g, updatedAt: '2026-10-22T09:00:00.000Z' });
    expect(await recoverPending()).toBe(false);
    expect((await getGraph(g.id))?.nodes).toHaveLength(1);
    // A deleted graph is not resurrected; corrupt stashes are ignored.
    await deleteGraph(g.id);
    stashPending(edited);
    expect(await recoverPending()).toBe(false);
    expect(await getGraph(g.id)).toBeUndefined();
    store['av-brain-pending'] = '{not json';
    expect(await recoverPending()).toBe(false);
    expect(store['av-brain-pending']).toBeUndefined();
  });
});
