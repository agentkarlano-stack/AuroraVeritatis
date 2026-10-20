export interface Scale {
  (v: number): number;
  ticks: number[];
}

/** "Nice" linear ticks covering [min, max]. */
export function linearTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const mag = 10 ** Math.floor(Math.log10(span / count));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** 1-2-5 ticks per decade within [min, max] (both > 0). */
export function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= min && v <= max) out.push(v);
    }
  }
  return out;
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0 || 1;
  const s = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  s.ticks = linearTicks(d0, d1);
  return s;
}

export function logScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(d0);
  const span = Math.log10(d1) - l0 || 1;
  const s = ((v: number) => r0 + ((Math.log10(Math.max(v, d0)) - l0) / span) * (r1 - r0)) as Scale;
  s.ticks = logTicks(d0, d1);
  return s;
}

/** Pad a [min, max] extent by a fraction of its span (multiplicatively for log axes). */
export function padExtent(values: number[], log: boolean, pad = 0.05): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v) && (!log || v > 0));
  if (!finite.length) return log ? [1, 10] : [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (log) {
    const f = (max / min) ** pad;
    return [min / f, max * f];
  }
  const p = (max - min || Math.abs(max) || 1) * pad;
  return [min - p, max + p];
}
