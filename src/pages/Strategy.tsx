import { GitBranch, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FanChart, OverlayHistogram } from '../components/SvgCharts';
import { DemoNotice, PageHeader, Panel } from '../components/ui';
import { INSTRUMENTS, INSTRUMENT_MAP } from '../data/instruments';
import { demoBars } from '../lib/demoMarket';
import { fmtNumber, fmtPct } from '../lib/format';
import { simulateGbm, type GbmResult } from '../lib/montecarlo';
import { SCENARIO_TEMPLATES, scenarioTree, type ScenarioTemplate } from '../lib/scenario';
import { histogram } from '../lib/stats';
import { annualisedVol } from '../lib/technical';

interface Form {
  symbol: string;
  probability: string;
  mean: string;
  sd: string;
  day: string;
  days: string;
  mu: string;
  paths: string;
  seed: string;
}

interface Run {
  label: string;
  form: Form;
  baseline: GbmResult;
  scenario: GbmResult;
}

const toForm = (t: ScenarioTemplate): Form => ({
  symbol: t.symbol,
  probability: String(t.probability * 100),
  mean: String(+(t.mean * 100).toFixed(2)),
  sd: String(+(t.sd * 100).toFixed(2)),
  day: String(t.day),
  days: '126',
  mu: '4',
  paths: '5000',
  seed: '7',
});

function validate(f: Form): string | null {
  const n = (v: string) => Number(v);
  if (!INSTRUMENT_MAP.has(f.symbol)) return 'Choose an instrument.';
  if (!(n(f.probability) >= 0 && n(f.probability) <= 100)) return 'Probability must be 0–100%.';
  if (!(n(f.mean) > -95 && n(f.mean) < 500)) return 'Shock size must be between −95% and +500%.';
  if (!(n(f.sd) >= 0 && n(f.sd) <= 100)) return 'Shock uncertainty must be 0–100%.';
  if (!(n(f.days) >= 5 && n(f.days) <= 756)) return 'Horizon must be 5–756 trading days.';
  if (!(Number.isInteger(n(f.day)) && n(f.day) >= 1 && n(f.day) <= n(f.days))) return 'Event day must fall within the horizon.';
  if (!(Math.abs(n(f.mu)) <= 100)) return 'Drift must be between −100% and 100%.';
  if (!(n(f.paths) >= 500 && n(f.paths) <= 20000)) return 'Paths must be 500–20,000.';
  return null;
}

function execute(f: Form, label: string): Run {
  const bars = demoBars(f.symbol);
  const closes = bars.map((b) => b.close);
  const common = {
    s0: closes.at(-1)!,
    mu: Number(f.mu) / 100,
    sigma: annualisedVol(closes.slice(-253)),
    days: Number(f.days),
    paths: Number(f.paths),
    seed: Number(f.seed) || 0,
  };
  return {
    label,
    form: f,
    baseline: simulateGbm(common),
    scenario: simulateGbm({
      ...common,
      jump: { day: Number(f.day), probability: Number(f.probability) / 100, mean: Number(f.mean) / 100, sd: Number(f.sd) / 100 },
    }),
  };
}

export default function Strategy() {
  const [templateId, setTemplateId] = useState(SCENARIO_TEMPLATES[0]!.id);
  const [form, setForm] = useState<Form>(() => toForm(SCENARIO_TEMPLATES[0]!));
  // The default template runs immediately so the page opens with results.
  const [run, setRun] = useState<Run | null>(() => execute(toForm(SCENARIO_TEMPLATES[0]!), SCENARIO_TEMPLATES[0]!.title));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Run[]>([]);

  const template = SCENARIO_TEMPLATES.find((t) => t.id === templateId);

  const simulate = (f = form, label = template?.title ?? 'Custom scenario') => {
    const err = validate(f);
    setError(err);
    if (!err) setRun(execute(f, label));
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = (k: keyof Form, label: string, hint?: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input num" type="number" step="any" value={form[k]} onChange={set(k)} />
      {hint && <span className="mt-1 block text-[11px] text-slate-dim">{hint}</span>}
    </label>
  );

  const s0 = run?.baseline.params.s0 ?? 0;
  const bins = run
    ? (() => {
        // Shared bins over the central range. Values outside are left out (not piled into the edge bins, which would
        // look like a real cluster) and their share is reported under the chart.
        const lo = Math.min(run.baseline.stats.p05, run.scenario.stats.p05) * 0.75;
        const hi = Math.max(run.baseline.stats.p95, run.scenario.stats.p95) * 1.25;
        const inRange = (t: Float64Array) => t.filter((v) => v >= lo && v <= hi);
        const a = inRange(run.baseline.terminal);
        const b = inRange(run.scenario.terminal);
        const outside = 1 - (a.length + b.length) / (run.baseline.terminal.length + run.scenario.terminal.length);
        return { a: histogram(a, 40, lo, hi), b: histogram(b, 40, lo, hi), outside };
      })()
    : null;
  const tree = run ? scenarioTree(run.scenario.terminal, run.scenario.jumped, s0) : null;
  const inst = INSTRUMENT_MAP.get(run?.form.symbol ?? form.symbol);
  const dec = inst?.decimals ?? 2;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Strategy Lab" title="Scenario explorer">
        Define an event, how likely it is, when it could happen and how large its effect might be — then compare the simulated
        outcome distribution against a no-event baseline. Every number here is a model output under your assumptions.
      </PageHeader>
      <DemoNotice>
        <strong>Model scenario.</strong> Starting assumptions are illustrative hypotheses, not calibrated estimates, and the
        underlying prices are synthetic demo series. Nothing here is a forecast or investment advice.
      </DemoNotice>

      <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="Assumptions" bodyClass="p-4">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              simulate();
            }}
          >
            <label className="block">
              <span className="label">Scenario template</span>
              <select
                className="input"
                value={templateId}
                onChange={(e) => {
                  const t = SCENARIO_TEMPLATES.find((x) => x.id === e.target.value);
                  setTemplateId(e.target.value);
                  if (t) setForm(toForm(t));
                }}
              >
                {SCENARIO_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {template && <span className="mt-1 block text-[11px] text-slate-dim">{template.rationale}</span>}
            </label>
            <label className="block">
              <span className="label">Exposed instrument</span>
              <select className="input" value={form.symbol} onChange={set('symbol')}>
                {INSTRUMENTS.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} — {i.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {num('probability', 'Probability (%)')}
              {num('day', 'Event day', 'Trading days ahead')}
              {num('mean', 'Shock size (%)', 'Mean move if it happens')}
              {num('sd', 'Uncertainty (%)', 'Std. dev. of the move')}
              {num('days', 'Horizon (days)')}
              {num('mu', 'Drift (% p.a.)')}
              {num('paths', 'Paths')}
              {num('seed', 'Seed')}
            </div>
            {error && (
              <p role="alert" className="text-sm text-down">
                {error}
              </p>
            )}
            <button className="btn-primary w-full">
              <Play className="h-4 w-4" aria-hidden /> Run scenario
            </button>
          </form>
        </Panel>

        <div className="min-w-0 space-y-4">
          {run && tree && bins && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  [
                    ['Median outcome', run.baseline.stats.median, run.scenario.stats.median, (v: number) => fmtNumber(v, dec)],
                    ['95% Value-at-Risk', run.baseline.stats.var95, run.scenario.stats.var95, (v: number) => fmtNumber(v, dec)],
                    ['95% Expected Shortfall', run.baseline.stats.cvar95, run.scenario.stats.cvar95, (v: number) => fmtNumber(v, dec)],
                    ['Probability of loss', run.baseline.stats.probLoss, run.scenario.stats.probLoss, (v: number) => fmtPct(v, 1)],
                  ] as const
                ).map(([label, b, s, f]) => (
                  <div key={label} className="panel p-4">
                    <div className="text-xs text-mist">{label}</div>
                    <div className="num mt-1 flex items-baseline gap-2">
                      <span className="text-sm text-gold">{f(b)}</span>
                      <span className="text-slate-dim">→</span>
                      <span className="text-lg font-semibold text-info">{f(s)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-dim">baseline → scenario</div>
                  </div>
                ))}
              </div>

              <Panel
                title={`${run.label} · ${run.form.symbol}`}
                eyebrow="Outcome paths"
                actions={
                  <button
                    className="btn-quiet text-xs"
                    disabled={saved.length >= 4}
                    onClick={() => setSaved((xs) => [...xs, run].slice(-4))}
                    title={saved.length >= 4 ? 'Comparison holds up to 4 scenarios' : undefined}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add to comparison
                  </button>
                }
              >
                <FanChart fan={run.baseline.fan} compare={run.scenario.fan} s0={s0} />
                <p className="mt-2 text-[11px] text-slate-dim">
                  <span className="text-gold">Gold</span>: no-event baseline. <span className="text-info">Blue</span>: scenario. Bands show
                  25–75% and 5–95% of simulated paths; dashed line is today's level ({fmtNumber(s0, dec)}).
                </p>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Terminal distribution">
                  <OverlayHistogram a={bins.a} b={bins.b} s0={s0} />
                  <p className="mt-2 text-[11px] text-slate-dim">
                    Bars: baseline. Line: scenario. Same bins for both; {fmtPct(bins.outside, 1)} of outcomes fall outside the
                    range shown.
                  </p>
                </Panel>
                <Panel title="Scenario tree" eyebrow={<GitBranch className="inline h-3 w-3" />}>
                  <div className="space-y-3 text-sm">
                    {(
                      [
                        ['Event occurs', tree.occurred, 'border-info/50'],
                        ['No event', tree.notOccurred, 'border-gold-dim/60'],
                      ] as const
                    ).map(([label, b, cls]) => (
                      <div key={label} className={`rounded-lg border-l-2 bg-ink-850 px-3 py-2 ${cls}`}>
                        <div className="flex justify-between">
                          <span className="font-medium text-platinum">{label}</span>
                          <span className="num text-mist">{b ? `${fmtPct(b.share, 1)} of paths` : 'no paths'}</span>
                        </div>
                        {b && (
                          <dl className="num mt-1 grid grid-cols-3 gap-2 text-xs text-mist">
                            <div>
                              <dt className="text-slate-dim">Median</dt>
                              <dd className="text-platinum">{fmtNumber(b.median, dec)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-dim">5–95%</dt>
                              <dd className="text-platinum">
                                {fmtNumber(b.p05, 0)}–{fmtNumber(b.p95, 0)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-dim">P(loss)</dt>
                              <dd className="text-platinum">{fmtPct(b.probLoss, 1)}</dd>
                            </div>
                          </dl>
                        )}
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-dim">
                      Baseline and scenario share the same random market paths, so differences come from the event assumptions
                      alone.
                    </p>
                  </div>
                </Panel>
              </div>
            </>
          )}

          <Panel title="Scenario comparison" eyebrow="Up to 4 saved runs">
            {saved.length === 0 ? (
              <p className="text-sm text-slate-dim">Run a scenario and choose “Add to comparison” to line scenarios up side by side.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="num w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-mist">
                    <tr className="border-b border-line">
                      <th className="py-2 font-medium">Scenario</th>
                      <th className="py-2 font-medium">Assumption</th>
                      <th className="py-2 text-right font-medium">Median Δ</th>
                      <th className="py-2 text-right font-medium">VaR 95%</th>
                      <th className="py-2 text-right font-medium">P(loss)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {saved.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3 font-sans">
                          <span className="text-platinum">{r.label}</span>
                          <span className="block text-[11px] text-slate-dim">{r.form.symbol}</span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-mist">
                          {r.form.probability}% × {Number(r.form.mean) > 0 ? '+' : ''}
                          {r.form.mean}% ± {r.form.sd}% on day {r.form.day}
                        </td>
                        <td className="py-2 text-right">{fmtPct(r.scenario.stats.median / r.baseline.stats.median - 1, 2, true)}</td>
                        <td className="py-2 text-right">{fmtPct(r.scenario.stats.var95 / r.scenario.params.s0, 1)}</td>
                        <td className="py-2 text-right">{fmtPct(r.scenario.stats.probLoss, 1)}</td>
                        <td className="py-2 text-right">
                          <button className="btn-quiet px-1" aria-label={`Remove ${r.label}`} onClick={() => setSaved((xs) => xs.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Method">
            <p className="text-sm leading-relaxed text-mist">
              Prices follow geometric Brownian motion calibrated to the instrument's trailing one-year volatility. In the scenario,
              each path independently experiences the event with the chosen probability on the chosen day; its size is drawn from a
              normal distribution with the chosen mean and uncertainty. This is a deliberately simple jump model: it ignores
              contagion across assets, volatility regimes and second-round effects. See the{' '}
              <Link to="/impact" className="text-gold hover:underline">
                Market Impact Radar
              </Link>{' '}
              for the reasoning behind each template.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
