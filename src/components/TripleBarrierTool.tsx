import { useMemo, useState } from 'react';
import { INSTRUMENTS } from '../data/instruments';
import { useApi } from '../lib/api';
import { COMMODITY_DATA_PATH, COMMODITY_OPTIONS, monthAt, type CommodityData } from '../lib/commodities';
import { demoBars } from '../lib/demoMarket';
import { fmtPct } from '../lib/format';
import { barrierStats, crossSignals, tripleBarrier, type BarrierEvent } from '../lib/tripleBarrier';
import { Panel, ProvenanceBadge } from './ui';

type Source = 'simulated' | 'commodities';
interface Form {
  source: Source;
  symbol: string;
  fast: string;
  slow: string;
  up: string;
  down: string;
  maxHold: string;
  volSpan: string;
  costBps: string;
}
const DEFAULTS: Record<Source, Form> = {
  simulated: { source: 'simulated', symbol: 'GLB-EQ.D', fast: '10', slow: '40', up: '2', down: '1', maxHold: '20', volSpan: '20', costBps: '10' },
  commodities: { source: 'commodities', symbol: 'brent', fast: '3', slow: '12', up: '1.5', down: '1', maxHold: '6', volSpan: '12', costBps: '20' },
};
const LABEL = { 1: 'Upper', [-1]: 'Lower', 0: 'Time limit' } as const;
const COLOR = { 1: '#6fbf8e', [-1]: '#d9776f', 0: '#9a978f' } as const;

/**
 * Strategy validation with the triple barrier method: moving-average-cross entries labelled by the first barrier
 * touched. Research and education only; no orders are placed.
 */
export function TripleBarrierTool() {
  const [form, setForm] = useState<Form>(DEFAULTS.simulated);
  const [selected, setSelected] = useState(0);
  const commodities = useApi<CommodityData>(form.source === 'commodities' ? COMMODITY_DATA_PATH : null);

  const series = useMemo(() => {
    if (form.source === 'simulated') {
      const bars = demoBars(form.symbol);
      return { closes: bars.map((b) => b.close), labels: bars.map((b) => b.time.slice(0, 10)), period: 'day' };
    }
    if (commodities.status !== 'ready') return null;
    const s = commodities.data.series.find((x) => x.id === form.symbol);
    if (!s) return null;
    const pts = s.values.map((v, i) => ({ v, l: monthAt(commodities.data.start, i) })).filter((p): p is { v: number; l: string } => p.v != null);
    return { closes: pts.map((p) => p.v), labels: pts.map((p) => p.l), period: 'month' };
  }, [form.source, form.symbol, commodities]);

  const n = (s: string) => Number(s.replace(',', '.'));
  const result = useMemo(() => {
    if (!series) return null;
    try {
      const fast = Math.round(n(form.fast));
      const slow = Math.round(n(form.slow));
      if (!(fast >= 1 && slow > fast && slow < series.closes.length / 2)) throw new Error('The slow average must be longer than the fast one and shorter than half the data.');
      const entries = crossSignals(series.closes, fast, slow);
      const events = tripleBarrier(series.closes, entries, { up: n(form.up), down: n(form.down), maxHold: Math.round(n(form.maxHold)), volSpan: Math.round(n(form.volSpan)), costBps: n(form.costBps) });
      return { events, stats: barrierStats(series.closes, events), error: null as string | null };
    } catch (e) {
      return { events: [] as BarrierEvent[], stats: null, error: (e as Error).message };
    }
  }, [series, form]);

  const field = (key: keyof Form, label: string) => (
    <label className="block text-xs text-mist">
      {label}
      <input className="input num mt-1" inputMode="decimal" value={form[key]} onChange={(e) => (setForm((f) => ({ ...f, [key]: e.target.value })), setSelected(0))} />
    </label>
  );
  const s = result?.stats;
  const ev = result?.events[Math.min(selected, (result?.events.length ?? 1) - 1)];

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Panel title="Signals and barriers" eyebrow="Research only, no orders">
        <div className="space-y-3">
          <label className="block text-xs text-mist">
            Data
            <select className="input mt-1" value={form.source} onChange={(e) => (setForm(DEFAULTS[e.target.value as Source]), setSelected(0))}>
              <option value="simulated">Demo instruments, daily (simulated)</option>
              <option value="commodities">Commodities, World Bank monthly (real)</option>
            </select>
          </label>
          <label className="block text-xs text-mist">
            Series
            <select className="input mt-1" value={form.symbol} onChange={(e) => (setForm((f) => ({ ...f, symbol: e.target.value })), setSelected(0))}>
              {(form.source === 'simulated' ? INSTRUMENTS.map((i) => ({ id: i.symbol, name: i.name })) : COMMODITY_OPTIONS).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {field('fast', `Fast average (${series?.period ?? 'period'}s)`)}
            {field('slow', 'Slow average')}
            {field('up', 'Upper barrier (σ)')}
            {field('down', 'Lower barrier (σ)')}
            {field('maxHold', 'Time limit (periods)')}
            {field('volSpan', 'Volatility span')}
            {field('costBps', 'Costs (bp, round trip)')}
          </div>
          <p className="text-[11px] leading-snug text-slate-dim">
            Entry when the fast average crosses above the slow one. Barriers are set at entry from past volatility only: σ·√(time limit) times the chosen
            multiples.
          </p>
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        {form.source === 'commodities' && commodities.status === 'loading' && <p className="text-sm text-slate-dim">Loading World Bank prices…</p>}
        {result?.error && (
          <p role="alert" className="text-sm text-down">
            {result.error}
          </p>
        )}
        {s && series && (
          <>
            <div className="panel p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
                Average net return per signal <ProvenanceBadge kind={form.source === 'simulated' ? 'simulated' : 'confirmed'} />
              </div>
              <div className={`num mt-1 text-3xl font-semibold ${s.meanRet >= 0 ? 'text-up' : 'text-down'}`}>
                {s.meanRet >= 0 ? '▲' : '▼'} {fmtPct(s.meanRet, 2)}
              </div>
              <p className="mt-1 text-sm text-mist">
                {s.events} signals, about {s.effectiveN.toFixed(1)} independent after overlap.{' '}
                {s.meanCi ? (
                  <>
                    95 % bootstrap interval {fmtPct(s.meanCi[0], 2)} to {fmtPct(s.meanCi[1], 2)}
                    {s.meanCi[0] <= 0 && s.meanCi[1] >= 0 ? ': it includes zero, so the evidence for an edge is weak.' : '.'}
                  </>
                ) : (
                  'Too few signals for an interval.'
                )}
              </p>
            </div>

            <Panel title="Price path and events" eyebrow={`${series.labels[0]} to ${series.labels.at(-1)}`}>
              <PathChart closes={series.closes} events={result!.events} selected={ev} onSelect={(i) => setSelected(i)} />
              {result!.events.length > 0 && (
                <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist">
                  Signal
                  <select className="input h-8 w-auto py-0 text-xs" value={Math.min(selected, result!.events.length - 1)} onChange={(e) => setSelected(Number(e.target.value))}>
                    {result!.events.map((e, i) => (
                      <option key={e.entry} value={i}>
                        {series.labels[e.entry]} · {LABEL[e.label]} · {(e.ret * 100).toFixed(2)} %
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="mt-1 text-[11px] text-slate-dim">
                Dots mark entries: <span style={{ color: COLOR[1] }}>upper barrier</span>, <span style={{ color: COLOR[-1] }}>lower barrier</span>,{' '}
                <span style={{ color: COLOR[0] }}>time limit</span>. Select a dot for its barriers.
              </p>
            </Panel>

            <Panel title="Outcomes" eyebrow="After costs">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {[
                  ['Upper / lower / time', `${s.upper} / ${s.lower} / ${s.timeout}`],
                  ['Win rate', fmtPct(s.winRate, 0)],
                  ['Median return', fmtPct(s.medianRet, 2)],
                  ['Average holding', `${s.avgHold.toFixed(1)} ${series.period}s`],
                  ['Max drawdown (one trade at a time)', fmtPct(-s.maxDrawdown, 1)],
                  ['Buy and hold, same period', fmtPct(s.benchmark, 1)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md border border-line px-3 py-2">
                    <div className="text-[11px] text-slate-dim">{k}</div>
                    <div className="num text-sm text-platinum">{v}</div>
                  </div>
                ))}
              </div>
              {ev && (
                <p className="mt-3 text-xs text-mist">
                  Selected signal {series.labels[ev.entry]}: {LABEL[ev.label]} barrier after {ev.exit - ev.entry} {series.period}s, net {fmtPct(ev.ret, 2)}{' '}
                  (barriers {ev.upper.toFixed(2)} / {ev.lower.toFixed(2)}, σ {fmtPct(ev.sigma, 2)} per {series.period}).
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-dim">
                Overlapping signals share information, so the interval resamples about {Math.round(s.effectiveN)} events rather than {s.events}. Past
                results on one series say little about the future; test several series and periods before trusting a rule.
              </p>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

const W = 640;
const H = 240;
const PAD = { l: 8, r: 8, t: 10, b: 10 };

function PathChart({ closes, events, selected, onSelect }: { closes: number[]; events: BarrierEvent[]; selected?: BarrierEvent; onSelect: (i: number) => void }) {
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const x = (t: number) => PAD.l + (t / (closes.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price path with signal entries coloured by the barrier they reached">
      {selected && (
        <rect
          x={x(selected.entry)}
          width={Math.max(2, x(selected.exit) - x(selected.entry))}
          y={y(Math.min(hi, selected.upper))}
          height={Math.max(2, y(Math.max(lo, selected.lower)) - y(Math.min(hi, selected.upper)))}
          fill="rgba(201,163,90,0.12)"
          stroke="#c9a35a"
          strokeDasharray="3 2"
        />
      )}
      <path d={closes.map((c, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(c).toFixed(1)}`).join('')} fill="none" stroke="#c8c5bd" strokeWidth="1.2" />
      {events.map((e, i) => (
        <circle key={e.entry} cx={x(e.entry)} cy={y(closes[e.entry]!)} r={selected === e ? 5 : 3.5} fill={COLOR[e.label]} stroke="#0d0d0f" strokeWidth="1" className="cursor-pointer" onClick={() => onSelect(i)}>
          <title>{`${LABEL[e.label]} barrier, net ${(e.ret * 100).toFixed(2)} %`}</title>
        </circle>
      ))}
    </svg>
  );
}
