import { useEffect, useMemo, useState } from "react";
import { CHOKEPOINTS } from "../../shared/data/chokepoints";
import { EVENT_CATEGORIES, SAMPLE_EVENTS, type EventCategory, type GeoEvent } from "../../shared/data/sampleEvents";
import { DemoTag, Notice, PlannedTag } from "../components/Tags";
import { severityColor, WorldMap, type MapSelection } from "../components/WorldMap";
import { getJson } from "../lib/config";
import { useHqPrefs } from "../lib/prefs";
import { Link } from "../lib/router";

interface EventsResponse {
  demo: boolean;
  notice: string;
  events: GeoEvent[];
}

export function Radar() {
  const { prefs } = useHqPrefs();
  const [events, setEvents] = useState<GeoEvent[]>(SAMPLE_EVENTS);
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const [showChoke, setShowChoke] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [cats, setCats] = useState<Set<EventCategory>>(new Set(EVENT_CATEGORIES));
  const [minSev, setMinSev] = useState(1);
  const [selection, setSelection] = useState<MapSelection>({ kind: "chokepoint", chokepoint: CHOKEPOINTS[0]! });

  // Fetch through the API so the UI exercises the same contract a real feed will use.
  useEffect(() => {
    const ctrl = new AbortController();
    getJson<EventsResponse>("/api/events", ctrl.signal)
      .then((r) => {
        setEvents(r.events);
        setApiNotice(r.notice);
      })
      .catch(() => setApiNotice("Event API unreachable. Showing the bundled sample records."));
    return () => ctrl.abort();
  }, []);

  const filtered = useMemo(
    () => events.filter((e) => cats.has(e.category) && e.severity >= minSev),
    [events, cats, minSev],
  );

  const toggleCat = (c: EventCategory) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <div className="shell">
      <header className="page-head">
        <h1>Global Radar</h1>
        <p>
          Strategic maritime chokepoints and geopolitical event records on one map. Select a chokepoint to see
          how a disruption could reach markets, or a shaded country to open its profile.
        </p>
      </header>

      <Notice>
        <strong>Sample events only.</strong> No live OSINT feed is connected. The diamond markers are fictional placeholder
        records that test the interface; they are not real events. Chokepoint locations and transmission channels are reference material.
      </Notice>

      <div className="split section" style={{ paddingTop: 16 }}>
        <div className="stack">
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <WorldMap
              events={showEvents ? filtered : []}
              showChokepoints={showChoke}
              watched={prefs.watchCountries}
              selection={selection}
              onSelect={setSelection}
              ariaLabel="Interactive world map. Drag to pan, scroll or pinch to zoom."
            />
          </div>
          <div className="legend" aria-label="Legend">
            <span><i className="ring" />Strategic chokepoint</span>
            {[1, 3, 5].map((s) => (
              <span key={s}><i style={{ background: severityColor(s), borderRadius: 1, transform: "rotate(45deg)" }} />Sample event, severity {s}</span>
            ))}
            <span><i style={{ background: "#283a5a" }} />Country with profile</span>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Layers and filters</h2>
            </div>
            <div className="stack-lg">
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <label className="check"><input type="checkbox" checked={showChoke} onChange={(e) => setShowChoke(e.target.checked)} />Chokepoints</label>
                <label className="check"><input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />Sample events</label>
                <span className="check" style={{ cursor: "default" }}><input type="checkbox" disabled />Aircraft <PlannedTag /></span>
                <span className="check" style={{ cursor: "default" }}><input type="checkbox" disabled />Vessels <PlannedTag /></span>
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={!showEvents}>
                <legend className="small muted" style={{ marginBottom: 8 }}>Event categories</legend>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {EVENT_CATEGORIES.map((c) => (
                    <label key={c} className="check"><input type="checkbox" checked={cats.has(c)} onChange={() => toggleCat(c)} />{c}</label>
                  ))}
                </div>
              </fieldset>
              <div className="field" style={{ maxWidth: 320 }}>
                <label htmlFor="min-sev">Minimum severity: {minSev}</label>
                <input id="min-sev" type="range" min={1} max={5} value={minSev} onChange={(e) => setMinSev(Number(e.target.value))} disabled={!showEvents} style={{ accentColor: "var(--champagne)" }} />
              </div>
            </div>
          </div>
        </div>

        <aside className="stack">
          <SelectionPanel selection={selection} />
          <div className="panel">
            <div className="panel-head">
              <h2>Event records</h2>
              <DemoTag>{filtered.length} samples</DemoTag>
            </div>
            {apiNotice && <p className="tiny muted" style={{ marginBottom: 8 }}>{apiNotice}</p>}
            <ul className="event-list">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button
                    aria-pressed={selection?.kind === "event" && selection.event.id === e.id}
                    onClick={() => setSelection({ kind: "event", event: e })}
                  >
                    <span className="sev" style={{ background: severityColor(e.severity) }} />
                    <span>
                      <strong>{e.title}</strong>
                      <span className="tiny muted">{e.category} · {e.region} · severity {e.severity} of 5</span>
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="small muted" style={{ padding: "12px 0" }}>No records match. Widen the filters.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SelectionPanel({ selection }: { selection: MapSelection }) {
  if (!selection) {
    return (
      <div className="panel">
        <p className="muted small">Select a marker or a shaded country on the map.</p>
      </div>
    );
  }
  if (selection.kind === "country") {
    const c = selection.country;
    return (
      <div className="panel">
        <div className="panel-head"><h2>{c.name}</h2></div>
        <dl className="detail-list">
          <div><dt>Capital</dt><dd>{c.capital}</dd></div>
          <div><dt>Region</dt><dd>{c.region}</dd></div>
          <div><dt>Currency</dt><dd>{c.currency}</dd></div>
        </dl>
        <div className="panel-foot"><Link to={`/countries/${c.iso3}`} className="btn btn-sm">Open intelligence profile</Link></div>
      </div>
    );
  }
  if (selection.kind === "event") {
    const e = selection.event;
    return (
      <div className="panel">
        <div className="panel-head"><h2>{e.title}</h2><DemoTag>Sample record</DemoTag></div>
        <p className="small">{e.summary}</p>
        <dl className="detail-list" style={{ marginTop: 14 }}>
          <div><dt>Category</dt><dd>{e.category}</dd></div>
          <div><dt>Severity</dt><dd>{e.severity} of 5</dd></div>
          <div><dt>Source</dt><dd>{e.source.name} (unverified)</dd></div>
        </dl>
        {e.relatedChokepoint && (
          <p className="small muted" style={{ marginTop: 12 }}>
            Linked chokepoint: {CHOKEPOINTS.find((c) => c.id === e.relatedChokepoint)?.name}
          </p>
        )}
      </div>
    );
  }
  const cp = selection.chokepoint;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="stack">
          <h2>{cp.name}</h2>
          <p className="tiny muted">{cp.connects}</p>
        </div>
      </div>
      <p className="small">{cp.significance}</p>
      <h3 style={{ marginTop: 18, marginBottom: 6, fontSize: "1rem" }}>Market Impact Radar</h3>
      <p className="tiny muted" style={{ marginBottom: 6 }}>How a disruption here could transmit. These are mechanisms to examine, not predicted moves.</p>
      <ul className="channel-list">
        {cp.channels.map((ch) => (
          <li key={ch.market}>
            <b>{ch.market}</b>
            <span>{ch.assetClass}. {ch.mechanism}</span>
          </li>
        ))}
      </ul>
      {cp.references.length > 0 && (
        <div className="panel-foot">
          Reference:{" "}
          {cp.references.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer">{r.label}</a>
          ))}
        </div>
      )}
    </div>
  );
}
