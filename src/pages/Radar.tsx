import { Expand, ExternalLink, Globe2, Map as MapIcon, Moon, Search, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { EventCategory, GeoEvent } from '../../shared/types';
import { AddToBrain } from '../components/AddToBrain';
import { EventTimeline } from '../components/EventTimeline';
import { DemoNotice, ModuleLink, PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { WorldMap, type WorldMapHandle } from '../components/WorldMap';
import type { GeoMapHandle } from '../components/geo/GeoMap';
import { useChoropleths } from '../components/geo/useChoropleths';
import { countryByIso3, searchCountries } from '../lib/countries';
import { CATEGORIES, GEO_LAYERS, LAYER_MAP, formatValue, type ChoroplethLayer } from '../lib/geo/layers';
import { STYLES, type MapState } from '../lib/geo/state';
import { hasWebGL2 } from '../lib/geo/webgl';
import { INSTRUMENT_MAP } from '../data/instruments';
import { CATEGORY_COLOR, CATEGORY_LABEL, REGIONS, regionOf, useEvents } from '../lib/events';
import { fmtDate, plural, relativeTime } from '../lib/format';

const GeoMap = lazy(() => import('../components/geo/GeoMap'));

/** Base styles offered on the Radar globe (all from licensed or public-domain imagery; see the Map Explorer for more). */
const GLOBE_STYLES = ['satellite', 'grayscale', 'dark'] as const;
type GlobeStyle = (typeof GLOBE_STYLES)[number];
/** Overlays: Map Explorer layers that work as a single background layer under the Radar's events. */
const OVERLAYS = GEO_LAYERS.filter((l) => l.kind === 'choropleth' || (l.kind === 'gibs' && l.id !== 'blue-marble'));
const VIEW_KEY = 'av-radar-view';

/** Reads the shareable Radar view from the address (view, style, overlay, night shading, selected country). */
function readUrl() {
  const p = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(VIEW_KEY);
  } catch {
    /* storage unavailable */
  }
  const webgl = hasWebGL2();
  const asked = p.get('view') ?? saved;
  const style = p.get('style') as GlobeStyle | null;
  const overlay = p.get('overlay');
  const country = p.get('k')?.toUpperCase() ?? null;
  return {
    webgl,
    view: (webgl && asked !== '2d' ? '3d' : '2d') as '2d' | '3d',
    style: style && (GLOBE_STYLES as readonly string[]).includes(style) ? style : ('satellite' as GlobeStyle),
    overlay: overlay && OVERLAYS.some((l) => l.id === overlay) ? overlay : '',
    night: p.get('night') === '1',
    country: country && countryByIso3(country) ? country : null,
  };
}

const WINDOWS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: 'All', days: 3650 },
];

export default function Radar() {
  const [initial] = useState(readUrl);
  const [view, setView] = useState<'2d' | '3d'>(initial.view);
  const [globeStyle, setGlobeStyle] = useState<GlobeStyle>(initial.style);
  const [overlay, setOverlay] = useState(initial.overlay);
  const [night, setNight] = useState(initial.night);
  const [country, setCountry] = useState<string | null>(initial.country);
  const [camera, setCamera] = useState<{ center: [number, number]; zoom: number }>({ center: [20, 25], zoom: 1.3 });
  const [query, setQuery] = useState('');
  const [nightAt, setNightAt] = useState(() => Date.now());
  const [env] = useState(() => ({ today: new Date().toISOString().slice(0, 10), year: new Date().getUTCFullYear() - 2 }));
  const globe = useRef<GeoMapHandle>(null);
  const flat = useRef<WorldMapHandle>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const { demo, quakes, quakeStatus, quakeError, reloadQuakes, quakeStale, disasters, disasterStatus, reloadDisasters, disasterStale } = useEvents();
  const [layers, setLayers] = useState({ demo: true, quakes: true, disasters: true });
  const [cats, setCats] = useState<Set<EventCategory>>(new Set(Object.keys(CATEGORY_LABEL) as EventCategory[]));
  const [minSeverity, setMinSeverity] = useState(1);
  const [region, setRegion] = useState('all');
  const [windowDays, setWindowDays] = useState(30);
  const [selected, setSelected] = useState<GeoEvent | null>(null);
  const [now] = useState(() => Date.now());
  const [day, setDay] = useState<string | null>(null);

  const all = useMemo(
    () => [...(layers.demo ? demo : []), ...(layers.quakes ? quakes : []), ...(layers.disasters ? disasters : [])],
    [layers, demo, quakes, disasters],
  );
  const windowed = useMemo(() => {
    return all
      .filter((e) => cats.has(e.category) && e.severity >= minSeverity && now - Date.parse(e.time) <= windowDays * 86_400_000)
      .filter((e) => region === 'all' || regionOf(e.lat, e.lon) === region)
      .sort((a, b) => b.severity - a.severity || Date.parse(b.time) - Date.parse(a.time));
  }, [all, cats, minSeverity, region, windowDays, now]);
  const filtered = useMemo(() => (day ? windowed.filter((e) => e.time.slice(0, 10) === day) : windowed), [windowed, day]);

  // Overlay values for the globe (country statistics), loaded only when a statistics overlay is chosen in 3D.
  const overlayLayer = overlay ? LAYER_MAP.get(overlay) : undefined;
  const statLayers = useMemo(() => (view === '3d' && overlayLayer?.kind === 'choropleth' ? [overlayLayer] : []), [view, overlayLayer]);
  const { values, years } = useChoropleths(statLayers, env.year);
  const mapState: MapState = useMemo(
    () => ({
      mode: '3d',
      style: globeStyle,
      // Radar filters the events itself, so all three event layers stay on; the overlay goes underneath.
      layers: [...(overlay ? [{ id: overlay, opacity: overlayLayer?.kind === 'gibs' ? 0.85 : 0.75 }] : []), { id: 'earthquakes', opacity: 1 }, { id: 'disasters', opacity: 1 }, { id: 'scenarios', opacity: 1 }],
      center: camera.center,
      zoom: camera.zoom,
      date: env.today,
      year: env.year,
      country,
    }),
    [globeStyle, overlay, overlayLayer, camera, env, country],
  );

  // Keep the view shareable and remember the user's 2D/3D choice on this device.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    p.set('view', view);
    if (view === '3d') p.set('style', globeStyle);
    else p.delete('style');
    if (overlay) p.set('overlay', overlay);
    else p.delete('overlay');
    if (night) p.set('night', '1');
    else p.delete('night');
    if (country) p.set('k', country);
    else p.delete('k');
    history.replaceState(history.state, '', `${location.pathname}?${p.toString()}`);
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable */
    }
  }, [view, globeStyle, overlay, night, country]);

  // Night shading follows the clock while it is on.
  useEffect(() => {
    if (!night) return;
    const t = setInterval(() => setNightAt(Date.now()), 5 * 60_000);
    return () => clearInterval(t);
  }, [night]);

  const selectCountry = (iso3: string | null) => {
    setCountry(iso3);
    setSelected(null);
    if (!iso3) return;
    if (view === '3d') globe.current?.focusCountry(iso3);
    else flat.current?.focusCountry(iso3);
  };
  const switchView = (next: '2d' | '3d') => {
    setView(next);
    // Bring the selection into view in the new map once it has mounted.
    setTimeout(() => {
      if (country) (next === '3d' ? globe.current : flat.current)?.focusCountry(country);
      else if (selected && next === '3d') globe.current?.flyTo(selected.lon, selected.lat, 3);
      else if (selected) flat.current?.focus(selected.lat, selected.lon, 3);
    }, next === '3d' ? 900 : 50);
  };
  const selectEvent = (e: GeoEvent) => {
    setSelected(e);
    if (view === '3d') globe.current?.flyTo(e.lon, e.lat, Math.max(camera.zoom, 3));
  };
  const matches = query.trim() ? searchCountries(query, 6) : [];
  const countryRef = country ? countryByIso3(country) : undefined;
  const overlayValue = country && overlayLayer?.kind === 'choropleth' ? values[overlayLayer.id]?.get(country) : undefined;

  const toggleCat = (c: EventCategory) =>
    setCats((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        eyebrow="Global Radar"
        title="World events map"
        actions={
          <>
            <Link className="btn-ghost" to={`/geo?m=3d&s=${globeStyle}&l=${overlay ? `${overlay},` : ''}earthquakes,disasters${country ? `&k=${country}` : ''}`}>
              All layers in Map Explorer
            </Link>
            <Link className="btn-ghost" to="/briefing">
              Guided briefing
            </Link>
          </>
        }
      >
        Filter events by type, severity, region and date on a 3D globe or a flat map. Click a marker for details, or a country for its dossier and
        briefing. Imagery is periodically updated satellite composites, not live observation.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="min-w-0 space-y-4">
          <Panel title="Layers">
            <div className="space-y-3 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[#c9a35a]" checked={layers.quakes} onChange={(e) => setLayers((l) => ({ ...l, quakes: e.target.checked }))} />
                <span>
                  Earthquakes M4.5+, past 7 days <ProvenanceBadge kind="confirmed" className="ml-1" />
                  <span className="block text-xs text-slate-dim">
                    USGS ·{' '}
                    {quakeStatus === 'loading' ? 'loading…' : quakeStatus === 'error' ? 'unavailable' : plural(quakes.length, 'event')}
                  </span>
                  {quakeStale && <StaleNote stale={quakeStale} />}
                  {quakeError && (
                    <button className="min-h-6 text-xs text-gold hover:underline" onClick={reloadQuakes}>
                      Retry feed
                    </button>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[#c9a35a]" checked={layers.disasters} onChange={(e) => setLayers((l) => ({ ...l, disasters: e.target.checked }))} />
                <span>
                  Disaster alerts <ProvenanceBadge kind="estimate" className="ml-1" />
                  <span className="block text-xs text-slate-dim">
                    GDACS · cyclones, floods, volcanoes, droughts, wildfires ·{' '}
                    {disasterStatus === 'loading' ? 'loading…' : disasterStatus === 'error' ? 'unavailable' : plural(disasters.length, 'alert')}
                  </span>
                  {disasterStale && <StaleNote stale={disasterStale} />}
                  {disasterStatus === 'error' && (
                    <button className="min-h-6 text-xs text-gold hover:underline" onClick={reloadDisasters}>
                      Retry feed
                    </button>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[#c9a35a]" checked={layers.demo} onChange={(e) => setLayers((l) => ({ ...l, demo: e.target.checked }))} />
                <span>
                  Geopolitical scenarios <ProvenanceBadge kind="simulated" className="ml-1" />
                  <span className="block text-xs text-slate-dim">Simulated events ({demo.length})</span>
                </span>
              </label>
              <p className="border-t border-line pt-3 text-xs text-slate-dim">Planned: GDELT, UCDP, ReliefWeb, licensed ADS-B / AIS.</p>
            </div>
          </Panel>

          <Panel title="Filters">
            <div className="space-y-4">
              <div>
                <span className="label">Event type</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CATEGORY_LABEL) as EventCategory[]).map((c) => (
                    <button key={c} className="chip" aria-pressed={cats.has(c)} onClick={() => toggleCat(c)}>
                      <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLOR[c] }} />
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="sev">
                  Minimum severity: <span className="text-platinum">{minSeverity}</span>
                </label>
                <input id="sev" type="range" min={1} max={5} value={minSeverity} onChange={(e) => setMinSeverity(+e.target.value)} className="w-full accent-[#c9a35a]" />
              </div>
              <div>
                <label className="label" htmlFor="region">
                  Region
                </label>
                <select id="region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="all">All regions</option>
                  {REGIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Time window</span>
                <div className="flex gap-1.5">
                  {WINDOWS.map((w) => (
                    <button
                      key={w.label}
                      className="chip"
                      aria-pressed={windowDays === w.days}
                      onClick={() => {
                        setWindowDays(w.days);
                        setDay(null);
                      }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-4">
          <DemoNotice>
            Geopolitical markers (dashed outline) are <strong>simulated scenarios</strong> that demonstrate the interface. They are
            not real events and contain no casualty figures. Earthquakes (U.S. Geological Survey) and disaster alerts (GDACS, modelled
            impact estimates) are live public data.
          </DemoNotice>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Map view">
              <button className="chip border-0" aria-pressed={view === '2d'} onClick={() => switchView('2d')}>
                <MapIcon className="h-3.5 w-3.5" /> 2D Map
              </button>
              <button
                className="chip border-0"
                aria-pressed={view === '3d'}
                disabled={!initial.webgl}
                title={initial.webgl ? undefined : 'This device or browser does not support WebGL 2, which the globe needs.'}
                onClick={() => switchView('3d')}
              >
                <Globe2 className="h-3.5 w-3.5" /> 3D Globe
              </button>
            </div>
            {view === '3d' && (
              <>
                <select className="input h-9 w-auto" value={globeStyle} onChange={(e) => setGlobeStyle(e.target.value as GlobeStyle)} aria-label="Globe style">
                  {GLOBE_STYLES.map((id) => (
                    <option key={id} value={id}>
                      {STYLES[id].label}
                    </option>
                  ))}
                </select>
                <select className="input h-9 w-auto max-w-[16rem]" value={overlay} onChange={(e) => setOverlay(e.target.value)} aria-label="Information layer">
                  <option value="">No information layer</option>
                  {CATEGORIES.map((c) => {
                    const items = OVERLAYS.filter((l) => l.category === c);
                    return items.length ? (
                      <optgroup key={c} label={c}>
                        {items.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
                <button className="chip" aria-pressed={night} onClick={() => setNight((n) => !n)} title="Shade the night side of the Earth for the current time">
                  <Moon className="h-3.5 w-3.5" /> Day and night
                </button>
              </>
            )}
            <div className="relative ml-auto min-w-0 flex-1 sm:max-w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" />
              <input
                className="input h-9 pl-8"
                placeholder="Find a country"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches[0]) {
                    selectCountry(matches[0].iso3);
                    setQuery('');
                  }
                }}
                aria-label="Find a country"
              />
              {matches.length > 0 && (
                <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-line bg-ink-900 text-sm shadow-xl" role="listbox" aria-label="Countries">
                  {matches.map((m) => (
                    <li key={m.iso3}>
                      <button
                        className="block min-h-8 w-full px-3 py-1.5 text-left hover:bg-ink-800"
                        role="option"
                        aria-selected={false}
                        onClick={() => {
                          selectCountry(m.iso3);
                          setQuery('');
                        }}
                      >
                        {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              className="btn-ghost h-9 text-xs"
              onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void frame.current?.requestFullscreen?.())}
              aria-label="Full screen"
            >
              <Expand className="h-3.5 w-3.5" />
            </button>
          </div>
          <div ref={frame} className="relative bg-ink-950">
            {view === '3d' ? (
              <div className={`w-full border border-line ${fullscreen ? 'h-screen' : 'aspect-[96/50] min-h-[380px]'}`}>
                <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-dim">Loading the globe…</div>}>
                  <GeoMap
                    ref={globe}
                    state={mapState}
                    today={env.today}
                    events={filtered}
                    values={values}
                    nightAt={night ? nightAt : null}
                    selectedEventId={selected?.id ?? null}
                    onView={setCamera}
                    onCountry={(iso3) => {
                      setCountry(iso3);
                      setSelected(null);
                    }}
                    onEvent={(e) => {
                      setSelected(e);
                      setCountry(null);
                    }}
                    onTileError={() => undefined}
                  />
                </Suspense>
              </div>
            ) : (
              <WorldMap
                ref={flat}
                events={filtered}
                selectedEventId={selected?.id}
                highlightIso3={country ? [country] : []}
                onEventClick={(e) => {
                  setSelected(e);
                  setCountry(null);
                }}
                onCountryClick={(iso3) => {
                  setCountry(iso3);
                  setSelected(null);
                }}
                className="aspect-[96/50] w-full border border-line"
              />
            )}
            {selected && <EventDrawer event={selected} onClose={() => setSelected(null)} />}
            {!selected && country && (
              <CountryCard
                iso3={country}
                name={countryRef?.name ?? country}
                overlay={overlayLayer?.kind === 'choropleth' ? { layer: overlayLayer, value: overlayValue, year: years[overlayLayer.id]?.get(country) ?? (overlayLayer.latest ? undefined : env.year) } : null}
                onClose={() => setCountry(null)}
              />
            )}
          </div>
          <p className="text-[11px] text-slate-dim">
            {view === '3d'
              ? `Globe imagery: ${STYLES[globeStyle].description}${overlayLayer && overlayLayer.kind !== 'planned' ? ` Layer: ${overlayLayer.name} (${overlayLayer.provider}).` : ''}${night ? ' Night shading is computed from the sun\'s position now.' : ''}`
              : 'Flat map (Natural Earth projection). Drag to move, scroll or pinch to zoom.'}
          </p>

          <Panel title="Timeline" eyebrow="Historical view">
            <EventTimeline events={windowed} days={Math.min(windowDays, 60)} now={now} selectedDay={day} onSelectDay={setDay} />
          </Panel>

          <Panel title={`Events (${filtered.length})`} bodyClass="max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-slate-dim">No events match the current filters.</p>
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <button
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-ink-800/60 ${selected?.id === e.id ? 'bg-ink-800/60' : ''}`}
                      onClick={() => selectEvent(e)}
                    >
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-platinum">{e.title}</span>
                        <span className="text-xs text-slate-dim">
                          {CATEGORY_LABEL[e.category]} · {e.region} · {relativeTime(e.time)}
                        </span>
                      </span>
                      <span className="num shrink-0 text-xs text-mist">S{e.severity}</span>
                      <ProvenanceBadge kind={e.provenance} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function EventDrawer({ event: e, onClose }: { event: GeoEvent; onClose: () => void }) {
  const external = e.source.url.startsWith('http');
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 max-h-[85%] overflow-y-auto rounded-lg border border-line bg-ink-900/97 p-4 shadow-2xl sm:inset-x-auto sm:left-2 sm:top-2 sm:bottom-auto sm:w-96">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge kind={e.provenance} />
          <span className="text-xs" style={{ color: CATEGORY_COLOR[e.category] }}>
            {CATEGORY_LABEL[e.category]}
          </span>
          <span className="text-xs text-mist">Severity {e.severity}/5</span>
        </div>
        <button className="btn-quiet -mr-2 -mt-1" aria-label="Close details" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug">{e.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-mist">{e.summary}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-dim">Time</dt>
        <dd>{fmtDate(e.time)} ({relativeTime(e.time)})</dd>
        <dt className="text-slate-dim">Location</dt>
        <dd className="num">
          {e.region} · {e.lat.toFixed(2)}, {e.lon.toFixed(2)}
        </dd>
        <dt className="text-slate-dim">Source</dt>
        <dd>
          {external ? (
            <a className="inline-flex items-center gap-1 text-gold hover:underline" href={e.source.url} target="_blank" rel="noreferrer">
              {e.source.name} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <Link className="text-gold hover:underline" to={e.source.url}>
              {e.source.name}
            </Link>
          )}
        </dd>
      </dl>
      <AddToBrain
        className="mt-3"
        event={e}
        entity={{
          kind: e.provenance === 'simulated' ? 'scenario' : 'event',
          label: e.title,
          date: e.time.slice(0, 10),
          notes: `${e.provenance === 'simulated' ? 'Simulated scenario. Not a real event. ' : ''}${e.summary}`.slice(0, 5000),
          ref: { type: 'event', id: e.id },
          sources: e.source.url.startsWith('http') ? [{ title: e.source.name, url: e.source.url, date: e.time.slice(0, 10) }] : [],
        }}
      />
      {e.provenance !== 'simulated' && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ModuleLink to={`/lab/forecasts?event=${encodeURIComponent(e.id)}&q=${encodeURIComponent(`Will ${e.title} …`)}`}>Make a forecast</ModuleLink>
          <ModuleLink to={`/impact?event=${encodeURIComponent(e.id)}`}>Commodity exposure</ModuleLink>
        </div>
      )}
      {e.marketLinks && e.marketLinks.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="eyebrow mb-1">Potential market exposure</div>
          <p className="mb-2 text-[11px] text-slate-dim">
            A research hypothesis, not a forecast.{' '}
            <Link to="/impact" className="text-gold hover:underline">
              How these links work
            </Link>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {e.marketLinks.map((s) => (
              <Link key={s} className="chip" to={`/markets?symbol=${encodeURIComponent(s)}`}>
                {INSTRUMENT_MAP.get(s)?.name ?? s}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StaleNote({ stale }: { stale: { since: string | null; reason: string } }) {
  return (
    <span className="block text-xs text-warn" role="status">
      Source not responding. Showing the last saved copy{stale.since ? ` from ${stale.since.slice(0, 16).replace('T', ' ')} UTC` : ''}.
    </span>
  );
}

function CountryCard({ iso3, name, overlay, onClose }: { iso3: string; name: string; overlay: { layer: ChoroplethLayer; value: number | undefined; year: number | undefined } | null; onClose: () => void }) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 rounded-lg border border-line bg-ink-900/97 p-4 shadow-2xl sm:inset-x-auto sm:left-2 sm:top-2 sm:bottom-auto sm:w-80">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="eyebrow">Country</div>
          <h3 className="text-base font-semibold">{name}</h3>
        </div>
        <button className="btn-quiet -mr-2 -mt-1" aria-label="Close country details" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {overlay && (
        <p className="mt-2 text-sm">
          <span className="text-mist">{overlay.layer.name}: </span>
          <span className="num text-platinum">{overlay.value === undefined ? 'No data' : formatValue(overlay.value, overlay.layer.format)}</span>
          {overlay.year !== undefined && overlay.value !== undefined && <span className="text-slate-dim"> ({overlay.year})</span>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link className="btn-primary h-8 text-xs" to={`/countries/${iso3}`}>
          Country dossier
        </Link>
        <Link className="btn-ghost h-8 text-xs" to="/briefing">
          World Briefing
        </Link>
        <Link className="btn-ghost h-8 text-xs" to={`/currency?c=${iso3}`}>
          Currency
        </Link>
      </div>
    </div>
  );
}
