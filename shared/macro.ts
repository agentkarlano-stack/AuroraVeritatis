/** Macro & FX series from the ECB Data Portal — catalogue, wire types and analytics. */

export type MacroGroup = 'fx' | 'policy' | 'inflation' | 'yields';

export interface MacroSeriesDef {
  /** Stable Aurora id used in URLs and the API. */
  id: string;
  /** ECB dataflow and series key, e.g. EXR / D.USD.EUR.SP00.A */
  flow: string;
  key: string;
  label: string;
  group: MacroGroup;
  unit: 'per EUR' | 'percent';
  frequency: 'daily' | 'business daily' | 'monthly';
}

const fx = (code: string, label: string): MacroSeriesDef => ({
  id: `EUR${code}`,
  flow: 'EXR',
  key: `D.${code}.EUR.SP00.A`,
  label,
  group: 'fx',
  unit: 'per EUR',
  frequency: 'daily',
});

export const MACRO_SERIES: readonly MacroSeriesDef[] = [
  fx('USD', 'US dollar'),
  fx('GBP', 'Pound sterling'),
  fx('JPY', 'Japanese yen'),
  fx('CHF', 'Swiss franc'),
  fx('CNY', 'Chinese yuan renminbi'),
  fx('SEK', 'Swedish krona'),
  fx('NOK', 'Norwegian krone'),
  fx('PLN', 'Polish zloty'),
  fx('HUF', 'Hungarian forint'),
  fx('CZK', 'Czech koruna'),
  fx('TRY', 'Turkish lira'),
  fx('INR', 'Indian rupee'),
  fx('BRL', 'Brazilian real'),
  fx('AUD', 'Australian dollar'),
  fx('CAD', 'Canadian dollar'),
  { id: 'ECB-DFR', flow: 'FM', key: 'B.U2.EUR.4F.KR.DFR.LEV', label: 'Deposit facility rate', group: 'policy', unit: 'percent', frequency: 'business daily' },
  { id: 'ECB-MRO', flow: 'FM', key: 'B.U2.EUR.4F.KR.MRR_FR.LEV', label: 'Main refinancing operations rate', group: 'policy', unit: 'percent', frequency: 'business daily' },
  { id: 'ECB-MLF', flow: 'FM', key: 'B.U2.EUR.4F.KR.MLFR.LEV', label: 'Marginal lending facility rate', group: 'policy', unit: 'percent', frequency: 'business daily' },
  { id: 'HICP', flow: 'ICP', key: 'M.U2.N.000000.4.ANR', label: 'HICP inflation, euro area (annual rate)', group: 'inflation', unit: 'percent', frequency: 'monthly' },
  { id: 'HICP-CORE', flow: 'ICP', key: 'M.U2.N.XEF000.4.ANR', label: 'Core HICP excl. energy, food, alcohol & tobacco', group: 'inflation', unit: 'percent', frequency: 'monthly' },
  { id: 'EA-10Y', flow: 'YC', key: 'B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y', label: 'Euro area 10-year yield (AAA-rated govt. bonds)', group: 'yields', unit: 'percent', frequency: 'business daily' },
];

export const MACRO_MAP = new Map(MACRO_SERIES.map((s) => [s.id, s]));

export interface MacroObs {
  /** YYYY-MM-DD, or YYYY-MM for monthly series */
  date: string;
  value: number;
}

export interface MacroSeries {
  id: string;
  /** Oldest first. */
  obs: MacroObs[];
}

export interface MacroResponse {
  series: MacroSeries[];
  /** Requested ids for which the ECB returned no observations. */
  missing: string[];
  source: { name: string; url: string; license: string };
  fetchedAt: string;
}

export const ECB_SOURCE = {
  name: 'Source: ECB statistics (European Central Bank Data Portal)',
  url: 'https://data.ecb.europa.eu/',
  license: 'ECB reuse policy: free reuse with the source quoted. Cross rates and changes are computed by Aurora Veritatis.',
} as const;

/** ECB inflation target (symmetric, medium term). */
export const ECB_TARGET = 2;

/** Comparable day number for YYYY-MM-DD or YYYY-MM (month → first day). */
function dayOf(date: string): number {
  return Date.parse(date.length === 7 ? `${date}-01` : date) / 86_400_000;
}

/** Latest observation at or before `days` days before the last one (null if history is too short). */
export function valueDaysAgo(obs: MacroObs[], days: number): MacroObs | null {
  const last = obs.at(-1);
  if (!last) return null;
  const target = dayOf(last.date) - days;
  for (let i = obs.length - 1; i >= 0; i--) if (dayOf(obs[i]!.date) <= target) return obs[i]!;
  return null;
}

export interface MacroSummary {
  latest: MacroObs;
  previous: MacroObs | null;
  /** Relative change for FX (fraction), absolute change in percentage points for rates. */
  change1: number | null;
  change30: number | null;
  change365: number | null;
}

export function summariseMacro(def: MacroSeriesDef, obs: MacroObs[]): MacroSummary | null {
  const latest = obs.at(-1);
  if (!latest) return null;
  const diff = (o: MacroObs | null) => (o == null ? null : def.unit === 'per EUR' ? latest.value / o.value - 1 : latest.value - o.value);
  const previous = obs.at(-2) ?? null;
  return { latest, previous, change1: diff(previous), change30: diff(valueDaysAgo(obs, 30)), change365: diff(valueDaysAgo(obs, 365)) };
}

/**
 * Re-express EUR reference rates against another base currency: X per BASE = (X per EUR) / (BASE per EUR),
 * matched on dates both series have. The euro itself becomes EUR per BASE = 1 / (BASE per EUR).
 */
export function crossRates(target: MacroObs[] | 'EUR', base: MacroObs[]): MacroObs[] {
  const baseBy = new Map(base.map((o) => [o.date, o.value]));
  if (target === 'EUR') return base.filter((o) => o.value > 0).map((o) => ({ date: o.date, value: 1 / o.value }));
  return target.flatMap((o) => {
    const b = baseBy.get(o.date);
    return b && b > 0 ? [{ date: o.date, value: o.value / b }] : [];
  });
}

/** Date of the most recent change in level (for policy rates), or null if the level never changed. */
export function lastChange(obs: MacroObs[]): { date: string; from: number; to: number } | null {
  for (let i = obs.length - 1; i > 0; i--) {
    if (obs[i]!.value !== obs[i - 1]!.value) return { date: obs[i]!.date, from: obs[i - 1]!.value, to: obs[i]!.value };
  }
  return null;
}

/** CSV with a sourced header. */
export function macroCsv(def: MacroSeriesDef, obs: MacroObs[], note = ''): string {
  return [
    `# ${def.label} (${def.unit}, ${def.frequency}) — ${ECB_SOURCE.name}, series ${def.flow}.${def.key}${note ? ` — ${note}` : ''}`,
    'date,value',
    ...obs.map((o) => `${o.date},${o.value}`),
  ].join('\n');
}
