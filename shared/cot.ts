/** CFTC Commitments of Traders (Legacy, futures only) — market catalogue, wire types and analytics. */

export interface CotMarket {
  /** CFTC contract market code. */
  code: string;
  name: string;
  group: 'Energy' | 'Metals' | 'Agriculture' | 'Currencies' | 'Rates' | 'Equity indices' | 'Crypto';
  exchange: string;
  /** Demo instrument in the Market Terminal with the same underlying exposure, if any. */
  instrument?: string;
}

export const COT_MARKETS: readonly CotMarket[] = [
  { code: '067651', name: 'WTI crude oil', group: 'Energy', exchange: 'NYMEX', instrument: 'CRUDE.D' },
  { code: '023651', name: 'Natural gas (Henry Hub)', group: 'Energy', exchange: 'NYMEX', instrument: 'NATGAS.D' },
  { code: '088691', name: 'Gold', group: 'Metals', exchange: 'COMEX', instrument: 'GOLD.D' },
  { code: '084691', name: 'Silver', group: 'Metals', exchange: 'COMEX' },
  { code: '085692', name: 'Copper', group: 'Metals', exchange: 'COMEX' },
  { code: '001602', name: 'Wheat (SRW)', group: 'Agriculture', exchange: 'CBOT', instrument: 'WHEAT.D' },
  { code: '002602', name: 'Corn', group: 'Agriculture', exchange: 'CBOT' },
  { code: '005602', name: 'Soybeans', group: 'Agriculture', exchange: 'CBOT' },
  { code: '099741', name: 'Euro FX', group: 'Currencies', exchange: 'CME', instrument: 'EURUSD.D' },
  { code: '097741', name: 'Japanese yen', group: 'Currencies', exchange: 'CME', instrument: 'USDJPY.D' },
  { code: '096742', name: 'British pound', group: 'Currencies', exchange: 'CME' },
  { code: '043602', name: '10-year US Treasury note', group: 'Rates', exchange: 'CBOT', instrument: 'UST10Y.D' },
  { code: '13874A', name: 'E-mini S&P 500', group: 'Equity indices', exchange: 'CME' },
  { code: '133741', name: 'Bitcoin', group: 'Crypto', exchange: 'CME', instrument: 'BTC.D' },
];

export const COT_MARKET_MAP = new Map(COT_MARKETS.map((m) => [m.code, m]));

/** One weekly report row (positions as of the Tuesday report date, in contracts). */
export interface CotRow {
  /** YYYY-MM-DD */
  date: string;
  openInterest: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  commercialLong: number;
  commercialShort: number;
  nonReportableLong: number;
  nonReportableShort: number;
  /** Market name as published by the CFTC. */
  cftcName?: string;
}

export interface CotSeries {
  code: string;
  /** Oldest first. */
  rows: CotRow[];
}

export interface CotResponse {
  markets: CotSeries[];
  /** Requested codes for which the CFTC returned no rows. */
  missing: string[];
  source: { name: string; url: string; license: string };
  fetchedAt: string;
}

export const COT_SOURCE = {
  name: 'U.S. Commodity Futures Trading Commission — Commitments of Traders (Legacy, futures only)',
  url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm',
  license: 'U.S. government work; reported weekly (positions as of Tuesday, published Friday 15:30 ET)',
} as const;

/** Weeks used for the positioning index and percentile (≈ 3 years, a common convention). */
export const COT_LOOKBACK = 156;

export interface CotPoint {
  date: string;
  openInterest: number;
  /** Large speculators: non-commercial long − short. */
  netSpec: number;
  /** Hedgers: commercial long − short. */
  netCommercial: number;
  /** Small traders: non-reportable long − short. */
  netSmall: number;
}

export interface CotSummary {
  latest: CotPoint;
  /** Change in net speculative position vs. the previous report (null if only one report). */
  weeklyChange: number | null;
  /** Net speculative position as a share of open interest. */
  netSpecPctOi: number;
  /** 0–100: where the latest net spec position sits between the min and max of the lookback window. */
  index: number;
  /** Share of lookback weeks with a lower net spec position (0–100). */
  percentile: number;
  /** Weeks actually available in the lookback window. */
  weeks: number;
  extreme: 'long' | 'short' | null;
}

export function toPoints(rows: CotRow[]): CotPoint[] {
  return rows.map((r) => ({
    date: r.date,
    openInterest: r.openInterest,
    netSpec: r.nonCommercialLong - r.nonCommercialShort,
    netCommercial: r.commercialLong - r.commercialShort,
    netSmall: r.nonReportableLong - r.nonReportableShort,
  }));
}

/** Positioning statistics for the latest report. Rows must be oldest first; returns null if there are none. */
export function summariseCot(rows: CotRow[], lookback = COT_LOOKBACK): CotSummary | null {
  const pts = toPoints(rows);
  const latest = pts.at(-1);
  if (!latest) return null;
  const window = pts.slice(-lookback).map((p) => p.netSpec);
  const min = Math.min(...window);
  const max = Math.max(...window);
  const index = max === min ? 50 : ((latest.netSpec - min) / (max - min)) * 100;
  const below = window.filter((v) => v < latest.netSpec).length;
  const percentile = window.length > 1 ? (below / (window.length - 1)) * 100 : 50;
  const prev = pts.at(-2);
  return {
    latest,
    weeklyChange: prev ? latest.netSpec - prev.netSpec : null,
    netSpecPctOi: latest.openInterest > 0 ? latest.netSpec / latest.openInterest : 0,
    index,
    percentile,
    weeks: window.length,
    extreme: window.length >= 52 ? (index >= 90 ? 'long' : index <= 10 ? 'short' : null) : null,
  };
}

/** Rolling positioning index (same definition as `summariseCot().index`) for every report with enough history. */
export function cotIndexSeries(rows: CotRow[], lookback = COT_LOOKBACK, minWeeks = 52): { date: string; value: number }[] {
  const pts = toPoints(rows);
  const out: { date: string; value: number }[] = [];
  for (let i = minWeeks - 1; i < pts.length; i++) {
    const w = pts.slice(Math.max(0, i - lookback + 1), i + 1).map((p) => p.netSpec);
    const min = Math.min(...w);
    const max = Math.max(...w);
    out.push({ date: pts[i]!.date, value: max === min ? 50 : ((pts[i]!.netSpec - min) / (max - min)) * 100 });
  }
  return out;
}

/** CSV export of one market's reports with derived net positions; a comment header carries source and units. */
export function cotCsv(market: CotMarket, rows: CotRow[]): string {
  const pts = toPoints(rows);
  return [
    `# ${market.name} (${market.exchange}, CFTC code ${market.code}) — ${COT_SOURCE.name}`,
    `# ${COT_SOURCE.url} · positions in contracts as of the report date (Tuesday)`,
    'report_date,open_interest,noncommercial_long,noncommercial_short,net_noncommercial,commercial_long,commercial_short,net_commercial,nonreportable_long,nonreportable_short,net_nonreportable',
    ...rows.map((r, i) =>
      [r.date, r.openInterest, r.nonCommercialLong, r.nonCommercialShort, pts[i]!.netSpec, r.commercialLong, r.commercialShort, pts[i]!.netCommercial, r.nonReportableLong, r.nonReportableShort, pts[i]!.netSmall].join(','),
    ),
  ].join('\n');
}
