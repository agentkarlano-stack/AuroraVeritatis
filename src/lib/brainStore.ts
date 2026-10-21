import type { BrainGraph } from './brain';

/**
 * Local-first persistence for Brain graphs in IndexedDB. Data never leaves the browser; it is lost if the user clears
 * site data, so the UI keeps export one click away and asks the browser for persistent storage.
 */
const DB = 'aurora-brain';
const VERSION = 1;
const GRAPHS = 'graphs';
const META = 'meta';

export interface GraphSummary {
  id: string;
  name: string;
  updatedAt: string;
  nodes: number;
  edges: number;
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not provide IndexedDB storage.'));
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GRAPHS)) db.createObjectStore(GRAPHS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Could not open browser storage.'));
    };
    req.onblocked = () => reject(new Error('Browser storage is blocked by another open tab.'));
  });
  return opening;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error('Browser storage error.'));
        tx.onabort = () => reject(tx.error ?? new Error('Browser storage transaction aborted (storage may be full).'));
      }),
  );
}

export async function listGraphs(): Promise<GraphSummary[]> {
  const all = await run<BrainGraph[]>(GRAPHS, 'readonly', (s) => s.getAll() as IDBRequest<BrainGraph[]>);
  return all.map((g) => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, nodes: g.nodes.length, edges: g.edges.length })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getGraph(id: string): Promise<BrainGraph | undefined> {
  return run<BrainGraph | undefined>(GRAPHS, 'readonly', (s) => s.get(id) as IDBRequest<BrainGraph | undefined>);
}

export async function saveGraph(g: BrainGraph): Promise<void> {
  await run(GRAPHS, 'readwrite', (s) => s.put(g));
}

export async function deleteGraph(id: string): Promise<void> {
  await run(GRAPHS, 'readwrite', (s) => s.delete(id));
}

export async function getActiveGraphId(): Promise<string | undefined> {
  return run<string | undefined>(META, 'readonly', (s) => s.get('active') as IDBRequest<string | undefined>);
}

export async function setActiveGraphId(id: string): Promise<void> {
  await run(META, 'readwrite', (s) => s.put(id, 'active'));
}

/** Asks the browser not to evict this origin's storage under pressure. Returns whether storage is persistent. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

/** Test hook: forget the cached connection (e.g. after the fake database is reset). */
export function resetConnectionForTests(): void {
  opening = null;
}
