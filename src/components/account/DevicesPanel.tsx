import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { describeDevice, isMissingFunction, type SessionRow } from '../../lib/sessions';
import { Panel } from '../ui';

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Devices signed in to this account (server: my_sessions). Other devices can be signed out one by one or all at once
 * (Supabase Auth `signOut({ scope: 'others' })`). Shows no IP addresses or locations.
 */
export function DevicesPanel() {
  const { client } = useAuth();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'unavailable' } | { kind: 'error' | 'done'; text: string }>({ kind: 'idle' });
  const [singleSession, setSingleSession] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    const [list, status] = await Promise.all([client.rpc('my_sessions'), client.rpc('session_status')]);
    if (isMissingFunction(list.error)) return setState({ kind: 'unavailable' });
    if (list.error) return setState({ kind: 'error', text: list.error.message });
    setRows((list.data as SessionRow[]) ?? []);
    setSingleSession(!!(status.data as { single_session_paid?: boolean } | null)?.single_session_paid);
  }, [client]);

  useEffect(() => {
    let alive = true;
    if (client)
      void Promise.resolve().then(() => {
        if (alive) void load();
      });
    return () => {
      alive = false;
    };
  }, [client, load]);

  const signOutOthers = async () => {
    if (!client) return;
    setState({ kind: 'busy' });
    const { error } = await client.auth.signOut({ scope: 'others' });
    if (error) return setState({ kind: 'error', text: error.message });
    await client.rpc('note_others_signed_out');
    setState({ kind: 'done', text: 'All other devices are signed out. They need your password to sign in again.' });
    void load();
  };
  const revoke = async (r: SessionRow) => {
    if (!client) return;
    setState({ kind: 'busy' });
    const { error } = await client.rpc('revoke_my_session', { target: r.id });
    if (error) return setState({ kind: 'error', text: error.message });
    setState({ kind: 'done', text: `${describeDevice(r.user_agent)} is signed out.` });
    void load();
  };

  const others = rows?.filter((r) => !r.current) ?? [];
  return (
    <Panel title="Devices" eyebrow="Security">
      {state.kind === 'unavailable' ? (
        <p className="text-sm text-slate-dim">Device management becomes available after a pending database update.</p>
      ) : (
        <>
          <ul className="divide-y divide-line text-sm">
            {(rows ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="text-platinum">{describeDevice(r.user_agent)}</span>
                  {r.current && <span className="ml-2 rounded border border-gold-dim px-1.5 text-[10px] uppercase tracking-wider text-gold">This device</span>}
                  <span className="block text-[11px] text-slate-dim">
                    Signed in {fmt(r.created_at)} · last active {fmt(r.last_active)}
                  </span>
                </span>
                {!r.current && (
                  <button className="btn-ghost h-8 text-xs" disabled={state.kind === 'busy'} onClick={() => void revoke(r)} aria-label={`Sign out ${describeDevice(r.user_agent)}`}>
                    Sign out
                  </button>
                )}
              </li>
            ))}
            {rows && !rows.length && <li className="py-2 text-slate-dim">No active devices found.</li>}
            {!rows && <li className="py-2 text-slate-dim">Loading…</li>}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-ghost text-xs" disabled={state.kind === 'busy' || !others.length} onClick={() => void signOutOthers()}>
              Sign out of other devices
            </button>
            {state.kind === 'error' && (
              <span role="alert" className="text-xs text-down">
                {state.text}
              </span>
            )}
            {state.kind === 'done' && (
              <span role="status" className="text-xs text-up">
                {state.text}
              </span>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-dim">
            Tabs in this browser share one session. A signed-out device loses paid features at once and cannot renew its sign-in; for up to an hour it can
            still read its own notes until its access token expires.{singleSession ? ' Paid individual plans allow one active device: signing in elsewhere signs this device out.' : ''} Lost a
            device? Sign out of other devices here, then change your password under Security.
          </p>
        </>
      )}
    </Panel>
  );
}
