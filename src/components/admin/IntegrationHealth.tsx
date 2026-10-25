import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Panel } from '../ui';

interface Row {
  id: string;
  name: string;
  secrets: string[];
  status: 'CONNECTED' | 'TESTED' | 'LICENSED' | 'LIVE' | 'PENDING' | 'BLOCKED';
  authenticated: boolean | null;
  facts: Record<string, string | number | boolean | null>;
  licence: string;
  ownerAction: string | null;
  error?: string;
  checkedAt: string;
}

const TONE: Record<Row['status'], string> = {
  LIVE: 'border-up/50 text-up',
  LICENSED: 'border-up/50 text-up',
  TESTED: 'border-info/50 text-info',
  CONNECTED: 'border-line text-mist',
  PENDING: 'border-line text-slate-dim',
  BLOCKED: 'border-warn/50 text-warn',
};

/**
 * Integration Health (administrators): one row per provider with the secret names found (never values), the result
 * of a minimal authenticated test, licence status and the owner action. Tests run at most once per deployment.
 */
export function IntegrationHealth() {
  const { client } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | string>('idle');

  const run = async () => {
    if (!client) return;
    setState('loading');
    const token = (await client.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/integrations/health', { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { providers?: Row[]; error?: string } | null;
    if (!res?.ok || !j?.providers) return setState(j?.error ?? 'The health check could not be loaded.');
    setRows(j.providers);
    setState('idle');
  };

  return (
    <Panel className="mt-4" title="Integration health" eyebrow="Providers">
      <p className="text-xs text-slate-dim">
        CONNECTED: credential present · TESTED: authenticated test passed · LICENSED / LIVE: display allowed / enabled · PENDING: credential not
        supplied · BLOCKED: test failed or display needs a licence. Tests use free endpoints or one small request, once per deployment.
      </p>
      <button type="button" className="btn-ghost mt-3 text-xs" onClick={() => void run()} disabled={state === 'loading'}>
        {state === 'loading' ? 'Checking…' : rows ? 'Refresh' : 'Run integration check'}
      </button>
      {state !== 'idle' && state !== 'loading' && <p className="mt-2 text-xs text-down">{state}</p>}
      {rows && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-slate-dim">
              <tr>
                <th className="py-1 pr-3 font-normal">Provider</th>
                <th className="py-1 pr-3 font-normal">Status</th>
                <th className="py-1 pr-3 font-normal">Test</th>
                <th className="py-1 pr-3 font-normal">Facts</th>
                <th className="py-1 font-normal">Licence · owner action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 align-top">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3">
                    <div className="text-platinum">{r.name}</div>
                    <div className="text-[10px] text-slate-dim">{r.secrets.length ? r.secrets.join(', ') : 'no secret found'}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${TONE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="py-2 pr-3 text-mist">
                    {r.authenticated === true ? 'passed' : r.authenticated === false ? 'failed' : 'not run'}
                    {r.error && <div className="text-[10px] text-down">{r.error}</div>}
                  </td>
                  <td className="py-2 pr-3 text-mist">
                    {Object.entries(r.facts).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-slate-dim">{k}:</span> {String(v)}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 text-mist">
                    {r.licence}
                    {r.ownerAction && <div className="mt-0.5 text-warn">{r.ownerAction}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-dim">Checked {rows[0] ? new Date(rows[0].checkedAt).toLocaleString('en-GB') : ''}.</p>
        </div>
      )}
    </Panel>
  );
}
