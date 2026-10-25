import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { clean, savedKey, LIMITS, type SavedItem } from '../lib/saved';
import { uid } from './prefs';

export type SavedSyncState = 'local' | 'syncing' | 'synced' | 'unavailable' | 'error';

interface SavedState {
  items: SavedItem[];
  /** Account copy status (shown in HQ): `unavailable` until the saved_items migration is applied. */
  sync: SavedSyncState;
  syncMessage?: string;
  /** Saves the item, or removes it when the same thing is already saved. Returns true when it is now saved. */
  toggle: (item: Pick<SavedItem, 'kind' | 'title'> & Partial<Pick<SavedItem, 'href' | 'url' | 'meta' | 'collection' | 'note'>>) => boolean;
  update: (id: string, patch: Partial<Pick<SavedItem, 'title' | 'collection' | 'note'>>) => void;
  remove: (id: string) => void;
  /** Renames a collection on all its items ('' moves them to Unsorted). */
  renameCollection: (from: string, to: string) => void;
  reset: () => void;
}

/** Saved intelligence (HQ). This browser; uploaded per row for signed-in users by `auth/SavedSync.tsx`. */
export const useSaved = create<SavedState>()(
  persist(
    (set, get) => ({
      items: [],
      sync: 'local',
      toggle: (input) => {
        const draft = { kind: input.kind, href: input.href ?? '', url: input.url ?? '' };
        const existing = get().items.find((i) => savedKey(i) === savedKey(draft));
        if (existing) {
          set((s) => ({ items: s.items.filter((i) => i.id !== existing.id) }));
          return false;
        }
        if (get().items.length >= LIMITS.items) return false;
        const now = new Date().toISOString();
        const item = clean({ id: uid(), title: input.title, collection: input.collection ?? '', note: input.note ?? '', meta: input.meta ?? {}, createdAt: now, updatedAt: now, ...draft });
        set((s) => ({ items: [item, ...s.items] }));
        return true;
      },
      update: (id, patch) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? clean({ ...i, ...patch, updatedAt: new Date().toISOString() }) : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      renameCollection: (from, to) => {
        const now = new Date().toISOString();
        set((s) => ({ items: s.items.map((i) => (i.collection === from ? clean({ ...i, collection: to, updatedAt: now }) : i)) }));
      },
      reset: () => set({ items: [], sync: 'local', syncMessage: undefined }),
    }),
    { name: 'av-saved-v1', storage: createJSONStorage(() => localStorage), partialize: (s) => ({ items: s.items }) },
  ),
);

/** True when this exact thing is saved. */
export const useIsSaved = (kind: SavedItem['kind'], href: string, url = '') => useSaved((s) => s.items.some((i) => savedKey(i) === savedKey({ kind, href, url })));
