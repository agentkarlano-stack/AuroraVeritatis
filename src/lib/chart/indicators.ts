import type { Bar } from '../demoMarket';

/**
 * Technical indicator catalogue. Every entry here is functional and covered by tests in indicators.test.ts (reference
 * values computed by hand or exact identities, e.g. zero-lag averages reproduce a straight line). Indicators that need
 * data Aurora does not have (intraday sessions) are listed with `unavailable` and cannot be added.
 *
 * Conventions: averages are seeded with the simple average of their first `n` values (as TradingView does); Wilder's
 * smoothing (RMA) uses alpha = 1/n; standard deviation is the population form unless noted.
 */

export type Series = (number | null)[];
export type Category = 'Moving averages' | 'Trend' | 'Momentum' | 'Volatility' | 'Volume' | 'Price analysis';
export const CATEGORIES: Category[] = ['Moving averages', 'Trend', 'Momentum', 'Volatility', 'Volume', 'Price analysis'];

export interface ParamDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface Output {
  key: string;
  label: string;
  values: Series;
  style: 'line' | 'histogram';
  color: string;
}

export interface Computed {
  outputs: Output[];
  /** Horizontal reference levels for oscillators (e.g. 70/30 for RSI). */
  levels?: number[];
}

export interface IndicatorDef {
  id: string;
  name: string;
  short: string;
  category: Category;
  /** 'price' overlays the price scale; 'own' gets a separate pane. */
  pane: 'price' | 'own';
  needs: ('ohlc' | 'volume')[];
  unavailable?: string;
  params: ParamDef[];
  description: string;
  compute: (bars: Bar[], p: Record<string, number>, ctx: { periodsPerYear: number }) => Computed;
}

// ---------------------------------------------------------------------------------------------------------------
// Building blocks

const finite = (v: number) => (Number.isFinite(v) ? v : null);

/** Apply `fn` to each full window of `n` non-null values ending at i; null where the window is incomplete. */
export function rolling(values: Series, n: number, fn: (w: number[]) => number | null): Series {
  const out: Series = new Array(values.length).fill(null);
  if (n < 1) return out;
  for (let i = n - 1; i < values.length; i++) {
    const w: number[] = [];
    for (let j = i - n + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) break;
      w.push(v);
    }
    if (w.length === n) out[i] = fn(w);
  }
  return out;
}

const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);
const mean = (w: number[]) => sum(w) / w.length;
const popStd = (w: number[]) => {
  const m = mean(w);
  return Math.sqrt(mean(w.map((x) => (x - m) ** 2)));
};

export const sma = (v: Series, n: number) => rolling(v, n, mean);

/** Recursive average with factor `alpha`, seeded with the SMA of the first `n` consecutive values. */
function recursive(v: Series, n: number, alpha: number): Series {
  const out: Series = new Array(v.length).fill(null);
  let prev: number | null = null;
  let run: number[] = [];
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (x == null) {
      if (prev === null) run = [];
      continue;
    }
    if (prev === null) {
      run.push(x);
      if (run.length === n) {
        prev = mean(run);
        out[i] = prev;
      }
    } else {
      prev = alpha * x + (1 - alpha) * prev;
      out[i] = prev;
    }
  }
  return out;
}

export const ema = (v: Series, n: number) => recursive(v, n, 2 / (n + 1));
/** Wilder's smoothing (also called SMMA or RMA). */
export const rma = (v: Series, n: number) => recursive(v, n, 1 / n);
export const wma = (v: Series, n: number) => rolling(v, n, (w) => sum(w.map((x, i) => x * (i + 1))) / ((n * (n + 1)) / 2));

/** Least-squares line through the window; returns [value at the newest point, slope]. */
function linreg(w: number[]): [number, number] {
  const n = w.length;
  const xm = (n - 1) / 2;
  const ym = mean(w);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - xm) * (w[i]! - ym);
    sxx += (i - xm) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return [ym + slope * (n - 1 - xm), slope];
}

const zip = (a: Series, b: Series, f: (x: number, y: number) => number | null): Series => a.map((x, i) => (x == null || b[i] == null ? null : f(x, b[i]!)));
const shift = (v: Series, k: number): Series => v.map((_, i) => (i - k >= 0 && i - k < v.length ? (v[i - k] ?? null) : null));
const change = (v: Series, k = 1): Series => v.map((x, i) => (i >= k && x != null && v[i - k] != null ? x - v[i - k]! : null));

const closes = (b: Bar[]) => b.map((x) => x.close);
const highs = (b: Bar[]) => b.map((x) => x.high);
const lows = (b: Bar[]) => b.map((x) => x.low);
const vols = (b: Bar[]) => b.map((x) => x.volume);
const hl2 = (b: Bar[]) => b.map((x) => (x.high + x.low) / 2);
const hlc3 = (b: Bar[]) => b.map((x) => (x.high + x.low + x.close) / 3);
const highest = (v: Series, n: number) => rolling(v, n, (w) => Math.max(...w));
const lowest = (v: Series, n: number) => rolling(v, n, (w) => Math.min(...w));

export function trueRange(b: Bar[]): Series {
  return b.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high, b[i - 1]!.close) - Math.min(x.low, b[i - 1]!.close)));
}

export function rsiOf(v: Series, n: number): Series {
  const ch = change(v);
  const up = rma(ch.map((c) => (c == null ? null : Math.max(c, 0))), n);
  const down = rma(ch.map((c) => (c == null ? null : Math.max(-c, 0))), n);
  return zip(up, down, (u, d) => (d === 0 ? (u === 0 ? 50 : 100) : 100 - 100 / (1 + u / d)));
}

function bands(c: Series, n: number, k: number) {
  const mid = sma(c, n);
  const sd = rolling(c, n, popStd);
  return { mid, upper: zip(mid, sd, (m, s) => m + k * s), lower: zip(mid, sd, (m, s) => m - k * s) };
}

function stochOf(src: Series, hi: Series, lo: Series, n: number): Series {
  const hh = highest(hi, n);
  const ll = lowest(lo, n);
  return src.map((c, i) => (c == null || hh[i] == null || ll[i] == null || hh[i] === ll[i] ? null : (100 * (c - ll[i]!)) / (hh[i]! - ll[i]!)));
}

/** Bars-since-extreme for Aroon: 0 when the extreme is the current bar, up to n. */
function barsSince(v: number[], n: number, pick: (a: number, b: number) => boolean): Series {
  return v.map((_, i) => {
    if (i < n) return null;
    let best = i;
    for (let j = i - 1; j >= i - n; j--) if (pick(v[j]!, v[best]!)) best = j;
    return i - best;
  });
}

/** Directional movement (Wilder): +DI, -DI and ADX. */
function dmi(b: Bar[], n: number, smooth: number) {
  const plus: Series = b.map((x, i) => {
    if (i === 0) return null;
    const up = x.high - b[i - 1]!.high;
    const down = b[i - 1]!.low - x.low;
    return up > down && up > 0 ? up : 0;
  });
  const minus: Series = b.map((x, i) => {
    if (i === 0) return null;
    const up = x.high - b[i - 1]!.high;
    const down = b[i - 1]!.low - x.low;
    return down > up && down > 0 ? down : 0;
  });
  const tr = rma(trueRange(b).map((t, i) => (i === 0 ? null : t)), n);
  const pdi = zip(rma(plus, n), tr, (p, t) => (t === 0 ? 0 : (100 * p) / t));
  const mdi = zip(rma(minus, n), tr, (m, t) => (t === 0 ? 0 : (100 * m) / t));
  const dx = zip(pdi, mdi, (p, m) => (p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m)));
  return { pdi, mdi, adx: rma(dx, smooth) };
}

/** Money flow multiplier ((C − L) − (H − C)) / (H − L), 0 when the bar has no range. */
const mfm = (x: Bar) => (x.high === x.low ? 0 : (x.close - x.low - (x.high - x.close)) / (x.high - x.low));
function cumulative(v: Series): Series {
  let acc = 0;
  return v.map((x) => (x == null ? null : (acc += x)));
}
const accDist = (b: Bar[]) => cumulative(b.map((x) => mfm(x) * x.volume));

// ---------------------------------------------------------------------------------------------------------------
// Catalogue

const P = (key: string, label: string, def: number, min = 1, max = 500, step = 1): ParamDef => ({ key, label, default: def, min, max, step });
const LEN = (def: number) => P('length', 'Length', def);
const GOLD = '#c9a35a';
const PLAT = '#e6e4de';
const BLUE = '#7d9cc0';
const VIOLET = '#9d8bb8';
const GREEN = '#5e9f7e';
const RED = '#c2605b';
const line = (key: string, label: string, values: Series, color = GOLD): Output => ({ key, label, values, style: 'line', color });
const hist = (key: string, label: string, values: Series, color = BLUE): Output => ({ key, label, values, style: 'histogram', color });

function ma(id: string, name: string, short: string, description: string, def: number, f: (c: Series, n: number, b: Bar[]) => Series, needs: IndicatorDef['needs'] = []): IndicatorDef {
  return { id, name, short, category: 'Moving averages', pane: 'price', needs, params: [LEN(def)], description, compute: (b, p) => ({ outputs: [line('ma', short, f(closes(b), p.length!, b))] }) };
}

export const INDICATORS: IndicatorDef[] = [
  // Moving averages
  ma('sma', 'Simple Moving Average', 'SMA', 'Average of the last n closes.', 20, sma),
  ma('ema', 'Exponential Moving Average', 'EMA', 'Weights recent closes more: α = 2 / (n + 1).', 20, ema),
  ma('wma', 'Weighted Moving Average', 'WMA', 'Linear weights 1…n, newest heaviest.', 20, wma),
  ma('vwma', 'Volume Weighted Moving Average', 'VWMA', 'Σ(close × volume) / Σ volume over n bars.', 20, (_c, n, b) => {
    const pv = rolling(b.map((x) => x.close * x.volume), n, sum);
    const v = rolling(vols(b), n, sum);
    return zip(pv, v, (a, d) => (d === 0 ? null : a / d));
  }, ['volume']),
  ma('smma', 'Smoothed Moving Average', 'SMMA', "Wilder's smoothing: α = 1 / n.", 20, rma),
  ma('dema', 'Double Exponential Moving Average', 'DEMA', '2 × EMA − EMA(EMA). Less lag than an EMA.', 20, (c, n) => {
    const e1 = ema(c, n);
    return zip(e1, ema(e1, n), (a, b) => 2 * a - b);
  }),
  ma('tema', 'Triple Exponential Moving Average', 'TEMA', '3 × EMA − 3 × EMA² + EMA³.', 20, (c, n) => {
    const e1 = ema(c, n);
    const e2 = ema(e1, n);
    const e3 = ema(e2, n);
    return e1.map((a, i) => (a == null || e2[i] == null || e3[i] == null ? null : 3 * a - 3 * e2[i]! + e3[i]!));
  }),
  ma('hma', 'Hull Moving Average', 'HMA', 'WMA(2 × WMA(n/2) − WMA(n), √n).', 9, (c, n) => {
    const raw = zip(wma(c, Math.max(1, Math.floor(n / 2))), wma(c, n), (a, b) => 2 * a - b);
    return wma(raw, Math.max(1, Math.floor(Math.sqrt(n))));
  }),
  ma('lsma', 'Least Squares Moving Average', 'LSMA', 'End point of the least-squares line through the last n closes (linear regression curve).', 25, (c, n) => rolling(c, n, (w) => linreg(w)[0])),
  {
    id: 'alma',
    name: 'Arnaud Legoux Moving Average',
    short: 'ALMA',
    category: 'Moving averages',
    pane: 'price',
    needs: [],
    params: [LEN(9), P('offset', 'Offset', 0.85, 0, 1, 0.05), P('sigma', 'Sigma', 6, 1, 20, 0.5)],
    description: 'Gaussian-weighted average centred at offset × (n − 1), width n / sigma.',
    compute: (b, p) => {
      const n = p.length!;
      const m = p.offset! * (n - 1);
      const s = n / p.sigma!;
      const w = Array.from({ length: n }, (_, i) => Math.exp(-((i - m) ** 2) / (2 * s * s)));
      const ws = sum(w);
      return { outputs: [line('ma', 'ALMA', rolling(closes(b), n, (x) => sum(x.map((v, i) => v * w[i]!)) / ws))] };
    },
  },
  ma('mcginley', 'McGinley Dynamic', 'McGinley', 'MD = MD₁ + (C − MD₁) / (n × (C / MD₁)⁴), seeded with an EMA.', 14, (c, n) => {
    const seed = ema(c, n);
    const out: Series = new Array(c.length).fill(null);
    let md: number | null = null;
    for (let i = 0; i < c.length; i++) {
      const x = c[i]!;
      if (md === null) md = seed[i] ?? null;
      else md = md + (x - md) / (n * (x / md) ** 4);
      out[i] = md === null ? null : finite(md);
    }
    return out;
  }),
  {
    id: 'kama',
    name: 'Adaptive Moving Average (Kaufman)',
    short: 'KAMA',
    category: 'Moving averages',
    pane: 'price',
    needs: [],
    params: [LEN(10), P('fast', 'Fast', 2, 1, 50), P('slow', 'Slow', 30, 2, 200)],
    description: 'Speeds up in trends and slows in noise using the efficiency ratio |C − Cₙ| / Σ|ΔC|.',
    compute: (b, p) => {
      const c = closes(b);
      const n = p.length!;
      const f = 2 / (p.fast! + 1);
      const s = 2 / (p.slow! + 1);
      const out: Series = new Array(c.length).fill(null);
      let k: number | null = null;
      for (let i = n; i < c.length; i++) {
        let vol = 0;
        for (let j = i - n + 1; j <= i; j++) vol += Math.abs(c[j]! - c[j - 1]!);
        const er = vol === 0 ? 0 : Math.abs(c[i]! - c[i - n]!) / vol;
        const sc = (er * (f - s) + s) ** 2;
        k = (k ?? c[i - 1]!) + sc * (c[i]! - (k ?? c[i - 1]!));
        out[i] = k;
      }
      return { outputs: [line('ma', 'KAMA', out)] };
    },
  },
  {
    id: 'ma-cross',
    name: 'Moving Average Cross',
    short: 'MA Cross',
    category: 'Moving averages',
    pane: 'price',
    needs: [],
    params: [P('fast', 'Fast length', 50), P('slow', 'Slow length', 200)],
    description: 'Fast and slow simple moving averages. Crossings are often watched as trend changes.',
    compute: (b, p) => ({ outputs: [line('fast', `SMA ${p.fast}`, sma(closes(b), p.fast!), GOLD), line('slow', `SMA ${p.slow}`, sma(closes(b), p.slow!), BLUE)] }),
  },
  {
    id: 'ema-cross',
    name: 'EMA Cross',
    short: 'EMA Cross',
    category: 'Moving averages',
    pane: 'price',
    needs: [],
    params: [P('fast', 'Fast length', 9), P('slow', 'Slow length', 21)],
    description: 'Fast and slow exponential moving averages.',
    compute: (b, p) => ({ outputs: [line('fast', `EMA ${p.fast}`, ema(closes(b), p.fast!), GOLD), line('slow', `EMA ${p.slow}`, ema(closes(b), p.slow!), BLUE)] }),
  },
  {
    id: 'envelopes',
    name: 'Envelopes',
    short: 'Env',
    category: 'Moving averages',
    pane: 'price',
    needs: [],
    params: [LEN(20), P('percent', 'Percent', 2.5, 0.1, 50, 0.1)],
    description: 'SMA with bands a fixed percentage above and below.',
    compute: (b, p) => {
      const m = sma(closes(b), p.length!);
      const k = p.percent! / 100;
      return { outputs: [line('upper', 'Upper', m.map((x) => (x == null ? null : x * (1 + k))), VIOLET), line('basis', 'Basis', m), line('lower', 'Lower', m.map((x) => (x == null ? null : x * (1 - k))), VIOLET)] };
    },
  },

  // Trend
  {
    id: 'bb',
    name: 'Bollinger Bands',
    short: 'BB',
    category: 'Volatility',
    pane: 'price',
    needs: [],
    params: [LEN(20), P('mult', 'Standard deviations', 2, 0.1, 10, 0.1)],
    description: 'SMA ± k population standard deviations of the close.',
    compute: (b, p) => {
      const x = bands(closes(b), p.length!, p.mult!);
      return { outputs: [line('upper', 'Upper', x.upper, VIOLET), line('basis', 'Basis', x.mid), line('lower', 'Lower', x.lower, VIOLET)] };
    },
  },
  {
    id: 'donchian',
    name: 'Donchian Channels',
    short: 'DC',
    category: 'Trend',
    pane: 'price',
    needs: ['ohlc'],
    params: [LEN(20)],
    description: 'Highest high and lowest low of the last n bars, with their midpoint.',
    compute: (b, p) => {
      const u = highest(highs(b), p.length!);
      const l = lowest(lows(b), p.length!);
      return { outputs: [line('upper', 'Upper', u, BLUE), line('basis', 'Basis', zip(u, l, (a, c) => (a + c) / 2)), line('lower', 'Lower', l, BLUE)] };
    },
  },
  {
    id: 'keltner',
    name: 'Keltner Channels',
    short: 'KC',
    category: 'Trend',
    pane: 'price',
    needs: ['ohlc'],
    params: [LEN(20), P('mult', 'Multiplier', 2, 0.1, 10, 0.1), P('atr', 'ATR length', 10)],
    description: 'EMA ± multiplier × ATR.',
    compute: (b, p) => {
      const m = ema(closes(b), p.length!);
      const a = rma(trueRange(b), p.atr!);
      return { outputs: [line('upper', 'Upper', zip(m, a, (x, y) => x + p.mult! * y), BLUE), line('basis', 'Basis', m), line('lower', 'Lower', zip(m, a, (x, y) => x - p.mult! * y), BLUE)] };
    },
  },
  {
    id: 'ichimoku',
    name: 'Ichimoku Cloud',
    short: 'Ichimoku',
    category: 'Trend',
    pane: 'price',
    needs: ['ohlc'],
    params: [P('conversion', 'Conversion line', 9), P('base', 'Base line', 26), P('spanB', 'Leading span B', 52), P('lag', 'Displacement', 26)],
    description: 'Midpoints of high–low ranges. Leading spans are shifted forward and the lagging span back; parts beyond the last bar are not drawn.',
    compute: (b, p) => {
      const mid = (n: number) => zip(highest(highs(b), n), lowest(lows(b), n), (h, l) => (h + l) / 2);
      const conv = mid(p.conversion!);
      const base = mid(p.base!);
      const lag = p.lag! - 1;
      return {
        outputs: [
          line('conversion', 'Conversion', conv, BLUE),
          line('base', 'Base', base, RED),
          line('spanA', 'Leading span A', shift(zip(conv, base, (x, y) => (x + y) / 2), lag), GREEN),
          line('spanB', 'Leading span B', shift(mid(p.spanB!), lag), VIOLET),
          line('lagging', 'Lagging span', shift(closes(b), -lag), PLAT),
        ],
      };
    },
  },
  {
    id: 'aroon',
    name: 'Aroon',
    short: 'Aroon',
    category: 'Trend',
    pane: 'own',
    needs: ['ohlc'],
    params: [LEN(14)],
    description: '100 × (n − bars since the highest high or lowest low in the last n + 1 bars) / n.',
    compute: (b, p) => {
      const n = p.length!;
      const up = barsSince(highs(b), n, (a, c) => a > c).map((x) => (x == null ? null : (100 * (n - x)) / n));
      const down = barsSince(lows(b), n, (a, c) => a < c).map((x) => (x == null ? null : (100 * (n - x)) / n));
      return { outputs: [line('up', 'Up', up, GREEN), line('down', 'Down', down, RED)] };
    },
  },
  {
    id: 'adx',
    name: 'Average Directional Index',
    short: 'ADX',
    category: 'Trend',
    pane: 'own',
    needs: ['ohlc'],
    params: [P('smoothing', 'ADX smoothing', 14), P('length', 'DI length', 14)],
    description: 'Strength of a trend regardless of direction: Wilder-smoothed DX.',
    compute: (b, p) => ({ outputs: [line('adx', 'ADX', dmi(b, p.length!, p.smoothing!).adx)], levels: [25] }),
  },
  {
    id: 'dmi',
    name: 'Directional Movement Index',
    short: 'DMI',
    category: 'Trend',
    pane: 'own',
    needs: ['ohlc'],
    params: [P('length', 'DI length', 14), P('smoothing', 'ADX smoothing', 14)],
    description: '+DI and −DI (Wilder) with the ADX.',
    compute: (b, p) => {
      const d = dmi(b, p.length!, p.smoothing!);
      return { outputs: [line('pdi', '+DI', d.pdi, GREEN), line('mdi', '−DI', d.mdi, RED), line('adx', 'ADX', d.adx)] };
    },
  },
  {
    id: 'vortex',
    name: 'Vortex Indicator',
    short: 'VI',
    category: 'Trend',
    pane: 'own',
    needs: ['ohlc'],
    params: [LEN(14)],
    description: 'VI+ = Σ|H − L₁| / Σ TR and VI− = Σ|L − H₁| / Σ TR over n bars.',
    compute: (b, p) => {
      const n = p.length!;
      const vp: Series = b.map((x, i) => (i === 0 ? null : Math.abs(x.high - b[i - 1]!.low)));
      const vm: Series = b.map((x, i) => (i === 0 ? null : Math.abs(x.low - b[i - 1]!.high)));
      const tr = rolling(trueRange(b).map((t, i) => (i === 0 ? null : t)), n, sum);
      return { outputs: [line('plus', 'VI+', zip(rolling(vp, n, sum), tr, (a, t) => (t === 0 ? null : a / t)), GREEN), line('minus', 'VI−', zip(rolling(vm, n, sum), tr, (a, t) => (t === 0 ? null : a / t)), RED)] };
    },
  },
  {
    id: 'linreg-slope',
    name: 'Linear Regression Slope',
    short: 'LR slope',
    category: 'Trend',
    pane: 'own',
    needs: [],
    params: [LEN(14)],
    description: 'Slope of the least-squares line through the last n closes, in price per bar.',
    compute: (b, p) => ({ outputs: [line('slope', 'Slope', rolling(closes(b), p.length!, (w) => linreg(w)[1]))], levels: [0] }),
  },
  {
    id: 'hl52',
    name: '52 Week High/Low',
    short: '52W H/L',
    category: 'Price analysis',
    pane: 'price',
    needs: ['ohlc'],
    params: [],
    description: 'Highest high and lowest low of the preceding 52 weeks (by date, whatever the interval).',
    compute: (b) => {
      const hi: Series = [];
      const lo: Series = [];
      let start = 0;
      for (let i = 0; i < b.length; i++) {
        const cutoff = new Date(Date.parse(b[i]!.time) - 364 * 86_400_000).toISOString().slice(0, 10);
        while (b[start]!.time < cutoff) start++;
        let h = -Infinity;
        let l = Infinity;
        for (let j = start; j <= i; j++) {
          h = Math.max(h, b[j]!.high);
          l = Math.min(l, b[j]!.low);
        }
        hi.push(h);
        lo.push(l);
      }
      return { outputs: [line('high', '52W high', hi, GREEN), line('low', '52W low', lo, RED)] };
    },
  },
  {
    id: 'typical',
    name: 'Typical Price',
    short: 'HLC3',
    category: 'Price analysis',
    pane: 'price',
    needs: ['ohlc'],
    params: [],
    description: '(High + Low + Close) / 3.',
    compute: (b) => ({ outputs: [line('v', 'Typical', hlc3(b), PLAT)] }),
  },
  {
    id: 'median',
    name: 'Median Price',
    short: 'HL2',
    category: 'Price analysis',
    pane: 'price',
    needs: ['ohlc'],
    params: [],
    description: '(High + Low) / 2.',
    compute: (b) => ({ outputs: [line('v', 'Median', hl2(b), PLAT)] }),
  },
  {
    id: 'average',
    name: 'Average Price',
    short: 'OHLC4',
    category: 'Price analysis',
    pane: 'price',
    needs: ['ohlc'],
    params: [],
    description: '(Open + High + Low + Close) / 4.',
    compute: (b) => ({ outputs: [line('v', 'Average', b.map((x) => (x.open + x.high + x.low + x.close) / 4), PLAT)] }),
  },

  // Momentum
  {
    id: 'rsi',
    name: 'Relative Strength Index',
    short: 'RSI',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [LEN(14)],
    description: "100 − 100 / (1 + average gain / average loss), Wilder's smoothing.",
    compute: (b, p) => ({ outputs: [line('rsi', 'RSI', rsiOf(closes(b), p.length!))], levels: [70, 30] }),
  },
  {
    id: 'macd',
    name: 'MACD',
    short: 'MACD',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [P('fast', 'Fast length', 12), P('slow', 'Slow length', 26), P('signal', 'Signal length', 9)],
    description: 'EMA(fast) − EMA(slow), its EMA signal line and the difference as a histogram.',
    compute: (b, p) => {
      const c = closes(b);
      const m = zip(ema(c, p.fast!), ema(c, p.slow!), (a, d) => a - d);
      const s = ema(m, p.signal!);
      return { outputs: [hist('hist', 'Histogram', zip(m, s, (a, d) => a - d), '#6f6c66'), line('macd', 'MACD', m), line('signal', 'Signal', s, BLUE)], levels: [0] };
    },
  },
  {
    id: 'ppo',
    name: 'Price Oscillator (PPO)',
    short: 'PPO',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [P('fast', 'Fast length', 12), P('slow', 'Slow length', 26), P('signal', 'Signal length', 9)],
    description: '100 × (EMA(fast) − EMA(slow)) / EMA(slow), with a signal line.',
    compute: (b, p) => {
      const c = closes(b);
      const m = zip(ema(c, p.fast!), ema(c, p.slow!), (a, d) => (d === 0 ? null : (100 * (a - d)) / d));
      const s = ema(m, p.signal!);
      return { outputs: [hist('hist', 'Histogram', zip(m, s, (a, d) => a - d), '#6f6c66'), line('ppo', 'PPO', m), line('signal', 'Signal', s, BLUE)], levels: [0] };
    },
  },
  {
    id: 'stoch',
    name: 'Stochastic',
    short: 'Stoch',
    category: 'Momentum',
    pane: 'own',
    needs: ['ohlc'],
    params: [P('k', '%K length', 14), P('smoothK', '%K smoothing', 1), P('d', '%D smoothing', 3)],
    description: '%K = 100 × (C − lowest low) / (highest high − lowest low), smoothed; %D = SMA of %K.',
    compute: (b, p) => {
      const k = sma(stochOf(closes(b), highs(b), lows(b), p.k!), p.smoothK!);
      return { outputs: [line('k', '%K', k, BLUE), line('d', '%D', sma(k, p.d!))], levels: [80, 20] };
    },
  },
  {
    id: 'stochrsi',
    name: 'Stochastic RSI',
    short: 'Stoch RSI',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [P('rsi', 'RSI length', 14), P('stoch', 'Stochastic length', 14), P('k', '%K smoothing', 3), P('d', '%D smoothing', 3)],
    description: 'The stochastic formula applied to RSI values.',
    compute: (b, p) => {
      const r = rsiOf(closes(b), p.rsi!);
      const k = sma(stochOf(r, r, r, p.stoch!), p.k!);
      return { outputs: [line('k', '%K', k, BLUE), line('d', '%D', sma(k, p.d!))], levels: [80, 20] };
    },
  },
  {
    id: 'cci',
    name: 'Commodity Channel Index',
    short: 'CCI',
    category: 'Momentum',
    pane: 'own',
    needs: ['ohlc'],
    params: [LEN(20)],
    description: '(Typical price − its SMA) / (0.015 × mean absolute deviation).',
    compute: (b, p) => {
      const tp = hlc3(b);
      const out = rolling(tp, p.length!, (w) => {
        const m = mean(w);
        const md = mean(w.map((x) => Math.abs(x - m)));
        return md === 0 ? null : (w.at(-1)! - m) / (0.015 * md);
      });
      return { outputs: [line('cci', 'CCI', out)], levels: [100, -100] };
    },
  },
  {
    id: 'willr',
    name: 'Williams %R',
    short: '%R',
    category: 'Momentum',
    pane: 'own',
    needs: ['ohlc'],
    params: [LEN(14)],
    description: '−100 × (highest high − C) / (highest high − lowest low).',
    compute: (b, p) => ({ outputs: [line('r', '%R', stochOf(closes(b), highs(b), lows(b), p.length!).map((x) => (x == null ? null : x - 100)))], levels: [-20, -80] }),
  },
  {
    id: 'roc',
    name: 'Rate of Change',
    short: 'ROC',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [LEN(9)],
    description: '100 × (C − Cₙ) / Cₙ.',
    compute: (b, p) => {
      const c = closes(b);
      const n = p.length!;
      return { outputs: [line('roc', 'ROC', c.map((x, i) => (i < n || c[i - n] === 0 ? null : (100 * (x - c[i - n]!)) / c[i - n]!)))], levels: [0] };
    },
  },
  {
    id: 'mom',
    name: 'Momentum',
    short: 'Mom',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [LEN(10)],
    description: 'C − Cₙ.',
    compute: (b, p) => ({ outputs: [line('mom', 'Momentum', change(closes(b), p.length!))], levels: [0] }),
  },
  {
    id: 'ao',
    name: 'Awesome Oscillator',
    short: 'AO',
    category: 'Momentum',
    pane: 'own',
    needs: ['ohlc'],
    params: [],
    description: 'SMA(5) − SMA(34) of the median price.',
    compute: (b) => ({ outputs: [hist('ao', 'AO', zip(sma(hl2(b), 5), sma(hl2(b), 34), (a, d) => a - d), GREEN)], levels: [0] }),
  },
  {
    id: 'trix',
    name: 'TRIX',
    short: 'TRIX',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [LEN(18)],
    description: '100 × one-bar rate of change of a triple-smoothed EMA of the close.',
    compute: (b, p) => {
      const n = p.length!;
      const e3 = ema(ema(ema(closes(b), n), n), n);
      return { outputs: [line('trix', 'TRIX', e3.map((x, i) => (x == null || i === 0 || e3[i - 1] == null || e3[i - 1] === 0 ? null : (100 * (x - e3[i - 1]!)) / e3[i - 1]!)))], levels: [0] };
    },
  },
  {
    id: 'cmo',
    name: 'Chande Momentum Oscillator',
    short: 'CMO',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [LEN(9)],
    description: '100 × (Σ gains − Σ losses) / (Σ gains + Σ losses) over n bars.',
    compute: (b, p) => {
      const ch = change(closes(b));
      const up = rolling(ch.map((c) => (c == null ? null : Math.max(c, 0))), p.length!, sum);
      const dn = rolling(ch.map((c) => (c == null ? null : Math.max(-c, 0))), p.length!, sum);
      return { outputs: [line('cmo', 'CMO', zip(up, dn, (u, d) => (u + d === 0 ? 0 : (100 * (u - d)) / (u + d))))], levels: [50, -50] };
    },
  },
  {
    id: 'uo',
    name: 'Ultimate Oscillator',
    short: 'UO',
    category: 'Momentum',
    pane: 'own',
    needs: ['ohlc'],
    params: [P('fast', 'Fast', 7), P('middle', 'Middle', 14), P('slow', 'Slow', 28)],
    description: '100 × (4·A₁ + 2·A₂ + A₃) / 7, where A = Σ buying pressure / Σ true range over each length.',
    compute: (b, p) => {
      const bp: Series = b.map((x, i) => (i === 0 ? null : x.close - Math.min(x.low, b[i - 1]!.close)));
      const tr: Series = trueRange(b).map((t, i) => (i === 0 ? null : t));
      const avg = (n: number) => zip(rolling(bp, n, sum), rolling(tr, n, sum), (a, t) => (t === 0 ? null : a / t));
      const a1 = avg(p.fast!);
      const a2 = avg(p.middle!);
      const a3 = avg(p.slow!);
      return { outputs: [line('uo', 'UO', a1.map((x, i) => (x == null || a2[i] == null || a3[i] == null ? null : (100 * (4 * x + 2 * a2[i]! + a3[i]!)) / 7)))], levels: [70, 30] };
    },
  },
  {
    id: 'bop',
    name: 'Balance of Power',
    short: 'BoP',
    category: 'Momentum',
    pane: 'own',
    needs: ['ohlc'],
    params: [],
    description: '(Close − Open) / (High − Low); 0 for bars with no range.',
    compute: (b) => ({ outputs: [hist('bop', 'BoP', b.map((x) => (x.high === x.low ? 0 : (x.close - x.open) / (x.high - x.low))), BLUE)], levels: [0] }),
  },
  {
    id: 'coppock',
    name: 'Coppock Curve',
    short: 'Coppock',
    category: 'Momentum',
    pane: 'own',
    needs: [],
    params: [P('wma', 'WMA length', 10), P('long', 'Long ROC', 14), P('short', 'Short ROC', 11)],
    description: 'WMA of the sum of a long and a short rate of change.',
    compute: (b, p) => {
      const c = closes(b);
      const roc = (n: number): Series => c.map((x, i) => (i < n || c[i - n] === 0 ? null : (100 * (x - c[i - n]!)) / c[i - n]!));
      return { outputs: [line('c', 'Coppock', wma(zip(roc(p.long!), roc(p.short!), (a, d) => a + d), p.wma!))], levels: [0] };
    },
  },
  {
    id: 'massindex',
    name: 'Mass Index',
    short: 'Mass',
    category: 'Volatility',
    pane: 'own',
    needs: ['ohlc'],
    params: [LEN(25), P('ema', 'EMA length', 9)],
    description: 'Σ over n bars of EMA(H − L) / EMA(EMA(H − L)). Range widening shows as a rising value.',
    compute: (b, p) => {
      const r = b.map((x) => x.high - x.low);
      const e1 = ema(r, p.ema!);
      return { outputs: [line('mass', 'Mass', rolling(zip(e1, ema(e1, p.ema!), (a, d) => (d === 0 ? null : a / d)), p.length!, sum))] };
    },
  },
  {
    id: 'chop',
    name: 'Choppiness Index',
    short: 'CHOP',
    category: 'Volatility',
    pane: 'own',
    needs: ['ohlc'],
    params: [LEN(14)],
    description: '100 × log₁₀(Σ true range / (highest high − lowest low)) / log₁₀(n). High values mean sideways movement.',
    compute: (b, p) => {
      const n = p.length!;
      const tr = rolling(trueRange(b), n, sum);
      const rng = zip(highest(highs(b), n), lowest(lows(b), n), (h, l) => h - l);
      return { outputs: [line('chop', 'CHOP', zip(tr, rng, (t, r) => (r === 0 || n < 2 ? null : (100 * Math.log10(t / r)) / Math.log10(n))))], levels: [61.8, 38.2] };
    },
  },

  // Volatility
  {
    id: 'atr',
    name: 'Average True Range',
    short: 'ATR',
    category: 'Volatility',
    pane: 'own',
    needs: ['ohlc'],
    params: [LEN(14)],
    description: "Wilder's average of the true range max(H, C₁) − min(L, C₁).",
    compute: (b, p) => ({ outputs: [line('atr', 'ATR', rma(trueRange(b), p.length!))] }),
  },
  {
    id: 'stdev',
    name: 'Standard Deviation',
    short: 'StDev',
    category: 'Volatility',
    pane: 'own',
    needs: [],
    params: [LEN(20)],
    description: 'Population standard deviation of the last n closes.',
    compute: (b, p) => ({ outputs: [line('sd', 'StDev', rolling(closes(b), p.length!, popStd))] }),
  },
  {
    id: 'hv',
    name: 'Historical Volatility',
    short: 'HV',
    category: 'Volatility',
    pane: 'own',
    needs: [],
    params: [LEN(20)],
    description: '100 × sample standard deviation of log returns × √(bars per year), as an annual percentage.',
    compute: (b, p, ctx) => {
      const c = closes(b);
      const r: Series = c.map((x, i) => (i === 0 || c[i - 1]! <= 0 || x <= 0 ? null : Math.log(x / c[i - 1]!)));
      const n = p.length!;
      return {
        outputs: [
          line(
            'hv',
            'HV %',
            rolling(r, n, (w) => {
              if (n < 2) return null;
              const m = mean(w);
              return 100 * Math.sqrt(sum(w.map((x) => (x - m) ** 2)) / (n - 1)) * Math.sqrt(ctx.periodsPerYear);
            }),
          ),
        ],
      };
    },
  },
  {
    id: 'bbpctb',
    name: 'Bollinger Bands %B',
    short: '%B',
    category: 'Volatility',
    pane: 'own',
    needs: [],
    params: [LEN(20), P('mult', 'Standard deviations', 2, 0.1, 10, 0.1)],
    description: '(C − lower band) / (upper band − lower band).',
    compute: (b, p) => {
      const x = bands(closes(b), p.length!, p.mult!);
      return { outputs: [line('b', '%B', closes(b).map((c, i) => (x.upper[i] == null || x.lower[i] == null || x.upper[i] === x.lower[i] ? null : (c - x.lower[i]!) / (x.upper[i]! - x.lower[i]!))))], levels: [1, 0] };
    },
  },
  {
    id: 'bbwidth',
    name: 'Bollinger Bands Width',
    short: 'BBW',
    category: 'Volatility',
    pane: 'own',
    needs: [],
    params: [LEN(20), P('mult', 'Standard deviations', 2, 0.1, 10, 0.1)],
    description: '(Upper band − lower band) / middle band.',
    compute: (b, p) => {
      const x = bands(closes(b), p.length!, p.mult!);
      return { outputs: [line('w', 'Width', x.mid.map((m, i) => (m == null || m === 0 || x.upper[i] == null ? null : (x.upper[i]! - x.lower[i]!) / m)))] };
    },
  },

  // Volume
  {
    id: 'volume',
    name: 'Volume',
    short: 'Vol',
    category: 'Volume',
    pane: 'own',
    needs: ['volume'],
    params: [],
    description: 'Traded volume per bar, coloured by the bar direction.',
    compute: (b) => ({ outputs: [hist('vol', 'Volume', vols(b), '#6f6c66')] }),
  },
  {
    id: 'obv',
    name: 'On Balance Volume',
    short: 'OBV',
    category: 'Volume',
    pane: 'own',
    needs: ['volume'],
    params: [],
    description: 'Running total of volume, added on up closes and subtracted on down closes.',
    compute: (b) => ({ outputs: [line('obv', 'OBV', cumulative(b.map((x, i) => (i === 0 ? 0 : Math.sign(x.close - b[i - 1]!.close) * x.volume))))] }),
  },
  {
    id: 'mfi',
    name: 'Money Flow Index',
    short: 'MFI',
    category: 'Volume',
    pane: 'own',
    needs: ['ohlc', 'volume'],
    params: [LEN(14)],
    description: '100 − 100 / (1 + positive money flow / negative money flow) over n bars, using typical price × volume.',
    compute: (b, p) => {
      const tp = hlc3(b);
      const pos: Series = tp.map((t, i) => (i === 0 ? null : t > tp[i - 1]! ? t * b[i]!.volume : 0));
      const neg: Series = tp.map((t, i) => (i === 0 ? null : t < tp[i - 1]! ? t * b[i]!.volume : 0));
      return { outputs: [line('mfi', 'MFI', zip(rolling(pos, p.length!, sum), rolling(neg, p.length!, sum), (u, d) => (d === 0 ? (u === 0 ? 50 : 100) : 100 - 100 / (1 + u / d))))], levels: [80, 20] };
    },
  },
  {
    id: 'cmf',
    name: 'Chaikin Money Flow',
    short: 'CMF',
    category: 'Volume',
    pane: 'own',
    needs: ['ohlc', 'volume'],
    params: [LEN(20)],
    description: 'Σ(money flow multiplier × volume) / Σ volume over n bars.',
    compute: (b, p) => ({ outputs: [line('cmf', 'CMF', zip(rolling(b.map((x) => mfm(x) * x.volume), p.length!, sum), rolling(vols(b), p.length!, sum), (a, v) => (v === 0 ? null : a / v)))], levels: [0] }),
  },
  {
    id: 'ad',
    name: 'Accumulation/Distribution',
    short: 'A/D',
    category: 'Volume',
    pane: 'own',
    needs: ['ohlc', 'volume'],
    params: [],
    description: 'Running total of money flow multiplier × volume.',
    compute: (b) => ({ outputs: [line('ad', 'A/D', accDist(b))] }),
  },
  {
    id: 'chaikinosc',
    name: 'Chaikin Oscillator',
    short: 'Chaikin Osc',
    category: 'Volume',
    pane: 'own',
    needs: ['ohlc', 'volume'],
    params: [P('fast', 'Fast', 3), P('slow', 'Slow', 10)],
    description: 'EMA(fast) − EMA(slow) of the accumulation/distribution line.',
    compute: (b, p) => {
      const ad = accDist(b);
      return { outputs: [line('osc', 'Chaikin', zip(ema(ad, p.fast!), ema(ad, p.slow!), (a, d) => a - d))], levels: [0] };
    },
  },
  {
    id: 'pvt',
    name: 'Price Volume Trend',
    short: 'PVT',
    category: 'Volume',
    pane: 'own',
    needs: ['volume'],
    params: [],
    description: 'Running total of volume × relative change in close.',
    compute: (b) => ({ outputs: [line('pvt', 'PVT', cumulative(b.map((x, i) => (i === 0 || b[i - 1]!.close === 0 ? 0 : ((x.close - b[i - 1]!.close) / b[i - 1]!.close) * x.volume))))] }),
  },
  {
    id: 'netvol',
    name: 'Net Volume',
    short: 'Net vol',
    category: 'Volume',
    pane: 'own',
    needs: ['volume'],
    params: [],
    description: 'Volume signed by the direction of the close.',
    compute: (b) => ({ outputs: [hist('nv', 'Net volume', b.map((x, i) => (i === 0 ? null : Math.sign(x.close - b[i - 1]!.close) * x.volume)), GREEN)], levels: [0] }),
  },
  {
    id: 'volosc',
    name: 'Volume Oscillator',
    short: 'Vol Osc',
    category: 'Volume',
    pane: 'own',
    needs: ['volume'],
    params: [P('fast', 'Fast', 5), P('slow', 'Slow', 10)],
    description: '100 × (EMA(fast) − EMA(slow)) / EMA(slow) of volume.',
    compute: (b, p) => ({ outputs: [line('vo', 'Vol Osc %', zip(ema(vols(b), p.fast!), ema(vols(b), p.slow!), (a, d) => (d === 0 ? null : (100 * (a - d)) / d)))], levels: [0] }),
  },
  {
    id: 'efi',
    name: "Elder's Force Index",
    short: 'EFI',
    category: 'Volume',
    pane: 'own',
    needs: ['volume'],
    params: [LEN(13)],
    description: 'EMA of (C − C₁) × volume.',
    compute: (b, p) => ({ outputs: [line('efi', 'EFI', ema(b.map((x, i) => (i === 0 ? null : (x.close - b[i - 1]!.close) * x.volume)), p.length!))], levels: [0] }),
  },
  {
    id: 'eom',
    name: 'Ease of Movement',
    short: 'EOM',
    category: 'Volume',
    pane: 'own',
    needs: ['ohlc', 'volume'],
    params: [LEN(14), P('divisor', 'Divisor', 10000, 1, 1e9, 1)],
    description: 'SMA of divisor × Δ(median price) × (H − L) / volume.',
    compute: (b, p) => {
      const m = hl2(b);
      return { outputs: [line('eom', 'EOM', sma(b.map((x, i) => (i === 0 || x.volume === 0 ? null : (p.divisor! * (m[i]! - m[i - 1]!) * (x.high - x.low)) / x.volume)), p.length!))], levels: [0] };
    },
  },
  {
    id: 'vwap',
    name: 'Volume Weighted Average Price',
    short: 'VWAP',
    category: 'Volume',
    pane: 'price',
    needs: ['ohlc', 'volume'],
    unavailable: 'Needs intraday prices and volume within each trading session. Not available until a licensed intraday source is connected.',
    params: [],
    description: 'Session-anchored Σ(typical price × volume) / Σ volume.',
    compute: () => ({ outputs: [] }),
  },
];

export const INDICATOR_MAP = new Map(INDICATORS.map((d) => [d.id, d]));

export function defaultParams(def: IndicatorDef): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

/** Clamp user input to each parameter's range and step; unknown keys are dropped, missing keys get defaults. */
export function sanitizeParams(def: IndicatorDef, raw: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params) {
    const v = Number(raw?.[p.key]);
    const x = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
    out[p.key] = p.step >= 1 ? Math.round(x) : x;
  }
  return out;
}

/** Why an indicator cannot be used with a dataset, or null when it can. */
export function indicatorBlocker(def: IndicatorDef, data: { hasOhlc: boolean; hasVolume: boolean }): string | null {
  if (def.unavailable) return def.unavailable;
  if (def.needs.includes('ohlc') && !data.hasOhlc) return 'Needs open, high and low prices. This source publishes closing values only.';
  if (def.needs.includes('volume') && !data.hasVolume) return 'Needs trading volume. This source does not publish volume.';
  return null;
}

/** Short legend label, e.g. "SMA 20" or "MACD 12 26 9". */
export function indicatorLabel(def: IndicatorDef, params: Record<string, number>): string {
  const vals = def.params.map((p) => params[p.key]);
  return vals.length ? `${def.short} ${vals.join(' ')}` : def.short;
}
