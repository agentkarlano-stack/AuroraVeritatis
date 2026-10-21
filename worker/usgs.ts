import type { GeoEvent } from '../shared/types';
import { fetchJson } from './http';

const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number; url: string; title: string; tsunami: number };
  geometry: { coordinates: [number, number, number] };
}

export function magnitudeToSeverity(mag: number): GeoEvent['severity'] {
  if (mag >= 7) return 5;
  if (mag >= 6.5) return 4;
  if (mag >= 6) return 3;
  if (mag >= 5.5) return 2;
  return 1;
}

export function normalizeUsgs(features: UsgsFeature[]): GeoEvent[] {
  return features
    .filter((f) => typeof f.properties.mag === 'number' && Array.isArray(f.geometry?.coordinates))
    .map((f) => {
      const mag = f.properties.mag as number;
      const [lon, lat, depth] = f.geometry.coordinates;
      return {
        id: `usgs-${f.id}`,
        title: f.properties.title,
        summary: `Magnitude ${mag.toFixed(1)} earthquake at ${depth.toFixed(0)} km depth${
          f.properties.tsunami ? '. USGS tsunami flag set — check official warning centres.' : '.'
        }`,
        category: 'natural-disaster' as const,
        severity: magnitudeToSeverity(mag),
        lat,
        lon,
        region: f.properties.place ?? 'Unknown',
        time: new Date(f.properties.time).toISOString(),
        provenance: 'confirmed' as const,
        source: { name: 'USGS Earthquake Hazards Program', url: f.properties.url, license: 'Public domain (U.S. Government)' },
      };
    });
}

export async function earthquakes(): Promise<GeoEvent[]> {
  const data = await fetchJson<{ features: UsgsFeature[] }>(FEED);
  return normalizeUsgs(data.features ?? []);
}
