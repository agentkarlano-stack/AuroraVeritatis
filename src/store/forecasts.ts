import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Forecast, Outcome } from '../lib/forecasting';

const MAX = 500;
const id = () => `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const now = () => new Date().toISOString();

interface ForecastStore {
  forecasts: Forecast[];
  add: (f: Omit<Forecast, 'id' | 'history'> & { p: number }) => void;
  revise: (fid: string, p: number, note?: string) => void;
  resolve: (fid: string, outcome: Outcome | null) => void;
  remove: (fid: string) => void;
  importMany: (fs: Forecast[]) => number;
}

/** The user's own forecasts (Prediction Research), kept in this browser; export and import as JSON. */
export const useForecasts = create<ForecastStore>()(
  persist(
    (set, get) => ({
      forecasts: [],
      add: ({ p, ...rest }) => set((s) => ({ forecasts: [{ ...rest, id: id(), history: [{ at: now(), p }] }, ...s.forecasts].slice(0, MAX) })),
      revise: (fid, p, note) =>
        set((s) => ({ forecasts: s.forecasts.map((f) => (f.id === fid && !f.outcome ? { ...f, history: [...f.history, { at: now(), p, ...(note ? { note: note.slice(0, 300) } : {}) }].slice(-200) } : f)) })),
      resolve: (fid, outcome) =>
        set((s) => ({
          forecasts: s.forecasts.map((f) => {
            if (f.id !== fid) return f;
            const next: Forecast = { ...f };
            delete next.outcome;
            delete next.resolvedAt;
            return outcome ? { ...next, outcome, resolvedAt: now() } : next;
          }),
        })),
      remove: (fid) => set((s) => ({ forecasts: s.forecasts.filter((f) => f.id !== fid) })),
      importMany: (fs) => {
        const known = new Set(get().forecasts.map((f) => f.id));
        const valid = fs.filter((f) => f && typeof f.question === 'string' && Array.isArray(f.history) && f.history.every((h) => h.p > 0 && h.p < 1) && !known.has(f.id));
        set((s) => ({ forecasts: [...valid, ...s.forecasts].slice(0, MAX) }));
        return valid.length;
      },
    }),
    { name: 'av-forecasts-v1', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
