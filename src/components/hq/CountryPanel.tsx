import { ExternalLink, X } from 'lucide-react';
import { FollowButton } from '../FollowButton';
import { SaveButton } from '../SaveButton';
import { useState } from 'react';
import { Link } from 'react-router';
import { INDICATORS } from '../../../shared/indicators';
import type { Story } from '../../../shared/news';
import type { CountryProfile, GeoEvent, IndicatorValue } from '../../../shared/types';
import { useApi } from '../../lib/api';
import { countryByIso3 } from '../../lib/countries';
import { fmtNumber } from '../../lib/format';
import { age, flagEmoji } from '../../lib/radarLabels';

const SECTIONS = [
  ['overview', 'Overview'],
  ['economy', 'Economy'],
  ['demography', 'Population'],
  ['infrastructure', 'Energy & connectivity'],
  ['security', 'Security'],
  ['sources', 'Sources'],
] as const;
export type DossierSection = (typeof SECTIONS)[number][0];

const OVERVIEW = ['SP.POP.TOTL', 'NY.GDP.MKTP.CD', 'NY.GDP.PCAP.CD', 'NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS'];

function fmtIndicator(v: IndicatorValue): string {
  if (v.value == null) return 'No data';
  switch (v.unit) {
    case 'percent':
      return `${v.value.toFixed(1)} %`;
    case 'usd':
      return Math.abs(v.value) >= 1e9 ? `US$${(v.value / 1e9).toFixed(1)} bn` : `US$${fmtNumber(v.value, 0)}`;
    case 'count':
      return Math.abs(v.value) >= 1e6 ? `${(v.value / 1e6).toFixed(1)} million` : fmtNumber(v.value, 0);
    case 'km2':
      return `${fmtNumber(v.value, 0)} km²`;
    case 'years':
      return `${v.value.toFixed(1)} years`;
    case 'per100':
      return `${v.value.toFixed(0)} per 100 people`;
  }
}

/**
 * Country dossier docked beside the map: identity, World Bank indicators by section and sources. The map stays visible
 * and interactive; closing returns to the previous view (handled by the parent).
 */
export interface CountryDevelopments {
  events: GeoEvent[];
  stories: Story[];
  now: number;
  onEvent: (e: GeoEvent) => void;
}

/** Concise list of the country's located signals and grouped news, newest first; events focus the map. */
function Developments({ d, name }: { d: CountryDevelopments; name: string }) {
  const events = [...d.events].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 6);
  const stories = d.stories.slice(0, 4);
  return (
    <section className="mb-4" aria-label={`Developments in ${name}`}>
      <div className="eyebrow mb-1.5 !text-[10px]">Developments</div>
      {events.length === 0 && stories.length === 0 ? (
        <p className="text-xs text-slate-dim">No located hazard signals or grouped news naming {name} in the current feeds. That is not evidence of stability: coverage is limited to USGS, GDACS, GDELT and UN News.</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-md border border-line">
          {events.map((e) => (
            <li key={e.id}>
              <button className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-ink-900" onClick={() => d.onEvent(e)}>
                <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SEVERITY_CLS[e.severity]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-platinum">{e.title}</span>
                  <span className="block text-[10px] text-slate-dim">
                    {e.source.name} · {age(e.time, d.now)} · severity {e.severity}/5 · show on map
                  </span>
                </span>
              </button>
            </li>
          ))}
          {stories.map((st) => (
            <li key={st.id} className="px-3 py-2">
              <a href={st.articles[0]?.url ?? '/news'} target="_blank" rel="noreferrer noopener" className="block text-xs text-platinum hover:text-gold-soft">
                {st.title}
              </a>
              <span className="block text-[10px] text-slate-dim">
                News · {st.status} · {st.independent.length} {st.independent.length === 1 ? 'publisher' : 'publishers'} · {age(st.last, d.now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
const SEVERITY_CLS = ['', 'bg-slate-dim', 'bg-info', 'bg-gold', 'bg-warn', 'bg-down'];

export function CountryPanel({
  iso3,
  onClose,
  section,
  onSection,
  developments,
}: {
  iso3: string;
  onClose: () => void;
  section: DossierSection;
  onSection: (s: DossierSection) => void;
  developments?: CountryDevelopments;
}) {
  const ref = countryByIso3(iso3);
  const profile = useApi<CountryProfile>(`/api/countries/${iso3}`);
  const [showAll, setShowAll] = useState(false);
  const p = profile.status === 'ready' ? profile.data : null;
  const rows = (ids: string[]) => ids.map((id) => p?.indicators[id]).filter((v): v is IndicatorValue => !!v);
  const bySection = (s: string) => rows(INDICATORS.filter((d) => d.section === s).map((d) => d.id));
  const list = section === 'overview' ? rows(OVERVIEW) : section === 'sources' ? [] : bySection(section);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <span aria-hidden className="av-flag select-none text-5xl leading-none">
          {flagEmoji(ref?.iso2 ?? '')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Country dossier</div>
          <h2 className="truncate text-xl font-semibold text-platinum">{p?.name ?? ref?.name ?? iso3}</h2>
          <p className="mt-0.5 text-xs text-slate-dim">
            {[p?.region, p?.incomeLevel, p?.capital ? `Capital: ${p.capital}` : null].filter(Boolean).join(' · ') || (profile.status === 'loading' ? 'Loading…' : iso3)}
          </p>
        </div>
        <FollowButton iso3={iso3} />
        <SaveButton kind="country" title={p?.name ?? ref?.name ?? iso3} href={`/countries/${iso3}`} className="btn-quiet" label={false} />
        <button className="btn-quiet" onClick={onClose} aria-label="Close dossier (Esc)" title="Close (Esc)">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2" role="tablist" aria-label="Dossier sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} className="chip shrink-0 text-[11px]" aria-pressed={section === id} onClick={() => onSection(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" data-scroll-panel>
        {profile.status === 'error' && <p className="text-sm text-down">Country data is unavailable right now ({profile.error}).</p>}
        {profile.status === 'loading' && <p className="text-sm text-slate-dim">Loading World Bank indicators…</p>}
        {developments && section === 'overview' && <Developments d={developments} name={p?.name ?? ref?.name ?? iso3} />}
        {p && section !== 'sources' && (
          <>
            {list.length === 0 ? (
              <p className="text-sm text-slate-dim">No indicators in this section for this country.</p>
            ) : (
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(showAll ? list : list.slice(0, 8)).map((v, i) => (
                  <div key={v.id} className={`rounded-md border border-line px-3 py-2 ${i === 0 && section === 'overview' ? 'sm:col-span-2' : ''}`}>
                    <dt className="text-[11px] text-slate-dim">{v.label}</dt>
                    <dd className={`num ${i === 0 && section === 'overview' ? 'text-2xl font-semibold' : 'text-base'} text-platinum`}>
                      {fmtIndicator(v)}
                      {v.date && <span className="ml-1.5 text-[10px] font-normal text-slate-dim">{v.date}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {list.length > 8 && (
              <button className="btn-ghost mt-2 text-xs" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            )}
            {section === 'security' && (
              <p className="mt-3 text-[11px] text-slate-dim">
                Public aggregate figures only. Institutions, emblems and capability details are being added from official sources.
              </p>
            )}
          </>
        )}
        {section === 'sources' && (
          <div className="space-y-2 text-xs text-mist">
            <p>
              Indicators: {p?.source.name ?? 'World Bank'}, World Development Indicators{p ? `, retrieved ${p.fetchedAt.slice(0, 10)}` : ''}. Each value shows its
              reference year; recent years may be missing for some countries.
            </p>
            {p?.source.url && (
              <a className="inline-flex items-center gap-1 text-gold hover:underline" href={p.source.url} target="_blank" rel="noreferrer noopener">
                Open the source <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line p-3">
        <Link to={`/countries/${iso3}`} className="btn-ghost text-xs">
          Full dossier and history charts
        </Link>
        <Link to={`/countries/compare?c=${iso3}`} className="btn-ghost text-xs">
          Compare
        </Link>
        <Link to={`/news?q=${encodeURIComponent(p?.name ?? ref?.name ?? '')}`} className="btn-ghost text-xs">
          Recent coverage
        </Link>
      </div>
    </div>
  );
}
