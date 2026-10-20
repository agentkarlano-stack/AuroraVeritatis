import { Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader, Panel } from '../components/ui';
import { WorldMap } from '../components/WorldMap';
import { COUNTRIES, countryByIso3 } from '../lib/countries';
import { usePrefs } from '../store/prefs';

export default function Countries() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const favorites = usePrefs((s) => s.favorites);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(s) || c.iso3.toLowerCase() === s) : COUNTRIES;
  }, [q]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const c of list) {
      const k = c.name[0]!.toUpperCase();
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Country Intelligence" title="Country dossiers">
        Economic, demographic, infrastructure and security baselines from World Bank Open Data. Select a country on the map or
        search below.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <WorldMap events={[]} highlightIso3={favorites} onCountryClick={(iso3) => navigate(`/countries/${iso3}`)} className="aspect-[96/50] border border-line" />
        <Panel title="Favourites" eyebrow={<Star className="inline h-3 w-3" />}>
          {favorites.length === 0 ? (
            <p className="text-sm text-slate-dim">Star a country in its dossier to pin it here and on your Headquarters.</p>
          ) : (
            <ul className="space-y-1">
              {favorites.map((iso3) => (
                <li key={iso3}>
                  <Link to={`/countries/${iso3}`} className="flex justify-between rounded px-2 py-1.5 text-sm hover:bg-ink-800">
                    <span>{countryByIso3(iso3)?.name ?? iso3}</span>
                    <span className="text-xs text-slate-dim">{iso3}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-dim" aria-hidden />
        <input className="input pl-9" placeholder="Search countries or ISO code…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search countries" />
      </div>
      <p className="mt-2 text-xs text-slate-dim">{list.length} countries and territories</p>

      <div className="mt-4 columns-1 gap-6 sm:columns-2 lg:columns-4">
        {groups.map(([letter, cs]) => (
          <div key={letter} className="mb-4 break-inside-avoid">
            <div className="eyebrow mb-1">{letter}</div>
            <ul>
              {cs.map((c) => (
                <li key={c.iso3}>
                  <Link to={`/countries/${c.iso3}`} className="flex justify-between gap-2 rounded px-1 py-0.5 text-sm text-mist hover:text-platinum">
                    <span className="truncate">{c.name}</span>
                    <span className="text-[11px] text-slate-dim">{c.iso3}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
