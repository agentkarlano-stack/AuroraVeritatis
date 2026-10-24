import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { GeoEvent, LatestValues } from '../../../shared/types';
import { getJson, useApi } from '../../lib/api';
import { COMMODITY_DATA_PATH, type CommodityData } from '../../lib/commodities';
import { COUNTRIES, countryByIso3 } from '../../lib/countries';
import { CATEGORY_LABEL, useEvents } from '../../lib/events';
import { locateCountry } from '../../lib/geo/locate';
import { EXPOSURE_INDICATORS, EXPOSURE_RULES, beforeAfter, exposuresFor, linkedCommodities, type IndicatorValue } from '../../lib/impactChain';
import { AddToBrain } from '../AddToBrain';
import { ErrorState, Loading, ModuleLink, Panel, ProvenanceBadge } from '../ui';

type Profiles = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; byIndicator: Record<string, LatestValues> };

/** Latest value per country for every exposure indicator (World Bank, cached for a day at the edge). */
function useExposureData(): Profiles {
  const [state, setState] = useState<Profiles>({ status: 'loading' });
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all(EXPOSURE_INDICATORS.map((id) => getJson<LatestValues>(`/api/map/${id}`, ctrl.signal)))
      .then((all) => setState({ status: 'ready', byIndicator: Object.fromEntries(all.map((d) => [d.indicator, d])) }))
      .catch((e: Error) => !ctrl.signal.aborted && setState({ status: 'error', error: e.message }));
    return () => ctrl.abort();
  }, []);
  return state;
}

const fmt = (v: number, d = 1) => v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
const signed = (v: number) => `${v > 0 ? '+' : ''}${fmt(v)}%`;

/**
 * Market Impact chain on real data: a live USGS/GDACS event, its country, that country's commodity exposure (World Bank
 * WDI, documented thresholds) and the linked World Bank monthly commodity prices around the event month.
 */
export function EventChain() {
  const [params, setParams] = useSearchParams();
  const ev = useEvents();
  const events = useMemo(
    () => [...ev.disasters, ...ev.quakes].sort((a, b) => b.severity - a.severity || b.time.localeCompare(a.time)).slice(0, 60),
    [ev.disasters, ev.quakes],
  );
  const loadingEvents = ev.quakeStatus === 'loading' || ev.disasterStatus === 'loading';
  const event: GeoEvent | undefined = events.find((e) => e.id === params.get('event')) ?? events[0];
  const located = event ? locateCountry(event.lon, event.lat, event.source.name.startsWith('GDACS') ? event.region : undefined) : undefined;
  const override = countryByIso3(params.get('country') ?? undefined);
  const country = override ?? located?.country;
  const profiles = useExposureData();
  const commodities = useApi<CommodityData>(COMMODITY_DATA_PATH);

  const set = (k: 'event' | 'country', v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        if (k === 'event') n.delete('country');
        return n;
      },
      { replace: true },
    );

  const values: Record<string, IndicatorValue | undefined> = {};
  if (profiles.status === 'ready' && country) {
    for (const id of EXPOSURE_INDICATORS) {
      const p = profiles.byIndicator[id]?.points.find((x) => x.iso3 === country.iso3);
      if (p) values[id] = { value: p.value, year: p.year };
    }
  }
  const exposures = exposuresFor(values);
  const linked = linkedCommodities(exposures);

  return (
    <Panel title="Event → country → commodity exposure" eyebrow="Live chain · real data">
      <div className="space-y-4 text-sm">
        <p className="text-xs leading-relaxed text-mist">
          Pick a current earthquake or disaster alert. Aurora finds the country, checks which commodities matter to its economy (World Bank indicators with
          fixed thresholds) and shows the World Bank monthly prices of those commodities around the event. Exposure explains why a price could matter to a
          country; it does not mean the event moves world prices, and a price change after an event is not evidence that the event caused it.
        </p>

        {loadingEvents && !events.length ? (
          <Loading label="Loading live events" />
        ) : !events.length ? (
          <ErrorState message="No live events could be loaded from USGS or GDACS right now." onRetry={() => (ev.reloadQuakes(), ev.reloadDisasters())} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-mist">
              Event
              <select className="input mt-1" value={event?.id} onChange={(e) => set('event', e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.time.slice(0, 10)} · {e.title.slice(0, 80)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-mist">
              Country {located && !override ? `(${located.how === 'nearest' ? `nearest, about ${located.km} km offshore` : located.how === 'name' ? 'from the source' : 'from the location'})` : ''}
              <select className="input mt-1" value={country?.iso3 ?? ''} onChange={(e) => set('country', e.target.value || null)}>
                <option value="">{located ? `Automatic: ${located.country.name}` : 'No country found: choose one'}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.iso3} value={c.iso3}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {event && (
          <div className="rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-platinum">{event.title}</span>
              <ProvenanceBadge kind={event.provenance} />
            </div>
            <p className="mt-1 text-xs text-slate-dim">
              {CATEGORY_LABEL[event.category]} · severity {event.severity}/5 · {new Date(event.time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} UTC ·{' '}
              {event.source.url.startsWith('http') ? (
                <a className="text-gold hover:underline" href={event.source.url} target="_blank" rel="noreferrer">
                  {event.source.name}
                </a>
              ) : (
                event.source.name
              )}
            </p>
          </div>
        )}

        {event && !country && <p className="text-xs text-slate-dim">The event is far from any country. Choose a country to see its exposure.</p>}

        {country && (
          <section aria-label="Commodity exposure">
            <h3 className="eyebrow mb-2">Exposure of {country.name}</h3>
            {profiles.status === 'loading' && <Loading label="Loading World Bank indicators" />}
            {profiles.status === 'error' && <ErrorState message={profiles.error} />}
            {profiles.status === 'ready' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-mist">
                    <tr className="border-b border-line">
                      <th className="py-1.5 font-medium">Indicator</th>
                      <th className="py-1.5 text-right font-medium">Value</th>
                      <th className="hidden py-1.5 text-right font-medium sm:table-cell">Threshold</th>
                      <th className="py-1.5 pl-3 font-medium">Exposure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {EXPOSURE_RULES.map((r) => {
                      const v = values[r.indicator];
                      const hit = exposures.some((e) => e.rule.id === r.id);
                      return (
                        <tr key={r.id}>
                          <td className="py-1.5 pr-3 text-mist">
                            % {r.measure}
                            <span className="block text-[10px] text-slate-dim sm:hidden">exposure at ≥ {r.threshold}%</span>
                          </td>
                          <td className="num py-1.5 text-right whitespace-nowrap text-platinum">
                            {v ? (
                              <>
                                {fmt(v.value)}%<span className="block text-[10px] text-slate-dim">{v.year}</span>
                              </>
                            ) : (
                              'no data'
                            )}
                          </td>
                          <td className="num hidden py-1.5 text-right text-slate-dim sm:table-cell">≥ {r.threshold}%</td>
                          <td className={`py-1.5 pl-3 ${hit ? 'text-gold-soft' : 'text-slate-dim'}`}>{hit ? r.label : '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-slate-dim">World Bank World Development Indicators (CC BY 4.0), most recent year per indicator.</p>
              </div>
            )}
          </section>
        )}

        {country && profiles.status === 'ready' && (
          <section aria-label="Prices around the event">
            <h3 className="eyebrow mb-2">Linked commodity prices around the event</h3>
            {!linked.length ? (
              <p className="text-xs text-slate-dim">No exposure above the thresholds, so no commodity is linked for {country.name}.</p>
            ) : commodities.status === 'loading' ? (
              <Loading label="Loading commodity prices" />
            ) : commodities.status === 'error' ? (
              <ErrorState message={commodities.error} onRetry={commodities.reload} />
            ) : (
              <PriceWindow data={commodities.data} linked={linked} eventTime={event?.time ?? ''} />
            )}
          </section>
        )}

        {event && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
            <AddToBrain
              event={event}
              entity={{
                kind: 'event',
                label: event.title,
                date: event.time.slice(0, 10),
                notes: `${event.summary}${country ? `\nCountry: ${country.name}. Exposure: ${exposures.map((e) => `${e.rule.label} (${fmt(e.value)}% ${e.rule.measure}, ${e.year})`).join('; ') || 'none above the thresholds'}.` : ''}`.slice(0, 5000),
                ref: { type: 'event', id: event.id },
                sources: event.source.url.startsWith('http') ? [{ title: event.source.name, url: event.source.url, date: event.time.slice(0, 10) }] : [],
              }}
            />
            {country && <ModuleLink to={`/countries/${country.iso3}`}>{country.name} dossier</ModuleLink>}
            <ModuleLink to={`/lab/forecasts?event=${encodeURIComponent(event.id)}&q=${encodeURIComponent(`Will ${event.title} …`)}`}>Make a forecast</ModuleLink>
            <ModuleLink to="/lab?tool=risk">Portfolio risk</ModuleLink>
            <ModuleLink to="/strategy">Strategy Lab scenario</ModuleLink>
          </div>
        )}
      </div>
    </Panel>
  );
}

function PriceWindow({ data, linked, eventTime }: { data: CommodityData; linked: { id: string; via: string[] }[]; eventTime: string }) {
  const rows = linked.flatMap(({ id, via }) => {
    const s = data.series.find((x) => x.id === id);
    return s ? [{ s, via, w: beforeAfter(s.values, data.start, eventTime) }] : [];
  });
  const pending = rows.length > 0 && rows.every((r) => r.w.pending);
  return (
    <div>
      {pending && (
        <p className="mb-2 rounded-md border border-line px-3 py-2 text-xs text-mist" role="note">
          The World Bank publishes monthly averages after each month ends (latest: {data.end}). Prices for {rows[0]!.w.eventMonth} are not out yet, so only
          the month before the event is shown.
        </p>
      )}
      <ul className="divide-y divide-line/60 text-xs sm:hidden">
        {rows.map(({ s, via, w }) => (
          <li key={s.id} className="py-2">
            <Link className="text-platinum hover:text-gold-soft" to={`/markets?symbol=CMD:${s.id}`}>
              {s.name}
            </Link>
            <span className="block text-[10px] text-slate-dim">{via.join(', ')}</span>
            <dl className="num mt-1 grid grid-cols-4 gap-1">
              <div>
                <dt className="font-sans text-[10px] text-slate-dim">Before</dt>
                <dd className="text-mist">{w.base != null ? fmt(w.base, w.base >= 100 ? 0 : 2) : '–'}</dd>
              </div>
              {['Event', '+1 mo', '+2 mo'].map((label, k) => {
                const p = w.points[k];
                return (
                  <div key={label}>
                    <dt className="font-sans text-[10px] text-slate-dim">{label}</dt>
                    <dd className={p?.z != null && Math.abs(p.z) >= 2 ? 'text-warn' : 'text-platinum'}>{p ? signed(p.change) : '–'}</dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="num w-full min-w-[560px] text-xs">
          <thead className="text-left font-sans text-mist">
            <tr className="border-b border-line">
              <th className="py-1.5 font-medium">Commodity</th>
              <th className="py-1.5 text-right font-medium">Month before</th>
              <th className="py-1.5 text-right font-medium">Event month</th>
              <th className="py-1.5 text-right font-medium">+1 month</th>
              <th className="py-1.5 text-right font-medium">+2 months</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map(({ s, via, w }) => (
              <tr key={s.id}>
                <td className="py-1.5 pr-3 font-sans">
                  <Link className="text-platinum hover:text-gold-soft" to={`/markets?symbol=CMD:${s.id}`}>
                    {s.name}
                  </Link>
                  <span className="block text-[10px] text-slate-dim">{via.join(', ')}</span>
                </td>
                <td className="py-1.5 text-right text-mist">{w.base != null ? `${fmt(w.base, 2)} ${s.unit}` : 'no data'}</td>
                {[0, 1, 2].map((k) => {
                  const p = w.points[k];
                  return (
                    <td key={k} className={`py-1.5 text-right ${p?.z != null && Math.abs(p.z) >= 2 ? 'text-warn' : 'text-platinum'}`} title={p?.z != null ? `z = ${p.z.toFixed(2)}` : undefined}>
                      {p ? (
                        <>
                          {signed(p.change)}
                          {p.z != null && <span className="block text-[10px] text-slate-dim">z {p.z.toFixed(1)}</span>}
                        </>
                      ) : (
                        <span className="text-slate-dim">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-dim">
        Change from the month before the event. z = ln(price ÷ base) ÷ (σ<sub>monthly</sub> × √n), σ from the 36 months before; |z| ≥ 2 is unusual
        (highlighted). Monthly averages hide moves within a month, and many things move commodity prices at once: this is a timing comparison, not a causal
        estimate. {data.source.attribution}.
      </p>
    </div>
  );
}
