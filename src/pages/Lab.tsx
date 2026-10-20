import { Download, Play, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FanChart, HistogramChart } from '../components/SvgCharts';
import { PageHeader, Panel, Unavailable } from '../components/ui';
import { fmtNumber, fmtPct } from '../lib/format';
import { MC_LIMITS, simulateGbm, type GbmParams, type GbmResult } from '../lib/montecarlo';

const SENS_MULTIPLIERS = [0.5, 0.75, 1, 1.25, 1.5];

function num(v: string | null, fallback: number) {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function Lab() {
  const [params] = useSearchParams();
  const label = params.get('label')?.slice(0, 40) ?? 'Hypothetical portfolio';
  const [form, setForm] = useState({
    s0: String(num(params.get('s0'), 10000)),
    mu: String(+(num(params.get('mu'), 0.06) * 100).toFixed(2)),
    sigma: String(+(num(params.get('sigma'), 0.18) * 100).toFixed(2)),
    days: '252',
    paths: '5000',
    seed: '42',
  });
  const [result, setResult] = useState<GbmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const parsed = useMemo((): GbmParams | string => {
    const s0 = Number(form.s0);
    const mu = Number(form.mu) / 100;
    const sigma = Number(form.sigma) / 100;
    const days = Number(form.days);
    const paths = Number(form.paths);
    const seed = Number(form.seed);
    if (!(s0 > 0)) return 'Initial value must be positive.';
    if (!Number.isFinite(mu) || Math.abs(mu) > 1) return 'Drift must be between −100% and 100%.';
    if (!(sigma >= 0 && sigma <= 2)) return 'Volatility must be between 0% and 200%.';
    if (!(days >= 1 && days <= MC_LIMITS.maxDays)) return `Horizon must be 1–${MC_LIMITS.maxDays} trading days.`;
    if (!(paths >= 100 && paths <= MC_LIMITS.maxPaths)) return `Paths must be 100–${MC_LIMITS.maxPaths.toLocaleString()}.`;
    if (!Number.isInteger(seed) || seed < 0) return 'Seed must be a non-negative integer.';
    return { s0, mu, sigma, days, paths, seed };
  }, [form]);

  const run = (p: GbmParams | string = parsed) => {
    if (typeof p === 'string') {
      setError(p);
      return;
    }
    setError(null);
    setRunning(true);
    // Yield a frame so the "running" state renders before the synchronous simulation.
    setTimeout(() => {
      try {
        setResult(simulateGbm(p));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setRunning(false);
      }
    }, 16);
  };

  // Run once on load with the initial (possibly prefilled) parameters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => run(), []);

  const sensitivity = useMemo(() => {
    if (!result) return [];
    const p = result.params;
    return SENS_MULTIPLIERS.map((m) => {
      const r = simulateGbm({ ...p, sigma: p.sigma * m, paths: Math.min(p.paths, 3000) });
      return { sigma: p.sigma * m, median: r.stats.median, var95: r.stats.var95, cvar95: r.stats.cvar95, probLoss: r.stats.probLoss };
    });
  }, [result]);

  const exportCsv = () => {
    if (!result) return;
    const p = result.params;
    const lines = [
      '# Aurora Veritatis Research Lab — GBM Monte Carlo (hypothetical simulation, not observed data)',
      `# s0=${p.s0},mu=${p.mu},sigma=${p.sigma},days=${p.days},paths=${p.paths},seed=${p.seed}`,
      'day,p05,p25,p50,p75,p95',
      ...result.fan.map((f) => [f.day, f.p05, f.p25, f.p50, f.p75, f.p95].map((v) => +v.toFixed(6)).join(',')),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `av-montecarlo-seed${p.seed}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const field = (key: keyof typeof form, lbl: string, hint: string, step = 'any') => (
    <div>
      <label className="label" htmlFor={key}>
        {lbl}
      </label>
      <input id={key} className="input num" type="number" step={step} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      <p className="mt-1 text-[11px] text-slate-dim">{hint}</p>
    </div>
  );

  const s = result?.stats;
  const p = result?.params;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Quantitative Research Lab" title="Monte Carlo risk simulation">
        Simulate the distribution of future values under geometric Brownian motion. Results are hypothetical model outputs —
        reproducible with the same seed — and are not forecasts or observed outcomes.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="Model inputs" eyebrow={label}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            {field('s0', 'Initial value', 'Starting portfolio or asset value.')}
            {field('mu', 'Expected annual return (%)', 'Drift μ. An assumption, not an estimate of future returns.')}
            {field('sigma', 'Annual volatility (%)', 'σ. Historical volatility is a common starting point.')}
            {field('days', 'Horizon (trading days)', '252 ≈ one year.', '1')}
            {field('paths', 'Simulated paths', `Up to ${MC_LIMITS.maxPaths.toLocaleString()}.`, '100')}
            <div>
              <label className="label" htmlFor="seed">
                Random seed
              </label>
              <div className="flex gap-2">
                <input id="seed" className="input num" type="number" step="1" value={form.seed} onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))} />
                <button type="button" className="btn-ghost px-2.5" aria-label="Randomise seed" onClick={() => setForm((f) => ({ ...f, seed: String(Math.floor(Math.random() * 1e6)) }))}>
                  <Shuffle className="h-4 w-4" />
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-down">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={running}>
              <Play className="h-4 w-4" /> {running ? 'Simulating…' : 'Run simulation'}
            </button>
          </form>
        </Panel>

        <div className="min-w-0 space-y-4">
          {s && p && result && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['Median terminal value', fmtNumber(s.median), `5–95%: ${fmtNumber(s.p05, 0)} – ${fmtNumber(s.p95, 0)}`],
                  ['95% Value-at-Risk', fmtNumber(s.var95), `${fmtPct(s.var95 / p.s0, 1)} of initial value`],
                  ['95% Expected Shortfall', fmtNumber(s.cvar95), 'Mean loss beyond VaR'],
                  ['Probability of loss', fmtPct(s.probLoss, 1), `over ${p.days} trading days`],
                ].map(([t, v, sub]) => (
                  <div key={t} className="panel p-4">
                    <div className="text-xs text-mist">{t}</div>
                    <div className="num mt-1 text-xl font-semibold text-platinum">{v}</div>
                    <div className="mt-1 text-[11px] text-slate-dim">{sub}</div>
                  </div>
                ))}
              </div>

              <Panel
                title="Percentile fan"
                eyebrow="Simulated paths"
                actions={
                  <button className="btn-quiet text-xs" onClick={exportCsv}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </button>
                }
              >
                <FanChart fan={result.fan} s0={p.s0} />
                <p className="mt-2 text-[11px] text-slate-dim">Gold line: median. Bands: 25–75% and 5–95%. Dashed: initial value.</p>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Terminal value distribution">
                  <HistogramChart hist={result.histogram} marker={s.p05} markerLabel="5th pct (VaR)" />
                </Panel>
                <Panel title="Model verification">
                  <dl className="space-y-2 text-sm">
                    <Row k="Simulated mean" v={fmtNumber(s.mean)} />
                    <Row k="95% CI of mean" v={`${fmtNumber(s.meanCi95[0])} – ${fmtNumber(s.meanCi95[1])}`} />
                    <Row k="Analytical E[S_T] = S₀·e^(μT)" v={fmtNumber(s.analyticMean)} />
                    <Row
                      k="Analytical value inside CI"
                      v={s.analyticMean >= s.meanCi95[0] && s.analyticMean <= s.meanCi95[1] ? 'Yes' : 'No (sampling noise — try more paths)'}
                    />
                    <Row k="Standard deviation" v={fmtNumber(s.stdev)} />
                    <Row k="Paths × steps" v={`${p.paths.toLocaleString()} × ${p.days}`} />
                    <Row k="Compute time" v={`${result.elapsedMs.toFixed(0)} ms`} />
                  </dl>
                </Panel>
              </div>

              <Panel title="Sensitivity to volatility" eyebrow="Same seed, σ scaled">
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[480px] text-sm">
                    <thead className="text-left text-xs text-mist">
                      <tr>
                        <th className="py-2 font-medium">Volatility σ</th>
                        <th className="py-2 text-right font-medium">Median</th>
                        <th className="py-2 text-right font-medium">VaR 95%</th>
                        <th className="py-2 text-right font-medium">ES 95%</th>
                        <th className="py-2 text-right font-medium">P(loss)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {sensitivity.map((r, i) => (
                        <tr key={i} className={SENS_MULTIPLIERS[i] === 1 ? 'text-gold-soft' : ''}>
                          <td className="py-1.5">{fmtPct(r.sigma, 1)}</td>
                          <td className="py-1.5 text-right">{fmtNumber(r.median, 0)}</td>
                          <td className="py-1.5 text-right">{fmtNumber(r.var95, 0)}</td>
                          <td className="py-1.5 text-right">{fmtNumber(r.cvar95, 0)}</td>
                          <td className="py-1.5 text-right">{fmtPct(r.probLoss, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-slate-dim">Sensitivity runs use up to 3,000 paths each.</p>
              </Panel>
            </>
          )}

          <Panel title="Methodology">
            <div className="space-y-2 text-sm leading-relaxed text-mist">
              <p>
                Each path evolves by the exact log-normal step S<sub>t+Δt</sub> = S<sub>t</sub>·exp((μ − σ²/2)Δt + σ√Δt·Z) with
                Δt = 1/252 and Z ~ N(0,1) drawn from a seeded Mulberry32 generator via Box–Muller. VaR is S₀ minus the 5th
                percentile of terminal values; Expected Shortfall is S₀ minus the mean of values at or below that percentile.
              </p>
              <p>
                Limitations: GBM assumes constant volatility, no jumps and log-normal returns, so it understates tail risk in
                crises. Use these results for education and exploration, not for investment decisions.
              </p>
            </div>
          </Panel>
          <Unavailable phase="Phase 3">Backtesting, scenario comparison, historical model accuracy tracking and 3D plots.</Unavailable>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-mist">{k}</dt>
      <dd className="num text-right text-platinum">{v}</dd>
    </div>
  );
}
