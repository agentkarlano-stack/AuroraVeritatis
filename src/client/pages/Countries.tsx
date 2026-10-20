import { useEffect, useMemo, useState } from "react";
import { COUNTRIES, countryByIso3, REGIONS, REGISTRY_REVIEWED, type Region } from "../../shared/data/countries";
import { PROFILE_INDICATORS, type HistoryPoint, type IndicatorValue } from "../../shared/worldbank";
import { BarChart } from "../components/charts";
import { Notice, PlannedTag, SourceTag } from "../components/Tags";
import { getJson } from "../lib/config";
import { formatIndicator } from "../lib/format";
import { useHqPrefs } from "../lib/prefs";
import { Link } from "../lib/router";

export function CountryIndex() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<Region | "">("");
  const list = useMemo(
    () =>
      COUNTRIES.filter(
        (c) =>
          (!region || c.region === region) &&
          (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.iso3.toLowerCase() === q.toLowerCase()),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [q, region],
  );
  return (
    <div className="shell">
      <header className="page-head">
        <h1>Country intelligence</h1>
        <p>
          Profiles for {COUNTRIES.length} countries. Each indicator is retrieved from World Bank Open Data and shown with its year,
          so you can see how current it is. More countries and data categories will follow.
        </p>
      </header>
      <div className="filters">
        <input className="input" type="search" placeholder="Search by name or ISO code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search countries" />
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value as Region | "")} aria-label="Filter by region" style={{ maxWidth: 260 }}>
          <option value="">All regions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="small muted">{list.length} shown</span>
      </div>
      <div className="country-grid section" style={{ paddingTop: 0 }}>
        {list.map((c) => (
          <Link key={c.iso3} to={`/countries/${c.iso3}`} className="country-item">
            <strong>{c.name}</strong>
            <span>{c.region} · {c.iso3}</span>
          </Link>
        ))}
        {list.length === 0 && <p className="muted" style={{ padding: "16px 0" }}>No countries match. Clear the search or choose another region.</p>}
      </div>
    </div>
  );
}

interface IndicatorsResponse {
  covered: boolean;
  retrievedAt: string;
  indicators: IndicatorValue[];
  history: Record<string, HistoryPoint[]>;
  errors: string[];
  source: { name: string; url: string; licence: string };
}

type Load = { state: "loading" } | { state: "ok"; data: IndicatorsResponse } | { state: "error"; message: string };

const PLANNED_SECTIONS: [string, string][] = [
  ["Politics", "Government, parties, elections, opinion polling"],
  ["Demographics", "Ethnic composition, religion, age structure"],
  ["Energy", "Production, imports, electricity mix"],
  ["Military", "Personnel, aircraft, naval assets, equipment"],
  ["Strategic assets", "Public satellite counts, industrial capacity"],
  ["Security", "Conflicts, sanctions, geopolitical risk score"],
];

export function CountryProfile({ iso3 }: { iso3: string }) {
  const country = countryByIso3(iso3);
  const { prefs, update } = useHqPrefs();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (!country) return;
    setLoad({ state: "loading" });
    const ctrl = new AbortController();
    getJson<IndicatorsResponse>(`/api/countries/${country.iso3}/indicators`, ctrl.signal)
      .then((data) => setLoad({ state: "ok", data }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setLoad({ state: "error", message: "The indicator service could not be reached. Try again shortly." });
      });
    return () => ctrl.abort();
  }, [country]);

  if (!country) {
    return (
      <div className="shell section">
        <h1>Country not found</h1>
        <p className="muted" style={{ marginTop: 12 }}>There is no profile for “{iso3}” yet. <Link to="/countries">Browse all profiles</Link>.</p>
      </div>
    );
  }

  const watched = prefs.watchCountries.includes(country.iso3);
  const byCat = (cat: string) => (load.state === "ok" ? load.data.indicators.filter((i) => i.category === cat) : []);

  return (
    <div className="shell">
      <header className="page-head">
        <p className="small"><Link to="/countries">Countries</Link> / {country.region}</p>
        <div className="page-head-row">
          <h1>{country.name}</h1>
          <button className="btn btn-sm" aria-pressed={watched} onClick={() => update((p) => ({ ...p, watchCountries: watched ? p.watchCountries.filter((x) => x !== country.iso3) : [...p.watchCountries, country.iso3] }))}>
            {watched ? "Remove from watchlist" : "Add to watchlist"}
          </button>
        </div>
      </header>

      <div className="split section" style={{ paddingTop: 0 }}>
        <div className="stack-lg">
          <section className="panel">
            <div className="panel-head">
              <h2>Key indicators</h2>
              <SourceTag>World Bank WDI</SourceTag>
            </div>
            {!country.worldBank && <Notice>{country.note}</Notice>}
            {country.worldBank && load.state === "loading" && <p className="muted small">Retrieving indicators…</p>}
            {load.state === "error" && <Notice tone="error">{load.message}</Notice>}
            {load.state === "ok" && load.data.covered && load.data.indicators.length === 0 && (
              <Notice tone="error">World Bank Open Data could not be reached, so no indicators are shown. Try again shortly.</Notice>
            )}
            {load.state === "ok" && load.data.covered && load.data.indicators.length > 0 && (
              <>
                <div className="stat-grid">
                  {PROFILE_INDICATORS.map((def) => {
                    const v = load.data.indicators.find((i) => i.id === def.id);
                    return (
                      <div className="stat" key={def.id}>
                        <span className="stat-label">{def.label}</span>
                        <span className="stat-value">{formatIndicator(v?.value ?? null, def.format)}</span>
                        <span className="stat-meta">{!v ? "Could not be retrieved" : v.year ? `Latest available: ${v.year}` : "No recent value published"}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="panel-foot">
                  Source: <a href={load.data.source.url} target="_blank" rel="noopener noreferrer">{load.data.source.name}</a>, licence {load.data.source.licence}.
                  Retrieved {new Date(load.data.retrievedAt).toUTCString()}. Values are annual and may lag by one to two years.
                  {load.data.errors.length > 0 && ` ${load.data.errors.length} series could not be retrieved.`}
                </div>
              </>
            )}
          </section>

          {load.state === "ok" && load.data.covered && Object.keys(load.data.history).length > 0 && (
            <div className="grid grid-2">
              <HistoryPanel title="Real GDP growth" unit="% per year" points={load.data.history["NY.GDP.MKTP.KD.ZG"] ?? []} />
              <HistoryPanel title="Consumer price inflation" unit="% per year" points={load.data.history["FP.CPI.TOTL.ZG"] ?? []} />
            </div>
          )}

          {load.state === "ok" && (byCat("Military").length > 0 || byCat("Infrastructure").length > 0) && (
            <p className="tiny muted">Military expenditure data in WDI originates from SIPRI. Internet usage data originates from the ITU.</p>
          )}
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Reference</h2></div>
            <dl className="detail-list">
              <div><dt>Capital</dt><dd>{country.capital}</dd></div>
              <div><dt>Region</dt><dd>{country.region}</dd></div>
              <div><dt>Currency</dt><dd>{country.currency}</dd></div>
              <div><dt>ISO codes</dt><dd>{country.iso2} / {country.iso3} / {country.numeric}</dd></div>
              <div><dt>Memberships</dt><dd>{country.memberships.length ? country.memberships.join(", ") : "—"}</dd></div>
            </dl>
            {country.note && country.worldBank && <p className="tiny muted" style={{ marginTop: 12 }}>{country.note}</p>}
            <div className="panel-foot">Reference data reviewed {REGISTRY_REVIEWED}.</div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Coming to profiles</h2></div>
            <ul className="planned-list">
              {PLANNED_SECTIONS.map(([k, v]) => (
                <li key={k}><span>{k}<br /><span className="tiny muted">{v}</span></span><PlannedTag /></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function HistoryPanel({ title, unit, points }: { title: string; unit: string; points: HistoryPoint[] }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="stack">
          <h3>{title}</h3>
          <span className="tiny muted">{unit}{points.length ? `, ${points[0]!.year}–${points[points.length - 1]!.year}` : ""}</span>
        </div>
      </div>
      {points.length > 1 ? (
        <BarChart bars={points.map((p) => ({ label: String(p.year), value: p.value }))} yFormat={(v) => `${v.toFixed(0)}%`} ariaLabel={`${title}, annual values`} />
      ) : (
        <p className="small muted">No published history for this series.</p>
      )}
      <div className="panel-foot">Source: World Bank WDI. Negative years shown in red.</div>
    </section>
  );
}
