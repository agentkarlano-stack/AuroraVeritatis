import { useEffect, useMemo, useRef } from 'react';
import { diffSaved, mergeSaved, missingTable, supabaseSavedBackend } from '../lib/saved';
import { useSaved } from '../store/saved';
import { useAuth } from './AuthProvider';
import { readOwner } from './localAccount';

/**
 * Keeps saved intelligence in the signed-in user's `saved_items` rows (RLS: own rows only). Renders nothing.
 * Before the migration is applied the table is missing: items stay in this browser and HQ says so.
 */
export function SavedSync() {
  const { client, session } = useAuth();
  const userId = session?.user.id ?? null;
  const backend = useMemo(() => (client ? supabaseSavedBackend(client) : null), [client]);
  const ready = useRef(false);
  const applying = useRef(false);

  useEffect(() => {
    return useSaved.subscribe((state, prev) => {
      if (applying.current || !ready.current || !backend || !userId || state.items === prev.items) return;
      const { upsert, removed } = diffSaved(prev.items, state.items);
      Promise.all([backend.upsert(userId, upsert), backend.remove(userId, removed)]).catch((e: unknown) =>
        useSaved.setState({ sync: 'error', syncMessage: e instanceof Error ? e.message : 'Upload failed' }),
      );
    });
  }, [backend, userId]);

  useEffect(() => {
    ready.current = false;
    if (!backend || !userId) {
      useSaved.setState({ sync: 'local', syncMessage: undefined });
      return;
    }
    let cancelled = false;
    // Items left in this browser by a different account are never merged into this one.
    const owner = readOwner();
    if (owner && owner !== userId) {
      applying.current = true;
      useSaved.getState().reset();
      applying.current = false;
    }
    useSaved.setState({ sync: 'syncing' });
    backend
      .list(userId)
      .then(async (remote) => {
        if (cancelled) return;
        const { merged, toUpload } = mergeSaved(useSaved.getState().items, remote);
        applying.current = true;
        useSaved.setState({ items: merged });
        applying.current = false;
        await backend.upsert(userId, toUpload);
        if (cancelled) return;
        ready.current = true;
        useSaved.setState({ sync: 'synced', syncMessage: undefined });
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Sync failed';
        useSaved.setState(missingTable(msg) ? { sync: 'unavailable', syncMessage: 'Account sync for saved items is not enabled yet; they are kept in this browser.' } : { sync: 'error', syncMessage: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [backend, userId]);

  return null;
}
