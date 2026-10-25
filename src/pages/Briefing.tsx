import { ChevronLeft, ChevronRight, ExternalLink, Globe2, Library, LogOut, Map as MapIcon, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { GeoEvent } from '../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import { BriefingGlobe } from '../components/BriefingGlobe';
import { PageHeader, Panel } from '../components/ui';
import { WorldMap, type WorldMapHandle } from '../components/WorldMap';
import { RISK_LEVELS } from '../lib/brainRisk';
import { countryByName } from '../lib/countries';
import { CATEGORY_LABEL, useEvents } from '../lib/events';
import { fmtDate, plural, relativeTime } from '../lib/format';
import {
  PERIODS,
  STATUS,
  backgroundOf,
  briefingItems,
  briefingWindow,
  countryNameOf,
  normalizeBriefingPrefs,
  reliabilityOf,
  severityLabel,
  severityLevel,
  statusOf,
  type BriefingItem,
  type BriefingPeriod,
  type BriefingStatus,
} from '../lib/worldBriefing';
import { usePrefs } from '../store/prefs';

/** Seconds each event stays on screen while the tour plays. */
const DWELL_MS = 12_000;
const STATUS_CLASS: Record<BriefingStatus, string> = {
  confirmed: 'border-up/50 text-up',
  reported: 'border-info/50 text-info',
  modelled: 'border-info/50 text-info',
  unverified: 'border-warn/50 text-warn',
  simulated: 'border-gold-dim text-gold',
};

type Tour = { state: 'overview' } | { state: 'touring'; index: number; playing: boolean; startedAt: number } | { state: 'done' };

export default function Briefing() {
  const { status: auth } = useAuth();
  const signedIn = auth === 'signed-in';
  const prefs = normalizeBriefingPrefs(usePrefs((s) => s.briefing));
  const setPrefs = usePrefs((s) => s.setBriefing);
  const { demo, quakes, disasters, quakeStatus, disasterStatus, quakeStale, disasterStale } = useEvents();
  const [now] = useState(() => Date.now());
  /** Null until the user picks one: then it follows the account settings, which may arrive after the page opens. */
  const [chosen, setPeriod] = useState<BriefingPeriod | null>(null);
  const period: BriefingPeriod = chosen ?? (signedIn && prefs.remember && prefs.lastAt ? 'since-last' : '24h');
  const [view, setView] = useState<'globe' | 'map'>('globe');
  const [tour, setTour] = useState<Tour>({ state: 'overview' });
  const [showSources, setShowSources] = useState(false);
  const map = useRef<WorldMapHandle>(null);

  const effectivePeriod: BriefingPeriod = period === 'since-last' && !(signedIn && prefs.remember) ? '24h' : period;
  const window_ = briefingWindow(effectivePeriod, now, prefs.lastAt);
  const items = useMemo(
    () => briefingItems([...quakes, ...disasters, ...demo], window_, prefs.order, prefs.includeSimulated),
    // window_ is derived from these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quakes, disasters, demo, window_.from, window_.to, prefs.order, prefs.includeSimulated],
  );
  const loading = quakeStatus === 'loading' || disasterStatus === 'loading';
  const current = tour.state === 'touring' ? items[tour.index] : undefined;
  const byStatus = items.reduce<Partial<Record<BriefingStatus, number>>>((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {});

  const markRead = () => {
    if (signedIn && prefs.remember) setPrefs({ lastAt: new Date(window_.to).toISOString() });
  };
  const focusOn = (it: BriefingItem | undefined) => {
    if (it) map.current?.focus(it.event.lat, it.event.lon, 4);
  };
  const [marked, setMarked] = useState(false);
  const finish = (read: boolean) => {
    setTour({ state: 'done' });
    setMarked(read && signedIn && prefs.remember);
    if (read) markRead();
    map.current?.reset();
  };
  const go = (index: number, playing: boolean) => {
    if (index >= items.length) {
      finish(true);
      return;
    }
    const i = Math.max(0, index);
    setTour({ state: 'touring', index: i, playing, startedAt: Date.now() });
    setShowSources(false);
    focusOn(items[i]);
  };
  const exit = () => {
    setTour({ state: 'overview' });
    map.current?.reset();
  };
  const togglePlay = () => tour.state === 'touring' && setTour({ ...tour, playing: !tour.playing, startedAt: Date.now() });

  // Auto-advance while playing. The timer callback (not the effect body) changes state.
  const next = useRef<() => void>(() => {});
  useEffect(() => {
    next.current = () => tour.state === 'touring' && go(tour.index + 1, true);
  });
  const timerKey = tour.state === 'touring' && tour.playing ? `${tour.index}:${tour.startedAt}` : null;
  useEffect(() => {
    if (!timerKey) return;
    const t = setTimeout(() => next.current(), DWELL_MS);
    return () => clearTimeout(t);
  }, [timerKey]);

  // Keyboard: arrows move, space pauses or resumes, Escape exits (only during the tour, never inside form fields).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (tour.state !== 'touring' || (e.target as HTMLElement | null)?.closest('input, textarea, select, [role="application"]')) return;
      if (e.key === 'ArrowRight') go(tour.index + 1, tour.playing);
      else if (e.key === 'ArrowLeft') go(tour.index - 1, tour.playing);
      else if (e.key === ' ') togglePlay();
      else if (e.key === 'Escape') exit();
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const focusPoint = current ? { lat: current.event.lat, lon: current.event.lon } : null;
  const mapEvents = items.map((i) => i.event);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Guided tour · no AI" title="World Briefing">
        What happened {window_.from === now - 24 * 3_600_000 ? 'in the last 24 hours' : `since ${fmtDate(new Date(window_.from).toISOString())}`}, one event at a
        time, with location, background, severity, reliability and sources. Built only from Aurora's live feeds (USGS
        earthquakes, GDACS disaster alerts). Nothing is generated, and nothing unverified is shown as confirmed.
      </PageHeader>

      {/* Settings */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input h-9 w-auto" value={effectivePeriod} onChange={(e) => setPeriod(e.target.value as BriefingPeriod)} aria-label="Briefing period" disabled={tour.state === 'touring'}>
          {(Object.keys(PERIODS) as BriefingPeriod[]).map((p) => (
            <option key={p} value={p} disabled={p === 'since-last' && !(signedIn && prefs.remember)}>
              {PERIODS[p].label}
              {p === 'since-last' && !signedIn ? ' (sign in)' : p === 'since-last' && !prefs.remember ? ' (turn on below)' : ''}
            </option>
          ))}
        </select>
        <select className="input h-9 w-auto" value={prefs.order} onChange={(e) => setPrefs({ order: e.target.value === 'severity' ? 'severity' : 'chronological' })} aria-label="Tour order" disabled={tour.state === 'touring'}>
          <option value="chronological">Chronological</option>
          <option value="severity">Most severe first</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-mist">
          <input type="checkbox" className="accent-[#c9a35a]" checked={prefs.includeSimulated} disabled={tour.state === 'touring'} onChange={(e) => setPrefs({ includeSimulated: e.target.checked })} />
          Include simulated demo scenarios
        </label>
        <div className="ml-auto flex gap-1" role="group" aria-label="Map view">
          <button className="chip" aria-pressed={view === 'globe'} onClick={() => setView('globe')}>
            <Globe2 className="h-3.5 w-3.5" aria-hidden /> Globe
          </button>
          <button className="chip" aria-pressed={view === 'map'} onClick={() => setView('map')}>
            <MapIcon className="h-3.5 w-3.5" aria-hidden /> Flat map
          </button>
        </div>
      </div>
      {signedIn ? (
        <label className="mb-4 flex items-start gap-2 text-xs text-mist">
          <input type="checkbox" className="mt-0.5 accent-[#c9a35a]" checked={prefs.remember} onChange={(e) => setPrefs({ remember: e.target.checked })} />
          <span>
            Remember when I finish a briefing, so the next one starts from there. This stores one timestamp with your account settings; turning it off
            deletes it.
            {prefs.remember && prefs.lastAt && <span className="text-slate-dim"> Last briefing: {fmtDate(prefs.lastAt)} ({relativeTime(prefs.lastAt)}).</span>}
          </span>
        </label>
      ) : (
        <p className="mb-4 text-xs text-slate-dim">
          Guests see the last 24 hours (or choose 3 or 7 days). <Link className="text-gold hover:underline" to="/signin">Sign in</Link> to continue from your last
          briefing.
        </p>
      )}
      {window_.note && <p className="mb-4 text-xs text-warn">{window_.note}</p>}
      {(quakeStatus === 'error' || disasterStatus === 'error') && (
        <p className="mb-4 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn" role="status">
          {quakeStatus === 'error' && 'The USGS earthquake feed is unavailable right now. '}
          {disasterStatus === 'error' && 'The GDACS alert feed is unavailable right now. '}
          The briefing may be incomplete.
        </p>
      )}
      {(quakeStale || disasterStale) && (
        <p className="mb-4 text-xs text-warn" role="status">
          Showing the last saved copy of {[quakeStale && 'USGS', disasterStale && 'GDACS'].filter(Boolean).join(' and ')} because the source is not responding.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          {view === 'globe' ? (
            <BriefingGlobe events={mapEvents} focus={focusPoint} selectedId={current?.event.id} onSelect={(e) => go(items.findIndex((i) => i.event.id === e.id), false)} />
          ) : (
            <WorldMap ref={map} events={mapEvents} selectedEventId={current?.event.id} onEventClick={(e) => go(items.findIndex((i) => i.event.id === e.id), false)} className="aspect-[96/50] border border-line" />
          )}
        </div>

        <div className="min-w-0">
          {tour.state === 'touring' && current ? (
            <TourCard
              item={current}
              index={tour.index}
              total={items.length}
              playing={tour.playing}
              timerKey={timerKey}
              showSources={showSources}
              onPrev={() => go(tour.index - 1, tour.playing)}
              onNext={() => go(tour.index + 1, tour.playing)}
              onTogglePlay={togglePlay}
              onSkip={() => finish(false)}
              onRestart={() => go(0, true)}
              onExit={exit}
              onToggleSources={() => setShowSources((s) => !s)}
            />
          ) : (
            <Panel
              title={tour.state === 'done' ? 'Briefing complete' : PERIODS[effectivePeriod].label}
              eyebrow={loading ? 'Loading live feeds…' : `${plural(items.length, 'event')} · duplicates merged`}
            >
              <div className="space-y-3 text-sm">
                {tour.state === 'done' && (
                  <p className="text-xs text-mist">
                    {marked ? `You have seen all ${plural(items.length, 'event')}. Your next briefing will start from now.` : `Tour ended. ${plural(items.length, 'event')} in this briefing.`}
                  </p>
                )}
                {tour.state === 'done' && !marked && signedIn && prefs.remember && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => {
                      markRead();
                      setMarked(true);
                    }}
                  >
                    Mark this briefing as read
                  </button>
                )}
                {items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(STATUS) as BriefingStatus[])
                      .filter((s) => byStatus[s])
                      .map((s) => (
                        <span key={s} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_CLASS[s]}`} title={STATUS[s].description}>
                          {byStatus[s]} {STATUS[s].label}
                        </span>
                      ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => go(0, true)} disabled={items.length === 0}>
                    {tour.state === 'done' ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                    {tour.state === 'done' ? 'Restart briefing' : 'Start briefing'}
                  </button>
                  {tour.state === 'done' && (
                    <button className="btn-ghost" onClick={exit}>
                      Back to overview
                    </button>
                  )}
                </div>
                {items.length === 0 && !loading && <p className="text-xs text-slate-dim">No events in this period. Try a longer period{prefs.includeSimulated ? '' : ' or include the simulated scenarios'}.</p>}
                <ol className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {items.map((it, i) => (
                    <li key={it.event.id}>
                      <button className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-ink-800/60" onClick={() => go(i, false)}>
                        <span className="num mt-0.5 w-5 shrink-0 text-xs text-slate-dim">{i + 1}</span>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: RISK_LEVELS[severityLevel(it.event.severity)].color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-platinum">{it.event.title}</span>
                          <span className="text-xs text-slate-dim">
                            {relativeTime(it.event.time)} · {STATUS[it.status].label}
                            {it.related.length > 0 && ` · ${it.related.length + 1} sources`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </Panel>
          )}
        </div>
      </div>
      <p className="mt-4 text-[11px] text-slate-dim">
        Keys during the tour: ← and → move, Space pauses or resumes, Esc exits. Each event stays {DWELL_MS / 1000} seconds while playing. Severity uses Aurora's
        risk scale. Background and typical effects describe the type of event in general and are not claims about this event.
      </p>
    </div>
  );
}

function TourCard(props: {
  item: BriefingItem;
  index: number;
  total: number;
  playing: boolean;
  timerKey: string | null;
  showSources: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onExit: () => void;
  onToggleSources: () => void;
}) {
  const { item, index, total, playing } = props;
  const e: GeoEvent = item.event;
  const bg = backgroundOf(e.category);
  const level = severityLevel(e.severity);
  const country = countryByName(countryNameOf(e));
  return (
    <Panel
      title={`Event ${index + 1} of ${total}`}
      eyebrow={CATEGORY_LABEL[e.category]}
      actions={
        <button className="btn-quiet text-xs" onClick={props.onExit} aria-label="Exit briefing">
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Exit
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="h-0.5 overflow-hidden rounded bg-line" aria-hidden>
          {playing && props.timerKey && <div key={props.timerKey} className="av-brief-progress h-full bg-gold/80" style={{ animationDuration: `${DWELL_MS}ms` }} />}
        </div>
        <div aria-live="polite">
          <h3 className="text-base font-semibold text-platinum">{e.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_CLASS[item.status]}`} title={STATUS[item.status].description}>
              {STATUS[item.status].label}
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-mist">
              <span className="h-2 w-2 rounded-full" style={{ background: RISK_LEVELS[level].color }} aria-hidden /> Severity {severityLabel(e.severity)}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-slate-dim">Location</dt>
          <dd className="text-mist">
            {e.region} <span className="num text-slate-dim">({e.lat.toFixed(2)}, {e.lon.toFixed(2)})</span>
          </dd>
          <dt className="text-slate-dim">Time</dt>
          <dd className="text-mist">
            {new Date(e.time).toISOString().replace('T', ' ').slice(0, 16)} UTC ({relativeTime(e.time)})
          </dd>
          <dt className="text-slate-dim">Summary</dt>
          <dd className="text-mist">{e.summary}</dd>
          <dt className="text-slate-dim">Background</dt>
          <dd className="text-mist">{bg.background}</dd>
          <dt className="text-slate-dim">Consequences</dt>
          <dd className="text-mist">{bg.consequences} General background for this type of event, not an assessment of this one.</dd>
          <dt className="text-slate-dim">Reliability</dt>
          <dd className="text-mist">{reliabilityOf(e)}</dd>
          {item.related.length > 0 && (
            <>
              <dt className="text-slate-dim">Also reported</dt>
              <dd className="text-mist">
                {item.related.map((r) => (
                  <span key={r.id} className="block">
                    {r.source.name} ({STATUS[statusOf(r)].label.toLowerCase()}): {r.summary}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
        {props.showSources && (
          <ul className="space-y-1 rounded-md border border-line p-2 text-xs" aria-label="Sources">
            {item.sources.map((s) => (
              <li key={s.url}>
                {s.url.startsWith('http') ? (
                  <a className="inline-flex items-center gap-1 text-gold hover:underline" href={s.url} target="_blank" rel="noreferrer">
                    {s.name} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <Link className="text-gold hover:underline" to={s.url}>
                    {s.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
          <button className="btn-ghost h-8 px-2.5 text-xs" onClick={props.onPrev} disabled={index === 0} aria-label="Previous event">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
          </button>
          <button className="btn-ghost h-8 px-2.5 text-xs" onClick={props.onTogglePlay} aria-label={playing ? 'Pause' : 'Resume'}>
            {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {playing ? 'Pause' : 'Resume'}
          </button>
          <button className="btn-primary h-8 px-2.5 text-xs" onClick={props.onNext} aria-label={index + 1 === total ? 'Finish briefing' : 'Next event'}>
            {index + 1 === total ? 'Finish' : 'Next'} <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button className="btn-ghost h-8 px-2.5 text-xs" onClick={props.onSkip} aria-label="Skip to the end">
            <SkipForward className="h-4 w-4" aria-hidden /> Skip
          </button>
          <button className="btn-ghost h-8 px-2.5 text-xs" onClick={props.onRestart} aria-label="Restart briefing">
            <RotateCcw className="h-4 w-4" aria-hidden /> Restart
          </button>
          <button className="btn-ghost h-8 px-2.5 text-xs" onClick={props.onToggleSources} aria-pressed={props.showSources}>
            <Library className="h-4 w-4" aria-hidden /> Sources ({item.sources.length})
          </button>
          {country ? (
            <Link className="btn-ghost h-8 px-2.5 text-xs" to={`/countries/${country.iso3}`}>
              Dossier: {country.name}
            </Link>
          ) : (
            <button className="btn-ghost h-8 px-2.5 text-xs" disabled title="No single country is named for this location (for example an ocean region or a simulated scenario).">
              Dossier unavailable
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
