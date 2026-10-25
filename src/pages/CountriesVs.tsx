import { ArrowLeft, Plus, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { INDICATORS, type IndicatorDef } from '../../shared/indicators';
import type { CountryProfile } from '../../shared/types';
import { PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { getJson } from '../lib/api';
import { countryByIso3, parseIsoList, searchCountries } from '../lib/countries';
import { fmtIndicator } from '../lib/format';

const MAX = 4;
const SECTIONS: { key: IndicatorDef['section']; title: string }[] = [
  { key: 'general', title: 'General' },
  { key: 'economy', title: 'Economy' },
  { key: 'demography', title: 'Demography' },
  { key: 'infrastructure', title: 'Infrastructure & Energy' },
  { key: 'security', title: 'Security & Defence' },
];

type Entry = CountryProfile | { error: string };

export default function CountriesVs() {
  const [params, setParams] = useSearchParams();
  const codes = parseIsoList(params.get('c'), MAX);
  const [data, setData] = useState<Record<string, Entry>>({});
  const requested = useRef(new Set<string>());
  const [q, setQ] = useState('');

  const setCodes = (next: string[]) => setParams(next.length ? { c: next.join(',') } : {});

  // Fetch each selected country once; results are cached for the session.
  const key = codes.join(',');
  useEffect(() => {
    for (const c of key.split(',').filter(Boolean)) {
      if (requested.current.has(c)) continue;
      requested.current.add(c);
      getJson<CountryProfile>(`/api/countries/${c}`)
        .then((p) => setData((d) => ({ ...d, [c]: p })))
        .catch((e: Error) => setData((d) => ({ ...d, [c]: { error: e.message } })));
    }
  }, [key]);

  const suggestions = searchCountries(q, 6).filter((c) => !codes.includes(c.iso3));
  const profiles = codes.map((c) => data[c]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link to="/countries" className="btn-quiet -ml-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Country dossiers
      </Link>
      <PageHeader eyebrow="Country Intelligence" title="Side-by-side comparison">
        Compare up to four countries across every dossier indicator. Each value shows its own reference year; bars show relative
        size within a row, not whether a value is good or bad.
      </PageHeader>

      <Panel bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {codes.map((c) => (
            <span key={c} className="chip">
              <span className="text-platinum">{countryByIso3(c)?.name ?? c}</span>
              <button aria-label={`Remove ${c}`} className="tap hover:text-down" onClick={() => setCodes(codes.filter((x) => x !== c))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {codes.length < MAX && (
            <div className="relative">
              <Plus className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-dim" aria-hidden />
              <input className="input h-9 w-56 pl-8" placeholder="Add a country…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Add a country to compare" />
              {suggestions.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-line bg-ink-900 py-1 shadow-xl">
                  {suggestions.map((c) => (
                    <li key={c.iso3}>
                      <button
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-ink-800"
                        onClick={() => {
                          setCodes([...codes, c.iso3]);
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
          )}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-dim">
            <ProvenanceBadge kind="confirmed" /> World Bank WDI
          </span>
        </div>
      </Panel>

      {codes.length === 0 ? (
        <p className="mt-6 text-sm text-slate-dim">Add at least two countries to compare.</p>
      ) : (
        <section className="panel mt-4 overflow-x-auto">
          <table className="num w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="w-64 px-4 py-3 text-xs font-medium text-mist">Indicator</th>
                {codes.map((c, i) => {
                  const p = profiles[i];
                  return (
                    <th key={c} className="px-4 py-3 font-sans">
                      <Link to={`/countries/${c}`} className="font-semibold text-platinum hover:text-gold-soft">
                        {p && 'name' in p ? p.name : (countryByIso3(c)?.name ?? c)}
                      </Link>
                      <span className="block text-[11px] font-normal text-slate-dim">
                        {!p ? 'Loading…' : 'error' in p ? `Unavailable: ${p.error}` : (p.region ?? c)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((sec) => (
                <Fragment key={sec.key}>
                  <tr>
                    <td colSpan={codes.length + 1} className="eyebrow bg-ink-850 px-4 py-2">
                      {sec.title}
                    </td>
                  </tr>
                  {INDICATORS.filter((d) => d.section === sec.key).map((d) => {
                    const vals = profiles.map((p) => (p && 'indicators' in p ? p.indicators[d.id] : undefined));
                    const max = Math.max(0, ...vals.map((v) => Math.abs(v?.value ?? 0)));
                    return (
                      <tr key={d.id} className="border-t border-line/50">
                        <td className="px-4 py-2 font-sans text-mist">{d.label}</td>
                        {vals.map((v, i) => (
                          <td key={codes[i]} className="px-4 py-2 align-top">
                            {v ? (
                              <>
                                <span className="text-platinum">{fmtIndicator(v)}</span>
                                {v.date && <span className="ml-1.5 text-[10px] text-slate-dim">{v.date}</span>}
                                {v.value != null && max > 0 && (
                                  <span className="mt-1 block h-1 rounded-full bg-ink-800">
                                    <span className="block h-1 rounded-full bg-gold/60" style={{ width: `${(Math.abs(v.value) / max) * 100}%` }} />
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-dim">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="mt-3 text-xs text-slate-dim">
        Values are each country's most recent non-empty observation; reference years can differ between countries, so compare with
        care. For trends over time use the{' '}
        <Link to="/countries/compare" className="text-gold hover:underline">
          animated comparison
        </Link>
        .
      </p>
    </div>
  );
}
