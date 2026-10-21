import { ArrowRight, BarChart3, BrainCircuit, ChartScatter, Globe2, Landmark, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { IntroSplash } from '../components/IntroSplash';
import { BrandLockup } from '../components/Logo';
import { ProvenanceBadge } from '../components/ui';

/** Platform map (owner's planned structure, Oct 2026). Order matches the two-column layout. */
const MODULES = [
  { to: '/radar', icon: Globe2, title: 'Global Radar', text: 'World map of geopolitical and natural-hazard events with layers, filters, timeline and sourced detail.', tags: 'Map · Layers · Timeline', state: 'Live USGS + demo' },
  { to: '/markets', icon: BarChart3, title: 'Market Terminal', text: 'Charts, indicators and statistics, plus the Market Impact Radar linking events to exposed assets.', tags: 'Charts · Watchlists · Impact Radar', state: 'Demo prices' },
  { to: '/countries', icon: Landmark, title: 'Country Dossiers', text: 'World Bank indicators for every economy with history charts and an animated country-comparison explorer.', tags: 'Indicators · Compare · History', state: 'Live data' },
  { to: '/lab', icon: ChartScatter, title: 'Quant Research', text: 'Reproducible Monte Carlo risk simulation and a Strategy Lab for comparing event scenarios with visible uncertainty.', tags: 'Simulation · Scenarios · Risk', state: 'Working' },
  { to: '/status', icon: BrainCircuit, title: 'AI Intelligence', text: 'EVE and KNOX research assistants and sourced intelligence reports.', tags: 'EVE · KNOX · Reports', state: 'Planned' },
  { to: '/hq', icon: LayoutDashboard, title: 'Headquarters', text: 'Your personalised workspace: widgets, watchlists, favourite countries, alerts and saved research.', tags: 'Personalised workspace', state: 'Prototype' },
] as const;

export default function Home() {
  return (
    <div>
      <IntroSplash />
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,163,90,0.10),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="eyebrow mb-4">Global Analysis &amp; Strategic Insight</div>
            <h1 className="text-4xl font-semibold leading-[1.1] text-platinum md:text-5xl">
              See the world.
              <br />
              <span className="text-gold">Understand its impact.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-mist">
              Aurora Veritatis brings geopolitical monitoring, country intelligence and financial market research into one
              workspace — so you can move from an event on the map to the economies and assets it may affect, with every
              figure tied to its source.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/hq" className="btn-primary px-5 py-2.5">
                Open Headquarters <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/radar" className="btn-ghost px-5 py-2.5">
                Explore the Global Radar
              </Link>
            </div>
            <p className="mt-6 text-xs text-slate-dim">Early-access preview. Free to explore — no account required.</p>
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
        <h2 className="text-2xl font-semibold">Six modules, one analytical workflow</h2>
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
                    <span className={`shrink-0 text-[10px] font-semibold tracking-wider uppercase ${planned ? 'text-gold-dim' : 'text-slate-dim'}`}>{m.state}</span>
                  </div>
                  <p className="mt-1 text-xs text-gold-dim">{m.tags}</p>
                  <p className="mt-2 text-sm leading-relaxed text-mist">{m.text}</p>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-dim">
          “Planned” modules are not available yet. See{' '}
          <Link to="/status" className="text-gold hover:underline">
            platform status
          </Link>{' '}
          for what works today.
        </p>
      </section>

      <section className="border-y border-line bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2">
          <div>
            <ShieldCheck className="h-6 w-6 text-gold" aria-hidden />
            <h2 className="mt-3 text-2xl font-semibold">Transparent by design</h2>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              Intelligence is only as useful as its provenance. Every data point carries a label so you always know what you
              are looking at — and every quantitative claim names its source and reference date.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            {(
              [
                ['confirmed', 'Published by an identified official or primary source, such as the World Bank or USGS.'],
                ['estimate', 'Modelled or estimated values, shown with their methodology.'],
                ['unverified', 'Reported but not independently corroborated.'],
                ['simulated', 'Synthetic demonstration data. Never presented as real events or prices.'],
              ] as const
            ).map(([k, t]) => (
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
            ['Detect', 'Spot a development on the Global Radar and filter by severity, region and date.'],
            ['Contextualise', 'Open the country dossiers for economic, demographic and security baselines.'],
            ['Connect', 'See which asset classes are plausibly exposed — labelled as hypotheses, not predictions.'],
            ['Quantify', 'Chart the instruments, then stress-test outcomes in Quant Research.'],
          ].map(([t, d], i) => (
            <li key={t} className="panel p-5">
              <div className="num font-display text-2xl font-bold text-gold-dim">0{i + 1}</div>
              <div className="mt-2 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-mist">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-xs text-slate-dim">
          Aurora Veritatis is a research and education tool. It does not provide investment advice and does not promise
          financial outcomes.
        </p>
      </section>
    </div>
  );
}
