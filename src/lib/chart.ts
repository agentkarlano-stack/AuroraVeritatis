export interface ChartPoint {
  /** YYYY-MM-DD */
  time: string;
  price: number;
}

export type Drawing =
  | { id: string; kind: 'hline'; price: number }
  | { id: string; kind: 'trend'; a: ChartPoint; b: ChartPoint }
  /** Fibonacci retracement of the move from `a` to `b`: 0% at `b`, 100% at `a`. */
  | { id: string; kind: 'fib'; a: ChartPoint; b: ChartPoint };

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** Retracement levels of the move from `a` to `b` (price = b − (b − a) × ratio). */
export function fibLevels(d: Extract<Drawing, { kind: 'fib' }>): { ratio: number; price: number }[] {
  return FIB_RATIOS.map((ratio) => ({ ratio, price: d.b.price - (d.b.price - d.a.price) * ratio }));
}


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
export function trendPoints(d: Extract<Drawing, { kind: 'trend' | 'fib' }>): [ChartPoint, ChartPoint] | null {
  if (d.a.time === d.b.time) return null;
  return d.a.time < d.b.time ? [d.a, d.b] : [d.b, d.a];
}
