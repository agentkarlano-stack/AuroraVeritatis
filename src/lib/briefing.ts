import type { GeoEvent, Provenance } from '../../shared/types';
import { tensionBand } from './tension';

export interface BriefingItem {
  text: string;
  provenance: Provenance;
  /** In-app link for more detail. */
  to: string;
}

export interface Briefing {
  date: string;
  headline: string;
  sections: { title: string; items: BriefingItem[] }[];
}

export interface Mover {
  symbol: string;
  name: string;
  changePct: number;
}

export interface BriefingInput {
  now: number;
  events: GeoEvent[];
  tensionNow: number;
  tensionWeekAgo: number;
  movers: Mover[];
}

const DAY = 86_400_000;
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;

/** The weakest provenance among several inputs (a summary is only as reliable as its least reliable input). */
export function weakest(...kinds: Provenance[]): Provenance {
  const order: Provenance[] = ['confirmed', 'estimate', 'unverified', 'simulated'];
  return kinds.reduce((w, k) => (order.indexOf(k) > order.indexOf(w) ? k : w), 'confirmed');
}

/**
 * Deterministic, template-based daily briefing (no AI): every sentence is derived from platform data and carries the
 * provenance of its inputs.
 */
export function buildBriefing({ now, events, tensionNow, tensionWeekAgo, movers }: BriefingInput): Briefing {
  const recent = events
    .filter((e) => {
      const age = now - Date.parse(e.time);
      return age >= 0 && age <= DAY;
    })
    .sort((a, b) => b.severity - a.severity || Date.parse(b.time) - Date.parse(a.time));

  const eventItems: BriefingItem[] = recent.slice(0, 3).map((e) => ({
    text: `${e.title} (${e.region}, severity ${e.severity}/5).`,
    provenance: e.provenance,
    to: '/radar',
  }));
  if (!eventItems.length) eventItems.push({ text: 'No events recorded in the last 24 hours across active layers.', provenance: 'confirmed', to: '/radar' });

  const delta = tensionNow - tensionWeekAgo;
  const band = tensionBand(tensionNow);
  const direction = Math.abs(delta) < 1 ? 'broadly unchanged' : delta > 0 ? `up ${delta.toFixed(1)} points` : `down ${Math.abs(delta).toFixed(1)} points`;
  const tensionProv = weakest(...(events.length ? events.map((e) => e.provenance) : ['simulated' as Provenance]), 'simulated');

  const moverItems: BriefingItem[] = [...movers]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 3)
    .map((m) => ({ text: `${m.name}: ${pct(m.changePct)} on the latest session.`, provenance: 'simulated', to: `/markets?symbol=${encodeURIComponent(m.symbol)}` }));
  if (!moverItems.length) moverItems.push({ text: 'Your watchlist is empty. Add instruments to see movers here.', provenance: 'confirmed', to: '/markets' });

  const top = recent[0];
  const headline = top
    ? `${recent.length} event${recent.length === 1 ? '' : 's'} in the last 24 hours; most significant: ${top.title}.`
    : 'A quiet 24 hours across active layers.';

  return {
    date: new Date(now).toISOString().slice(0, 10),
    headline,
    sections: [
      { title: 'Events', items: eventItems },
      { title: 'Tension', items: [{ text: `World Tension Index at ${tensionNow.toFixed(1)} (${band.label.toLowerCase()}), ${direction} over 7 days.`, provenance: tensionProv, to: '/tension' }] },
      { title: 'Watchlist movers', items: moverItems },
    ],
  };
}
