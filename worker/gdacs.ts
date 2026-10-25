import type { GeoEvent } from '../shared/types';
import { fetchJson } from './http';

// Event types requested (earthquakes are covered by the USGS layer) and the look-back window.
const EVENT_TYPES = 'TC;FL;VO;DR;WF';
const WINDOW_DAYS = 30;

/** Documented GDACS search endpoint (geoJSON); dates are computed per request, never at module load. */
export function gdacsUrl(now = Date.now()): string {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  return `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=${EVENT_TYPES}&fromdate=${day(now - WINDOW_DAYS * 86_400_000)}&todate=${day(now)}`;
}

const TYPE_LABEL: Record<string, string> = {
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcanic activity',
  DR: 'Drought',
  WF: 'Wildfire',
};

interface GdacsFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    eventtype?: string;
    eventid?: number | string;
    episodeid?: number | string;
    name?: string;
    eventname?: string;
    description?: string;
    alertlevel?: string;
    country?: string;
    fromdate?: string;
    todate?: string;
    url?: { report?: string } | string;
    severitydata?: { severitytext?: string };
  };
}

/** GDACS alert levels are model-based impact estimates: Green (low), Orange (medium), Red (high). */
export function alertToSeverity(level: string | undefined): GeoEvent['severity'] {
  switch ((level ?? '').toLowerCase()) {
    case 'red':
      return 5;
    case 'orange':
      return 3;
    default:
      return 1;
  }
}

function point(geometry: GdacsFeature['geometry']): [number, number] | null {
  const c = geometry?.coordinates;
  if (geometry?.type !== 'Point' || !Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
  const [lon, lat] = c as [number, number];
  // Out-of-range or exactly 0,0 coordinates are placeholders, not locations: such features are skipped rather than
  // being drawn as a false hotspot in the ocean.
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return [lon, lat];
}

/**
 * Defensive normalisation: features without a point location or a recognised event type are skipped. GDACS publishes
 * one feature per episode (update) of an event; they are merged into one canonical event per event id, located at the
 * latest episode, with the number of updates in the summary.
 */
export function normalizeGdacs(features: GdacsFeature[]): GeoEvent[] {
  const latest = new Map<string, { f: GdacsFeature; episodes: number; t: number }>();
  for (const f of features) {
    const p = f.properties ?? {};
    const type = (p.eventtype ?? '').toUpperCase();
    if (!point(f.geometry) || !TYPE_LABEL[type]) continue;
    const key = p.eventid != null ? `${type}-${p.eventid}` : `${type}-${JSON.stringify(f.geometry?.coordinates)}`;
    const t = Date.parse(p.todate ?? p.fromdate ?? '') || 0;
    const prev = latest.get(key);
    if (!prev) latest.set(key, { f, episodes: 1, t });
    else latest.set(key, { f: t >= prev.t ? f : prev.f, episodes: prev.episodes + 1, t: Math.max(t, prev.t) });
  }
  return toEvents([...latest.values()]);
}

function toEvents(items: { f: GdacsFeature; episodes: number }[]): GeoEvent[] {
  const out: GeoEvent[] = [];
  for (const { f, episodes } of items) {
    const p = f.properties ?? {};
    const pt = point(f.geometry);
    const type = (p.eventtype ?? '').toUpperCase();
    if (!pt || !TYPE_LABEL[type]) continue;
    const [lon, lat] = pt;
    const when = Date.parse(p.todate ?? p.fromdate ?? '');
    const report = typeof p.url === 'string' ? p.url : p.url?.report;
    const label = TYPE_LABEL[type]!;
    const severityText = p.severitydata?.severitytext?.trim();
    out.push({
      id: `gdacs-${type}-${p.eventid ?? `${lat},${lon}`}`,
      title: p.name?.trim() || p.eventname?.trim() || `${label}${p.country ? ` — ${p.country}` : ''}`,
      summary: [
        `${label}. GDACS ${p.alertlevel ?? 'Green'} alert (modelled humanitarian impact).`,
        severityText,
        p.description?.trim(),
        episodes > 1 ? `${episodes} GDACS updates; latest shown.` : null,
      ]
        .filter(Boolean)
        .join(' '),
      category: 'natural-disaster',
      severity: alertToSeverity(p.alertlevel),
      lat,
      lon,
      region: p.country?.trim() || 'Unknown',
      time: Number.isFinite(when) ? new Date(when).toISOString() : new Date().toISOString(),
      provenance: 'estimate',
      source: {
        name: 'GDACS (UN OCHA / European Commission JRC)',
        url: report?.startsWith('http') ? report : 'https://www.gdacs.org/',
        license: 'Free use with attribution to GDACS',
      },
    });
  }
  return out;
}

export async function disasters(): Promise<GeoEvent[]> {
  // GDACS search is slow (often >8 s); the result is edge-cached for 30 minutes.
  const data = await fetchJson<{ features?: GdacsFeature[] } | null>(gdacsUrl(), 25_000);
  return normalizeGdacs(data?.features ?? []);
}
