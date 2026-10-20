import { useMemo, useState, type ReactNode } from "react";
import { CHOKEPOINTS } from "../../shared/data/chokepoints";
import { COUNTRIES, countryByIso3 } from "../../shared/data/countries";
import { DEMO_INSTRUMENTS, demoSeries } from "../../shared/data/demoMarkets";
import { SAMPLE_EVENTS } from "../../shared/data/sampleEvents";
import { Sparkline } from "../components/charts";
import { DemoTag, PlannedTag, SourceTag } from "../components/Tags";
import { WorldMap } from "../components/WorldMap";
import { useAuth } from "../lib/auth";
import { pct } from "../lib/format";
import { useHqPrefs, type WidgetId } from "../lib/prefs";
import { Link, useRouter } from "../lib/router";

const TITLES: Record<WidgetId, string> = {
  briefing: "Daily briefing",
  watchlist: "Country watchlist",
  radar: "Radar overview",
  markets: "Market monitor",
  chokepoints: "Chokepoint register",
  status: "Platform status",
};

const WIDE: WidgetId[] = ["radar"];

export function Headquarters() {
  const { prefs, update, sync } = useHqPrefs();
  const { status } = useAuth();
  const [editing, setEditing] = useState(false);

  const visible = prefs.order.filter((id) => editing || !prefs.hidden.includes(id));

  const move = (id: WidgetId, dir: -1 | 1) =>
    update((p) => {
      const order = [...p.order];
      const i = order.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= order.length) return p;
      [order[i], order[j]] = [order[j]!, order[i]!];
      return { ...p, order };
    });

  const toggle = (id: WidgetId) =>
    update((p) => ({ ...p, hidden: p.hidden.includes(id) ? p.hidden.filter((h) => h !== id) : [...p.hidden, id] }));

  const syncText =
    status === "signed-in"
      ? { local: "Saved on this device", syncing: "Syncing…", synced: "Synced to your account", error: "Sync failed — saved on this device" }[sync]
      : "Saved on this device. Sign in to sync across devices.";

  return (
    <div className="shell">
      <header className="page-head">
        <div className="page-head-row">
          <div className="stack">
            <h1>Headquarters</h1>
            <p>Your personal command centre. Arrange the widgets and choose the countries you follow.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="tiny muted">{syncText}</span>
            <button className="btn btn-sm" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
              {editing ? "Done" : "Customise layout"}
            </button>
          </div>
        </div>
      </header>

      <div className="hq-grid section" style={{ paddingTop: 0 }}>
        {visible.map((id) => {
          const idx = prefs.order.indexOf(id);
          const hidden = prefs.hidden.includes(id);
          return (
            <section key={id} className={`panel ${WIDE.includes(id) ? "wide" : ""}`} style={hidden ? { opacity: 0.45 } : undefined} aria-label={TITLES[id]}>
              <div className="panel-head">
                <h2>{TITLES[id]}</h2>
                {editing && (
                  <div className="widget-tools">
                    <button className="icon-btn" aria-label={`Move ${TITLES[id]} earlier`} disabled={idx === 0} onClick={() => move(id, -1)}>↑</button>
                    <button className="icon-btn" aria-label={`Move ${TITLES[id]} later`} disabled={idx === prefs.order.length - 1} onClick={() => move(id, 1)}>↓</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggle(id)}>{hidden ? "Show" : "Hide"}</button>
                  </div>
                )}
              </div>
              {!hidden && <Widget id={id} />}
              {hidden && <p className="small muted">Hidden. Select Show to restore it.</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Widget({ id }: { id: WidgetId }): ReactNode {
  switch (id) {
    case "briefing":
      return <BriefingWidget />;
    case "watchlist":
      return <WatchlistWidget />;
    case "radar":
      return <RadarWidget />;
    case "markets":
      return <MarketsWidget />;
    case "chokepoints":
      return <ChokepointWidget />;
    case "status":
      return <StatusWidget />;
  }
}

function BriefingWidget() {
  const { prefs, update } = useHqPrefs();
  return (
    <div className="stack-lg">
      <div className="agent-card">
        <div className="agent-mark" aria-hidden="true">{prefs.agent}</div>
        <div className="stack">
          <p>
            {prefs.agent === "EVE"
              ? "EVE will prepare composed geopolitical briefings and research summaries."
              : "KNOX will deliver concise strategic, financial and risk assessments."}
          </p>
          <p className="small muted">Automated briefings need verified source ingestion and the AI backend. Neither is connected yet, so no briefing is generated.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="segmented" role="group" aria-label="Preferred analyst">
          {(["EVE", "KNOX"] as const).map((a) => (
            <button key={a} aria-pressed={prefs.agent === a} onClick={() => update((p) => ({ ...p, agent: a }))}>{a}</button>
          ))}
        </div>
        <PlannedTag>AI briefings planned</PlannedTag>
      </div>
    </div>
  );
}

function WatchlistWidget() {
  const { prefs, update } = useHqPrefs();
  const [adding, setAdding] = useState("");
  const options = COUNTRIES.filter((c) => !prefs.watchCountries.includes(c.iso3));
  return (
    <div className="stack-lg">
      <div className="chips">
        {prefs.watchCountries.length === 0 && <p className="small muted">No countries yet. Add one below.</p>}
        {prefs.watchCountries.map((iso) => {
          const c = countryByIso3(iso);
          if (!c) return null;
          return (
            <span className="chip" key={iso}>
              <Link to={`/countries/${iso}`}>{c.name}</Link>
              <button aria-label={`Remove ${c.name}`} onClick={() => update((p) => ({ ...p, watchCountries: p.watchCountries.filter((x) => x !== iso) }))}>×</button>
            </span>
          );
        })}
      </div>
      <form
        style={{ display: "flex", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding) return;
          update((p) => ({ ...p, watchCountries: [...p.watchCountries, adding] }));
          setAdding("");
        }}
      >
        <label className="sr-only" htmlFor="watch-add" style={{ position: "absolute", left: -9999 }}>Add country</label>
        <select id="watch-add" className="input" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Add a country…</option>
          {options.map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}
        </select>
        <button className="btn" type="submit" disabled={!adding}>Add</button>
      </form>
    </div>
  );
}

function RadarWidget() {
  const { prefs } = useHqPrefs();
  const { navigate } = useRouter();
  return (
    <div className="stack">
      <WorldMap
        interactive={false}
        events={SAMPLE_EVENTS}
        watched={prefs.watchCountries}
        ariaLabel="Overview map with your watched countries highlighted"
        onSelect={(s) => (s?.kind === "country" ? navigate(`/countries/${s.country.iso3}`) : navigate("/radar"))}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <DemoTag>Diamond markers are sample events</DemoTag>
        <Link to="/radar" className="btn btn-sm">Open Global Radar</Link>
      </div>
    </div>
  );
}

function MarketsWidget() {
  const rows = useMemo(
    () =>
      DEMO_INSTRUMENTS.slice(0, 5).map((inst) => {
        const s = demoSeries(inst, 120);
        const last = s[s.length - 1]!;
        return { inst, s, last, chg: last / s[s.length - 21]! - 1 };
      }),
    [],
  );
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Series</th><th className="num">Level</th><th className="num">20-day</th><th aria-label="Trend" /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.inst.symbol}>
                <td>{r.inst.name}</td>
                <td className="num">{r.last.toFixed(2)}</td>
                <td className={`num ${r.chg >= 0 ? "pos" : "neg"}`}>{pct(r.chg)}</td>
                <td><Sparkline values={r.s.slice(-60)} width={90} height={24} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-foot" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <DemoTag>Synthetic series, not market prices</DemoTag>
        <Link to="/markets">Open Markets</Link>
      </div>
    </div>
  );
}

function ChokepointWidget() {
  return (
    <ul className="channel-list">
      {CHOKEPOINTS.slice(0, 5).map((c) => (
        <li key={c.id}>
          <b>{c.name}</b>
          <span>{c.connects}</span>
        </li>
      ))}
      <li><Link to="/radar">View all {CHOKEPOINTS.length} on the Global Radar</Link></li>
    </ul>
  );
}

function StatusWidget() {
  const { config } = useAuth();
  const f = config?.features;
  const rows: [string, ReactNode][] = [
    ["Country indicators", <SourceTag key="a">World Bank WDI, live</SourceTag>],
    ["Accounts", f?.auth ? <SourceTag key="b">Supabase connected</SourceTag> : <PlannedTag key="b">Not configured</PlannedTag>],
    ["OSINT event feed", <PlannedTag key="c">Planned, samples shown</PlannedTag>],
    ["Market data", <PlannedTag key="d">Planned, synthetic shown</PlannedTag>],
    ["EVE & KNOX", <PlannedTag key="e">Planned</PlannedTag>],
    ["Subscriptions", <PlannedTag key="f">Planned</PlannedTag>],
  ];
  return (
    <ul className="planned-list">
      {rows.map(([k, v]) => (
        <li key={k}><span>{k}</span>{v}</li>
      ))}
    </ul>
  );
}
