import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { TIERS } from '../../data/tiers';
import { budgetState, budgetText, euros, seatsText } from '../../lib/orgs';
import { Panel } from '../ui';

interface MyOrganisation {
  id: string;
  name: string;
  tier: string;
  seats: number;
  seats_used: number;
  contract_end: string;
  role: 'member' | 'org_admin';
  ai: { budget_cents: number | null; hard_cap: boolean; alert_percent: number; spent_cents: number } | null;
  members: { email: string; role: string; added_at: string; ai_cents_month: number }[] | null;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The account's organisation seat (server: my_organization). Members see the organisation and plan; organisation
 * administrators also see the seats, members and this month's AI spend against the budget. Hidden without a seat.
 */
export function OrganisationCard() {
  const { client } = useAuth();
  const [org, setOrg] = useState<MyOrganisation | null>(null);
  useEffect(() => {
    let alive = true;
    if (!client) return;
    // Before the organisations migration is applied the function is missing: nothing to show.
    void client.rpc('my_organization').then(({ data, error }) => alive && setOrg(error ? null : ((data as MyOrganisation | null) ?? null)));
    return () => {
      alive = false;
    };
  }, [client]);
  if (!org) return null;
  const plan = TIERS.find((t) => t.id === org.tier)?.name ?? org.tier;
  const state = org.ai ? budgetState(org.ai) : null;
  return (
    <Panel title={org.name} eyebrow={org.role === 'org_admin' ? 'Organisation · administrator' : 'Organisation'}>
      <div className="space-y-2 text-sm">
        <p>
          Your seat includes <span className="font-semibold text-gold-soft">{plan}</span> until {date(org.contract_end)}.
        </p>
        {org.role === 'org_admin' && (
          <>
            <p className="text-xs text-mist">{seatsText(org.seats_used, org.seats)}. Aurora adds and removes seats on request.</p>
            {org.ai && (
              <p
                role={state === 'reached' || state === 'alert' ? 'status' : undefined}
                className={`text-xs ${state === 'reached' ? 'text-down' : state === 'alert' ? 'text-warn' : 'text-mist'}`}
              >
                AI: {budgetText(org.ai)}
              </p>
            )}
            {org.members && (
              <ul className="divide-y divide-line rounded-md border border-line text-xs" aria-label="Members">
                {org.members.map((m) => (
                  <li key={m.email} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
                    <span className="text-platinum">
                      {m.email}
                      {m.role === 'org_admin' ? ' · administrator' : ''}
                    </span>
                    <span className="text-slate-dim">AI this month {euros(Number(m.ai_cents_month))}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="text-[11px] text-slate-dim">The organisation's contract is managed by Aurora. Leaving the organisation keeps your own account and data.</p>
      </div>
    </Panel>
  );
}
