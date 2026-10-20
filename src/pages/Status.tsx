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
  { name: 'Conflict Radar — natural hazards', to: '/radar', state: 'working', note: 'Live USGS M4.5+ earthquake feed, cached at the edge for 10 minutes.' },
  { name: 'Conflict Radar — geopolitical layer', to: '/radar', state: 'demo', note: 'Simulated scenarios until GDELT / UCDP / ReliefWeb ingestion is built.' },
  { name: 'Conflict Radar — timeline', to: '/radar', state: 'working', note: 'Daily event counts by category; click a day to filter the map and list.' },
  { name: 'Country dossiers', to: '/countries', state: 'working', note: '23 World Bank indicators with reference years and 1990–present history charts.' },
  { name: 'Country politics section', state: 'planned', note: 'Requires curated electoral and governance sources.' },
  { name: 'Markets terminal', to: '/markets', state: 'demo', note: 'Charts, indicators and statistics are real calculations on synthetic prices.' },
  { name: 'Research Lab — Monte Carlo', to: '/lab', state: 'working', note: 'GBM simulation, VaR/ES, confidence intervals, sensitivity, CSV export.' },
  { name: 'World Tension Index', to: '/hq', state: 'prototype', note: 'Transparent formula on demo inputs; not a validated measure.' },
  { name: 'Accounts (Supabase Auth)', to: '/signin', state: 'prototype', note: 'Magic link, password, sign-up and password reset; enabled once SUPABASE_URL / SUPABASE_ANON_KEY are configured.' },
  { name: 'Plan limits & feature access', to: '/account', state: 'working', note: 'Free-tier watchlist and alert limits enforced in the app; all features unlocked during early access.' },
  { name: 'Market Impact Radar', to: '/impact', state: 'prototype', note: 'Transmission channels with evidence classes; event-window study and correlation matrix run on demo data.' },
  { name: 'Strategy Lab & backtesting', state: 'planned', note: 'Phase 3.' },
  { name: 'EVE & KNOX assistants', state: 'planned', note: 'Phase 4.' },
  { name: 'Subscriptions', to: '/pricing', state: 'planned', note: 'Phase 5, requires owner approval.' },
];

const SOURCES = [
  { name: 'World Bank Open Data (WDI)', url: 'https://data.worldbank.org/', license: 'CC BY 4.0', use: 'Country indicators' },
  { name: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/earthquakes/feed/', license: 'Public domain', use: 'Earthquake layer' },
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
