import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { TIERS } from '../../data/tiers';
import { EXPIRY_WARNING_DAYS, daysUntil } from '../../lib/billing';
import { isMissingFunction } from '../../lib/sessions';
import { refreshEntitlements } from '../../store/entitlements';
import { Panel } from '../ui';

interface Subscription {
  tier: string;
  kind: 'trial' | 'complimentary' | 'paid';
  period_months: number;
  started_at: string;
  current_period_end: string;
  auto_renew: boolean;
  cancel_at_period_end: boolean;
  active: boolean;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const KIND: Record<Subscription['kind'], string> = { trial: 'Trial', complimentary: 'Complimentary period', paid: 'Paid subscription' };

/**
 * The account's current subscription period (server: my_subscription): plan, period, end date with an expiry warning,
 * renewal preference, and cancel / resume (access continues to the end of the period). Hidden when there is none.
 */
export function SubscriptionPanel() {
  const { client } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    const { data, error } = await client.rpc('my_subscription');
    if (error && !isMissingFunction(error)) setMsg({ ok: false, text: error.message });
    setSub((data as Subscription | null) ?? null);
  }, [client]);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) void load();
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const act = async (fn: string, args: Record<string, unknown> | undefined, done: string) => {
    if (!client) return;
    setBusy(true);
    const { data, error } = await client.rpc(fn, args);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setSub(data as Subscription);
    setMsg({ ok: true, text: done });
    refreshEntitlements();
  };

  if (!sub) return null;
  const left = daysUntil(sub.current_period_end);
  const name = TIERS.find((t) => t.id === sub.tier)?.name ?? sub.tier;
  return (
    <Panel title="Subscription" eyebrow={KIND[sub.kind]}>
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-semibold text-gold-soft">{name}</span>, {sub.period_months} {sub.period_months === 1 ? 'month' : 'months'} from {date(sub.started_at)}
          {sub.active ? (
            <>
              {' '}
              to <span className="text-platinum">{date(sub.current_period_end)}</span> ({left} {left === 1 ? 'day' : 'days'} left).
            </>
          ) : (
            <> ended on {date(sub.current_period_end)}.</>
          )}
        </p>
        {sub.active && left <= EXPIRY_WARNING_DAYS && (
          <p role="status" className="rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">
            {sub.cancel_at_period_end || sub.kind !== 'paid'
              ? `This plan ends in ${left} ${left === 1 ? 'day' : 'days'}. Your account then returns to Free; your data stays.`
              : `This plan renews in ${left} ${left === 1 ? 'day' : 'days'}.`}
          </p>
        )}
        {sub.active && sub.cancel_at_period_end && <p className="text-xs text-mist">Cancelled: you keep access until {date(sub.current_period_end)}.</p>}
        {sub.kind !== 'paid' && (
          <p className="text-xs text-slate-dim">
            {sub.kind === 'trial' ? 'A trial' : 'A complimentary period'} granted by an administrator. It is free and does not renew; nothing will be charged.
          </p>
        )}
        {sub.active && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-mist">
              <input
                type="checkbox"
                className="accent-[#c9a35a]"
                checked={sub.auto_renew}
                disabled={busy || sub.cancel_at_period_end}
                onChange={(e) => void act('set_auto_renew', { on_off: e.target.checked }, e.target.checked ? 'Renewal preference saved.' : 'Renewal turned off.')}
              />
              Renew at the end of the period
            </label>
            {sub.cancel_at_period_end ? (
              <button className="btn-ghost h-8 text-xs" disabled={busy} onClick={() => void act('resume_my_subscription', undefined, 'Subscription resumed.')}>
                Resume
              </button>
            ) : (
              <button
                className="btn-ghost h-8 text-xs hover:border-down hover:text-down"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Cancel ${name}? You keep access until ${date(sub.current_period_end)}, then the account returns to Free.`))
                    void act('cancel_my_subscription', undefined, `Cancelled. Access continues until ${date(sub.current_period_end)}.`);
                }}
              >
                Cancel subscription
              </button>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-dim">Payments are switched off, so nothing renews automatically or is charged; your renewal choice is kept for when paid plans launch.</p>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </Panel>
  );
}
