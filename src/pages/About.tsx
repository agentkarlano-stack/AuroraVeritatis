import { Link } from 'react-router';
import { PageHeader, Panel } from '../components/ui';
import { OPERATOR_NAME } from '../data/legal';

const PRINCIPLES = [
  { title: 'Sources first', body: 'Every figure carries its source, licence and reference date. Estimates, unverified reports and simulated data are labelled as such, so they are never confused with official statistics.' },
  { title: 'Reproducible research', body: 'Models publish their formulas and assumptions. Simulations are seeded so results can be repeated, and backtests are checked for the usual pitfalls before they are shown.' },
  { title: 'No advice, no hype', body: 'Aurora provides research tools and information, not investment advice. Model outputs and probabilities are not promises about the future.' },
  { title: 'Technology and AI with care', body: 'AI will help collect and summarise sources, but its output will be labelled, cited and reviewed. A convincing explanation from a language model is not treated as evidence.' },
];

const AUDIENCES = ['Students of international relations, economics and finance', 'Researchers and analysts', 'Professionals who follow countries, markets and risks', 'Organisations that need a shared research environment'];

export default function About() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader eyebrow="About us" title="About Aurora Veritatis">
        Aurora Veritatis is an independent intelligence and research platform created to bring global events, geopolitical developments, economic information
        and financial market analysis together in one accessible environment.
      </PageHeader>

      <div className="space-y-4">
        <Panel title="Why we built it" eyebrow="Origin">
          <div className="space-y-3 text-sm leading-relaxed text-mist">
            <p>
              Our project began with a shared interest in international relations, practical research and the belief that understanding the modern world
              requires connecting information across disciplines.
            </p>
            <p>
              Information about the world is plentiful but scattered: official statistics in one place, market data in another, news and events somewhere
              else, and little to show how they relate. Aurora connects them, so a researcher can move from an event to the country it affects, to the
              economy behind it and to the markets that may react, without losing track of where each piece of information came from.
            </p>
          </div>
        </Panel>

        <Panel title="Our mission" eyebrow="Mission">
          <p className="text-base leading-relaxed text-platinum">Make complex global information easier to explore, connect and understand.</p>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            We aim to provide students, researchers, professionals and organisations with reliable sources, interactive analytical tools and a clearer view
            of the forces shaping our world.
          </p>
        </Panel>

        <Panel title="Who it is for" eyebrow="Users">
          <ul className="grid gap-2 text-sm text-mist sm:grid-cols-2">
            {AUDIENCES.map((a) => (
              <li key={a} className="rounded-md border border-line px-3 py-2">
                {a}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="How we work" eyebrow="Principles">
          <div className="grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title}>
                <h3 className="text-sm font-semibold text-platinum">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist">{p.body}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Where we are going" eyebrow="Vision">
          <p className="text-sm leading-relaxed text-mist">
            Aurora is in early access and grows release by release. The long-term goal is one environment for geopolitical monitoring, country research,
            market analysis and quantitative research, with an AI research assistant that cites its sources. What works today, what still uses simulated data
            and what is planned is listed openly on the{' '}
            <Link className="text-gold hover:underline" to="/status">
              platform status page
            </Link>
            .
          </p>
        </Panel>

        <Panel title="Who runs Aurora Veritatis" eyebrow="Operator">
          <p className="text-sm leading-relaxed text-mist">
            Aurora Veritatis is operated by {OPERATOR_NAME} as a private individual. It is an independent project and is not a registered company or
            association.
          </p>
        </Panel>

        <Panel title="Contact and transparency" eyebrow="Contact">
          <div className="flex flex-wrap gap-2 text-sm">
            <a className="btn-primary text-xs" href="mailto:auroraveritatissup@gmail.com">
              Email us
            </a>
            <Link className="btn-ghost text-xs" to="/status">
              Platform status and data sources
            </Link>
            <Link className="btn-ghost text-xs" to="/legal/privacy">
              Privacy
            </Link>
            <Link className="btn-ghost text-xs" to="/legal/imprint">
              Legal notice
            </Link>
            <Link className="btn-ghost text-xs" to="/legal/terms">
              Terms
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
