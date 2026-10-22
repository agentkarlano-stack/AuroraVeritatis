import { useEffect, useMemo, useRef } from 'react';
import { diffNotes, initialSync, mergeNotes, pickSynced, push, supabaseBackend, supabaseNotesBackend, type SyncNote } from '../lib/sync';
import { usePrefs } from '../store/prefs';
import { useSyncStatus } from '../store/syncStatus';
import { useAuth } from './AuthProvider';
import { clearLocalAccountData, LOCAL_OWNER_KEY, LOCAL_UPDATED_KEY, readOwner } from './localAccount';

const PUSH_DELAY_MS = 1500;

function readLocalUpdatedAt(): string | null {
  try {
    return localStorage.getItem(LOCAL_UPDATED_KEY);
  } catch {
    return null;
  }
}

function writeLocalUpdatedAt(v: string) {
  try {
    localStorage.setItem(LOCAL_UPDATED_KEY, v);
  } catch {
    /* storage unavailable: sync still works, conflict resolution just favours the cloud copy */
  }
}

/**
 * Keeps synced preferences (layout, watchlist, alerts, favourites, chart settings, drawings) in the signed-in user's
 * Supabase `user_preferences` row. Renders nothing. Inactive for guests or when accounts are not configured.
 */
export function PrefsSync() {
  const { client, session, status } = useAuth();
  const userId = session?.user.id ?? null;
  const backend = useMemo(() => (client ? supabaseBackend(client) : null), [client]);
  const notesBackend = useMemo(() => (client ? supabaseNotesBackend(client) : null), [client]);
  const ready = useRef(false);
  const applyingRemote = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Record when synced preferences last changed locally, and upload changes (debounced) once the initial sync is done.
  useEffect(() => {
    return usePrefs.subscribe((state, prev) => {
      if (applyingRemote.current) return;
      // Notes: upload additions and deletions individually once the initial merge has run.
      if (state.notes !== prev.notes && notesBackend && userId && ready.current) {
        const { added, changed, removed } = diffNotes(prev.notes as SyncNote[], state.notes as SyncNote[]);
        Promise.all([notesBackend.upsert(userId, [...added, ...changed]), notesBackend.remove(userId, removed)])
          .then(() => useSyncStatus.setState({ state: 'synced', at: new Date().toISOString() }))
          .catch((e: Error) => useSyncStatus.setState({ state: 'error', message: e.message }));
      }
      if (JSON.stringify(pickSynced(state as unknown as Record<string, unknown>)) === JSON.stringify(pickSynced(prev as unknown as Record<string, unknown>))) return;
      const at = new Date().toISOString();
      writeLocalUpdatedAt(at);
      if (!backend || !userId || !ready.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        useSyncStatus.setState({ state: 'syncing' });
        push(backend, userId, pickSynced(usePrefs.getState() as unknown as Record<string, unknown>), readLocalUpdatedAt() ?? at)
          .then((r) => useSyncStatus.setState(r.action === 'skipped' ? { state: 'skipped', message: r.reason } : { state: 'synced', at: r.updatedAt }))
          .catch((e: Error) => useSyncStatus.setState({ state: 'error', message: e.message }));
      }, PUSH_DELAY_MS);
    });
  }, [backend, notesBackend, userId]);

  // Initial reconciliation whenever a user signs in.
  useEffect(() => {
    ready.current = false;
    if (!backend || !userId) {
      useSyncStatus.setState({ state: 'off', at: undefined, message: undefined });
      // After sign-out (or an expired session) the account's copy leaves this browser; it stays in the cloud.
      if (status === 'signed-out' && readOwner()) {
        applyingRemote.current = true;
        clearLocalAccountData();
        applyingRemote.current = false;
      }
      return;
    }
    let cancelled = false;
    useSyncStatus.setState({ state: 'syncing' });
    // Data left in this browser by a different account must never be merged into this one.
    const owner = readOwner();
    if (owner && owner !== userId) {
      applyingRemote.current = true;
      clearLocalAccountData();
      applyingRemote.current = false;
    }
    initialSync(backend, userId, pickSynced(usePrefs.getState() as unknown as Record<string, unknown>), readLocalUpdatedAt())
      .then(async (r) => {
        if (cancelled) return;
        if (r.action === 'pulled') {
          applyingRemote.current = true;
          usePrefs.setState(r.data as Partial<ReturnType<typeof usePrefs.getState>>);
          applyingRemote.current = false;
          writeLocalUpdatedAt(r.updatedAt);
        }
        if (notesBackend) {
          const { merged, toUpload } = mergeNotes(usePrefs.getState().notes, await notesBackend.list(userId));
          if (cancelled) return;
          applyingRemote.current = true;
          usePrefs.setState({ notes: merged });
          applyingRemote.current = false;
          await notesBackend.upsert(userId, toUpload);
        }
        if (cancelled) return;
        try {
          localStorage.setItem(LOCAL_OWNER_KEY, userId);
        } catch {
          /* storage unavailable */
        }
        ready.current = true;
        useSyncStatus.setState(r.action === 'skipped' ? { state: 'skipped', message: r.reason } : { state: 'synced', at: r.updatedAt });
      })
      .catch((e: Error) => !cancelled && useSyncStatus.setState({ state: 'error', message: e.message }));
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [backend, notesBackend, userId, status]);

  return null;
}
