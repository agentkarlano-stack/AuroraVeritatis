/**
 * Chart favourites: the ranges, candle intervals, chart types, indicators, drawing tools and templates a user starred.
 * Favourite ranges form the range chips in the toolbar; the rest appear in the optional favourites bar. Stored in the
 * synced preferences (`prefs.chartFavs`), so they follow a signed-in user across devices. Always read through
 * `normalizeFavourites`: synced or older copies may hold unknown ids.
 */
import { CHART_TYPE_MAP, type ChartTypeId } from './chartTypes';
import { INDICATOR_MAP } from './indicators';
import { INTERVAL_MAP, RANGES, type IntervalId, type RangeId } from './intervals';

export const DRAW_TOOLS = [
  { id: 'hline', label: 'Level', title: 'Horizontal level' },
  { id: 'trend', label: 'Trend line', title: 'Trend line through two points' },
  { id: 'fib', label: 'Fibonacci', title: 'Fibonacci retracement between two points' },
] as const;
export type DrawToolId = (typeof DRAW_TOOLS)[number]['id'];

export interface ChartFavourites {
  ranges: RangeId[];
  intervals: IntervalId[];
  types: ChartTypeId[];
  indicators: string[];
  drawings: DrawToolId[];
  /** Built-in (`trend`, …) or user template ids. Unknown user ids are kept: templates live in this browser only. */
  templates: string[];
  /** Show the favourites bar under the toolbar. */
  bar: boolean;
}

export type FavouriteKind = Exclude<keyof ChartFavourites, 'bar'>;

export const DEFAULT_FAVOURITES: ChartFavourites = {
  ranges: ['1M', '6M', '1Y', '5Y', 'ALL'],
  intervals: ['1D', '1W'],
  types: ['candles', 'line'],
  indicators: ['sma', 'ema', 'rsi', 'macd', 'bb', 'volume'],
  drawings: ['hline', 'trend', 'fib'],
  templates: [],
  bar: true,
};

const MAX: Record<FavouriteKind, number> = { ranges: 9, intervals: 8, types: 8, indicators: 16, drawings: 8, templates: 8 };
const RANGE_IDS = new Set<string>(RANGES.map((r) => r.id));
const DRAW_IDS = new Set<string>(DRAW_TOOLS.map((d) => d.id));
const VALID: Record<FavouriteKind, (id: string) => boolean> = {
  ranges: (id) => RANGE_IDS.has(id),
  intervals: (id) => INTERVAL_MAP.has(id as IntervalId),
  types: (id) => CHART_TYPE_MAP.has(id as ChartTypeId),
  indicators: (id) => INDICATOR_MAP.has(id),
  drawings: (id) => DRAW_IDS.has(id),
  templates: (id) => /^[A-Za-z0-9_-]{1,40}$/.test(id),
};

function clean<K extends FavouriteKind>(kind: K, raw: unknown, fallback: ChartFavourites[K]): ChartFavourites[K] {
  if (!Array.isArray(raw)) return fallback;
  const out: string[] = [];
  for (const v of raw) if (typeof v === 'string' && VALID[kind](v) && !out.includes(v)) out.push(v);
  return out.slice(0, MAX[kind]) as ChartFavourites[K];
}

/** Valid favourites from any stored value. `legacyIndicators` are the indicator stars kept in this browser before sync. */
export function normalizeFavourites(raw: unknown, legacyIndicators?: string[]): ChartFavourites {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ChartFavourites, unknown>>;
  return {
    ranges: clean('ranges', r.ranges, DEFAULT_FAVOURITES.ranges),
    intervals: clean('intervals', r.intervals, DEFAULT_FAVOURITES.intervals),
    types: clean('types', r.types, DEFAULT_FAVOURITES.types),
    indicators: clean('indicators', r.indicators ?? legacyIndicators, DEFAULT_FAVOURITES.indicators),
    drawings: clean('drawings', r.drawings, DEFAULT_FAVOURITES.drawings),
    templates: clean('templates', r.templates, DEFAULT_FAVOURITES.templates),
    bar: typeof r.bar === 'boolean' ? r.bar : DEFAULT_FAVOURITES.bar,
  };
}

/** Adds or removes one favourite. Ranges stay in the catalogue's order; other lists keep the order they were starred in. */
export function toggleFavourite(favs: ChartFavourites, kind: FavouriteKind, id: string): ChartFavourites {
  const list = favs[kind] as string[];
  if (list.includes(id)) return { ...favs, [kind]: list.filter((x) => x !== id) };
  if (!VALID[kind](id) || list.length >= MAX[kind]) return favs;
  const next = [...list, id];
  if (kind === 'ranges') next.sort((a, b) => RANGES.findIndex((r) => r.id === a) - RANGES.findIndex((r) => r.id === b));
  return { ...favs, [kind]: next };
}

export const favouriteLimit = (kind: FavouriteKind) => MAX[kind];
