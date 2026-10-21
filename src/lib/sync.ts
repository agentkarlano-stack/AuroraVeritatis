import type { SupabaseClient } from '@supabase/supabase-js';

/** Preference keys synced to the cloud. Notes are excluded: they can exceed the row size limit (own table later). */
export const SYNCED_KEYS = ['layout', 'hidden', 'watchlist', 'favorites', 'alerts', 'chart', 'drawings'] as const;
export type SyncedKey = (typeof SYNCED_KEYS)[number];
export type SyncedPrefs = Partial<Record<SyncedKey, unknown>>;

/** Stay below the 64 KiB `user_preferences.data` check constraint, with headroom for JSONB overhead. */
export const MAX_SYNC_BYTES = 60_000;

export interface PrefsRow {
  data: SyncedPrefs;
  updated_at: string;
}

/** Storage backend for one user's preferences row (Supabase in production, a fake in tests). */
export interface PrefsBackend {
  load(userId: string): Promise<PrefsRow | null>;
  save(userId: string, data: SyncedPrefs, updatedAt: string): Promise<void>;
}

export function pickSynced(state: Record<string, unknown>): SyncedPrefs {
  const out: SyncedPrefs = {};
  for (const k of SYNCED_KEYS) if (k in state) out[k] = state[k];
  return out;
}

export function byteSize(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

export type InitialSyncResult =
  | { action: 'pulled'; data: SyncedPrefs; updatedAt: string }
  | { action: 'pushed'; updatedAt: string }
  | { action: 'skipped'; reason: string };

/**
 * First sync after sign-in. The newer side wins: remote replaces local when it was saved after the last local change
 * (or there is no local change on record); otherwise local is uploaded. Never uploads more than MAX_SYNC_BYTES.
 */
export async function initialSync(backend: PrefsBackend, userId: string, local: SyncedPrefs, localUpdatedAt: string | null, now = () => new Date().toISOString()): Promise<InitialSyncResult> {
  const remote = await backend.load(userId);
  if (remote && (!localUpdatedAt || Date.parse(remote.updated_at) >= Date.parse(localUpdatedAt))) {
    return { action: 'pulled', data: pickSynced(remote.data as Record<string, unknown>), updatedAt: remote.updated_at };
  }
  return push(backend, userId, local, now());
}

/** Upload local preferences unless they exceed the size limit. */
export async function push(backend: PrefsBackend, userId: string, local: SyncedPrefs, updatedAt: string): Promise<InitialSyncResult> {
  if (byteSize(local) > MAX_SYNC_BYTES) return { action: 'skipped', reason: 'Preferences exceed the sync size limit; remove some chart drawings.' };
  await backend.save(userId, local, updatedAt);
  return { action: 'pushed', updatedAt };
}

/** Supabase implementation; row access is restricted to the signed-in user by RLS ("prefs: own all"). */
export function supabaseBackend(client: SupabaseClient): PrefsBackend {
  return {
    async load(userId) {
      const { data, error } = await client.from('user_preferences').select('data, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PrefsRow | null) ?? null;
    },
    async save(userId, data, updatedAt) {
      const { error } = await client.from('user_preferences').upsert({ user_id: userId, data, updated_at: updatedAt }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    },
  };
}
