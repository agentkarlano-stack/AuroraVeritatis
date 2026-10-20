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
    <g fontSize="10" fill="#6f7b8f">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#16233a" />
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
        <path d={`${d}L${x(points.length - 1)},${H - PAD.b}L${x(0)},${H - PAD.b}Z`} fill="rgba(200,169,107,0.08)" />
        <path d={d} fill="none" stroke="#c8a96b" strokeWidth="1.8" />
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#33445f" />
            <circle cx={x(hover)} cy={y(h.value)} r="3.5" fill="#c8a96b" />
          </g>
        )}
      </svg>
      {h && (
        <div className="absolute right-2 top-1 rounded border border-line bg-navy-900 px-2 py-1 text-xs">
          <span className="text-mist">{h.date}:</span> <span className="num text-platinum">{format(h.value)}</span>
        </div>
      )}
    </div>
  );
}

/** Percentile fan chart for Monte Carlo output. */
export function FanChart({ fan, s0 }: { fan: FanPoint[]; s0: number }) {
  const ymin = Math.min(...fan.map((f) => f.p05));
  const ymax = Math.max(...fan.map((f) => f.p95));
  const yt = ticks(ymin, ymax);
  const maxDay = fan.at(-1)!.day;
  const x = scale(0, maxDay, PAD.l, W - PAD.r);
  const y = scale(Math.min(ymin, yt[0] ?? ymin), Math.max(ymax, yt.at(-1) ?? ymax), H - PAD.b, PAD.t);
  const band = (lo: keyof FanPoint, hi: keyof FanPoint) =>
    `${fan.map((f, i) => `${i ? 'L' : 'M'}${x(f.day)},${y(f[hi])}`).join('')}${[...fan].reverse().map((f) => `L${x(f.day)},${y(f[lo])}`).join('')}Z`;
  const median = fan.map((f, i) => `${i ? 'L' : 'M'}${x(f.day)},${y(f.p50)}`).join('');
  const xl = ticks(0, maxDay, 6).map((d) => ({ x: x(d), label: `d${d}` }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Simulated value percentile fan chart">
      <Axes yTicks={yt} y={y} xLabels={xl} />
      <path d={band('p05', 'p95')} fill="rgba(200,169,107,0.12)" />
      <path d={band('p25', 'p75')} fill="rgba(200,169,107,0.25)" />
      <line x1={PAD.l} x2={W - PAD.r} y1={y(s0)} y2={y(s0)} stroke="#6f7b8f" strokeDasharray="4 3" />
      <path d={median} fill="none" stroke="#c8a96b" strokeWidth="2" />
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
          fill={marker != null && hist.edges[i + 1]! <= marker ? 'rgba(210,106,106,0.6)' : 'rgba(200,169,107,0.55)'}
        />
      ))}
      {marker != null && (
        <g>
          <line x1={x(marker)} x2={x(marker)} y1={PAD.t} y2={H - PAD.b} stroke="#d26a6a" strokeDasharray="4 3" />
          {markerLabel && (
            <text x={x(marker) + 4} y={PAD.t + 10} fontSize="10" fill="#d26a6a">
              {markerLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
