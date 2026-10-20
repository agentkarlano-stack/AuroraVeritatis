/**
 * World Bank Open Data (WDI) integration — free, keyless, public API.
 * https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 */

export const WORLD_BANK_BASE = "https://api.worldbank.org/v2";

export type IndicatorFormat = "usd" | "percent" | "count";

export interface IndicatorDef {
  id: string;
  label: string;
  category: "Economy" | "Demographics" | "Military" | "Infrastructure" | "Trade";
  format: IndicatorFormat;
}

export const PROFILE_INDICATORS: IndicatorDef[] = [
  { id: "SP.POP.TOTL", label: "Population", category: "Demographics", format: "count" },
  { id: "NY.GDP.MKTP.CD", label: "GDP (current US$)", category: "Economy", format: "usd" },
  { id: "NY.GDP.MKTP.KD.ZG", label: "GDP growth (annual %)", category: "Economy", format: "percent" },
  { id: "FP.CPI.TOTL.ZG", label: "Inflation, consumer prices (annual %)", category: "Economy", format: "percent" },
  { id: "SL.UEM.TOTL.ZS", label: "Unemployment (% of labour force, ILO est.)", category: "Economy", format: "percent" },
  { id: "NE.TRD.GNFS.ZS", label: "Trade (% of GDP)", category: "Trade", format: "percent" },
  { id: "MS.MIL.XPND.GD.ZS", label: "Military expenditure (% of GDP)", category: "Military", format: "percent" },
  { id: "IT.NET.USER.ZS", label: "Internet users (% of population)", category: "Infrastructure", format: "percent" },
];

export const HISTORY_INDICATORS = ["NY.GDP.MKTP.KD.ZG", "FP.CPI.TOTL.ZG"] as const;

export interface IndicatorValue {
  id: string;
  label: string;
  category: IndicatorDef["category"];
  format: IndicatorFormat;
  value: number | null;
  year: string | null;
  source: string;
}

export interface HistoryPoint {
  year: number;
  value: number;
}

interface WbRow {
  indicator?: { id?: string; value?: string };
  date?: string;
  value?: number | null;
}

/** Return the WDI rows array or throw if the payload is an error/unknown shape. */
export function wbRows(payload: unknown): WbRow[] {
  if (!Array.isArray(payload)) throw new Error("Unexpected World Bank response");
  const [meta, rows] = payload as [unknown, unknown];
  if (meta && typeof meta === "object" && "message" in (meta as object)) {
    throw new Error("World Bank API returned an error");
  }
  return Array.isArray(rows) ? (rows as WbRow[]) : [];
}

/** Most recent non-null value from a WDI response. */
export function parseLatest(payload: unknown, def: IndicatorDef): IndicatorValue {
  const rows = wbRows(payload)
    .filter((r) => typeof r.value === "number" && r.date)
    .sort((a, b) => Number(b.date) - Number(a.date));
  const top = rows[0];
  return {
    id: def.id,
    label: def.label,
    category: def.category,
    format: def.format,
    value: top ? (top.value as number) : null,
    year: top?.date ?? null,
    source: "World Bank, World Development Indicators",
  };
}

/** Chronological, non-null history from a WDI response. */
export function parseHistory(payload: unknown): HistoryPoint[] {
  return wbRows(payload)
    .filter((r) => typeof r.value === "number" && r.date && /^\d{4}$/.test(r.date))
    .map((r) => ({ year: Number(r.date), value: r.value as number }))
    .sort((a, b) => a.year - b.year);
}

export function latestUrl(iso3: string, indicator: string): string {
  return `${WORLD_BANK_BASE}/country/${encodeURIComponent(iso3)}/indicator/${encodeURIComponent(indicator)}?format=json&mrnev=1`;
}

export function historyUrl(iso3: string, indicator: string, from: number, to: number): string {
  return `${WORLD_BANK_BASE}/country/${encodeURIComponent(iso3)}/indicator/${encodeURIComponent(indicator)}?format=json&date=${from}:${to}&per_page=100`;
}
