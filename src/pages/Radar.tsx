import { BookOpen, ExternalLink, Headphones, Search, Tv, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Story } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';
import type { GeoMapHandle } from '../components/geo/GeoMap';
import { CountryPanel, type DossierSection } from '../components/hq/CountryPanel';
import { Presentation, type ExitReason, type PresentationMode } from '../components/presentation/Presentation';
import { ProvenanceBadge } from '../components/ui';
import { WorldMap } from '../components/WorldMap';
import { useApi } from '../lib/api';
import { COUNTRIES, countryByIso3 } from '../lib/countries';
import { useEvents } from '../lib/events';
import type { MapState, MapStyleId } from '../lib/geo/state';
import { useAuth } from '../auth/AuthProvider';
import { WINDOWS, buildPlan, buildTour, type Plan, type ReportingWindow } from '../lib/briefingPlan';
import { age } from '../lib/radarLabels';
import { audioNarrator, browserNarrator, prepareNaturalVoice, type Narrator } from '../lib/narration';
import { useIdle } from '../lib/useIdle';
import { normalizeIdle, usePrefs } from '../store/prefs';

const GeoMap = lazy(() => import('../components/geo/GeoMap'));

const PREF_KEY = 'av-hq';
const STYLES: [MapStyleId, string][] = [
  ['grayscale', 'Grayscale'],
  ['dark', 'Dark'],
  ['satellite', 'Satellite'],
];
interface Prefs {
  style: MapStyleId;
  panelWidth: number;
}
const DEFAULT_PREFS: Prefs = { style: 'grayscale', panelWidth: 460 };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<Prefs>;
    return {
      style: STYLES.find(([s]) => s === raw.style)?.[0] ?? DEFAULT_PREFS.style,
      panelWidth: typeof raw.panelWidth === 'number' ? Math.min(760, Math.max(360, raw.panelWidth)) : DEFAULT_PREFS.panelWidth,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}
const webgl2 = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};
const SEVERITY_CLS = ['', 'bg-slate-dim', 'bg-info', 'bg-gold', 'bg-warn', 'bg-down'];

/** True at the desktop breakpoint (lg, 1024 px), updated on resize. */
function useDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return match;
}

/** First country named in a headline, for focusing the map from a news story. */
function countryIn(text: string) {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ')} `;
  let best: { c: (typeof COUNTRIES)[number]; at: number } | null = null;
  for (const c of COUNTRIES) {
    if (c.name.length <= 3) continue;
    const at = t.indexOf(` ${c.name.toLowerCase()} `);
    if (at >= 0 && (!best || at < best.at || (at === best.at && c.name.length > best.c.name.length))) best = { c, at };
  }
  return best?.c;
}

/** Prepared natural-voice audio per briefing content version, so replays in this tab cost nothing. */
const AUDIO_CACHE = new Map<string, Map<string, string>>();

interface Showing {
  mode: PresentationMode;
  plan: Plan;
  fullscreen: boolean;
  narrator: Narrator | null;
  audioNote: string | null;
}

/**
 * Global Radar, the arrival view. Left: sourced signals and news; centre: the globe; right: the situation overview
 * with the briefing launcher, the selected event or an integrated country dossier. Briefings and the Auto Tour run as
 * a full-screen presentation on the same grayscale globe (`components/presentation/Presentation.tsx`).
 */
export default function Radar() {
  const [params, setParams] = useSearchParams();
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = loadPrefs();
    const s = STYLES.find(([id]) => id === params.get('style'))?.[0];
    return s ? { ...p, style: s } : p;
  });
  const savePrefs = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  const [env] = useState(() => ({ today: new Date().toISOString().slice(0, 10), year: new Date().getUTCFullYear() - 2, gl: webgl2() }));
  const [now, setNow] = useState(() => Date.now());
  const country = params.get('k') && countryByIso3(params.get('k')!) ? params.get('k')! : null;
  const [section, setSection] = useState<DossierSection>('overview');
  const [selected, setSelected] = useState<GeoEvent | null>(null);
  const [camera, setCamera] = useState<{ center: [number, number]; zoom: number }>({ center: [15, 28], zoom: 1.5 });
  const before = useRef<{ center: [number, number]; zoom: number } | null>(null);
  /** Country the camera was last fitted to (null after closing). */
  const framed = useRef<string | null>(null);
  const map = useRef<GeoMapHandle>(null);
  const [feedTab, setFeedTab] = useState<'all' | 'signals' | 'news'>('all');
  const [query, setQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<'feed' | 'details'>('details');
  const [win, setWin] = useState<ReportingWindow>('24h');
  const [showing, setShowing] = useState<Showing | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [summary, setSummary] = useState<Plan | null>(null);
  const { session } = useAuth();
  const idle = normalizeIdle(usePrefs((s) => s.idle));

  const { quakes, disasters, quakeStale, disasterStale, quakeStatus, disasterStatus } = useEvents();
  const news = useApi<{ stories: Story[]; articles: number; fetchedAt: string; partial?: string }>(`/api/news?t=${win}`);
  const signals = useMemo(() => [...quakes, ...disasters].filter((e) => e.provenance !== 'simulated').sort((a, b) => Date.parse(b.time) - Date.parse(a.time)), [quakes, disasters]);
  const minute = Math.floor(now / 60_000);
  const isDesktop = useDesktop();
  const last24 = useMemo(() => signals.filter((e) => minute * 60_000 - Date.parse(e.time) <= 86_400_000), [signals, minute]);
  const quakes24 = useMemo(() => quakes.filter((e) => minute * 60_000 - Date.parse(e.time) <= 86_400_000).length, [quakes, minute]);

  // Clock for ages (the interval callback, not the effect body, updates state).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const panelPx = isDesktop ? prefs.panelWidth : 0;
  const focusEvent = useCallback((e: GeoEvent) => {
    setSelected(e);
    map.current?.flyTo(e.lon, e.lat, 3.6);
  }, []);

  // Briefings and the tour: the plan is built once when they start and stays frozen while they run.
  const countryOf = useCallback((text: string) => countryIn(text)?.iso3 ?? null, []);
  const storiesNow = useMemo(() => (news.status === 'ready' ? news.data.stories : []), [news]);
  const planFor = (w: ReportingWindow, mode: 'read' | 'play') => buildPlan({ window: w, now: Date.now(), events: signals, stories: storiesNow, countryOf, mode });
  const startBriefing = async (mode: 'read' | 'play') => {
    const plan = planFor(win, mode);
    if (!plan.scenes.length) {
      setSummary(plan);
      return;
    }
    if (mode === 'read') {
      setShowing({ mode, plan, fullscreen: true, narrator: null, audioNote: null });
      return;
    }
    // Natural voices for signed-in users (prepared once per content version); otherwise the browser's voices.
    let narrator: Narrator | null = null;
    let audioNote: string | null = null;
    const lines = [plan.intro, ...plan.scenes.flatMap((s) => s.lines)];
    if (session) {
      setPreparing(true);
      try {
        const clips = AUDIO_CACHE.get(plan.version) ?? (await prepareNaturalVoice(lines, session.access_token));
        AUDIO_CACHE.set(plan.version, clips);
        narrator = audioNarrator(clips);
      } catch (err) {
        audioNote = `Natural voice unavailable (${err instanceof Error ? err.message : 'error'}). Using the browser voice.`;
      } finally {
        setPreparing(false);
      }
    }
    if (!narrator) {
      narrator = browserNarrator();
      if (!narrator) audioNote = 'This browser cannot speak text aloud, so the briefing runs with captions only.';
    }
    setShowing({ mode, plan, fullscreen: true, narrator, audioNote });
  };
  const startTour = useCallback(
    (fullscreen: boolean) => {
      const plan = buildTour({ now: Date.now(), events: signals, stories: storiesNow, countryOf });
      if (plan.scenes.length) setShowing({ mode: 'tour', plan, fullscreen, narrator: null, audioNote: null });
    },
    [signals, storiesNow, countryOf],
  );
  const endShow = (reason: ExitReason) => {
    if (showing && reason === 'done' && showing.mode !== 'tour') setSummary(showing.plan);
    setShowing(null);
  };
  // Automatic Auto Tour after inactivity (profile switch; never while presenting, typing or in a dialog).
  useIdle(idle.radar && !showing && !preparing, () => startTour(false));

  const openCountry = (iso3: string | null) => {
        if (!iso3) return;
    if (!country) before.current = camera;
    setSelected(null);
    setSection('overview');
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('k', iso3);
      return n;
    });
    setMobileTab('details');
    framed.current = iso3;
    requestAnimationFrame(() => map.current?.focusCountry(iso3, { top: 60, bottom: 40, left: 40, right: panelPx + 40 }));
  };
  const closeCountry = useCallback(() => {
    framed.current = null;
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete('k');
      return n;
    });
    const b = before.current;
    if (b) map.current?.flyTo(b.center[0], b.center[1], b.zoom);
    before.current = null;
  }, [setParams]);
  // A shared link with ?k= opens the dossier: frame that country once the (lazily loaded) map is ready.
  useEffect(() => {
    if (!country || framed.current === country) return;
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (map.current?.focusCountry(country, { top: 60, bottom: 40, left: 40, right: panelPx + 40 }) || tries > 40) {
        framed.current = country;
        clearInterval(t);
      }
    }, 250);
    return () => clearInterval(t);
  }, [country, panelPx]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && country && !(e.target as HTMLElement | null)?.closest('input, textarea, select')) closeCountry();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [country, closeCountry]);

  const mapState: MapState = useMemo(
    () => ({
      mode: '3d',
      style: prefs.style,
      layers: [
        { id: 'earthquakes', opacity: 1 },
        { id: 'disasters', opacity: 1 },
      ],
      center: camera.center,
      zoom: camera.zoom,
      date: env.today,
      year: env.year,
      country,
    }),
    [prefs.style, camera, env, country],
  );

  // Feed items.
  const q = query.trim().toLowerCase();
  const sigItems = signals.filter((e) => !q || `${e.title} ${e.region}`.toLowerCase().includes(q)).slice(0, 60);
  const stories = news.status === 'ready' ? news.data.stories.filter((s) => !q || s.title.toLowerCase().includes(q)).slice(0, 40) : [];

  const resizing = useRef(false);
  const startResize = (ev: React.PointerEvent) => {
    resizing.current = true;
    const startX = ev.clientX;
    const startW = prefs.panelWidth;
    const move = (e: PointerEvent) => resizing.current && setPrefs((p) => ({ ...p, panelWidth: Math.min(760, Math.max(360, startW + (startX - e.clientX))) }));
    const up = () => {
      resizing.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      savePrefs({});
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const strip = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mist">
      <span className="eyebrow !text-[10px]">Last 24 hours</span>
      <span>
        <span className="num text-platinum">{quakes24}</span> earthquakes M4.5+
      </span>
      <span>
        <span className="num text-platinum">{last24.length}</span> hazard signals
      </span>
      {news.status === 'ready' && (
        <span>
          <span className="num text-platinum">{news.data.stories.length}</span> news stories,{' '}
          <span className="num text-platinum">{news.data.stories.filter((s) => s.status !== 'unverified').length}</span> confirmed or corroborated
        </span>
      )}
      {(quakeStale || disasterStale) && <span className="text-warn">Some feeds show a saved copy</span>}
    </div>
  );

  const feed = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex gap-1" role="tablist" aria-label="Feed">
          {(
            [
              ['all', 'All'],
              ['signals', 'Signals'],
              ['news', 'News'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={feedTab === id} aria-pressed={feedTab === id} className="chip text-[11px]" onClick={() => setFeedTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
          <input className="input h-8 pl-8 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the feed" aria-label="Search the feed" />
        </label>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line/60 overflow-y-auto" data-scroll-panel>
        {feedTab !== 'news' &&
          sigItems.map((e) => (
            <li key={e.id}>
              <button
                className={`block w-full px-3 py-2 text-left hover:bg-ink-900 ${selected?.id === e.id ? 'bg-ink-900' : ''}`}
                onClick={() => {
                                    if (country) closeCountry();
                  focusEvent(e);
                  setMobileTab('details');
                }}
              >
                <div className="flex items-start gap-2">
                  <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SEVERITY_CLS[e.severity]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-platinum">{e.title}</span>
                    <span className="block text-[10px] text-slate-dim">
                      {e.source.name} · {age(e.time, now)} · severity {e.severity}/5
                    </span>
                  </span>
                </div>
              </button>
            </li>
          ))}
        {feedTab !== 'signals' &&
          stories.map((s) => {
            const c = countryIn(s.title);
            const first = s.articles[0];
            return (
              <li key={s.id} className="px-3 py-2">
                <div className="text-xs text-platinum">{s.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-dim">
                  <span className={s.status === 'confirmed' ? 'text-up' : s.status === 'corroborated' ? 'text-info' : 'text-warn'}>{s.status}</span>
                  <span>
                    {s.independent.length} {s.independent.length === 1 ? 'publisher' : 'publishers'} · {age(s.first, now)}
                  </span>
                  {c && (
                    <button className="text-gold hover:underline" onClick={() => openCountry(c.iso3)}>
                      Focus {c.name}
                    </button>
                  )}
                  {first && (
                    <a href={first.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-mist hover:text-gold-soft">
                      source <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        {feedTab !== 'news' && quakeStatus === 'loading' && disasterStatus === 'loading' && <li className="p-3 text-xs text-slate-dim">Loading signals…</li>}
        {feedTab !== 'signals' && news.status === 'loading' && <li className="p-3 text-xs text-slate-dim">Loading news…</li>}
        {feedTab !== 'signals' && news.status === 'error' && <li className="p-3 text-xs text-warn">News is unavailable right now.</li>}
      </ul>
    </div>
  );

  const launcher = (
    <div className="space-y-3 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Briefing</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Briefing period">
          {(Object.keys(WINDOWS) as ReportingWindow[]).map((w) => (
            <button key={w} role="radio" aria-checked={win === w} className="chip text-[11px]" aria-pressed={win === w} onClick={() => setWin(w)}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary justify-center text-xs" onClick={() => void startBriefing('read')} disabled={preparing}>
          <BookOpen className="h-3.5 w-3.5" aria-hidden /> Read Briefing
        </button>
        <button className="btn-ghost justify-center text-xs" onClick={() => void startBriefing('play')} disabled={preparing}>
          <Headphones className="h-3.5 w-3.5" aria-hidden /> {preparing ? 'Preparing voices…' : 'Play AI Briefing'}
        </button>
      </div>
      <button className="btn-ghost w-full justify-center text-xs" onClick={() => startTour(true)} disabled={!signals.length && !storiesNow.length}>
        <Tv className="h-3.5 w-3.5" aria-hidden /> Auto Tour
      </button>
      <p className="text-[10px] leading-relaxed text-slate-dim">
        {WINDOWS[win].label}: about one minute, full screen. EVE presents economy, markets, trade and energy; KNOX security, geopolitics and hazards. Lines are
        built from the sources shown, not generated per viewer. {idle.radar ? 'The tour also starts after a period of inactivity (Account › Idle presentations).' : ''}
      </p>
    </div>
  );

  const summaryPanel = summary && (
    <div className="h-full space-y-3 overflow-y-auto p-4" data-scroll-panel>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">Briefing summary · {WINDOWS[summary.window].label}</span>
        <button className="chip min-h-8 px-2" onClick={() => setSummary(null)} aria-label="Close summary">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {summary.scenes.length === 0 ? (
        <p className="text-sm text-mist">No significant, located developments in this period yet. Try a longer period.</p>
      ) : (
        <ol className="space-y-3">
          {summary.scenes.map((s, i) => (
            <li key={s.id} className="border-b border-line/60 pb-3">
              <div className="text-[10px] text-slate-dim">
                {i + 1}. {s.kind === 'news' ? 'News' : 'Signal'} · {new Date(s.date).toUTCString().replace(/:\d\d GMT$/, ' UTC')}
              </div>
              <h3 className="text-sm font-semibold text-platinum">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-mist">{s.explanation}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
                {s.sources.slice(0, 3).map((src) => (
                  <a key={src.url} href={src.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-gold hover:underline">
                    {src.name} <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[10px] text-slate-dim">Content version {summary.version}. Multiple reports of one event are merged and are not counted as independent confirmation.</p>
    </div>
  );

  const situation = (
    <div className="h-full space-y-4 overflow-y-auto p-4" data-scroll-panel>
      {selected ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="eyebrow">Selected event</span>
            <ProvenanceBadge kind={selected.provenance} />
          </div>
          <h2 className="text-lg font-semibold text-platinum">{selected.title}</h2>
          <p className="text-xs text-slate-dim">
            {new Date(selected.time).toUTCString().replace(' GMT', ' UTC')} · {age(selected.time, now)} · severity {selected.severity}/5 · {selected.region}
          </p>
          {selected.summary && <p className="text-sm leading-relaxed text-mist">{selected.summary}</p>}
          <a href={selected.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">
            {selected.source.name} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      ) : (
        <div>
          <div className="eyebrow">Situation overview</div>
          <h2 className="mt-1 text-lg font-semibold text-platinum">The last 24 hours</h2>
          <p className="mt-1 text-sm text-mist">
            {last24.length} hazard signals from USGS and GDACS{news.status === 'ready' ? ` and ${news.data.stories.length} news stories grouped from ${news.data.articles} headlines` : ''}. Select an
            event or a country on the map, or start a briefing below.
          </p>
        </div>
      )}
      {launcher}
      <nav aria-label="Modules" className="grid grid-cols-2 gap-2 text-xs">
        {[
          ['/countries', 'Countries'],
          ['/markets', 'Markets'],
          ['/lab', 'Quant Research'],
          ['/brain', 'Brain'],
          ['/news', 'News verification'],
          ['/geo', 'Map Explorer'],
          ['/hq', 'HQ'],
        ].map(([to, label]) => (
          <Link key={to} to={to!} className="rounded-md border border-line px-3 py-2 text-mist hover:border-gold-dim hover:text-gold-soft">
            {label}
          </Link>
        ))}
      </nav>
      <p className="text-[10px] text-slate-dim">
        Signals: USGS earthquakes M4.5+ and GDACS disaster alerts; news: GDELT and UN News headlines. Times are when the source published.{' '}
        <Link to="/overview" className="underline hover:text-mist">
          About the platform
        </Link>
      </p>
    </div>
  );

  const mapView = env.gl ? (
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-dim">Loading the globe…</div>}>
      <GeoMap
        ref={map}
        state={mapState}
        today={env.today}
        events={signals}
        values={{}}
        selectedEventId={selected?.id ?? null}
        onView={setCamera}
        onCountry={(iso3) => openCountry(iso3)}
        onEvent={(e) => {
                    if (country) closeCountry();
          setSelected(e);
          setMobileTab('details');
        }}
        onTileError={() => undefined}
      />
    </Suspense>
  ) : (
    <WorldMap events={signals} selectedEventId={selected?.id} onEventClick={(e) => setSelected(e)} onCountryClick={(iso3) => openCountry(iso3)} className="h-full" />
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-4rem)]">
      <div className="border-b border-line px-4 py-2">{strip}</div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {isDesktop && (
          <aside className="w-80 shrink-0 border-r border-line" aria-label="Intelligence feed">
            {feed}
          </aside>
        )}
        <div className="relative h-[55dvh] min-w-0 shrink-0 lg:h-auto lg:flex-1 lg:shrink">
          {mapView}
          <div className="absolute left-2 top-2 z-10 flex gap-1" role="group" aria-label="Map style">
            {STYLES.map(([id, label]) => (
              <button key={id} className="chip bg-ink-950/80 text-[11px]" aria-pressed={prefs.style === id} onClick={() => savePrefs({ style: id })}>
                {label}
              </button>
            ))}
          </div>
          {/* Desktop: dossier or situation panel docked over the right side of the map. */}
          {isDesktop && (
          <section
            className="absolute inset-y-0 right-0 z-20 border-l border-line bg-ink-950/95 backdrop-blur"
            style={{ width: prefs.panelWidth }}
            aria-label={country ? 'Country dossier' : 'Situation'}
          >
            <div
              className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-gold/30"
              onPointerDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
            />
            {country ? <CountryPanel iso3={country} onClose={closeCountry} section={section} onSection={setSection} /> : (summaryPanel ?? situation)}
          </section>
          )}
        </div>
        {/* Below desktop: one panel at a time under the map. */}
        {!isDesktop && (
        <div className="border-t border-line">
          <div className="flex gap-1 p-2" role="tablist" aria-label="Panels">
            {(
              [
                ['details', country ? 'Dossier' : 'Situation'],
                ['feed', 'Feed'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={mobileTab === id} aria-pressed={mobileTab === id} className="chip text-xs" onClick={() => setMobileTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[70dvh] min-h-[40dvh] overflow-hidden">
            {mobileTab === 'feed' ? feed : country ? <CountryPanel iso3={country} onClose={closeCountry} section={section} onSection={setSection} /> : (summaryPanel ?? situation)}
          </div>
        </div>
        )}
      </div>
      {showing && <Presentation key={showing.plan.version + showing.mode} plan={showing.plan} mode={showing.mode} events={signals} narrator={showing.narrator} audioNote={showing.audioNote} fullscreen={showing.fullscreen} onExit={endShow} />}
    </div>
  );
}
