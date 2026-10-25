/**
 * Triple barrier labelling (López de Prado, Advances in Financial Machine Learning, ch. 3) for research and validation,
 * never for order execution. For each long entry at a close, three barriers are set from information available at
 * that close only: an upper (profit) and lower (loss) barrier at k_up·σ and k_down·σ around the entry, where σ is the
 * exponentially weighted volatility of past returns, and a vertical barrier after `maxHold` periods. The first barrier
 * touched by a later close labels the event (+1 upper, −1 lower, 0 time limit). Costs are charged per round trip.
 */
import { mulberry32 } from './rng';

export interface BarrierParams {
  /** Upper barrier in units of σ (e.g. 2). */
  up: number;
  /** Lower barrier in units of σ (e.g. 1). */
  down: number;
  /** Vertical barrier: maximum holding periods. */
  maxHold: number;
  /** EWMA span for σ (periods). */
  volSpan: number;
  /** Round-trip cost in basis points (fees plus slippage). */
  costBps: number;
}

export interface BarrierEvent {
  entry: number;
  exit: number;
  /** +1 upper barrier, −1 lower barrier, 0 time limit. */
  label: 1 | -1 | 0;
  /** Net simple return of the trade after costs. */
  ret: number;
  upper: number;
  lower: number;
  sigma: number;
}

/** EWMA standard deviation of simple returns, using returns up to and including t (no look-ahead). */
export function ewmaVol(closes: number[], span: number): (number | null)[] {
  const alpha = 2 / (span + 1);
  const out: (number | null)[] = [null];
  let v: number | null = null;
  for (let t = 1; t < closes.length; t++) {
    const r = closes[t]! / closes[t - 1]! - 1;
    v = v == null ? r * r : alpha * r * r + (1 - alpha) * v;
    out.push(t >= span ? Math.sqrt(v) : null);
  }
  return out;
}

/** Entry signals: a fast moving average crossing above a slow one (computed from closes up to t). */
export function crossSignals(closes: number[], fast: number, slow: number): number[] {
  const sma = (n: number, t: number) => {
    let s = 0;
    for (let i = t - n + 1; i <= t; i++) s += closes[i]!;
    return s / n;
  };
  const out: number[] = [];
  for (let t = slow; t < closes.length; t++) {
    if (sma(fast, t - 1) <= sma(slow, t - 1) && sma(fast, t) > sma(slow, t)) out.push(t);
  }
  return out;
}

/** Labels each entry. Entries without enough history for σ, or too close to the end to resolve, are skipped. */
export function tripleBarrier(closes: number[], entries: number[], p: BarrierParams): BarrierEvent[] {
  if (!(p.up > 0) || !(p.down > 0) || !(p.maxHold >= 1)) throw new Error('Barriers and holding period must be positive.');
  const vol = ewmaVol(closes, p.volSpan);
  const cost = p.costBps / 10_000;
  const out: BarrierEvent[] = [];
  for (const e of entries) {
    const sigma = vol[e];
    if (sigma == null || !(sigma > 0) || e >= closes.length - 1) continue;
    const c0 = closes[e]!;
    // Barrier widths scale with the holding horizon (σ√h), so they are comparable across holding periods.
    const width = sigma * Math.sqrt(p.maxHold);
    const upper = c0 * (1 + p.up * width);
    const lower = c0 * (1 - p.down * width);
    const last = Math.min(closes.length - 1, e + p.maxHold);
    if (e + p.maxHold > closes.length - 1) continue; // unresolved: not enough future data
    let exit = last;
    let label: 1 | -1 | 0 = 0;
    for (let t = e + 1; t <= last; t++) {
      if (closes[t]! >= upper) {
        exit = t;
        label = 1;
        break;
      }
      if (closes[t]! <= lower) {
        exit = t;
        label = -1;
        break;
      }
    }
    out.push({ entry: e, exit, label, ret: closes[exit]! / c0 - 1 - cost, upper, lower, sigma });
  }
  return out;
}

/**
 * Average uniqueness of events (López de Prado): at each period, concurrency = number of events whose holding window
 * covers it; an event's uniqueness is the mean of 1/concurrency over its window. Overlapping labels share information,
 * so naive statistics overstate the evidence; the effective sample size is Σ uniqueness.
 */
export function uniqueness(events: BarrierEvent[], length: number): number[] {
  const conc = new Array<number>(length).fill(0);
  for (const ev of events) for (let t = ev.entry + 1; t <= ev.exit; t++) conc[t]!++;
  return events.map((ev) => {
    let s = 0;
    let n = 0;
    for (let t = ev.entry + 1; t <= ev.exit; t++) {
      s += 1 / conc[t]!;
      n++;
    }
    return n ? s / n : 1;
  });
}

export interface BarrierStats {
  events: number;
  upper: number;
  lower: number;
  timeout: number;
  winRate: number;
  meanRet: number;
  medianRet: number;
  avgHold: number;
  /** Effective number of independent events (sum of uniqueness). */
  effectiveN: number;
  /** Bootstrap 95 % interval of the mean trade return, resampling with uniqueness weights. */
  meanCi: [number, number] | null;
  /** Max drawdown of the equity curve when trades are taken one at a time (non-overlapping, in entry order). */
  maxDrawdown: number;
  /** Buy-and-hold return over the same period range, for comparison. */
  benchmark: number;
}

export function barrierStats(closes: number[], events: BarrierEvent[], seed = 1): BarrierStats {
  const n = events.length;
  const rets = events.map((e) => e.ret);
  const sorted = [...rets].sort((a, b) => a - b);
  const u = uniqueness(events, closes.length);
  const effectiveN = u.reduce((a, b) => a + b, 0);
  let meanCi: [number, number] | null = null;
  if (n >= 10) {
    const rand = mulberry32(seed);
    const total = effectiveN;
    const cum: number[] = [];
    u.reduce((acc, x, i) => ((cum[i] = acc + x), acc + x), 0);
    const draw = () => {
      const r = rand() * total;
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid]! < r) lo = mid + 1;
        else hi = mid;
      }
      return rets[lo]!;
    };
    // Resample an effective number of events, so overlapping labels do not narrow the interval.
    const m = Math.max(2, Math.round(effectiveN));
    const means = Array.from({ length: 2000 }, () => {
      let s = 0;
      for (let k = 0; k < m; k++) s += draw();
      return s / m;
    }).sort((a, b) => a - b);
    meanCi = [means[49]!, means[1949]!];
  }
  // Sequential equity: take a trade only after the previous one has exited.
  let eq = 1;
  let peak = 1;
  let mdd = 0;
  let busyUntil = -1;
  for (const ev of events) {
    if (ev.entry < busyUntil) continue;
    eq *= 1 + ev.ret;
    peak = Math.max(peak, eq);
    mdd = Math.max(mdd, 1 - eq / peak);
    busyUntil = ev.exit;
  }
  const first = events[0]?.entry ?? 0;
  const lastExit = events.reduce((m, e) => Math.max(m, e.exit), first);
  return {
    events: n,
    upper: events.filter((e) => e.label === 1).length,
    lower: events.filter((e) => e.label === -1).length,
    timeout: events.filter((e) => e.label === 0).length,
    winRate: n ? rets.filter((r) => r > 0).length / n : 0,
    meanRet: n ? rets.reduce((a, b) => a + b, 0) / n : 0,
    medianRet: n ? (n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2) : 0,
    avgHold: n ? events.reduce((a, e) => a + (e.exit - e.entry), 0) / n : 0,
    effectiveN,
    meanCi,
    maxDrawdown: mdd,
    benchmark: n ? closes[lastExit]! / closes[first]! - 1 : 0,
  };
}
