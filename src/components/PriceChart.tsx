import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { Bar } from '../lib/demoMarket';
import { bollinger, ema, rsi, sma } from '../lib/technical';

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

export interface ChartAnnotation {
  time: string;
  text: string;
  color: string;
}

interface Props {
  bars: Bar[];
  options: ChartOptions;
  /** Number of trailing bars to show initially. */
  visibleBars: number;
  annotations?: ChartAnnotation[];
  decimals: number;
}

const C = {
  bg: '#151517',
  text: '#adaba5',
  grid: '#1f1f23',
  up: '#5e9f7e',
  down: '#c2605b',
  gold: '#c9a35a',
};

function line(values: (number | null)[], bars: Bar[]) {
  return values.flatMap((v, i) => (v == null ? [] : [{ time: bars[i]!.time as Time, value: v }]));
}

export function PriceChart({ bars, options, visibleBars, annotations = [], decimals }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: true,
        panes: { separatorColor: '#2f2f35', separatorHoverColor: '#3a372f', enableResize: true },
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2f2f35' },
      timeScale: { borderColor: '#2f2f35', rightOffset: 4 },
      localization: { priceFormatter: (p: number) => p.toFixed(decimals) },
    });

    const closes = bars.map((b) => b.close);
    const main =
      options.style === 'candles'
        ? chart.addSeries(CandlestickSeries, {
            upColor: C.up,
            downColor: C.down,
            borderVisible: false,
            wickUpColor: C.up,
            wickDownColor: C.down,
          })
        : chart.addSeries(LineSeries, { color: C.gold, lineWidth: 2 });
    if (options.style === 'candles') main.setData(bars.map((b) => ({ ...b, time: b.time as Time })));
    else main.setData(bars.map((b) => ({ time: b.time as Time, value: b.close })));

    if (options.volume) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(bars.map((b) => ({ time: b.time as Time, value: b.volume, color: b.close >= b.open ? 'rgba(94,159,126,0.35)' : 'rgba(194,96,91,0.35)' })));
    }
    const overlay = { lineWidth: 1 as const, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false };
    if (options.sma20) chart.addSeries(LineSeries, { ...overlay, color: '#7d9cc0' }).setData(line(sma(closes, 20), bars));
    if (options.sma50) chart.addSeries(LineSeries, { ...overlay, color: '#9d8bb8' }).setData(line(sma(closes, 50), bars));
    if (options.ema20) chart.addSeries(LineSeries, { ...overlay, color: '#d8c27a' }).setData(line(ema(closes, 20), bars));
    if (options.bollinger) {
      const bb = bollinger(closes, 20, 2);
      chart.addSeries(LineSeries, { ...overlay, color: 'rgba(201,163,90,0.55)', lineStyle: 2 }).setData(line(bb.upper, bars));
      chart.addSeries(LineSeries, { ...overlay, color: 'rgba(201,163,90,0.55)', lineStyle: 2 }).setData(line(bb.lower, bars));
    }
    if (options.rsi) {
      const r = chart.addSeries(LineSeries, { color: C.gold, lineWidth: 1, priceLineVisible: false }, 1);
      r.setData(line(rsi(closes, 14), bars));
      r.createPriceLine({ price: 70, color: '#77756f', lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: '' });
      r.createPriceLine({ price: 30, color: '#77756f', lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: '' });
      chart.panes()[1]?.setHeight(110);
    }
    if (options.events && annotations.length) {
      const times = new Set(bars.map((b) => b.time));
      const markers: SeriesMarker<Time>[] = annotations
        .filter((a) => times.has(a.time))
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((a) => ({ time: a.time as Time, position: 'aboveBar', color: a.color, shape: 'arrowDown', text: a.text }));
      createSeriesMarkers(main, markers);
    }

    const n = bars.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - visibleBars), to: n + 3 });
    return () => chart.remove();
  }, [bars, options, visibleBars, annotations, decimals]);

  return <div ref={ref} className="h-full w-full" />;
}
