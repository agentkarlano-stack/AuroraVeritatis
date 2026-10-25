import { useMemo, useState } from 'react';
import { useApi } from '../lib/api';
import { alignCommodities, COMMODITY_DATA_PATH, COMMODITY_OPTIONS, type CommodityData } from '../lib/commodities';
import { fmtPct } from '../lib/format';
import { efficientFrontier, outOfSample, type FrontierResult, type PortfolioStats } from '../lib/frontier';
import { ErrorState, Loading, Panel, ProvenanceBadge } from './ui';

const DEFAULT_IDS = ['brent', 'gold', 'copper', 'wheat', 'gas-eu'];
const WINDOWS = [60, 120, 240] as const;
const CAPS = [1, 0.6, 0.4, 0.3] as const;
const MAX_ASSETS = 8;

/**
 * Efficient frontier on observed World Bank monthly commodity prices: Ledoit-Wolf or sample covariance, long-only with
 * an optional per-asset cap, minimum-variance, maximum-Sharpe, risk parity, random feasible portfolios and an
 * out-of-sample check. Historical statistics, not forecasts.
 */
export function FrontierTool() {
  const data = useApi<CommodityData>(COMMODITY_DATA_PATH);
  const [ids, setIds] = useState<string[]>(() => DEFAULT_IDS.filter((id) => COMMODITY_OPTIONS.some((o) => o.id === id)));
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(120);
  const [cap, setCap] = useState<(typeof CAPS)[number]>(0.6);
  const [shrink, setShrink] = useState(true);
  const [rf, setRf] = useState('2');

  const computed = useMemo(() => {
    if (data.status !== 'ready' || ids.length < 2) return null;
    try {
      const all = alignCommodities(data.data, ids);
      const n = all.series[0]?.length ?? 0;
      const from = Math.max(0, n - win);
      const series = all.series.map((s) => s.slice(from));
      const inp = { series, periodsPerYear: 12, rf: Number(rf.replace(',', '.')) / 100 || 0, lo: 0, hi: Math.max(cap, 1 / ids.length), shrink, randomCount: 1500, seed: 42 };
      const res = efficientFrontier(inp);
      let oos: ReturnType<typeof outOfSample> | null = null;
      try {
        oos = outOfSample(inp);
      } catch {
        oos = null;
      }
      return { res, oos, from: all.labels[from] ?? '', to: all.labels.at(-1) ?? '', months: series[0]?.length ?? 0, error: null as string | null };
    } catch (e) {
      return { res: null, oos: null, from: '', to: '', months: 0, error: (e as Error).message };
    }
  }, [data, ids, win, cap, shrink, rf]);

  if (data.status === 'loading') return <Loading label="Loading World Bank commodity prices" />;
  if (data.status === 'error') return <ErrorState message={data.error} onRetry={data.reload} />;
  const name = (id: string) => COMMODITY_OPTIONS.find((o) => o.id === id)?.name ?? id;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Panel title="Assets and assumptions" eyebrow="World Bank Pink Sheet, monthly">
        <div className="space-y-3 text-xs">
          <fieldset>
            <legend className="mb-1 text-mist">Assets (2 to {MAX_ASSETS})</legend>
            <div className="flex flex-wrap gap-1">
              {COMMODITY_OPTIONS.map((o) => {
                const on = ids.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="chip text-[11px]"
                    aria-pressed={on}
                    disabled={!on && ids.length >= MAX_ASSETS}
                    onClick={() => setIds((cur) => (on ? cur.filter((x) => x !== o.id) : [...cur, o.id]))}
                  >
                    {o.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="block text-mist">
            Estimation window
            <select className="input mt-1" value={win} onChange={(e) => setWin(Number(e.target.value) as (typeof WINDOWS)[number])}>
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  Last {w} months ({w / 12} years)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-mist">
            Maximum weight per asset
            <select className="input mt-1" value={cap} onChange={(e) => setCap(Number(e.target.value) as (typeof CAPS)[number])}>
              {CAPS.map((c) => (
                <option key={c} value={c}>
                  {c === 1 ? 'No cap (long only)' : `${c * 100} %`}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-mist">
            Risk-free rate (% a year)
            <input className="input num mt-1" inputMode="decimal" value={rf} onChange={(e) => setRf(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-mist">
            <input type="checkbox" className="accent-[#c9a35a]" checked={shrink} onChange={(e) => setShrink(e.target.checked)} />
            Ledoit-Wolf covariance shrinkage
          </label>
          <p className="text-[11px] leading-snug text-slate-dim">
            Shrinkage pulls the noisy sample covariance towards a simple target, which avoids extreme allocations from estimation noise.
          </p>
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        {ids.length < 2 ? (
          <p className="text-sm text-slate-dim">Choose at least two assets.</p>
        ) : computed?.error ? (
          <p role="alert" className="text-sm text-down">
            {computed.error}
          </p>
        ) : computed?.res ? (
          <Result res={computed.res} oos={computed.oos} ids={ids} name={name} from={computed.from} to={computed.to} months={computed.months} shrink={shrink} />
        ) : null}
      </div>
    </div>
  );
}

function Result({
  res,
  oos,
  ids,
  name,
  from,
  to,
  months,
  shrink,
}: {
  res: FrontierResult;
  oos: ReturnType<typeof outOfSample> | null;
  ids: string[];
  name: (id: string) => string;
  from: string;
  to: string;
  months: number;
  shrink: boolean;
}) {
  const named: [string, PortfolioStats | null, string][] = [
    ['Maximum Sharpe', res.maxSharpe, 'text-gold'],
    ['Minimum variance', res.minVariance, 'text-info'],
    ['Risk parity', res.riskParity, 'text-platinum'],
    ['Equal weight', res.equal, 'text-mist'],
  ];
  return (
    <>
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
          Highest Sharpe ratio on the frontier, {from} to {to} ({months} months) <ProvenanceBadge kind="confirmed" />
        </div>
        <div className="num mt-1 text-3xl font-semibold text-gold">{res.maxSharpe.sharpe.toFixed(2)}</div>
        <p className="mt-1 text-sm text-mist">
          {fmtPct(res.maxSharpe.ret, 1)} average return at {fmtPct(res.maxSharpe.vol, 1)} volatility a year, in the past window. Historical statistics on
          monthly averages, not a forecast or a recommendation.
          {shrink && res.shrinkage != null && <> Shrinkage intensity {fmtPct(res.shrinkage, 0)}.</>}
        </p>
      </div>

      <Panel title="Risk and return" eyebrow="Annualised, past window">
        <Scatter res={res} named={named} />
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {named.map(([n, s]) =>
            s ? (
              <li key={n} className="flex items-center gap-1.5 text-mist">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: MARK[n] }} />
                {n}
              </li>
            ) : null,
          )}
        </ul>
        <p className="mt-1 text-[11px] text-slate-dim">
          Grey: 1,500 random portfolios within the limits. Line: efficient frontier. Horizontal axis: volatility a year; vertical axis: average return a year.
        </p>
      </Panel>

      <Panel title="Weights" eyebrow="Long only, within the cap">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-slate-dim">
              <tr>
                <th className="py-1 pr-3 font-normal">Asset</th>
                {named.map(([n, , cls]) => (
                  <th key={n} className={`py-1 pr-3 font-normal ${cls}`}>
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num divide-y divide-line/60 text-platinum">
              {ids.map((id, i) => (
                <tr key={id}>
                  <td className="py-1.5 pr-3 font-sans text-mist">{name(id)}</td>
                  {named.map(([n, s]) => (
                    <td key={n} className="py-1.5 pr-3">
                      {s ? fmtPct(s.weights[i]!, 0) : '–'}
                    </td>
                  ))}
                </tr>
              ))}
              {(['Return', 'Volatility', 'Sharpe'] as const).map((k) => (
                <tr key={k} className="text-mist">
                  <td className="py-1.5 pr-3 font-sans">{k}</td>
                  {named.map(([n, s]) => (
                    <td key={n} className="py-1.5 pr-3">
                      {!s ? 'outside the cap' : k === 'Return' ? fmtPct(s.ret, 1) : k === 'Volatility' ? fmtPct(s.vol, 1) : s.sharpe.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {oos && (
        <Panel title="Out-of-sample check" eyebrow={`Estimated on ${oos.trainPeriods} months, tested on the next ${oos.testPeriods}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="text-slate-dim">
                <tr>
                  <th className="py-1 pr-3 font-normal">Portfolio</th>
                  <th className="py-1 pr-3 font-normal">Realised return</th>
                  <th className="py-1 pr-3 font-normal">Realised volatility</th>
                  <th className="py-1 font-normal">Sharpe</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line/60 text-platinum">
                {oos.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="py-1.5 pr-3 font-sans text-mist">{r.name}</td>
                    <td className="py-1.5 pr-3">{fmtPct(r.ret, 1)}</td>
                    <td className="py-1.5 pr-3">{fmtPct(r.vol, 1)}</td>
                    <td className="py-1.5">{r.sharpe.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-dim">
            Weights are fixed from the earlier part of the window and applied to the later part. In-sample optima often do worse on unseen data; this
            table shows by how much.
          </p>
        </Panel>
      )}

      <Panel title="Correlation" eyebrow="Monthly returns">
        <div className="overflow-x-auto">
          <table className="text-center text-[11px]">
            <thead>
              <tr>
                <th />
                {ids.map((id) => (
                  <th key={id} className="px-1 py-1 font-normal text-slate-dim">
                    {short(id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num">
              {ids.map((id, i) => (
                <tr key={id}>
                  <th className="pr-2 text-left font-normal text-slate-dim">{short(id)}</th>
                  {ids.map((jd, j) => {
                    const c = res.correlation[i]![j]!;
                    return (
                      <td key={jd} className="h-8 w-12 text-platinum" style={{ background: c >= 0 ? `rgba(201,163,90,${(c * 0.55).toFixed(3)})` : `rgba(125,156,192,${(-c * 0.55).toFixed(3)})` }}>
                        {c.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

const MARK: Record<string, string> = { 'Maximum Sharpe': '#c9a35a', 'Minimum variance': '#7d9cc0', 'Risk parity': '#f1f0ec', 'Equal weight': '#9a978f' };
const short = (id: string) => id.toUpperCase();
const W = 640;
const H = 300;
const PAD = { l: 52, r: 12, t: 12, b: 32 };

function Scatter({ res, named }: { res: FrontierResult; named: [string, PortfolioStats | null, string][] }) {
  const pts = [...res.random, ...res.frontier];
  const vLo = Math.min(...pts.map((p) => p.vol));
  const vHi = Math.max(...pts.map((p) => p.vol));
  const vMin = Math.max(0, vLo - (vHi - vLo) * 0.08);
  const vMax = vHi + (vHi - vLo) * 0.05;
  const rLo = Math.min(...pts.map((p) => p.ret));
  const rHi = Math.max(...pts.map((p) => p.ret));
  const rMin = rLo - (rHi - rLo) * 0.08;
  const rMax = rHi + (rHi - rLo) * 0.08;
  const x = (v: number) => PAD.l + ((v - vMin) / (vMax - vMin || 1)) * (W - PAD.l - PAD.r);
  const y = (r: number) => H - PAD.b - ((r - rMin) / (rMax - rMin || 1)) * (H - PAD.t - PAD.b);
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => vMin + f * (vMax - vMin));
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => rMin + f * (rMax - rMin));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Random portfolios, efficient frontier and the named portfolios by volatility and return">
      <g fontSize="10" fill="#77756f">
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#1f1f23" />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end">
              {(t * 100).toFixed(1)}%
            </text>
          </g>
        ))}
        {xt.map((t, i) => (
          <text key={`x${t}`} x={x(t)} y={H - 12} textAnchor={i === xt.length - 1 ? 'end' : 'middle'}>
            {(t * 100).toFixed(1)}%
          </text>
        ))}
      </g>
      {res.random.map((p, i) => (
        <circle key={i} cx={x(p.vol)} cy={y(p.ret)} r="1.4" fill="#4a4842" />
      ))}
      <path d={res.frontier.map((p, i) => `${i ? 'L' : 'M'}${x(p.vol)},${y(p.ret)}`).join('')} fill="none" stroke="#c9a35a" strokeWidth="2" />
      {named.map(([n, s]) =>
        s ? (
          <circle key={n} cx={x(s.vol)} cy={y(s.ret)} r="5" fill={MARK[n]} stroke="#0d0d0f" strokeWidth="1.5">
            <title>{`${n}: ${(s.ret * 100).toFixed(1)} % return, ${(s.vol * 100).toFixed(1)} % volatility`}</title>
          </circle>
        ) : null,
      )}
    </svg>
  );
}
