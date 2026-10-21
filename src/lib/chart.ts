export interface ChartOptions {
  style: 'candles' | 'line';
  sma20: boolean;
  sma50: boolean;
  ema20: boolean;
  bollinger: boolean;
  volume: boolean;
  rsi: boolean;
  events: boolean;
}

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  style: 'candles',
  sma20: true,
  sma50: false,
  ema20: false,
  bollinger: false,
  volume: true,
  rsi: false,
  events: true,
};

export interface ChartPoint {
  /** YYYY-MM-DD */
  time: string;
  price: number;
}

export type Drawing = { id: string; kind: 'hline'; price: number } | { id: string; kind: 'trend'; a: ChartPoint; b: ChartPoint };

export type DrawMode = 'none' | 'hline' | 'trend';

/** Lightweight Charts reports times as the input string or as a BusinessDay object; normalise to YYYY-MM-DD. */
export function timeToString(t: unknown): string | null {
  if (typeof t === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  if (t && typeof t === 'object' && 'year' in t && 'month' in t && 'day' in t) {
    const { year, month, day } = t as { year: number; month: number; day: number };
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/** Order trend-line points by time; returns null when both points fall on the same session (a vertical line). */
export function trendPoints(d: Extract<Drawing, { kind: 'trend' }>): [ChartPoint, ChartPoint] | null {
  if (d.a.time === d.b.time) return null;
  return d.a.time < d.b.time ? [d.a, d.b] : [d.b, d.a];
}
