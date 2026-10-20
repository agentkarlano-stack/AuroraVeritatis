import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Loading, PageHeader, Panel, Unavailable } from '../components/ui';
import { usePrefs } from '../store/prefs';

export default function Account() {
  const { status, session, signOut, config } = useAuth();
  const prefs = usePrefs();

  if (status === 'loading') return <div className="mx-auto max-w-3xl px-4 py-8"><Loading /></div>;

  const exportData = () => {
    const { layout, hidden, watchlist, favorites, notes, alerts } = prefs;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), layout, hidden, watchlist, favorites, notes, alerts }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aurora-veritatis-preferences.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLocal = () => {
    if (!confirm('Delete all preferences, notes and alerts stored in this browser?')) return;
    localStorage.removeItem('av-prefs-v1');
    location.reload();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader eyebrow="Account" title={status === 'signed-in' ? 'Your account' : 'Guest session'} />
      <div className="space-y-4">
        <Panel title="Profile">
          {status === 'signed-in' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="text-platinum">{session?.user.email}</div>
                <div className="text-xs text-slate-dim">Plan: Free preview</div>
              </div>
              <button className="btn-ghost" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-mist">
              <span>{status === 'unconfigured' ? 'Accounts are not enabled in this environment yet.' : 'You are browsing as a guest.'}</span>
              {status === 'signed-out' && (
                <Link to="/signin" className="btn-primary">
                  Sign in
                </Link>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Data stored in this browser">
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(
              [
                ['Watchlist', prefs.watchlist.length],
                ['Favourite countries', prefs.favorites.length],
                ['Notes', prefs.notes.length],
                ['Alert rules', prefs.alerts.length],
              ] as const
            ).map(([k, v]) => (
              <li key={k} className="rounded-md border border-line p-3">
                <div className="num text-xl font-semibold">{v}</div>
                <div className="text-xs text-slate-dim">{k}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={exportData}>
              Export as JSON
            </button>
            <button className="btn-ghost hover:border-down hover:text-down" onClick={clearLocal}>
              Delete local data
            </button>
          </div>
        </Panel>

        <Panel title="Subscription">
          <Unavailable phase="Phase 5">Billing, invoices and plan changes will appear here once subscriptions launch.</Unavailable>
        </Panel>

        <p className="text-xs text-slate-dim">Environment: {config?.environment ?? 'unknown'}</p>
      </div>
    </div>
  );
}
