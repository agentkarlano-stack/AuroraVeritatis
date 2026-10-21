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
  if (geometry?.type === 'Point' && Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') return [c[0], c[1]];
  return null;
}

/** Defensive normalisation: features without a point location or a recognised event type are skipped. */
export function normalizeGdacs(features: GdacsFeature[]): GeoEvent[] {
  const out: GeoEvent[] = [];
  for (const f of features) {
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
      id: `gdacs-${type}-${p.eventid ?? `${lat},${lon}`}-${p.episodeid ?? 0}`,
      title: p.name?.trim() || p.eventname?.trim() || `${label}${p.country ? ` — ${p.country}` : ''}`,
      summary: [`${label}. GDACS ${p.alertlevel ?? 'Green'} alert (modelled humanitarian impact).`, severityText, p.description?.trim()].filter(Boolean).join(' '),
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
  const data = await fetchJson<{ features?: GdacsFeature[] } | null>(gdacsUrl());
  return normalizeGdacs(data?.features ?? []);
}
