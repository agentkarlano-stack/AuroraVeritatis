import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import { useEffect, useRef, type RefObject } from 'react';
import { timeToString, trendPoints, type ChartPoint, type Drawing } from '../../lib/chart';
import { heikinAshi } from '../../lib/chart/chartTypes';
import { INDICATOR_MAP, indicatorBlocker, indicatorLabel } from '../../lib/chart/indicators';
import { periodsPerYear, rangeWindow } from '../../lib/chart/intervals';
import type { ChartSettings } from '../../lib/chart/workspace';
import type { Bar } from '../../lib/demoMarket';

export interface ChartAnnotation {
  time: string;
  text: string;
  color: string;
}

/** Imperative handle for the editor: screenshots and view reset. */
export interface ChartApi {
  screenshot: () => HTMLCanvasElement | null;
  resetView: () => void;
  zoom: (factor: number) => void;
}

interface Props {
  /** Bars at the selected interval. */
  bars: Bar[];
  settings: ChartSettings;
  hasOhlc: boolean;
  hasVolume: boolean;
  decimals: number;
  drawings: Drawing[];
  annotations?: ChartAnnotation[];
  onPick?: (p: ChartPoint) => void;
  apiRef?: RefObject<ChartApi | null>;
}

const TEXT = '#adaba5';
const GRID = '#1f1f23';
const GOLD = '#c9a35a';
const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
const NO_ANNOTATIONS: ChartAnnotation[] = [];

/** Close-only datasets fall back to a line when a chart type needs open, high and low. */
function addMain(chart: IChartApi, bars: Bar[], s: ChartSettings, hasOhlc: boolean, firstVisible: number): ISeriesApi<SeriesType> {
  const { up, down, background } = s.appearance;
  const t = hasOhlc ? s.type : ['candles', 'hollow', 'bars', 'highLow', 'hlcArea', 'heikinAshi'].includes(s.type) ? 'line' : s.type;
  const ohlc = (b: Bar[]) => b.map((x) => ({ time: x.time as Time, open: x.open, high: x.high, low: x.low, close: x.close }));
  const closes = bars.map((x) => ({ time: x.time as Time, value: x.close }));
  switch (t) {
    case 'candles':
    case 'heikinAshi': {
      const series = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
      series.setData(ohlc(t === 'heikinAshi' ? heikinAshi(bars) : bars));
      return series;
    }
    case 'hollow': {
      const series = chart.addSeries(CandlestickSeries, { upColor: 'rgba(0,0,0,0)', downColor: down, borderVisible: true, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
      series.setData(ohlc(bars));
      return series;
    }
    case 'bars': {
      const series = chart.addSeries(BarSeries, { upColor: up, downColor: down, openVisible: true });
      series.setData(ohlc(bars));
      return series;
    }
    case 'highLow': {
      // One box per bar from low to high: open and close are deliberately not used.
      const series = chart.addSeries(CandlestickSeries, { upColor: alpha(GOLD, 0.55), downColor: alpha(GOLD, 0.55), borderVisible: false, wickVisible: false });
      series.setData(bars.map((x) => ({ time: x.time as Time, open: x.low, high: x.high, low: x.low, close: x.high })));
      return series;
    }
    case 'hlcArea': {
      // Band between high and low: an area down from the high, masked below the low in the background colour.
      chart.addSeries(AreaSeries, { lineColor: alpha(up, 0.6), lineWidth: 1, topColor: alpha(GOLD, 0.28), bottomColor: alpha(GOLD, 0.28), lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }).setData(bars.map((x) => ({ time: x.time as Time, value: x.high })));
      chart.addSeries(AreaSeries, { lineColor: alpha(down, 0.6), lineWidth: 1, topColor: background, bottomColor: background, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }).setData(bars.map((x) => ({ time: x.time as Time, value: x.low })));
      const series = chart.addSeries(LineSeries, { color: '#e6e4de', lineWidth: 2 });
      series.setData(closes);
      return series;
    }
    case 'area': {
      const series = chart.addSeries(AreaSeries, { lineColor: GOLD, lineWidth: 2, topColor: alpha(GOLD, 0.3), bottomColor: alpha(GOLD, 0.02) });
      series.setData(closes);
      return series;
    }
    case 'baseline': {
      const base = bars[firstVisible]?.close ?? bars[0]?.close ?? 0;
      const series = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: base },
        topLineColor: up,
        topFillColor1: alpha(up, 0.28),
        topFillColor2: alpha(up, 0.03),
        bottomLineColor: down,
        bottomFillColor1: alpha(down, 0.03),
        bottomFillColor2: alpha(down, 0.28),
      });
      series.setData(closes);
      return series;
    }
    case 'columns': {
      const series = chart.addSeries(HistogramSeries, { priceLineVisible: true });
      series.setData(bars.map((x, i) => ({ time: x.time as Time, value: x.close, color: i > 0 && x.close < bars[i - 1]!.close ? alpha(down, 0.85) : alpha(up, 0.85) })));
      return series;
    }
    case 'step':
    case 'lineMarkers':
    case 'line':
    default: {
      const series = chart.addSeries(LineSeries, { color: GOLD, lineWidth: 2, lineType: t === 'step' ? LineType.WithSteps : LineType.Simple, pointMarkersVisible: t === 'lineMarkers', pointMarkersRadius: 2.5 });
      series.setData(closes);
      return series;
    }
  }
}

export function ChartCanvas({ bars, settings, hasOhlc, hasVolume, decimals, drawings, annotations = NO_ANNOTATIONS, onPick, apiRef }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  // The user's zoom and scroll survive rebuilds (new drawing, indicator, colour) while the bars and range stay the same.
  const viewRef = useRef<{ bars: Bar[]; range: string; logical: { from: number; to: number } } | null>(null);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    const { appearance: ap } = settings;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: ap.background },
        textColor: TEXT,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: true,
        panes: { separatorColor: '#2f2f35', separatorHoverColor: '#3a372f', enableResize: true },
      },
      grid: { vertLines: { color: GRID, visible: ap.grid }, horzLines: { color: GRID, visible: ap.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#2f2f35',
        mode: ap.scale === 'log' ? PriceScaleMode.Logarithmic : ap.scale === 'percent' ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
      },
      timeScale: { borderColor: '#2f2f35', rightOffset: 4 },
      localization: { priceFormatter: (p: number) => (Math.abs(p) >= 1e6 ? `${(p / 1e6).toFixed(2)}M` : p.toFixed(decimals)) },
    });

    const win = rangeWindow(bars, settings.range) ?? { from: 0, to: bars.length - 1 };
    const main = addMain(chart, bars, settings, hasOhlc, win.from);
    const data = { hasOhlc, hasVolume };
    const ctx = { periodsPerYear: periodsPerYear(settings.interval) };

    let pane = 1;
    const paneKinds: string[] = [];
    for (const inst of settings.indicators) {
      const def = INDICATOR_MAP.get(inst.id);
      if (!def || inst.hidden || indicatorBlocker(def, data)) continue;
      const own = def.pane === 'own' || inst.ownPane;
      const paneIndex = own ? pane++ : 0;
      const r = def.compute(bars, inst.params, ctx);
      const label = indicatorLabel(def, inst.params);
      let first: ISeriesApi<SeriesType> | null = null;
      for (const o of r.outputs) {
        const color = inst.colors?.[o.key] ?? o.color;
        const points = o.values.flatMap((v, i) => (v == null ? [] : [{ time: bars[i]!.time as Time, value: v }]));
        const common = { lastValueVisible: own, priceLineVisible: false, title: own ? '' : r.outputs.length > 1 ? '' : label };
        let series: ISeriesApi<SeriesType>;
        if (o.style === 'histogram') {
          series = chart.addSeries(HistogramSeries, { ...common, color, priceFormat: def.id === 'volume' ? { type: 'volume' } : { type: 'price', precision: 2, minMove: 0.01 } }, paneIndex);
          series.setData(
            def.id === 'volume' || def.id === 'netvol'
              ? o.values.flatMap((v, i) => (v == null ? [] : [{ time: bars[i]!.time as Time, value: v, color: bars[i]!.close >= bars[i]!.open ? alpha(ap.up, 0.5) : alpha(ap.down, 0.5) }]))
              : o.values.flatMap((v, i) => (v == null ? [] : [{ time: bars[i]!.time as Time, value: v, color: v >= 0 ? alpha(ap.up, 0.6) : alpha(ap.down, 0.6) }])),
          );
        } else {
          series = chart.addSeries(LineSeries, { ...common, color, lineWidth: own ? 2 : 1, crosshairMarkerVisible: false }, paneIndex);
          series.setData(points);
        }
        first ??= series;
      }
      if (first) for (const lv of r.levels ?? []) first.createPriceLine({ price: lv, color: '#77756f', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' });
      if (own) paneKinds[paneIndex] = def.id;
    }

    // Relative pane sizes once all panes exist: price chart 1, volume 0.2, each oscillator 0.3.
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 1 : paneKinds[i] === 'volume' ? 0.2 : 0.3));

    if (settings.events && annotations.length) {
      const times = new Set(bars.map((b) => b.time));
      const markers: SeriesMarker<Time>[] = annotations
        .filter((a) => times.has(a.time))
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((a) => ({ time: a.time as Time, position: 'aboveBar', color: a.color, shape: 'arrowDown', text: a.text }));
      createSeriesMarkers(main, markers);
    }

    for (const d of drawings) {
      if (d.kind === 'hline') {
        main.createPriceLine({ price: d.price, color: GOLD, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
      } else {
        const pts = trendPoints(d);
        if (!pts) continue;
        chart
          .addSeries(LineSeries, { color: '#ddbf84', lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false })
          .setData(pts.map((p) => ({ time: p.time as Time, value: p.price })));
      }
    }

    // Native click listener: the chart library swallows a quick second click (double-click detection).
    const onClick = (e: MouseEvent) => {
      const pick = pickRef.current;
      if (!pick) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y > (chart.panes()[0]?.getHeight() ?? rect.height)) return;
      const time = timeToString(chart.timeScale().coordinateToTime(x));
      const price = main.coordinateToPrice(y);
      if (time && price !== null) pick({ time, price: Number(price.toFixed(decimals)) });
    };
    el.addEventListener('click', onClick);

    const rangeKey = JSON.stringify(settings.range);
    const fit = () => chart.timeScale().setVisibleLogicalRange({ from: win.from - 0.5, to: win.to + 3 });
    const saved = viewRef.current;
    if (saved && saved.bars === bars && saved.range === rangeKey) chart.timeScale().setVisibleLogicalRange(saved.logical);
    else fit();
    // Keep the same bars in view when the container is resized (full screen, rotation). Range changes caused by the
    // resize itself are ignored, so the view from before the resize is restored.
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      const v = viewRef.current;
      if (v && v.bars === bars) requestAnimationFrame(() => chart.timeScale().setVisibleLogicalRange(v.logical));
    });
    ro.observe(el);
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (r && el.clientWidth === width) viewRef.current = { bars, range: rangeKey, logical: { from: r.from, to: r.to } };
    });
    if (apiRef) {
      apiRef.current = {
        screenshot: () => chart.takeScreenshot(),
        resetView: fit,
        zoom: (factor) => {
          const r = chart.timeScale().getVisibleLogicalRange();
          if (!r) return;
          const mid = (r.from + r.to) / 2;
          const half = ((r.to - r.from) / 2) * factor;
          chart.timeScale().setVisibleLogicalRange({ from: mid - half, to: mid + half });
        },
      };
    }
    return () => {
      el.removeEventListener('click', onClick);
      ro.disconnect();
      if (apiRef) apiRef.current = null;
      chart.remove();
    };
  }, [bars, settings, hasOhlc, hasVolume, decimals, drawings, annotations, apiRef]);

  return <div ref={ref} className={`h-full w-full ${onPick ? 'cursor-crosshair' : ''}`} data-testid="chart-canvas" />;
}
