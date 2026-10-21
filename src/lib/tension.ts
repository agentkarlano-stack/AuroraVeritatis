import type { EventCategory, GeoEvent } from '../../shared/types';

export type ComponentKey = 'conflict' | 'security' | 'political' | 'energy' | 'humanitarian' | 'markets';

export interface ComponentDef {
  key: ComponentKey;
  label: string;
  /** Default weight before normalisation. */
  weight: number;
  /** Event categories feeding the component (none for the market-based component). */
  categories: EventCategory[];
  /** Saturation constant k in 100·(1 − e^(−x/k)); larger k = slower to saturate. */
  saturation: number;
  explanation: string;
}

/** The full, published definition of the prototype index. Changing it changes the methodology. */
export const TENSION_COMPONENTS: readonly ComponentDef[] = [
  { key: 'conflict', label: 'Conflict intensity', weight: 0.3, categories: ['conflict'], saturation: 8, explanation: 'Severity-weighted count of armed-conflict events.' },
  { key: 'security', label: 'Security escalation', weight: 0.2, categories: ['security'], saturation: 10, explanation: 'Severity-weighted security incidents.' },
  { key: 'political', label: 'Political & diplomatic crises', weight: 0.15, categories: ['political'], saturation: 8, explanation: 'Contested elections, expulsions, unrest.' },
  { key: 'energy', label: 'Energy supply disruption', weight: 0.15, categories: ['energy'], saturation: 8, explanation: 'Outages and chokepoint disruptions.' },
  { key: 'humanitarian', label: 'Humanitarian stress', weight: 0.1, categories: ['humanitarian', 'natural-disaster'], saturation: 12, explanation: 'Humanitarian emergencies and major disasters.' },
  { key: 'markets', label: 'Financial stress', weight: 0.1, categories: [], saturation: 0, explanation: 'Annualised volatility of the global equity proxy; 40% maps to 100.' },
];

export type Weights = Record<ComponentKey, number>;

export const DEFAULT_WEIGHTS: Weights = Object.fromEntries(TENSION_COMPONENTS.map((c) => [c.key, c.weight])) as Weights;

export interface TensionComponent {
  key: ComponentKey;
  label: string;
  /** Normalised weight (all weights sum to 1). */
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

const DAY = 86_400_000;

/** Weights scaled to sum to 1. Negative values count as 0; all-zero falls back to the defaults. */
export function normaliseWeights(w: Partial<Weights> = {}): Weights {
  const merged = { ...DEFAULT_WEIGHTS, ...w };
  const clean = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, Math.max(0, Number.isFinite(v) ? v : 0)])) as Weights;
  const sum = Object.values(clean).reduce((s, v) => s + v, 0);
  if (sum === 0) return normaliseWeights();
  return Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, v / sum])) as Weights;
}

/** Sum of severities for the given categories, mapped to 0–100 via a saturating curve. */
function pressure(events: GeoEvent[], cats: EventCategory[], saturation: number): number {
  const sum = events.filter((e) => cats.includes(e.category)).reduce((s, e) => s + e.severity, 0);
  return 100 * (1 - Math.exp(-sum / saturation));
}

/**
 * PROTOTYPE World Tension Index. The formula is deliberately simple and fully disclosed:
 * index = Σ wᵢ·cᵢ with Σ wᵢ = 1; event components cᵢ = 100·(1 − e^(−xᵢ/kᵢ)) where xᵢ is the severity-weighted
 * event count in the window; the market component maps annualised volatility linearly (40% → 100).
 * It is a methodological sketch, not a validated or scientifically established measure.
 */
export function worldTension(events: GeoEvent[], marketVol: number, now = Date.now(), windowDays = 14, weights?: Partial<Weights>): TensionResult {
  const w = normaliseWeights(weights);
  const recent = events.filter((e) => {
    const age = now - Date.parse(e.time);
    return age >= 0 && age <= windowDays * DAY;
  });
  const components: TensionComponent[] = TENSION_COMPONENTS.map((c) => ({
    key: c.key,
    label: c.label,
    weight: w[c.key],
    score: c.key === 'markets' ? Math.min(100, Math.max(0, (marketVol / 0.4) * 100)) : pressure(recent, c.categories, c.saturation),
    explanation: c.explanation,
  }));
  const value = components.reduce((s, c) => s + c.weight * c.score, 0);
  return { value, components, eventsConsidered: recent.length, windowDays };
}

export interface TensionPoint {
  /** YYYY-MM-DD (UTC) */
  date: string;
  value: number;
}

/**
 * Daily index history: for each of the last `days` days, the index over the window ending that day.
 * `volOn(date)` supplies the market component's volatility for that day.
 */
export function tensionHistory(events: GeoEvent[], volOn: (date: string) => number, days: number, now = Date.now(), windowDays = 14, weights?: Partial<Weights>): TensionPoint[] {
  const out: TensionPoint[] = [];
  const end = new Date(now);
  for (let i = days - 1; i >= 0; i--) {
    const dayEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - i, 23, 59, 59);
    const date = new Date(dayEnd).toISOString().slice(0, 10);
    out.push({ date, value: worldTension(events, volOn(date), Math.min(dayEnd, now), windowDays, weights).value });
  }
  return out;
}

export interface Sensitivity {
  base: number;
  equalWeights: number;
  /** Index when each component's weight is halved / doubled (others re-normalised). */
  perComponent: { key: ComponentKey; label: string; halved: number; doubled: number }[];
  /** Smallest and largest index across all perturbations above. */
  range: [number, number];
}

/** How much the index depends on the weighting choices — a robustness check published with the index. */
export function weightSensitivity(events: GeoEvent[], marketVol: number, now = Date.now(), windowDays = 14, weights?: Partial<Weights>): Sensitivity {
  const w = normaliseWeights(weights);
  const at = (ws: Partial<Weights>) => worldTension(events, marketVol, now, windowDays, ws).value;
  const base = at(w);
  const equalWeights = at(Object.fromEntries(TENSION_COMPONENTS.map((c) => [c.key, 1])) as Weights);
  const perComponent = TENSION_COMPONENTS.map((c) => ({
    key: c.key,
    label: c.label,
    halved: at({ ...w, [c.key]: w[c.key] / 2 }),
    doubled: at({ ...w, [c.key]: w[c.key] * 2 }),
  }));
  const all = [base, equalWeights, ...perComponent.flatMap((p) => [p.halved, p.doubled])];
  return { base, equalWeights, perComponent, range: [Math.min(...all), Math.max(...all)] };
}

export function tensionBand(v: number): { label: string; tone: 'low' | 'moderate' | 'elevated' | 'high' } {
  if (v < 25) return { label: 'Low', tone: 'low' };
  if (v < 50) return { label: 'Moderate', tone: 'moderate' };
  if (v < 70) return { label: 'Elevated', tone: 'elevated' };
  return { label: 'High', tone: 'high' };
}
