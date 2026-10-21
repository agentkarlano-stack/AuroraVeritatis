import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { LineChart } from '../components/SvgCharts';
import { DemoNotice, PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { demoBars } from '../lib/demoMarket';
import { useEvents } from '../lib/events';
import { annualisedVol } from '../lib/technical';
import { DEFAULT_WEIGHTS, TENSION_COMPONENTS, normaliseWeights, tensionBand, tensionHistory, weightSensitivity, worldTension, type ComponentKey, type Weights } from '../lib/tension';

const WINDOWS = [7, 14, 30];
const TONE = { low: 'text-up', moderate: 'text-gold', elevated: 'text-warn', high: 'text-down' } as const;

/** 21-session annualised volatility of the global equity proxy, as of each date (synthetic demo series). */
function volatilityLookup() {
  const bars = demoBars('GLB-EQ.D');
  const closes = bars.map((b) => b.close);
  const cache = new Map<string, number>();
  return (date: string) => {
    const hit = cache.get(date);
    if (hit !== undefined) return hit;
    let i = bars.length - 1;
    while (i > 0 && bars[i]!.time > date) i--;
    const v = annualisedVol(closes.slice(Math.max(0, i - 21), i + 1));
    cache.set(date, v);
    return v;
  };
}

export default function Tension() {
  const { demo, quakes, quakeStatus } = useEvents();
  const [now] = useState(() => Date.now());
  const [windowDays, setWindowDays] = useState(14);
  const [raw, setRaw] = useState<Weights>(DEFAULT_WEIGHTS);
  const weights = normaliseWeights(raw);
  const custom = TENSION_COMPONENTS.some((c) => Math.abs(weights[c.key] - DEFAULT_WEIGHTS[c.key]) > 1e-9);

  const volOn = useMemo(() => volatilityLookup(), []);
  const events = useMemo(() => [...demo, ...quakes], [demo, quakes]);
  const today = new Date(now).toISOString().slice(0, 10);
  const result = useMemo(() => worldTension(events, volOn(today), now, windowDays, raw), [events, volOn, today, now, windowDays, raw]);
  const history = useMemo(() => tensionHistory(events, volOn, 90, now, windowDays, raw), [events, volOn, now, windowDays, raw]);
  const sens = useMemo(() => weightSensitivity(events, volOn(today), now, windowDays, raw), [events, volOn, today, now, windowDays, raw]);
  const band = tensionBand(result.value);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="World Tension Index" title="A transparent composite of global tension">
        One number summarising geopolitical, humanitarian and financial stress — with every input, weight and formula shown, so
        you can see exactly how it is built and how much it depends on the choices behind it.
      </PageHeader>
      <DemoNotice>
        <strong>Prototype on demonstration inputs.</strong> Geopolitical event inputs are simulated scenarios and the market input
        is a synthetic price series; only the natural-hazard input is live (USGS). The index is a methodological sketch, not a
        validated or scientifically established measure.
      </DemoNotice>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Panel title="Current reading">
            <div className={`num font-display text-6xl font-bold ${TONE[band.tone]}`}>{result.value.toFixed(1)}</div>
            <div className={`mt-1 text-sm font-medium ${TONE[band.tone]}`}>
              {band.label} <span className="text-xs text-slate-dim">(bands: &lt;25 low · &lt;50 moderate · &lt;70 elevated · ≥70 high)</span>
            </div>
            <p className="mt-3 text-xs text-slate-dim">
              {result.eventsConsidered} events in the last {windowDays} days{custom ? ' · custom weights' : ' · published weights'}.
            </p>
            <div className="mt-3">
              <span className="label">Window</span>
              <div className="flex gap-1.5">
                {WINDOWS.map((w) => (
                  <button key={w} className="chip" aria-pressed={windowDays === w} onClick={() => setWindowDays(w)}>
                    {w} days
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            title="Weights"
            eyebrow="Adjust to test your own view"
            actions={
              custom ? (
                <button className="btn-quiet text-xs" onClick={() => setRaw(DEFAULT_WEIGHTS)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
                </button>
              ) : undefined
            }
          >
            <ul className="space-y-3">
              {TENSION_COMPONENTS.map((c) => (
                <li key={c.key}>
                  <label className="flex justify-between text-xs" htmlFor={`w-${c.key}`}>
                    <span className="text-mist">{c.label}</span>
                    <span className="num text-platinum">{(weights[c.key] * 100).toFixed(0)}%</span>
                  </label>
                  <input
                    id={`w-${c.key}`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={raw[c.key]}
                    onChange={(e) => setRaw((r) => ({ ...r, [c.key as ComponentKey]: Number(e.target.value) }))}
                    className="w-full accent-[#c9a35a]"
                  />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-dim">Weights are re-scaled to sum to 100%.</p>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Components" eyebrow="Score 0–100 × weight = contribution">
            <ul className="space-y-3">
              {result.components.map((c) => (
                <li key={c.key}>
                  <div className="flex flex-wrap justify-between gap-2 text-xs">
                    <span className="text-platinum">
                      {c.label} <span className="text-slate-dim">— {c.explanation}</span>
                    </span>
                    <span className="num text-mist">
                      {c.score.toFixed(0)} × {(c.weight * 100).toFixed(0)}% = <span className="text-platinum">{(c.score * c.weight).toFixed(1)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-ink-800">
                    <div className="h-1.5 rounded-full bg-gold/70" style={{ width: `${c.score}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Last 90 days" eyebrow={`Rolling ${windowDays}-day window`}>
            <LineChart points={history} format={(v) => v.toFixed(1)} />
          </Panel>

          <Panel title="How much do the weights matter?" eyebrow="Robustness check">
            <p className="text-sm text-mist">
              With these inputs the index lies between <span className="num text-platinum">{sens.range[0].toFixed(1)}</span> and{' '}
              <span className="num text-platinum">{sens.range[1].toFixed(1)}</span> across reasonable alternative weightings (each
              weight halved or doubled, or all equal: <span className="num text-platinum">{sens.equalWeights.toFixed(1)}</span>). A
              wide range means the headline number reflects weighting choices as much as the events themselves.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="num w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs text-mist">
                  <tr className="border-b border-line">
                    <th className="py-2 font-medium">Component</th>
                    <th className="py-2 text-right font-medium">Weight halved</th>
                    <th className="py-2 text-right font-medium">Current</th>
                    <th className="py-2 text-right font-medium">Weight doubled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {sens.perComponent.map((p) => (
                    <tr key={p.key}>
                      <td className="py-1.5 font-sans text-mist">{p.label}</td>
                      <td className="py-1.5 text-right">{p.halved.toFixed(1)}</td>
                      <td className="py-1.5 text-right text-slate-dim">{sens.base.toFixed(1)}</td>
                      <td className="py-1.5 text-right">{p.doubled.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Measured vs. modelled">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line/60">
                  <tr>
                    <td className="py-2 pr-2 text-mist">Natural-hazard events</td>
                    <td className="py-2 text-right">
                      <ProvenanceBadge kind="confirmed" /> <span className="text-xs text-slate-dim">USGS · {quakeStatus === 'ready' ? `${quakes.length} live` : 'unavailable'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-2 text-mist">Conflict, security, political, energy, humanitarian events</td>
                    <td className="py-2 text-right">
                      <ProvenanceBadge kind="simulated" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-2 text-mist">Market volatility input</td>
                    <td className="py-2 text-right">
                      <ProvenanceBadge kind="simulated" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-2 text-mist">Weights, saturation constants, bands</td>
                    <td className="py-2 text-right">
                      <ProvenanceBadge kind="estimate" /> <span className="text-xs text-slate-dim">analyst choices</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>
            <Panel title="Methodology">
              <div className="space-y-2 text-sm leading-relaxed text-mist">
                <p>
                  Index = Σ wᵢ·cᵢ with Σ wᵢ = 1. Each event component is cᵢ = 100·(1 − e<sup>−xᵢ/kᵢ</sup>), where xᵢ is the
                  severity-weighted count of matching events in the window and kᵢ a published saturation constant (
                  {TENSION_COMPONENTS.filter((c) => c.saturation)
                    .map((c) => `${c.key} k=${c.saturation}`)
                    .join(', ')}
                  ). Financial stress maps 21-day annualised volatility linearly, 40% → 100.
                </p>
                <p>
                  Before production use: replace simulated inputs with sourced conflict and event data, calibrate constants against
                  historical episodes, and benchmark against established conflict indices (e.g. the ACLED Conflict Index's
                  deadliness, diffusion, danger and fragmentation dimensions).
                </p>
                <p>
                  Event inputs come from the{' '}
                  <Link to="/radar" className="text-gold hover:underline">
                    Global Radar
                  </Link>
                  .
                </p>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
