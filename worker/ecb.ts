import { ECB_SOURCE, MACRO_MAP, MACRO_SERIES, type MacroObs, type MacroResponse, type MacroSeriesDef } from '../shared/macro';
import { fetchText } from './http';

// ECB Data Portal SDMX REST API (no key). Reuse requires quoting the source, which every response carries.
const BASE = 'https://data-api.ecb.europa.eu/service/data';
const DAY = 86_400_000;

/** Minimal RFC 4180 parser: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f !== ''));
}

/** Observations per Aurora series id from an ECB `csvdata` response; rows with missing or invalid values are skipped. */
export function normalizeEcb(csv: string): Map<string, MacroObs[]> {
  const [header, ...rows] = parseCsv(csv);
  const out = new Map<string, MacroObs[]>();
  if (!header) return out;
  const col = (name: string) => header.indexOf(name);
  const [iKey, iTime, iValue] = [col('KEY'), col('TIME_PERIOD'), col('OBS_VALUE')];
  if (iKey < 0 || iTime < 0 || iValue < 0) return out;
  const byKey = new Map(MACRO_SERIES.map((s) => [`${s.flow}.${s.key}`, s.id]));
  for (const r of rows) {
    const id = byKey.get(r[iKey] ?? '');
    const date = r[iTime] ?? '';
    const raw = r[iValue]?.trim();
    const value = raw ? Number(raw) : NaN;
    if (!id || !/^\d{4}-\d{2}(-\d{2})?$/.test(date) || !Number.isFinite(value)) continue;
    const list = out.get(id) ?? [];
    list.push({ date, value });
    out.set(id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** One request per dataflow group: FX series share a key pattern and are combined with SDMX "+". */
export function ecbUrls(defs: MacroSeriesDef[], sinceMs: number): string[] {
  const since = new Date(sinceMs).toISOString().slice(0, 10);
  const qs = `?startPeriod=${since}&format=csvdata&detail=dataonly`;
  const fx = defs.filter((d) => d.group === 'fx');
  const urls = defs.filter((d) => d.group !== 'fx').map((d) => `${BASE}/${d.flow}/${d.key}${qs}`);
  if (fx.length) urls.unshift(`${BASE}/EXR/D.${fx.map((d) => d.key.split('.')[1]).join('+')}.EUR.SP00.A${qs}`);
  return urls;
}

async function query(defs: MacroSeriesDef[], days: number, now: number): Promise<MacroResponse> {
  // ECB answers 404 when a key has no observations in the window; treat that as "no data", not an outage.
  const texts = await Promise.all(ecbUrls(defs, now - days * DAY).map((u) => fetchText(u, 15_000, [404])));
  const merged = new Map<string, MacroObs[]>();
  for (const t of texts) for (const [id, obs] of normalizeEcb(t)) merged.set(id, obs);
  return {
    series: defs.filter((d) => merged.has(d.id)).map((d) => ({ id: d.id, obs: merged.get(d.id)! })),
    missing: defs.filter((d) => !merged.has(d.id)).map((d) => d.id),
    source: ECB_SOURCE,
    fetchedAt: new Date(now).toISOString(),
  };
}

/** Every catalogue series over the last two years (enough for 1-year changes and charts). */
export function macroOverview(now = Date.now()): Promise<MacroResponse> {
  return query([...MACRO_SERIES], 2 * 366, now);
}

/** One series with up to 25 years of history; null for unknown ids or ranges. */
export async function macroHistory(id: string, years: number, now = Date.now()): Promise<MacroResponse | null> {
  const def = MACRO_MAP.get(id);
  if (!def || !Number.isInteger(years) || years < 1 || years > 25) return null;
  return query([def], years * 366, now);
}
