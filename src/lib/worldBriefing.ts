import type { EventCategory, GeoEvent, SourceRef } from '../../shared/types';
import { RISK_LEVELS, type RiskLevel } from './brainRisk';

/**
 * Guided World Briefing (no AI). Every text is either source data or fixed, documented background for the event type;
 * nothing is generated or guessed. Pure logic, used by `lib/briefingPlan.ts` (Global Radar briefings).
 */

/** How far an item is verified. Simulated scenarios have their own status and are never shown as confirmed. */
export const STATUS = {
  confirmed: { label: 'Confirmed', description: 'Reported by an official or scientific source that measured or verified the event.' },
  reported: { label: 'Reported', description: 'Reported by an automated monitoring system; details may be revised.' },
  modelled: { label: 'Modelled', description: 'An estimate from a model (for example expected impact), not an observation.' },
  unverified: { label: 'Unverified', description: 'Not yet verified by an authoritative source.' },
  simulated: { label: 'Simulated', description: 'A hypothetical scenario for demonstration. Not a real event.' },
} as const;
export type BriefingStatus = keyof typeof STATUS;

export function statusOf(e: Pick<GeoEvent, 'id' | 'provenance'>): BriefingStatus {
  if (e.provenance === 'simulated') return 'simulated';
  // GDACS reports hazards detected by automated systems; its alert levels are modelled impact (see reliability).
  if (e.id.startsWith('gdacs-')) return 'reported';
  if (e.provenance === 'confirmed') return 'confirmed';
  if (e.provenance === 'estimate') return 'modelled';
  return 'unverified';
}

/** What each source is and how far to rely on it. */
export function reliabilityOf(e: Pick<GeoEvent, 'id' | 'provenance'>): string {
  if (e.provenance === 'simulated') return 'Aurora demonstration scenario. It describes no real event and must not be used as information.';
  if (e.id.startsWith('usgs-'))
    return 'USGS is the U.S. government scientific agency for earthquakes. Location and magnitude are measured; early automatic solutions are revised by seismologists, usually within hours.';
  if (e.id.startsWith('gdacs-'))
    return 'GDACS (UN OCHA and the European Commission JRC) detects hazards automatically and models their likely humanitarian impact. The hazard is reported; the alert level is a model estimate and can change as the event develops.';
  return 'Source reliability has not been assessed.';
}

/** Fixed background per event type: what this kind of event is and how its effects usually unfold. General, not specific. */
const BACKGROUND: Record<EventCategory, { background: string; consequences: string }> = {
  'natural-disaster': {
    background: 'Natural hazards are measured by physical size (magnitude, wind speed, water level). Their human impact depends far more on depth or track, population exposure, building standards and response capacity.',
    consequences: 'Typical effects of a hazard of this kind: damage to buildings and infrastructure near the epicentre or track, disruption of transport, power and supply chains, and humanitarian needs where exposure is high. Markets usually react only when major production, ports or insurers are affected.',
  },
  conflict: {
    background: 'Armed-conflict events are reported with delays and are often contested. Counts and attributions change as independent sources verify them.',
    consequences: 'Typical effects: displacement and humanitarian needs, trade and transport disruption, sanctions risk and higher risk premia for affected regions and commodities.',
  },
  security: {
    background: 'Security incidents range from isolated attacks to escalation between states. Early reports are frequently incomplete.',
    consequences: 'Typical effects: travel and shipping advisories, higher insurance costs and short-lived moves in safe-haven assets.',
  },
  political: {
    background: 'Political crises (contested elections, government collapses, diplomatic ruptures) unfold over days or weeks; official results and statements are the primary sources.',
    consequences: 'Typical effects: policy uncertainty, currency and bond volatility, and delays to investment and reforms.',
  },
  humanitarian: {
    background: 'Humanitarian emergencies are assessed by UN agencies and NGOs; figures are estimates that are revised as access improves.',
    consequences: 'Typical effects: aid appeals, displacement and pressure on food and health systems.',
  },
  economic: {
    background: 'Economic events are best judged against official statistics and central bank communication.',
    consequences: 'Typical effects: repricing of rates, currencies and equities, depending on how far the news was expected.',
  },
  energy: {
    background: 'Energy supply events are judged by the volume affected, spare capacity and stock levels.',
    consequences: 'Typical effects: price spikes in oil, gas or power, higher freight costs and pass-through to inflation if the disruption lasts.',
  },
};

export function backgroundOf(category: EventCategory) {
  return BACKGROUND[category];
}

/** Event severity (1–5) on the Brain risk scale, for consistent colours and wording across Aurora. */
export function severityLevel(severity: GeoEvent['severity']): RiskLevel {
  return (['low', 'elevated', 'significant', 'severe', 'critical'] as const)[severity - 1]!;
}
export const severityLabel = (s: GeoEvent['severity']) => `${s}/5 · ${RISK_LEVELS[severityLevel(s)].label}`;

export type BriefingPeriod = '24h' | '72h' | '7d' | 'since-last';
export const PERIODS: Record<BriefingPeriod, { label: string; hours: number }> = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '72h': { label: 'Last 3 days', hours: 72 },
  '7d': { label: 'Last 7 days', hours: 168 },
  'since-last': { label: 'Since my last briefing', hours: 0 },
};
/** "Since my last briefing" never reaches back further than this; the live feeds hold about this much history. */
export const MAX_SINCE_LAST_DAYS = 7;

export function briefingWindow(period: BriefingPeriod, now: number, lastAt: string | null): { from: number; to: number; note?: string } {
  const H = 3_600_000;
  if (period !== 'since-last') return { from: now - PERIODS[period].hours * H, to: now };
  const last = lastAt ? Date.parse(lastAt) : NaN;
  if (!Number.isFinite(last) || last >= now) return { from: now - 24 * H, to: now, note: 'No earlier briefing recorded on this account, so the last 24 hours are shown.' };
  const floor = now - MAX_SINCE_LAST_DAYS * 24 * H;
  if (last < floor) return { from: floor, to: now, note: `Your last briefing was more than ${MAX_SINCE_LAST_DAYS} days ago; the live feeds cover the last ${MAX_SINCE_LAST_DAYS} days.` };
  return { from: last, to: now };
}

export interface BriefingItem {
  event: GeoEvent;
  status: BriefingStatus;
  /** Other reports of the same real-world event from other sources (merged, so it is listed once). */
  related: GeoEvent[];
  sources: SourceRef[];
}

const KM = (a: GeoEvent, b: GeoEvent) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const STATUS_RANK: BriefingStatus[] = ['confirmed', 'reported', 'modelled', 'unverified', 'simulated'];

/**
 * Removes duplicates: repeated ids, and reports of the same real event by two sources (same category, within 100 km
 * and 6 hours, e.g. a USGS earthquake and its GDACS alert). The better-verified report leads and the other is kept as
 * a related source. Simulated scenarios are never merged with real events.
 */
export function dedupeEvents(events: GeoEvent[]): BriefingItem[] {
  const seen = new Set<string>();
  const unique = events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  const sorted = [...unique].sort((a, b) => STATUS_RANK.indexOf(statusOf(a)) - STATUS_RANK.indexOf(statusOf(b)));
  const items: BriefingItem[] = [];
  for (const e of sorted) {
    const real = e.provenance !== 'simulated';
    const twin = real
      ? items.find(
          (it) =>
            it.event.provenance !== 'simulated' &&
            it.event.category === e.category &&
            it.event.id.split('-')[0] !== e.id.split('-')[0] &&
            Math.abs(Date.parse(it.event.time) - Date.parse(e.time)) <= 6 * 3_600_000 &&
            KM(it.event, e) <= 100,
        )
      : undefined;
    if (twin) {
      twin.related.push(e);
      if (!twin.sources.some((s) => s.url === e.source.url)) twin.sources.push(e.source);
    } else items.push({ event: e, status: statusOf(e), related: [], sources: [e.source] });
  }
  return items;
}

export type BriefingOrder = 'chronological' | 'severity';

/** Items inside the window, ordered for the tour: oldest first (chronological) or most severe first. */
export function briefingItems(events: GeoEvent[], window: { from: number; to: number }, order: BriefingOrder, includeSimulated: boolean): BriefingItem[] {
  const inWindow = events.filter((e) => {
    const t = Date.parse(e.time);
    return t >= window.from && t <= window.to && (includeSimulated || e.provenance !== 'simulated');
  });
  const items = dedupeEvents(inWindow);
  const time = (i: BriefingItem) => Date.parse(i.event.time);
  return items.sort((a, b) => (order === 'severity' ? b.event.severity - a.event.severity || time(b) - time(a) : time(a) - time(b)));
}

/**
 * Country named in the event's location, for the dossier link: GDACS gives the country; USGS places end in
 * ", <country>". Returns the name only; the caller resolves it against the country list. Ocean regions have none.
 */
export function countryNameOf(e: Pick<GeoEvent, 'id' | 'region'>): string | null {
  const r = e.region.trim();
  if (!r || r === 'Unknown') return null;
  if (e.id.startsWith('gdacs-')) return r.split(/[,;]/)[0]!.trim() || null;
  if (e.id.startsWith('usgs-')) {
    const tail = r.includes(',') ? r.slice(r.lastIndexOf(',') + 1) : r;
    return tail.replace(/\bregion\b/i, '').trim() || null;
  }
  return null;
}

/** Briefing preferences (synced to the account). `lastAt` is only kept while the user has opted in with `remember`. */
export interface BriefingPrefs {
  remember: boolean;
  lastAt: string | null;
  order: BriefingOrder;
  includeSimulated: boolean;
}
export const DEFAULT_BRIEFING_PREFS: BriefingPrefs = { remember: false, lastAt: null, order: 'chronological', includeSimulated: false };

/** Reads stored or synced preferences defensively (older or foreign copies may have another shape). */
export function normalizeBriefingPrefs(v: unknown): BriefingPrefs {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const remember = r.remember === true;
  const lastAt = remember && typeof r.lastAt === 'string' && Number.isFinite(Date.parse(r.lastAt)) ? r.lastAt : null;
  return { remember, lastAt, order: r.order === 'severity' ? 'severity' : 'chronological', includeSimulated: r.includeSimulated === true };
}
