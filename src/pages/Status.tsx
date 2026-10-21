import { Link } from 'react-router';
import { PageHeader, Panel } from '../components/ui';

type State = 'working' | 'prototype' | 'demo' | 'planned';

const STATE: Record<State, { label: string; cls: string }> = {
  working: { label: 'Working', cls: 'border-up/50 text-up' },
  prototype: { label: 'Prototype', cls: 'border-info/50 text-info' },
  demo: { label: 'Demo data', cls: 'border-gold-dim text-gold' },
  planned: { label: 'Planned', cls: 'border-line text-slate-dim' },
};

const MODULES: { name: string; to?: string; state: State; note: string }[] = [
  { name: 'Headquarters dashboard', to: '/hq', state: 'prototype', note: 'Configurable widgets, watchlist, favourites, alerts and notes saved in the browser.' },
  { name: 'Global Radar — natural hazards', to: '/radar', state: 'working', note: 'Live USGS M4.5+ earthquakes (10-min cache) and GDACS disaster alerts for cyclones, floods, volcanoes, droughts and wildfires (30-min cache).' },
  { name: 'Global Radar — geopolitical layer', to: '/radar', state: 'demo', note: 'Simulated scenarios until GDELT / UCDP / ReliefWeb ingestion is built.' },
  { name: 'Global Radar — timeline', to: '/radar', state: 'working', note: 'Daily event counts by category; click a day to filter the map and list.' },
  { name: 'Country dossiers', to: '/countries', state: 'working', note: '23 World Bank indicators with reference years and 1990–present history charts.' },
  { name: 'Side-by-side country comparison', to: '/countries/vs?c=DEU,FRA,USA', state: 'working', note: 'Up to four countries across all 23 World Bank indicators, each with its reference year.' },
  { name: 'Compare countries explorer', to: '/countries/compare', state: 'working', note: 'Animated bubble chart of any two World Bank indicators, sized by a third, 1990–present.' },
  { name: 'Country politics section', state: 'planned', note: 'Requires curated electoral and governance sources.' },
  { name: 'Markets terminal', to: '/markets', state: 'demo', note: 'Charts, indicators and statistics are real calculations on synthetic prices.' },
  { name: 'Personal Intelligence Brain', to: '/brain', state: 'working', note: 'Local-first research graph (IndexedDB in your browser): typed nodes and sourced relationships with certainty, links to dossiers/series, layouts, groups, saved views, templates, JSON/Markdown export and import. No cloud sync yet.' },
  { name: 'Macro & FX (ECB)', to: '/macro', state: 'working', note: 'ECB policy rates, euro-area HICP inflation (headline and core), 10-year AAA yield and 15 euro reference exchange rates with USD cross rates, history to 25 years and CSV (3-hour cache).' },
  { name: 'Futures positioning (CFTC COT)', to: '/positioning', state: 'working', note: 'Official weekly Commitments of Traders data for 14 futures markets: net positions by trader group, 3-year positioning index, extremes, CSV (6-hour cache).' },
  { name: 'Research Lab — Monte Carlo', to: '/lab', state: 'working', note: 'GBM simulation, VaR/ES, confidence intervals, sensitivity, CSV export.' },
  { name: 'World Tension Index', to: '/tension', state: 'prototype', note: 'Published formula, adjustable weights, 90-day history and weight-sensitivity check; demo inputs, not a validated measure.' },
  { name: 'Accounts (Supabase Auth)', to: '/signin', state: 'prototype', note: 'Magic link, password, sign-up and password reset; enabled once SUPABASE_URL / SUPABASE_ANON_KEY are configured.' },
  { name: 'Plan limits & feature access', to: '/account', state: 'working', note: 'Free-tier watchlist and alert limits enforced in the app; all features unlocked during early access.' },
  { name: 'Market Impact Radar', to: '/impact', state: 'prototype', note: 'Transmission channels with evidence classes; event-window study and correlation matrix run on demo data.' },
  { name: 'Strategy Lab', to: '/strategy', state: 'working', note: 'Event scenarios vs. baseline with common random numbers, scenario tree and comparison table (model outputs on demo prices).' },
  { name: 'Backtesting', to: '/lab?tool=backtest', state: 'working', note: 'Moving-average crossover, RSI mean reversion and buy-and-hold with costs and no look-ahead (synthetic demo prices).' },
  { name: 'EVE & KNOX assistants', state: 'planned', note: 'Phase 4.' },
  { name: 'Subscriptions', to: '/pricing', state: 'planned', note: 'Phase 5, requires owner approval.' },
];

const SOURCES = [
  { name: 'World Bank Open Data (WDI)', url: 'https://data.worldbank.org/', license: 'CC BY 4.0', use: 'Country indicators' },
  { name: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/earthquakes/feed/', license: 'Public domain', use: 'Earthquake layer' },
  { name: 'GDACS (UN OCHA / EC JRC)', url: 'https://www.gdacs.org/', license: 'Free use with attribution', use: 'Disaster alert layer' },
  { name: 'European Central Bank — Data Portal', url: 'https://data.ecb.europa.eu/', license: 'Free reuse with the source quoted ("Source: ECB statistics")', use: 'Macro & FX' },
  { name: 'U.S. CFTC Commitments of Traders', url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm', license: 'U.S. government work', use: 'Futures positioning' },
  { name: 'Natural Earth via world-atlas', url: 'https://www.naturalearthdata.com/', license: 'Public domain', use: 'Map boundaries' },
  { name: 'TradingView Lightweight Charts', url: 'https://github.com/tradingview/lightweight-charts', license: 'Apache 2.0 (attribution)', use: 'Financial charts' },
];

export default function Status() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow="Transparency" title="Platform status & data sources">
        What works today, what runs on demonstration data, and what is still planned. Updated with each release.
      </PageHeader>
      <Panel title="Modules" bodyClass="p-0">
        <ul className="divide-y divide-line">
          {MODULES.map((m) => (
            <li key={m.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className={`inline-flex w-24 shrink-0 justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATE[m.state].cls}`}>
                {STATE[m.state].label}
              </span>
              <span className="flex-1">
                {m.to ? (
                  <Link to={m.to} className="text-sm font-medium text-platinum hover:text-gold-soft">
                    {m.name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-platinum">{m.name}</span>
                )}
                <span className="block text-xs text-slate-dim">{m.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Data sources & licences" className="mt-4" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-mist">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Licence</th>
                <th className="px-4 py-2 font-medium">Used for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {SOURCES.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-2">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-mist">{s.license}</td>
                  <td className="px-4 py-2 text-mist">{s.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="mt-4 text-xs text-slate-dim">
        The “Simulated” demo dataset is produced by Aurora Veritatis for interface demonstration. It does not describe real events
        and must not be cited.
      </p>
    </div>
  );
}
