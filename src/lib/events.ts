import type { EventCategory, GeoEvent } from '../../shared/types';
import { DEMO_EVENTS } from '../data/demoEvents';
import { useApi } from './api';

/** Marker colours per event category, shared by the map, lists and chart annotations. */
export const CATEGORY_COLOR: Record<EventCategory, string> = {
  conflict: '#d26a6a',
  security: '#d98c5f',
  political: '#c8a96b',
  humanitarian: '#b58fd1',
  'natural-disaster': '#6c9bd2',
  economic: '#5fb38a',
  energy: '#e0c35a',
};

export const CATEGORY_LABEL: Record<GeoEvent['category'], string> = {
  conflict: 'Armed conflict',
  security: 'Security incident',
  political: 'Political crisis',
  humanitarian: 'Humanitarian',
  'natural-disaster': 'Natural hazard',
  economic: 'Economic',
  energy: 'Energy supply',
};

/** Demo scenarios plus the live USGS layer (when reachable). */
export function useEvents() {
  const quakes = useApi<{ events: GeoEvent[] }>('/api/events/earthquakes');
  return {
    demo: DEMO_EVENTS,
    quakes: quakes.status === 'ready' ? quakes.data.events : [],
    quakeStatus: quakes.status,
    quakeError: quakes.status === 'error' ? quakes.error : null,
    reloadQuakes: quakes.reload,
  };
}

export const REGIONS = [
  'Americas',
  'Europe',
  'Middle East',
  'Africa',
  'South Asia',
  'Southeast Asia',
  'East Asia',
  'Russia & Central Asia',
  'Oceania',
  'Oceans & other',
] as const;
export type Region = (typeof REGIONS)[number];

/** Coarse coordinate-based region classifier used for filtering. Approximate by design. */
export function regionOf(lat: number, lon: number): Region {
  if (lon <= -30 && lon >= -170 && lat > -60) return 'Americas';
  if (lat >= 36 && lat <= 72 && lon >= -25 && lon < 45) return 'Europe';
  if (lat >= 12 && lat <= 42 && lon >= 34 && lon <= 63) return 'Middle East';
  if (lat >= -36 && lat <= 37 && lon >= -20 && lon <= 52) return 'Africa';
  if (lat >= 5 && lat <= 37 && lon > 60 && lon < 92) return 'South Asia';
  if (lat >= -11 && lat < 21 && lon >= 92 && lon <= 141) return 'Southeast Asia';
  if (lat >= 21 && lat <= 55 && lon >= 92 && lon <= 150) return 'East Asia';
  if (lat > 35 && lat <= 82 && lon >= 45) return 'Russia & Central Asia';
  if ((lat < -10 && lon >= 110) || lon < -140 || lon >= 150) return 'Oceania';
  return 'Oceans & other';
}
