import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BrainBackground, BrainColorMode } from '../lib/brainDisplay';
import type { Drawing } from '../lib/chart';
import type { ProfileBackground } from '../lib/profileBackground';
import type { IntroExperience, LegacyIntroMode } from '../lib/intro';

export interface IdlePrefs {
  radar: boolean;
  markets: boolean;
  countries: boolean;
}
export const DEFAULT_IDLE: IdlePrefs = { radar: true, markets: true, countries: false };
/** Missing or malformed values fall back to the defaults. */
export function normalizeIdle(v: unknown): IdlePrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const b = (k: keyof IdlePrefs) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : DEFAULT_IDLE[k]);
  return { radar: b('radar'), markets: b('markets'), countries: b('countries') };
}
import { DEFAULT_BRIEFING_PREFS, normalizeBriefingPrefs, type BriefingPrefs } from '../lib/worldBriefing';
import { DEFAULT_SETTINGS, normalizeSettings, type ChartSettings } from '../lib/chart/workspace';

export type WidgetId = 'briefing' | 'tension' | 'events' | 'markets' | 'watchlist' | 'countries' | 'notes' | 'alerts' | 'brain' | 'freshness';

export const WIDGETS: { id: WidgetId; title: string }[] = [
  { id: 'briefing', title: 'Daily Briefing' },
  { id: 'tension', title: 'World Tension Index' },
  { id: 'events', title: 'Priority Events' },
  { id: 'markets', title: 'Market Overview' },
  { id: 'watchlist', title: 'Watchlist' },
  { id: 'countries', title: 'Favourite Countries' },
  { id: 'alerts', title: 'Price Alerts' },
  { id: 'notes', title: 'Saved Research' },
  { id: 'brain', title: 'Brain' },
  { id: 'freshness', title: 'Data Freshness' },
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
  /** Introduction experience; null means automatic (lib/intro.ts). Always read through `resolveIntroExperience`. */
  intro: IntroExperience | null;
  setIntro: (m: IntroExperience | null) => void;
  /** Legacy explicit intro setting (before the three experiences); kept so an old "off" still applies. */
  introChoice?: LegacyIntroMode | null;
  /** Legacy (before explicit choices were tracked); kept only so an old explicit "off" still applies. */
  introMode?: LegacyIntroMode;
  /** Commodity & Energy Monitor watchlist (commodity ids from lib/commodities.ts). */
  commodityWatch: string[];
  toggleCommodity: (id: string) => void;
  /** World Briefing settings; the last-briefing time is kept only with consent (`remember`). Read via normalizeBriefingPrefs. */
  briefing: BriefingPrefs;
  setBriefing: (patch: Partial<BriefingPrefs>) => void;
  /** Automatic idle presentations per area (manual start is always available). Synced with the account. */
  idle?: Partial<IdlePrefs>;
  setIdle: (patch: Partial<IdlePrefs>) => void;
  /** Brain canvas display (this device only). */
  brainCanvas: { background: BrainBackground; colorMode: BrainColorMode };
  setBrainCanvas: (patch: Partial<PrefsState['brainCanvas']>) => void;
  /** Optional landmark background for the profile (synced); read via normalizeBackground. */
  profileBackground?: unknown;
  setProfileBackground: (bg: ProfileBackground | null) => void;
  /** Country most recently opened in a dossier (used only to suggest a background). */
  lastCountry?: string | null;
  setLastCountry: (iso3: string) => void;
  /** Chart favourites (ranges, intervals, types, indicators, drawing tools, templates); read via useChartFavourites. */
  chartFavs?: unknown;
  setChartFavs: (favs: unknown) => void;
  /** Chart editor settings (normalised on read: older or synced copies may have an earlier shape). */
  chart: ChartSettings;
  drawings: Record<string, Drawing[]>;
  setChart: (patch: Partial<ChartSettings>) => void;
  setDrawings: (symbol: string, list: Drawing[]) => void;
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
  updateNote: (id: string, title: string, body: string) => void;
  removeNote: (id: string) => void;
  /** Restores the synced preferences and notes to their defaults (used when the browser's data belongs to another account). */
  resetSynced: () => void;
  /** Returns false when adding would exceed `max`. */
  addAlert: (rule: Omit<AlertRule, 'id'>, max?: number) => boolean;
  removeAlert: (id: string) => void;
  setIntroSeen: () => void;
  replayIntro: () => void;
}

const DEFAULT_LAYOUT = WIDGETS.map((w) => w.id);

/**
 * A valid layout: unknown ids dropped, duplicates removed, and widgets added in a later release inserted at their
 * default position (a synced or stored layout may predate them).
 */
export function normalizeLayout(raw: unknown): WidgetId[] {
  const layout = (Array.isArray(raw) ? raw : []).filter((w, i, a): w is WidgetId => DEFAULT_LAYOUT.includes(w as WidgetId) && a.indexOf(w) === i);
  DEFAULT_LAYOUT.forEach((w, i) => {
    if (!layout.includes(w)) layout.splice(Math.min(i, layout.length), 0, w);
  });
  return layout;
}
const DEFAULT_WATCHLIST = ['GLB-EQ.D', 'CRUDE.D', 'GOLD.D', 'EURUSD.D'];
const DEFAULT_FAVORITES = ['DEU', 'USA', 'JPN'];
export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/** Device-local preferences. Synced to Supabase once accounts are enabled (Phase 2). */
export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_LAYOUT,
      hidden: [],
      watchlist: DEFAULT_WATCHLIST,
      favorites: DEFAULT_FAVORITES,
      notes: [],
      alerts: [],
      introSeen: false,
      intro: null,
      setIntro: (intro) => set({ intro }),
      commodityWatch: ['brent', 'gas-eu', 'gold', 'copper', 'wheat'],
      toggleCommodity: (id) => set((s) => ({ commodityWatch: s.commodityWatch.includes(id) ? s.commodityWatch.filter((x) => x !== id) : [...s.commodityWatch, id].slice(-30) })),
      briefing: DEFAULT_BRIEFING_PREFS,
      idle: DEFAULT_IDLE,
      setIdle: (patch) => set((s) => ({ idle: { ...normalizeIdle(s.idle), ...patch } })),
      setChartFavs: (chartFavs) => set({ chartFavs }),
      setProfileBackground: (profileBackground) => set({ profileBackground }),
      setLastCountry: (lastCountry) => set({ lastCountry }),
      setBriefing: (patch) => set((s) => ({ briefing: normalizeBriefingPrefs({ ...normalizeBriefingPrefs(s.briefing), ...patch }) })),
      brainCanvas: { background: 'dots', colorMode: 'type' },
      setBrainCanvas: (patch) => set((s) => ({ brainCanvas: { ...s.brainCanvas, ...patch } })),
      chart: DEFAULT_SETTINGS,
      drawings: {},
      setChart: (patch) => set((s) => ({ chart: { ...normalizeSettings(s.chart), ...patch } })),
      setDrawings: (symbol, list) => set((s) => ({ drawings: { ...s.drawings, [symbol]: list.slice(-100) } })),
      addDrawing: (symbol, d) => set((s) => ({ drawings: { ...s.drawings, [symbol]: [...(s.drawings[symbol] ?? []), d].slice(-50) } })),
      removeDrawing: (symbol, id) => set((s) => ({ drawings: { ...s.drawings, [symbol]: (s.drawings[symbol] ?? []).filter((d) => d.id !== id) } })),
      clearDrawings: (symbol) => set((s) => ({ drawings: { ...s.drawings, [symbol]: [] } })),
      moveWidget: (id, to) =>
        set((s) => {
          const order = normalizeLayout(s.layout).filter((w) => w !== id);
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
        set((s) => ({ notes: [{ id: uid(), title: title.slice(0, 120), body: body.slice(0, 4000), createdAt: new Date().toISOString() }, ...s.notes].slice(0, 1000) })),
      updateNote: (id, title, body) =>
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, title: title.slice(0, 120), body: body.slice(0, 4000) } : n)) })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      resetSynced: () =>
        set({
          layout: DEFAULT_LAYOUT,
          hidden: [],
          watchlist: DEFAULT_WATCHLIST,
          favorites: DEFAULT_FAVORITES,
          notes: [],
          alerts: [],
          chart: DEFAULT_SETTINGS,
          drawings: {},
          briefing: DEFAULT_BRIEFING_PREFS,
        }),
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
        const layout = normalizeLayout(p.layout);
        const bc = { ...current.brainCanvas, ...p.brainCanvas };
        const brainCanvas = {
          background: ['dots', 'grid', 'plain', 'night'].includes(bc.background) ? bc.background : 'dots',
          colorMode: bc.colorMode === 'risk' ? 'risk' : 'type',
        } as PrefsState['brainCanvas'];
        return { ...current, ...p, layout, chart: normalizeSettings(p.chart ?? current.chart), brainCanvas, briefing: normalizeBriefingPrefs(p.briefing) };
      },
    },
  ),
);
