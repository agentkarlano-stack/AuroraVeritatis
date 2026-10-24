import { Link } from 'react-router';
import { PageHeader, Panel } from '../components/ui';

type State = 'working' | 'prototype' | 'demo' | 'planned';

const STATE: Record<State, { label: string; cls: string }> = {
  working: { label: 'Working', cls: 'border-up/50 text-up' },
  prototype: { label: 'Prototype', cls: 'border-info/50 text-info' },
  demo: { label: 'Simulated data', cls: 'border-gold-dim text-gold' },
  planned: { label: 'Planned', cls: 'border-line text-slate-dim' },
};

const MODULES: { name: string; to?: string; state: State; note: string }[] = [
  { name: 'Headquarters', to: '/hq', state: 'working', note: 'Widgets, watchlist, favourite countries, alerts and notes. Saved in your browser.' },
  { name: 'Global Radar: natural hazards', to: '/radar', state: 'working', note: '2D map or 3D globe. USGS earthquakes of magnitude 4.5 and above, updated every 10 minutes. GDACS alerts for cyclones, floods, volcanoes, droughts and wildfires, updated every 30 minutes.' },
  { name: 'Global Radar: geopolitical events', to: '/radar', state: 'demo', note: 'Simulated scenarios for now. Real, sourced conflict and news events are planned.' },
  { name: 'Global Radar: timeline', to: '/radar', state: 'working', note: 'Daily event counts by category. Click a day to filter the map and the list.' },
  { name: 'News verification', to: '/news', state: 'working', note: 'Headlines from the GDELT Project grouped by story; independent publishers counted, syndicated copies and official sources marked. Headlines and links only.' },
  { name: 'Country dossiers', to: '/countries', state: 'working', note: '23 World Bank indicators for every economy, each with its reference year, and history charts from 1990.' },
  { name: 'Country comparison', to: '/countries/vs?c=DEU,FRA,USA', state: 'working', note: 'Up to four countries side by side across all 23 indicators.' },
  { name: 'Animated country explorer', to: '/countries/compare', state: 'working', note: 'Bubble chart of any two World Bank indicators, sized by a third, year by year since 1990.' },
  { name: 'Country politics and elections', state: 'planned', note: 'Needs curated electoral and governance sources. No figures are shown until then.' },
  { name: 'Chart editor', to: '/markets', state: 'working', note: 'Interval and range controls, 12 chart types, 57 tested indicators, drawings with undo, templates, saved charts, PNG and JSON export, full screen. Works on official ECB reference rates (daily closing values).' },
  { name: 'Market prices for stocks, indices and commodities', to: '/markets', state: 'demo', note: 'Simulated (.D instruments). Licensed prices and intraday intervals are not available yet; intraday intervals are shown as unavailable.' },
  { name: 'Commodity & Energy Monitor', to: '/markets/commodities', state: 'working', note: '28 World Bank monthly benchmark prices since 1990 (Pink Sheet, CC BY 4.0) with changes, volatility, comparisons, correlations and CSV. Not daily or live prices.' },
  { name: 'Map Explorer', to: '/geo', state: 'working', note: '2D map and 3D globe with NASA satellite layers, 40+ World Bank map layers and live hazard events, each with its licence and date.' },
  { name: 'Macro & FX', to: '/macro', state: 'working', note: 'ECB interest rates, euro-area inflation, the 10-year yield and 15 euro exchange rates, with up to 25 years of history and CSV export.' },
  { name: 'Futures positioning', to: '/positioning', state: 'working', note: 'Weekly CFTC Commitments of Traders data for 14 futures markets, with a 3-year positioning index and CSV export.' },
  { name: 'Market Impact chain', to: '/impact', state: 'working', note: 'A live earthquake or disaster alert, its country, that country\'s commodity exposure (8 World Bank indicators with fixed thresholds) and World Bank monthly commodity prices around the event.' },
  { name: 'Market Impact Radar: transmission channels', to: '/impact', state: 'prototype', note: 'How classes of events can reach markets, with evidence classes. The event study and correlations run on simulated prices.' },
  { name: 'Monte Carlo simulation', to: '/lab', state: 'working', note: 'Price path simulation with value at risk, expected shortfall, confidence intervals and CSV export.' },
  { name: 'Portfolio risk', to: '/lab?tool=risk', state: 'working', note: 'Value at risk and expected shortfall by three methods, risk contributions and a Kupiec backtest, on real World Bank monthly commodity prices or simulated instruments.' },
  { name: 'Prediction Research', to: '/lab/forecasts', state: 'working', note: 'Your own forecasts with resolution criteria, revisions, Brier and log scores and calibration. Stored in your browser. Prediction-market prices are not shown until display rights are confirmed.' },
  { name: 'Backtesting', to: '/lab?tool=backtest', state: 'working', note: 'Moving-average and RSI rules against buy and hold, after costs. Runs on simulated prices.' },
  { name: 'Strategy Lab', to: '/strategy', state: 'working', note: 'Compare event scenarios with a no-event baseline. Outputs are model results on simulated prices.' },
  { name: 'World Tension Index', to: '/tension', state: 'prototype', note: 'Published formula, adjustable weights and a sensitivity check. Conflict inputs are simulated, so it is not a validated measure yet.' },
  { name: 'Personal Intelligence Brain', to: '/brain', state: 'working', note: 'Your own research graph of events, countries, markets and ideas. Stored in your browser, with JSON and Markdown export.' },
  { name: 'Currency and purchasing power', to: '/currency', state: 'working', note: 'Purchasing power index, value against the dollar, PPP gap, inflation calculator and currency converters. World Bank annual data and ECB daily reference rates.' },
  { name: 'Devices, subscription periods and organisations', to: '/account', state: 'prototype', note: 'Built and tested; they switch on when the pending database updates are applied. No payments are taken.' },
  { name: 'Accounts and sync', to: '/signin', state: 'prototype', note: 'Switched on in early access: email sign-up with confirmation, password reset, cross-device sync of preferences and notes, data export and account deletion. Everything still works without an account.' },
  { name: 'Plan limits', to: '/account', state: 'working', note: 'Free-plan limits for watchlists and alerts apply. All features are open during early access.' },
  { name: 'AI research assistants (EVE, KNOX)', to: '/assistant', state: 'prototype', note: 'Built: provider-independent gateway (OpenAI or Cloudflare Workers AI), source-grounded answers with checked citations, daily allowances and a global budget. Switched on once the database update is applied and an administrator enables it.' },
  { name: 'Paid plans', to: '/pricing', state: 'planned', note: 'Not available yet. No payments are taken.' },
];

const SOURCES = [
  { name: 'World Bank Open Data (WDI)', url: 'https://data.worldbank.org/', license: 'CC BY 4.0', use: 'Country indicators' },
  { name: 'GDELT Project (DOC 2.0 API)', url: 'https://www.gdeltproject.org/', license: 'Free use with attribution', use: 'News verification (headlines and links)' },
  { name: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/earthquakes/feed/', license: 'Public domain', use: 'Earthquake layer' },
  { name: 'GDACS (UN OCHA and EC JRC)', url: 'https://www.gdacs.org/', license: 'Free use with attribution', use: 'Disaster alert layer' },
  { name: 'European Central Bank Data Portal', url: 'https://data.ecb.europa.eu/', license: 'Free reuse with the source quoted ("Source: ECB statistics")', use: 'Macro & FX' },
  { name: 'U.S. CFTC Commitments of Traders', url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm', license: 'U.S. government work', use: 'Futures positioning' },
  { name: 'Natural Earth via world-atlas', url: 'https://www.naturalearthdata.com/', license: 'Public domain', use: 'Map boundaries' },
  { name: 'NASA Earth Observatory, Black Marble 2016', url: 'https://earthobservatory.nasa.gov/images/144898/earth-at-night-2016', license: 'Public domain (NASA imagery)', use: 'Globe in the cinematic introduction' },
  { name: 'Wikimedia Commons featured pictures', url: 'https://commons.wikimedia.org/', license: 'CC0, public domain, CC BY or CC BY-SA (author and licence shown with each photo)', use: 'Optional profile backgrounds' },
  { name: 'Intro footage from Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:BUDAPEST_HYPERLAPSE.webm', license: 'CC BY 3.0 / 4.0: Gabor Liktor (Budapest hyperlapse), Kremlin.ru press office (Kremlin clock), jazzcool (Budapest tram), trolleway (Moscow tram parade); trimmed, cropped and graded', use: 'Second cinematic introduction edit' },
  { name: 'Mixkit stock video', url: 'https://mixkit.co/license/', license: 'Mixkit Stock Video Free License (commercial use, no attribution required)', use: 'City footage in the cinematic introduction' },
  { name: 'TradingView Lightweight Charts', url: 'https://github.com/tradingview/lightweight-charts', license: 'Apache 2.0 (attribution)', use: 'Financial charts' },
];

export default function Status() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow="Transparency" title="Platform status and data sources">
        What works today, what runs on simulated data and what is still planned. We update this page with every release.
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
      <Panel title="Data sources and licences" className="mt-4" bodyClass="p-0">
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
        Simulated data is made by Aurora Veritatis to demonstrate the interface. It does not describe real events or prices and
        must not be cited.
      </p>
    </div>
  );
}
