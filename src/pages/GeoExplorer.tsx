import { Bookmark, Camera, ChevronLeft, ChevronRight, Expand, ExternalLink, Globe2, Layers, Link2, Map as MapIcon, Pause, Play, Search, Star, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { GeoEvent } from '../../shared/types';
import { AddToBrain } from '../components/AddToBrain';
import type { GeoMapHandle } from '../components/geo/GeoMap';
import { AppLoading, PageHeader, Panel } from '../components/ui';
import { WorldMap } from '../components/WorldMap';
import { countryByIso3, searchCountries } from '../lib/countries';
import { CATEGORY_LABEL, useEvents } from '../lib/events';
import { relativeTime } from '../lib/format';
import { CATEGORIES, COMBINATIONS, DATA_NATURE, GEO_LAYERS, LAYER_MAP, choroplethLegend, effectiveDate, formatValue, isActive, type ActiveLayer, type ChoroplethLayer, type GeoLayer } from '../lib/geo/layers';
import { MAX_LAYERS, STYLES, decodeState, defaultState, encodeState, shiftDate, toggleLayer, type MapState, type MapStyleId } from '../lib/geo/state';
import { hasWebGL2 } from '../lib/geo/webgl';
import { STATUS, statusOf } from '../lib/worldBriefing';
import { useChoropleths } from '../components/geo/useChoropleths';

const GeoMap = lazy(() => import('../components/geo/GeoMap'));

const SAVED_KEY = 'av-geo-saved';
const FAV_KEY = 'av-geo-favourites';
const readJson = <T,>(k: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

type Saved = { name: string; query: string };
export default function GeoExplorer() {
  const [env] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const thisYear = new Date().getUTCFullYear();
    return { today, yesterday, minYear: 1990, maxYear: thisYear - 1, defaultYear: thisYear - 2, webgl: hasWebGL2() };
  });
  const [state, setState] = useState<MapState>(() => decodeState(location.search, defaultState(env.yesterday, env.defaultYear), { today: env.yesterday, minYear: env.minYear, maxYear: env.maxYear }));
  const [favourites, setFavourites] = useState<string[]>(() => readJson(FAV_KEY, []));
  const [saved, setSaved] = useState<Saved[]>(() => readJson(SAVED_KEY, []));
  const [layerQuery, setLayerQuery] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [event, setEvent] = useState<GeoEvent | null>(null);
  const [countryName, setCountryName] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const map = useRef<GeoMapHandle>(null);
  const frame = useRef<HTMLDivElement>(null);
  const { demo, quakes, disasters, quakeStatus, disasterStatus } = useEvents();
  const events = useMemo(() => [...quakes, ...disasters, ...demo], [quakes, disasters, demo]);

  const active = state.layers.map((l) => LAYER_MAP.get(l.id)).filter((l): l is ActiveLayer => !!l && isActive(l));
  const choropleths = active.filter((l): l is ChoroplethLayer => l.kind === 'choropleth');
  const { values, years, spans, counts, errors, loading } = useChoropleths(choropleths, state.year);
  const hasDaily = active.some((l) => l.kind === 'gibs' && l.gibs.time === 'daily');
  const update = (patch: Partial<MapState>) => setState((s) => ({ ...s, ...patch }));

  // Keep the address bar shareable (no history entries per pan).
  useEffect(() => {
    history.replaceState(history.state, '', `${location.pathname}${encodeState(state)}`);
  }, [state]);

  // Time animation: step through the last seven days of daily satellite layers.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setState((s) => {
        const next = shiftDate(s.date, 1);
        return { ...s, date: next > env.yesterday ? shiftDate(env.yesterday, -6) : next };
      });
    }, 1600);
    return () => clearInterval(t);
  }, [playing, env.yesterday]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 2600);
  };
  const toggle = (id: string) => {
    if (!state.layers.some((l) => l.id === id) && state.layers.length >= MAX_LAYERS) {
      flash(`Up to ${MAX_LAYERS} layers can be combined. Remove one first.`);
      return;
    }
    setState((s) => toggleLayer(s, id));
  };
  const favourite = (id: string) => {
    const next = favourites.includes(id) ? favourites.filter((x) => x !== id) : [...favourites, id];
    setFavourites(next);
    writeJson(FAV_KEY, next);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      flash('Link copied. It opens this exact view, layers and date.');
    } catch {
      flash('Copy failed. Use the address bar to share this view.');
    }
  };
  const [viewName, setViewName] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const saveView = (raw: string) => {
    const name = raw.trim() || `${STYLES[state.style].label}, ${active.map((l) => l.name).join(' + ') || 'no layers'}`;
    const next = [{ name: name.slice(0, 80), query: encodeState(state) }, ...saved.filter((s) => s.name !== name)].slice(0, 20);
    setSaved(next);
    writeJson(SAVED_KEY, next);
    setViewName('');
    flash('View saved in this browser.');
  };
  const openSaved = (q: string) => setState(decodeState(q, state, { today: env.yesterday, minYear: env.minYear, maxYear: env.maxYear }));
  const exportImage = async () => {
    const footer = `${active.map((l) => l.attribution).join(' · ') || 'Base map: NASA EOSDIS GIBS, Natural Earth'} · ${hasDaily ? `Date ${state.date}` : `Statistics ${state.year}`}`;
    const blob = await map.current?.exportPng(footer);
    if (!blob) {
      flash('This browser could not export the map image.');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aurora-map-${state.date}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen?.().catch(() => flash('Full screen is not available in this browser.'));
  };
  const goToCountry = (iso3: string) => {
    setPlaceQuery('');
    update({ country: iso3 });
    setCountryName(countryByIso3(iso3)?.name ?? iso3);
    setEvent(null);
    if (!map.current?.focusCountry(iso3)) flash('This country is too small to show at this map scale.');
  };

  const filteredLayers = (() => {
    const q = layerQuery.trim().toLowerCase();
    return q ? GEO_LAYERS.filter((l) => `${l.name} ${l.category} ${l.provider}`.toLowerCase().includes(q)) : GEO_LAYERS;
  })();
  const country = state.country ? countryByIso3(state.country) : undefined;

  const layerPanel = (
    <div className="space-y-3 text-sm">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
        <input className="input pl-8" placeholder="Search layers" value={layerQuery} onChange={(e) => setLayerQuery(e.target.value)} aria-label="Search layers" />
      </label>
      <p className="text-[11px] text-slate-dim">
        {state.layers.length} of {MAX_LAYERS} layers shown. Star layers to keep them at the top.
      </p>
      {[...(favourites.length && !layerQuery ? (['Favourites'] as const) : []), ...CATEGORIES].map((cat) => {
        const rows = cat === 'Favourites' ? filteredLayers.filter((l) => favourites.includes(l.id)) : filteredLayers.filter((l) => l.category === cat && !(cat === 'Base maps'));
        if (!rows.length) return null;
        return (
          <div key={cat}>
            <div className="eyebrow mb-1">{cat}</div>
            <ul className="space-y-0.5">
              {rows.map((l) => (
                <LayerRow key={l.id} layer={l} on={state.layers.some((x) => x.id === l.id)} fav={favourites.includes(l.id)} failed={failed.has(l.id)} onToggle={() => toggle(l.id)} onFav={() => favourite(l.id)} />
              ))}
            </ul>
          </div>
        );
      })}
      <div>
        <div className="eyebrow mb-1">Useful combinations</div>
        <ul className="space-y-1">
          {COMBINATIONS.map((c) => (
            <li key={c.layers.join('+')}>
              <button
                className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-ink-800"
                onClick={() => {
                  setState((s) => ({ ...s, layers: c.layers.map((id) => ({ id, opacity: 1 })) }));
                  setShowLayers(false);
                }}
              >
                <span className="text-platinum">{c.layers.map((id) => LAYER_MAP.get(id)!.name).join(' + ')}</span>
                <span className="block text-slate-dim">{c.why}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8">
      <PageHeader eyebrow="Geo intelligence" title="Map Explorer">
        Combine satellite observations, country statistics and live hazard feeds on one map, in 2D or as a globe. Every layer shows its source, date,
        coverage and how to read it. Nothing here is live unless it says so.
      </PageHeader>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Map view">
          <button className="chip" aria-pressed={state.mode === '3d'} onClick={() => update({ mode: '3d' })} disabled={!env.webgl}>
            <Globe2 className="h-3.5 w-3.5" aria-hidden /> 3D globe
          </button>
          <button className="chip" aria-pressed={state.mode === '2d'} onClick={() => update({ mode: '2d' })} disabled={!env.webgl}>
            <MapIcon className="h-3.5 w-3.5" aria-hidden /> 2D map
          </button>
        </div>
        <select className="input h-9 w-auto" value={state.style} onChange={(e) => update({ style: e.target.value as MapStyleId })} aria-label="Map style" disabled={!env.webgl}>
          {(Object.keys(STYLES) as MapStyleId[]).map((s) => (
            <option key={s} value={s}>
              {STYLES[s].label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
          <input className="input h-9 w-56 pl-8" placeholder="Find a country" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} aria-label="Find a country" disabled={!env.webgl} />
          {searchCountries(placeQuery, 6).length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-line bg-ink-900 py-1 shadow-xl">
              {searchCountries(placeQuery, 6).map((c) => (
                <li key={c.iso3}>
                  <button className="block w-full px-3 py-1.5 text-left text-sm hover:bg-ink-800" onClick={() => goToCountry(c.iso3)}>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {hasDaily && (
          <div className="flex items-center gap-1" role="group" aria-label="Date controls for daily satellite layers">
            <button className="chip px-2" onClick={() => update({ date: shiftDate(state.date, -1) })} aria-label="Previous day" disabled={state.date <= '2015-11-24'}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <input type="date" className="input h-9 w-40" value={state.date} min="2015-11-24" max={env.yesterday} onChange={(e) => e.target.value && update({ date: e.target.value })} aria-label="Observation date" />
            <button className="chip px-2" onClick={() => update({ date: shiftDate(state.date, 1) })} aria-label="Next day" disabled={state.date >= env.yesterday}>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button className="chip" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} title="Animate the last seven days">
              {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />} 7 days
            </button>
          </div>
        )}
        {choropleths.length > 0 && (
          <select className="input h-9 w-auto" value={state.year} onChange={(e) => update({ year: Number(e.target.value) })} aria-label="Statistics year">
            {Array.from({ length: env.maxYear - 1999 }, (_, i) => env.maxYear - i).map((y) => (
              <option key={y} value={y}>
                Statistics {y}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          <button className="chip lg:hidden" onClick={() => setShowLayers(true)}>
            <Layers className="h-3.5 w-3.5" aria-hidden /> Layers ({state.layers.length})
          </button>
          <button className="chip" onClick={() => void share()} title="Copy a link to this view">
            <Link2 className="h-3.5 w-3.5" aria-hidden /> Share
          </button>
          <button
            className="chip"
            onClick={() => {
              nameInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              nameInput.current?.focus({ preventScroll: true });
            }}
            title="Save this view in this browser"
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Save
          </button>
          <button className="chip" onClick={() => void exportImage()} disabled={!env.webgl} title="Download the map as an image">
            <Camera className="h-3.5 w-3.5" aria-hidden /> Image
          </button>
          <button className="chip" onClick={fullscreen} title="Full screen">
            <Expand className="h-3.5 w-3.5" aria-hidden /> Full screen
          </button>
        </div>
      </div>
      {notice && (
        <p className="mb-2 text-xs text-gold-soft" role="status">
          {notice}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden max-h-[78vh] overflow-y-auto rounded-xl border border-line bg-ink-900/80 p-3 lg:block" aria-label="Layers">
          {layerPanel}
        </aside>

        <div className="min-w-0 space-y-3">
          <div ref={frame} className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-xl border border-line bg-ink-950 [&:fullscreen]:h-screen [&:fullscreen]:rounded-none">
            {env.webgl ? (
              <Suspense fallback={<AppLoading label="Loading the map" />}>
                <GeoMap
                  ref={map}
                  state={state}
                  today={env.today}
                  events={events}
                  values={values}
                  onView={(v) => setState((s) => ({ ...s, ...v }))}
                  onCountry={(iso3, name) => {
                    update({ country: iso3 });
                    setCountryName(name ?? null);
                    setEvent(null);
                  }}
                  onEvent={(e) => {
                    setEvent(e);
                    update({ country: null });
                  }}
                  onTileError={(id) => setFailed((f) => (f.has(id) ? f : new Set([...f, id])))}
                  onHover={setHover}
                />
              </Suspense>
            ) : (
              <div className="flex h-full flex-col">
                <p className="border-b border-line px-3 py-2 text-xs text-warn" role="status">
                  This device or browser does not support WebGL 2, so the lightweight map is shown: live events and country links, without satellite or
                  statistics layers.
                </p>
                <WorldMap events={events} onEventClick={setEvent} onCountryClick={(iso3, name) => (update({ country: iso3 }), setCountryName(name))} className="flex-1" />
              </div>
            )}
            {hover && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded border border-line bg-ink-900/95 px-2 py-1 text-xs text-platinum" aria-hidden>
                {hover}
              </div>
            )}
            <Legend active={active} counts={counts} spans={spans} loading={loading} failed={failed} state={state} today={env.today} />
          </div>
          {errors.length > 0 && (
            <p className="text-xs text-warn" role="status">
              Statistics unavailable right now: {errors.join('; ')}
            </p>
          )}
          {(quakeStatus === 'error' || disasterStatus === 'error') && (
            <p className="text-xs text-warn" role="status">
              {quakeStatus === 'error' && 'The USGS earthquake feed is unavailable right now. '}
              {disasterStatus === 'error' && 'The GDACS alert feed is unavailable right now.'}
            </p>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {event && <EventPanel event={event} onClose={() => setEvent(null)} />}
            {state.country && (
              <CountryPanel iso3={state.country} name={country?.name ?? countryName ?? state.country} year={state.year} layers={choropleths} values={values} years={years} onClose={() => update({ country: null })} />
            )}
            <ActiveLayersPanel active={active} state={state} today={env.today} failed={failed} onOpacity={(id, opacity) => setState((s) => ({ ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)) }))} onRemove={(id) => setState((s) => toggleLayer(s, id))} />
            <Panel title="Saved views" eyebrow="This browser">
              <form
                className="mb-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveView(viewName);
                }}
              >
                <input ref={nameInput} className="input h-8" placeholder="Name this view (optional)" value={viewName} maxLength={80} onChange={(e) => setViewName(e.target.value)} aria-label="Saved view name" />
                <button className="btn-ghost h-8 shrink-0 text-xs" type="submit">
                  Save view
                </button>
              </form>
              {saved.length === 0 ? (
                <p className="text-xs text-slate-dim">Save a view to come back to the same layers, date and place. Use Share to send it to someone.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {saved.map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-2">
                      <button className="truncate text-left text-platinum hover:text-gold-soft" onClick={() => openSaved(s.query)}>
                        {s.name}
                      </button>
                      <button
                        className="tap text-slate-dim hover:text-down"
                        aria-label={`Delete saved view ${s.name}`}
                        onClick={() => {
                          const next = saved.filter((x) => x.name !== s.name);
                          setSaved(next);
                          writeJson(SAVED_KEY, next);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {showLayers && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-ink-950/95 lg:hidden" role="dialog" aria-label="Layers">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold text-platinum">Layers</span>
            <button className="btn-quiet text-xs" onClick={() => setShowLayers(false)}>
              Done
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{layerPanel}</div>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-dim">
        Base maps: NASA Blue Marble composite (2004) via NASA GIBS, boundaries from Natural Earth (public domain). The satellite style is a static composite,
        not live imagery; daily observations are a separate layer with their date. Country borders are shown for orientation and imply no position on
        disputed territories.
      </p>
    </div>
  );
}

function NatureBadge({ nature }: { nature: keyof typeof DATA_NATURE }) {
  const cls = nature === 'simulated' ? 'border-gold-dim text-gold' : nature === 'near-real-time' || nature === 'observation' ? 'border-up/50 text-up' : 'border-info/50 text-info';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`} title={DATA_NATURE[nature].description}>
      {DATA_NATURE[nature].label}
    </span>
  );
}

function LayerRow({ layer, on, fav, failed, onToggle, onFav }: { layer: GeoLayer; on: boolean; fav: boolean; failed: boolean; onToggle: () => void; onFav: () => void }) {
  const planned = layer.kind === 'planned';
  return (
    <li className="flex items-start gap-1 rounded-md px-1 py-1 hover:bg-ink-800/60">
      <button className={`mt-0.5 shrink-0 p-1 ${fav ? 'text-gold' : 'text-slate-dim hover:text-mist'}`} aria-label={fav ? `Remove ${layer.name} from favourites` : `Add ${layer.name} to favourites`} aria-pressed={fav} onClick={onFav}>
        <Star className="h-3.5 w-3.5" fill={fav ? 'currentColor' : 'none'} />
      </button>
      <label className={`flex min-w-0 flex-1 items-start gap-2 ${planned ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}>
        <input type="checkbox" className="mt-1 accent-[#c9a35a]" checked={on} disabled={planned} onChange={onToggle} />
        <span className="min-w-0">
          <span className="block text-platinum">{layer.name}</span>
          <span className="block text-[11px] leading-snug text-slate-dim">
            {planned ? `Planned. Needs: ${layer.needs}` : `${layer.provider} · ${layer.updateFrequency}`}
            {failed && <span className="block text-warn">Could not load from the provider right now.</span>}
          </span>
        </span>
      </label>
    </li>
  );
}

function Legend({ active, counts, spans, loading, failed, state, today }: { active: ActiveLayer[]; counts: Record<string, number>; spans: Record<string, { min: number; max: number } | null>; loading: boolean; failed: Set<string>; state: MapState; today: string }) {
  const [open, setOpen] = useState(true);
  if (!active.length) return null;
  return (
    <div className="absolute bottom-2 left-2 z-10 max-h-[60%] max-w-[min(320px,calc(100%-16px))] overflow-y-auto rounded-md border border-line bg-ink-900/92 p-2 text-[11px] text-mist">
      <button className="mb-1 flex min-h-6 w-full items-center justify-between gap-2 font-semibold text-platinum" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Legend <span className="text-slate-dim">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open &&
        active.map((l) => (
          <div key={l.id} className="mb-2 last:mb-0">
            <div className="text-platinum">{l.name}</div>
            <div className="text-slate-dim">
              {l.kind === 'gibs' ? (l.gibs.time === 'daily' ? `Observed ${effectiveDate(l, state.date, today)}${effectiveDate(l, state.date, today) !== state.date ? ' (latest published)' : ''}` : `Composite ${l.gibs.time.fixed.slice(0, 4)}`) : l.kind === 'choropleth' ? `${l.latest ? `Most recent per country${spans[l.id] ? ` (${spans[l.id]!.min === spans[l.id]!.max ? spans[l.id]!.max : `${spans[l.id]!.min}–${spans[l.id]!.max}`})` : ''}` : state.year} · ${loading ? 'loading…' : `${counts[l.id] ?? 0} economies`} · ${l.units}` : l.updateFrequency}
              {failed.has(l.id) && <span className="text-warn"> · not loaded</span>}
            </div>
            {l.kind === 'choropleth' && (
              <ul className="mt-0.5 space-y-0.5">
                {choroplethLegend(l).map((r) => (
                  <li key={r.label} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-3.5 rounded-sm" style={{ background: r.color }} aria-hidden />
                    {r.label}
                  </li>
                ))}
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3.5 rounded-sm border border-line" aria-hidden /> No data
                </li>
              </ul>
            )}
            {l.kind === 'gibs' && l.legend && (
              <div className="mt-0.5">
                <div className="h-2 rounded-sm" style={{ background: `linear-gradient(to right, ${l.legend.stops.map((s) => s.color).join(', ')})` }} aria-hidden />
                <div className="flex justify-between text-slate-dim">
                  <span>{l.legend.stops[0]!.value}</span>
                  <span>{l.legend.units}</span>
                  <span>{l.legend.stops.at(-1)!.value}+</span>
                </div>
              </div>
            )}
            {l.kind === 'events' && <div className="text-slate-dim">Circle size: severity. Gold outline: simulated.</div>}
          </div>
        ))}
    </div>
  );
}

function ActiveLayersPanel({ active, state, today, failed, onOpacity, onRemove }: { active: ActiveLayer[]; state: MapState; today: string; failed: Set<string>; onOpacity: (id: string, v: number) => void; onRemove: (id: string) => void }) {
  return (
    <Panel title="Layers on the map" eyebrow="Source, freshness and how to read them" className="xl:col-span-2">
      {active.length === 0 ? (
        <p className="text-xs text-slate-dim">No data layers selected. Choose layers from the list{' '}<span className="lg:hidden">(Layers button)</span>.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {active.map((l) => {
            const ls = state.layers.find((x) => x.id === l.id)!;
            return (
              <div key={l.id} className="space-y-1.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-platinum">{l.name}</div>
                    <NatureBadge nature={l.nature} />
                  </div>
                  <button className="tap text-slate-dim hover:text-down" onClick={() => onRemove(l.id)} aria-label={`Remove ${l.name}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {failed.has(l.id) && <p className="text-warn">The provider did not return this layer just now. Try another date or come back later.</p>}
                <p className="text-mist">{l.interpretation}</p>
                {l.uncertainty && <p className="text-slate-dim">Uncertainty: {l.uncertainty}</p>}
                <dl className="grid grid-cols-[96px_1fr] gap-x-2 gap-y-0.5 text-slate-dim">
                  <dt>Provider</dt>
                  <dd>
                    <a className="text-gold hover:underline" href={l.providerUrl} target={l.providerUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                      {l.provider}
                    </a>
                  </dd>
                  <dt>Updated</dt>
                  <dd>{l.updateFrequency}</dd>
                  <dt>Showing</dt>
                  <dd>{l.kind === 'gibs' ? (l.gibs.time === 'daily' ? effectiveDate(l, state.date, today) : `${l.gibs.time.fixed.slice(0, 4)} composite`) : l.kind === 'choropleth' ? (l.latest ? 'Most recent value per country' : `Year ${state.year}`) : 'Latest feed data'}</dd>
                  <dt>Coverage</dt>
                  <dd>{l.coverage}</dd>
                  <dt>Resolution</dt>
                  <dd>{l.resolution}</dd>
                  {l.units && (
                    <>
                      <dt>Units</dt>
                      <dd>{l.units}</dd>
                    </>
                  )}
                  <dt>Licence</dt>
                  <dd>{l.license}</dd>
                </dl>
                <label className="flex items-center gap-2 text-slate-dim">
                  Opacity
                  <input type="range" min={10} max={100} step={5} value={Math.round(ls.opacity * 100)} onChange={(e) => onOpacity(l.id, Number(e.target.value) / 100)} className="flex-1 accent-[#c9a35a]" aria-label={`${l.name} opacity`} />
                  <span className="num w-9 text-right">{Math.round(ls.opacity * 100)}%</span>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function CountryPanel({ iso3, name, year, layers, values, years, onClose }: { iso3: string; name: string; year: number; layers: ChoroplethLayer[]; values: Record<string, Map<string, number>>; years: Record<string, Map<string, number>>; onClose: () => void }) {
  return (
    <Panel
      title={name}
      eyebrow="Country"
      actions={
        <button className="btn-quiet text-xs" onClick={onClose} aria-label="Close country details">
          <X className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        {layers.length > 0 && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            {layers.map((l) => {
              const v = values[l.id]?.get(iso3);
              return (
                <div key={l.id} className="contents">
                  <dt className="text-mist">
                    {l.name} ({l.latest ? (years[l.id]?.get(iso3) ?? '–') : year})
                  </dt>
                  <dd className="num text-right text-platinum">{v === undefined ? 'No data' : formatValue(v, l.format)}</dd>
                </div>
              );
            })}
          </dl>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Link className="btn-ghost h-8 text-xs" to={`/countries/${iso3}`}>
            Country dossier
          </Link>
          <Link className="btn-ghost h-8 text-xs" to={`/currency?c=${iso3}`}>
            Currency
          </Link>
          <Link className="btn-ghost h-8 text-xs" to="/lab">
            Quant Research
          </Link>
          <AddToBrain entity={{ kind: 'country', label: name, ref: { type: 'country', iso3 } }} />
        </div>
      </div>
    </Panel>
  );
}

function EventPanel({ event, onClose }: { event: GeoEvent; onClose: () => void }) {
  const status = statusOf(event);
  return (
    <Panel
      title={event.title}
      eyebrow={CATEGORY_LABEL[event.category]}
      actions={
        <button className="btn-quiet text-xs" onClick={onClose} aria-label="Close event details">
          <X className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="space-y-2 text-xs">
        <p className="text-mist">{event.summary}</p>
        <p className="text-slate-dim">
          {STATUS[status].label} · severity {event.severity}/5 · {relativeTime(event.time)} · {event.region}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {event.source.url.startsWith('http') && (
            <a className="btn-ghost h-8 text-xs" href={event.source.url} target="_blank" rel="noreferrer">
              {event.source.name} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
          <Link className="btn-ghost h-8 text-xs" to="/">
            World Briefing
          </Link>
          <AddToBrain
            event={event}
            entity={{ kind: event.provenance === 'simulated' ? 'scenario' : 'event', label: event.title, date: event.time.slice(0, 10), notes: event.summary.slice(0, 5000), ref: { type: 'event', id: event.id } }}
          />
        </div>
      </div>
    </Panel>
  );
}
