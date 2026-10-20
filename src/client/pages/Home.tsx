import { Lockup } from "../components/Logo";
import { DemoTag, PlannedTag, SourceTag } from "../components/Tags";
import { WorldMap } from "../components/WorldMap";
import { Link, useRouter } from "../lib/router";

type Status = "working" | "demo" | "planned";

const MODULES: { to?: string; title: string; text: string; status: Status; note: string }[] = [
  { to: "/hq", title: "Headquarters", text: "Your command centre: arrange widgets, track countries, keep a watchlist.", status: "working", note: "Layout saved on this device; synced when signed in" },
  { to: "/radar", title: "Global Radar", text: "Strategic chokepoints and geopolitical events on an interactive world map.", status: "demo", note: "Chokepoints are reference data; events are samples" },
  { to: "/countries", title: "Country Intelligence", text: "Profiles with economic, demographic and defence indicators, each dated and sourced.", status: "working", note: "Live indicators from World Bank Open Data" },
  { to: "/markets", title: "Markets & Economics", text: "Cross-asset charts, correlations and the Market Impact Radar framework.", status: "demo", note: "Charts use synthetic series until a data licence is in place" },
  { to: "/lab", title: "Quantitative Research Lab", text: "Indicators and strategy backtests on demo series or your own CSV.", status: "working", note: "Calculations run in your browser" },
  { title: "EVE & KNOX", text: "AI analysts for briefings, source comparison and scenario planning.", status: "planned", note: "Not yet available" },
];

function StatusTag({ status, note }: { status: Status; note: string }) {
  if (status === "working") return <SourceTag>{note}</SourceTag>;
  if (status === "demo") return <DemoTag>{note}</DemoTag>;
  return <PlannedTag>{note}</PlannedTag>;
}

export function Home() {
  const { navigate } = useRouter();
  return (
    <>
      <section className="hero">
        <div className="shell stack-lg">
          <Lockup />
          <p className="hero-line">See the world. Understand its impact.</p>
          <div className="hero-actions">
            <Link to="/hq" className="btn btn-primary">Open Headquarters</Link>
            <Link to="/radar" className="btn">Explore the Global Radar</Link>
          </div>
        </div>
        <div className="hero-map">
          <div className="shell">
            <WorldMap
              interactive={false}
              ariaLabel="World map with strategic maritime chokepoints. Select one to open the Global Radar."
              onSelect={(s) => {
                if (s?.kind === "country") navigate(`/countries/${s.country.iso3}`);
                else navigate("/radar");
              }}
            />
          </div>
        </div>
        <div className="shell" style={{ paddingTop: 10 }}>
          <p className="tiny muted">
            Gold rings mark strategic maritime chokepoints (reference locations). Shaded countries have intelligence profiles.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="shell stack-lg">
          <div className="stack measure">
            <h2>One workspace from event to market consequence</h2>
            <p className="muted">
              Aurora Veritatis connects geopolitical developments to the countries, assets and markets they touch.
              This first release lays the foundation. Every module states plainly what is live, what is a demonstration and what is still planned.
            </p>
          </div>
          <div className="module-list">
            {MODULES.map((m) => {
              const body = (
                <>
                  <h3>{m.title}</h3>
                  <p>{m.text}</p>
                  <div className="module-status"><StatusTag status={m.status} note={m.note} /></div>
                </>
              );
              return m.to ? (
                <Link key={m.title} to={m.to} className="module">{body}</Link>
              ) : (
                <div key={m.title} className="module">{body}</div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell stack-lg">
          <h2>The analytical workflow</h2>
          <ol className="workflow">
            <li><h3>Locate</h3><p className="muted small">Spot a development on the Global Radar.</p></li>
            <li><h3>Profile</h3><p className="muted small">Review the countries and strategic assets involved.</p></li>
            <li><h3>Transmit</h3><p className="muted small">Trace the channels through to commodities, equities and currencies.</p></li>
            <li><h3>Test</h3><p className="muted small">Quantify the patterns in the Research Lab before forming a view.</p></li>
          </ol>
        </div>
      </section>
    </>
  );
}
