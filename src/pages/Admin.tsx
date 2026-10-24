import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { TIERS, type TierId } from '../data/tiers';
import { Loading, PageHeader, Panel } from '../components/ui';
import { refreshEntitlements, useEntitlements } from '../store/entitlements';
import { runAdminSelfCheck, summarize, type StepResult } from '../lib/adminSelfCheck';
import { PERIODS, type PeriodMonths } from '../lib/billing';
import { isMissingFunction } from '../lib/sessions';
import { OrganisationsAdmin } from '../components/admin/OrganisationsAdmin';

interface Stats {
  users: number;
  confirmed: number;
  new_7d: number;
  new_30d: number;
  active_7d: number;
  admins: number;
  grants: Record<string, number>;
  research_notes: number;
  synced_preferences: number;
  at: string;
}
interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  display_name: string | null;
  tier: TierId;
  grant_expires_at: string | null;
  is_admin: boolean;
}
interface GrantRow {
  id: string;
  user_id: string;
  email: string | null;
  tier: TierId;
  starts_at: string;
  expires_at: string | null;
  reason: string;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}
interface AuditRow {
  id: number;
  at: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  details: Record<string, unknown>;
}

type Loaded = { stats: Stats; users: UserRow[]; grants: GrantRow[]; audit: AuditRow[] } | { error: string };

async function fetchAll(client: SupabaseClient, search: string): Promise<Loaded> {
  const [s, u, g, a] = await Promise.all([
    client.rpc('admin_stats'),
    client.rpc('admin_list_users', { search, lim: 100, off: 0 }),
    client.rpc('admin_grants', { target: null, lim: 100 }),
    client.rpc('admin_audit_log', { lim: 100 }),
  ]);
  const err = s.error ?? u.error ?? g.error ?? a.error;
  if (err) return { error: err.code === '42501' ? 'The server refused: administrator role required.' : err.message };
  return { stats: s.data as Stats, users: (u.data as UserRow[]) ?? [], grants: (g.data as GrantRow[]) ?? [], audit: (a.data as AuditRow[]) ?? [] };
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * Administrator dashboard. Every call goes through server functions that check the caller's administrator role and
 * write an audit row; this page only presents them. Plan changes are complimentary grants, never payments.
 */
export default function Admin() {
  const { status, client } = useAuth();
  const ent = useEntitlements();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);

  const apply = useCallback((r: Loaded) => {
    if ('error' in r) return setError(r.error);
    setError(null);
    setStats(r.stats);
    setUsers(r.users);
    setGrants(r.grants);
    setAudit(r.audit);
  }, []);
  const load = useCallback((search = '') => (client ? fetchAll(client, search).then(apply) : Promise.resolve()), [client, apply]);

  useEffect(() => {
    if (!ent.isAdmin || !client) return;
    let cancelled = false;
    void fetchAll(client, '').then((r) => !cancelled && apply(r));
    return () => {
      cancelled = true;
    };
  }, [ent.isAdmin, client, apply]);

  if (status === 'loading' || ent.status === 'loading') return <div className="mx-auto max-w-6xl px-4 py-8"><Loading /></div>;
  if (status !== 'signed-in') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-mist">
        Administration requires signing in. <Link className="text-gold hover:underline" to="/signin">Sign in</Link>
      </div>
    );
  }
  if (!ent.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-mist">
        This page is for administrators. Your account does not have the administrator role.
        {ent.status === 'unavailable' && ' (The administrator system becomes available after a pending database update.)'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader eyebrow="Administration" title="Accounts and plans">
        Manual plan grants are complimentary access, not payments. Payments are switched off. Every change is recorded in the audit log.{' '}
        <Link to="/admin/quote" className="text-gold hover:underline">
          Quotation calculator
        </Link>
      </PageHeader>
      {error && (
        <p role="alert" className="mb-4 rounded-md border border-down/40 p-3 text-sm text-down">
          {error}
        </p>
      )}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {(
            [
              ['Accounts', stats.users],
              ['Verified', stats.confirmed],
              ['New, 7 days', stats.new_7d],
              ['New, 30 days', stats.new_30d],
              ['Signed in, 7 days', stats.active_7d],
              ['Administrators', stats.admins],
              ['Research notes', stats.research_notes],
              ['Synced settings', stats.synced_preferences],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="panel p-3">
              <div className="num text-xl font-semibold">{v}</div>
              <div className="text-[11px] text-slate-dim">{k}</div>
            </div>
          ))}
        </div>
      )}
      {stats && (
        <p className="mb-4 text-xs text-slate-dim">
          Effective plans: {TIERS.map((t) => `${t.name} ${stats.grants[t.id] ?? 0}`).join(' · ')} · updated {fmt(stats.at)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title="Users"
          actions={
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                void load(q.trim());
              }}
            >
              <input className="input h-8 w-48 py-0 text-xs" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
              <button className="btn-ghost h-8 text-xs">Search</button>
            </form>
          }
          bodyClass="p-0"
        >
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-ink-900 text-slate-dim">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Last sign-in</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className={selected?.id === u.id ? 'bg-ink-800/70' : ''}>
                    <td className="px-3 py-2">
                      <div className="text-platinum">{u.email}</div>
                      <div className="text-slate-dim">
                        {u.display_name ?? 'No display name'} · {u.confirmed ? 'verified' : 'unverified'} · joined {fmt(u.created_at)}
                        {u.is_admin && <span className="ml-1 text-gold">· administrator</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {TIERS.find((t) => t.id === u.tier)?.name}
                      {u.grant_expires_at && <div className="text-slate-dim">until {fmt(u.grant_expires_at)}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-dim">{fmt(u.last_sign_in_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSelected(u)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr>
                    <td className="px-3 py-4 text-slate-dim" colSpan={4}>
                      No accounts match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          {selected ? (
            <GrantForm
              user={selected}
              onDone={() => {
                void load(q.trim());
                refreshEntitlements();
              }}
              history={grants.filter((g) => g.user_id === selected.id)}
            />
          ) : (
            <Panel title="Manage a plan">
              <p className="text-sm text-slate-dim">Choose Manage next to an account to grant, extend or revoke complimentary access.</p>
            </Panel>
          )}
          <Panel title="Recent administrator actions" bodyClass="p-0">
            <ul className="max-h-80 divide-y divide-line overflow-y-auto text-xs">
              {audit.map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <div className="text-platinum">
                    {a.action} {a.target_email ? `· ${a.target_email}` : ''}
                  </div>
                  <div className="text-slate-dim">
                    {fmt(a.at)} by {a.actor_email ?? 'unknown'}
                    {typeof a.details.reason === 'string' ? ` · “${a.details.reason}”` : ''}
                  </div>
                </li>
              ))}
              {!audit.length && <li className="px-3 py-3 text-slate-dim">No actions yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
      <ExpiringPanel />
      <OrganisationsAdmin />
      <SessionPolicy />
      <SelfCheck
        onDone={() => {
          void load(q.trim());
          refreshEntitlements();
        }}
      />
      <p className="mt-6 text-xs text-slate-dim">
        Planned here: editorial content, predictions and polls, usage and API monitoring, operational alerts. Administrator roles are assigned in the
        database by the project owner, not from this page.
      </p>
    </div>
  );
}

function GrantForm({ user, history, onDone }: { user: UserRow; history: GrantRow[]; onDone: () => void }) {
  const { client } = useAuth();
  const [tier, setTier] = useState<TierId>(user.tier === 'free' ? 'premium' : user.tier);
  const [expires, setExpires] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [minDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (reason.trim().length < 3) return setMsg({ ok: false, text: 'Give a reason (at least 3 characters).' });
    if (tier === 'free' && !confirm(`Return ${user.email} to Free and end all complimentary access?`)) return;
    setBusy(true);
    const { data, error } = await client.rpc('admin_grant_plan', {
      target: user.id,
      new_tier: tier,
      expires: tier === 'free' || !expires ? null : new Date(`${expires}T23:59:59Z`).toISOString(),
      why: reason.trim(),
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `Saved. ${user.email} is now on ${TIERS.find((t) => t.id === (data as { tier: TierId }).tier)?.name}.` });
    setReason('');
    onDone();
  };
  const revoke = async (g: GrantRow) => {
    const why = prompt('Reason for revoking this grant');
    if (!why || why.trim().length < 3 || !client) return;
    const { error } = await client.rpc('admin_revoke_grant', { grant_id: g.id, why: why.trim() });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Grant revoked.' });
    onDone();
  };
  return (
    <Panel title={`Plan for ${user.email}`} eyebrow="Complimentary access, no payment">
      <form className="space-y-2 text-sm" onSubmit={(e) => void submit(e)}>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-mist">
            Plan
            <select className="input mt-1" value={tier} onChange={(e) => setTier(e.target.value as TierId)}>
              {TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id === 'free' ? 'Free (end complimentary access)' : t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-mist">
            Expires (optional)
            <input type="date" className="input mt-1" value={expires} min={minDate} onChange={(e) => setExpires(e.target.value)} disabled={tier === 'free'} />
          </label>
        </div>
        <label className="block text-xs text-mist">
          Reason (recorded in the audit log)
          <input className="input mt-1" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Beta tester, research partner" required />
        </label>
        <button className="btn-primary text-xs" disabled={busy}>
          {busy ? 'Saving…' : 'Save plan'}
        </button>
        <p className="text-[11px] text-slate-dim">Without an expiry the grant lasts until revoked. When a grant ends, the account returns to Free automatically.</p>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>
            {msg.text}
          </p>
        )}
      </form>
      <PeriodForm user={user} onDone={onDone} />
      <div className="mt-4">
        <div className="eyebrow mb-1">History</div>
        {!history.length && <p className="text-xs text-slate-dim">No grants yet.</p>}
        <ul className="space-y-1.5 text-xs">
          {history.map((g) => {
            const active = !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date());
            return (
              <li key={g.id} className="rounded border border-line p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-platinum">
                    {TIERS.find((t) => t.id === g.tier)?.name} · {active ? 'active' : g.revoked_at ? 'revoked' : 'expired'}
                  </span>
                  {active && (
                    <button className="btn-quiet px-1 text-[11px] hover:text-down" onClick={() => void revoke(g)}>
                      Revoke
                    </button>
                  )}
                </div>
                <div className="text-slate-dim">
                  {fmt(g.starts_at)} to {g.expires_at ? fmt(g.expires_at) : 'no expiry'} · “{g.reason}”
                  {g.revoked_at && ` · revoked ${fmt(g.revoked_at)}${g.revoke_reason ? ` (“${g.revoke_reason}”)` : ''}`}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

/** One-click verification of the administrator role, plan grant/revoke, audit log and profile editing (lib/adminSelfCheck). */
function SelfCheck({ onDone }: { onDone: () => void }) {
  const { client, session } = useAuth();
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const run = async () => {
    const id = session?.user.id;
    if (!client || !id) return;
    setBusy(true);
    setCopied(false);
    const r = await runAdminSelfCheck(
      (fn, args) => client.rpc(fn, args),
      {
        read: async () => (await client.from('profiles').select('display_name').eq('id', id).maybeSingle()).data,
        write: async (display_name) => {
          const { data, error } = await client.from('profiles').update({ display_name }).eq('id', id).select('id');
          return { ok: !error && data?.length === 1, message: error?.message };
        },
      },
      id,
    );
    setResults(r);
    setSummary(summarize(r, new Date().toISOString()));
    setBusy(false);
    onDone();
  };
  return (
    <Panel className="mt-4" title="Verify administrator access" eyebrow="Self-check">
      <p className="text-xs text-slate-dim">
        Confirms on the server that your account has the administrator role, can read statistics, users and the audit log, can grant and revoke a
        complimentary plan (a one-hour Premium grant on your own account, revoked at once; skipped if you already have a grant), and can edit its
        profile. Both plan actions appear in the audit log.
      </p>
      <button className="btn-ghost mt-3 text-xs" disabled={busy} onClick={() => void run()}>
        {busy ? 'Checking…' : 'Run the check'}
      </button>
      {results && (
        <div className="mt-3 space-y-1.5 text-xs" role="status">
          {results.map((r) => (
            <div key={r.name}>
              <span className={r.status === 'pass' ? 'text-up' : r.status === 'fail' ? 'text-down' : 'text-warn'}>{r.status === 'pass' ? 'Passed' : r.status === 'fail' ? 'Failed' : 'Skipped'}</span>
              <span className="text-platinum"> · {r.name}</span>
              <div className="text-slate-dim">{r.detail}</div>
            </div>
          ))}
          <button
            className="btn-quiet px-0 text-[11px] text-gold hover:underline"
            onClick={() => {
              void navigator.clipboard?.writeText(summary).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy the result to send to the developer'}
          </button>
        </div>
      )}
    </Panel>
  );
}

/** One active device per paid individual account (server: admin_set_session_policy, audited). Off by default. */
function SessionPolicy() {
  const { client } = useAuth();
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!client) return;
    void client.rpc('session_status').then(({ data, error }) => {
      if (!alive) return;
      if (error) setMsg('Session management becomes available after the pending database update.');
      else setOn(!!(data as { single_session_paid?: boolean }).single_session_paid);
    });
    return () => {
      alive = false;
    };
  }, [client]);
  const change = async (next: boolean) => {
    if (!client) return;
    const { error } = await client.rpc('admin_set_session_policy', { single_session: next });
    if (error) return setMsg(error.message);
    setOn(next);
    setMsg(next ? 'On: a new sign-in on a paid individual plan signs out that account\'s other devices.' : 'Off: paid accounts may stay signed in on several devices.');
  };
  return (
    <Panel className="mt-4" title="Account sharing" eyebrow="Sessions">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 accent-[#c9a35a]" checked={!!on} disabled={on === null} onChange={(e) => void change(e.target.checked)} />
        <span>
          One active device per paid individual account
          <span className="block text-xs text-slate-dim">
            The newest sign-in takes over and the other devices are told why. Tabs of one browser count as one device; Free accounts and organisation seats
            are not affected. Every change is audited.
          </span>
        </span>
      </label>
      {msg && <p className="mt-2 text-xs text-mist" role="status">{msg}</p>}
    </Panel>
  );
}

/** Trial or complimentary period of 1, 3, 6 or 12 months (server: admin_start_subscription; paid periods are off). */
function PeriodForm({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const { client } = useAuth();
  const [tier, setTier] = useState<TierId>('premium');
  const [months, setMonths] = useState<PeriodMonths>(1);
  const [kind, setKind] = useState<'trial' | 'complimentary'>('trial');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (reason.trim().length < 3) return setMsg({ ok: false, text: 'Give a reason (at least 3 characters).' });
    const { error } = await client.rpc('admin_start_subscription', { target: user.id, new_tier: tier, months, sub_kind: kind, why: reason.trim() });
    if (error) return setMsg({ ok: false, text: isMissingFunction(error) ? 'Subscription periods become available after the pending database update.' : error.message });
    setMsg({ ok: true, text: `${kind === 'trial' ? 'Trial' : 'Complimentary period'} started: ${TIERS.find((t) => t.id === tier)?.name}, ${months} ${months === 1 ? 'month' : 'months'}.` });
    setReason('');
    onDone();
  };
  return (
    <form className="mt-4 space-y-2 border-t border-line pt-3 text-sm" onSubmit={(e) => void start(e)}>
      <div className="eyebrow">Subscription period (no payment)</div>
      <div className="grid grid-cols-3 gap-2">
        <select className="input" value={tier} onChange={(e) => setTier(e.target.value as TierId)} aria-label="Plan for the period">
          {TIERS.filter((t) => t.id !== 'free').map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value) as PeriodMonths)} aria-label="Period length">
          {PERIODS.map((p) => (
            <option key={p.months} value={p.months}>
              {p.months} {p.months === 1 ? 'month' : 'months'}
            </option>
          ))}
        </select>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'trial' | 'complimentary')} aria-label="Kind of period">
          <option value="trial">Trial</option>
          <option value="complimentary">Complimentary</option>
        </select>
      </div>
      <input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recorded in the audit log)" aria-label="Reason for the period" />
      <button className="btn-ghost text-xs">Start period</button>
      <p className="text-[11px] text-slate-dim">Replaces the user's current period. The user can cancel or resume it; it ends automatically and nothing is charged.</p>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

/** Subscriptions and grants ending within 14 days (server: admin_expiring), for reminders. */
function ExpiringPanel() {
  const { client } = useAuth();
  const [rows, setRows] = useState<{ source: string; email: string; tier: string; kind: string; ends: string; cancelling: boolean }[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (!client) return;
    void client.rpc('admin_expiring', { days: 14 }).then(({ data, error }) => alive && setRows(error ? null : ((data as typeof rows) ?? [])));
    return () => {
      alive = false;
    };
  }, [client]);
  if (!rows) return null;
  return (
    <Panel className="mt-4" title="Ending within 14 days" eyebrow="Plans">
      {rows.length ? (
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={`${r.source}-${r.email}-${r.ends}`} className="flex flex-wrap justify-between gap-2">
              <span className="text-platinum">{r.email}</span>
              <span className="text-slate-dim">
                {TIERS.find((t) => t.id === r.tier)?.name} {r.kind} · ends {fmt(r.ends)}
                {r.cancelling ? ' · cancelled by the user' : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-dim">Nothing ends in the next 14 days.</p>
      )}
      <p className="mt-2 text-[11px] text-slate-dim">Email reminders are planned; until then users see an in-app warning on their Account page 14 days before the end.</p>
    </Panel>
  );
}
