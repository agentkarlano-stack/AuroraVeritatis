import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { normalizeSettings, parseLayout, type ChartSettings, type ChartTemplate, type SavedLayout } from '../lib/chart/workspace';

const MAX_TEMPLATES = 30;
const MAX_LAYOUTS = 50;

interface ChartLibrary {
  favourites: string[];
  templates: ChartTemplate[];
  layouts: SavedLayout[];
  toggleFavourite: (indicatorId: string) => void;
  saveTemplate: (name: string, settings: ChartSettings) => void;
  renameTemplate: (id: string, name: string) => void;
  duplicateTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;
  saveLayout: (layout: SavedLayout) => void;
  renameLayout: (savedAt: string, name: string) => void;
  duplicateLayout: (savedAt: string) => void;
  deleteLayout: (savedAt: string) => void;
}

const stamp = () => new Date().toISOString();
const tid = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Chart favourites, user templates and saved chart analyses, kept in this browser. */
export const useChartLibrary = create<ChartLibrary>()(
  persist(
    (set) => ({
      favourites: ['sma', 'ema', 'rsi', 'macd', 'bb', 'volume'],
      templates: [],
      layouts: [],
      toggleFavourite: (id) => set((s) => ({ favourites: s.favourites.includes(id) ? s.favourites.filter((f) => f !== id) : [...s.favourites, id] })),
      saveTemplate: (name, settings) => set((s) => ({ templates: [...s.templates, { id: tid(), name: name.slice(0, 60), settings }].slice(-MAX_TEMPLATES) })),
      renameTemplate: (id, name) => set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, name: name.slice(0, 60) } : t)) })),
      duplicateTemplate: (id) =>
        set((s) => {
          const t = s.templates.find((x) => x.id === id);
          return t ? { templates: [...s.templates, { ...t, id: tid(), name: `${t.name} (copy)`.slice(0, 60) }].slice(-MAX_TEMPLATES) } : s;
        }),
      deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
      saveLayout: (layout) => set((s) => ({ layouts: [layout, ...s.layouts.filter((l) => l.savedAt !== layout.savedAt)].slice(0, MAX_LAYOUTS) })),
      renameLayout: (savedAt, name) => set((s) => ({ layouts: s.layouts.map((l) => (l.savedAt === savedAt ? { ...l, name: name.slice(0, 80) } : l)) })),
      duplicateLayout: (savedAt) =>
        set((s) => {
          const l = s.layouts.find((x) => x.savedAt === savedAt);
          return l ? { layouts: [{ ...l, name: `${l.name} (copy)`.slice(0, 80), savedAt: stamp() }, ...s.layouts].slice(0, MAX_LAYOUTS) } : s;
        }),
      deleteLayout: (savedAt) => set((s) => ({ layouts: s.layouts.filter((l) => l.savedAt !== savedAt) })),
    }),
    {
      name: 'av-chart-library-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Stored data is validated on load like an imported file.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChartLibrary>;
        return {
          ...current,
          favourites: Array.isArray(p.favourites) ? p.favourites.filter((f) => typeof f === 'string').slice(0, 100) : current.favourites,
          templates: (Array.isArray(p.templates) ? p.templates : [])
            .filter((t) => t && typeof t.id === 'string')
            .map((t) => ({ id: t.id, name: String(t.name).slice(0, 60), settings: normalizeSettings(t.settings) }))
            .slice(-MAX_TEMPLATES),
          layouts: (Array.isArray(p.layouts) ? p.layouts : []).flatMap((l) => parseLayout(JSON.stringify(l)) ?? []).slice(0, MAX_LAYOUTS),
        };
      },
    },
  ),
);
