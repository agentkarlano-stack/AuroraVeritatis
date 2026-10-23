import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Loading, PageHeader, Panel } from '../components/ui';
import { DEFAULT_INPUTS, FACTOR_LABELS, calculateQuote, type QuoteInputs, type ScenarioId } from '../lib/quoteCalculator';
import { useEntitlements } from '../store/entitlements';

const STORE_KEY = 'av-admin-quote-v1';
const PERCENT = new Set<keyof QuoteInputs>(['feeRate', 'buffer']);
const SCENARIO_NAME: Record<ScenarioId, string> = { low: 'Low use', expected: 'Expected use', heavy: 'Heavy use' };

function loadInputs(): QuoteInputs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Partial<QuoteInputs> | null;
    return saved ? { ...DEFAULT_INPUTS, ...saved, scenarios: { ...DEFAULT_INPUTS.scenarios, ...saved.scenarios } } : DEFAULT_INPUTS;
  } catch {
    return DEFAULT_INPUTS;
  }
}

const eur = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }) : 'not reachable');
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/** Admin-only internal quotation calculator (lib/quoteCalculator). Inputs stay in this browser; nothing is published. */
export default function AdminQuote() {
  const { status } = useAuth();
  const ent = useEntitlements();
  const [inputs, setInputs] = useState<QuoteInputs>(loadInputs);
  const update = (next: QuoteInputs) => {
    setInputs(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the calculator still works for this visit.
    }
  };

  if (status === 'loading' || ent.status === 'loading') return <div className="mx-auto max-w-6xl px-4 py-8"><Loading /></div>;
  if (status !== 'signed-in' || !ent.isAdmin) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-mist">This page is for administrators.</div>;
  }

  const r = calculateQuote(inputs);
  const field = (k: keyof typeof FACTOR_LABELS) => {
    const isPct = PERCENT.has(k);
    const v = inputs[k];
    return (
      <label key={k} className="block text-xs text-mist">
        {FACTOR_LABELS[k]}
        <input
          type="number"
          min={0}
          step="any"
          className="input mt-1"
          value={isPct ? Math.round(v * 1000) / 10 : v}
          onChange={(e) => update({ ...inputs, [k]: (Number(e.target.value) || 0) / (isPct ? 100 : 1) })}
        />
      </label>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader eyebrow="Administration" title="Quotation calculator">
        Internal tool for private Business & Institutional proposals. Enter current costs and provider prices; nothing here is published or sent. Inputs
        are kept in this browser only.{' '}
        <Link to="/admin" className="text-gold hover:underline">
          Back to administration
        </Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title="Inputs">
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(FACTOR_LABELS) as (keyof typeof FACTOR_LABELS)[]).map(field)}
            <label className="block text-xs text-mist">
              Target gross margin (%)
              <input type="number" min={0} max={95} step="any" className="input mt-1" value={Math.round(inputs.targetMargin * 1000) / 10} onChange={(e) => update({ ...inputs, targetMargin: (Number(e.target.value) || 0) / 100 })} />
            </label>
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs text-mist">AI usage multipliers per scenario</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(['low', 'expected', 'heavy'] as const).map((id) => (
                <label key={id} className="block text-xs text-slate-dim">
                  {SCENARIO_NAME[id]}
                  <input type="number" min={0} step="0.1" className="input mt-1" value={inputs.scenarios[id]} onChange={(e) => update({ ...inputs, scenarios: { ...inputs.scenarios, [id]: Number(e.target.value) || 0 } })} />
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-ghost mt-4 text-xs" onClick={() => update(DEFAULT_INPUTS)}>
            Reset inputs
          </button>
        </Panel>

        <div className="space-y-4">
          {r.warnings.length > 0 && (
            <div role="alert" className="rounded-md border border-warn/40 bg-warn/5 p-3 text-xs text-warn">
              {r.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          <Panel title="Scenarios (per month)" bodyClass="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="text-slate-dim">
                  <tr>
                    <th className="px-3 py-2">Cost</th>
                    {r.scenarios.map((s) => (
                      <th key={s.id} className="px-3 py-2 text-right">
                        {SCENARIO_NAME[s.id]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {(
                    [
                      ['AI requests', (s) => Math.round(s.aiRequests).toLocaleString('en-GB')],
                      ['AI', (s) => eur(s.costs.ai)],
                      ['Infrastructure', (s) => eur(s.costs.infra)],
                      ['Data licences', (s) => eur(s.costs.data)],
                      ['Support', (s) => eur(s.costs.support)],
                      ['Onboarding (spread)', (s) => eur(s.costs.onboarding)],
                      ['Risk buffer', (s) => eur(s.costs.buffer)],
                      ['Total cost', (s) => eur(s.costs.total)],
                      ['Cost per seat', (s) => eur(s.costPerSeat)],
                      ['Minimum price for target margin', (s) => eur(s.minPrice)],
                      ['Minimum price per seat', (s) => eur(s.minPricePerSeat)],
                    ] as [string, (s: (typeof r.scenarios)[number]) => string][]
                  ).map(([label, get]) => (
                    <tr key={label} className={label.startsWith('Total') || label.startsWith('Minimum price for') ? 'font-semibold text-platinum' : ''}>
                      <td className="px-3 py-1.5 font-sans">{label}</td>
                      {r.scenarios.map((s) => (
                        <td key={s.id} className="px-3 py-1.5 text-right">
                          {get(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Recommendation" eyebrow="Internal, not an offer">
            {r.recommendation ? (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="num font-display text-2xl font-bold text-platinum">{eur(r.recommendation.pricePerSeat)}</span>
                  <span className="text-slate-dim"> per seat per month · {eur(r.recommendation.monthly)} per month for {inputs.seats} seats</span>
                </p>
                <p className="text-xs text-mist">{r.recommendation.basis}</p>
                <ul className="grid gap-1 text-xs sm:grid-cols-3">
                  {(['low', 'expected', 'heavy'] as const).map((id) => (
                    <li key={id} className="rounded border border-line p-2">
                      <div className="text-slate-dim">{SCENARIO_NAME[id]}</div>
                      <div className="num text-platinum">Gross margin {pct(r.recommendation!.margins[id].grossMargin)}</div>
                      <div className="num text-slate-dim">Markup {pct(r.recommendation!.margins[id].markup)}</div>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-dim">
                  Gross margin = (price − cost) / price; markup = (price − cost) / cost. Margins are after the payment fee. Minimum price = cost / (1 − target
                  margin − fee).
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-dim">Enter at least one cost to see a recommendation.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
