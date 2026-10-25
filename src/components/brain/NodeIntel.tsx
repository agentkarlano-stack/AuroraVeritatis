import { ExternalLink, FilePlus2, Library, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { MacroResponse } from '../../../shared/macro';
import { MACRO_MAP } from '../../../shared/macro';
import type { CountryProfile, GeoEvent } from '../../../shared/types';
import { getJson, useApi } from '../../lib/api';
import type { BrainNode } from '../../lib/brain';
import { moduleLinks } from '../../lib/brainEntities';
import { RELEVANCE, RISK_LEVELS, RISK_ORDER, effectiveRisk, riskFromEvent, riskSummary, type NodeRisk, type Relevance, type RiskLevel } from '../../lib/brainRisk';
import { fmtIndicator, fmtNumber } from '../../lib/format';
import { Panel, ProvenanceBadge } from '../ui';

const COUNTRY_KEYS = ['NY.GDP.PCAP.CD', 'NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'SP.POP.TOTL'];

/**
 * Linked intelligence for a Brain node: official data for the linked entity, buttons into the matching Aurora modules,
 * and the node's risk and relevance. Automatic risk always names its method, source and date; the user's own
 * assessment is stored separately and never changes it.
 */
export function NodeIntel({
  node,
  today,
  onChange,
  onAddResearch,
  onViewSources,
}: {
  node: BrainNode;
  today: string;
  onChange: (patch: Partial<BrainNode>) => void;
  onAddResearch: () => void;
  onViewSources: () => void;
}) {
  const modules = moduleLinks(node.ref);
  return (
    <Panel title="Intelligence" eyebrow="Linked data, modules and risk">
      <div className="space-y-4 text-sm">
        {node.ref?.type === 'country' && <CountryFacts iso3={node.ref.iso3} />}
        {node.ref?.type === 'macro' && <MacroFact id={node.ref.id} />}
        {!node.ref && <p className="text-xs text-slate-dim">Link this node to Aurora data (below) to see official figures here.</p>}

        <div>
          <span className="label">Open in Aurora</span>
          <div className="grid grid-cols-2 gap-1.5">
            {modules.map((m) =>
              m.href ? (
                <Link key={m.id} className="btn-ghost h-8 justify-center text-xs" to={m.href}>
                  {m.label}
                </Link>
              ) : (
                <button key={m.id} className="btn-ghost h-8 justify-center text-xs" disabled title={m.reason} aria-label={`${m.label} (unavailable: ${m.reason})`}>
                  {m.label}
                </button>
              ),
            )}
            <button className="btn-ghost h-8 justify-center text-xs" onClick={onAddResearch}>
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden /> Add linked research
            </button>
            <button className="btn-ghost h-8 justify-center text-xs" onClick={onViewSources}>
              <Library className="h-3.5 w-3.5" aria-hidden /> View sources ({node.sources.length})
            </button>
          </div>
        </div>

        <RiskEditor node={node} today={today} onChange={onChange} />
      </div>
    </Panel>
  );
}

function CountryFacts({ iso3 }: { iso3: string }) {
  const res = useApi<CountryProfile>(`/api/countries/${iso3}`);
  if (res.status === 'loading') return <p className="text-xs text-slate-dim">Loading official data…</p>;
  if (res.status === 'error')
    return (
      <p className="text-xs text-slate-dim">
        Official data unavailable right now ({res.error}).{' '}
        <button className="text-gold hover:underline" onClick={res.reload}>
          Retry
        </button>
      </p>
    );
  const p = res.data;
  const rows = COUNTRY_KEYS.map((k) => p.indicators[k]).filter((v): v is NonNullable<typeof v> => !!v && v.value != null);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="label mb-0">Official data · {p.name}</span>
        <ProvenanceBadge kind="confirmed" />
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-dim">No recent World Bank figures for this economy.</p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          {rows.map((v) => (
            <div key={v.id} className="contents">
              <dt className="text-mist">{v.label}</dt>
              <dd className="num text-right text-platinum">
                {fmtIndicator(v)} <span className="text-slate-dim">{v.date}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <a className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-dim hover:text-gold" href={p.source.url} target="_blank" rel="noreferrer">
        {p.source.name} <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}

function MacroFact({ id }: { id: string }) {
  const def = MACRO_MAP.get(id);
  const res = useApi<MacroResponse>(def ? `/api/macro/${id}?years=1` : null);
  if (!def) return null;
  if (res.status === 'loading') return <p className="text-xs text-slate-dim">Loading ECB data…</p>;
  if (res.status === 'error') return <p className="text-xs text-slate-dim">ECB data unavailable right now ({res.error}).</p>;
  const last = res.data.series[0]?.obs.at(-1);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="label mb-0">Official data · {def.label}</span>
        <ProvenanceBadge kind="confirmed" />
      </div>
      {last ? (
        <p className="text-xs text-mist">
          Latest: <span className="num text-platinum">{fmtNumber(last.value, def.unit === 'percent' ? 2 : 4)}{def.unit === 'percent' ? '%' : ` ${def.unit}`}</span> ({last.date})
        </p>
      ) : (
        <p className="text-xs text-slate-dim">No recent observation.</p>
      )}
      <a className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-dim hover:text-gold" href={res.data.source.url} target="_blank" rel="noreferrer">
        {res.data.source.name} <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}

function RiskEditor({ node, today, onChange }: { node: BrainNode; today: string; onChange: (patch: Partial<BrainNode>) => void }) {
  const eff = effectiveRisk(node, today);
  const [refresh, setRefresh] = useState<{ busy: boolean; text?: string }>({ busy: false });
  const eventId = node.ref?.type === 'event' ? node.ref.id : null;
  const feed = eventId?.startsWith('usgs-') ? 'earthquakes' : eventId?.startsWith('gdacs-') ? 'disasters' : null;

  const refreshFromSource = () => {
    if (!eventId || !feed) return;
    setRefresh({ busy: true });
    getJson<{ events: GeoEvent[] }>(`/api/events/${feed}`)
      .then(({ events }) => {
        const e = events.find((x) => x.id === eventId);
        if (!e) {
          setRefresh({ busy: false, text: 'This event is no longer in the live feed, so the stored assessment was kept.' });
          return;
        }
        const r = riskFromEvent(e, today);
        if (r) onChange({ autoRisk: r });
        setRefresh({ busy: false, text: r ? `Updated: ${RISK_LEVELS[r.level].label} (${r.basis}).` : 'The source provides no documented level for this event.' });
      })
      .catch((err: Error) => setRefresh({ busy: false, text: `Could not reach the source: ${err.message}` }));
  };

  const setUser = (patch: Partial<NodeRisk> | null) =>
    onChange({ risk: patch === null ? undefined : { level: node.risk?.level ?? 'elevated', basis: node.risk?.basis, ...patch, origin: 'user', asOf: today } });

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div>
        <span className="label">Risk</span>
        <p className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RISK_LEVELS[eff.level].color }} aria-hidden />
          <span className="text-platinum">{riskSummary(eff)}</span>
        </p>
        {node.autoRisk && (
          <details className="mt-1.5 text-[11px] text-slate-dim">
            <summary className="cursor-pointer hover:text-mist">Automatic assessment: method, source and date</summary>
            <AutoRiskDetails risk={node.autoRisk} />
          </details>
        )}
        {!node.autoRisk && (
          <p className="mt-1 text-[11px] text-slate-dim">
            No automatic assessment. Aurora assigns one only where a documented method exists (USGS earthquakes, GDACS alerts added from the Global
            Radar). Everything else stays grey until you assess it.
          </p>
        )}
        {feed && (
          <button className="btn-ghost mt-2 h-7 text-xs" onClick={refreshFromSource} disabled={refresh.busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.busy ? 'animate-spin' : ''}`} aria-hidden /> Refresh from source
          </button>
        )}
        {refresh.text && (
          <p className="mt-1 text-[11px] text-mist" role="status">
            {refresh.text}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Your risk assessment</span>
          <select className="input h-8 text-xs" value={node.risk?.level ?? ''} onChange={(e) => setUser(e.target.value ? { level: e.target.value as RiskLevel } : null)}>
            <option value="">{node.autoRisk ? 'Use automatic' : 'Not assessed'}</option>
            {RISK_ORDER.filter((l) => l !== 'unknown').map((l) => (
              <option key={l} value={l}>
                {RISK_LEVELS[l].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Relevance to you</span>
          <select className="input h-8 text-xs" value={node.relevance ?? ''} onChange={(e) => onChange({ relevance: e.target.value ? (Number(e.target.value) as Relevance) : undefined })}>
            <option value="">Not set</option>
            {([5, 4, 3, 2, 1] as Relevance[]).map((r) => (
              <option key={r} value={r}>
                {r} · {RELEVANCE[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {node.risk && (
        <label className="block">
          <span className="label">Basis for your assessment</span>
          <input className="input h-8 text-xs" maxLength={300} placeholder="Why, briefly (optional)" value={node.risk.basis ?? ''} onChange={(e) => setUser({ basis: e.target.value || undefined })} />
        </label>
      )}
      <p className="text-[11px] text-slate-dim">Risk is how severe the situation is; relevance is how much it matters to your research. Neither is advice.</p>
    </div>
  );
}

function AutoRiskDetails({ risk }: { risk: NodeRisk }) {
  const eff = effectiveRisk({ autoRisk: risk }, risk.asOf);
  const m = eff.method;
  if (!m) return <p className="mt-1">Unknown method; the assessment is ignored.</p>;
  return (
    <dl className="mt-1 space-y-1">
      <div>
        <dt className="inline text-mist">Level: </dt>
        <dd className="inline">
          {RISK_LEVELS[risk.level].label}
          {risk.basis ? ` (${risk.basis})` : ''}
        </dd>
      </div>
      <div>
        <dt className="inline text-mist">Method: </dt>
        <dd className="inline">
          {m.name}. {m.rule}
        </dd>
      </div>
      <div>
        <dt className="inline text-mist">Source: </dt>
        <dd className="inline">
          <a className="text-gold hover:underline" href={m.sourceUrl} target="_blank" rel="noreferrer">
            {m.source}
          </a>
        </dd>
      </div>
      <div>
        <dt className="inline text-mist">As of: </dt>
        <dd className="inline">{risk.asOf}</dd>
      </div>
    </dl>
  );
}
