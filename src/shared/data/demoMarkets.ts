import { syntheticCandles, syntheticPath, type Candle } from "../quant/random";

/**
 * SYNTHETIC DEMONSTRATION INSTRUMENTS.
 *
 * Deliberately generic names (no real tickers) so that synthetic series can
 * never be mistaken for real prices. Every series is a seeded random walk
 * rebased to 100. Real market data requires a licensed or public provider
 * and will be labelled live / delayed / historical.
 */

export interface DemoInstrument {
  symbol: string;
  name: string;
  assetClass: "Energy" | "Metals" | "Equities" | "FX" | "Rates" | "Agriculture";
  drift: number;
  volatility: number;
}

export const DEMO_INSTRUMENTS: DemoInstrument[] = [
  { symbol: "DEMO-ENR", name: "Demo Energy Series", assetClass: "Energy", drift: 0.03, volatility: 0.32 },
  { symbol: "DEMO-MTL", name: "Demo Precious Metals Series", assetClass: "Metals", drift: 0.05, volatility: 0.16 },
  { symbol: "DEMO-EQX", name: "Demo Global Equity Series", assetClass: "Equities", drift: 0.07, volatility: 0.18 },
  { symbol: "DEMO-FXB", name: "Demo FX Basket Series", assetClass: "FX", drift: 0.0, volatility: 0.08 },
  { symbol: "DEMO-RTS", name: "Demo Bond Series", assetClass: "Rates", drift: 0.02, volatility: 0.06 },
  { symbol: "DEMO-AGR", name: "Demo Agriculture Series", assetClass: "Agriculture", drift: 0.01, volatility: 0.24 },
];

export const DEMO_POINTS = 520;
/** Fixed epoch so demo output is identical on every render and every device. */
export const DEMO_START = Date.UTC(2024, 0, 1);
const DAY = 86_400_000;

export function demoSeries(inst: DemoInstrument, points = DEMO_POINTS): number[] {
  return syntheticPath({ seed: inst.symbol, points, start: 100, drift: inst.drift, volatility: inst.volatility });
}

export function demoCandles(inst: DemoInstrument, points = 90): Candle[] {
  return syntheticCandles({
    seed: inst.symbol + ":ohlc",
    points,
    start: 100,
    drift: inst.drift,
    volatility: inst.volatility,
    startTime: DEMO_START,
    stepMs: DAY,
  });
}

export function demoDates(points = DEMO_POINTS): Date[] {
  return Array.from({ length: points }, (_, i) => new Date(DEMO_START + i * DAY));
}
