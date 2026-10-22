import { INDICATORS, INDICATOR_IDS, WORLD_BANK_SOURCE } from '../shared/indicators';
import { CURRENCY_INDICATORS, type CurrencyProfile, type CurrencySeriesKey } from '../shared/currency';
import type { ComparePoint, CompareYear, CountryProfile, IndicatorSeries, IndicatorValue } from '../shared/types';
import { fetchJson } from './http';

const BASE = 'https://api.worldbank.org/v2';

interface WbMeta {
  page: number;
  pages: number;
  total: number;
  message?: unknown;
}

interface WbObservation {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

interface WbCountry {
  id: string;
  name: string;
  capitalCity: string;
  region: { id: string; value: string };
  incomeLevel: { id: string; value: string };
}

type WbResponse<T> = [WbMeta, T[] | null] | [{ message: unknown }];

export const ISO3_RE = /^[A-Z]{3}$/;

function rows<T>(data: WbResponse<T>): T[] {
  if (!Array.isArray(data) || data.length < 2) return [];
  return (data[1] as T[] | null) ?? [];
}

export async function countryProfile(iso3: string): Promise<CountryProfile | null> {
  const meta = rows(await fetchJson<WbResponse<WbCountry>>(`${BASE}/country/${iso3}?format=json`))[0];
  if (!meta) return null;

  // One request per indicator; mrnev=1 returns the most recent non-empty observation.
  const results = await Promise.allSettled(
    INDICATORS.map((def) =>
      fetchJson<WbResponse<WbObservation>>(`${BASE}/country/${iso3}/indicator/${def.id}?format=json&mrnev=1`),
    ),
  );

  const indicators: Record<string, IndicatorValue> = {};
  INDICATORS.forEach((def, i) => {
    const r = results[i];
    const obs = r && r.status === 'fulfilled' ? rows(r.value)[0] : undefined;
    indicators[def.id] = {
      id: def.id,
      label: def.label,
      unit: def.unit,
      value: typeof obs?.value === 'number' ? obs.value : null,
      date: obs?.date ?? null,
    };
  });

  return {
    iso3,
    name: meta.name,
    region: meta.region?.value?.trim() || null,
    incomeLevel: meta.incomeLevel?.value?.trim() || null,
    capital: meta.capitalCity?.trim() || null,
    indicators,
    source: WORLD_BANK_SOURCE,
    fetchedAt: new Date().toISOString(),
  };
}

export async function indicatorSeries(iso3: string, indicator: string): Promise<IndicatorSeries | null> {
  if (!INDICATOR_IDS.has(indicator)) return null;
  const def = INDICATORS.find((d) => d.id === indicator)!;
  const data = await fetchJson<WbResponse<WbObservation>>(
    `${BASE}/country/${iso3}/indicator/${indicator}?format=json&date=1990:2030&per_page=100`,
  );
  const points = rows(data)
    .filter((o): o is WbObservation & { value: number } => typeof o.value === 'number')
    .map((o) => ({ date: o.date, value: o.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { iso3, indicator, label: def.label, unit: def.unit, points, source: WORLD_BANK_SOURCE };
}

interface WbCountryMeta {
  id: string;
  name: string;
  region: { id: string; value: string };
}

/** Economies only (WB aggregates such as "World" or "Euro area" have region id "NA"). */
async function economies(): Promise<Map<string, { name: string; region: string }>> {
  const list = rows(await fetchJson<WbResponse<WbCountryMeta>>(`${BASE}/country?format=json&per_page=400`));
  const out = new Map<string, { name: string; region: string }>();
  for (const c of list) if (c.region?.id && c.region.id !== 'NA') out.set(c.id, { name: c.name, region: c.region.value.trim() });
  return out;
}

async function yearValues(indicator: string, year: number): Promise<Map<string, number>> {
  const data = await fetchJson<WbResponse<WbObservation>>(`${BASE}/country/all/indicator/${indicator}?format=json&date=${year}&per_page=400`);
  const out = new Map<string, number>();
  for (const o of rows(data)) if (typeof o.value === 'number' && o.countryiso3code) out.set(o.countryiso3code, o.value);
  return out;
}

/**
 * Valid comparison years. Evaluated per request: in the Workers runtime the clock reads as the Unix epoch during
 * global-scope initialisation, so a module-level `new Date()` would reject every year.
 */
export function compareYears(now = Date.now()): { min: number; max: number } {
  return { min: 1990, max: new Date(now).getUTCFullYear() - 1 };
}

/** One year of a three-indicator cross-section (x, y, bubble size) for all economies. */
export async function compareYear(year: number, x: string, y: string, size: string): Promise<CompareYear | null> {
  if (![x, y, size].every((id) => INDICATOR_IDS.has(id))) return null;
  const years = compareYears();
  if (!Number.isInteger(year) || year < years.min || year > years.max) return null;
  const [meta, xs, ys, ss] = await Promise.all([economies(), yearValues(x, year), yearValues(y, year), yearValues(size, year)]);
  const points: ComparePoint[] = [];
  for (const [iso3, m] of meta) {
    const xv = xs.get(iso3);
    const yv = ys.get(iso3);
    if (xv === undefined || yv === undefined) continue;
    points.push({ iso3, name: m.name, region: m.region, x: xv, y: yv, size: ss.get(iso3) ?? null });
  }
  return { year, x, y, size, points, source: WORLD_BANK_SOURCE };
}

/**
 * Annual CPI, inflation, official exchange rate and PPP factor for one economy (Currency & Purchasing Power).
 * Null for unknown codes and aggregates.
 */
export async function currencyProfile(iso3: string, now = Date.now()): Promise<CurrencyProfile | null> {
  const meta = rows(await fetchJson<WbResponse<WbCountry>>(`${BASE}/country/${iso3}?format=json`))[0];
  if (!meta || meta.region?.id === 'NA') return null;
  const keys = Object.keys(CURRENCY_INDICATORS) as CurrencySeriesKey[];
  const last = new Date(now).getUTCFullYear();
  const data = await Promise.all(
    keys.map((k) => fetchJson<WbResponse<WbObservation>>(`${BASE}/country/${iso3}/indicator/${CURRENCY_INDICATORS[k].id}?format=json&date=1960:${last}&per_page=100`)),
  );
  const series = Object.fromEntries(
    keys.map((k, i) => [
      k,
      rows(data[i]!)
        .filter((o): o is WbObservation & { value: number } => typeof o.value === 'number')
        .map((o) => ({ year: Number(o.date), value: o.value }))
        .sort((a, b) => a.year - b.year),
    ]),
  ) as CurrencyProfile['series'];
  return { iso3, name: meta.name, series, source: WORLD_BANK_SOURCE, fetchedAt: new Date(now).toISOString() };
}
