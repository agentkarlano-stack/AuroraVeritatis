import { Download, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { INSTRUMENTS } from '../data/instruments';
import { useApi } from '../lib/api';
import { COMMODITY_DATA_PATH, COMMODITY_OPTIONS, monthAt, type CommodityData } from '../lib/commodities';
import { demoBars } from '../lib/demoMarket';
import { fmtNumber, fmtPct } from '../lib/format';
import {
  aggregate,
  backtestVar,
  historicalRisk,
  maxDrawdown,
  mean,
  monteCarloRisk,
  normalRisk,
  portfolioReturns,
  riskContributions,
  simpleReturns,
  stdev,
  type RiskFigure,
} from '../lib/risk';
import { histogram } from '../lib/stats';
import { HistogramChart } from './SvgCharts';
import { DemoNotice, ErrorState, Loading, Panel } from './ui';

type Source = 'commodities' | 'simulated';
interface Holding {
  id: string;
  weight: number;
}

const SOURCES: Record<
  Source,
  { label: string; period: string; adjective: string; periodsPerYear: number; horizons: number[]; windows: number[]; backtestWindow: number; options: { id: string; name: string }[]; defaults: Holding[] }
> = {
  commodities: {
    label: 'Commodities, World Bank monthly (real)',
    period: 'month',
    adjective: 'monthly',
    periodsPerYear: 12,
    horizons: [1, 3, 12],
    windows: [60, 120, 240],
    backtestWindow: 60,
    options: COMMODITY_OPTIONS,
    defaults: [
      { id: 'brent', weight: 40 },
      { id: 'gold', weight: 30 },
      { id: 'copper', weight: 20 },
      { id: 'wheat', weight: 10 },
    ],
  },
  simulated: {
    label: 'Demo instruments, daily (simulated)',
    period: 'day',
    adjective: 'daily',
    periodsPerYear: 252,
    horizons: [1, 10, 21],
    windows: [250, 500],
    backtestWindow: 250,
    options: INSTRUMENTS.map((i) => ({ id: i.symbol, name: i.name })),
    defaults: [
      { id: 'GLB-EQ.D', weight: 60 },
      { id: 'UST10Y.D', weight: 30 },
      { id: 'GOLD.D', weight: 10 },
    ],
  },
};
const MAX_HOLDINGS = 8;
const MC_PATHS = 10000;
const MC_SEED = 42;

interface Aligned {
  series: number[][];
  /** Label (month or day) of each return period. */
  labels: string[];
}

/** Return series of the holdings over the periods where every holding has a value, most recent last. */
function alignCommodities(data: CommodityData, ids: string[]): Aligned {
  const raw = ids.map((id) => simpleReturns(data.series.find((s) => s.id === id)?.values ?? []));
  const n = Math.min(...raw.map((r) => r.length));
  const keep: number[] = [];
  for (let t = 0; t < n; t++) if (raw.every((r) => r[t] != null)) keep.push(t);
  // Return t runs from month t to month t + 1.
  return { series: raw.map((r) => keep.map((t) => r[t]!)), labels: keep.map((t) => monthAt(data.start, t + 1)) };
}

function alignSimulated(ids: string[]): Aligned {
  const bars = ids.map((id) => demoBars(id));
  const series = bars.map((b) => simpleReturns(b.map((x) => x.close)).map((r) => r ?? 0));
  return { series, labels: (bars[0] ?? []).slice(1).map((b) => b.time) };
}

interface Result {
  series: number[][];
  labels: string[];
  from: string;
  to: string;
  port: number[];
  hist: RiskFigure | null;
  normal: RiskFigure;
  mc: RiskFigure;
  contributions: number[];
  backtest: ReturnType<typeof backtestVar>;
  backtestFrom: string;
  vol: number;
  drawdown: number;
}

/**
 * Portfolio Value-at-Risk and Expected Shortfall by historical simulation, the normal model and Monte Carlo, with risk
 * contributions and a Kupiec backtest. Real World Bank monthly commodity prices or the labelled simulated instruments.
 */
export function RiskTool() {
  const [source, setSource] = useState<Source>('commodities');
  const cfg = SOURCES[source];
  const [holdings, setHoldings] = useState<Holding[]>(cfg.defaults);
  const [value, setValue] = useState('100000');
  const [confidence, setConfidence] = useState(0.95);
  const [horizon, setHorizon] = useState(1);
  const [win, setWin] = useState(cfg.windows[1]!);
  const commodities = useApi<CommodityData>(source === 'commodities' ? COMMODITY_DATA_PATH : null);

  const switchSource = (s: Source) => {
    setSource(s);
    setHoldings(SOURCES[s].defaults);
    setHorizon(1);
    setWin(SOURCES[s].windows[1] ?? SOURCES[s].windows[0]!);
  };

  const total = holdings.reduce((s, h) => s + h.weight, 0);
  const ids = holdings.map((h) => h.id);
  const amount = Number(value);
  const error =
    holdings.length === 0
      ? 'Add at least one holding.'
      : new Set(ids).size !== ids.length
        ? 'Each holding may appear only once.'
        : holdings.some((h) => !(h.weight > 0 && h.weight <= 100))
          ? 'Weights must be between 0 and 100%.'
          : Math.abs(total - 100) > 0.01
            ? `Weights add up to ${fmtNumber(total, 1)}%; they must add up to 100%.`
            : !(amount > 0)
              ? 'Portfolio value must be positive.'
              : null;

  const data = commodities.status === 'ready' ? commodities.data : null;
  const result = useMemo((): Result | string | null => {
    if (error) return null;
    if (source === 'commodities' && !data) return null;
    const held = holdings.map((h) => h.id);
    const all = source === 'commodities' ? alignCommodities(data!, held) : alignSimulated(held);
    const len = all.series[0]?.length ?? 0;
    if (len < win) return `Only ${len} ${cfg.period}s have values for every holding; choose a shorter window or other holdings.`;
    const w = holdings.map((h) => h.weight / 100);
    const series = all.series.map((s) => s.slice(len - win));
    const port = portfolioReturns(series, w);
    const hSample = horizon === 1 ? port : aggregate(port, horizon);
    const mu = mean(port);
    const sd = stdev(port);
    const fullPort = portfolioReturns(all.series, w);
    return {
      series,
      labels: all.labels.slice(len - win),
      from: all.labels[len - win] ?? '',
      to: all.labels.at(-1) ?? '',
      port,
      hist: hSample.length >= 20 ? historicalRisk(hSample, confidence) : null,
      normal: normalRisk(mu * horizon, sd * Math.sqrt(horizon), confidence),
      mc: monteCarloRisk(series, w, confidence, horizon, MC_PATHS, MC_SEED),
      contributions: riskContributions(series, w),
      backtest: backtestVar(fullPort, confidence, cfg.backtestWindow),
      backtestFrom: all.labels[cfg.backtestWindow] ?? '',
      vol: sd * Math.sqrt(cfg.periodsPerYear),
      drawdown: maxDrawdown(port),
    };
  }, [error, source, data, holdings, win, horizon, confidence, cfg]);

  const exportCsv = (r: Result) => {
    const head = `# Aurora Veritatis portfolio risk. ${source === 'commodities' ? 'Source: World Bank Commodity Price Data (The Pink Sheet), CC BY 4.0. Monthly averages.' : 'SIMULATED demo instruments, not market data.'}\n# Weights: ${holdings.map((h) => `${h.id} ${h.weight}%`).join(', ')}\nperiod,portfolio_return,${ids.join(',')}`;
    const rows = r.port.map((p, t) => [r.labels[t], p.toFixed(8), ...r.series.map((s) => s[t]!.toFixed(8))].join(','));
    const url = URL.createObjectURL(new Blob([`${head}\n${rows.join('\n')}\n`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `av-portfolio-risk-${source}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const per = (n: number) => `${n} ${cfg.period}${n === 1 ? '' : 's'}`;
  const nameOf = (id: string) => cfg.options.find((o) => o.id === id)?.name ?? id;
  const r = typeof result === 'object' ? result : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Panel title="Portfolio" eyebrow="Inputs">
        <div className="space-y-3 text-sm">
          <label className="block text-xs text-mist">
            Data
            <select className="input mt-1" value={source} onChange={(e) => switchSource(e.target.value as Source)}>
              {(Object.keys(SOURCES) as Source[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCES[s].label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs text-mist">Holdings and weights (%)</legend>
            {holdings.map((h, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="input min-w-0 flex-1"
                  aria-label={`Holding ${i + 1}`}
                  value={h.id}
                  onChange={(e) => setHoldings((hs) => hs.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)))}
                >
                  {cfg.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input num w-20"
                  type="number"
                  step="any"
                  aria-label={`Weight of holding ${i + 1} (%)`}
                  value={h.weight}
                  onChange={(e) => setHoldings((hs) => hs.map((x, k) => (k === i ? { ...x, weight: Number(e.target.value) } : x)))}
                />
                <button className="btn-ghost px-2" aria-label={`Remove holding ${i + 1}`} onClick={() => setHoldings((hs) => hs.filter((_, k) => k !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                className="btn-ghost text-xs"
                disabled={holdings.length >= MAX_HOLDINGS}
                onClick={() => setHoldings((hs) => [...hs, { id: cfg.options.find((o) => !hs.some((h) => h.id === o.id))?.id ?? cfg.options[0]!.id, weight: 0 }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add holding
              </button>
              <span className={`num text-xs ${Math.abs(total - 100) > 0.01 ? 'text-warn' : 'text-mist'}`}>Total {fmtNumber(total, 1)}%</span>
            </div>
          </fieldset>
          <label className="block text-xs text-mist">
            Portfolio value
            <input className="input num mt-1" type="number" min="1" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-mist">
              Confidence
              <select className="input mt-1" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>
                <option value={0.95}>95%</option>
                <option value={0.99}>99%</option>
              </select>
            </label>
            <label className="text-xs text-mist">
              Horizon
              <select className="input mt-1" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                {cfg.horizons.map((h) => (
                  <option key={h} value={h}>
                    {per(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-xs text-mist">
              Window (most recent periods)
              <select className="input mt-1" value={win} onChange={(e) => setWin(Number(e.target.value))}>
                {cfg.windows.map((w) => (
                  <option key={w} value={w}>
                    {per(w)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="text-xs text-down">
              {error}
            </p>
          )}
          <p className="text-[11px] text-slate-dim">
            Long-only weights, rebalanced every {cfg.period}. Results update as you type.
          </p>
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        {source === 'simulated' ? (
          <DemoNotice>
            These instruments are <strong>simulated</strong>: the figures demonstrate the methods only and say nothing about real markets.
          </DemoNotice>
        ) : (
          <p className="text-xs text-slate-dim">
            Real World Bank monthly average prices (The Pink Sheet, CC BY 4.0). Monthly averages smooth out moves within a month, so these figures understate
            short-term risk; they are not daily or intraday risk measures.
          </p>
        )}
        {source === 'commodities' && commodities.status === 'loading' && <Loading label="Loading commodity prices" />}
        {source === 'commodities' && commodities.status === 'error' && <ErrorState message={commodities.error} onRetry={commodities.reload} />}
        {typeof result === 'string' && <ErrorState message={result} />}
        {r && (
          <>
            <Panel
              title={`${Math.round(confidence * 100)}% risk over ${per(horizon)}`}
              eyebrow={`Window ${r.from} to ${r.to} · ${per(r.port.length)}`}
              actions={
                <button className="btn-ghost h-8 text-xs" onClick={() => exportCsv(r)}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              }
            >
              <div>
                <table className="num w-full text-sm">
                  <thead className="text-left font-sans text-xs text-mist">
                    <tr className="border-b border-line">
                      <th className="py-2 font-medium">Method</th>
                      <th className="py-2 text-right font-medium">VaR</th>
                      <th className="py-2 text-right font-medium">Expected shortfall</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {(
                      [
                        ['Historical simulation', r.hist, horizon === 1 ? 'Observed returns' : `Non-overlapping ${per(horizon)} sums`],
                        ['Normal (variance-covariance)', r.normal, 'Mean and volatility, √time scaling'],
                        ['Monte Carlo', r.mc, `${MC_PATHS.toLocaleString()} multivariate normal paths, seed ${MC_SEED}`],
                      ] as const
                    ).map(([name, f, note]) => (
                      <tr key={name}>
                        <td className="py-2 pr-3 font-sans">
                          <span className="text-platinum">{name}</span>
                          <span className="block text-[11px] text-slate-dim">{note}</span>
                        </td>
                        <td className="py-2 text-right">
                          {f ? (
                            <>
                              {fmtPct(f.var, 2)}
                              <span className="block text-[11px] text-slate-dim">{fmtNumber(f.var * amount, 0)}</span>
                            </>
                          ) : (
                            <span className="font-sans text-xs text-slate-dim">too few periods</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {f ? (
                            <>
                              {fmtPct(f.cvar, 2)}
                              <span className="block text-[11px] text-slate-dim">{fmtNumber(f.cvar * amount, 0)}</span>
                            </>
                          ) : (
                            '–'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-dim">
                VaR: the loss that was not exceeded in {Math.round(confidence * 100)}% of {per(horizon)} periods (historical) or under the model. Expected
                shortfall: the average loss in the worst {Math.round((1 - confidence) * 100)}%. Annualised volatility {fmtPct(r.vol, 1)}; largest drawdown in
                the window {fmtPct(r.drawdown, 1)}. Past variability is not a forecast of future losses.
              </p>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Risk contributions" eyebrow="Share of portfolio variance">
                <ul className="space-y-2 text-xs">
                  {holdings.map((h, i) => {
                    const c = r.contributions[i] ?? 0;
                    return (
                      <li key={h.id}>
                        <div className="flex justify-between gap-2">
                          <span className="truncate text-platinum">{nameOf(h.id)}</span>
                          <span className="num text-mist">
                            weight {fmtNumber(h.weight, 0)}% · risk {fmtPct(c, 0)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded bg-ink-800">
                          <div className={`h-1.5 rounded ${c < 0 ? 'bg-up' : 'bg-gold'}`} style={{ width: `${Math.min(100, Math.abs(c) * 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-slate-dim">Euler allocation of variance: shares add up to 100%; a negative share means the holding reduced risk.</p>
              </Panel>

              <Panel title="Does the VaR hold up?" eyebrow="Backtest · Kupiec test">
                {r.backtest ? (
                  <div className="space-y-2 text-xs">
                    <p className="text-mist">
                      Each {cfg.period} since {r.backtestFrom} was compared with the historical VaR of the {per(cfg.backtestWindow)} before it.
                    </p>
                    <dl className="num grid grid-cols-3 gap-2">
                      <div>
                        <dt className="font-sans text-slate-dim">Exceptions</dt>
                        <dd className="text-lg text-platinum">{r.backtest.exceptions}</dd>
                      </div>
                      <div>
                        <dt className="font-sans text-slate-dim">Expected</dt>
                        <dd className="text-lg text-platinum">{fmtNumber(r.backtest.expected, 1)}</dd>
                      </div>
                      <div>
                        <dt className="font-sans text-slate-dim">p-value</dt>
                        <dd className={`text-lg ${r.backtest.pValue < 0.05 ? 'text-warn' : 'text-platinum'}`}>{fmtNumber(r.backtest.pValue, 3)}</dd>
                      </div>
                    </dl>
                    <p className={r.backtest.pValue < 0.05 ? 'text-warn' : 'text-mist'}>
                      {r.backtest.pValue < 0.05
                        ? `The number of exceptions differs significantly from the ${fmtPct(1 - confidence, 0)} expected (5% level): the one-${cfg.period} VaR was ${r.backtest.exceptions > r.backtest.expected ? 'too low' : 'too conservative'} for this portfolio.`
                        : 'The number of exceptions is consistent with the confidence level (no rejection at the 5% level).'}
                    </p>
                    <p className="text-[11px] text-slate-dim">
                      {r.backtest.n} {cfg.period}s tested, one-{cfg.period} horizon, current weights applied to the whole history.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-dim">Not enough history for a backtest with these holdings.</p>
                )}
              </Panel>
            </div>

            <Panel title={`Distribution of ${cfg.adjective} portfolio returns`} eyebrow="Window">
              <HistogramChart
                hist={histogram(r.port.map((x) => x * 100), 30)}
                marker={horizon === 1 && r.hist ? -r.hist.var * 100 : undefined}
                markerLabel={horizon === 1 && r.hist ? `VaR ${fmtPct(r.hist.var, 1)}` : undefined}
                ariaLabel={`Histogram of ${cfg.adjective} portfolio returns in percent`}
              />
              <p className="mt-1 text-[11px] text-slate-dim">Returns in percent; the dashed line marks the historical one-{cfg.period} VaR.</p>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
