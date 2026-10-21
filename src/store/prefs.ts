import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_CHART_OPTIONS, type ChartOptions, type Drawing } from '../lib/chart';

export type WidgetId = 'briefing' | 'tension' | 'events' | 'markets' | 'watchlist' | 'countries' | 'notes' | 'alerts';

export const WIDGETS: { id: WidgetId; title: string }[] = [
  { id: 'briefing', title: 'Daily Briefing' },
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
  chart: ChartOptions & { range: number };
  drawings: Record<string, Drawing[]>;
  setChart: (patch: Partial<ChartOptions & { range: number }>) => void;
  addDrawing: (symbol: string, d: Drawing) => void;
  removeDrawing: (symbol: string, id: string) => void;
  clearDrawings: (symbol: string) => void;
  moveWidget: (id: WidgetId, to: number) => void;
  toggleWidget: (id: WidgetId) => void;
  resetLayout: () => void;
  /** Returns false when adding would exceed `max`. */
  toggleWatch: (symbol: string, max?: number) => boolean;
  toggleFavorite: (iso3: string) => void;
  addNote: (title: string, body: string) => void;
  removeNote: (id: string) => void;
  /** Returns false when adding would exceed `max`. */
  addAlert: (rule: Omit<AlertRule, 'id'>, max?: number) => boolean;
  removeAlert: (id: string) => void;
  setIntroSeen: () => void;
  replayIntro: () => void;
}

const DEFAULT_LAYOUT = WIDGETS.map((w) => w.id);
export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/** Device-local preferences. Synced to Supabase once accounts are enabled (Phase 2). */
export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_LAYOUT,
      hidden: [],
      watchlist: ['GLB-EQ.D', 'CRUDE.D', 'GOLD.D', 'EURUSD.D'],
      favorites: ['DEU', 'USA', 'JPN'],
      notes: [],
      alerts: [],
      introSeen: false,
      chart: { ...DEFAULT_CHART_OPTIONS, range: 126 },
      drawings: {},
      setChart: (patch) => set((s) => ({ chart: { ...s.chart, ...patch } })),
      addDrawing: (symbol, d) => set((s) => ({ drawings: { ...s.drawings, [symbol]: [...(s.drawings[symbol] ?? []), d].slice(-50) } })),
      removeDrawing: (symbol, id) => set((s) => ({ drawings: { ...s.drawings, [symbol]: (s.drawings[symbol] ?? []).filter((d) => d.id !== id) } })),
      clearDrawings: (symbol) => set((s) => ({ drawings: { ...s.drawings, [symbol]: [] } })),
      moveWidget: (id, to) =>
        set((s) => {
          const order = s.layout.filter((w) => w !== id);
          order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
          return { layout: order };
        }),
      toggleWidget: (id) =>
        set((s) => ({ hidden: s.hidden.includes(id) ? s.hidden.filter((w) => w !== id) : [...s.hidden, id] })),
      resetLayout: () => set({ layout: DEFAULT_LAYOUT, hidden: [] }),
      toggleWatch: (symbol, max = 100) => {
        const { watchlist } = get();
        if (watchlist.includes(symbol)) {
          set({ watchlist: watchlist.filter((x) => x !== symbol) });
          return true;
        }
        if (watchlist.length >= max) return false;
        set({ watchlist: [...watchlist, symbol] });
        return true;
      },
      toggleFavorite: (iso3) =>
        set((s) => ({
          favorites: s.favorites.includes(iso3) ? s.favorites.filter((x) => x !== iso3) : [...s.favorites, iso3].slice(0, 25),
        })),
      addNote: (title, body) =>
        set((s) => ({ notes: [{ id: uid(), title: title.slice(0, 120), body: body.slice(0, 4000), createdAt: new Date().toISOString() }, ...s.notes].slice(0, 100) })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      addAlert: (rule, max = 100) => {
        if (get().alerts.length >= max) return false;
        set((s) => ({ alerts: [...s.alerts, { ...rule, id: uid() }] }));
        return true;
      },
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      setIntroSeen: () => set({ introSeen: true }),
      replayIntro: () => set({ introSeen: false }),
    }),
    {
      name: 'av-prefs-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Keep layouts valid if widgets are added or removed between releases.
      merge: (persisted, current) => {
        const p = persisted as Partial<PrefsState>;
        const layout = (p.layout ?? []).filter((w) => DEFAULT_LAYOUT.includes(w));
        // New widgets appear at their default position rather than at the end.
        DEFAULT_LAYOUT.forEach((w, i) => {
          if (!layout.includes(w)) layout.splice(Math.min(i, layout.length), 0, w);
        });
        return { ...current, ...p, layout, chart: { ...current.chart, ...p.chart } };
      },
    },
  ),
);
