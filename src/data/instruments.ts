export type AssetClass = 'equity-index' | 'commodity' | 'fx' | 'rates' | 'equity' | 'crypto';

export interface Instrument {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Starting level and annualised drift/vol used by the synthetic generator. */
  start: number;
  mu: number;
  sigma: number;
  decimals: number;
}

/**
 * DEMO UNIVERSE — every price derived from these definitions is synthetic.
 * Symbols carry a ".D" suffix so they are never mistaken for real tickers.
 */
export const INSTRUMENTS: Instrument[] = [
  { symbol: 'GLB-EQ.D', name: 'Global Equity Index (synthetic)', assetClass: 'equity-index', start: 4200, mu: 0.07, sigma: 0.16, decimals: 2 },
  { symbol: 'EUR-EQ.D', name: 'European Equity Index (synthetic)', assetClass: 'equity-index', start: 480, mu: 0.05, sigma: 0.18, decimals: 2 },
  { symbol: 'EM-EQ.D', name: 'Emerging Markets Index (synthetic)', assetClass: 'equity-index', start: 1050, mu: 0.04, sigma: 0.21, decimals: 2 },
  { symbol: 'CRUDE.D', name: 'Crude Oil Benchmark (synthetic)', assetClass: 'commodity', start: 78, mu: 0.0, sigma: 0.34, decimals: 2 },
  { symbol: 'NATGAS.D', name: 'Natural Gas (synthetic)', assetClass: 'commodity', start: 32, mu: 0.0, sigma: 0.55, decimals: 2 },
  { symbol: 'GOLD.D', name: 'Gold (synthetic)', assetClass: 'commodity', start: 2100, mu: 0.06, sigma: 0.14, decimals: 2 },
  { symbol: 'WHEAT.D', name: 'Wheat (synthetic)', assetClass: 'commodity', start: 610, mu: 0.0, sigma: 0.3, decimals: 2 },
  { symbol: 'EURUSD.D', name: 'EUR/USD (synthetic)', assetClass: 'fx', start: 1.09, mu: 0.0, sigma: 0.07, decimals: 4 },
  { symbol: 'USDJPY.D', name: 'USD/JPY (synthetic)', assetClass: 'fx', start: 148, mu: 0.0, sigma: 0.09, decimals: 2 },
  { symbol: 'UST10Y.D', name: '10Y Government Bond Price (synthetic)', assetClass: 'rates', start: 98, mu: 0.01, sigma: 0.07, decimals: 2 },
  { symbol: 'SHIP.D', name: 'Shipping & Logistics Basket (synthetic)', assetClass: 'equity', start: 64, mu: 0.03, sigma: 0.32, decimals: 2 },
  { symbol: 'DEF.D', name: 'Defence Sector Basket (synthetic)', assetClass: 'equity', start: 120, mu: 0.08, sigma: 0.22, decimals: 2 },
  { symbol: 'BTC.D', name: 'Bitcoin (synthetic)', assetClass: 'crypto', start: 42000, mu: 0.15, sigma: 0.6, decimals: 0 },
];

export const INSTRUMENT_MAP = new Map(INSTRUMENTS.map((i) => [i.symbol, i]));
