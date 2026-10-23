import { Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChartEditor } from '../components/chart/ChartEditor';
import type { ChartAnnotation } from '../components/chart/ChartCanvas';
import { useDataset } from '../components/chart/useDataset';
import { Change, DemoNotice, LimitNotice, PageHeader, Panel, ProvenanceBadge, Sparkline } from '../components/ui';
import { DEMO_EVENTS } from '../data/demoEvents';
import { INSTRUMENTS, INSTRUMENT_MAP, type AssetClass } from '../data/instruments';
import { demoBars, lastQuote } from '../lib/demoMarket';
import { limitOf, useTier } from '../lib/entitlements';
import { rangeWindow } from '../lib/chart/intervals';
import { INSTRUMENT_OPTIONS, isEcbSymbol, isKnownSymbol } from '../lib/chart/sources';
import { normalizeSettings } from '../lib/chart/workspace';
import { CATEGORY_COLOR } from '../lib/events';
import { fmtNumber, fmtPct } from '../lib/format';
import { correlation } from '../lib/impact';
import { annualisedVol, logReturns, maxDrawdown, periodReturn, rebase } from '../lib/technical';
import { PerformanceChart, type PerformanceSeries } from '../components/PerformanceChart';
import { usePrefs } from '../store/prefs';

const CLASS_LABEL: Record<AssetClass, string> = {
  'equity-index': 'Indices',
  equity: 'Equity baskets',
  commodity: 'Commodities',
  fx: 'FX',
  rates: 'Rates',
  crypto: 'Crypto',
};

const COMPARE_COLORS = ['#c9a35a', '#7d9cc0', '#5e9f7e', '#9d8bb8'];
const MAX_COMPARE = 3;
const performanceCache = new Map<string, { series: PerformanceSeries[]; corr: (number | null)[] }>();

/** Rebased (=100) performance over the trailing `range` sessions for the main symbol plus comparisons, cached by key. */
function performanceFor(symbols: string[], range: number) {
  const key = `${symbols.join(',')}|${range}`;
  const hit = performanceCache.get(key);
  if (hit) return hit;
  const windows = symbols.map((s) => demoBars(s).slice(-range));
  const series = windows.map((bars, i) => {
    const rebased = rebase(bars.map((b) => b.close));
    return { label: symbols[i]!, color: COMPARE_COLORS[i % COMPARE_COLORS.length]!, points: bars.map((b, j) => ({ time: b.time, value: rebased[j]! })) };
  });
  const base = logReturns(windows[0]!.map((b) => b.close));
  const corr = windows.map((bars, i) => (i === 0 ? null : correlation(base, logReturns(bars.map((b) => b.close)))));
  const out = { series, corr };
  performanceCache.set(key, out);
  return out;
}

const annotationCache = new Map<string, ChartAnnotation[]>();
const NO_ANNOTATIONS: ChartAnnotation[] = [];

/** Chart markers for demo events tagged to `symbol`, snapped to the last session on or before the event. */
function annotationsFor(symbol: string): ChartAnnotation[] {
  if (isEcbSymbol(symbol)) return NO_ANNOTATIONS;
  const hit = annotationCache.get(symbol);
  if (hit) return hit;
  const dates = demoBars(symbol).map((b) => b.time);
  const out = DEMO_EVENTS.filter((e) => e.marketLinks?.includes(symbol)).flatMap((e) => {
    const day = e.time.slice(0, 10);
    const onOrBefore = dates.filter((d) => d <= day).at(-1);
    return onOrBefore ? [{ time: onOrBefore, text: 'SIM', color: CATEGORY_COLOR[e.category] }] : [];
  });
  annotationCache.set(symbol, out);
  return out;
}

export default function Markets() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('symbol') ?? '';
  const symbol = isKnownSymbol(requested) ? requested : INSTRUMENTS[0]!.symbol;
  const simulated = INSTRUMENT_MAP.has(symbol);
  const { dataset, loading, error } = useDataset(symbol);
  const { watchlist, toggleWatch } = usePrefs();
  const maxWatch = limitOf(useTier(), 'assetsPerWatchlist');
  const [limitHit, setLimitHit] = useState(false);
  const [filter, setFilter] = useState<'watchlist' | 'all' | 'ecb'>('all');
  const rawSettings = usePrefs((s) => s.chart);
  const settings = useMemo(() => normalizeSettings(rawSettings), [rawSettings]);
  const [compare, setCompare] = useState<string[]>([]);
  const compareSymbols = simulated ? compare.filter((c) => c !== symbol && INSTRUMENT_MAP.has(c)) : [];

  const bars = dataset?.bars ?? [];
  const closes = bars.map((b) => b.close);
  const win = rangeWindow(bars, settings.range);
  const range = win ? Math.max(2, win.to - win.from + 1) : Math.min(126, bars.length);
  const windowCloses = closes.slice(-range);
  const perf = compareSymbols.length ? performanceFor([symbol, ...compareSymbols], range) : null;
  const annotations = annotationsFor(symbol);
  const linkedEvents = simulated ? DEMO_EVENTS.filter((e) => e.marketLinks?.includes(symbol)) : [];
  const decimals = dataset?.decimals ?? 2;

  const list = filter === 'watchlist' ? INSTRUMENTS.filter((i) => watchlist.includes(i.symbol)) : INSTRUMENTS;
  const ecbList = INSTRUMENT_OPTIONS.filter((o) => isEcbSymbol(o.symbol));
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const hi52 = closes.length ? Math.max(...closes.slice(-252)) : null;
  const lo52 = closes.length ? Math.min(...closes.slice(-252)) : null;
  const rangeName = 'preset' in settings.range ? settings.range.preset : 'custom range';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        eyebrow="Market Terminal"
        title="Market analysis"
        actions={
          <>
            <Link to="/markets/commodities" className="btn-ghost text-xs">
              Commodity &amp; Energy Monitor
            </Link>
            <Link to="/impact" className="btn-ghost text-xs">
              Market Impact Radar
            </Link>
            <Link to="/macro" className="btn-ghost text-xs">
              Macro &amp; FX (ECB data)
            </Link>
            <Link to="/positioning" className="btn-ghost text-xs">
              Futures positioning (CFTC data)
            </Link>
          </>
        }
      >
        A chart editor with separate candle interval and history range, chart types, a searchable indicator library, drawings,
        templates, saved charts and image export. Open it full screen for detailed work.
      </PageHeader>
      {simulated ? (
        <DemoNotice>
          This instrument is <strong>simulated</strong>. A seeded model generates its prices, and its symbol ends in “.D”. They are
          not real, delayed or historical prices. Official ECB euro reference rates are in the instrument list.
        </DemoNotice>
      ) : (
        <p className="flex items-center gap-2 text-xs text-slate-dim">
          <ProvenanceBadge kind="confirmed" />
          {symbol.startsWith('CMD:') ? (
            <span>
              Official World Bank monthly average prices (CC BY 4.0): one value per month, not live or spot prices.{' '}
              <Link className="text-gold hover:underline" to="/markets/commodities">
                Commodity &amp; Energy Monitor
              </Link>
            </span>
          ) : (
            'Official ECB euro reference rates: one value per working day, published around 16:00 CET. For information only, not trading rates.'
          )}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel
          title="Instruments"
          className="order-2 lg:order-none"
          bodyClass="p-0"
          actions={
            <div className="flex gap-1">
              <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                All
              </button>
              <button className="chip" aria-pressed={filter === 'watchlist'} onClick={() => setFilter('watchlist')}>
                Watchlist
              </button>
              <button className="chip" aria-pressed={filter === 'ecb'} onClick={() => setFilter('ecb')} title="Official ECB euro reference rates">
                ECB
              </button>
            </div>
          }
        >
          {limitHit && (
            <div className="px-3 pb-2">
              <LimitNotice what="instruments per watchlist" limit={maxWatch} />
            </div>
          )}
          {filter === 'ecb' && (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
              {ecbList.map((o) => (
                <li key={o.symbol} className={o.symbol === symbol ? 'bg-ink-800/70' : 'hover:bg-ink-800/40'}>
                  <button className="block w-full px-3 py-2 text-left" onClick={() => setParams({ symbol: o.symbol })}>
                    <span className={`block text-sm font-medium ${o.symbol === symbol ? 'text-gold-soft' : 'text-platinum'}`}>{o.symbol.replace('ECB:', '')}</span>
                    <span className="block truncate text-[11px] text-slate-dim">{o.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {filter === 'watchlist' && list.length === 0 && <p className="p-4 text-sm text-slate-dim">Your watchlist is empty. Star instruments to add them.</p>}
          {filter !== 'ecb' && (
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
            {list.map((i) => {
              const q = lastQuote(i.symbol);
              const active = i.symbol === symbol;
              return (
                <li key={i.symbol} className={`flex items-center gap-2 px-3 py-2 ${active ? 'bg-ink-800/70' : 'hover:bg-ink-800/40'}`}>
                  <button
                    className={`shrink-0 ${watchlist.includes(i.symbol) ? 'text-gold' : 'text-slate-dim hover:text-mist'}`}
                    aria-label={watchlist.includes(i.symbol) ? `Remove ${i.symbol} from watchlist` : `Add ${i.symbol} to watchlist`}
                    aria-pressed={watchlist.includes(i.symbol)}
                    onClick={() => setLimitHit(!toggleWatch(i.symbol, maxWatch))}
                  >
                    <Star className="h-3.5 w-3.5" fill={watchlist.includes(i.symbol) ? 'currentColor' : 'none'} />
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setParams({ symbol: i.symbol })}>
                    <span className={`block text-sm font-medium ${active ? 'text-gold-soft' : 'text-platinum'}`}>{i.symbol}</span>
                    <span className="block truncate text-[11px] text-slate-dim">{CLASS_LABEL[i.assetClass]}</span>
                  </button>
                  <span className="text-right">
                    <span className="num block text-sm">{q ? fmtNumber(q.price, i.decimals) : '—'}</span>
                    <Change value={q?.changePct ?? null} className="text-[11px]" />
                  </span>
                </li>
              );
            })}
          </ul>
          )}
        </Panel>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{symbol.replace('ECB:', '')}</h2>
                {dataset && <ProvenanceBadge kind={dataset.provenance} />}
              </div>
              <p className="text-xs text-slate-dim">{dataset?.name ?? ''}</p>
            </div>
            {last && (
              <div className="text-right">
                <div className="num text-2xl font-semibold">{fmtNumber(last.close, decimals)}</div>
                <Change value={prev ? last.close / prev.close - 1 : null} className="text-sm" />
                <span className="ml-2 text-xs text-slate-dim">
                  as of {last.time} ({simulated ? 'simulated close' : 'ECB reference rate'})
                </span>
              </div>
            )}
          </div>
          <ChartEditor dataset={dataset} symbol={symbol} onSymbolChange={(s) => setParams({ symbol: s })} annotations={annotations} loading={loading} error={error} />

          {simulated && (
          <Panel
            title="Relative performance"
            eyebrow={`Rebased to 100 · ${rangeName}`}
            actions={
              compareSymbols.length < MAX_COMPARE ? (
                <select
                  className="input h-8 w-44 py-0 text-xs"
                  value=""
                  aria-label="Add instrument to compare"
                  onChange={(e) => e.target.value && setCompare((c) => [...c.filter((x) => x !== symbol), e.target.value].slice(-MAX_COMPARE))}
                >
                  <option value="">Compare with…</option>
                  {INSTRUMENTS.filter((i) => i.symbol !== symbol && !compareSymbols.includes(i.symbol)).map((i) => (
                    <option key={i.symbol} value={i.symbol}>
                      {i.symbol}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          >
            {!perf ? (
              <p className="text-sm text-slate-dim">Add up to {MAX_COMPARE} instruments to compare their performance with {symbol} over the selected range.</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {perf.series.map((s, i) => (
                    <span key={s.label} className="chip">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-platinum">{s.label}</span>
                      <Change value={(s.points.at(-1)?.value ?? 100) / 100 - 1} />
                      {perf.corr[i] != null && <span className="num text-slate-dim">ρ {perf.corr[i]!.toFixed(2)}</span>}
                      {i > 0 && (
                        <button aria-label={`Remove ${s.label} from comparison`} className="hover:text-down" onClick={() => setCompare((c) => c.filter((x) => x !== s.label))}>
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <div className="h-72">
                  <PerformanceChart series={perf.series} />
                </div>
                <p className="mt-2 text-[11px] text-slate-dim">
                  ρ = correlation of daily log returns with {symbol} over the period. This shows co-movement, not causation. Simulated series.
                </p>
              </>
            )}
          </Panel>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Statistics" eyebrow="Computed from displayed series">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  ['1W return', periodReturn(closes, 5)],
                  ['1M return', periodReturn(closes, 21)],
                  ['3M return', periodReturn(closes, 63)],
                  ['1Y return', periodReturn(closes, 252)],
                ].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between">
                    <dt className="text-mist">{l}</dt>
                    <dd>
                      <Change value={v as number | null} />
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between">
                  <dt className="text-mist">Ann. volatility ({rangeName})</dt>
                  <dd className="num">{fmtPct(annualisedVol(windowCloses), 1)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-mist">Max drawdown ({rangeName})</dt>
                  <dd className="num text-down">{fmtPct(maxDrawdown(windowCloses), 1)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-mist">52w high</dt>
                  <dd className="num">{fmtNumber(hi52, decimals)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-mist">52w low</dt>
                  <dd className="num">{fmtNumber(lo52, decimals)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-xs text-slate-dim">Last 60 sessions</span>
                <Sparkline values={closes.slice(-60)} width={160} height={32} />
              </div>
              <Link to={`/lab?s0=${last?.close ?? 100}&sigma=${annualisedVol(closes.slice(-252)).toFixed(3)}&label=${encodeURIComponent(symbol)}`} className="btn-ghost mt-4 w-full">
                Simulate outcomes in the Research Lab
              </Link>
            </Panel>

            <Panel title="Linked events" eyebrow="Event annotations">
              {linkedEvents.length === 0 ? (
                <p className="text-sm text-slate-dim">No events in the current dataset are tagged to this instrument.</p>
              ) : (
                <ul className="space-y-3">
                  {linkedEvents.map((e) => (
                    <li key={e.id} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} />
                      <span>
                        <span className="block text-platinum">{e.title}</span>
                        <span className="text-xs text-slate-dim">
                          {e.time.slice(0, 10)} · <ProvenanceBadge kind={e.provenance} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-slate-dim">
                Links between events and assets are research hypotheses. Appearing together on a chart does not prove causation.
              </p>
              <Link to="/radar" className="mt-2 inline-block text-xs text-gold hover:underline">
                Open Global Radar →
              </Link>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
