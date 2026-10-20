import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { Link, useRouter } from "../lib/router";
import { AvMonogram } from "./Logo";

export const NAV = [
  { to: "/hq", label: "Headquarters", hint: "Your dashboard" },
  { to: "/radar", label: "Global Radar", hint: "Map of events" },
  { to: "/countries", label: "Countries", hint: "Intelligence profiles" },
  { to: "/markets", label: "Markets", hint: "Economic analysis" },
  { to: "/lab", label: "Research Lab", hint: "Quantitative tools" },
];

function isActive(path: string, to: string) {
  return path === to || path.startsWith(to + "/");
}

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  const { status, session } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  const accountLabel = status === "signed-in" ? (session?.user.email?.split("@")[0] ?? "Account") : "Sign in";

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="shell">
          <Link to="/" className="brand" aria-label="Aurora Veritatis home">
            <AvMonogram size={20} />
            <span className="brand-name">AURORA VERITATIS</span>
          </Link>
          <nav className="nav" aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} aria-current={isActive(path, n.to) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Link to="/account" className="btn btn-sm header-account">{accountLabel}</Link>
          <button
            className="menu-button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>
      <nav id="mobile-nav" className="drawer" data-open={open} aria-label="Mobile">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} aria-current={isActive(path, n.to) ? "page" : undefined}>
            {n.label} <small>{n.hint}</small>
          </Link>
        ))}
        <Link to="/plans">Plans <small>Subscription tiers</small></Link>
        <Link to="/account">{accountLabel} <small>Account</small></Link>
      </nav>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="shell">
          <div className="stack">
            <div className="brand">
              <AvMonogram size={16} />
              <span className="brand-name">AURORA VERITATIS</span>
            </div>
            <p className="tiny">Version 0.1 preview. Sample and synthetic data are labelled throughout. Nothing here is investment advice.</p>
          </div>
          <nav aria-label="Footer">
            <Link to="/plans">Plans</Link>
            <Link to="/roadmap">Roadmap &amp; data policy</Link>
            <Link to="/account">Account</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
