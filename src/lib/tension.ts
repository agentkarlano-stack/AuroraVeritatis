import type { GeoEvent } from '../../shared/types';

export interface TensionComponent {
  key: string;
  label: string;
  weight: number;
  /** 0–100 after normalisation. */
  score: number;
  explanation: string;
}

export interface TensionResult {
  value: number;
  components: TensionComponent[];
  eventsConsidered: number;
  windowDays: number;
}

/** Sum of severities within the window for the given categories, mapped to 0–100 via a saturating curve. */
function pressure(events: GeoEvent[], cats: GeoEvent['category'][], saturation: number): number {
  const sum = events.filter((e) => cats.includes(e.category)).reduce((s, e) => s + e.severity, 0);
  return 100 * (1 - Math.exp(-sum / saturation));
}

/**
 * PROTOTYPE World Tension Index. The formula is deliberately simple and fully disclosed:
 * index = Σ weight_i · component_i, each component scaled 0–100 by 100·(1 − e^(−x/k)).
 * It is a methodological sketch, not a validated or scientifically established measure.
 */
export function worldTension(events: GeoEvent[], marketVol: number, now = Date.now(), windowDays = 14): TensionResult {
  const recent = events.filter((e) => now - Date.parse(e.time) <= windowDays * 86_400_000);
  const components: TensionComponent[] = [
    { key: 'conflict', label: 'Conflict intensity', weight: 0.3, score: pressure(recent, ['conflict'], 8), explanation: 'Severity-weighted count of armed-conflict events.' },
    { key: 'security', label: 'Security escalation', weight: 0.2, score: pressure(recent, ['security'], 10), explanation: 'Severity-weighted security incidents.' },
    { key: 'political', label: 'Political & diplomatic crises', weight: 0.15, score: pressure(recent, ['political'], 8), explanation: 'Contested elections, expulsions, unrest.' },
    { key: 'energy', label: 'Energy supply disruption', weight: 0.15, score: pressure(recent, ['energy'], 8), explanation: 'Outages and chokepoint disruptions.' },
    { key: 'humanitarian', label: 'Humanitarian stress', weight: 0.1, score: pressure(recent, ['humanitarian', 'natural-disaster'], 12), explanation: 'Humanitarian emergencies and major disasters.' },
    { key: 'markets', label: 'Financial stress', weight: 0.1, score: Math.min(100, (marketVol / 0.4) * 100), explanation: 'Annualised volatility of the global equity proxy; 40% maps to 100.' },
  ];
  const value = components.reduce((s, c) => s + c.weight * c.score, 0);
  return { value, components, eventsConsidered: recent.length, windowDays };
}

export function tensionBand(v: number): { label: string; tone: 'low' | 'moderate' | 'elevated' | 'high' } {
  if (v < 25) return { label: 'Low', tone: 'low' };
  if (v < 50) return { label: 'Moderate', tone: 'moderate' };
  if (v < 70) return { label: 'Elevated', tone: 'elevated' };
  return { label: 'High', tone: 'high' };
}
