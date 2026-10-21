import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Change, LimitNotice, PageHeader, Panel, ProvenanceBadge, Sparkline } from '../components/ui';
import { INSTRUMENTS, INSTRUMENT_MAP } from '../data/instruments';
import { countryByIso3, searchCountries } from '../lib/countries';
import { demoBars, lastQuote } from '../lib/demoMarket';
import { limitOf, useTier } from '../lib/entitlements';
import { CATEGORY_COLOR, CATEGORY_LABEL, useEvents } from '../lib/events';
import { fmtDate, fmtNumber, relativeTime } from '../lib/format';
import { annualisedVol } from '../lib/technical';
import { tensionBand, worldTension } from '../lib/tension';
import { WIDGETS, usePrefs, type WidgetId } from '../store/prefs';

const WIDE: WidgetId[] = ['tension', 'events'];

export default function Headquarters() {
  const { layout, hidden, moveWidget, toggleWidget, resetLayout } = usePrefs();
  const { status, session } = useAuth();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const visible = layout.filter((w) => !hidden.includes(w));
  const shown = editing ? layout : visible;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title={status === 'signed-in' ? `Welcome back${session?.user.email ? `, ${session.user.email.split('@')[0]}` : ''}` : 'Headquarters'}
        actions={
          <>
            {editing && (
              <button className="btn-ghost" onClick={resetLayout}>
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            )}
            <button className={editing ? 'btn-primary' : 'btn-ghost'} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
              <Settings2 className="h-4 w-4" /> {editing ? 'Done' : 'Customise'}
            </button>
          </>
        }
      >
        Your personal command dashboard. {status === 'signed-in' ? 'Layout is saved on this device; cloud sync arrives with accounts in Phase 2.' : 'Layout, watchlist and notes are saved in this browser.'}
      </PageHeader>

      {editing && (
        <p className="mb-4 rounded-lg border border-line bg-ink-900 px-3 py-2 text-xs text-mist">
          Drag widgets by the handle or use the arrows to reorder. Use the eye icon to show or hide a widget.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((id, index) => {
          const meta = WIDGETS.find((w) => w.id === id)!;
          const isHidden = hidden.includes(id);
          return (
            <div
              key={id}
              className={`min-w-0 ${WIDE.includes(id) ? 'xl:col-span-2' : ''} ${isHidden ? 'opacity-45' : ''} ${dragging === id ? 'opacity-60' : ''}`}
              draggable={editing}
              onDragStart={(e) => {
                setDragging(id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => editing && dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== id) moveWidget(dragging, layout.indexOf(id));
                setDragging(null);
              }}
            >
              <Panel
                className="h-full"
                title={meta.title}
                actions={
                  editing ? (
                    <>
                      <span className="cursor-grab text-slate-dim" aria-hidden>
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <button className="btn-quiet" aria-label={`Move ${meta.title} up`} disabled={index === 0} onClick={() => moveWidget(id, index - 1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button className="btn-quiet" aria-label={`Move ${meta.title} down`} disabled={index === shown.length - 1} onClick={() => moveWidget(id, index + 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button className="btn-quiet" aria-label={isHidden ? `Show ${meta.title}` : `Hide ${meta.title}`} onClick={() => toggleWidget(id)}>
                        {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  ) : undefined
                }
              >
                <Widget id={id} />
              </Panel>
            </div>
          );
        })}
      </div>
      {!editing && visible.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-dim">All widgets are hidden. Use “Customise” to bring them back.</p>
      )}
    </div>
  );
}

function Widget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'tension':
      return <TensionWidget />;
    case 'events':
      return <EventsWidget />;
    case 'markets':
      return <MarketsWidget />;
    case 'watchlist':
      return <WatchlistWidget />;
    case 'countries':
      return <CountriesWidget />;
    case 'alerts':
      return <AlertsWidget />;
    case 'notes':
      return <NotesWidget />;
  }
}

function TensionWidget() {
  const { demo, quakes } = useEvents();
  const [showMethod, setShowMethod] = useState(false);
  const vol = useMemo(() => annualisedVol(demoBars('GLB-EQ.D').slice(-21).map((b) => b.close)), []);
  const t = useMemo(() => worldTension([...demo, ...quakes], vol), [demo, quakes, vol]);
  const band = tensionBand(t.value);
  const toneCls = { low: 'text-up', moderate: 'text-gold', elevated: 'text-warn', high: 'text-down' }[band.tone];
  return (
    <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
      <div>
        <div className={`num font-display text-5xl font-bold ${toneCls}`}>{t.value.toFixed(0)}</div>
        <div className={`text-sm font-medium ${toneCls}`}>{band.label}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          <ProvenanceBadge kind="simulated" />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-dim">
          Prototype index on demo inputs over {t.windowDays} days ({t.eventsConsidered} events). Not a validated measure.
        </p>
      </div>
      <div>
        <ul className="space-y-2">
          {t.components.map((c) => (
            <li key={c.key}>
              <div className="flex justify-between text-xs">
                <span className="text-mist">
                  {c.label} <span className="text-slate-dim">×{c.weight}</span>
                </span>
                <span className="num text-platinum">{c.score.toFixed(0)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-ink-800">
                <div className="h-1.5 rounded-full bg-gold/70" style={{ width: `${c.score}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-4 text-xs">
          <button className="text-gold hover:underline" onClick={() => setShowMethod((s) => !s)} aria-expanded={showMethod}>
            {showMethod ? 'Hide methodology' : 'Show methodology'}
          </button>
          <Link to="/tension" className="text-gold hover:underline">
            Full index, history &amp; weights →
          </Link>
        </div>
        {showMethod && (
          <p className="mt-2 text-xs leading-relaxed text-mist">
            Index = Σ wᵢ·cᵢ. Each event component is the severity-weighted sum of events in the window, scaled to 0–100 by
            100·(1 − e<sup>−x/k</sup>) with a published saturation constant k. Financial stress maps the 21-day annualised
            volatility of the global equity proxy linearly (40% → 100). Weights and constants are open for review and will be
            calibrated against historical data before any production use.
          </p>
        )}
      </div>
    </div>
  );
}

function EventsWidget() {
  const { demo, quakes, quakeStatus } = useEvents();
  const top = useMemo(
    () => [...demo, ...quakes].sort((a, b) => b.severity - a.severity || Date.parse(b.time) - Date.parse(a.time)).slice(0, 6),
    [demo, quakes],
  );
  return (
    <div>
      <ul className="divide-y divide-line/60">
        {top.map((e) => (
          <li key={e.id} className="flex items-start gap-3 py-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-platinum">{e.title}</div>
              <div className="text-xs text-slate-dim">
                {CATEGORY_LABEL[e.category]} · S{e.severity} · {relativeTime(e.time)}
              </div>
            </div>
            <ProvenanceBadge kind={e.provenance} />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between text-xs">
        <span className="text-slate-dim">USGS feed: {quakeStatus === 'ready' ? `${quakes.length} live events` : quakeStatus}</span>
        <Link to="/radar" className="text-gold hover:underline">
          Open Global Radar →
        </Link>
      </div>
    </div>
  );
}

function QuoteRow({ symbol, action }: { symbol: string; action?: ReactNode }) {
  const inst = INSTRUMENT_MAP.get(symbol);
  const q = lastQuote(symbol);
  if (!inst || !q) return null;
  return (
    <li className="flex items-center gap-3 py-1.5">
      <Link to={`/markets?symbol=${symbol}`} className="min-w-0 flex-1">
        <span className="block text-sm text-platinum hover:text-gold-soft">{symbol}</span>
        <span className="block truncate text-[11px] text-slate-dim">{inst.name}</span>
      </Link>
      <Sparkline values={demoBars(symbol).slice(-30).map((b) => b.close)} width={64} height={22} />
      <span className="w-20 text-right">
        <span className="num block text-sm">{fmtNumber(q.price, inst.decimals)}</span>
        <Change value={q.changePct} className="text-[11px]" />
      </span>
      {action}
    </li>
  );
}

function MarketsWidget() {
  return (
    <div>
      <ul className="divide-y divide-line/60">
        {['GLB-EQ.D', 'EUR-EQ.D', 'CRUDE.D', 'GOLD.D', 'EURUSD.D', 'UST10Y.D'].map((s) => (
          <QuoteRow key={s} symbol={s} />
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-dim">Synthetic demo prices.</p>
    </div>
  );
}

function WatchlistWidget() {
  const { watchlist, toggleWatch } = usePrefs();
  const maxWatch = limitOf(useTier(), 'assetsPerWatchlist');
  const [adding, setAdding] = useState('');
  const full = watchlist.length >= maxWatch;
  const options = INSTRUMENTS.filter((i) => !watchlist.includes(i.symbol));
  return (
    <div>
      {watchlist.length === 0 && <p className="text-sm text-slate-dim">No instruments yet.</p>}
      <ul className="divide-y divide-line/60">
        {watchlist.map((s) => (
          <QuoteRow
            key={s}
            symbol={s}
            action={
              <button className="btn-quiet px-1" aria-label={`Remove ${s}`} onClick={() => toggleWatch(s)}>
                <X className="h-3.5 w-3.5" />
              </button>
            }
          />
        ))}
      </ul>
      <p className="num mt-2 text-[11px] text-slate-dim">
        {watchlist.length}/{maxWatch} instruments
      </p>
      {full && <LimitNotice what="instruments per watchlist" limit={maxWatch} />}
      {options.length > 0 && !full && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding) toggleWatch(adding, maxWatch);
            setAdding('');
          }}
        >
          <select className="input" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Instrument to add">
            <option value="">Add instrument…</option>
            {options.map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.symbol} — {i.name}
              </option>
            ))}
          </select>
          <button className="btn-ghost px-2.5" disabled={!adding} aria-label="Add to watchlist">
            <Plus className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}

function CountriesWidget() {
  const { favorites, toggleFavorite } = usePrefs();
  const [q, setQ] = useState('');
  const results = searchCountries(q, 5).filter((c) => !favorites.includes(c.iso3));
  return (
    <div>
      <ul className="space-y-1">
        {favorites.map((iso3) => (
          <li key={iso3} className="flex items-center justify-between gap-2">
            <Link to={`/countries/${iso3}`} className="flex-1 rounded px-1 py-1 text-sm hover:text-gold-soft">
              {countryByIso3(iso3)?.name ?? iso3} <span className="text-xs text-slate-dim">{iso3}</span>
            </Link>
            <button className="btn-quiet px-1" aria-label={`Remove ${iso3}`} onClick={() => toggleFavorite(iso3)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="relative mt-3">
        <input className="input" placeholder="Add a country…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search country to add" />
        {results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-line bg-ink-900 py-1 shadow-xl">
            {results.map((c) => (
              <li key={c.iso3}>
                <button
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-ink-800"
                  onClick={() => {
                    toggleFavorite(c.iso3);
                    setQ('');
                  }}
                >
                  {c.name} <span className="text-xs text-slate-dim">{c.iso3}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AlertsWidget() {
  const { alerts, addAlert, removeAlert } = usePrefs();
  const maxAlerts = limitOf(useTier(), 'alertRules');
  const full = alerts.length >= maxAlerts;
  const [symbol, setSymbol] = useState(INSTRUMENTS[0]!.symbol);
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [level, setLevel] = useState('');
  return (
    <div>
      {alerts.length === 0 && <p className="text-sm text-slate-dim">No alert rules. Rules are evaluated against the latest demo close.</p>}
      <ul className="divide-y divide-line/60">
        {alerts.map((a) => {
          const q = lastQuote(a.symbol);
          const hit = q ? (a.direction === 'above' ? q.price >= a.level : q.price <= a.level) : false;
          return (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${hit ? 'bg-gold' : 'bg-ink-700'}`} aria-hidden />
              <span className="flex-1">
                {a.symbol} {a.direction} <span className="num">{a.level}</span>
                <span className={`ml-2 text-xs ${hit ? 'text-gold' : 'text-slate-dim'}`}>{hit ? 'Triggered' : 'Watching'}</span>
              </span>
              <button className="btn-quiet px-1" aria-label="Delete alert" onClick={() => removeAlert(a.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="num mt-2 text-[11px] text-slate-dim">
        {alerts.length}/{maxAlerts} alert rules
      </p>
      {full && <LimitNotice what="alert rules" limit={maxAlerts} />}
      <form
        hidden={full}
        className="mt-3 grid grid-cols-[1fr_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(level);
          if (!(v > 0)) return;
          addAlert({ symbol, direction, level: v }, maxAlerts);
          setLevel('');
        }}
      >
        <select className="input col-span-2" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Alert instrument">
          {INSTRUMENTS.map((i) => (
            <option key={i.symbol}>{i.symbol}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select className="input w-24" value={direction} onChange={(e) => setDirection(e.target.value as 'above' | 'below')} aria-label="Direction">
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <input
            className="input num"
            type="number"
            step="any"
            min="0"
            placeholder={String(lastQuote(symbol)?.price ?? '')}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            aria-label="Price level"
          />
        </div>
        <button className="btn-ghost px-2.5" disabled={!(Number(level) > 0)} aria-label="Add alert">
          <Plus className="h-4 w-4" />
        </button>
      </form>
      <p className="mt-2 text-[11px] text-slate-dim">In-app only. Email and push delivery are planned.</p>
    </div>
  );
}

function NotesWidget() {
  const { notes, addNote, removeNote } = usePrefs();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addNote(title.trim(), body.trim());
          setTitle('');
          setBody('');
        }}
      >
        <input className="input" placeholder="Note title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Note title" />
        <textarea className="input min-h-16" placeholder="Observations, hypotheses, sources…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} aria-label="Note body" />
        <button className="btn-ghost w-full" disabled={!title.trim()}>
          Save note
        </button>
      </form>
      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-line p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{n.title}</div>
              <button className="btn-quiet -mr-1 -mt-1 px-1" aria-label={`Delete note ${n.title}`} onClick={() => removeNote(n.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {n.body && <p className="mt-1 whitespace-pre-wrap text-xs text-mist">{n.body}</p>}
            <div className="mt-1 text-[10px] text-slate-dim">{fmtDate(n.createdAt)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
