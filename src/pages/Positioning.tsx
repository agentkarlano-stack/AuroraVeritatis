import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { COT_LOOKBACK, COT_MARKET_MAP, COT_MARKETS, cotCsv, cotIndexSeries, summariseCot, toPoints, type CotResponse, type CotSummary } from '../../shared/cot';
import { AddToBrain } from '../components/AddToBrain';
import { PerformanceChart, type PerformanceSeries } from '../components/PerformanceChart';
import { ErrorState, Loading, PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { useApi } from '../lib/api';
import { fmtCompact, fmtDate, fmtNumber, fmtPct } from '../lib/format';

const DEFAULT_CODE = '088691';
const NO_ROWS: CotResponse['markets'][number]['rows'] = [];
const RANGES = [3, 10, 20];
const signed = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${fmtCompact(v)}`);
const compactAxis = (v: number) => fmtCompact(v);
const indexAxis = (v: number) => v.toFixed(0);

function IndexBar({ s }: { s: CotSummary }) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-1.5 w-20 rounded-full bg-ink-800" aria-hidden>
        <span className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded bg-gold" style={{ left: `${s.index}%` }} />
      </span>
      <span className="num w-7 text-right text-platinum">{s.index.toFixed(0)}</span>
      {s.extreme && <span className={`text-[10px] font-medium uppercase ${s.extreme === 'long' ? 'text-up' : 'text-down'}`}>Extreme {s.extreme}</span>}
    </span>
  );
}

export default function Positioning() {
  const [params, setParams] = useSearchParams();
  const code = COT_MARKET_MAP.has(params.get('m') ?? '') ? params.get('m')! : DEFAULT_CODE;
  const years = RANGES.includes(Number(params.get('y'))) ? Number(params.get('y')) : 10;
  const market = COT_MARKET_MAP.get(code)!;
  const [sort, setSort] = useState<'group' | 'index'>('group');

  const overview = useApi<CotResponse>('/api/cot');
  const detail = useApi<CotResponse>(`/api/cot/${code}?years=${years}`);

  const rows = useMemo(() => {
    if (overview.status !== 'ready') return [];
    const out = overview.data.markets.flatMap((m) => {
      const def = COT_MARKET_MAP.get(m.code);
      const s = summariseCot(m.rows);
      return def && s ? [{ def, s }] : [];
    });
    return sort === 'index' ? out.sort((a, b) => b.s.index - a.s.index) : out;
  }, [overview, sort]);

  const history = detail.status === 'ready' ? (detail.data.markets[0]?.rows ?? NO_ROWS) : NO_ROWS;
  const summary = useMemo(() => summariseCot(history), [history]);
  const charts = useMemo(() => {
    const pts = toPoints(history);
    const positions: PerformanceSeries[] = [
      { label: 'Large speculators (net)', color: '#c9a35a', points: pts.map((p) => ({ time: p.date, value: p.netSpec })) },
      { label: 'Commercials (net)', color: '#7d9cc0', points: pts.map((p) => ({ time: p.date, value: p.netCommercial })) },
      { label: 'Small traders (net)', color: '#8a8780', points: pts.map((p) => ({ time: p.date, value: p.netSmall })) },
    ];
    const index: PerformanceSeries[] = [{ label: `Positioning index (${COT_LOOKBACK} wk)`, color: '#c9a35a', points: cotIndexSeries(history).map((p) => ({ time: p.date, value: p.value })) }];
    return { positions, index };
  }, [history]);

  const select = (next: { m?: string; y?: number }) => setParams({ m: next.m ?? code, y: String(next.y ?? years) }, { replace: true });

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([cotCsv(market, history)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `av-cot-${market.code}-${history.at(-1)?.date ?? 'latest'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Market Terminal · Institutional data" title="Futures positioning">
        How large speculators, commercial hedgers and small traders are positioned in major futures markets. Data comes from
        the U.S. CFTC Commitments of Traders report, and each market is shown within its own three-year range.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-dim">
        <ProvenanceBadge kind="confirmed" />
        <span>
          Reported weekly by the CFTC: positions as of Tuesday, normally published Friday 15:30 ET. Not real-time; not a trading
          signal.
        </span>
      </div>

      <Panel
        title="All markets"
        eyebrow={overview.status === 'ready' && rows[0] ? `Latest report: positions as of ${fmtDate(rows[0].s.latest.date)}` : 'Latest report'}
        bodyClass="p-0"
        actions={
          <div className="flex gap-1">
            <button className="chip" aria-pressed={sort === 'group'} onClick={() => setSort('group')}>
              By group
            </button>
            <button className="chip" aria-pressed={sort === 'index'} onClick={() => setSort('index')}>
              By index
            </button>
          </div>
        }
      >
        {overview.status === 'loading' && <div className="px-4"><Loading label="Loading CFTC reports" /></div>}
        {overview.status === 'error' && <div className="p-4"><ErrorState message={overview.error} onRetry={overview.reload} /></div>}
        {overview.status === 'ready' && (
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-mist">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Market</th>
                  <th className="px-2 py-2 text-right font-medium">Net speculators</th>
                  <th className="px-2 py-2 text-right font-medium">Weekly change</th>
                  <th className="px-2 py-2 text-right font-medium">% of open interest</th>
                  <th className="px-4 py-2 font-medium">Index (0–100, 3 yr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {rows.map(({ def, s }) => (
                  <tr key={def.code} className={`cursor-pointer hover:bg-ink-800/60 ${def.code === code ? 'bg-ink-800/60' : ''}`} onClick={() => select({ m: def.code })}>
                    <td className="px-4 py-2 font-sans">
                      <button className="min-h-6 text-left text-platinum hover:text-gold-soft" onClick={() => select({ m: def.code })}>
                        {def.name}
                      </button>
                      <span className="block text-[11px] text-slate-dim">
                        {def.group} · {def.exchange}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-platinum">{signed(s.latest.netSpec)}</td>
                    <td className={`px-2 py-2 text-right ${(s.weeklyChange ?? 0) > 0 ? 'text-up' : (s.weeklyChange ?? 0) < 0 ? 'text-down' : ''}`}>{signed(s.weeklyChange)}</td>
                    <td className="px-2 py-2 text-right">{fmtPct(s.netSpecPctOi, 1, true)}</td>
                    <td className="px-4 py-2">
                      <IndexBar s={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {overview.data.missing.length > 0 && (
              <p className="border-t border-line px-4 py-2 text-xs text-slate-dim">
                No recent CFTC rows returned for: {overview.data.missing.map((c) => COT_MARKET_MAP.get(c)?.name ?? c).join(', ')}.
              </p>
            )}
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Panel
            title={`${market.name} · net positions`}
            eyebrow={`${market.exchange} · CFTC code ${market.code} · contracts`}
            actions={
              <div className="flex flex-wrap gap-1">
                {RANGES.map((y) => (
                  <button key={y} className="chip" aria-pressed={years === y} onClick={() => select({ y })}>
                    {y}Y
                  </button>
                ))}
                <button className="chip" onClick={exportCsv} disabled={history.length === 0} aria-label="Download CSV">
                  <Download className="h-3.5 w-3.5" aria-hidden /> CSV
                </button>
              </div>
            }
          >
            {detail.status === 'loading' && <Loading label="Loading history" />}
            {detail.status === 'error' && <ErrorState message={detail.error} onRetry={detail.reload} />}
            {detail.status === 'ready' &&
              (history.length === 0 ? (
                <p className="text-sm text-slate-dim">The CFTC returned no reports for this market in the selected range.</p>
              ) : (
                <>
                  <div className="h-72">
                    <PerformanceChart series={charts.positions} format={compactAxis} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-dim">
                    <span className="text-gold">Gold</span>: large speculators (non-commercial). <span className="text-info">Blue</span>:
                    commercial hedgers. Grey: small (non-reportable) traders. Net = long − short contracts.
                  </p>
                </>
              ))}
          </Panel>
          {detail.status === 'ready' && charts.index[0]!.points.length > 0 && (
            <Panel title="Positioning index over time" eyebrow={`Rolling ${COT_LOOKBACK}-week range · 0 = most short, 100 = most long`}>
              <div className="h-48">
                <PerformanceChart series={charts.index} format={indexAxis} />
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Latest report">
            {summary ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-slate-dim">Positions as of</dt>
                  <dd className="text-platinum">{fmtDate(summary.latest.date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-dim">Net speculators</dt>
                  <dd className="num text-platinum">{fmtNumber(summary.latest.netSpec, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-dim">Weekly change</dt>
                  <dd className="num">{signed(summary.weeklyChange)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-dim">Net commercials</dt>
                  <dd className="num">{fmtNumber(summary.latest.netCommercial, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-dim">Open interest</dt>
                  <dd className="num">{fmtNumber(summary.latest.openInterest, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-dim">Index (3 yr)</dt>
                  <dd className="num text-platinum">{summary.index.toFixed(0)} / 100</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-dim">Percentile (3 yr)</dt>
                  <dd className="num">{summary.percentile.toFixed(0)}th</dd>
                </div>
                <div className="col-span-2 text-xs text-slate-dim">
                  {summary.extreme
                    ? `Speculative positioning is at an extreme ${summary.extreme} relative to the last ${summary.weeks} weeks.`
                    : `Within its ${summary.weeks}-week range; no extreme reading.`}
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-dim">{detail.status === 'loading' ? 'Loading…' : 'No data.'}</p>
            )}
            {market.instrument && (
              <Link to={`/markets?symbol=${encodeURIComponent(market.instrument)}`} className="btn-ghost mt-4 w-full justify-center text-xs">
                Related chart in Market Terminal (simulated prices)
              </Link>
            )}
            <AddToBrain
              className="mt-3"
              entity={{ kind: ['Energy', 'Metals', 'Agriculture'].includes(market.group) ? 'commodity' : 'instrument', label: `${market.name} futures positioning`, ref: { type: 'cot', code: market.code } }}
            />
          </Panel>

          <Panel title="Method & limitations">
            <div className="space-y-2 text-xs leading-relaxed text-mist">
              <p>
                Source: CFTC Legacy Commitments of Traders, futures only. Large speculators are non-commercial reportable traders;
                commercials report hedging use. Net = long − short contracts.
              </p>
              <p>
                Index = (latest net − {COT_LOOKBACK}-week min) ÷ (max − min) × 100. Readings ≥ 90 or ≤ 10 with at least a year of
                history are marked as extremes. Percentile = share of weeks with a lower net position.
              </p>
              <p>
                Limitations: trader categories are self-classified and coarse; positions are three days old when published; extreme
                positioning has no fixed relationship with future prices. For research, not investment advice.
              </p>
              <a className="text-gold hover:underline" href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm" target="_blank" rel="noreferrer">
                CFTC report documentation
              </a>
            </div>
          </Panel>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-dim">
        Markets covered: {COT_MARKETS.length}. Data cached at the edge for up to 6 hours.
      </p>
    </div>
  );
}
