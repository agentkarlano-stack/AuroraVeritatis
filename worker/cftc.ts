import { COT_LOOKBACK, COT_MARKET_MAP, COT_MARKETS, COT_SOURCE, type CotResponse, type CotRow } from '../shared/cot';
import { fetchJson } from './http';

// CFTC Public Reporting Environment (Socrata): Legacy Commitments of Traders, futures only.
const DATASET = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';
const DAY = 86_400_000;

type SocrataRow = Record<string, string | undefined>;

const FIELDS = {
  openInterest: 'open_interest_all',
  nonCommercialLong: 'noncomm_positions_long_all',
  nonCommercialShort: 'noncomm_positions_short_all',
  commercialLong: 'comm_positions_long_all',
  commercialShort: 'comm_positions_short_all',
  nonReportableLong: 'nonrept_positions_long_all',
  nonReportableShort: 'nonrept_positions_short_all',
} as const;

/** Rows with a missing or non-numeric position field are dropped, never filled in. */
export function normalizeCot(raw: SocrataRow[]): Map<string, CotRow[]> {
  const byCode = new Map<string, Map<string, CotRow>>();
  for (const r of raw) {
    const code = r.cftc_contract_market_code?.trim();
    const date = r.report_date_as_yyyy_mm_dd?.slice(0, 10);
    if (!code || !COT_MARKET_MAP.has(code) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // Number('') is 0, so blank fields must be rejected explicitly.
    const nums = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, r[f]?.trim() ? Number(r[f]) : NaN])) as Record<keyof typeof FIELDS, number>;
    if (!Object.values(nums).every((v) => Number.isFinite(v) && v >= 0)) continue;
    const rows = byCode.get(code) ?? new Map<string, CotRow>();
    rows.set(date, { date, ...nums, cftcName: r.market_and_exchange_names?.trim() });
    byCode.set(code, rows);
  }
  return new Map([...byCode].map(([code, rows]) => [code, [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))]));
}

export function cotUrl(codes: string[], sinceMs: number): string {
  const since = new Date(sinceMs).toISOString().slice(0, 10);
  const where = `cftc_contract_market_code in(${codes.map((c) => `'${c}'`).join(',')}) AND report_date_as_yyyy_mm_dd >= '${since}T00:00:00'`;
  const q = new URLSearchParams({ $where: where, $order: 'report_date_as_yyyy_mm_dd ASC', $limit: '50000' });
  return `${DATASET}?${q}`;
}

async function query(codes: string[], weeks: number, now: number): Promise<CotResponse> {
  // A few extra weeks so the lookback window is full even around holidays.
  const raw = await fetchJson<SocrataRow[] | null>(cotUrl(codes, now - (weeks + 4) * 7 * DAY), 20_000);
  const byCode = normalizeCot(Array.isArray(raw) ? raw : []);
  return {
    markets: codes.filter((c) => byCode.has(c)).map((code) => ({ code, rows: byCode.get(code)! })),
    missing: codes.filter((c) => !byCode.has(c)),
    source: COT_SOURCE,
    fetchedAt: new Date(now).toISOString(),
  };
}

/** Every catalogue market, enough history for the positioning index. */
export function cotOverview(now = Date.now()): Promise<CotResponse> {
  return query(
    COT_MARKETS.map((m) => m.code),
    COT_LOOKBACK,
    now,
  );
}

/** One market with up to 20 years of history; null for codes outside the catalogue. */
export async function cotHistory(code: string, years: number, now = Date.now()): Promise<CotResponse | null> {
  if (!COT_MARKET_MAP.has(code) || !Number.isInteger(years) || years < 1 || years > 20) return null;
  return query([code], years * 52, now);
}
