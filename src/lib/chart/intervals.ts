import type { Bar } from '../demoMarket';

/**
 * Candle intervals (bar resolution) and history ranges (visible period) are separate controls. A dataset declares the
 * interval it is published at; coarser intervals are built by exact aggregation (first open, highest high, lowest low,
 * last close, summed volume). Finer intervals are never derived: they need a source that publishes them.
 */
export type IntervalId = '1m' | '3m' | '5m' | '10m' | '15m' | '30m' | '45m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1D' | '1W' | '1Mo' | '3Mo' | '1Y';

export interface IntervalDef {
  id: IntervalId;
  /** Unambiguous label: "1 minute" vs "1 month". */
  label: string;
  short: string;
  group: 'Minutes' | 'Hours' | 'Days and longer';
  /** Approximate length in minutes, used for ordering and annualisation. */
  minutes: number;
}

const MIN = 1;
const HOUR = 60;
const DAY = 1440;

export const INTERVALS: IntervalDef[] = [
  { id: '1m', label: '1 minute', short: '1m', group: 'Minutes', minutes: 1 * MIN },
  { id: '3m', label: '3 minutes', short: '3m', group: 'Minutes', minutes: 3 * MIN },
  { id: '5m', label: '5 minutes', short: '5m', group: 'Minutes', minutes: 5 * MIN },
  { id: '10m', label: '10 minutes', short: '10m', group: 'Minutes', minutes: 10 * MIN },
  { id: '15m', label: '15 minutes', short: '15m', group: 'Minutes', minutes: 15 * MIN },
  { id: '30m', label: '30 minutes', short: '30m', group: 'Minutes', minutes: 30 * MIN },
  { id: '45m', label: '45 minutes', short: '45m', group: 'Minutes', minutes: 45 * MIN },
  { id: '1h', label: '1 hour', short: '1h', group: 'Hours', minutes: 1 * HOUR },
  { id: '2h', label: '2 hours', short: '2h', group: 'Hours', minutes: 2 * HOUR },
  { id: '4h', label: '4 hours', short: '4h', group: 'Hours', minutes: 4 * HOUR },
  { id: '6h', label: '6 hours', short: '6h', group: 'Hours', minutes: 6 * HOUR },
  { id: '12h', label: '12 hours', short: '12h', group: 'Hours', minutes: 12 * HOUR },
  { id: '1D', label: '1 day', short: '1D', group: 'Days and longer', minutes: DAY },
  { id: '1W', label: '1 week', short: '1W', group: 'Days and longer', minutes: 7 * DAY },
  { id: '1Mo', label: '1 month', short: '1M', group: 'Days and longer', minutes: 30 * DAY },
  { id: '3Mo', label: '3 months', short: '3M', group: 'Days and longer', minutes: 91 * DAY },
  { id: '1Y', label: '1 year', short: '1Y', group: 'Days and longer', minutes: 365 * DAY },
];
export const INTERVAL_MAP = new Map(INTERVALS.map((i) => [i.id, i]));

const UNIT: Record<string, IntervalDef['group'] | 'day' | 'week' | 'month' | 'year'> = {
  m: 'Minutes', min: 'Minutes', mins: 'Minutes', minute: 'Minutes', minutes: 'Minutes',
  h: 'Hours', hr: 'Hours', hrs: 'Hours', hour: 'Hours', hours: 'Hours', hourly: 'Hours',
  d: 'day', day: 'day', days: 'day', daily: 'day',
  w: 'week', wk: 'week', week: 'week', weeks: 'week', weekly: 'week',
  mo: 'month', mon: 'month', month: 'month', months: 'month', monthly: 'month', quarter: 'month', quarterly: 'month',
  y: 'year', yr: 'year', year: 'year', years: 'year', yearly: 'year', annual: 'year',
};
const unitOf = (i: IntervalDef) => (i.group !== 'Days and longer' ? i.group : i.id === '1D' ? 'day' : i.id === '1W' ? 'week' : i.id === '1Y' ? 'year' : 'month');
const countOf = (i: IntervalDef) => (i.id === '3Mo' ? 3 : Number.parseInt(i.id, 10));

/**
 * Interval search for the chart toolbar: "4h", "4 hours", "hourly", "15 min", "1D", "weekly". Lower-case "m" means
 * minutes and upper-case "M" months (the usual chart convention); "quarter" finds 3 months. Falls back to a plain
 * text match on label, short name and group.
 */
export function searchIntervals(query: string): IntervalDef[] {
  const raw = query.trim();
  if (!raw) return INTERVALS;
  const m = /^(\d+)?\s*([a-zA-Z]+)$/.exec(raw);
  if (m) {
    const n = m[1] ? Number(m[1]) : null;
    const word = m[2]!;
    const unit = word === 'M' ? 'month' : UNIT[word.toLowerCase()];
    if (unit) {
      const n2 = /^quarter/i.test(word) ? 3 : n;
      return INTERVALS.filter((i) => unitOf(i) === unit && (n2 === null || countOf(i) === n2));
    }
  }
  if (/^\d+$/.test(raw)) return INTERVALS.filter((i) => countOf(i) === Number(raw));
  const needle = raw.toLowerCase();
  return INTERVALS.filter((i) => `${i.label} ${i.short} ${i.id} ${i.group}`.toLowerCase().includes(needle));
}

/** Bars per year for annualising (trading sessions for daily data). */
export function periodsPerYear(id: IntervalId): number {
  if (id === '1D') return 252;
  if (id === '1W') return 52;
  if (id === '1Mo') return 12;
  if (id === '3Mo') return 4;
  if (id === '1Y') return 1;
  return (252 * 6.5 * 60) / INTERVAL_MAP.get(id)!.minutes;
}

/**
 * Whether `target` can be shown for a dataset published at `base`, and why not. Only aggregation to coarser calendar
 * intervals is allowed; nothing finer than the source is ever synthesised.
 */
export function intervalAvailability(base: IntervalId, target: IntervalId): { ok: true } | { ok: false; reason: string } {
  const b = INTERVAL_MAP.get(base)!;
  const t = INTERVAL_MAP.get(target)!;
  if (t.minutes < b.minutes) {
    return {
      ok: false,
      reason:
        b.minutes >= DAY
          ? 'Needs intraday prices. Aurora has no licensed intraday data source yet, and intraday bars are never derived from daily data.'
          : `This source publishes ${b.label} bars; finer bars are not available.`,
    };
  }
  if (b.minutes >= DAY && t.minutes >= DAY) return { ok: true };
  if (t.minutes % b.minutes === 0 && t.minutes < DAY) return { ok: true };
  return { ok: false, reason: `Cannot be built exactly from ${b.label} bars.` };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Key of the calendar period a YYYY-MM-DD date belongs to; weeks start on Monday (ISO). */
export function periodKey(date: string, interval: IntervalId): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  if (interval === '1W') {
    const t = new Date(Date.UTC(y, m - 1, d));
    const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
    t.setUTCDate(t.getUTCDate() - dow);
    return t.toISOString().slice(0, 10);
  }
  if (interval === '1Mo') return `${y}-${pad(m)}`;
  if (interval === '3Mo') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (interval === '1Y') return `${y}`;
  return date;
}

/** Aggregate daily bars into weekly, monthly, quarterly or yearly bars. Bar time is the first session of the period. */
export function resample(bars: Bar[], interval: IntervalId): Bar[] {
  if (interval === '1D') return bars;
  const out: Bar[] = [];
  let key = '';
  for (const b of bars) {
    const k = periodKey(b.time, interval);
    const cur = out.at(-1);
    if (cur && k === key) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    } else {
      out.push({ ...b });
      key = k;
    }
  }
  return out;
}

export type RangeId = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL';
export const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: '1D', label: '1 day', days: 1 },
  { id: '5D', label: '5 days', days: 5 },
  { id: '1M', label: '1 month', days: 31 },
  { id: '3M', label: '3 months', days: 92 },
  { id: '6M', label: '6 months', days: 183 },
  { id: '1Y', label: '1 year', days: 366 },
  { id: '2Y', label: '2 years', days: 731 },
  { id: '5Y', label: '5 years', days: 1827 },
  { id: 'ALL', label: 'All history', days: Infinity },
];

export type ChartRange = { preset: RangeId } | { from: string; to: string };

/**
 * Indices [from, to] of the bars inside a range. Presets count calendar days back from the last bar (1D and 5D count
 * sessions, as markets are closed at weekends). Returns null when no bar falls in a custom range.
 */
export function rangeWindow(bars: Bar[], range: ChartRange): { from: number; to: number } | null {
  const n = bars.length;
  if (!n) return null;
  if ('preset' in range) {
    if (range.preset === 'ALL') return { from: 0, to: n - 1 };
    if (range.preset === '1D' || range.preset === '5D') {
      const sessions = range.preset === '1D' ? 1 : 5;
      // For daily data a session is one bar; coarser bars cover at least one session each.
      return { from: Math.max(0, n - sessions), to: n - 1 };
    }
    const days = RANGES.find((r) => r.id === range.preset)!.days;
    const last = Date.parse(bars[n - 1]!.time);
    const cutoff = new Date(last - days * 86_400_000).toISOString().slice(0, 10);
    const from = bars.findIndex((b) => b.time >= cutoff);
    return { from: from === -1 ? n - 1 : from, to: n - 1 };
  }
  const from = bars.findIndex((b) => b.time >= range.from);
  let to = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (bars[i]!.time <= range.to) {
      to = i;
      break;
    }
  }
  if (from === -1 || to === -1 || to < from) return null;
  return { from, to };
}
