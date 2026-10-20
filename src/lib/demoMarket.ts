import { INSTRUMENT_MAP, type Instrument } from '../data/instruments';
import { hashSeed, mulberry32, normalSampler } from './rng';

export interface Bar {
  /** YYYY-MM-DD */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const DEMO_HISTORY_DAYS = 520;

/** Business days (Mon–Fri) ending at the most recent weekday on or before `end`. */
export function businessDays(count: number, end: Date): string[] {
  const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const out: string[] = [];
  while (out.length < count) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

const cache = new Map<string, Bar[]>();

/**
 * Deterministic SYNTHETIC daily bars for a demo instrument. Uses GBM closes with
 * modest volatility clustering, then derives plausible open/high/low and volume.
 */
export function demoBars(symbol: string, end = new Date()): Bar[] {
  const inst = INSTRUMENT_MAP.get(symbol);
  if (!inst) return [];
  const key = `${symbol}|${end.toISOString().slice(0, 10)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const bars = generate(inst, businessDays(DEMO_HISTORY_DAYS, end));
  cache.set(key, bars);
  return bars;
}

function generate(inst: Instrument, days: string[]): Bar[] {
  const u = mulberry32(hashSeed(inst.symbol));
  const z = normalSampler(u);
  const dt = 1 / 252;
  const round = (v: number) => Number(v.toFixed(inst.decimals));
  let price = inst.start;
  let volScale = 1;
  const baseVolume = 1e6 * (1 + u() * 4);
  return days.map((time) => {
    volScale = Math.min(2.5, Math.max(0.5, 0.94 * volScale + 0.06 + 0.12 * z() * 0.5));
    const sigma = inst.sigma * volScale;
    const open = price * (1 + 0.15 * sigma * Math.sqrt(dt) * z());
    const close = open * Math.exp((inst.mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z());
    const spread = Math.abs(z()) * sigma * Math.sqrt(dt) * 0.6;
    const high = Math.max(open, close) * (1 + spread);
    const low = Math.min(open, close) * (1 - spread);
    price = close;
    const volume = Math.round(baseVolume * volScale * (0.6 + u() * 0.8));
    return { time, open: round(open), high: round(high), low: round(low), close: round(close), volume };
  });
}

export function lastQuote(symbol: string): { price: number; change: number; changePct: number } | null {
  const bars = demoBars(symbol);
  const last = bars.at(-1);
  const prev = bars.at(-2);
  if (!last || !prev) return null;
  return { price: last.close, change: last.close - prev.close, changePct: last.close / prev.close - 1 };
}
