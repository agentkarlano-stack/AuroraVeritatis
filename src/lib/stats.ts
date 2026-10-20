export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return xs.length ? s / xs.length : NaN;
}

export function stdev(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i]! - m) ** 2;
  return Math.sqrt(s / (n - 1));
}

/** Linear-interpolated quantile of an ascending-sorted array (type 7, as in R/NumPy default). */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export interface Histogram {
  edges: number[];
  counts: number[];
}

export function histogram(xs: ArrayLike<number>, bins: number, min?: number, max?: number): Histogram {
  let lo = min ?? Infinity;
  let hi = max ?? -Infinity;
  if (min === undefined || max === undefined) {
    for (let i = 0; i < xs.length; i++) {
      if (min === undefined) lo = Math.min(lo, xs[i]!);
      if (max === undefined) hi = Math.max(hi, xs[i]!);
    }
  }
  if (hi === lo) hi = lo + 1;
  const width = (hi - lo) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((xs[i]! - lo) / width)));
    counts[b]!++;
  }
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * width), counts };
}
