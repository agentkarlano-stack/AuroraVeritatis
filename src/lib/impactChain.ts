/**
 * Market Impact chain on real data: event → country → the country's commodity exposure (World Bank WDI) → monthly
 * commodity prices before and after the event (World Bank Pink Sheet). Every step is a documented rule or a historical
 * statistic. Nothing here predicts prices or claims that an event caused a price move.
 */
import { monthAt } from './commodities';

export type ExposureKind = 'exporter' | 'importer' | 'rents';

export interface ExposureRule {
  id: string;
  indicator: string;
  /** Exposure when the latest value is at or above this (percent). */
  threshold: number;
  kind: ExposureKind;
  label: string;
  /** What the indicator measures, completed with the value and year. */
  measure: string;
  /** Pink Sheet series ids that the exposure relates to. */
  commodities: string[];
}

export const EXPOSURE_RULES: ExposureRule[] = [
  { id: 'fuel-exports', indicator: 'TX.VAL.FUEL.ZS.UN', threshold: 20, kind: 'exporter', label: 'Fuel exporter', measure: 'of merchandise exports are fuels', commodities: ['brent', 'dubai', 'gas-eu', 'lng-japan', 'coal-au'] },
  { id: 'oil-rents', indicator: 'NY.GDP.PETR.RT.ZS', threshold: 5, kind: 'rents', label: 'Oil-dependent economy', measure: 'of GDP comes from oil rents', commodities: ['brent', 'wti', 'dubai'] },
  { id: 'gas-rents', indicator: 'NY.GDP.NGAS.RT.ZS', threshold: 1, kind: 'rents', label: 'Gas producer', measure: 'of GDP comes from natural gas rents', commodities: ['gas-eu', 'gas-us', 'lng-japan'] },
  { id: 'metals-exports', indicator: 'TX.VAL.MMTL.ZS.UN', threshold: 15, kind: 'exporter', label: 'Metals and ores exporter', measure: 'of merchandise exports are ores and metals', commodities: ['copper', 'aluminium', 'iron-ore', 'nickel', 'zinc', 'tin'] },
  { id: 'mineral-rents', indicator: 'NY.GDP.MINR.RT.ZS', threshold: 2, kind: 'rents', label: 'Mining economy', measure: 'of GDP comes from mineral rents', commodities: ['copper', 'iron-ore', 'gold', 'nickel'] },
  { id: 'food-exports', indicator: 'TX.VAL.FOOD.ZS.UN', threshold: 20, kind: 'exporter', label: 'Food exporter', measure: 'of merchandise exports are food', commodities: ['wheat', 'maize', 'soybeans', 'rice', 'palm-oil', 'sugar', 'coffee', 'cocoa'] },
  { id: 'fuel-imports', indicator: 'TM.VAL.FUEL.ZS.UN', threshold: 15, kind: 'importer', label: 'Fuel importer', measure: 'of merchandise imports are fuels', commodities: ['brent', 'gas-eu', 'lng-japan'] },
  { id: 'energy-imports', indicator: 'EG.IMP.CONS.ZS', threshold: 50, kind: 'importer', label: 'Energy import dependent', measure: 'of energy use is covered by net imports', commodities: ['brent', 'gas-eu', 'lng-japan', 'coal-au'] },
];

export const EXPOSURE_INDICATORS = [...new Set(EXPOSURE_RULES.map((r) => r.indicator))];

export interface IndicatorValue {
  value: number;
  year: number;
}

export interface Exposure {
  rule: ExposureRule;
  value: number;
  year: number;
}

/** Applies the rules to one country's latest values (indicator id → value). Missing values never create an exposure. */
export function exposuresFor(values: Record<string, IndicatorValue | undefined>): Exposure[] {
  const out: Exposure[] = [];
  for (const rule of EXPOSURE_RULES) {
    const v = values[rule.indicator];
    if (v && Number.isFinite(v.value) && v.value >= rule.threshold) out.push({ rule, value: v.value, year: v.year });
  }
  return out;
}

/** Commodities linked by the exposures, in rule order, each with the rules that link it. */
export function linkedCommodities(exposures: Exposure[]): { id: string; via: string[] }[] {
  const map = new Map<string, string[]>();
  for (const e of exposures) for (const id of e.rule.commodities) map.set(id, [...(map.get(id) ?? []), e.rule.label]);
  return [...map].map(([id, via]) => ({ id, via }));
}

export interface WindowPoint {
  month: string;
  /** Change from the base month, percent. */
  change: number;
  /** ln(price / base) ÷ (σ_monthly × √n); |z| ≥ 2 is unusual. Null without enough history. */
  z: number | null;
}

export interface BeforeAfter {
  eventMonth: string;
  baseMonth: string;
  base: number | null;
  points: WindowPoint[];
  /** True when the event month has not been published yet (monthly averages appear after the month ends). */
  pending: boolean;
}

/** Month index of `yyyyMm` in a series starting at `start`. */
export function monthIndex(start: string, yyyyMm: string): number {
  const [y0, m0] = start.split('-').map(Number) as [number, number];
  const [y, m] = yyyyMm.split('-').map(Number) as [number, number];
  return (y - y0) * 12 + (m - m0);
}

/**
 * Monthly prices around an event: the month before the event is the base; the event month and up to `after` - 1
 * following months are compared with it. σ is the standard deviation of monthly log returns over the `history` months
 * before the base month.
 */
export function beforeAfter(values: (number | null)[], start: string, eventDate: string, after = 3, history = 36): BeforeAfter {
  const eventMonth = eventDate.slice(0, 7);
  const m = monthIndex(start, eventMonth);
  const baseIdx = m - 1;
  const baseMonth = monthAt(start, baseIdx);
  const base = baseIdx >= 0 && baseIdx < values.length ? (values[baseIdx] ?? null) : null;
  const r: number[] = [];
  for (let k = Math.max(1, baseIdx - history + 1); k <= baseIdx && k < values.length; k++) {
    const a = values[k - 1];
    const b = values[k];
    if (a != null && b != null && a > 0 && b > 0) r.push(Math.log(b / a));
  }
  let sigma: number | null = null;
  if (r.length >= 12) {
    const mean = r.reduce((s, v) => s + v, 0) / r.length;
    sigma = Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / (r.length - 1));
  }
  const points: WindowPoint[] = [];
  if (base != null && base > 0) {
    for (let n = 1; n <= after; n++) {
      const v = values[baseIdx + n];
      if (v == null || v <= 0) break;
      points.push({ month: monthAt(start, baseIdx + n), change: (v / base - 1) * 100, z: sigma ? Math.log(v / base) / (sigma * Math.sqrt(n)) : null });
    }
  }
  return { eventMonth, baseMonth, base, points, pending: m >= values.length || values[m] == null };
}
