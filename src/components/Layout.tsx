import { Menu, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Wordmark } from './Logo';

const NAV = [
  { to: '/hq', label: 'Headquarters' },
  { to: '/radar', label: 'Conflict Radar' },
  { to: '/countries', label: 'Countries' },
  { to: '/markets', label: 'Markets' },
  { to: '/lab', label: 'Research Lab' },
];

const LEGAL = [
  ['terms', 'Terms'],
  ['privacy', 'Privacy'],
  ['cookies', 'Cookies'],
  ['disclaimer', 'Risk disclaimer'],
  ['ai', 'AI transparency'],
  ['subscriptions', 'Subscriptions & refunds'],
  ['imprint', 'Legal notice'],
] as const;

export function Layout() {
  const { pathname } = useLocation();
  // The menu remembers the path it was opened on, so navigating closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean) => setOpenAt(v ? pathname : null);
  const { status, session } = useAuth();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenAt(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm transition-colors ${isActive ? 'text-gold-soft' : 'text-mist hover:text-platinum'}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-navy-950">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-navy-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Link to="/" aria-label="Aurora Veritatis home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navCls}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <NavLink to="/pricing" className={(s) => `${navCls(s)} hidden sm:block`}>
              Plans
            </NavLink>
            <Link to={status === 'signed-in' ? '/account' : '/signin'} className="btn-ghost hidden sm:inline-flex" aria-label="Account">
              <UserRound className="h-4 w-4" aria-hidden />
              {status === 'signed-in' ? (session?.user.email?.split('@')[0] ?? 'Account') : 'Sign in'}
            </Link>
            <button className="btn-quiet lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line bg-navy-950 px-4 py-3 lg:hidden" aria-label="Mobile">
            {[...NAV, { to: '/pricing', label: 'Plans' }, { to: status === 'signed-in' ? '/account' : '/signin', label: status === 'signed-in' ? 'Account' : 'Sign in' }].map((n) => (
              <NavLink key={n.to} to={n.to} className={(s) => `block ${navCls(s)}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-line bg-navy-950">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-slate-dim">
              Research and analysis platform. Nothing on Aurora Veritatis is investment advice. Simulated data is always labelled as such.
            </p>
            <a className="mt-3 inline-block text-xs text-gold hover:text-gold-soft" href="mailto:auroraveritatissup@gmail.com">
              auroraveritatissup@gmail.com
            </a>
          </div>
          <div>
            <div className="eyebrow mb-3">Platform</div>
            <ul className="space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link className="text-mist hover:text-platinum" to={n.to}>
                    {n.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link className="text-mist hover:text-platinum" to="/status">
                  Platform status &amp; data sources
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-3">Legal (drafts)</div>
            <ul className="space-y-2 text-sm">
              {LEGAL.map(([slug, label]) => (
                <li key={slug}>
                  <Link className="text-mist hover:text-platinum" to={`/legal/${slug}`}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-line py-4 text-center text-[11px] text-slate-dim">
          © {new Date().getFullYear()} Aurora Veritatis · aurorav.app · Charts by{' '}
          <a className="hover:text-mist" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
            TradingView Lightweight Charts™
          </a>{' '}
          · Map data: Natural Earth
        </div>
      </footer>
    </div>
  );
}
