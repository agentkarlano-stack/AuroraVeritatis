import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Loading, PageHeader, Panel, Unavailable } from '../components/ui';
import { TIERS } from '../data/tiers';
import { limitOf, useTier } from '../lib/entitlements';
import { usePrefs } from '../store/prefs';

export default function Account() {
  const { status, session, signOut, config, recovery } = useAuth();
  const prefs = usePrefs();
  const tierId = useTier();
  const plan = TIERS.find((t) => t.id === tierId)!;

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
        {recovery && <NewPassword />}
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

        <Panel title="Plan & usage">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Current plan: <span className="font-semibold text-gold-soft">{plan.name}</span>{' '}
              <span className="text-xs text-slate-dim">(early-access preview — all features unlocked, Free limits apply)</span>
            </span>
            <Link to="/pricing" className="text-xs text-gold hover:underline">
              Compare plans
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-xs">
            {(
              [
                ['Instruments in watchlist', prefs.watchlist.length, limitOf(tierId, 'assetsPerWatchlist')],
                ['Alert rules', prefs.alerts.length, limitOf(tierId, 'alertRules')],
              ] as const
            ).map(([k, used, max]) => (
              <li key={k}>
                <div className="flex justify-between">
                  <span className="text-mist">{k}</span>
                  <span className="num">
                    {used} / {max}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-ink-800">
                  <div className={`h-1.5 rounded-full ${used >= max ? 'bg-warn' : 'bg-gold/70'}`} style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Unavailable phase="Phase 5">Billing history, invoices, plan changes and cancellation will appear here once subscriptions launch.</Unavailable>
          </div>
        </Panel>

        <Panel title="Preferences">
          <button className="btn-ghost" onClick={prefs.replayIntro}>
            Replay intro on next visit to the homepage
          </button>
        </Panel>

        <p className="text-xs text-slate-dim">Environment: {config?.environment ?? 'unknown'}</p>
      </div>
    </div>
  );
}

function NewPassword() {
  const { updatePassword } = useAuth();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Panel title="Set a new password" eyebrow="Password recovery">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 10) return setMsg({ ok: false, text: 'Passwords must be at least 10 characters.' });
          try {
            await updatePassword(pw);
            setMsg({ ok: true, text: 'Password updated.' });
            setPw('');
          } catch (err) {
            setMsg({ ok: false, text: (err as Error).message });
          }
        }}
      >
        <input type="password" autoComplete="new-password" className="input max-w-xs" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" minLength={10} required />
        <button className="btn-primary">Update password</button>
      </form>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}
    </Panel>
  );
}
