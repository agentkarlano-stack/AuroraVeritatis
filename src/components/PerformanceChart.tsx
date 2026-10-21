import { ColorType, createChart, LineSeries, type Time } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

export interface PerformanceSeries {
  label: string;
  color: string;
  points: { time: string; value: number }[];
}

/** Multi-series line chart, by default for rebased (=100) relative performance. */
export function PerformanceChart({ series, format = (p) => p.toFixed(1) }: { series: PerformanceSeries[]; format?: (value: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || series.length === 0) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#151517' }, textColor: '#adaba5', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: '#1f1f23' }, horzLines: { color: '#1f1f23' } },
      rightPriceScale: { borderColor: '#2f2f35' },
      timeScale: { borderColor: '#2f2f35' },
      localization: { priceFormatter: format },
    });
    for (const s of series) {
      chart.addSeries(LineSeries, { color: s.color, lineWidth: 2, title: s.label, priceLineVisible: false }).setData(s.points.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, format]);
  return <div ref={ref} className="h-full w-full" />;
}
