import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type WidgetId = 'tension' | 'events' | 'markets' | 'watchlist' | 'countries' | 'notes' | 'alerts';

export const WIDGETS: { id: WidgetId; title: string }[] = [
  { id: 'tension', title: 'World Tension Index' },
  { id: 'events', title: 'Priority Events' },
  { id: 'markets', title: 'Market Overview' },
  { id: 'watchlist', title: 'Watchlist' },
  { id: 'countries', title: 'Favourite Countries' },
  { id: 'alerts', title: 'Price Alerts' },
  { id: 'notes', title: 'Saved Research' },
];

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  level: number;
}

interface PrefsState {
  layout: WidgetId[];
  hidden: WidgetId[];
  watchlist: string[];
  favorites: string[];
  notes: Note[];
  alerts: AlertRule[];
  introSeen: boolean;
  moveWidget: (id: WidgetId, to: number) => void;
  toggleWidget: (id: WidgetId) => void;
  resetLayout: () => void;
  toggleWatch: (symbol: string) => void;
  toggleFavorite: (iso3: string) => void;
  addNote: (title: string, body: string) => void;
  removeNote: (id: string) => void;
  addAlert: (rule: Omit<AlertRule, 'id'>) => void;
  removeAlert: (id: string) => void;
  setIntroSeen: () => void;
}

const DEFAULT_LAYOUT = WIDGETS.map((w) => w.id);
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/** Device-local preferences. Synced to Supabase once accounts are enabled (Phase 2). */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      layout: DEFAULT_LAYOUT,
      hidden: [],
      watchlist: ['GLB-EQ.D', 'CRUDE.D', 'GOLD.D', 'EURUSD.D'],
      favorites: ['DEU', 'USA', 'JPN'],
      notes: [],
      alerts: [],
      introSeen: false,
      moveWidget: (id, to) =>
        set((s) => {
          const order = s.layout.filter((w) => w !== id);
          order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
          return { layout: order };
        }),
      toggleWidget: (id) =>
        set((s) => ({ hidden: s.hidden.includes(id) ? s.hidden.filter((w) => w !== id) : [...s.hidden, id] })),
      resetLayout: () => set({ layout: DEFAULT_LAYOUT, hidden: [] }),
      toggleWatch: (symbol) =>
        set((s) => ({
          watchlist: s.watchlist.includes(symbol) ? s.watchlist.filter((x) => x !== symbol) : [...s.watchlist, symbol].slice(0, 25),
        })),
      toggleFavorite: (iso3) =>
        set((s) => ({
          favorites: s.favorites.includes(iso3) ? s.favorites.filter((x) => x !== iso3) : [...s.favorites, iso3].slice(0, 25),
        })),
      addNote: (title, body) =>
        set((s) => ({ notes: [{ id: uid(), title: title.slice(0, 120), body: body.slice(0, 4000), createdAt: new Date().toISOString() }, ...s.notes].slice(0, 100) })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      addAlert: (rule) => set((s) => ({ alerts: [...s.alerts, { ...rule, id: uid() }].slice(0, 50) })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      setIntroSeen: () => set({ introSeen: true }),
    }),
    {
      name: 'av-prefs-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Keep layouts valid if widgets are added or removed between releases.
      merge: (persisted, current) => {
        const p = persisted as Partial<PrefsState>;
        const layout = (p.layout ?? []).filter((w) => DEFAULT_LAYOUT.includes(w));
        for (const w of DEFAULT_LAYOUT) if (!layout.includes(w)) layout.push(w);
        return { ...current, ...p, layout };
      },
    },
  ),
);
