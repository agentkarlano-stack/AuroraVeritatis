import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { TIERS, type TierId } from '../../data/tiers';
import { budgetState, budgetText, parseEuros, seatsText } from '../../lib/orgs';
import { isMissingFunction } from '../../lib/sessions';
import { Panel } from '../ui';

interface OrgRow {
  id: string;
  name: string;
  tier: TierId;
  seats: number;
  seats_used: number;
  contract_end: string;
  status: 'active' | 'suspended';
  ai_budget_cents: number | null;
  ai_hard_cap: boolean;
  ai_spent_cents: number;
  members: { email: string; role: 'member' | 'org_admin' }[];
}

type Msg = { ok: boolean; text: string } | null;
const PAID = TIERS.filter((t) => t.id !== 'free');
const tierName = (id: string) => TIERS.find((t) => t.id === id)?.name ?? id;
const inAYear = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>
      {msg.text}
    </p>
  );
}

/**
 * Business & Institutional organisations (server: admin_list_orgs, admin_create_org, admin_update_org,
 * admin_add_member, admin_remove_member; each audited). Prices are agreed privately and never shown here.
 */
export function OrganisationsAdmin() {
  const { client } = useAuth();
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const { data, error } = await client.rpc('admin_list_orgs');
    if (error) {
      if (isMissingFunction(error)) setMissing(true);
      else setMsg({ ok: false, text: error.message });
      return;
    }
    setOrgs((data as OrgRow[]) ?? []);
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

  return (
    <Panel className="mt-4" title="Organisations" eyebrow="Business & Institutional">
      {missing ? (
        <p className="text-sm text-slate-dim">Organisations become available after the pending database update (20261024000200_organisations.sql).</p>
      ) : (
        <div className="space-y-4">
          <CreateOrg onDone={() => void load()} />
          <Note msg={msg} />
          {orgs && !orgs.length && <p className="text-sm text-slate-dim">No organisations yet.</p>}
          {orgs?.map((o) => <OrgItem key={o.id} org={o} onDone={() => void load()} />)}
        </div>
      )}
    </Panel>
  );
}

function CreateOrg({ onDone }: { onDone: () => void }) {
  const { client } = useAuth();
  const [name, setName] = useState('');
  const [tier, setTier] = useState<TierId>('prime');
  const [seats, setSeats] = useState('5');
  const [ends, setEnds] = useState(inAYear);
  const [budget, setBudget] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    const n = Number(seats);
    const cents = parseEuros(budget);
    if (name.trim().length < 2) return setMsg({ ok: false, text: 'Give the organisation a name.' });
    if (!Number.isInteger(n) || n < 1 || n > 10000) return setMsg({ ok: false, text: 'Seats must be a whole number from 1 to 10,000.' });
    if (Number.isNaN(cents)) return setMsg({ ok: false, text: 'AI budget: enter an amount in euros, e.g. 150 or 150.50, or leave it empty.' });
    if (reason.trim().length < 3) return setMsg({ ok: false, text: 'Give a reason (at least 3 characters).' });
    const { error } = await client.rpc('admin_create_org', { org_name: name.trim(), plan: tier, seat_count: n, ends, ai_budget_cents: cents, why: reason.trim() });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `${name.trim()} created with ${n} ${n === 1 ? 'seat' : 'seats'}.` });
    setName('');
    setReason('');
    onDone();
  };
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => void submit(e)}>
      <div className="eyebrow">New organisation</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} placeholder="Organisation name" aria-label="Organisation name" />
        <select className="input" value={tier} onChange={(e) => setTier(e.target.value as TierId)} aria-label="Organisation plan">
          {PAID.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="text-xs text-mist">
          Seats
          <input className="input mt-1" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
        </label>
        <label className="text-xs text-mist">
          Contract ends
          <input className="input mt-1" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </label>
        <label className="text-xs text-mist sm:col-span-2">
          Monthly AI budget in euros (empty: no AI allowance; hard cap on by default)
          <input className="input mt-1" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 150" />
        </label>
      </div>
      <input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Reason or contract reference (audited)" aria-label="Reason for the organisation" />
      <button className="btn-ghost text-xs">Create organisation</button>
      <Note msg={msg} />
    </form>
  );
}

function OrgItem({ org, onDone }: { org: OrgRow; onDone: () => void }) {
  const { client } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'org_admin'>('member');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const ai = { budget_cents: org.ai_budget_cents, spent_cents: Number(org.ai_spent_cents), hard_cap: org.ai_hard_cap, alert_percent: 80 };
  const state = budgetState(ai);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !email.trim()) return;
    const { error } = await client.rpc('admin_add_member', { org: org.id, member_email: email.trim(), member_role: role });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `${email.trim()} added.` });
    setEmail('');
    onDone();
  };
  const remove = async (member: string) => {
    if (!client || !confirm(`Remove ${member} from ${org.name}? The account keeps its own data and returns to its own plan.`)) return;
    const { error } = await client.rpc('admin_remove_member', { org: org.id, member_email: member });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `${member} removed.` });
    onDone();
  };

  return (
    <div className="rounded-md border border-line p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold text-platinum">{org.name}</span>{' '}
          <span className="text-xs text-slate-dim">
            {tierName(org.tier)} · until {org.contract_end}
            {org.status === 'suspended' ? ' · suspended' : ''}
          </span>
        </div>
        <button className="btn-ghost h-8 text-xs" onClick={() => setEditing((v) => !v)} aria-expanded={editing} aria-label={`Edit contract for ${org.name}`}>
          {editing ? 'Close' : 'Edit contract'}
        </button>
      </div>
      <p className="mt-1 text-xs text-mist">{seatsText(org.seats_used, org.seats)}</p>
      <p className={`text-xs ${state === 'reached' ? 'text-down' : state === 'alert' ? 'text-warn' : 'text-mist'}`}>AI: {budgetText(ai)}</p>
      {editing && <EditOrg org={org} onDone={() => (setEditing(false), onDone())} />}
      <ul className="mt-2 divide-y divide-line text-xs" aria-label={`Members of ${org.name}`}>
        {org.members.map((m) => (
          <li key={m.email} className="flex items-center justify-between gap-2 py-1">
            <span className="text-platinum">
              {m.email}
              {m.role === 'org_admin' ? ' · organisation administrator' : ''}
            </span>
            <button className="btn-ghost h-7 text-[11px] hover:border-down hover:text-down" onClick={() => void remove(m.email)} aria-label={`Remove ${m.email}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => void add(e)}>
        <input
          className="input min-w-0 basis-full sm:basis-0 sm:flex-1"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Member email (confirmed account)"
          aria-label={`Member email for ${org.name}`}
        />
        <select className="input w-auto min-w-0 flex-1 sm:flex-none" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'org_admin')} aria-label="Member role">
          <option value="member">Member</option>
          <option value="org_admin">Organisation administrator</option>
        </select>
        <button className="btn-ghost text-xs" disabled={org.seats_used >= org.seats} title={org.seats_used >= org.seats ? 'All seats are in use' : undefined}>
          Add seat
        </button>
      </form>
      <Note msg={msg} />
    </div>
  );
}

function EditOrg({ org, onDone }: { org: OrgRow; onDone: () => void }) {
  const { client } = useAuth();
  const [tier, setTier] = useState<TierId>(org.tier);
  const [seats, setSeats] = useState(String(org.seats));
  const [ends, setEnds] = useState(org.contract_end);
  const [budget, setBudget] = useState(org.ai_budget_cents === null ? '' : (org.ai_budget_cents / 100).toFixed(2));
  const [cap, setCap] = useState(org.ai_hard_cap);
  const [status, setStatus] = useState(org.status);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    const n = Number(seats);
    const cents = parseEuros(budget);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return setMsg({ ok: false, text: 'Seats must be a whole number from 1 to 10,000.' });
    if (Number.isNaN(cents)) return setMsg({ ok: false, text: 'AI budget: enter an amount in euros or leave it empty.' });
    if (reason.trim().length < 3) return setMsg({ ok: false, text: 'Give a reason (at least 3 characters).' });
    const { error } = await client.rpc('admin_update_org', {
      org: org.id,
      plan: tier,
      seat_count: n,
      ends,
      ai_budget_cents: cents,
      hard_cap: cap,
      new_status: status,
      why: reason.trim(),
    });
    if (error) return setMsg({ ok: false, text: error.message });
    onDone();
  };
  return (
    <form className="mt-2 space-y-2 border-t border-line pt-2" onSubmit={(e) => void save(e)}>
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="input" value={tier} onChange={(e) => setTier(e.target.value as TierId)} aria-label="Plan">
          {PAID.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input className="input" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} aria-label="Seats" />
        <input className="input" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} aria-label="Contract end" />
        <input className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="AI budget €/month" aria-label="Monthly AI budget in euros" />
        <label className="flex items-center gap-2 text-xs text-mist">
          <input type="checkbox" className="accent-[#c9a35a]" checked={cap} onChange={(e) => setCap(e.target.checked)} />
          Hard cap (pause AI at the budget)
        </label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as OrgRow['status'])} aria-label="Status">
          <option value="active">Active</option>
          <option value="suspended">Suspended (members lose the plan)</option>
        </select>
      </div>
      <input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" aria-label="Reason for the change" />
      <button className="btn-ghost text-xs">Save contract</button>
      <Note msg={msg} />
    </form>
  );
}
