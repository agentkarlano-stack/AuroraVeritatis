import { useState } from 'react';
import type { FanPoint } from '../lib/montecarlo';
import type { Histogram } from '../lib/stats';

const W = 640;
const H = 260;
const PAD = { l: 56, r: 12, t: 12, b: 28 };

function scale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

function ticks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const fmtAxis = (v: number) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(0)}k` : `${+v.toFixed(2)}`);

function Axes({ yTicks, y, xLabels }: { yTicks: number[]; y: (v: number) => number; xLabels: { x: number; label: string }[] }) {
  return (
    <g fontSize="10" fill="#77756f">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#1f1f23" />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end">
            {fmtAxis(t)}
          </text>
        </g>
      ))}
      {xLabels.map((l) => (
        <text key={l.label + l.x} x={l.x} y={H - 8} textAnchor="middle">
          {l.label}
        </text>
      ))}
    </g>
  );
}

/** Simple time-series line chart with hover readout, used for country indicator history. */
export function LineChart({ points, format }: { points: { date: string; value: number }[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="py-6 text-sm text-slate-dim">Not enough observations to chart.</p>;
  const vals = points.map((p) => p.value);
  const yt = ticks(Math.min(...vals), Math.max(...vals));
  const ymin = Math.min(yt[0] ?? 0, ...vals);
  const ymax = Math.max(yt.at(-1) ?? 1, ...vals);
  const x = scale(0, points.length - 1, PAD.l, W - PAD.r);
  const y = scale(ymin, ymax, H - PAD.b, PAD.t);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('');
  const step = Math.max(1, Math.ceil(points.length / 7));
  const xl = points.flatMap((p, i) => (i % step === 0 || i === points.length - 1 ? [{ x: x(i), label: p.date }] : []));
  const h = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Indicator history chart"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const sx = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(((sx - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1)))));
        }}
      >
        <Axes yTicks={yt} y={y} xLabels={xl} />
        <path d={`${d}L${x(points.length - 1)},${H - PAD.b}L${x(0)},${H - PAD.b}Z`} fill="rgba(201,163,90,0.08)" />
        <path d={d} fill="none" stroke="#c9a35a" strokeWidth="1.8" />
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#3a3a40" />
            <circle cx={x(hover)} cy={y(h.value)} r="3.5" fill="#c9a35a" />
          </g>
        )}
      </svg>
      {h && (
        <div className="absolute right-2 top-1 rounded border border-line bg-ink-900 px-2 py-1 text-xs">
          <span className="text-mist">{h.date}:</span> <span className="num text-platinum">{format(h.value)}</span>
        </div>
      )}
    </div>
  );
}

/** Percentile fan chart for Monte Carlo output, optionally overlaid with a second (scenario) fan in blue. */
export function FanChart({ fan, s0, compare }: { fan: FanPoint[]; s0: number; compare?: FanPoint[] }) {
  const all = compare ? [...fan, ...compare] : fan;
  const ymin = Math.min(...all.map((f) => f.p05));
  const ymax = Math.max(...all.map((f) => f.p95));
  const yt = ticks(ymin, ymax);
  const maxDay = fan.at(-1)!.day;
  const x = scale(0, maxDay, PAD.l, W - PAD.r);
  const y = scale(Math.min(ymin, yt[0] ?? ymin), Math.max(ymax, yt.at(-1) ?? ymax), H - PAD.b, PAD.t);
  const band = (f0: FanPoint[], lo: keyof FanPoint, hi: keyof FanPoint) =>
    `${f0.map((f, i) => `${i ? 'L' : 'M'}${x(f.day)},${y(f[hi])}`).join('')}${[...f0].reverse().map((f) => `L${x(f.day)},${y(f[lo])}`).join('')}Z`;
  const median = (f0: FanPoint[]) => f0.map((f, i) => `${i ? 'L' : 'M'}${x(f.day)},${y(f.p50)}`).join('');
  const xl = ticks(0, maxDay, 6).map((d) => ({ x: x(d), label: `d${d}` }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={compare ? 'Baseline and scenario percentile fans' : 'Simulated value percentile fan chart'}>
      <Axes yTicks={yt} y={y} xLabels={xl} />
      <path d={band(fan, 'p05', 'p95')} fill="rgba(201,163,90,0.12)" />
      <path d={band(fan, 'p25', 'p75')} fill="rgba(201,163,90,0.25)" />
      {compare && (
        <>
          <path d={band(compare, 'p05', 'p95')} fill="rgba(125,156,192,0.12)" />
          <path d={band(compare, 'p25', 'p75')} fill="rgba(125,156,192,0.25)" />
        </>
      )}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(s0)} y2={y(s0)} stroke="#77756f" strokeDasharray="4 3" />
      <path d={median(fan)} fill="none" stroke="#c9a35a" strokeWidth="2" />
      {compare && <path d={median(compare)} fill="none" stroke="#7d9cc0" strokeWidth="2" />}
    </svg>
  );
}

/** Two distributions on shared bins (baseline gold, scenario blue). */
export function OverlayHistogram({ a, b, s0 }: { a: Histogram; b: Histogram; s0: number }) {
  const max = Math.max(...a.counts, ...b.counts);
  const lo = a.edges[0]!;
  const hi = a.edges.at(-1)!;
  const x = scale(lo, hi, PAD.l, W - PAD.r);
  const y = scale(0, max, H - PAD.b, PAD.t);
  const xl = ticks(lo, hi, 6).map((v) => ({ x: x(v), label: fmtAxis(v) }));
  const outline = (h: Histogram) =>
    h.counts.map((c, i) => `${i ? 'L' : 'M'}${x(h.edges[i]!)},${y(c)}L${x(h.edges[i + 1]!)},${y(c)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Baseline versus scenario terminal value distributions">
      <Axes yTicks={ticks(0, max, 4)} y={y} xLabels={xl} />
      {a.counts.map((c, i) => (
        <rect key={i} x={x(a.edges[i]!) + 0.5} width={Math.max(0, x(a.edges[i + 1]!) - x(a.edges[i]!) - 1)} y={y(c)} height={H - PAD.b - y(c)} fill="rgba(201,163,90,0.35)" />
      ))}
      <path d={outline(b)} fill="none" stroke="#7d9cc0" strokeWidth="2" />
      <line x1={x(s0)} x2={x(s0)} y1={PAD.t} y2={H - PAD.b} stroke="#77756f" strokeDasharray="4 3" />
    </svg>
  );
}

export function HistogramChart({ hist, marker, markerLabel }: { hist: Histogram; marker?: number; markerLabel?: string }) {
  const max = Math.max(...hist.counts);
  const lo = hist.edges[0]!;
  const hi = hist.edges.at(-1)!;
  const x = scale(lo, hi, PAD.l, W - PAD.r);
  const y = scale(0, max, H - PAD.b, PAD.t);
  const xl = ticks(lo, hi, 6).map((v) => ({ x: x(v), label: fmtAxis(v) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Distribution of simulated terminal values">
      <Axes yTicks={ticks(0, max, 4)} y={y} xLabels={xl} />
      {hist.counts.map((c, i) => (
        <rect
          key={i}
          x={x(hist.edges[i]!) + 0.5}
          width={Math.max(0, x(hist.edges[i + 1]!) - x(hist.edges[i]!) - 1)}
          y={y(c)}
          height={H - PAD.b - y(c)}
          fill={marker != null && hist.edges[i + 1]! <= marker ? 'rgba(194,96,91,0.6)' : 'rgba(201,163,90,0.55)'}
        />
      ))}
      {marker != null && (
        <g>
          <line x1={x(marker)} x2={x(marker)} y1={PAD.t} y2={H - PAD.b} stroke="#c2605b" strokeDasharray="4 3" />
          {markerLabel && (
            <text x={x(marker) + 4} y={PAD.t + 10} fontSize="10" fill="#c2605b">
              {markerLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
