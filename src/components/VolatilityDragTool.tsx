import { Play, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { FanChart } from './SvgCharts';
import { Panel, ProvenanceBadge } from './ui';
import { fmtNumber, fmtPct } from '../lib/format';
import { DRAG_LIMITS, simulateDrag, type DragResult } from '../lib/volatilityDrag';

interface Form {
  aLabel: string;
  aMean: string;
  aVol: string;
  bLabel: string;
  bMean: string;
  bVol: string;
  capital: string;
  years: string;
  contribution: string;
  target: string;
  paths: string;
  seed: string;
}

const DEFAULTS: Form = {
  aLabel: 'Calm strategy',
  aMean: '7',
  aVol: '8',
  bLabel: 'High-volatility strategy',
  bMean: '9',
  bVol: '35',
  capital: '10000',
  years: '20',
  contribution: '0',
  target: '30000',
  paths: '2000',
  seed: '42',
};

/**
 * Volatility drag simulator: two strategies side by side, same random numbers, so the difference in outcomes comes
 * from the return and volatility assumptions alone. Hypothetical inputs; results are simulations, not forecasts.
 */
export function VolatilityDragTool() {
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [res, setRes] = useState<DragResult[] | null>(() => run(DEFAULTS).res);
  const [error, setError] = useState<string | null>(null);

  const submit = (f: Form) => {
    const out = run(f);
    setError(out.error);
    if (out.res) setRes(out.res);
  };
  const field = (key: keyof Form, label: string, step = 'any') => (
    <label className="block text-xs text-mist">
      {label}
      <input className="input num mt-1" type={key.endsWith('Label') ? 'text' : 'number'} step={step} value={form[key]} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  );
  const [a, b] = res ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Panel title="Assumptions" eyebrow="Hypothetical">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(form);
          }}
        >
          <fieldset className="space-y-2 rounded-md border border-line p-2">
            <legend className="px-1 text-[11px] text-gold">Strategy A</legend>
            {field('aLabel', 'Name')}
            <div className="grid grid-cols-2 gap-2">
              {field('aMean', 'Average return %/yr')}
              {field('aVol', 'Volatility %/yr')}
            </div>
          </fieldset>
          <fieldset className="space-y-2 rounded-md border border-line p-2">
            <legend className="px-1 text-[11px] text-info">Strategy B</legend>
            {field('bLabel', 'Name')}
            <div className="grid grid-cols-2 gap-2">
              {field('bMean', 'Average return %/yr')}
              {field('bVol', 'Volatility %/yr')}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            {field('capital', 'Starting capital')}
            {field('years', `Years (max ${DRAG_LIMITS.maxYears})`, '1')}
            {field('contribution', 'Monthly contribution')}
            {field('target', 'Target wealth (0: none)')}
            {field('paths', `Paths (max ${DRAG_LIMITS.maxPaths.toLocaleString()})`, '100')}
            <div>
              <label className="block text-xs text-mist" htmlFor="drag-seed">
                Random seed
              </label>
              <div className="mt-1 flex gap-1">
                <input id="drag-seed" className="input num" type="number" step="1" value={form.seed} onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))} />
                <button type="button" className="btn-ghost px-2" aria-label="Randomise seed" onClick={() => setForm((f) => ({ ...f, seed: String(Math.floor(Math.random() * 1e6)) }))}>
                  <Shuffle className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-down">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full">
            <Play className="h-4 w-4" /> Run simulation
          </button>
          <button type="button" className="btn-ghost w-full text-xs" onClick={() => (setForm(DEFAULTS), submit(DEFAULTS))}>
            Reset to the example
          </button>
        </form>
      </Panel>

      {a && b ? (
        <div className="min-w-0 space-y-4">
          <div className="panel p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
              Median wealth after {form.years} years <ProvenanceBadge kind="simulated" />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="num text-3xl font-semibold text-gold">{fmtNumber(a.sim.medianTerminal, 0)}</span>
              <span className="num text-3xl font-semibold text-info">{fmtNumber(b.sim.medianTerminal, 0)}</span>
            </div>
            <p className="mt-2 text-sm text-mist">
              {a.label} averages {fmtPct(a.input.mean, 1)} a year, {b.label} {fmtPct(b.input.mean, 1)}. Compounded, the median path grows at{' '}
              <span className="num text-platinum">{fmtPct(a.theory.medianCagr, 2)}</span> and <span className="num text-platinum">{fmtPct(b.theory.medianCagr, 2)}</span> a year:{' '}
              {b.theory.medianCagr < a.theory.medianCagr === b.input.mean > a.input.mean
                ? 'the strategy with the higher average return grows more slowly, because of its volatility.'
                : 'volatility reduces both growth rates below their averages.'}
            </p>
          </div>

          <Panel title="Range of outcomes" eyebrow="Percentile bands 5–95 % and 25–75 %, median line">
            <FanChart
              fan={a.fan}
              compare={b.fan}
              s0={a.invested}
              xLabel={(m) => `${Math.round(m / 12)}y`}
              xTicks={yearTicks(Number(form.years) || 20)}
              log
              ariaLabel={`Simulated wealth over time: ${a.label} in gold, ${b.label} in blue`}
            />
            <p className="mt-1 text-[11px] text-slate-dim">
              <span className="text-gold">Gold: {a.label}</span> · <span className="text-info">Blue: {b.label}</span> · dashed line: amount invested ·
              logarithmic scale (equal distances are equal growth factors). Bands are
              percentiles of the simulated paths, not statistical confidence intervals.
            </p>
          </Panel>

          <Panel title="Comparison" eyebrow={`${res!.length} strategies · ${form.paths} paths · seed ${form.seed}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-slate-dim">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Measure</th>
                    <th className="py-1 pr-3 font-normal text-gold">{a.label}</th>
                    <th className="py-1 font-normal text-info">{b.label}</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line/60 text-mist">
                  {ROWS.map(([label, get]) => (
                    <tr key={label}>
                      <td className="py-1.5 pr-3 font-sans text-mist">{label}</td>
                      <td className="py-1.5 pr-3 text-platinum">{get(a)}</td>
                      <td className="py-1.5 text-platinum">{get(b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Method" eyebrow="Formulas and assumptions">
            <div className="space-y-2 text-xs leading-relaxed text-mist">
              <p>
                Annual gross returns 1 + R are log-normal with exactly the chosen average a and volatility v: σ² = ln(1 + v²/(1 + a)²) and μ = ln(1 + a) − σ²/2.
                Paths move monthly by μ/12 + (σ/√12)·Z, so each year keeps the same average and volatility.
              </p>
              <p>
                The average wealth grows like (1 + a)<sup>T</sup>, but the typical (median) path grows like e<sup>μT</sup>. The gap is volatility drag. The
                common shortcut g ≈ a − v²/2 is shown for comparison; it is accurate only for small returns and volatilities.
              </p>
              <p>
                Both strategies use the same random numbers, so the comparison isolates the assumptions. Inputs are hypothetical; results are simulations
                of a model, not forecasts or observed returns.
              </p>
            </div>
          </Panel>
        </div>
      ) : (
        <p className="text-sm text-slate-dim">Run the simulation to see results.</p>
      )}
    </div>
  );
}

const ROWS: [string, (r: DragResult) => string][] = [
  ['Average annual return (input)', (r) => fmtPct(r.input.mean, 2)],
  ['Volatility (input)', (r) => fmtPct(r.input.vol, 2)],
  ['Average of simulated annual returns', (r) => fmtPct(r.sim.avgAnnualReturn, 2)],
  ['Median compound growth (exact)', (r) => fmtPct(r.theory.medianCagr, 2)],
  ['Approximation a − v²/2', (r) => fmtPct(r.theory.approxGeometric, 2)],
  ['Median realised CAGR (simulated)', (r) => (r.sim.medianCagr == null ? 'n/a with contributions' : fmtPct(r.sim.medianCagr, 2))],
  ['Mean final wealth', (r) => fmtNumber(r.sim.meanTerminal, 0)],
  ['Median final wealth', (r) => fmtNumber(r.sim.medianTerminal, 0)],
  ['5th – 95th percentile', (r) => `${fmtNumber(r.sim.p05, 0)} – ${fmtNumber(r.sim.p95, 0)}`],
  ['Chance of ending below the amount invested', (r) => fmtPct(r.sim.probBelowInvested, 1)],
  ['Chance of reaching the target', (r) => (r.sim.probTarget == null ? 'no target' : fmtPct(r.sim.probTarget, 1))],
  ['Median worst drawdown', (r) => fmtPct(-r.sim.medianMaxDrawdown, 1)],
];

/** Tick months at round year steps. */
function yearTicks(years: number): number[] {
  const step = [1, 2, 5, 10].find((s) => years / s <= 6) ?? 10;
  const out: number[] = [];
  for (let y = 0; y <= years; y += step) out.push(y * 12);
  return out;
}

function run(f: Form): { res: DragResult[] | null; error: string | null } {
  const n = (s: string) => Number(s.replace(',', '.'));
  const values = [f.aMean, f.aVol, f.bMean, f.bVol, f.capital, f.years, f.contribution, f.target, f.paths, f.seed].map(n);
  if (values.some((v) => !Number.isFinite(v))) return { res: null, error: 'Every field needs a number.' };
  try {
    return {
      res: simulateDrag({
        strategies: [
          { label: f.aLabel.trim() || 'Strategy A', mean: n(f.aMean) / 100, vol: n(f.aVol) / 100 },
          { label: f.bLabel.trim() || 'Strategy B', mean: n(f.bMean) / 100, vol: n(f.bVol) / 100 },
        ],
        capital: n(f.capital),
        years: n(f.years),
        monthlyContribution: n(f.contribution),
        target: n(f.target),
        paths: n(f.paths),
        seed: Math.round(n(f.seed)),
      }),
      error: null,
    };
  } catch (e) {
    return { res: null, error: (e as Error).message };
  }
}
