import { Minus, Spline, Star, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PriceChart, type ChartAnnotation } from '../components/PriceChart';
import { Change, DemoNotice, LimitNotice, PageHeader, Panel, ProvenanceBadge, Sparkline } from '../components/ui';
import { DEMO_EVENTS } from '../data/demoEvents';
import { INSTRUMENTS, INSTRUMENT_MAP, type AssetClass } from '../data/instruments';
import { demoBars, lastQuote } from '../lib/demoMarket';
import { limitOf, useTier } from '../lib/entitlements';
import type { ChartOptions, ChartPoint, Drawing, DrawMode } from '../lib/chart';
import { CATEGORY_COLOR } from '../lib/events';
import { fmtNumber, fmtPct } from '../lib/format';
import { correlation } from '../lib/impact';
import { annualisedVol, logReturns, maxDrawdown, periodReturn, rebase } from '../lib/technical';
import { PerformanceChart, type PerformanceSeries } from '../components/PerformanceChart';
import { uid, usePrefs } from '../store/prefs';

const NO_DRAWINGS: Drawing[] = [];

const RANGES = [
  { label: '1M', bars: 21 },
  { label: '3M', bars: 63 },
  { label: '6M', bars: 126 },
  { label: '1Y', bars: 252 },
  { label: '2Y', bars: 520 },
];

const CLASS_LABEL: Record<AssetClass, string> = {
  'equity-index': 'Indices',
  equity: 'Equity baskets',
  commodity: 'Commodities',
  fx: 'FX',
  rates: 'Rates',
  crypto: 'Crypto',
};

const TOGGLES: { key: keyof Omit<ChartOptions, 'style'>; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'sma20', label: 'SMA 20' },
  { key: 'sma50', label: 'SMA 50' },
  { key: 'ema20', label: 'EMA 20' },
  { key: 'bollinger', label: 'Bollinger' },
  { key: 'rsi', label: 'RSI 14' },
  { key: 'events', label: 'Events' },
];

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

/** Chart markers for demo events tagged to `symbol`, snapped to the last session on or before the event. */
function annotationsFor(symbol: string): ChartAnnotation[] {
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
  const symbol = INSTRUMENT_MAP.has(requested) ? requested : INSTRUMENTS[0]!.symbol;
  const inst = INSTRUMENT_MAP.get(symbol)!;
  const { watchlist, toggleWatch } = usePrefs();
  const maxWatch = limitOf(useTier(), 'assetsPerWatchlist');
  const [limitHit, setLimitHit] = useState(false);
  const [filter, setFilter] = useState<'watchlist' | 'all'>('all');
  // Chart settings and drawings persist across visits (saved research layout).
  const { chart: options, setChart, drawings: allDrawings, addDrawing, removeDrawing, clearDrawings } = usePrefs();
  const range = options.range;
  const drawings = allDrawings[symbol] ?? NO_DRAWINGS;
  const [mode, setMode] = useState<DrawMode>('none');
  const [compare, setCompare] = useState<string[]>([]);
  const compareSymbols = compare.filter((c) => c !== symbol);
  const perf = compareSymbols.length ? performanceFor([symbol, ...compareSymbols], range) : null;
  const [pending, setPending] = useState<ChartPoint | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode('none');
        setPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startMode = (m: DrawMode) => {
    setPending(null);
    setMode((cur) => (cur === m ? 'none' : m));
  };

  const onPick = (p: ChartPoint) => {
    if (mode === 'hline') {
      addDrawing(symbol, { id: uid(), kind: 'hline', price: p.price });
      setMode('none');
    } else if (mode === 'trend') {
      if (!pending) return setPending(p);
      if (pending.time !== p.time) addDrawing(symbol, { id: uid(), kind: 'trend', a: pending, b: p });
      setPending(null);
      setMode('none');
    }
  };

  // demoBars and annotationsFor are cached per symbol, so identities are stable across renders.
  const bars = demoBars(symbol);
  const closes = bars.map((b) => b.close);
  const windowCloses = closes.slice(-range);
  const annotations = annotationsFor(symbol);
  const linkedEvents = DEMO_EVENTS.filter((e) => e.marketLinks?.includes(symbol));

  const list = filter === 'watchlist' ? INSTRUMENTS.filter((i) => watchlist.includes(i.symbol)) : INSTRUMENTS;
  const last = bars.at(-1)!;
  const hi52 = Math.max(...closes.slice(-252));
  const lo52 = Math.min(...closes.slice(-252));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        eyebrow="Markets Terminal"
        title="Market analysis"
        actions={
          <Link to="/positioning" className="btn-ghost text-xs">
            Futures positioning (CFTC data)
          </Link>
        }
      >
        Interactive charts, technical indicators and return statistics, annotated with geopolitical events.
      </PageHeader>
      <DemoNotice>
        All prices on this page are <strong>synthetic demo data</strong> generated by a seeded stochastic model (symbols end in
        “.D”). They are not real, delayed or historical market prices. Licensed market data is planned for a later phase.
      </DemoNotice>

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel
          title="Instruments"
          bodyClass="p-0"
          actions={
            <div className="flex gap-1">
              <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                All
              </button>
              <button className="chip" aria-pressed={filter === 'watchlist'} onClick={() => setFilter('watchlist')}>
                Watchlist
              </button>
            </div>
          }
        >
          {limitHit && (
            <div className="px-3 pb-2">
              <LimitNotice what="instruments per watchlist" limit={maxWatch} />
            </div>
          )}
          {list.length === 0 && <p className="p-4 text-sm text-slate-dim">Your watchlist is empty. Star instruments to add them.</p>}
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
        </Panel>

        <div className="min-w-0 space-y-4">
          <section className="panel">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{inst.symbol}</h2>
                  <ProvenanceBadge kind="simulated" />
                </div>
                <p className="text-xs text-slate-dim">{inst.name}</p>
              </div>
              <div className="text-right">
                <div className="num text-2xl font-semibold">{fmtNumber(last.close, inst.decimals)}</div>
                <Change value={lastQuote(symbol)?.changePct ?? null} className="text-sm" />
                <span className="ml-2 text-xs text-slate-dim">as of {last.time} (simulated close)</span>
              </div>
            </header>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
              <div className="flex gap-1" role="group" aria-label="Range">
                {RANGES.map((r) => (
                  <button key={r.label} className="chip" aria-pressed={range === r.bars} onClick={() => setChart({ range: r.bars })}>
                    {r.label}
                  </button>
                ))}
              </div>
              <span className="mx-1 h-5 w-px bg-line" />
              <div className="flex gap-1" role="group" aria-label="Chart style">
                <button className="chip" aria-pressed={options.style === 'candles'} onClick={() => setChart({ style: 'candles' })}>
                  Candles
                </button>
                <button className="chip" aria-pressed={options.style === 'line'} onClick={() => setChart({ style: 'line' })}>
                  Line
                </button>
              </div>
              <span className="mx-1 h-5 w-px bg-line" />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Indicators">
                {TOGGLES.map((t) => (
                  <button key={t.key} className="chip" aria-pressed={options[t.key]} onClick={() => setChart({ [t.key]: !options[t.key] })}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs">
              <span className="text-slate-dim">Draw</span>
              <button className="chip" aria-pressed={mode === 'hline'} onClick={() => startMode('hline')} title="Horizontal level">
                <Minus className="h-3.5 w-3.5" aria-hidden /> Level
              </button>
              <button className="chip" aria-pressed={mode === 'trend'} onClick={() => startMode('trend')} title="Trend line through two points">
                <Spline className="h-3.5 w-3.5" aria-hidden /> Trend line
              </button>
              {mode !== 'none' && (
                <span role="status" className="text-gold-soft">
                  {mode === 'hline' ? 'Click the chart to place a level.' : pending ? `First point ${pending.time} @ ${pending.price} — click the second point.` : 'Click the first point.'}{' '}
                  <span className="text-slate-dim">(Esc to cancel)</span>
                </span>
              )}
              {drawings.map((d) => (
                <span key={d.id} className="chip">
                  {d.kind === 'hline' ? `Level ${d.price}` : `Trend ${d.a.time.slice(5)}→${d.b.time.slice(5)}`}
                  <button aria-label="Remove drawing" className="hover:text-down" onClick={() => removeDrawing(symbol, d.id)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {drawings.length > 0 && (
                <button className="btn-quiet ml-auto text-xs" onClick={() => clearDrawings(symbol)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
                </button>
              )}
            </div>
            <div className={options.rsi ? 'h-[500px]' : 'h-[420px]'}>
              <PriceChart
                bars={bars}
                options={options}
                visibleBars={range}
                annotations={annotations}
                decimals={inst.decimals}
                drawings={drawings}
                onPick={mode === 'none' ? undefined : onPick}
              />
            </div>
          </section>

          <Panel
            title="Relative performance"
            eyebrow={`Rebased to 100 · ${RANGES.find((r) => r.bars === range)?.label ?? ''}`}
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
                  ρ = correlation of daily log returns with {symbol} over the period (co-movement, not causation). Synthetic demo series.
                </p>
              </>
            )}
          </Panel>

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
                  <dt className="text-mist">Ann. volatility ({RANGES.find((r) => r.bars === range)?.label})</dt>
                  <dd className="num">{fmtPct(annualisedVol(windowCloses), 1)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-mist">Max drawdown ({RANGES.find((r) => r.bars === range)?.label})</dt>
                  <dd className="num text-down">{fmtPct(maxDrawdown(windowCloses), 1)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-mist">52w high</dt>
                  <dd className="num">{fmtNumber(hi52, inst.decimals)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-mist">52w low</dt>
                  <dd className="num">{fmtNumber(lo52, inst.decimals)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-xs text-slate-dim">Last 60 sessions</span>
                <Sparkline values={closes.slice(-60)} width={160} height={32} />
              </div>
              <Link to={`/lab?s0=${last.close}&sigma=${annualisedVol(closes.slice(-252)).toFixed(3)}&label=${encodeURIComponent(symbol)}`} className="btn-ghost mt-4 w-full">
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
                Event–asset links are analytical hypotheses for research. Co-occurrence on a chart does not establish causation.
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
