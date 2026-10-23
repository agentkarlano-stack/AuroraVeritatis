/**
 * Commodity & Energy Monitor: pure analytics on World Bank monthly average prices (public/data/commodities.json,
 * built by scripts/commodities/convert.py). Everything here is historical statistics on published monthly averages;
 * nothing is a forecast or a live price.
 */

export interface CommoditySeries {
  id: string;
  name: string;
  group: string;
  benchmark: string;
  unit: string;
  /** One value per month from `start`, null where the publisher has no value. */
  values: (number | null)[];
}

export interface CommodityData {
  source: { name: string; url: string; file: string; license: string; attribution: string };
  kind: string;
  publisherUpdated: string;
  converted: string;
  start: string; // YYYY-MM
  end: string;
  series: CommoditySeries[];
}

export const GROUPS = ['Energy', 'Precious metals', 'Base metals and ores', 'Agriculture', 'Fertilisers'] as const;

/** Ids and names of the shipped series (mirrors scripts/commodities/convert.py; a test checks the snapshot matches). */
export const COMMODITY_OPTIONS: { id: string; name: string }[] = [
  ['brent', 'Crude oil, Brent'], ['wti', 'Crude oil, WTI'], ['dubai', 'Crude oil, Dubai'], ['gas-us', 'Natural gas, United States'], ['gas-eu', 'Natural gas, Europe'],
  ['lng-japan', 'LNG, Japan'], ['coal-au', 'Coal, Australia'], ['gold', 'Gold'], ['silver', 'Silver'], ['platinum', 'Platinum'], ['copper', 'Copper'],
  ['aluminium', 'Aluminium'], ['nickel', 'Nickel'], ['zinc', 'Zinc'], ['lead', 'Lead'], ['tin', 'Tin'], ['iron-ore', 'Iron ore'], ['wheat', 'Wheat'],
  ['maize', 'Maize (corn)'], ['soybeans', 'Soybeans'], ['rice', 'Rice'], ['palm-oil', 'Palm oil'], ['sugar', 'Sugar'], ['coffee', 'Coffee, Arabica'],
  ['cocoa', 'Cocoa'], ['cotton', 'Cotton'], ['urea', 'Urea (fertiliser)'], ['dap', 'Diammonium phosphate (fertiliser)'],
].map(([id, name]) => ({ id: id!, name: name! }));
export const COMMODITY_DATA_PATH = '/data/commodities.json';

/** YYYY-MM of the i-th month after `start`. */
export function monthAt(start: string, i: number): string {
  const [y, m] = start.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) + i;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Index of the last month with a value, or -1. */
export function lastIndex(values: (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return i;
  return -1;
}

/** Percentage change over `months` months ending at the last value; null when either end is missing. */
export function change(values: (number | null)[], months: number): number | null {
  const i = lastIndex(values);
  const a = i - months >= 0 ? values[i - months] : null;
  const b = i >= 0 ? values[i] : null;
  return a != null && b != null && a !== 0 ? (b / a - 1) * 100 : null;
}

/** Monthly log returns over the last `months` months (consecutive pairs only). */
export function logReturns(values: (number | null)[], months: number): number[] {
  const i = lastIndex(values);
  const out: number[] = [];
  for (let k = Math.max(1, i - months + 1); k <= i; k++) {
    const a = values[k - 1];
    const b = values[k];
    if (a != null && b != null && a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

/** Annualised volatility (%) of monthly log returns: sample standard deviation × √12. Null with fewer than 6 returns. */
export function volatility(values: (number | null)[], months = 12): number | null {
  const r = logReturns(values, months);
  if (r.length < 6) return null;
  const mean = r.reduce((s, v) => s + v, 0) / r.length;
  const variance = r.reduce((s, v) => s + (v - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12) * 100;
}

/** Where the last value sits within the last `months` months: 0 = lowest, 100 = highest (share of months at or below). */
export function percentile(values: (number | null)[], months = 120): number | null {
  const i = lastIndex(values);
  if (i < 0) return null;
  const window = values.slice(Math.max(0, i - months + 1), i + 1).filter((v): v is number => v != null);
  if (window.length < 12) return null;
  const last = values[i]!;
  return (window.filter((v) => v <= last).length / window.length) * 100;
}

/** Values over the last `months` months rebased to 100 at the first available value (for comparing commodities). */
export function rebased(values: (number | null)[], start: string, months: number): { date: string; value: number | null }[] {
  const i = lastIndex(values);
  const from = Math.max(0, i - months + 1);
  const base = values.slice(from, i + 1).find((v): v is number => v != null);
  return values.slice(from, i + 1).map((v, k) => ({ date: monthAt(start, from + k), value: v != null && base ? (v / base) * 100 : null }));
}

/** Pearson correlation of two monthly return series over the last `months` months (paired months only). */
export function correlation(a: (number | null)[], b: (number | null)[], months = 60): number | null {
  const end = Math.min(lastIndex(a), lastIndex(b));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = Math.max(1, end - months + 1); k <= end; k++) {
    const [a0, a1, b0, b1] = [a[k - 1], a[k], b[k - 1], b[k]];
    if (a0 && a1 && b0 && b1 && a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) {
      xs.push(Math.log(a1 / a0));
      ys.push(Math.log(b1 / b0));
    }
  }
  if (xs.length < 12) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, k) => {
    sxy += (x - mx) * (ys[k]! - my);
    sxx += (x - mx) ** 2;
    syy += (ys[k]! - my) ** 2;
  });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** CSV of the chosen series (one column each), for export. */
export function toCsv(data: CommodityData, ids: string[]): string {
  const chosen = data.series.filter((s) => ids.includes(s.id));
  const n = Math.max(0, ...chosen.map((s) => s.values.length));
  const head = ['month', ...chosen.map((s) => `"${s.name} (${s.unit})"`)].join(',');
  const rows = Array.from({ length: n }, (_, i) => [monthAt(data.start, i), ...chosen.map((s) => s.values[i] ?? '')].join(','));
  return `# ${data.source.attribution}. ${data.kind}. Publisher update: ${data.publisherUpdated}.\n${head}\n${rows.join('\n')}\n`;
}

/** CFTC Commitments of Traders markets related to a commodity (Positioning page codes). */
export const COT_LINKS: Record<string, string> = { wti: '067651', brent: '067651', 'gas-us': '023651', gold: '088691', silver: '084691', copper: '085692', wheat: '001602', maize: '002602', soybeans: '005602' };
