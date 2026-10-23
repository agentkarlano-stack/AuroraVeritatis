// Types shared between the Worker API and the React client.

/** How trustworthy a data point is. Every datum shown in the UI carries one of these. */
export type Provenance = 'confirmed' | 'estimate' | 'unverified' | 'simulated';

export interface PublicConfig {
  environment: 'production' | 'preview' | 'development';
  supabase: { url: string; anonKey: string } | null;
  posthog: { key: string; host: string } | null;
}

export interface IndicatorValue {
  id: string;
  label: string;
  unit: 'usd' | 'percent' | 'count' | 'km2' | 'years' | 'per100';
  value: number | null;
  /** Reference year of the observation, e.g. "2024". */
  date: string | null;
}

export interface CountryProfile {
  iso3: string;
  name: string;
  region: string | null;
  incomeLevel: string | null;
  capital: string | null;
  indicators: Record<string, IndicatorValue>;
  source: SourceRef;
  fetchedAt: string;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface IndicatorSeries {
  iso3: string;
  indicator: string;
  label: string;
  unit: IndicatorValue['unit'];
  points: SeriesPoint[];
  source: SourceRef;
}

export interface SourceRef {
  name: string;
  url: string;
  license: string;
}

export interface GeoEvent {
  id: string;
  title: string;
  summary: string;
  category: EventCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  lat: number;
  lon: number;
  region: string;
  /** ISO 8601 timestamp of the event. */
  time: string;
  provenance: Provenance;
  source: SourceRef;
  /** Asset classes potentially affected (analytical hypothesis, never a prediction). */
  marketLinks?: string[];
}

export type EventCategory =
  | 'conflict'
  | 'political'
  | 'security'
  | 'humanitarian'
  | 'natural-disaster'
  | 'economic'
  | 'energy';

export interface ApiError {
  error: string;
  detail?: string;
}

export interface ComparePoint {
  iso3: string;
  name: string;
  region: string;
  x: number;
  y: number;
  size: number | null;
}

/** Most recent observation per economy for one indicator (/api/map/:indicator). Years differ between economies. */
export interface LatestValues {
  indicator: string;
  /** The World Bank's own name for the series. */
  label: string;
  points: { iso3: string; name: string; value: number; year: number }[];
  years: { min: number; max: number } | null;
  source: SourceRef;
}

export interface CompareYear {
  year: number;
  x: string;
  y: string;
  size: string;
  points: ComparePoint[];
  source: SourceRef;
}
