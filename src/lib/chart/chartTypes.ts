import type { Bar } from '../demoMarket';

export type ChartTypeId =
  | 'candles'
  | 'hollow'
  | 'bars'
  | 'line'
  | 'lineMarkers'
  | 'step'
  | 'area'
  | 'baseline'
  | 'columns'
  | 'highLow'
  | 'hlcArea'
  | 'heikinAshi';

export interface ChartTypeDef {
  id: ChartTypeId;
  label: string;
  group: 'Standard' | 'Advanced';
  /** Needs open, high and low as well as close. */
  needsOhlc: boolean;
  description: string;
}

export const CHART_TYPES: ChartTypeDef[] = [
  { id: 'candles', label: 'Candlesticks', group: 'Standard', needsOhlc: true, description: 'Open, high, low and close per bar.' },
  { id: 'hollow', label: 'Hollow candlesticks', group: 'Standard', needsOhlc: true, description: 'Hollow when the close is above the open, filled when below.' },
  { id: 'bars', label: 'Bars (OHLC)', group: 'Standard', needsOhlc: true, description: 'Vertical high–low line with ticks for open (left) and close (right).' },
  { id: 'line', label: 'Line', group: 'Standard', needsOhlc: false, description: 'Closing prices joined by a line.' },
  { id: 'lineMarkers', label: 'Line with markers', group: 'Standard', needsOhlc: false, description: 'Closing prices with a marker on every bar.' },
  { id: 'step', label: 'Step line', group: 'Standard', needsOhlc: false, description: 'Each close held flat until the next bar.' },
  { id: 'area', label: 'Area', group: 'Standard', needsOhlc: false, description: 'Closing prices with the area below filled.' },
  { id: 'baseline', label: 'Baseline', group: 'Standard', needsOhlc: false, description: 'Closes coloured above and below the first close in the visible range.' },
  { id: 'columns', label: 'Columns', group: 'Standard', needsOhlc: false, description: 'One column per close, coloured by the change from the previous close.' },
  { id: 'highLow', label: 'High-low', group: 'Standard', needsOhlc: true, description: 'One box per bar from the low to the high; open and close are not shown.' },
  { id: 'hlcArea', label: 'HLC area', group: 'Standard', needsOhlc: true, description: 'Shaded band between high and low with the close as a line.' },
  { id: 'heikinAshi', label: 'Heikin Ashi', group: 'Advanced', needsOhlc: true, description: 'Averaged candles that smooth noise. Values are not traded prices.' },
];
export const CHART_TYPE_MAP = new Map(CHART_TYPES.map((t) => [t.id, t]));

/**
 * Heikin Ashi transform: HA close = (O + H + L + C) / 4; HA open = (previous HA open + previous HA close) / 2, the first
 * being (O + C) / 2; HA high = max(H, HA open, HA close); HA low = min(L, HA open, HA close).
 */
export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const close = (b.open + b.high + b.low + b.close) / 4;
    const prev = out[i - 1];
    const open = prev ? (prev.open + prev.close) / 2 : (b.open + b.close) / 2;
    out.push({ time: b.time, open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), volume: b.volume });
  }
  return out;
}
