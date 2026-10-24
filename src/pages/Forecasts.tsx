import { Download, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AddToBrain } from '../components/AddToBrain';
import { PageHeader, Panel, Unavailable } from '../components/ui';
import { COUNTRIES, countryByIso3 } from '../lib/countries';
import { CATEGORIES, brier, byCategory, calibration, current, parsePercent, summarize, toCsv, type Forecast, type Outcome } from '../lib/forecasting';
import { useForecasts } from '../store/forecasts';

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Prediction Research: write down forecasts with resolution criteria, revise them as evidence arrives, resolve them,
 * and see how well calibrated they were (Brier score, log score, reliability diagram). Personal research; no market
 * data, no betting, no trading.
 */
export default function Forecasts() {
  const { forecasts, add, revise, resolve, remove, importMany } = useForecasts();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const s = summarize(forecasts);
  const bins = useMemo(() => calibration(forecasts, 5), [forecasts]);
  const cats = byCategory(forecasts);
  const file = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = forecasts.filter((f) => (filter === 'all' ? true : filter === 'open' ? !f.outcome : !!f.outcome));

  const download = (name: string, body: string, type: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        eyebrow="Quant Research"
        title="Prediction Research"
        actions={
          <Link to="/lab" className="btn-ghost text-xs">
            Quant Research
          </Link>
        }
      >
        Write down forecasts with clear resolution criteria, revise them as evidence changes, and measure how good they were with proper scoring rules.
        These are your own probability estimates, not market data or predictions by Aurora, and no outcome is ever guaranteed.
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(
          [
            ['Open forecasts', String(s.open)],
            ['Resolved', String(s.resolved)],
            ['Brier score', s.meanBrier === null ? '–' : s.meanBrier.toFixed(3), 'Lower is better. Always answering 50% scores 0.250.'],
            ['Log score', s.meanLog === null ? '–' : s.meanLog.toFixed(3), 'Closer to 0 is better; punishes confident misses.'],
            ['On the right side of 50%', s.hitRate === null ? '–' : pct(s.hitRate)],
          ] as const
        ).map(([k, v, hint]) => (
          <div key={k} className="panel p-3" title={hint}>
            <div className="num text-xl font-semibold">{v}</div>
            <div className="text-[11px] text-slate-dim">{k}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <NewForecast
            initialQuestion={params.get('q') ?? ''}
            initialCountry={params.get('country') ?? ''}
            eventId={params.get('event') ?? undefined}
            onAdd={(f) => {
              add(f);
              setFilter('open');
            }}
          />
          <Panel
            title={`Forecasts (${shown.length})`}
            bodyClass="p-0"
            actions={
              <div className="flex gap-1" role="group" aria-label="Show forecasts">
                {(['open', 'resolved', 'all'] as const).map((k) => (
                  <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                    {k === 'open' ? 'Open' : k === 'resolved' ? 'Resolved' : 'All'}
                  </button>
                ))}
              </div>
            }
          >
            {shown.length ? (
              <ul className="divide-y divide-line">
                {shown.map((f) => (
                  <ForecastRow key={f.id} f={f} onRevise={revise} onResolve={resolve} onRemove={remove} />
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-slate-dim">{forecasts.length ? 'Nothing in this view.' : 'No forecasts yet. Write your first one above.'}</p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Calibration" eyebrow="Reliability diagram">
            <CalibrationChart bins={bins} />
            <p className="mt-2 text-[11px] text-slate-dim">
              Each point groups your resolved forecasts by the probability you gave (for example 60–80%) and shows how often those questions resolved yes.
              Points on the diagonal mean well-calibrated forecasts. With few resolved forecasts the points are noisy: the labels show how many are in each
              group.
            </p>
          </Panel>
          <Panel title="By category">
            {cats.length ? (
              <table className="w-full text-xs">
                <thead className="text-slate-dim">
                  <tr>
                    <th className="py-1 text-left">Category</th>
                    <th className="py-1 text-right">Resolved</th>
                    <th className="py-1 text-right">Brier</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.category}>
                      <td className="py-1 text-mist">{c.category}</td>
                      <td className="num py-1 text-right">{c.count}</td>
                      <td className={`num py-1 text-right ${c.meanBrier < 0.25 ? 'text-up' : 'text-warn'}`}>{c.meanBrier.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-dim">Scores appear once forecasts are resolved.</p>
            )}
          </Panel>
          <Panel title="Your data">
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" disabled={!forecasts.length} onClick={() => download('aurora-forecasts.csv', toCsv(forecasts), 'text/csv')}>
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              <button className="btn-ghost text-xs" disabled={!forecasts.length} onClick={() => download('aurora-forecasts.json', JSON.stringify({ version: 1, forecasts }, null, 1), 'application/json')}>
                <Download className="h-3.5 w-3.5" /> JSON backup
              </button>
              <button className="btn-ghost text-xs" onClick={() => file.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Import JSON
              </button>
              <input
                ref={file}
                type="file"
                accept="application/json"
                className="hidden"
                aria-label="Import forecasts from a JSON backup"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void f.text().then((t) => {
                    try {
                      const data = JSON.parse(t) as { forecasts?: Forecast[] };
                      setNotice(`${importMany(data.forecasts ?? [])} forecasts imported.`);
                    } catch {
                      setNotice('This file is not an Aurora forecast backup.');
                    }
                  });
                  e.target.value = '';
                }}
              />
            </div>
            {notice && (
              <p className="mt-2 text-xs text-mist" role="status">
                {notice}
              </p>
            )}
            <p className="mt-2 text-[11px] text-slate-dim">Forecasts are stored in this browser. Account sync is planned.</p>
          </Panel>
          <Unavailable phase="planned">
            Market-implied probabilities (Polymarket, Kalshi and similar) are not shown: their terms allow personal use of their data, and showing it on
            Aurora needs the operator&apos;s written permission or a data licence. Once licensed they will appear next to your forecasts, clearly labelled
            as market prices rather than validated forecasts.
          </Unavailable>
        </div>
      </div>
    </div>
  );
}

function NewForecast({ initialQuestion, initialCountry, eventId, onAdd }: { initialQuestion: string; initialCountry: string; eventId?: string; onAdd: (f: Omit<Forecast, 'id' | 'history'> & { p: number }) => void }) {
  const [question, setQuestion] = useState(initialQuestion.slice(0, 200));
  const [criteria, setCriteria] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [closes, setCloses] = useState('');
  const [prob, setProb] = useState('');
  const [country, setCountry] = useState(countryByIso3(initialCountry.toUpperCase()) ? initialCountry.toUpperCase() : '');
  const [error, setError] = useState<string | null>(null);
  const [minDate] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <Panel title="New forecast">
      <form
        className="space-y-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const p = parsePercent(prob);
          if (question.trim().length < 8) return setError('Write the question as a full sentence (at least 8 characters).');
          if (criteria.trim().length < 8) return setError('Say how the question will be decided, so the outcome is not a matter of opinion later.');
          if (!closes) return setError('Choose the date by which it resolves.');
          if (p === null) return setError('Give a probability between 1% and 99%.');
          onAdd({ question: question.trim(), criteria: criteria.trim(), category, closes, p, ...(country ? { country } : {}), ...(eventId ? { eventId } : {}) });
          setQuestion('');
          setCriteria('');
          setProb('');
          setError(null);
        }}
      >
        <label className="block text-xs text-mist">
          Question
          <input className="input mt-1" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder="Will the ECB cut its deposit rate at its December meeting?" />
        </label>
        <label className="block text-xs text-mist">
          Resolution criteria
          <input className="input mt-1" value={criteria} maxLength={400} onChange={(e) => setCriteria(e.target.value)} placeholder="Yes if the ECB press release on the decision date announces a lower deposit facility rate." />
        </label>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="block text-xs text-mist">
            Category
            <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-mist">
            Resolves by
            <input type="date" className="input mt-1" min={minDate} value={closes} onChange={(e) => setCloses(e.target.value)} />
          </label>
          <label className="block text-xs text-mist">
            Probability (%)
            <input className="input mt-1" inputMode="decimal" value={prob} onChange={(e) => setProb(e.target.value)} placeholder="1–99" />
          </label>
          <label className="block text-xs text-mist">
            Country (optional)
            <select className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">None</option>
              {COUNTRIES.map((c) => (
                <option key={c.iso3} value={c.iso3}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {eventId && <p className="text-[11px] text-slate-dim">Linked to the Global Radar event you came from.</p>}
        {error && (
          <p role="alert" className="text-xs text-down">
            {error}
          </p>
        )}
        <button className="btn-primary text-xs">Save forecast</button>
      </form>
    </Panel>
  );
}

function ForecastRow({ f, onRevise, onResolve, onRemove }: { f: Forecast; onRevise: (id: string, p: number, note?: string) => void; onResolve: (id: string, o: Outcome | null) => void; onRemove: (id: string) => void }) {
  const [prob, setProb] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const b = brier(f);
  const country = f.country ? countryByIso3(f.country) : undefined;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-platinum">{f.question}</div>
          <div className="text-[11px] text-slate-dim">
            {f.category} · resolves by {day(f.closes)}
            {country && (
              <>
                {' '}
                ·{' '}
                <Link className="text-gold hover:underline" to={`/countries/${country.iso3}`}>
                  {country.name}
                </Link>
              </>
            )}
            {f.outcome && ` · resolved ${f.outcome}${b !== null ? `, Brier ${b.toFixed(3)}` : ''}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Sparkline history={f.history} />
          <span className="num text-lg font-semibold text-gold-soft">{pct(current(f))}</span>
        </div>
      </div>
      <button className="mt-1 min-h-6 text-[11px] text-gold hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide details' : 'Details, revise or resolve'}
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-md border border-line p-3 text-xs">
          <p className="text-mist">
            <span className="text-slate-dim">Resolution criteria: </span>
            {f.criteria}
          </p>
          <ol className="space-y-0.5 text-slate-dim">
            {f.history.map((h, i) => (
              <li key={h.at + i}>
                {day(h.at)}: <span className="num text-platinum">{pct(h.p)}</span>
                {h.note ? ` · ${h.note}` : ''}
              </li>
            ))}
          </ol>
          {!f.outcome ? (
            <>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = parsePercent(prob);
                  if (p === null) return;
                  onRevise(f.id, p, note.trim() || undefined);
                  setProb('');
                  setNote('');
                }}
              >
                <label className="text-mist">
                  New probability (%)
                  <input className="input mt-1 w-24" inputMode="decimal" value={prob} onChange={(e) => setProb(e.target.value)} placeholder="1–99" />
                </label>
                <label className="min-w-40 flex-1 text-mist">
                  What changed (optional)
                  <input className="input mt-1" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                </label>
                <button className="btn-ghost h-9 text-xs" disabled={parsePercent(prob) === null}>
                  Revise
                </button>
              </form>
              <div className="flex flex-wrap gap-2">
                <span className="self-center text-slate-dim">Resolve:</span>
                {(['yes', 'no', 'void'] as const).map((o) => (
                  <button key={o} className="btn-ghost h-8 text-xs" onClick={() => onResolve(f.id, o)}>
                    {o === 'void' ? 'Void (no fair answer)' : o === 'yes' ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="btn-ghost h-8 text-xs" onClick={() => onResolve(f.id, null)}>
              Reopen
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <AddToBrain
              entity={{
                kind: 'scenario',
                label: f.question.slice(0, 120),
                date: f.closes,
                notes: `My forecast: ${pct(current(f))} (resolves by ${f.closes}). Criteria: ${f.criteria}${f.outcome ? ` Resolved: ${f.outcome}.` : ''}`.slice(0, 5000),
                ...(f.eventId ? { ref: { type: 'event' as const, id: f.eventId } } : f.country ? { ref: { type: 'country' as const, iso3: f.country } } : {}),
              }}
            />
            <button
              className="btn-quiet min-h-6 text-[11px] hover:text-down"
              onClick={() => {
                if (confirm('Delete this forecast?')) onRemove(f.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Sparkline({ history }: { history: Forecast['history'] }) {
  if (history.length < 2) return null;
  const W = 80;
  const H = 24;
  const d = history.map((h, i) => `${i ? 'L' : 'M'}${(i / (history.length - 1)) * W},${H - h.p * H}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-20" role="img" aria-label={`Probability history: ${history.map((h) => pct(h.p)).join(', ')}`}>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#2a2a2e" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke="#c9a35a" strokeWidth="1.5" />
    </svg>
  );
}

function CalibrationChart({ bins }: { bins: ReturnType<typeof calibration> }) {
  const S = 220;
  const P = 28;
  const x = (v: number) => P + v * (S - P - 8);
  const y = (v: number) => S - P - v * (S - P - 8);
  const total = bins.reduce((n, b) => n + b.count, 0);
  if (!total) return <p className="text-sm text-slate-dim">The diagram appears once forecasts are resolved.</p>;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-xs" role="img" aria-label="Calibration: forecast probability against how often the questions resolved yes">
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#4a4a50" strokeDasharray="3 3" />
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(0)} stroke="#2a2a2e" />
      <line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(1)} stroke="#2a2a2e" />
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <text x={x(t)} y={S - 10} fontSize="9" textAnchor="middle" fill="#8a8a92">
            {t * 100}%
          </text>
          <text x={P - 4} y={y(t) + 3} fontSize="9" textAnchor="end" fill="#8a8a92">
            {t * 100}%
          </text>
        </g>
      ))}
      <text x={S / 2 + 10} y={S - 1} fontSize="8" textAnchor="middle" fill="#8a8a92">
        Your probability
      </text>
      {bins
        .filter((b) => b.count && b.meanForecast !== null && b.observed !== null)
        .map((b) => (
          <g key={b.from}>
            <circle cx={x(b.meanForecast!)} cy={y(b.observed!)} r={3 + Math.min(6, Math.sqrt(b.count) * 1.5)} fill="#c9a35a" fillOpacity="0.8" />
            <text x={x(b.meanForecast!) + 9} y={y(b.observed!) + 3} fontSize="8" fill="#e8e4d8">
              n={b.count}
            </text>
          </g>
        ))}
    </svg>
  );
}
