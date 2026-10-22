import type { GeoEvent } from '../../shared/types';

/**
 * Brain risk scale. Risk (how severe a node's situation is) is kept separate from relevance (how much the node matters to
 * the user's own research), and a risk is either assigned automatically by a named, documented method or set by the
 * user. A user assessment is stored next to the automatic one and never overwrites it, so source facts stay intact.
 */
export const RISK_LEVELS = {
  low: { label: 'Low', color: '#5fa37c', description: 'No material disruption indicated.' },
  elevated: { label: 'Elevated', color: '#d6bf4f', description: 'Some disruption or a situation worth monitoring.' },
  significant: { label: 'Significant', color: '#d98b3a', description: 'Material disruption with likely regional effects.' },
  severe: { label: 'Severe', color: '#cc4b3f', description: 'Major disruption; wide or lasting effects likely.' },
  critical: { label: 'Critical', color: '#8e2620', description: 'Extreme severity; international response or systemic effects likely.' },
  unknown: { label: 'Insufficient or outdated data', color: '#77746d', description: 'No documented assessment, or the assessment is too old to rely on.' },
} as const;
export type RiskLevel = keyof typeof RISK_LEVELS;
export const RISK_ORDER: RiskLevel[] = ['low', 'elevated', 'significant', 'severe', 'critical', 'unknown'];

/** Relevance to the user's research (1 = peripheral, 5 = central). Purely the user's own judgement. */
export const RELEVANCE = { 1: 'Peripheral', 2: 'Minor', 3: 'Relevant', 4: 'Important', 5: 'Central' } as const;
export type Relevance = keyof typeof RELEVANCE;

export interface RiskMethod {
  id: string;
  name: string;
  /** Plain-language description of how the level is derived. */
  rule: string;
  source: string;
  sourceUrl: string;
  /** After this many days without a refresh the assessment is shown as outdated (grey). Null: it does not expire. */
  validDays: number | null;
}

/** Every automatic assessment names one of these methods. Adding a method changes the methodology; document it here. */
export const RISK_METHODS: Record<string, RiskMethod> = {
  'usgs-magnitude': {
    id: 'usgs-magnitude',
    name: 'Earthquake magnitude band',
    rule: 'USGS moment magnitude: below 5.5 low, 5.5 to 5.9 elevated, 6.0 to 6.4 significant, 6.5 to 6.9 severe, 7.0 and above critical. Magnitude measures the event, not its local impact.',
    source: 'USGS Earthquake Hazards Program',
    sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/',
    validDays: null,
  },
  'gdacs-alert': {
    id: 'gdacs-alert',
    name: 'GDACS alert level',
    rule: 'GDACS modelled humanitarian impact: Green low, Orange significant, Red critical. GDACS revises alerts while an event develops, so the assessment is shown as outdated after 14 days without a refresh.',
    source: 'Global Disaster Alert and Coordination System (GDACS)',
    sourceUrl: 'https://www.gdacs.org/',
    validDays: 14,
  },
};

export interface NodeRisk {
  level: RiskLevel;
  origin: 'auto' | 'user';
  /** Required for automatic assessments: a key of RISK_METHODS. */
  method?: string;
  /** What the assessment was derived from, e.g. "GDACS Orange alert" or the user's own reasoning. */
  basis?: string;
  /** YYYY-MM-DD the assessment refers to (automatic) or was made (user). */
  asOf: string;
}

const SEVERITY_LEVEL: Record<GeoEvent['severity'], RiskLevel> = { 1: 'low', 2: 'elevated', 3: 'significant', 4: 'severe', 5: 'critical' };

/**
 * Automatic risk for a Radar event, only where a documented method exists (USGS earthquakes, GDACS alerts). Simulated
 * scenarios and events from other feeds get no automatic level.
 */
export function riskFromEvent(e: Pick<GeoEvent, 'id' | 'severity' | 'time' | 'provenance' | 'summary'>, today: string): NodeRisk | undefined {
  if (e.provenance === 'simulated') return undefined;
  if (e.id.startsWith('usgs-')) {
    const mag = /Magnitude (\d+(?:\.\d+)?)/.exec(e.summary)?.[1];
    return { level: SEVERITY_LEVEL[e.severity], origin: 'auto', method: 'usgs-magnitude', basis: mag ? `Magnitude ${mag}` : `Severity band ${e.severity}`, asOf: e.time.slice(0, 10) };
  }
  if (e.id.startsWith('gdacs-')) {
    const alert = e.severity >= 5 ? 'Red' : e.severity >= 3 ? 'Orange' : 'Green';
    return { level: SEVERITY_LEVEL[e.severity], origin: 'auto', method: 'gdacs-alert', basis: `GDACS ${alert} alert`, asOf: today };
  }
  return undefined;
}

const DAY = 86_400_000;

export interface EffectiveRisk {
  level: RiskLevel;
  /** Which assessment is shown. */
  from: 'user' | 'auto' | 'none';
  outdated: boolean;
  risk?: NodeRisk;
  method?: RiskMethod;
}

/**
 * The risk a node is drawn with: the user's override when present, otherwise the automatic assessment, otherwise
 * unknown. An automatic assessment older than its method's validity is shown as outdated (grey).
 */
export function effectiveRisk(node: { risk?: NodeRisk; autoRisk?: NodeRisk }, today: string): EffectiveRisk {
  if (node.risk) return { level: node.risk.level, from: 'user', outdated: false, risk: node.risk };
  const a = node.autoRisk;
  const method = a?.method ? RISK_METHODS[a.method] : undefined;
  if (!a || !method) return { level: 'unknown', from: 'none', outdated: false };
  const age = (Date.parse(today) - Date.parse(a.asOf)) / DAY;
  const outdated = method.validDays !== null && age > method.validDays;
  return { level: outdated ? 'unknown' : a.level, from: 'auto', outdated, risk: a, method };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict parsing for imports: unknown levels, undocumented automatic methods and bad dates are dropped. */
export function parseRisk(v: unknown, origin: NodeRisk['origin']): NodeRisk | undefined {
  const r = v as Record<string, unknown> | undefined;
  if (!r || typeof r !== 'object' || typeof r.level !== 'string' || !(r.level in RISK_LEVELS)) return undefined;
  if (typeof r.asOf !== 'string' || !DATE.test(r.asOf)) return undefined;
  if (origin === 'auto' && (typeof r.method !== 'string' || !(r.method in RISK_METHODS))) return undefined;
  const basis = typeof r.basis === 'string' ? r.basis.slice(0, 300).trim() : '';
  return { level: r.level as RiskLevel, origin, asOf: r.asOf, ...(origin === 'auto' ? { method: r.method as string } : {}), ...(basis ? { basis } : {}) };
}

export function parseRelevance(v: unknown): Relevance | undefined {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : undefined;
}

export function riskSummary(r: EffectiveRisk): string {
  const level = RISK_LEVELS[r.level].label;
  if (r.from === 'user') return `${level} (your assessment, ${r.risk!.asOf})`;
  if (r.from === 'auto') return r.outdated ? `Outdated: ${RISK_LEVELS[r.risk!.level].label} per ${r.method!.name}, ${r.risk!.asOf}` : `${level} per ${r.method!.name} (${r.method!.source}, ${r.risk!.asOf})`;
  return level;
}
