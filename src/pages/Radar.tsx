import { BookOpen, ExternalLink, Headphones, Search, Tv, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Story } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';
import type { GeoMapHandle } from '../components/geo/GeoMap';
import { formatLngLat } from '../lib/geo/coords';
import { CountryPanel, type DossierSection } from '../components/hq/CountryPanel';
import { Presentation, type ExitReason, type PresentationMode } from '../components/presentation/Presentation';
import { SaveButton } from '../components/SaveButton';
import { ProvenanceBadge } from '../components/ui';
import { WorldMap } from '../components/WorldMap';
import { getJson, useApi } from '../lib/api';
import { countriesInText, countryByIso3, countryByName } from '../lib/countries';
import { countryNameOf } from '../lib/worldBriefing';
import { useEvents } from '../lib/events';
import { LayerPanel } from '../components/geo/LayerPanel';
import { useChoropleths } from '../components/geo/useChoropleths';
import { LAYER_MAP, type ChoroplethLayer } from '../lib/geo/layers';
import { MAX_LAYERS, type LayerState, type MapState, type MapStyleId } from '../lib/geo/state';
import { useAuth } from '../auth/AuthProvider';
import { ANALYSTS, SPEAKER_COLOR, WINDOWS, buildPlan, buildTour, type Plan, type ReportingWindow } from '../lib/briefingPlan';
import { age } from '../lib/radarLabels';
import { audioNarrator, browserNarrator, clipKey, prepareClips, unlockAudio, VoiceError, type Narrator } from '../lib/narration';
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
  layers: LayerState[];
}
/** Radar shows real hazard signals by default; more layers come from the Layers panel (simulated scenarios excluded). */
const DEFAULT_LAYERS: LayerState[] = [
  { id: 'earthquakes', opacity: 1 },
  { id: 'disasters', opacity: 1 },
];
const RADAR_EXCLUDE = ['scenarios'];
const DEFAULT_PREFS: Prefs = { style: 'grayscale', panelWidth: 460, layers: DEFAULT_LAYERS };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<Prefs>;
    return {
      style: STYLES.find(([s]) => s === raw.style)?.[0] ?? DEFAULT_PREFS.style,
      panelWidth: typeof raw.panelWidth === 'number' ? Math.min(760, Math.max(360, raw.panelWidth)) : DEFAULT_PREFS.panelWidth,
      layers: Array.isArray(raw.layers)
        ? raw.layers.filter((l): l is LayerState => !!l && typeof l.id === 'string' && LAYER_MAP.has(l.id) && !RADAR_EXCLUDE.includes(l.id)).slice(0, MAX_LAYERS)
        : DEFAULT_LAYERS,
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
const countryIn = (text: string) => countriesInText(text)[0];

/** Country (ISO3) an event is located in, from the source's place name; null at sea or when unknown. */
const eventIso3 = (e: GeoEvent) => countryByName(countryNameOf(e))?.iso3 ?? null;

function EventDetail({ event, now }: { event: GeoEvent; now: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Selected event</span>
        <ProvenanceBadge kind={event.provenance} />
      </div>
      <h2 className="text-lg font-semibold text-platinum">{event.title}</h2>
      <p className="text-xs text-slate-dim">
        {new Date(event.time).toUTCString().replace(' GMT', ' UTC')} · {age(event.time, now)} · severity {event.severity}/5 · {event.region}
      </p>
      <p className="num text-[11px] text-slate-dim">{formatLngLat(event.lon, event.lat)}</p>
      {event.summary && <p className="text-sm leading-relaxed text-mist">{event.summary}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <a href={event.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">
          {event.source.name} <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <SaveButton kind="event" title={event.title} url={event.source.url} meta={{ time: event.time, lat: event.lat, lon: event.lon }} />
      </div>
    </div>
  );
}

/** Current time for event handlers (kept out of render). */
const wallClock = () => Date.now();

/** Prepared natural-voice audio per briefing content version, so replays in this tab cost nothing. */
const AUDIO_CACHE = new Map<string, Map<string, Promise<string>>>();

/** A published Operations Briefing edition (worker/editions.ts). */
interface Edition {
  edition_date: string;
  revision: number;
  coverage_start: string;
  coverage_end: string;
  published_at: string;
  plan: Plan;
  audio: { key: string; url: string }[];
}
/** Timestamp in the viewer's own time zone. */
const fmtLocal = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Showing {
  mode: PresentationMode;
  plan: Plan;
  fullscreen: boolean;
  narrator: Narrator | null;
  audioNote: string | null;
  subtitle: string;
}

/**
 * Global Radar, the arrival view. Left: sourced signals and news; centre: the globe; right: the situation overview
 * with the briefing launcher, the selected event or an integrated country dossier. Briefings and Comfort Mode run as
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
  const [showing, setShowing] = useState<Showing | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [summary, setSummary] = useState<{ plan: Plan; mode: 'read' | 'play' } | null>(null);
  const { session } = useAuth();
  const idle = normalizeIdle(usePrefs((s) => s.idle));
  const status = useApi<{ latest: { edition_date: string; published_at: string } | null }>('/api/briefing/status');
  const latest = status.status === 'ready' ? status.data.latest : null;
  const archiveRes = useApi<{ editions: { date: string; revision: number; stories: string[] }[] }>('/api/briefing/archive');
  const archive = archiveRes.status === 'ready' ? archiveRes.data.editions : [];

  const { quakes, disasters, quakeStale, disasterStale, quakeStatus, disasterStatus } = useEvents();
  const news = useApi<{ stories: Story[]; articles: number; fetchedAt: string; partial?: string }>('/api/news?t=24h');
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
  // The selected country's own developments: located signals and grouped news naming it.
  const countryEvents = useMemo(() => (country ? signals.filter((e) => eventIso3(e) === country) : []), [signals, country]);
  const countryStories = useMemo(
    () => (country && news.status === 'ready' ? news.data.stories.filter((st) => countriesInText(st.title).some((c) => c.iso3 === country)) : []),
    [news, country],
  );
  const focusEvent = useCallback((e: GeoEvent) => {
    setSelected(e);
    map.current?.flyTo(e.lon, e.lat, 3.6);
  }, []);

  // Briefings and the tour: the plan is built once when they start and stays frozen while they run.
  const countryOf = useCallback((text: string) => countryIn(text)?.iso3 ?? null, []);
  const storiesNow = useMemo(() => (news.status === 'ready' ? news.data.stories : []), [news]);
  /** Situation Report: the chosen period, from what the feeds show now (news for longer periods is fetched on demand). */
  const startWritten = async (w: ReportingWindow) => {
    let stories = storiesNow;
    if (w !== '24h') {
      setPreparing(true);
      stories = await getJson<{ stories: Story[] }>(`/api/news?t=${w}`).then((r) => r.stories, () => storiesNow);
      setPreparing(false);
    }
    const plan = buildPlan({ window: w, now: wallClock(), events: signals, stories, countryOf, mode: 'read' });
    if (!plan.scenes.length) {
      setSummary({ plan, mode: 'read' });
      return;
    }
    setShowing({ mode: 'read', plan, fullscreen: true, narrator: null, audioNote: null, subtitle: WINDOWS[w].label });
  };
  /**
   * Operations Briefing: the latest shared edition (or an archived one), played from its stored audio with no new
   * synthesis. Before the first edition is published, a clearly labelled live preview is built from the current feeds.
   */
  const startVoiced = async (date?: string) => {
    // Must run synchronously inside the click: later playback (after loading) is then not blocked as autoplay.
    const el = unlockAudio();
    setPreparing(true);
    const r = await getJson<{ edition: Edition | null }>(date ? `/api/briefing/edition/${date}` : '/api/briefing/latest').catch(() => ({ edition: null }));
    const ed = r.edition;
    if (ed && el) {
      setPreparing(false);
      const clips = new Map(ed.audio.map((a) => [a.key, Promise.resolve(a.url)]));
      const cover = `${fmtLocal(ed.coverage_start)} to ${fmtLocal(ed.coverage_end)}`;
      setShowing({ mode: 'play', plan: ed.plan, fullscreen: true, narrator: audioNarrator(el, clips), audioNote: null, subtitle: `Edition ${ed.edition_date}${ed.revision > 1 ? ` (revision ${ed.revision})` : ''} · covers ${cover}` });
      return;
    }
    const until = wallClock();
    const plan = buildPlan({ window: '24h', now: until, until, events: signals, stories: storiesNow, countryOf, mode: 'play', introText: 'Aurora Operations Briefing, live preview of the past twenty-four hours.' });
    if (!plan.scenes.length) {
      setPreparing(false);
      setSummary({ plan, mode: 'play' });
      return;
    }
    // Live preview (no shared edition yet): natural voices for signed-in users, cached per line; otherwise the browser.
    let narrator: Narrator | null = null;
    let audioNote: string | null = 'Live preview: today\'s shared edition is not published yet.';
    const lines = [plan.intro, ...plan.scenes.flatMap((s) => s.lines), plan.outro];
    if (session && el) {
      const clips = AUDIO_CACHE.get(plan.version) ?? prepareClips(lines, session.access_token);
      AUDIO_CACHE.set(plan.version, clips);
      try {
        await clips.get(clipKey(plan.intro));
        narrator = audioNarrator(el, clips);
      } catch (err) {
        AUDIO_CACHE.delete(plan.version);
        const code = err instanceof VoiceError ? ` [${err.code}]` : '';
        audioNote = `Natural voice unavailable: ${err instanceof Error ? err.message : 'error'}${code} Using the browser voice.`;
      }
    } else if (!session) audioNote += ' Browser voice; sign in for the presenter voices.';
    setPreparing(false);
    if (!narrator) {
      narrator = browserNarrator();
      if (!narrator) audioNote = 'This browser cannot speak text aloud, so the briefing runs with captions only.';
    }
    setShowing({ mode: 'play', plan, fullscreen: true, narrator, audioNote, subtitle: 'Live preview · past 24 hours' });
  };
  const startTour = useCallback(
    (fullscreen: boolean) => {
      const plan = buildTour({ now: Date.now(), events: signals, stories: storiesNow, countryOf });
      if (plan.scenes.length) setShowing({ mode: 'tour', plan, fullscreen, narrator: null, audioNote: null, subtitle: 'Comfort Mode' });
    },
    [signals, storiesNow, countryOf],
  );
  const endShow = (reason: ExitReason) => {
    if (showing && reason === 'done' && showing.mode !== 'tour') setSummary({ plan: showing.plan, mode: showing.mode });
    setShowing(null);
  };
  // Comfort Mode: after a period of inactivity (profile switch), a passive tour; never while presenting or preparing.
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
    requestAnimationFrame(() => map.current?.focusCountry(iso3, 40));
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
  /** Event inside the open country: keep the country context. Elsewhere: leave the country first. */
  const selectEvent = (e: GeoEvent) => {
    if (country && eventIso3(e) !== country) closeCountry();
    focusEvent(e);
    setMobileTab('details');
  };
  const backToCountry = useCallback(() => {
    setSelected(null);
    if (country) map.current?.focusCountry(country, 40);
  }, [country]);
  // A shared link with ?k= opens the dossier: frame that country once the (lazily loaded) map is ready.
  useEffect(() => {
    if (!country || framed.current === country) return;
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (map.current?.focusCountry(country, 40) || tries > 40) {
        framed.current = country;
        clearInterval(t);
      }
    }, 250);
    return () => clearInterval(t);
  }, [country]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !country || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (selected) backToCountry();
      else closeCountry();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [country, closeCountry, selected, backToCountry]);

  const mapState: MapState = useMemo(
    () => ({
      mode: '3d',
      style: prefs.style,
      layers: prefs.layers,
      center: camera.center,
      zoom: camera.zoom,
      date: env.today,
      year: env.year,
      country,
    }),
    [prefs.style, prefs.layers, camera, env, country],
  );
  // Country statistics layers chosen in the Layers panel.
  const choroLayers = useMemo(
    () => prefs.layers.map((l) => LAYER_MAP.get(l.id)).filter((l): l is ChoroplethLayer => l?.kind === 'choropleth'),
    [prefs.layers],
  );
  const { values: choroValues } = useChoropleths(choroLayers, env.year);

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
                onClick={() => selectEvent(e)}
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
                  {first && <SaveButton kind="story" title={s.title} url={first.url} className="tap inline-flex items-center gap-0.5 text-mist hover:text-gold-soft" label={false} />}
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
      <div>
        <div className="eyebrow mb-1.5">Situation Report</div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Situation Report period">
          {(Object.keys(WINDOWS) as ReportingWindow[]).map((w) => (
            <button key={w} className="btn-ghost justify-center px-2 text-xs" onClick={() => void startWritten(w)} disabled={preparing} aria-label={`Situation Report: ${WINDOWS[w].label.toLowerCase()}`}>
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> {w === '24h' ? '24 hours' : w === '3d' ? '3 days' : '7 days'}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-dim">Written, updated as validated information arrives.</p>
      </div>
      <div className="border-t border-line pt-3">
        <div className="eyebrow mb-1.5">Operations Briefing</div>
        <button className="btn-primary w-full justify-center text-xs" onClick={() => void startVoiced()} disabled={preparing}>
          <Headphones className="h-3.5 w-3.5" aria-hidden /> {preparing ? 'Loading…' : 'Play Operations Briefing'}
        </button>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-dim">
          {latest
            ? `Latest edition ${latest.edition_date}, published ${fmtLocal(latest.published_at)}. One shared edition a day, about two minutes.`
            : 'One shared edition a day, about two minutes. No edition is published yet; the button plays a live preview.'}
        </p>
        {archive.length > 1 && (
          <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-dim">
            Archive
            <select className="input h-8 py-0 text-xs" defaultValue="" onChange={(e) => e.target.value && void startVoiced(e.target.value)} aria-label="Play an archived edition">
              <option value="">Choose a date…</option>
              {archive.map((a) => (
                <option key={`${a.date}-${a.revision}`} value={a.date}>
                  {a.date} · {a.stories.length} {a.stories.length === 1 ? 'story' : 'stories'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <button className="btn-ghost w-full justify-center text-xs" onClick={() => startTour(true)} disabled={!signals.length && !storiesNow.length}>
        <Tv className="h-3.5 w-3.5" aria-hidden /> Comfort Mode
      </button>
      {idle.radar && <p className="text-[10px] text-slate-dim">Comfort Mode also starts after five minutes without activity (switch in Account or HQ).</p>}
    </div>
  );

  const summaryPanel = summary && (
    <div className="h-full space-y-3 overflow-y-auto p-4" data-scroll-panel>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">Briefing summary · {WINDOWS[summary.plan.window].label}</span>
        <span className="flex-1" />
        {summary.plan.scenes.length > 0 && (
          <SaveButton
            kind="briefing"
            title={`Briefing, ${WINDOWS[summary.plan.window].label.toLowerCase()}, ${new Date().toUTCString().slice(5, 16)}`}
            href={`/#briefing-${summary.plan.version}`}
            meta={{ version: summary.plan.version, stories: summary.plan.scenes.map((s) => s.title).slice(0, 8) }}
          />
        )}
        <button className="chip min-h-8 px-2" onClick={() => setSummary(null)} aria-label="Close summary">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {summary.plan.scenes.length === 0 ? (
        <p className="text-sm text-mist">No significant, located developments in this period yet. Try a longer period.</p>
      ) : (
        <ol className="space-y-3">
          {summary.plan.scenes.map((s, i) => (
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
      {summary.mode === 'play' && summary.plan.scenes.length > 0 && (
        <details className="rounded-md border border-line p-3 text-xs">
          <summary className="cursor-pointer text-gold">Full transcript</summary>
          <p className="mt-2 text-mist">
            <span style={{ color: SPEAKER_COLOR.lead }}>{ANALYSTS.lead.name}:</span> {summary.plan.intro.text}
          </p>
          {summary.plan.scenes.flatMap((sc) =>
            sc.lines.map((l, j) => (
              <p key={`${sc.id}-${j}`} className="mt-1 text-mist">
                <span style={{ color: SPEAKER_COLOR[l.speaker] }}>{ANALYSTS[l.speaker].name}:</span> {l.text}
              </p>
            )),
          )}
        </details>
      )}
      <p className="text-[10px] text-slate-dim">Content version {summary.plan.version}. Multiple reports of one event are merged and are not counted as independent confirmation.</p>
    </div>
  );

  const countryName = country ? (countryByIso3(country)?.name ?? country) : '';
  const countryView = !country ? null : selected ? (
    <div className="h-full overflow-y-auto p-4" data-scroll-panel>
      <button className="chip mb-3 text-[11px]" onClick={backToCountry}>
        ← Back to {countryName}
      </button>
      <EventDetail event={selected} now={now} />
    </div>
  ) : (
    <CountryPanel
      iso3={country}
      onClose={closeCountry}
      section={section}
      onSection={setSection}
      developments={{ events: countryEvents, stories: countryStories, now, onEvent: selectEvent }}
    />
  );

  const situation = (
    <div className="h-full space-y-4 overflow-y-auto p-4" data-scroll-panel>
      {selected ? (
        <EventDetail event={selected} now={now} />
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
        values={choroValues}
        selectedEventId={selected?.id ?? null}
        onView={setCamera}
        onCountry={(iso3) => openCountry(iso3)}
        onEvent={selectEvent}
        onTileError={() => undefined}
        padding={{ top: 0, right: panelPx, bottom: 0, left: 0 }}
        coordinates
      />
    </Suspense>
  ) : (
    <WorldMap events={signals} selectedEventId={selected?.id} onEventClick={selectEvent} onCountryClick={(iso3) => openCountry(iso3)} className="h-full" />
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-4rem)]">
      <h1 className="sr-only">Global Radar</h1>
      <div className="border-b border-line px-4 py-2">{strip}</div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {isDesktop && (
          <aside className="w-80 shrink-0 border-r border-line" aria-label="Intelligence feed">
            {feed}
          </aside>
        )}
        <div className="relative h-[55dvh] min-w-0 shrink-0 lg:h-auto lg:flex-1 lg:shrink">
          {mapView}
          <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
            <LayerPanel active={prefs.layers} onChange={(layers) => savePrefs({ layers })} defaults={DEFAULT_LAYERS} exclude={RADAR_EXCLUDE} />
            <div className="flex gap-1" role="group" aria-label="Map style">
            {STYLES.map(([id, label]) => (
              <button key={id} className="chip bg-ink-950/80 text-[11px]" aria-pressed={prefs.style === id} onClick={() => savePrefs({ style: id })}>
                {label}
              </button>
            ))}
            </div>
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
            {countryView ?? summaryPanel ?? situation}
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
            {mobileTab === 'feed' ? feed : (countryView ?? summaryPanel ?? situation)}
          </div>
        </div>
        )}
      </div>
      {showing && (
        <Presentation
          key={showing.plan.version + showing.mode}
          plan={showing.plan}
          mode={showing.mode}
          events={signals}
          narrator={showing.narrator}
          audioNote={showing.audioNote}
          fullscreen={showing.fullscreen}
          subtitle={showing.subtitle}
          onExit={endShow}
        />
      )}
    </div>
  );
}
