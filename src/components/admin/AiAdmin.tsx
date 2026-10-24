import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { isMissingFunction } from '../../lib/sessions';
import { Panel } from '../ui';

interface Overview {
  settings: { enabled: boolean; monthly_budget_cents: number; daily_requests: Record<string, number>; updated_at: string };
  month_spend_cents: number;
  month_requests: number;
  month_failed: number;
  by_provider: { provider: string; model: string; requests: number; tokens_in: number; tokens_out: number; cost_cents: number }[];
  top_users: { email: string; requests: number; cost_cents: number }[];
}
const TIERS = ['free', 'premium', 'prime', 'intelligence'] as const;
const eur = (cents: number) => `€${(Number(cents) / 100).toFixed(2)}`;

/**
 * AI usage and spending controls (server: admin_ai_overview, admin_set_ai_settings; audited). AI is off until switched
 * on here; the global monthly budget and the daily allowance per plan are enforced for every request by ai_begin.
 */
export function AiAdmin() {
  const { client } = useAuth();
  const [o, setO] = useState<Overview | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState<{ enabled: boolean; budget: string; limits: Record<string, string> } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const { data, error } = await client.rpc('admin_ai_overview');
    if (error) return isMissingFunction(error) ? setMissing(true) : setMsg({ ok: false, text: error.message });
    const ov = data as Overview;
    setO(ov);
    setForm({ enabled: ov.settings.enabled, budget: (ov.settings.monthly_budget_cents / 100).toFixed(2), limits: Object.fromEntries(TIERS.map((t) => [t, String(ov.settings.daily_requests[t] ?? 0)])) });
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !form) return;
    const budget = Math.round(Number(form.budget.replace(',', '.')) * 100);
    const limits = Object.fromEntries(TIERS.map((t) => [t, Math.round(Number(form.limits[t]))]));
    if (!Number.isFinite(budget) || budget < 0) return setMsg({ ok: false, text: 'Enter the monthly budget in euros.' });
    if (Object.values(limits).some((v) => !Number.isFinite(v) || v < 0)) return setMsg({ ok: false, text: 'Daily limits must be whole numbers.' });
    const { error } = await client.rpc('admin_set_ai_settings', { on_off: form.enabled, budget_cents: budget, limits });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: 'AI settings saved (audited).' });
    void load();
  };

  return (
    <Panel className="mt-4" title="AI usage and spending" eyebrow="EVE and KNOX">
      {missing ? (
        <p className="text-sm text-slate-dim">AI controls become available after the pending database update (20261025000000_ai_gateway.sql).</p>
      ) : !o || !form ? (
        <p className="text-sm text-slate-dim">{msg?.text ?? 'Loading…'}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Spent this month', eur(o.month_spend_cents)],
              ['Monthly budget', eur(o.settings.monthly_budget_cents)],
              ['Requests this month', String(o.month_requests)],
              ['Failed (not charged)', String(o.month_failed)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-line px-3 py-2">
                <div className="text-[11px] text-slate-dim">{k}</div>
                <div className="num text-base text-platinum">{v}</div>
              </div>
            ))}
          </div>
          {o.by_provider.length > 0 && (
            <ul className="space-y-1 text-xs">
              {o.by_provider.map((p) => (
                <li key={p.provider + p.model} className="flex flex-wrap justify-between gap-2">
                  <span className="text-platinum">
                    {p.provider} · {p.model}
                  </span>
                  <span className="num text-slate-dim">
                    {p.requests} requests · {Number(p.tokens_in) + Number(p.tokens_out)} tokens · {eur(p.cost_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form className="space-y-2 border-t border-line pt-3" onSubmit={(e) => void save(e)}>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-[#c9a35a]" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              AI assistants switched on
            </label>
            <label className="block text-xs text-mist">
              Global monthly budget (euros)
              <input className="input mt-1" inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIERS.map((t) => (
                <label key={t} className="text-xs capitalize text-mist">
                  {t}: requests/day
                  <input className="input mt-1" inputMode="numeric" value={form.limits[t]} onChange={(e) => setForm({ ...form, limits: { ...form.limits, [t]: e.target.value } })} />
                </label>
              ))}
            </div>
            <button className="btn-ghost text-xs">Save AI settings</button>
            <p className="text-[11px] text-slate-dim">Costs are estimates from list prices. Set the same hard limit in the provider&apos;s own billing settings.</p>
          </form>
          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>
              {msg.text}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
