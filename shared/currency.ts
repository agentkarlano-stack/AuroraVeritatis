import type { SourceRef } from './types';

/**
 * Currency & Purchasing Power Intelligence: annual World Bank series per economy and the pure formulas behind every
 * chart and calculator on /currency. All values are official statistics; nothing here is estimated or simulated.
 */

export const CURRENCY_INDICATORS = {
  cpi: { id: 'FP.CPI.TOTL', label: 'Consumer price index (2010 = 100)' },
  inflation: { id: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual %)' },
  fx: { id: 'PA.NUS.FCRF', label: 'Official exchange rate (local currency per US$, period average)' },
  ppp: { id: 'PA.NUS.PPP', label: 'PPP conversion factor, GDP (local currency per international $)' },
} as const;
export type CurrencySeriesKey = keyof typeof CURRENCY_INDICATORS;

export interface YearValue {
  year: number;
  value: number;
}

export interface CurrencyProfile {
  iso3: string;
  name: string;
  /** Oldest first; years without data are omitted. */
  series: Record<CurrencySeriesKey, YearValue[]>;
  source: SourceRef;
  fetchedAt: string;
}

/** ISO 4217 code of the currency in which each economy's World Bank local-currency series are reported (current unit). */
export const CURRENCY_OF: Record<string, string> = {
  AUT: 'EUR', BEL: 'EUR', DEU: 'EUR', ESP: 'EUR', FIN: 'EUR', FRA: 'EUR', GRC: 'EUR', IRL: 'EUR', ITA: 'EUR', NLD: 'EUR', PRT: 'EUR',
  HRV: 'EUR', SVK: 'EUR', SVN: 'EUR', EST: 'EUR', LVA: 'EUR', LTU: 'EUR', LUX: 'EUR',
  USA: 'USD', GBR: 'GBP', JPN: 'JPY', CHE: 'CHF', CHN: 'CNY', SWE: 'SEK', NOR: 'NOK', DNK: 'DKK', POL: 'PLN', HUN: 'HUF', CZE: 'CZK',
  ROU: 'RON', BGR: 'BGN', TUR: 'TRY', IND: 'INR', BRA: 'BRL', AUS: 'AUD', CAN: 'CAD', MEX: 'MXN', KOR: 'KRW', ZAF: 'ZAR', RUS: 'RUB',
  UKR: 'UAH', ARG: 'ARS', IDN: 'IDR', SAU: 'SAR', NGA: 'NGN', EGY: 'EGP', ISR: 'ILS', SGP: 'SGD', NZL: 'NZD', THA: 'THB',
};

/** Economies offered by default in the country picker (the API accepts any World Bank economy). */
export const DEFAULT_COUNTRIES = ['AUT', 'USA', 'GBR', 'JPN'];

const at = (s: YearValue[], year: number) => s.find((p) => p.year === year)?.value;

/**
 * Purchasing Power Index: what one unit of the currency buys at home, relative to the base year (100).
 * PPI_t = 100 × CPI_base / CPI_t. Empty when the base year has no CPI.
 */
export function purchasingPowerIndex(cpi: YearValue[], baseYear: number): YearValue[] {
  const base = at(cpi, baseYear);
  if (!base) return [];
  return cpi.filter((p) => p.value > 0).map((p) => ({ year: p.year, value: (100 * base) / p.value }));
}

/** An amount from `fromYear` expressed in `toYear` prices: amount × CPI_to / CPI_from. Null without both CPI values. */
export function realValue(amount: number, cpi: YearValue[], fromYear: number, toYear: number): number | null {
  const from = at(cpi, fromYear);
  const to = at(cpi, toYear);
  if (!from || !to || !Number.isFinite(amount)) return null;
  return (amount * to) / from;
}

/** Cumulative and annualised inflation between two years (fractions, e.g. 0.25 = 25 %). */
export function inflationBetween(cpi: YearValue[], fromYear: number, toYear: number): { cumulative: number; annualised: number } | null {
  const from = at(cpi, fromYear);
  const to = at(cpi, toYear);
  if (!from || !to || fromYear === toYear) return null;
  const ratio = to / from;
  return { cumulative: ratio - 1, annualised: ratio ** (1 / (toYear - fromYear)) - 1 };
}

/**
 * External value of the currency against the US dollar, indexed to the base year (100): 100 × FX_base / FX_t, where FX
 * is local currency per US$. Below 100 means the currency buys fewer dollars than in the base year (depreciation).
 */
export function externalValueIndex(fx: YearValue[], baseYear: number): YearValue[] {
  const base = at(fx, baseYear);
  if (!base) return [];
  return fx.filter((p) => p.value > 0).map((p) => ({ year: p.year, value: (100 * base) / p.value }));
}

/**
 * Market exchange rate against PPP: PPP factor / market rate − 1 (fraction). Negative: local prices are lower than
 * US prices at market rates (currency undervalued against the dollar in PPP terms); positive: overvalued.
 */
export function pppGap(fx: YearValue[], ppp: YearValue[]): YearValue[] {
  const out: YearValue[] = [];
  for (const p of ppp) {
    const m = at(fx, p.year);
    if (m && m > 0 && p.value > 0) out.push({ year: p.year, value: p.value / m - 1 });
  }
  return out;
}

/** Annual inflation of `a` minus `b`, in percentage points, for years both report. */
export function inflationDifferential(a: YearValue[], b: YearValue[]): YearValue[] {
  const out: YearValue[] = [];
  for (const p of a) {
    const q = at(b, p.year);
    if (q !== undefined) out.push({ year: p.year, value: p.value - q });
  }
  return out;
}

/** Years available in every given series (for selectors). */
export function commonYears(...series: YearValue[][]): number[] {
  const [first, ...rest] = series;
  if (!first) return [];
  return first.map((p) => p.year).filter((y) => rest.every((s) => at(s, y) !== undefined));
}

/** Rate on the given date or the closest earlier date (ECB publishes on TARGET working days only). */
export function rateOn(obs: { date: string; value: number }[], date: string): { date: string; value: number } | null {
  let hit: { date: string; value: number } | null = null;
  for (const o of obs) {
    if (o.date <= date) hit = o;
    else break;
  }
  return hit;
}

/** Convert between two currencies quoted per EUR (ECB reference rates). EUR itself is 1. */
export function convertViaEur(amount: number, fromPerEur: number, toPerEur: number): number {
  return (amount / fromPerEur) * toPerEur;
}

/** CSV of one economy's series, one row per year, with the source line. */
export function currencyCsv(p: CurrencyProfile): string {
  const keys = Object.keys(CURRENCY_INDICATORS) as CurrencySeriesKey[];
  const years = [...new Set(keys.flatMap((k) => p.series[k].map((v) => v.year)))].sort((a, b) => a - b);
  const header = ['year', ...keys.map((k) => `"${CURRENCY_INDICATORS[k].label} [${CURRENCY_INDICATORS[k].id}]"`)].join(',');
  const rows = years.map((y) => [y, ...keys.map((k) => at(p.series[k], y) ?? '')].join(','));
  return [`# ${p.name} (${p.iso3}). Source: ${p.source.name}, ${p.source.license}, ${p.source.url}`, header, ...rows].join('\n') + '\n';
}
