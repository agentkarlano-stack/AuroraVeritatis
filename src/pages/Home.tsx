import { ArrowRight, BarChart3, BrainCircuit, ChartScatter, Globe2, Landmark, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { BrandLockup } from '../components/Logo';
import { BRAND, HOME, PROVENANCE } from '../../shared/copy';
import { ProvenanceBadge } from '../components/ui';

/** Platform map (owner's planned structure, Oct 2026). Order matches the two-column layout. */
const MODULES = [
  { to: '/radar', icon: Globe2, title: 'Global Radar', text: 'A world map of earthquakes, disaster alerts and simulated geopolitical scenarios. Filter by type, severity, region and date.', tags: 'Map · Layers · Timeline', state: 'Live hazard data' },
  { to: '/markets', icon: BarChart3, title: 'Market Terminal', text: 'Charts and indicators, ECB interest and exchange rates, CFTC futures positioning and the Market Impact Radar.', tags: 'Charts · Macro · Positioning', state: 'Official data, simulated prices' },
  { to: '/countries', icon: Landmark, title: 'Country Dossiers', text: 'World Bank indicators for every economy, with history charts and country comparisons.', tags: 'Indicators · Compare · History', state: 'Official data' },
  { to: '/lab', icon: ChartScatter, title: 'Quant Research', text: 'Monte Carlo risk simulation, strategy backtests and a Strategy Lab for event scenarios.', tags: 'Simulation · Backtests · Scenarios', state: 'Working' },
  { to: '/status', icon: BrainCircuit, title: 'AI Intelligence', text: 'Research assistants and sourced reports. Not available yet.', tags: 'EVE · KNOX · Reports', state: 'Planned' },
  { to: '/hq', icon: LayoutDashboard, title: 'Headquarters', text: 'Your workspace: widgets, watchlists, favourite countries, alerts and your Personal Intelligence Brain.', tags: 'Workspace · Brain', state: 'Saved in your browser' },
] as const;

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,163,90,0.10),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="eyebrow mb-4">{BRAND.subtitle}</div>
            <h1 className="text-4xl font-semibold leading-[1.1] text-platinum md:text-5xl">
              {HOME.heroLine1}
              <br />
              <span className="text-gold">{HOME.heroLine2}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-mist">{HOME.supporting}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/hq" className="btn-primary px-5 py-2.5">
                {HOME.primaryCta} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/radar" className="btn-ghost px-5 py-2.5">
                {HOME.secondaryCta}
              </Link>
            </div>
            <p className="mt-6 text-xs text-slate-dim">{HOME.earlyAccess}</p>
          </div>
          <div className="hidden justify-center lg:flex">
            <div className="panel flex aspect-[4/3] w-[26rem] items-center justify-center bg-charcoal/40 px-8">
              <BrandLockup />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="eyebrow mb-2">Platform</div>
        <h2 className="text-2xl font-semibold">Six modules, one workflow</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {MODULES.map((m) => {
            const planned = m.state === 'Planned';
            return (
              <Link
                key={m.title}
                to={m.to}
                className={`panel group flex gap-4 p-5 transition-colors hover:border-gold-dim ${planned ? 'border-dashed' : ''}`}
              >
                <m.icon className="mt-0.5 h-6 w-6 shrink-0 text-gold" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-sm font-bold tracking-[0.08em] text-platinum uppercase group-hover:text-gold-soft">{m.title}</h3>
                    <span className={`max-w-[45%] text-right text-[10px] font-semibold tracking-wider uppercase ${planned ? 'text-gold-dim' : 'text-slate-dim'}`}>{m.state}</span>
                  </div>
                  <p className="mt-1 text-xs text-gold-dim">{m.tags}</p>
                  <p className="mt-2 text-sm leading-relaxed text-mist">{m.text}</p>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-dim">
          Modules marked “Planned” are not available yet. The{' '}
          <Link to="/status" className="text-gold hover:underline">
            platform status
          </Link>{' '}
          page shows what works today.
        </p>
      </section>

      <section className="border-y border-line bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2">
          <div>
            <ShieldCheck className="h-6 w-6 text-gold" aria-hidden />
            <h2 className="mt-3 text-2xl font-semibold">Transparent by design</h2>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              Every figure carries a label, so you always know what you are looking at. Numbers name their source and
              reference date.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            {(Object.keys(PROVENANCE) as (keyof typeof PROVENANCE)[]).map((k) => [k, PROVENANCE[k].description] as const).map(([k, t]) => (
              <li key={k} className="flex items-start gap-3">
                <ProvenanceBadge kind={k} className="mt-0.5 w-24 justify-center" />
                <span className="text-mist">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="eyebrow mb-2">Workflow</div>
        <h2 className="text-2xl font-semibold">From event to impact</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ['Detect', 'Spot a development on the Global Radar. Filter by severity, region and date.'],
            ['Understand', 'Open the country dossiers for the economic, demographic and security background.'],
            ['Connect', 'See which assets may be exposed. These links are hypotheses, not predictions.'],
            ['Quantify', 'Chart the markets, then test possible outcomes in Quant Research.'],
          ].map(([t, d], i) => (
            <li key={t} className="panel p-5">
              <div className="num font-display text-2xl font-bold text-gold-dim">0{i + 1}</div>
              <div className="mt-2 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-mist">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-xs text-slate-dim">{BRAND.disclaimer}</p>
      </section>
    </div>
  );
}
