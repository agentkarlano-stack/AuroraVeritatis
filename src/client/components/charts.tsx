import { scaleBand, scaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

/**
 * Categorical series colours, validated (OKLab CVD ΔE ≥ 8 adjacent,
 * normal-vision ΔE ≥ 15, ≥ 3:1 contrast) against the #121A27 panel surface.
 * Fixed order; maximum four series per chart.
 */
export const SERIES = ["#B88A2E", "#3987E5", "#199E70", "#9085E9"] as const;
export const UP = "#199E70";
export const DOWN = "#E66767";

export function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - width) > 1) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || initial);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, width] as const;
}

export interface LineSeries {
  name: string;
  values: (number | null)[];
  color?: string;
  dashed?: boolean;
}

interface LineChartProps {
  series: LineSeries[];
  labels: string[];
  height?: number;
  yFormat?: (v: number) => string;
  ariaLabel: string;
  baseline?: number;
}

const M = { top: 12, right: 92, bottom: 26, left: 48 };
const tickCount = (innerH: number) => Math.max(2, Math.min(6, Math.floor(innerH / 36)));

export function LineChart({ series, labels, height = 260, yFormat = (v) => v.toFixed(1), ariaLabel, baseline }: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  // Direct end-labels need a gutter; on narrow screens the legend carries identity instead.
  const directLabels = width >= 520;
  const innerW = Math.max(40, width - M.left - (directLabels ? M.right : 12));
  const innerH = height - M.top - M.bottom;

  const { x, y, ticks } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v != null && Number.isFinite(v)));
    if (baseline != null) all.push(baseline);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.06 || 1;
    const count = tickCount(innerH);
    const yS = scaleLinear().domain([lo - pad, hi + pad]).range([innerH, 0]).nice(count);
    const xS = scaleLinear().domain([0, Math.max(1, n - 1)]).range([0, innerW]);
    return { x: xS, y: yS, ticks: yS.ticks(count) };
  }, [series, n, innerW, innerH, baseline]);

  const paths = series.map((s) =>
    d3line<number | null>()
      .defined((v) => v != null && Number.isFinite(v))
      .x((_, i) => x(i))
      .y((v) => y(v as number))(s.values) ?? "",
  );

  const xTickIdx = useMemo(() => {
    const count = Math.max(2, Math.min(6, Math.floor(innerW / 110)));
    return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
  }, [innerW, n]);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(x.invert(e.clientX - rect.left));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const lastLabels = directLabels && series.length <= 4
    ? series.map((s, k) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] == null) i--;
        return i >= 0 ? { k, y: y(s.values[i] as number), text: s.name } : null;
      }).filter(Boolean) as { k: number; y: number; text: string }[]
    : [];
  // Simple collision avoidance for direct labels.
  lastLabels.sort((a, b) => a.y - b.y).forEach((l, i, arr) => {
    if (i > 0 && l.y - arr[i - 1]!.y < 13) l.y = arr[i - 1]!.y + 13;
  });

  return (
    <div className="chart-box" ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${M.left},${M.top})`}>
          {ticks.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line className="grid-line" x1={0} x2={innerW} />
              <text x={-8} dy="0.32em" textAnchor="end">{yFormat(t)}</text>
            </g>
          ))}
          {baseline != null && <line className="axis-line" x1={0} x2={innerW} y1={y(baseline)} y2={y(baseline)} />}
          {xTickIdx.map((i) => (
            <text key={i} x={x(i)} y={innerH + 18} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
              {labels[i]}
            </text>
          ))}
          {paths.map((d, k) => (
            <path
              key={series[k]!.name}
              d={d}
              fill="none"
              stroke={series[k]!.color ?? SERIES[k % SERIES.length]}
              strokeWidth={2}
              strokeDasharray={series[k]!.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
            />
          ))}
          {lastLabels.map((l) => (
            <text key={l.k} x={innerW + 6} y={l.y} dy="0.32em" style={{ fill: "var(--text)" }}>
              {l.text.length > 13 ? l.text.slice(0, 12) + "…" : l.text}
            </text>
          ))}
          {hover != null && (
            <g>
              <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={0} y2={innerH} />
              {series.map((s, k) =>
                s.values[hover] != null ? (
                  <circle key={k} cx={x(hover)} cy={y(s.values[hover] as number)} r={4} fill={s.color ?? SERIES[k % SERIES.length]} stroke="#121a27" strokeWidth={2} />
                ) : null,
              )}
            </g>
          )}
          <rect
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </g>
      </svg>
      {hover != null && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(width - 170, Math.max(0, M.left + x(hover) + 12)), top: M.top }}
        >
          <div className="muted">{labels[hover]}</div>
          {series.map((s, k) => (
            <div key={k}>
              <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: s.color ?? SERIES[k % SERIES.length], marginRight: 6 }} />
              {s.name}: {s.values[hover] == null ? "—" : yFormat(s.values[hover] as number)}
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="chart-legend" aria-hidden="true">
          {series.map((s, k) => (
            <span key={s.name}>
              <i style={{ background: s.color ?? SERIES[k % SERIES.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Bar {
  label: string;
  value: number;
}

export function BarChart({ bars, height = 220, yFormat = (v) => v.toFixed(1), ariaLabel, color = SERIES[0] }: { bars: Bar[]; height?: number; yFormat?: (v: number) => string; ariaLabel: string; color?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 12, right: 12, bottom: 26, left: 44 };
  const innerW = Math.max(40, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const lo = Math.min(0, ...bars.map((b) => b.value));
  const hi = Math.max(0, ...bars.map((b) => b.value));
  const y = scaleLinear().domain([lo, hi || 1]).range([innerH, 0]).nice(4);
  const x = scaleBand<string>().domain(bars.map((b) => b.label)).range([0, innerW]).paddingInner(0.25);
  const every = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(innerW / 48))));
  const bw = Math.max(1, x.bandwidth());
  const r = Math.min(4, bw / 2);

  return (
    <div className="chart-box" ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${m.left},${m.top})`}>
          {y.ticks(4).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line className="grid-line" x1={0} x2={innerW} />
              <text x={-8} dy="0.32em" textAnchor="end">{yFormat(t)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x0 = x(b.label) ?? 0;
            const y0 = y(0);
            const y1 = y(b.value);
            const top = Math.min(y0, y1);
            const h = Math.max(1, Math.abs(y1 - y0));
            const neg = b.value < 0;
            // Rounded data-end, square at the baseline.
            const d = neg
              ? `M${x0},${top} h${bw} v${h - r} q0,${r} ${-r},${r} h${-(bw - 2 * r)} q${-r},0 ${-r},${-r} Z`
              : `M${x0},${top + h} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} Z`;
            return (
              <g key={b.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={x0 - 2} y={0} width={bw + 4} height={innerH} fill="transparent" />
                <path d={d} fill={neg ? DOWN : color} opacity={hover == null || hover === i ? 1 : 0.55} />
              </g>
            );
          })}
          <line className="axis-line" x1={0} x2={innerW} y1={y(0)} y2={y(0)} />
          {bars.map((b, i) =>
            i % every === 0 ? (
              <text key={b.label} x={(x(b.label) ?? 0) + bw / 2} y={innerH + 18} textAnchor="middle">{b.label}</text>
            ) : null,
          )}
        </g>
      </svg>
      {hover != null && bars[hover] && (
        <div className="chart-tooltip" style={{ left: Math.min(width - 120, m.left + (x(bars[hover]!.label) ?? 0)), top: 0 }}>
          {bars[hover]!.label}: {yFormat(bars[hover]!.value)}
        </div>
      )}
    </div>
  );
}

export interface CandlePoint {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function CandleChart({ candles, height = 280, ariaLabel }: { candles: CandlePoint[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 12, right: 12, bottom: 26, left: 48 };
  const innerW = Math.max(40, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const y = scaleLinear()
    .domain([Math.min(...candles.map((c) => c.low)), Math.max(...candles.map((c) => c.high))])
    .range([innerH, 0])
    .nice(5);
  const x = scaleBand<number>().domain(candles.map((_, i) => i)).range([0, innerW]).paddingInner(0.3);
  const bw = x.bandwidth();
  const every = Math.max(1, Math.ceil(candles.length / Math.max(2, Math.floor(innerW / 90))));
  const h = hover != null ? candles[hover] : null;

  return (
    <div className="chart-box" ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${m.left},${m.top})`}>
          {y.ticks(5).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line className="grid-line" x1={0} x2={innerW} />
              <text x={-8} dy="0.32em" textAnchor="end">{t.toFixed(0)}</text>
            </g>
          ))}
          {candles.map((c, i) => {
            const up = c.close >= c.open;
            const cx = (x(i) ?? 0) + bw / 2;
            const col = up ? UP : DOWN;
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={x(i)! - 1} y={0} width={bw + 2} height={innerH} fill="transparent" />
                <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1} />
                <rect
                  x={x(i)}
                  y={y(Math.max(c.open, c.close))}
                  width={Math.max(1, bw)}
                  height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
                  fill={up ? "transparent" : col}
                  stroke={col}
                  strokeWidth={1}
                  rx={1}
                />
              </g>
            );
          })}
          {candles.map((c, i) => (i % every === 0 ? <text key={i} x={(x(i) ?? 0) + bw / 2} y={innerH + 18} textAnchor="middle">{c.label}</text> : null))}
        </g>
      </svg>
      {h && (
        <div className="chart-tooltip" style={{ left: Math.min(width - 190, m.left + (x(hover!) ?? 0) + 10), top: 0 }}>
          <div className="muted">{h.label}</div>
          O {h.open.toFixed(2)} · H {h.high.toFixed(2)} · L {h.low.toFixed(2)} · C {h.close.toFixed(2)}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32, color = SERIES[0] }: { values: number[]; width?: number; height?: number; color?: string }) {
  const x = scaleLinear().domain([0, values.length - 1]).range([1, width - 1]);
  const y = scaleLinear().domain([Math.min(...values), Math.max(...values)]).range([height - 2, 2]);
  const d = d3line<number>().x((_, i) => x(i)).y((v) => y(v))(values) ?? "";
  return (
    <svg width={width} height={height} aria-hidden="true" className="chart">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
