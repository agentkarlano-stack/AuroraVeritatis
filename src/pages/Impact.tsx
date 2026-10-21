import { useState } from 'react';
import { Link } from 'react-router';
import { DemoNotice, PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { IMPACT_CHANNELS, type EvidenceClass } from '../data/impactChannels';
import { DEMO_EVENTS } from '../data/demoEvents';
import { INSTRUMENTS, INSTRUMENT_MAP } from '../data/instruments';
import { demoBars } from '../lib/demoMarket';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../lib/events';
import { fmtPct } from '../lib/format';
import { correlationMatrix, eventWindow } from '../lib/impact';

const EVIDENCE: Record<EvidenceClass, { label: string; cls: string; help: string }> = {
  mechanism: { label: 'Mechanism', cls: 'border-up/50 text-up', help: 'Established economic transmission channel — explains how an effect could arise, not that it will.' },
  correlation: { label: 'Correlation', cls: 'border-info/50 text-info', help: 'Measured statistical co-movement. Not causation.' },
  hypothesis: { label: 'Hypothesis', cls: 'border-warn/50 text-warn', help: 'Analytical judgement to be tested against data.' },
  scenario: { label: 'Model scenario', cls: 'border-gold-dim text-gold', help: 'Model output under stated assumptions.' },
};

const ARROW = { up: '↑', down: '↓', mixed: '↕' } as const;
const MATRIX_SYMBOLS = ['GLB-EQ.D', 'EUR-EQ.D', 'EM-EQ.D', 'CRUDE.D', 'NATGAS.D', 'GOLD.D', 'WHEAT.D', 'EURUSD.D', 'UST10Y.D', 'DEF.D'];

function EvidenceBadge({ kind }: { kind: EvidenceClass }) {
  const e = EVIDENCE[kind];
  return (
    <span title={e.help} className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${e.cls}`}>
      {e.label}
    </span>
  );
}

function corrColor(v: number) {
  if (!Number.isFinite(v)) return 'transparent';
  const a = Math.min(1, Math.abs(v));
  return v >= 0 ? `rgba(201,163,90,${0.1 + a * 0.8})` : `rgba(108,155,210,${0.1 + a * 0.8})`;
}

const matrix = correlationMatrix(MATRIX_SYMBOLS.map((s) => demoBars(s).map((b) => b.close)));

export default function Impact() {
  const [channelId, setChannelId] = useState(IMPACT_CHANNELS[0]!.id);
  const channel = IMPACT_CHANNELS.find((c) => c.id === channelId)!;
  const linked = DEMO_EVENTS.filter((e) => channel.triggers.includes(e.category) && e.marketLinks?.some((s) => channel.exposures.some((x) => x.symbol === s)));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Market Impact Radar" title="From geopolitical events to market exposure">
        Explore how classes of events can transmit to asset prices. Each link is labelled by the strength of its evidence, so
        mechanisms, measured correlations, hypotheses and model scenarios are never confused with one another.
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2 text-xs text-mist">
        {(Object.keys(EVIDENCE) as EvidenceClass[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <EvidenceBadge kind={k} /> <span className="hidden sm:inline">{EVIDENCE[k].help}</span>
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Panel title="Transmission channels" bodyClass="p-2">
          <ul className="space-y-1">
            {IMPACT_CHANNELS.map((c) => (
              <li key={c.id}>
                <button
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${c.id === channelId ? 'bg-gold/10 text-gold-soft' : 'text-mist hover:bg-ink-800 hover:text-platinum'}`}
                  aria-pressed={c.id === channelId}
                  onClick={() => setChannelId(c.id)}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title={channel.title} eyebrow="Mechanism">
            <p className="text-sm leading-relaxed text-mist">{channel.mechanism}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-xs text-slate-dim">Activated by:</span>
              {channel.triggers.map((t) => (
                <span key={t} className="flex items-center gap-1 text-xs text-mist">
                  <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLOR[t] }} />
                  {CATEGORY_LABEL[t]}
                </span>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-mist">
                  <tr className="border-b border-line">
                    <th className="py-2 font-medium">Exposure</th>
                    <th className="py-2 font-medium">Plausible pressure</th>
                    <th className="py-2 font-medium">Evidence</th>
                    <th className="py-2 font-medium">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {channel.exposures.map((x) => (
                    <tr key={x.symbol}>
                      <td className="py-2 pr-3">
                        <Link to={`/markets?symbol=${x.symbol}`} className="text-platinum hover:text-gold-soft">
                          {INSTRUMENT_MAP.get(x.symbol)?.name ?? x.symbol}
                        </Link>
                      </td>
                      <td className="num py-2 pr-3 text-lg text-gold">{ARROW[x.direction]}</td>
                      <td className="py-2 pr-3">
                        <EvidenceBadge kind={x.evidence} />
                      </td>
                      <td className="py-2 text-xs text-mist">{x.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-dim">Caveat: {channel.caveats}</p>
          </Panel>

          <Panel title="Event-window study" eyebrow="Statistical test on linked events">
            <DemoNotice>
              Events and prices here are both <strong>synthetic</strong>, so results only demonstrate the method. With real data,
              this compares the move after an event with normal day-to-day volatility.
            </DemoNotice>
            {linked.length === 0 ? (
              <p className="mt-3 text-sm text-slate-dim">No demo events are linked to this channel.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="num w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs text-mist">
                    <tr className="border-b border-line">
                      <th className="py-2 font-medium">Event</th>
                      <th className="py-2 font-medium">Instrument</th>
                      <th className="py-2 text-right font-medium">Return (≤5 sessions)</th>
                      <th className="py-2 text-right font-medium">z-score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {linked.flatMap((e) =>
                      (e.marketLinks ?? [])
                        .filter((s) => channel.exposures.some((x) => x.symbol === s))
                        .map((s) => {
                          const bars = demoBars(s);
                          const idx = bars.findIndex((b) => b.time >= e.time.slice(0, 10));
                          const w = idx >= 0 ? eventWindow(bars.map((b) => b.close), idx) : null;
                          return (
                            <tr key={e.id + s}>
                              <td className="py-1.5 pr-3 font-sans">
                                <span className="block max-w-xs truncate text-platinum">{e.title.replace('Simulated scenario: ', '')}</span>
                                <span className="text-[11px] text-slate-dim">
                                  {e.time.slice(0, 10)} <ProvenanceBadge kind={e.provenance} />
                                </span>
                              </td>
                              <td className="py-1.5 pr-3">{s}</td>
                              <td className="py-1.5 text-right">{w ? fmtPct(w.cumulative, 2, true) : '—'}</td>
                              <td className={`py-1.5 text-right ${w && Math.abs(w.zScore) >= 2 ? 'text-warn' : ''}`}>
                                {w ? w.zScore.toFixed(2) : '—'}
                                {w && w.sessions < 6 && <span className="ml-1 text-[10px] text-slate-dim">({w.sessions}d)</span>}
                              </td>
                            </tr>
                          );
                        }),
                    )}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-slate-dim">
                  z = log cumulative return ÷ (σ<sub>daily</sub>·√n), σ estimated over the 60 sessions before the event. |z| ≥ 2 is
                  unusual (highlighted); it does not establish causation.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Return correlation matrix" eyebrow="1 year of daily log returns">
            <DemoNotice>
              Computed on <strong>synthetic</strong> series that are generated independently, so correlations cluster near zero.
              With licensed data this shows real co-movement.
            </DemoNotice>
            <div className="mt-3 overflow-x-auto">
              <table className="num text-[11px]">
                <thead>
                  <tr>
                    <th />
                    {MATRIX_SYMBOLS.map((s) => (
                      <th key={s} className="px-1 pb-1 font-medium text-mist">
                        <span className="block w-12 truncate" title={s}>
                          {s.replace('.D', '')}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_SYMBOLS.map((row, i) => (
                    <tr key={row}>
                      <th className="pr-2 text-right font-medium text-mist">{row.replace('.D', '')}</th>
                      {MATRIX_SYMBOLS.map((col, j) => (
                        <td key={col} className="h-8 w-12 text-center text-platinum" style={{ background: corrColor(matrix[i]![j]!) }} title={`${row} × ${col}: ${matrix[i]![j]!.toFixed(3)}`}>
                          {matrix[i]![j]!.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-dim">
              Gold = positive, blue = negative. {INSTRUMENTS.length} demo instruments available; showing {MATRIX_SYMBOLS.length}.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
