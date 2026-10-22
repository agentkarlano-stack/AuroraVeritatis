/**
 * Undo/redo history of immutable snapshots. Bursts of edits that share a key (typing into one field, one drag) within
 * `COALESCE_MS` become a single undo step. Snapshots share structure, so a deep history stays cheap.
 */
export interface History<T> {
  past: T[];
  future: T[];
  lastKey: string | null;
  lastAt: number;
}

export const COALESCE_MS = 1000;
export const HISTORY_LIMIT = 100;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], lastKey: null, lastAt: 0 });

/** Call before applying an edit, with the state as it was before the edit. */
export function record<T>(h: History<T>, before: T, key: string | null, now: number, limit = HISTORY_LIMIT): History<T> {
  if (key !== null && key === h.lastKey && now - h.lastAt < COALESCE_MS) return { ...h, future: [], lastAt: now };
  return { past: [...h.past, before].slice(-limit), future: [], lastKey: key, lastAt: now };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = h.past.at(-1);
  if (value === undefined) return null;
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future], lastKey: null, lastAt: 0 }, value };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = h.future[0];
  if (value === undefined) return null;
  return { history: { past: [...h.past, current], future: h.future.slice(1), lastKey: null, lastAt: 0 }, value };
}
