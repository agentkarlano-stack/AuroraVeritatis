import { INDICATORS, INDICATOR_IDS, WORLD_BANK_SOURCE } from '../shared/indicators';
import type { CountryProfile, IndicatorSeries, IndicatorValue } from '../shared/types';
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
