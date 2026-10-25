/**
 * Saved intelligence (HQ): bookmarks of events, stories, briefings, countries, sources, charts and map views, grouped
 * into the user's collections with a personal note. Stored in this browser and, for signed-in users, in the
 * RLS-protected `saved_items` table (migration 20261025000200), one row per item. Pure logic + Supabase backend.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type SavedKind = 'event' | 'story' | 'briefing' | 'country' | 'source' | 'chart' | 'map';
export const SAVED_KINDS: Record<SavedKind, string> = {
  event: 'Events',
  story: 'News',
  briefing: 'Briefings',
  country: 'Countries',
  source: 'Sources',
  chart: 'Charts',
  map: 'Map views',
};

export interface SavedItem {
  id: string;
  kind: SavedKind;
  title: string;
  /** In-app link that reopens it (with its settings), or '' for external-only items. */
  href: string;
  /** External source link, or ''. */
  url: string;
  collection: string;
  note: string;
  /** Small facts kept with the bookmark (e.g. a briefing's story titles), never fetched content. */
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const LIMITS = { title: 200, href: 600, url: 600, collection: 60, note: 2000, items: 500 } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same thing saved twice is one bookmark: identity by kind and link. */
export const savedKey = (i: Pick<SavedItem, 'kind' | 'href' | 'url'>) => `${i.kind}|${i.href || i.url}`;

export function clean(i: SavedItem): SavedItem {
  const meta = i.meta && typeof i.meta === 'object' && JSON.stringify(i.meta).length <= 3500 ? i.meta : {};
  return {
    ...i,
    title: i.title.slice(0, LIMITS.title) || 'Untitled',
    href: i.href.startsWith('/') ? i.href.slice(0, LIMITS.href) : '',
    url: /^https?:\/\//.test(i.url) ? i.url.slice(0, LIMITS.url) : '',
    collection: i.collection.trim().slice(0, LIMITS.collection),
    note: i.note.slice(0, LIMITS.note),
    meta,
  };
}

/** Collections in use, alphabetical, with item counts ('' = unsorted). */
export function collections(items: SavedItem[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.collection, (m.get(i.collection) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name === '' ? 1 : b.name === '' ? -1 : a.name.localeCompare(b.name)));
}

/** Union by id; the more recently updated copy wins. Local items the server lacks are returned for upload. */
export function mergeSaved(local: SavedItem[], remote: SavedItem[]): { merged: SavedItem[]; toUpload: SavedItem[] } {
  const byId = new Map(remote.map((i) => [i.id, i]));
  const toUpload: SavedItem[] = [];
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r || l.updatedAt > r.updatedAt) {
      byId.set(l.id, l);
      if (UUID_RE.test(l.id)) toUpload.push(l);
    }
  }
  return { merged: [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, LIMITS.items), toUpload };
}

export function diffSaved(prev: SavedItem[], next: SavedItem[]): { upsert: SavedItem[]; removed: string[] } {
  const p = new Map(prev.map((i) => [i.id, i]));
  const ids = new Set(next.map((i) => i.id));
  return {
    upsert: next.filter((i) => UUID_RE.test(i.id) && p.get(i.id) !== i),
    removed: prev.filter((i) => !ids.has(i.id) && UUID_RE.test(i.id)).map((i) => i.id),
  };
}

export interface SavedBackend {
  list(userId: string): Promise<SavedItem[]>;
  upsert(userId: string, items: SavedItem[]): Promise<void>;
  remove(userId: string, ids: string[]): Promise<void>;
}

/** True when the error means the table does not exist yet (migration not applied). */
export const missingTable = (msg: string) => /saved_items|does not exist|schema cache|42P01|PGRST20[05]/i.test(msg);

interface Row {
  id: string;
  kind: SavedKind;
  title: string;
  href: string;
  url: string;
  collection: string;
  note: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
export function supabaseSavedBackend(client: SupabaseClient): SavedBackend {
  return {
    async list(userId) {
      const { data, error } = await client
        .from('saved_items')
        .select('id, kind, title, href, url, collection, note, meta, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(LIMITS.items);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        href: r.href,
        url: r.url,
        collection: r.collection,
        note: r.note,
        meta: r.meta ?? {},
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },
    async upsert(userId, items) {
      if (!items.length) return;
      const { error } = await client.from('saved_items').upsert(
        items.map((i) => ({
          id: i.id,
          user_id: userId,
          kind: i.kind,
          title: i.title,
          href: i.href,
          url: i.url,
          collection: i.collection,
          note: i.note,
          meta: i.meta,
          created_at: i.createdAt,
          updated_at: i.updatedAt,
        })),
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    },
    async remove(userId, ids) {
      if (!ids.length) return;
      const { error } = await client.from('saved_items').delete().eq('user_id', userId).in('id', ids);
      if (error) throw new Error(error.message);
    },
  };
}
