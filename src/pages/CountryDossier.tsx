import { ArrowLeft, ChevronDown, LineChart as LineIcon, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { INDICATORS, type IndicatorDef } from '../../shared/indicators';
import type { CountryProfile, IndicatorSeries, IndicatorValue } from '../../shared/types';
import { AddToBrain } from '../components/AddToBrain';
import { LineChart } from '../components/SvgCharts';
import { ErrorState, Loading, ProvenanceBadge, Unavailable } from '../components/ui';
import { useApi } from '../lib/api';
import { countryByIso3 } from '../lib/countries';
import { fmtCompact, fmtIndicator } from '../lib/format';
import { usePrefs } from '../store/prefs';

const SECTIONS: { key: IndicatorDef['section'] | 'politics'; title: string; blurb: string }[] = [
  { key: 'general', title: 'General', blurb: 'Population, territory and urbanisation.' },
  { key: 'economy', title: 'Economy', blurb: 'Output, prices, labour market, public debt and trade openness.' },
  { key: 'demography', title: 'Demography', blurb: 'Growth, age structure and life expectancy.' },
  { key: 'politics', title: 'Politics', blurb: 'Government, parties, elections and stability indicators.' },
  { key: 'infrastructure', title: 'Infrastructure & Energy', blurb: 'Connectivity, electrification and energy mix.' },
  { key: 'security', title: 'Security & Defence', blurb: 'Publicly reported aggregate defence spending and personnel (SIPRI / IISS via World Bank).' },
];

/** Age-share indicators can be shown as absolute counts derived from total population. */
const DERIVED_FROM_POPULATION = new Set(['SP.POP.0014.TO.ZS', 'SP.POP.1564.TO.ZS', 'SP.POP.65UP.TO.ZS', 'SP.URB.TOTL.IN.ZS']);

export default function CountryDossier() {
  const { iso3 = '' } = useParams();
  const code = iso3.toUpperCase();
  const ref = countryByIso3(code);
  const valid = /^[A-Z]{3}$/.test(code);
  const profile = useApi<CountryProfile>(valid ? `/api/countries/${code}` : null);
  const { favorites, toggleFavorite } = usePrefs();
  const fav = favorites.includes(code);
  const [open, setOpen] = useState<Set<string>>(new Set(['general', 'economy']));

  const name = profile.status === 'ready' ? profile.data.name : (ref?.name ?? code);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/countries" className="btn-quiet -ml-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> All countries
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Country dossier · {code}</div>
          <h1 className="text-3xl font-semibold">{name}</h1>
          {profile.status === 'ready' && (
            <p className="mt-2 text-sm text-mist">
              {[profile.data.region, profile.data.capital && `Capital: ${profile.data.capital}`, profile.data.incomeLevel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {valid && <AddToBrain entity={{ kind: 'country', label: name, ref: { type: 'country', iso3: code } }} />}
          <Link to={`/countries/vs?c=${code}`} className="btn-ghost">
            Compare with…
          </Link>
          <button className={fav ? 'btn-primary' : 'btn-ghost'} onClick={() => toggleFavorite(code)} aria-pressed={fav}>
            <Star className="h-4 w-4" fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Favourite' : 'Add to favourites'}
          </button>
        </div>
      </div>

      {!valid && <ErrorState message="Country codes are three-letter ISO 3166-1 alpha-3 codes, e.g. DEU." />}
      {valid && profile.status === 'loading' && <Loading label="Fetching World Bank indicators" />}
      {profile.status === 'error' && <ErrorState message={profile.error} onRetry={profile.reload} />}

      {profile.status === 'ready' && (
        <>
          <div className="mb-4 flex items-center justify-between text-xs text-slate-dim">
            <span className="flex items-center gap-2">
              <ProvenanceBadge kind="confirmed" /> {profile.data.source.name} · {profile.data.source.license}
            </span>
            <span className="flex gap-2">
              <button className="hover:text-platinum" onClick={() => setOpen(new Set(SECTIONS.map((s) => s.key)))}>
                Expand all
              </button>
              ·
              <button className="hover:text-platinum" onClick={() => setOpen(new Set())}>
                Collapse all
              </button>
            </span>
          </div>
          <div className="space-y-3">
            {SECTIONS.map((sec) => {
              const isOpen = open.has(sec.key);
              return (
                <section key={sec.key} className="panel">
                  <button
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        if (n.has(sec.key)) n.delete(sec.key);
                        else n.add(sec.key);
                        return n;
                      })
                    }
                  >
                    <span>
                      <span className="block font-semibold">{sec.title}</span>
                      <span className="block text-xs text-slate-dim">{sec.blurb}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-mist transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-line px-4 py-3">
                      {sec.key === 'politics' ? (
                        <Unavailable phase="planned">
                          Government structure, parties, elections and published polls need curated sources, such as national
                          electoral commissions, ParlGov and the Worldwide Governance Indicators. Until they are added, we show no
                          figures rather than unsourced ones.
                        </Unavailable>
                      ) : (
                        <IndicatorTable profile={profile.data} section={sec.key} />
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-slate-dim">
            Each value is the most recent available observation, so reference years differ between indicators. Figures marked ≈
            are computed by Aurora Veritatis from the cited shares and the total population. Source:{' '}
            <a className="text-gold hover:underline" href={`https://data.worldbank.org/country/${code}`} target="_blank" rel="noreferrer">
              World Bank: {name}
            </a>
            . Retrieved {new Date(profile.data.fetchedAt).toUTCString()}.
          </p>
        </>
      )}
    </div>
  );
}

function IndicatorTable({ profile, section }: { profile: CountryProfile; section: IndicatorDef['section'] }) {
  const [chart, setChart] = useState<string | null>(null);
  const defs = INDICATORS.filter((d) => d.section === section);
  const pop = profile.indicators['SP.POP.TOTL']?.value ?? null;
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Indicator</th>
            <th>Value</th>
            <th>Year</th>
            <th>History</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {defs.map((d) => {
            const v = profile.indicators[d.id] as IndicatorValue | undefined;
            if (!v) return null;
            const derived = DERIVED_FROM_POPULATION.has(d.id) && v.value != null && pop != null ? (v.value / 100) * pop : null;
            return (
              <tr key={d.id}>
                <td className="py-2 pr-3 text-mist">
                  {d.label}
                </td>
                <td className="num py-2 pr-3 text-right font-medium text-platinum">
                  {fmtIndicator(v)}
                  {derived != null && <span className="block text-[11px] font-normal text-slate-dim">≈ {fmtCompact(derived)} people</span>}
                </td>
                <td className="num w-14 py-2 pr-2 text-right text-xs text-slate-dim">{v.date ?? '—'}</td>
                <td className="w-10 py-2 text-right">
                  <button
                    className={`btn-quiet ${chart === d.id ? 'text-gold' : ''}`}
                    aria-label={`Show history for ${d.label}`}
                    aria-pressed={chart === d.id}
                    disabled={v.value == null}
                    onClick={() => setChart((c) => (c === d.id ? null : d.id))}
                  >
                    <LineIcon className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {chart && <SeriesView iso3={profile.iso3} indicator={chart} />}
    </div>
  );
}

function SeriesView({ iso3, indicator }: { iso3: string; indicator: string }) {
  const s = useApi<IndicatorSeries>(`/api/countries/${iso3}/series/${indicator}`);
  if (s.status === 'loading') return <Loading label="Loading history" />;
  if (s.status === 'error') return <ErrorState message={s.error} onRetry={s.reload} />;
  const unit = s.data.unit;
  return (
    <div className="mt-3 rounded-lg border border-line bg-ink-950 p-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-platinum">{s.data.label}</span>
        <span className="text-slate-dim">
          {s.data.points[0]?.date}–{s.data.points.at(-1)?.date} · World Bank
        </span>
      </div>
      <LineChart points={s.data.points} format={(v) => fmtIndicator({ id: indicator, label: '', unit, value: v, date: null })} />
    </div>
  );
}
