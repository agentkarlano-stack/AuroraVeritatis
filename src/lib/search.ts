import { INSTRUMENTS } from '../data/instruments';
import { COUNTRIES } from './countries';

export interface SearchItem {
  id: string;
  group: 'Pages' | 'Countries' | 'Instruments';
  label: string;
  hint: string;
  to: string;
}

export const PAGES: SearchItem[] = [
  ['/hq', 'Headquarters', 'Personal dashboard'],
  ['/radar', 'Global Radar', 'Event map, layers and timeline'],
  ['/countries', 'Country Dossiers', 'All countries'],
  ['/countries/compare', 'Compare countries over time', 'Animated indicator comparison'],
  ['/countries/vs', 'Side-by-side countries', 'Compare up to four countries'],
  ['/markets', 'Market Terminal', 'Charts and indicators'],
  ['/geo', 'Map Explorer', '2D map and 3D globe with satellite, environmental, economic and hazard layers'],
  ['/news', 'News verification', 'Headlines grouped by story with independent coverage and source types'],
  ['/briefing', 'World Briefing', 'Guided tour of recent events with sources and reliability'],
  ['/brain', 'Personal Intelligence Brain', 'Your own graph of events, countries, markets and hypotheses'],
  ['/macro', 'Macro & FX', 'ECB rates, euro-area inflation, yields and reference exchange rates'],
  ['/currency', 'Currency and purchasing power', 'Inflation calculator, purchasing power, PPP, currency converter and historical exchange rates'],
  ['/positioning', 'Futures positioning', 'CFTC Commitments of Traders: speculators vs. hedgers'],
  ['/impact', 'Market Impact Radar', 'How events can reach markets'],
  ['/lab', 'Quant Research', 'Monte Carlo simulation and backtests'],
  ['/lab?tool=backtest', 'Backtest', 'Test trading rules against buy-and-hold'],
  ['/strategy', 'Strategy Lab', 'Scenario comparison'],
  ['/tension', 'World Tension Index', 'Methodology, weights and history'],
  ['/pricing', 'Plans', 'Proposed plans'],
  ['/account', 'Account', 'Profile, plan and local data'],
  ['/share', 'Share Aurora Veritatis', 'Link previews, Story and post images'],
  ['/status', 'Platform status', 'What works today and data sources'],
].map(([to, label, hint]) => ({ id: `p:${to}`, group: 'Pages' as const, label: label!, hint: hint!, to: to! }));

const ALL: SearchItem[] = [
  ...PAGES,
  ...INSTRUMENTS.map((i) => ({ id: `i:${i.symbol}`, group: 'Instruments' as const, label: i.symbol, hint: i.name, to: `/markets?symbol=${encodeURIComponent(i.symbol)}` })),
  ...COUNTRIES.map((c) => ({ id: `c:${c.iso3}`, group: 'Countries' as const, label: c.name, hint: c.iso3, to: `/countries/${c.iso3}` })),
];

/** Rank: exact/prefix label matches first, then substring matches in label or hint. */
export function searchItems(q: string, items: SearchItem[] = ALL, limit = 12): SearchItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return PAGES.slice(0, 8);
  const scored: [number, SearchItem][] = [];
  for (const it of items) {
    const l = it.label.toLowerCase();
    const h = it.hint.toLowerCase();
    const score = l === s ? 0 : l.startsWith(s) ? 1 : h === s ? 1 : l.includes(s) ? 2 : h.includes(s) ? 3 : -1;
    if (score >= 0) scored.push([score, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, it]) => it);
}

