import { useCallback, useMemo } from 'react';
import { normalizeFavourites, toggleFavourite, type ChartFavourites, type FavouriteKind } from '../lib/chart/favourites';
import { useChartLibrary } from './chartLibrary';
import { usePrefs } from './prefs';

/** Chart favourites from the synced preferences (indicator stars saved in this browser before sync are carried over). */
export function useChartFavourites() {
  const raw = usePrefs((s) => s.chartFavs);
  const set = usePrefs((s) => s.setChartFavs);
  const legacy = useChartLibrary((s) => s.favourites);
  const favs = useMemo(() => normalizeFavourites(raw, legacy), [raw, legacy]);
  const toggle = useCallback((kind: FavouriteKind, id: string) => set(toggleFavourite(favs, kind, id)), [favs, set]);
  const update = useCallback((patch: Partial<ChartFavourites>) => set({ ...favs, ...patch }), [favs, set]);
  return { favs, toggle, update };
}
