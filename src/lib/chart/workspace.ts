import type { ChartTypeId } from './chartTypes';
import { CHART_TYPE_MAP } from './chartTypes';
import { INDICATOR_MAP, sanitizeParams } from './indicators';
import { INTERVAL_MAP, RANGES, type ChartRange, type IntervalId, type RangeId } from './intervals';
import type { Drawing } from '../chart';

/** One indicator on the chart. */
export interface IndicatorInstance {
  uid: string;
  id: string;
  params: Record<string, number>;
  /** Colour per output key (falls back to the indicator's default colours). */
  colors?: Record<string, string>;
  hidden?: boolean;
  /** Overlay indicators can be moved into their own pane. */
  ownPane?: boolean;
}

export interface Appearance {
  up: string;
  down: string;
  background: string;
  grid: boolean;
  scale: 'linear' | 'log' | 'percent';
}

/** Everything that defines how a chart looks, apart from the instrument and its drawings. */
export interface ChartSettings {
  v: 2;
  interval: IntervalId;
  range: ChartRange;
  type: ChartTypeId;
  indicators: IndicatorInstance[];
  appearance: Appearance;
  events: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = { up: '#5e9f7e', down: '#c2605b', background: '#151517', grid: true, scale: 'linear' };

export const DEFAULT_SETTINGS: ChartSettings = {
  v: 2,
  interval: '1D',
  range: { preset: '6M' },
  type: 'candles',
  indicators: [
    { uid: 'sma20', id: 'sma', params: { length: 20 } },
    { uid: 'vol', id: 'volume', params: {} },
  ],
  appearance: DEFAULT_APPEARANCE,
  events: true,
};

let counter = 0;
export const newUid = () => `i${Date.now().toString(36)}${(counter++).toString(36)}`;

const COLOR = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Bars per old range button → nearest preset (settings saved before the chart editor). */
function legacyRange(bars: unknown): ChartRange {
  const n = Number(bars);
  if (n <= 21) return { preset: '1M' };
  if (n <= 63) return { preset: '3M' };
  if (n <= 126) return { preset: '6M' };
  if (n <= 252) return { preset: '1Y' };
  return { preset: '2Y' };
}

/**
 * Accepts anything stored or imported (current settings, settings from before the chart editor, or a hand-edited JSON
 * file) and returns valid settings. Unknown indicators and values are dropped; nothing throws.
 */
export function normalizeSettings(raw: unknown): ChartSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  if (r.v !== 2) {
    // Legacy toggles: style, sma20, sma50, ema20, bollinger, volume, rsi, events, range (bars).
    const ind: IndicatorInstance[] = [];
    if (r.sma20) ind.push({ uid: 'sma20', id: 'sma', params: { length: 20 } });
    if (r.sma50) ind.push({ uid: 'sma50', id: 'sma', params: { length: 50 } });
    if (r.ema20) ind.push({ uid: 'ema20', id: 'ema', params: { length: 20 } });
    if (r.bollinger) ind.push({ uid: 'bb', id: 'bb', params: { length: 20, mult: 2 } });
    if (r.volume) ind.push({ uid: 'vol', id: 'volume', params: {} });
    if (r.rsi) ind.push({ uid: 'rsi', id: 'rsi', params: { length: 14 } });
    return { ...DEFAULT_SETTINGS, type: r.style === 'line' ? 'line' : 'candles', range: legacyRange(r.range), indicators: ind, events: r.events !== false };
  }
  const interval = INTERVAL_MAP.has(r.interval as IntervalId) ? (r.interval as IntervalId) : DEFAULT_SETTINGS.interval;
  const type = CHART_TYPE_MAP.has(r.type as ChartTypeId) ? (r.type as ChartTypeId) : DEFAULT_SETTINGS.type;
  const rr = r.range as Record<string, unknown> | undefined;
  const range: ChartRange =
    rr && RANGES.some((x) => x.id === rr.preset)
      ? { preset: rr.preset as RangeId }
      : rr && DATE.test(String(rr.from)) && DATE.test(String(rr.to))
        ? { from: String(rr.from), to: String(rr.to) }
        : DEFAULT_SETTINGS.range;
  const indicators = (Array.isArray(r.indicators) ? r.indicators : []).slice(0, 25).flatMap((x): IndicatorInstance[] => {
    const i = x as Record<string, unknown>;
    const def = INDICATOR_MAP.get(String(i?.id));
    if (!def || def.unavailable) return [];
    const colors = Object.fromEntries(Object.entries((i.colors as Record<string, unknown>) ?? {}).filter(([, c]) => COLOR.test(String(c)))) as Record<string, string>;
    return [{ uid: typeof i.uid === 'string' && i.uid ? i.uid.slice(0, 40) : newUid(), id: def.id, params: sanitizeParams(def, i.params as Record<string, unknown>), colors, hidden: i.hidden === true, ownPane: i.ownPane === true }];
  });
  const a = (r.appearance ?? {}) as Record<string, unknown>;
  const appearance: Appearance = {
    up: COLOR.test(String(a.up)) ? String(a.up) : DEFAULT_APPEARANCE.up,
    down: COLOR.test(String(a.down)) ? String(a.down) : DEFAULT_APPEARANCE.down,
    background: COLOR.test(String(a.background)) ? String(a.background) : DEFAULT_APPEARANCE.background,
    grid: a.grid !== false,
    scale: a.scale === 'log' || a.scale === 'percent' ? a.scale : 'linear',
  };
  return { v: 2, interval, range, type, indicators, appearance, events: r.events !== false };
}

/** A named chart template: everything except instrument and drawings. */
export interface ChartTemplate {
  id: string;
  name: string;
  builtIn?: boolean;
  settings: ChartSettings;
}

const ind = (id: string, params: Record<string, number> = {}): IndicatorInstance => ({ uid: `t-${id}-${Object.values(params).join('-')}`, id, params });
const tpl = (id: string, name: string, s: Partial<ChartSettings>): ChartTemplate => ({ id, name, builtIn: true, settings: { ...DEFAULT_SETTINGS, ...s } });

export const BUILT_IN_TEMPLATES: ChartTemplate[] = [
  tpl('trend', 'Trend following', { type: 'candles', range: { preset: '1Y' }, indicators: [ind('sma', { length: 20 }), ind('sma', { length: 50 }), ind('ema', { length: 200 }), ind('rsi', { length: 14 }), ind('macd', { fast: 12, slow: 26, signal: 9 })] }),
  tpl('long-term', 'Long-term investing', { interval: '1W', type: 'line', range: { preset: 'ALL' }, indicators: [ind('ma-cross', { fast: 50, slow: 200 }), ind('hl52')] }),
  tpl('volatility', 'Volatility analysis', { type: 'candles', range: { preset: '1Y' }, indicators: [ind('bb', { length: 20, mult: 2 }), ind('atr', { length: 14 }), ind('hv', { length: 20 }), ind('bbwidth', { length: 20, mult: 2 })] }),
  tpl('momentum', 'Momentum', { type: 'candles', range: { preset: '6M' }, indicators: [ind('ema', { length: 20 }), ind('rsi', { length: 14 }), ind('stoch', { k: 14, smoothK: 1, d: 3 }), ind('macd', { fast: 12, slow: 26, signal: 9 })] }),
  tpl('forex', 'Forex research', { type: 'line', range: { preset: '2Y' }, indicators: [ind('ema', { length: 50 }), ind('ema', { length: 200 }), ind('rsi', { length: 14 }), ind('hv', { length: 20 })] }),
  tpl('volume', 'Volume and money flow', { type: 'candles', range: { preset: '6M' }, indicators: [ind('volume'), ind('obv'), ind('mfi', { length: 14 }), ind('cmf', { length: 20 })] }),
];

/** A saved, editable chart analysis: instrument, settings and drawings. Exported and imported as JSON. */
export interface SavedLayout {
  kind: 'aurora-chart-layout';
  version: 1;
  name: string;
  savedAt: string;
  symbol: string;
  settings: ChartSettings;
  drawings: Drawing[];
}

export function parseLayout(text: string): SavedLayout | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (j.kind !== 'aurora-chart-layout' || typeof j.symbol !== 'string') return null;
    const drawings = (Array.isArray(j.drawings) ? j.drawings : []).filter(isDrawing).slice(0, 200);
    return {
      kind: 'aurora-chart-layout',
      version: 1,
      name: String(j.name ?? 'Imported chart').slice(0, 80),
      savedAt: typeof j.savedAt === 'string' ? j.savedAt : new Date().toISOString(),
      symbol: j.symbol.slice(0, 40),
      settings: normalizeSettings(j.settings),
      drawings,
    };
  } catch {
    return null;
  }
}

function isPoint(p: unknown): boolean {
  const x = p as Record<string, unknown> | null;
  return !!x && DATE.test(String(x.time)) && Number.isFinite(Number(x.price));
}

export function isDrawing(d: unknown): d is Drawing {
  const x = d as Record<string, unknown> | null;
  if (!x || typeof x.id !== 'string') return false;
  if (x.kind === 'hline') return Number.isFinite(Number(x.price));
  if (x.kind === 'trend' || x.kind === 'fib') return isPoint(x.a) && isPoint(x.b);
  return false;
}
