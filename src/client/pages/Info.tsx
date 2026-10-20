import { Notice, PlannedTag } from "../components/Tags";
import { Link } from "../lib/router";

const PLANS = [
  { name: "FREE", price: "€0", items: ["Basic global news", "Basic radar layers", "Country summaries", "1 watchlist, 10 assets", "3 AI requests per day"] },
  { name: "PREMIUM", price: "€4.99", items: ["Full news", "Extended radar layers", "Detailed country profiles", "3 watchlists, 25 assets", "15 AI requests per day", "Text and voice briefing"] },
  { name: "PRIME", price: "€12.99", items: ["Full charting toolkit", "10 watchlists, 50 assets", "40 AI requests per day", "Personalised briefing", "Strategy Lab and CSV export"], featured: true },
  { name: "INTELLIGENCE", price: "€24.99", items: ["Maximum licensed radar data", "Advanced country comparisons", "25 watchlists, 100 assets", "100 AI requests per day", "Priority early access"] },
];

export function Plans() {
  return (
    <div className="shell">
      <header className="page-head">
        <h1>Plans</h1>
        <p>Four tiers are proposed. They are product specifications, not services you can buy today, and the limits will change with measured usage and cost.</p>
      </header>
      <Notice><strong>Not yet on sale.</strong> No payments are taken and no paid features are active.</Notice>
      <div className="plans section" style={{ paddingTop: 16 }}>
        {PLANS.map((p) => (
          <section key={p.name} className={`panel plan ${p.featured ? "featured" : ""}`}>
            <h3>{p.name}</h3>
            <div className="price">{p.price}<span className="small muted"> / month</span></div>
            <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            <div className="panel-foot"><PlannedTag /></div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function Roadmap() {
  const phases: [string, string][] = [
    ["Foundation", "Architecture, GitHub, Cloudflare deployment, Supabase schema"],
    ["Headquarters", "Branding and the customisable command centre"],
    ["Global Radar", "Verified OSINT ingestion, aircraft and maritime layers where lawful"],
    ["Country intelligence", "Politics, energy, military and security datasets with sources"],
    ["Prime Terminal", "Licensed market data, indicators, drawing tools, alerts"],
    ["EVE & KNOX", "Source-grounded AI briefings and voice"],
    ["Scenario Desk", "Scenarios, alerts and backtesting at scale"],
    ["Launch", "Subscriptions, security review, testing, public beta"],
  ];
  return (
    <div className="shell" style={{ maxWidth: 860 }}>
      <header className="page-head">
        <h1>Roadmap and data policy</h1>
        <p>What exists today, what is coming, and the rules every dataset on Aurora Veritatis follows.</p>
      </header>
      <div className="section stack-lg" style={{ paddingTop: 0 }}>
        <section className="panel">
          <div className="panel-head"><h2>Data policy</h2></div>
          <ul className="channel-list">
            <li><b>Every figure is dated and sourced</b><span>Indicators show their source, licence and the year they describe.</span></li>
            <li><b>Demonstrations are labelled</b><span>Synthetic market series and sample event records carry a dashed “Demo” tag and a notice wherever they appear.</span></li>
            <li><b>Analysis is not prediction</b><span>The Market Impact Radar describes transmission mechanisms. It does not forecast prices.</span></li>
            <li><b>Coverage has limits</b><span>Aircraft, vessel and military data depend on lawful public sources and will never be complete.</span></li>
            <li><b>Not investment advice</b><span>Aurora Veritatis supports research. It does not execute trades or make recommendations.</span></li>
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Development phases</h2></div>
          <ol className="channel-list" style={{ paddingLeft: 0 }}>
            {phases.map(([t, d], i) => (
              <li key={t} style={{ listStyle: "none" }}>
                <b>{i + 1}. {t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ol>
          <div className="panel-foot">Phase 1 is in progress with this release. <Link to="/">Back to the overview</Link>.</div>
        </section>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="shell section">
      <h1>Page not found</h1>
      <p className="muted" style={{ marginTop: 12 }}>That address does not exist. <Link to="/">Return to the overview</Link> or open <Link to="/hq">Headquarters</Link>.</p>
    </div>
  );
}
