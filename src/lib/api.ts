import { useEffect, useState } from 'react';
import type { ApiError } from '../../shared/types';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T };

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || body === null) {
    const err = body as ApiError | null;
    throw new Error(err?.detail ? `${err.error}: ${err.detail}` : (err?.error ?? `Request failed (${res.status})`));
  }
  return body as T;
}

/**
 * Minimal data hook: fetches `path` (or nothing when null) and tracks loading/error state.
 * Results are keyed by request so a stale response is never shown for a new path.
 */
export function useApi<T>(path: string | null): Loadable<T> & { reload: () => void } {
  const [nonce, setNonce] = useState(0);
  const key = `${path}#${nonce}`;
  const [result, setResult] = useState<{ key: string; value: Loadable<T> } | null>(null);
  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    getJson<T>(path, ctrl.signal)
      .then((data) => setResult({ key, value: { status: 'ready', data } }))
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setResult({ key, value: { status: 'error', error: e.message } });
      });
    return () => ctrl.abort();
  }, [path, key]);
  const state: Loadable<T> = result?.key === key ? result.value : { status: 'loading' };
  return { ...state, reload: () => setNonce((n) => n + 1) };
}
