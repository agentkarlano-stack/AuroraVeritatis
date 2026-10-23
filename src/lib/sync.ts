import type { SupabaseClient } from '@supabase/supabase-js';

/** Preference keys synced in the `user_preferences` row. Notes sync separately via `research_notes` (size limit). */
export const SYNCED_KEYS = ['layout', 'hidden', 'watchlist', 'favorites', 'alerts', 'chart', 'drawings', 'introMode', 'introChoice', 'briefing'] as const;
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

export interface SyncNote {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

/** Notes live in their own RLS-protected table (`research_notes`), one row per note. */
export interface NotesBackend {
  list(userId: string): Promise<SyncNote[]>;
  upsert(userId: string, notes: SyncNote[]): Promise<void>;
  remove(userId: string, ids: string[]): Promise<void>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Union of local and remote notes by id (newest first) plus the local notes the server does not have yet.
 * Notes with non-UUID ids (created without crypto.randomUUID) stay local-only, since the table's key is a uuid.
 */
export function mergeNotes(local: SyncNote[], remote: SyncNote[]): { merged: SyncNote[]; toUpload: SyncNote[] } {
  const byId = new Map(remote.map((n) => [n.id, n]));
  const toUpload = local.filter((n) => !byId.has(n.id) && UUID_RE.test(n.id));
  for (const n of local) if (!byId.has(n.id)) byId.set(n.id, n);
  const merged = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 1000);
  return { merged, toUpload };
}

/** Notes added, edited and removed between two note lists (for incremental uploads). */
export function diffNotes(prev: SyncNote[], next: SyncNote[]): { added: SyncNote[]; changed: SyncNote[]; removed: string[] } {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  const nextIds = new Set(next.map((n) => n.id));
  const synced = next.filter((n) => UUID_RE.test(n.id));
  return {
    added: synced.filter((n) => !prevById.has(n.id)),
    changed: synced.filter((n) => {
      const p = prevById.get(n.id);
      return p !== undefined && (p.title !== n.title || p.body !== n.body);
    }),
    removed: prev.filter((n) => !nextIds.has(n.id) && UUID_RE.test(n.id)).map((n) => n.id),
  };
}

export function supabaseNotesBackend(client: SupabaseClient): NotesBackend {
  return {
    async list(userId) {
      const { data, error } = await client.from('research_notes').select('id, title, body, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: { id: string; title: string; body: string; created_at: string }) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at }));
    },
    async upsert(userId, notes) {
      if (!notes.length) return;
      const { error } = await client
        .from('research_notes')
        .upsert(notes.map((n) => ({ id: n.id, user_id: userId, title: n.title, body: n.body, created_at: n.createdAt })), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    },
    async remove(userId, ids) {
      if (!ids.length) return;
      const { error } = await client.from('research_notes').delete().eq('user_id', userId).in('id', ids);
      if (error) throw new Error(error.message);
    },
  };
}
