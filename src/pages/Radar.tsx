import { ExternalLink, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { EventCategory, GeoEvent } from '../../shared/types';
import { EventTimeline } from '../components/EventTimeline';
import { DemoNotice, PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { WorldMap } from '../components/WorldMap';
import { INSTRUMENT_MAP } from '../data/instruments';
import { CATEGORY_COLOR, CATEGORY_LABEL, REGIONS, regionOf, useEvents } from '../lib/events';
import { fmtDate, relativeTime } from '../lib/format';

const WINDOWS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: 'All', days: 3650 },
];

export default function Radar() {
  const navigate = useNavigate();
  const { demo, quakes, quakeStatus, quakeError, reloadQuakes } = useEvents();
  const [layers, setLayers] = useState({ demo: true, quakes: true });
  const [cats, setCats] = useState<Set<EventCategory>>(new Set(Object.keys(CATEGORY_LABEL) as EventCategory[]));
  const [minSeverity, setMinSeverity] = useState(1);
  const [region, setRegion] = useState('all');
  const [windowDays, setWindowDays] = useState(30);
  const [selected, setSelected] = useState<GeoEvent | null>(null);
  const [now] = useState(() => Date.now());
  const [day, setDay] = useState<string | null>(null);

  const all = useMemo(() => [...(layers.demo ? demo : []), ...(layers.quakes ? quakes : [])], [layers, demo, quakes]);
  const windowed = useMemo(() => {
    return all
      .filter((e) => cats.has(e.category) && e.severity >= minSeverity && now - Date.parse(e.time) <= windowDays * 86_400_000)
      .filter((e) => region === 'all' || regionOf(e.lat, e.lon) === region)
      .sort((a, b) => b.severity - a.severity || Date.parse(b.time) - Date.parse(a.time));
  }, [all, cats, minSeverity, region, windowDays, now]);
  const filtered = useMemo(() => (day ? windowed.filter((e) => e.time.slice(0, 10) === day) : windowed), [windowed, day]);

  const toggleCat = (c: EventCategory) =>
    setCats((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Global Conflict Radar" title="Event monitoring map">
        Filter developments by type, severity, region and date. Click a marker for details or a country to open its dossier.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="min-w-0 space-y-4">
          <Panel title="Layers">
            <div className="space-y-3 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[#c8a96b]" checked={layers.quakes} onChange={(e) => setLayers((l) => ({ ...l, quakes: e.target.checked }))} />
                <span>
                  Earthquakes M4.5+, past 7 days <ProvenanceBadge kind="confirmed" className="ml-1" />
                  <span className="block text-xs text-slate-dim">
                    USGS ·{' '}
                    {quakeStatus === 'loading' ? 'loading…' : quakeStatus === 'error' ? 'unavailable' : `${quakes.length} events`}
                  </span>
                  {quakeError && (
                    <button className="text-xs text-gold hover:underline" onClick={reloadQuakes}>
                      Retry feed
                    </button>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[#c8a96b]" checked={layers.demo} onChange={(e) => setLayers((l) => ({ ...l, demo: e.target.checked }))} />
                <span>
                  Geopolitical scenarios <ProvenanceBadge kind="simulated" className="ml-1" />
                  <span className="block text-xs text-slate-dim">Synthetic demo events ({demo.length})</span>
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
                <input id="sev" type="range" min={1} max={5} value={minSeverity} onChange={(e) => setMinSeverity(+e.target.value)} className="w-full accent-[#c8a96b]" />
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
            Geopolitical markers are <strong>simulated scenarios</strong> (dashed outline) for interface demonstration — they are
            not real events and contain no casualty figures. The earthquake layer is live public data from the U.S. Geological
            Survey.
          </DemoNotice>
          <div className="relative">
            <WorldMap
              events={filtered}
              selectedEventId={selected?.id}
              onEventClick={setSelected}
              onCountryClick={(iso3) => navigate(`/countries/${iso3}`)}
              className="aspect-[96/50] w-full border border-line"
            />
            {selected && <EventDrawer event={selected} onClose={() => setSelected(null)} />}
          </div>

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
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-navy-800/60 ${selected?.id === e.id ? 'bg-navy-800/60' : ''}`}
                      onClick={() => setSelected(e)}
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
    <div className="absolute inset-x-2 bottom-2 z-20 max-h-[85%] overflow-y-auto rounded-lg border border-line bg-navy-900/97 p-4 shadow-2xl sm:inset-x-auto sm:left-2 sm:top-2 sm:bottom-auto sm:w-96">
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
          <span className="block text-slate-dim">{e.source.license}</span>
        </dd>
      </dl>
      {e.marketLinks && e.marketLinks.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="eyebrow mb-1">Potential market exposure</div>
          <p className="mb-2 text-[11px] text-slate-dim">Analytical hypothesis for research — not a forecast.</p>
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
