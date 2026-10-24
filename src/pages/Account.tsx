import { useCallback, useState } from 'react';
import { friendlyAuthError } from '../auth/authErrors';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Loading, PageHeader, Panel, Unavailable } from '../components/ui';
import { TIERS } from '../data/tiers';
import { limitOf, useTier } from '../lib/entitlements';
import { usePrefs } from '../store/prefs';
import { useSyncStatus } from '../store/syncStatus';
import { useEntitlements } from '../store/entitlements';
import { useChartLibrary } from '../store/chartLibrary';
import { Avatar } from '../components/Avatar';
import { ProfileEditor, type ProfileRow } from '../components/account/ProfileEditor';
import { SecuritySettings } from '../components/account/SecuritySettings';
import { DevicesPanel } from '../components/account/DevicesPanel';
import { SubscriptionPanel } from '../components/account/SubscriptionPanel';
import { OrganisationCard } from '../components/account/OrganisationCard';
import { INTRO_REPLAY_EVENT } from '../components/IntroSplash';
import { INTRO_EXPERIENCES, resolveIntroExperience } from '../lib/intro';

export default function Account() {
  const { status, session, signOut, config, recovery, urlError, client } = useAuth();
  const [exportState, setExportState] = useState<'idle' | 'working' | 'failed'>('idle');
  const [passwordDone, setPasswordDone] = useState(false);
  const ent = useEntitlements();
  const charts = useChartLibrary();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const onProfile = useCallback((p: ProfileRow) => setProfile(p), []);
  const prefs = usePrefs();
  const tierId = useTier();
  const plan = TIERS.find((t) => t.id === tierId)!;

  if (status === 'loading') return <div className="mx-auto max-w-3xl px-4 py-8"><Loading /></div>;

  /** Everything Aurora holds about the user: this browser's data and, when signed in, the account's cloud records. */
  const exportData = async () => {
    setExportState('working');
    try {
      const { layout, hidden, watchlist, favorites, notes, alerts, chart, drawings } = usePrefs.getState();
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), browser: { layout, hidden, watchlist, favorites, notes, alerts, chart, drawings } };
      if (client && session) {
        const [profile, prefsRow, cloudNotes] = await Promise.all([
          client.from('profiles').select('display_name, tier, created_at, updated_at').eq('id', session.user.id).maybeSingle(),
          client.from('user_preferences').select('data, updated_at').eq('user_id', session.user.id).maybeSingle(),
          client.from('research_notes').select('id, title, body, created_at').eq('user_id', session.user.id).order('created_at', { ascending: false }),
        ]);
        const error = profile.error ?? prefsRow.error ?? cloudNotes.error;
        if (error) throw error;
        out.account = { email: session.user.email, createdAt: session.user.created_at, profile: profile.data, preferences: prefsRow.data, notes: cloudNotes.data };
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = session ? 'aurora-veritatis-account-data.json' : 'aurora-veritatis-preferences.json';
      a.click();
      URL.revokeObjectURL(url);
      setExportState('idle');
    } catch {
      setExportState('failed');
    }
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
        {urlError && (
          <p role="alert" className="rounded-md border border-down/40 p-3 text-sm text-mist">
            {urlError}
          </p>
        )}
        {recovery && <NewPassword onDone={() => setPasswordDone(true)} />}
        {passwordDone && !recovery && (
          <p role="status" className="rounded-md border border-up/40 p-3 text-sm text-up">
            Password updated. Use it the next time you sign in.
          </p>
        )}
        <Panel title="Profile">
          {status === 'signed-in' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm">
                <Avatar name={profile?.display_name} email={session?.user.email} style={profile?.avatar_style} size={48} />
                <div>
                  <div className="text-platinum">{profile?.display_name || session?.user.email}</div>
                  <div className="text-xs text-slate-dim">
                    {session?.user.email} · email verified · {plan.name} plan
                    {ent.isAdmin && <span className="ml-1 rounded border border-gold/50 px-1 text-[10px] uppercase tracking-wider text-gold">Administrator</span>}
                  </div>
                  <SyncLine />
                </div>
              </div>
              <div className="flex gap-2">
                {ent.isAdmin && (
                  <Link to="/admin" className="btn-ghost">
                    Administration
                  </Link>
                )}
                <button className="btn-ghost" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
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

        {status === 'signed-in' && <ProfileEditor onLoaded={onProfile} />}
        {/* During password recovery the user has no current password; only the recovery form is shown. */}
        {status === 'signed-in' && !recovery && <SecuritySettings />}
        {status === 'signed-in' && !recovery && <DevicesPanel />}

        <Panel title="Data stored in this browser" eyebrow={status === 'signed-in' ? 'Synced to your account. Signing out removes this copy from the browser.' : undefined}>
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
            <button className="btn-ghost" onClick={() => void exportData()} disabled={exportState === 'working'}>
              {exportState === 'working' ? 'Preparing…' : status === 'signed-in' ? 'Export my data (JSON)' : 'Export as JSON'}
            </button>
            <button className="btn-ghost hover:border-down hover:text-down" onClick={clearLocal}>
              Delete local data
            </button>
          </div>
          {exportState === 'failed' && (
            <p className="mt-2 text-sm text-down" role="alert">
              The export could not be completed. Check your connection and try again.
            </p>
          )}
        </Panel>

        <Panel title="Plan & usage">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Current plan: <span className="font-semibold text-gold-soft">{plan.name}</span>{' '}
              {ent.grant ? (
                <span className="block text-xs text-slate-dim">
                  Complimentary access granted by an administrator{ent.grant.expires_at ? ` until ${new Date(ent.grant.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. This is not a paid
                  subscription; it returns to Free when it ends.
                </span>
              ) : (
                <span className="block text-xs text-slate-dim">Paid subscriptions are not available yet. Limits on data stored in your account are enforced by the server.</span>
              )}
              {ent.status === 'unavailable' && status === 'signed-in' && <span className="block text-xs text-warn">Plan details become available after a pending database update.</span>}
            </span>
            <Link to="/pricing" className="inline-flex min-h-6 items-center text-xs text-gold hover:underline">
              Compare plans
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-xs">
            {(
              [
                ['Instruments in watchlist', prefs.watchlist.length, limitOf(tierId, 'assetsPerWatchlist')],
                ['Alert rules', prefs.alerts.length, limitOf(tierId, 'alertRules')],
                ['Research notes', prefs.notes.length, limitOf(tierId, 'researchNotes')],
                ['Saved charts', charts.layouts.length, limitOf(tierId, 'savedCharts')],
                ['Chart templates', charts.templates.length, limitOf(tierId, 'chartTemplates')],
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
            <Unavailable phase="planned">Payments are switched off. Billing history, invoices and self-service plan changes will appear here once paid plans launch.</Unavailable>
          </div>
        </Panel>

        {status === 'signed-in' && <SubscriptionPanel />}
        {status === 'signed-in' && <OrganisationCard />}

        <IntroPreferences />

        {status === 'signed-in' && <DeleteAccount />}

        <p className="text-xs text-slate-dim">Environment: {config?.environment ?? 'unknown'}</p>
      </div>
    </div>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
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
            setPw('');
            // Recovery ends here, which removes this panel; the page shows the confirmation instead.
            onDone();
          } catch (err) {
            setMsg({ ok: false, text: friendlyAuthError(err) });
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

/**
 * GDPR erasure: deletes the Supabase account and, through cascading keys, its profile, synced preferences and notes.
 * The server requires a sign-in within the last 10 minutes, so the password is confirmed first.
 */
function DeleteAccount() {
  const { client, session, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'deleting' | 'failed'; text?: string }>({ kind: 'idle' });
  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = session?.user.email;
    if (!client || !email) return;
    if (!confirm('Delete your account permanently? Your profile, synced preferences and cloud notes are erased. This cannot be undone.')) return;
    setState({ kind: 'deleting' });
    if (password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) return setState({ kind: 'failed', text: 'That password is not correct.' });
    }
    const { error } = await client.rpc('delete_my_account');
    if (error) {
      return setState({
        kind: 'failed',
        text: /recent sign-in/i.test(error.message)
          ? 'For your security, confirm your password first. If you signed in with an email link, sign out, sign in again with a new link and delete within 10 minutes.'
          : 'The account could not be deleted. Try again, or contact us from the legal notice page.',
      });
    }
    setPassword('');
    await signOut().catch(() => {});
  };
  return (
    <Panel title="Delete account">
      <p className="text-sm text-mist">Erases your account and everything synced to it. This cannot be undone.</p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => void remove(e)}>
        <input
          type="password"
          autoComplete="current-password"
          className="input max-w-xs"
          placeholder="Confirm your password"
          aria-label="Confirm your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-ghost hover:border-down hover:text-down" disabled={!client || state.kind === 'deleting'}>
          {state.kind === 'deleting' ? 'Deleting…' : 'Delete my account'}
        </button>
      </form>
      {state.kind === 'failed' && (
        <p className="mt-2 text-sm text-down" role="alert">
          {state.text}
        </p>
      )}
    </Panel>
  );
}

function SyncLine() {
  const sync = useSyncStatus();
  const label = {
    off: 'Cloud sync off',
    syncing: 'Syncing preferences…',
    synced: `Preferences synced${sync.at ? ` · ${new Date(sync.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`,
    skipped: 'Sync paused',
    error: 'Sync failed',
  }[sync.state];
  const tone = sync.state === 'error' ? 'text-down' : sync.state === 'skipped' ? 'text-warn' : sync.state === 'synced' ? 'text-up' : 'text-slate-dim';
  return (
    <div className={`mt-1 text-xs ${tone}`} role="status">
      {label}
      {sync.message && <span className="block text-slate-dim">{sync.message}</span>}
      <span className="block text-[11px] text-slate-dim">Watchlist, layout, alerts, favourites, chart settings, drawings and research notes sync across devices.</span>
    </div>
  );
}

/** Introduction experience (lib/intro.ts): three choices plus the automatic default, with previews. Synced with the account. */
function IntroPreferences() {
  const prefs = usePrefs();
  const chosen = resolveIntroExperience(prefs.intro, prefs.introChoice, prefs.introMode);
  const preview = (which: 'brand' | 'cinematic') => window.dispatchEvent(new CustomEvent(INTRO_REPLAY_EVENT, { detail: which }));
  return (
    <Panel title="Introduction" eyebrow="Preferences">
      <fieldset>
        <legend className="sr-only">Introduction experience</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {INTRO_EXPERIENCES.map((m) => (
            <label key={m.id} className={`flex cursor-pointer gap-2 rounded-md border p-3 text-sm ${chosen === m.id ? 'border-gold-dim bg-gold/5' : 'border-line'}`}>
              <input type="radio" name="intro-experience" className="mt-1 accent-[#c9a35a]" checked={chosen === m.id} onChange={() => prefs.setIntro(m.id)} />
              <span>
                <span className="text-platinum">{m.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-dim">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 text-[11px] text-slate-dim">
        {chosen === null ? (
          'Not chosen yet: automatic. The cinematic intro plays on your first visit on a device, and the brand intro on later visits.'
        ) : (
          <>
            Your choice is saved{prefs.intro !== null ? ' and synced with your account when you are signed in' : ''}.{' '}
            <button className="btn-quiet px-0 text-[11px] text-gold hover:underline" onClick={() => prefs.setIntro(null)}>
              Use automatic instead
            </button>
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-ghost text-xs" onClick={() => preview('brand')}>
          Preview Brand Intro
        </button>
        <button className="btn-ghost text-xs" onClick={() => preview('cinematic')}>
          Preview Cinematic Intro
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-dim">
        Introductions are silent, can always be skipped (button or Esc) and never play when your device asks for reduced motion, on reloads or when you
        move between pages. With data saver on, the brand intro replaces the film.
      </p>
    </Panel>
  );
}
