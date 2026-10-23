import { Building2, Check, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { DemoNotice, PageHeader } from '../components/ui';
import { TIERS } from '../data/tiers';
import { useTier } from '../lib/entitlements';

export default function Pricing() {
  const tierId = useTier();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Plans" title="Plans">
        Plan limits are active and enforced. Paid subscriptions are not available yet: an administrator can grant complimentary access, and
        everyone else uses the Free plan.
      </PageHeader>
      <DemoNotice>
        Prices are <strong>proposals, not offers</strong>. Paid plans cannot be bought yet and no payments are taken. Final terms will
        be published before launch. Items marked “Planned” do not exist yet, whatever the plan.
      </DemoNotice>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((t) => (
          <div key={t.id} className={`panel flex flex-col p-5 ${t.id === 'prime' ? 'border-gold-dim' : ''}`}>
            <div className="eyebrow">{t.name}</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="num font-display text-3xl font-bold">€{t.priceEur.toFixed(2)}</span>
              <span className="text-sm text-slate-dim">/ month</span>
            </div>
            <p className="mt-1 text-sm text-mist">{t.tagline}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f.label} className="flex gap-2">
                  {f.planned ? <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-dim" aria-hidden /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />}
                  <span className={f.planned ? 'text-slate-dim' : 'text-mist'}>
                    {f.label}
                    {f.planned && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold-dim">Planned</span>}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-1 border-t border-line pt-4 text-xs">
              {(
                [
                  ['Watchlists', t.limits.watchlists],
                  ['Assets per watchlist', t.limits.assetsPerWatchlist],
                  ['AI requests per day (planned)', t.limits.aiRequestsPerDay],
                  ['AI reports per month (planned)', t.limits.aiReportsPerMonth],
                  ['Alert rules', t.limits.alertRules],
                  ['Brain graphs', t.limits.brainGraphs],
                  ['Nodes per Brain graph', t.limits.brainNodesPerGraph],
                  ['Research notes (account)', t.limits.researchNotes],
                  ['Saved charts', t.limits.savedCharts],
                  ['Chart templates', t.limits.chartTemplates],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-slate-dim">{k}</dt>
                  <dd className="num text-platinum">{v}</dd>
                </div>
              ))}
            </dl>
            <button className={`${t.id === 'free' ? 'btn-ghost' : 'btn-primary'} mt-5`} disabled title={t.id === 'free' ? 'Every account starts on Free' : 'Paid plans cannot be bought yet'}>
              {t.id === 'free' ? (tierId === 'free' ? 'Your plan' : 'Available') : tierId === t.id ? 'Your plan (complimentary)' : 'Purchase not available yet'}
            </button>
          </div>
        ))}
      </div>
      <section className="panel mt-8 grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center" aria-labelledby="business-heading">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <Building2 className="h-4 w-4" aria-hidden /> For organisations
          </div>
          <h2 id="business-heading" className="mt-2 font-display text-xl font-bold text-platinum">
            Business & Institutional Solutions
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist">
            For companies, consultancies, universities, newsrooms and public institutions. Each proposal is prepared individually: the number of
            seats, the features your team needs, AI usage allowances, administrator controls and the contract term. Business prices are not
            published; you receive a private quote by email.
          </p>
        </div>
        <Link to="/business" className="btn-primary justify-self-start">
          Request a Business Quote
        </Link>
      </section>
    </div>
  );
}
