import { ArrowRight, BarChart3, Building2, FlaskConical, Globe2, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { IntroSplash } from '../components/IntroSplash';
import { BrandLockup } from '../components/Logo';
import { ProvenanceBadge } from '../components/ui';

const MODULES = [
  { to: '/hq', icon: LayoutDashboard, title: 'Headquarters', text: 'A personal command dashboard: rearrange widgets, track countries and instruments, save research and set alerts.', state: 'Prototype' },
  { to: '/radar', icon: Globe2, title: 'Global Conflict Radar', text: 'An interactive world map of geopolitical and natural-hazard events with filters by region, date, severity and type.', state: 'Prototype · live USGS layer' },
  { to: '/countries', icon: Building2, title: 'Country Intelligence', text: 'Dossiers built from World Bank Open Data — economy, demography, infrastructure and defence spending, each with source and year.', state: 'Live data' },
  { to: '/markets', icon: BarChart3, title: 'Markets Terminal', text: 'Candlestick charts, indicators, return statistics and geopolitical event annotations in a research-grade terminal.', state: 'Demo data' },
  { to: '/lab', icon: FlaskConical, title: 'Quantitative Research Lab', text: 'Reproducible Monte Carlo simulation with VaR, expected shortfall, confidence intervals and sensitivity analysis.', state: 'Working' },
];

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
                Explore the Conflict Radar
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
        <h2 className="text-2xl font-semibold">Five modules, one analytical workflow</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Link key={m.to} to={m.to} className="panel group flex flex-col p-5 transition-colors hover:border-gold-dim">
              <div className="flex items-center justify-between">
                <m.icon className="h-5 w-5 text-gold" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">{m.state}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-platinum group-hover:text-gold-soft">{m.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-mist">{m.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs text-gold">
                Open <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
          <Link to="/status" className="panel flex flex-col justify-center border-dashed p-5 hover:border-gold-dim">
            <h3 className="text-base font-semibold text-platinum">In development</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              Calibrated World Tension Index, Strategy Lab, real geopolitical feeds and the EVE &amp; KNOX research assistants. See the
              platform status page for what works today.
            </p>
          </Link>
        </div>
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
            ['Detect', 'Spot a development on the Conflict Radar and filter by severity, region and date.'],
            ['Contextualise', 'Open the country dossiers for economic, demographic and security baselines.'],
            ['Connect', 'See which asset classes are plausibly exposed — labelled as hypotheses, not predictions.'],
            ['Quantify', 'Chart the instruments, then stress-test outcomes in the Research Lab.'],
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
