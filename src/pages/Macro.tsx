import { Download } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  ECB_SOURCE,
  ECB_TARGET,
  MACRO_MAP,
  MACRO_SERIES,
  crossRates,
  lastChange,
  macroCsv,
  summariseMacro,
  type MacroObs,
  type MacroResponse,
  type MacroSeriesDef,
} from '../../shared/macro';
import { AddToBrain } from '../components/AddToBrain';
import { PerformanceChart, type PerformanceSeries } from '../components/PerformanceChart';
import { ErrorState, Loading, PageHeader, Panel, ProvenanceBadge, Sparkline } from '../components/ui';
import { useApi } from '../lib/api';
import { fmtDate, fmtNumber, fmtPct } from '../lib/format';

const RANGES = [2, 10, 25];
const FX = MACRO_SERIES.filter((s) => s.group === 'fx');
const NO_OBS: MacroObs[] = [];
const pctAxis = (v: number) => `${v.toFixed(2)}%`;
const rateAxis = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(4));
/** Charts need daily dates; monthly observations are plotted on the first day of their month. */
const chartDate = (d: string) => (d.length === 7 ? `${d}-01` : d);
const pp = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)} pp`);
/** Relative change shown with `digits` decimals in percent; values that round to zero are neutral and unsigned. */
const rounded = (v: number | null, digits: number) => (v == null ? null : Math.round(v * 100 * 10 ** digits) / 10 ** digits / 100);
const tone = (v: number | null, digits: number) => {
  const r = rounded(v, digits);
  return r == null || r === 0 ? '' : r > 0 ? 'text-up' : 'text-down';
};
const chg = (v: number | null, digits: number) => {
  const r = rounded(v, digits);
  return fmtPct(r === 0 ? 0 : r, digits, true);
};

function fxDigits(v: number) {
  return v >= 100 ? 2 : v >= 10 ? 3 : 4;
}

export default function Macro() {
  const [params, setParams] = useSearchParams();
  const selected = MACRO_MAP.get(params.get('s') ?? '') ?? MACRO_MAP.get('EURUSD')!;
  const base = params.get('base') === 'USD' ? 'USD' : 'EUR';
  const years = RANGES.includes(Number(params.get('y'))) ? Number(params.get('y')) : 10;
  const update = (next: Record<string, string>) => setParams({ s: selected.id, base, y: String(years), ...next }, { replace: true });

  const overview = useApi<MacroResponse>('/api/macro');
  const detail = useApi<MacroResponse>(`/api/macro/${selected.id}?years=${years}`);
  // Detail in USD terms needs the EUR/USD history as well (not needed for EUR/USD itself).
  const needsUsd = selected.group === 'fx' && base === 'USD' && selected.id !== 'EURUSD';
  const usdHistory = useApi<MacroResponse>(needsUsd ? `/api/macro/EURUSD?years=${years}` : null);

  const byId = useMemo(() => new Map(overview.status === 'ready' ? overview.data.series.map((s) => [s.id, s.obs]) : []), [overview]);
  const obsOf = (id: string) => byId.get(id) ?? NO_OBS;

  // FX rows in the chosen base. USD base: EUR becomes "EUR per USD"; others X per USD via the EUR cross.
  const fxRows = useMemo(() => {
    const usd = byId.get('EURUSD') ?? NO_OBS;
    const rel: MacroSeriesDef = { ...FX[0]!, unit: 'per EUR' };
    const rows = FX.flatMap((def) => {
      const code = def.id.slice(3);
      if (base === 'USD' && code === 'USD') {
        const s = summariseMacro(rel, crossRates('EUR', usd));
        return s ? [{ def, code: 'EUR', name: 'Euro', obs: crossRates('EUR', usd), s }] : [];
      }
      const raw = byId.get(def.id) ?? NO_OBS;
      const obs = base === 'USD' ? crossRates(raw, usd) : raw;
      const s = summariseMacro(rel, obs);
      return s ? [{ def, code, name: def.label, obs, s }] : [];
    });
    return rows;
  }, [byId, base]);

  const conditions = useMemo((): PerformanceSeries[] => {
    const line = (id: string, label: string, color: string) => ({ label, color, points: (byId.get(id) ?? NO_OBS).map((o) => ({ time: chartDate(o.date), value: o.value })) });
    return [line('ECB-DFR', 'ECB deposit rate', '#c9a35a'), line('HICP', 'HICP inflation', '#7d9cc0'), line('EA-10Y', '10-year yield', '#8a8780')].filter((s) => s.points.length > 0);
  }, [byId]);

  const selId = selected.id;
  const selGroup = selected.group;
  // Memoised by the React Compiler.
  const detailObs = (() => {
    const own = detail.status === 'ready' ? (detail.data.series[0]?.obs ?? NO_OBS) : NO_OBS;
    if (selGroup !== 'fx' || base === 'EUR') return own;
    if (selId === 'EURUSD') return crossRates('EUR', own);
    const usd = usdHistory.status === 'ready' ? (usdHistory.data.series[0]?.obs ?? NO_OBS) : NO_OBS;
    return crossRates(own, usd);
  })();

  const detailLabel =
    selGroup !== 'fx' ? selected.label : base === 'EUR' ? `${selId.slice(3)} per EUR` : selId === 'EURUSD' ? 'EUR per USD' : `${selId.slice(3)} per USD`;
  const detailSeries = ((): PerformanceSeries[] => {
    const out: PerformanceSeries[] = [{ label: detailLabel, color: '#c9a35a', points: detailObs.map((o) => ({ time: chartDate(o.date), value: o.value })) }];
    if (selGroup === 'inflation' && detailObs.length) out.push({ label: 'ECB target 2%', color: '#5e5c57', points: detailObs.map((o) => ({ time: chartDate(o.date), value: ECB_TARGET })) });
    return out;
  })();
  const detailLoading = detail.status === 'loading' || (needsUsd && usdHistory.status === 'loading');
  const detailError = detail.status === 'error' ? detail.error : needsUsd && usdHistory.status === 'error' ? usdHistory.error : null;

  const exportCsv = () => {
    const note = selected.group === 'fx' && base === 'USD' ? 'cross rate vs USD computed by Aurora Veritatis from ECB reference rates' : '';
    const url = URL.createObjectURL(new Blob([macroCsv({ ...selected, label: detailLabel }, detailObs, note)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `av-${selected.id}${selected.group === 'fx' ? `-${base}` : ''}-${detailObs.at(-1)?.date ?? 'latest'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dfr = obsOf('ECB-DFR');
  const dfrChange = lastChange(dfr);
  const hicp = summariseMacro(MACRO_MAP.get('HICP')!, obsOf('HICP'));
  const core = obsOf('HICP-CORE').at(-1);
  const y10 = summariseMacro(MACRO_MAP.get('EA-10Y')!, obsOf('EA-10Y'));
  const eurusd = summariseMacro(MACRO_MAP.get('EURUSD')!, obsOf('EURUSD'));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Market Terminal · Official data" title="Macro & FX">
        Euro-area monetary conditions and ECB euro reference exchange rates: policy rates, inflation against the ECB target,
        long-term yields and currency moves, all from the European Central Bank's statistical data.
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-dim">
        <ProvenanceBadge kind="confirmed" />
        <span>
          {ECB_SOURCE.name}. Reference rates are published around 16:00 CET on working days for information only — not
          trading rates. Cross rates and changes are computed by Aurora Veritatis.
        </span>
      </div>

      {overview.status === 'loading' && <Loading label="Loading ECB statistics" />}
      {overview.status === 'error' && <ErrorState message={overview.error} onRetry={overview.reload} />}
      {overview.status === 'ready' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Panel title="ECB deposit facility rate">
              <div className="num text-3xl font-semibold text-platinum">{dfr.at(-1) ? `${dfr.at(-1)!.value.toFixed(2)}%` : '—'}</div>
              <p className="mt-1 text-xs text-slate-dim">
                {dfrChange ? `Last change ${fmtDate(dfrChange.date)}: ${dfrChange.from.toFixed(2)}% → ${dfrChange.to.toFixed(2)}%` : 'No change in the period shown'}
              </p>
            </Panel>
            <Panel title="Euro-area inflation (HICP)">
              <div className="num text-3xl font-semibold text-platinum">{hicp ? `${hicp.latest.value.toFixed(1)}%` : '—'}</div>
              <p className="mt-1 text-xs text-slate-dim">
                {hicp ? `${hicp.latest.date} · ${hicp.latest.value > ECB_TARGET ? 'above' : hicp.latest.value < ECB_TARGET ? 'below' : 'at'} the ${ECB_TARGET}% target` : ''}
                {core ? ` · core ${core.value.toFixed(1)}%` : ''}
              </p>
            </Panel>
            <Panel title="Euro-area 10-year yield">
              <div className="num text-3xl font-semibold text-platinum">{y10 ? `${y10.latest.value.toFixed(2)}%` : '—'}</div>
              <p className="mt-1 text-xs text-slate-dim">{y10 ? `${fmtDate(y10.latest.date)} · 1 yr ${pp(y10.change365)}` : ''} · AAA-rated government bonds</p>
            </Panel>
            <Panel title="EUR/USD reference rate">
              <div className="num text-3xl font-semibold text-platinum">{eurusd ? fmtNumber(eurusd.latest.value, 4) : '—'}</div>
              <p className="mt-1 text-xs text-slate-dim">{eurusd ? `${fmtDate(eurusd.latest.date)} · 1 yr ${fmtPct(eurusd.change365, 1, true)}` : ''}</p>
            </Panel>
          </div>

          {conditions.length > 0 && (
            <Panel title="Monetary conditions" eyebrow="Last two years · percent" className="mt-4">
              <div className="h-64">
                <PerformanceChart series={conditions} format={pctAxis} />
              </div>
              <p className="mt-2 text-[11px] text-slate-dim">
                <span className="text-gold">Gold</span>: ECB deposit facility rate. <span className="text-info">Blue</span>: HICP annual
                inflation (monthly, plotted at the start of each month). Grey: euro-area 10-year AAA yield.
              </p>
            </Panel>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <Panel
              title="Exchange rates"
              eyebrow={`Units of currency per ${base}`}
              bodyClass="p-0"
              actions={
                <div className="flex gap-1">
                  {(['EUR', 'USD'] as const).map((b) => (
                    <button key={b} className="chip" aria-pressed={base === b} onClick={() => update({ base: b })}>
                      vs {b}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="num w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs text-mist">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2 font-medium">Currency</th>
                      <th className="px-2 py-2 text-right font-medium">Rate</th>
                      <th className="px-2 py-2 text-right font-medium">1 day</th>
                      <th className="px-2 py-2 text-right font-medium">1 month</th>
                      <th className="px-2 py-2 text-right font-medium">1 year</th>
                      <th className="px-4 py-2 font-medium">90 days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {fxRows.map((r) => (
                      <tr key={r.def.id} className={`cursor-pointer hover:bg-ink-800/60 ${selected.id === r.def.id ? 'bg-ink-800/60' : ''}`} onClick={() => update({ s: r.def.id })}>
                        <td className="px-4 py-2 font-sans">
                          <button className="text-left text-platinum hover:text-gold-soft" onClick={() => update({ s: r.def.id })}>
                            {r.code}
                          </button>
                          <span className="block text-[11px] text-slate-dim">{r.name}</span>
                        </td>
                        <td className="px-2 py-2 text-right text-platinum">{fmtNumber(r.s.latest.value, fxDigits(r.s.latest.value))}</td>
                        <td className={`px-2 py-2 text-right ${tone(r.s.change1, 2)}`}>{chg(r.s.change1, 2)}</td>
                        <td className={`px-2 py-2 text-right ${tone(r.s.change30, 1)}`}>{chg(r.s.change30, 1)}</td>
                        <td className={`px-2 py-2 text-right ${tone(r.s.change365, 1)}`}>{chg(r.s.change365, 1)}</td>
                        <td className="px-4 py-2">
                          <Sparkline values={r.obs.slice(-63).map((o) => o.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-2 text-[11px] text-slate-dim">
                A rising rate means the {base} buys more of that currency. Changes compare the latest reference rate with the last
                rate on or before 1 day / 30 days / 365 days earlier. Dates: {fxRows[0] ? fmtDate(fxRows[0].s.latest.date) : '—'}.
              </p>
            </Panel>

            <div className="min-w-0 space-y-4">
              <Panel
                title={detailLabel}
                eyebrow={`${selected.frequency} · ${selected.flow}.${selected.key}`}
                actions={
                  <div className="flex flex-wrap gap-1">
                    {RANGES.map((y) => (
                      <button key={y} className="chip" aria-pressed={years === y} onClick={() => update({ y: String(y) })}>
                        {y}Y
                      </button>
                    ))}
                    <button className="chip" onClick={exportCsv} disabled={detailObs.length === 0} aria-label="Download CSV">
                      <Download className="h-3.5 w-3.5" aria-hidden /> CSV
                    </button>
                  </div>
                }
              >
                {detailLoading && <Loading label="Loading history" />}
                {detailError && <ErrorState message={detailError} onRetry={detail.reload} />}
                {!detailLoading && !detailError && (detailObs.length === 0 ? (
                  <p className="text-sm text-slate-dim">The ECB returned no observations for this series and range.</p>
                ) : (
                  <div className="h-72">
                    <PerformanceChart series={detailSeries} format={selected.unit === 'percent' ? pctAxis : rateAxis} />
                  </div>
                ))}
              </Panel>
              <AddToBrain
                entity={{ kind: selected.group === 'fx' ? 'instrument' : 'indicator', label: selected.group === 'fx' ? `${selected.id.slice(3)} per EUR (${selected.label})` : selected.label, ref: { type: 'macro', id: selected.id } }}
              />
              <Panel title="Other series">
                <div className="flex flex-wrap gap-1.5">
                  {MACRO_SERIES.filter((s) => s.group !== 'fx').map((s) => (
                    <button key={s.id} className="chip" aria-pressed={selected.id === s.id} onClick={() => update({ s: s.id })}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          {overview.data.missing.length > 0 && (
            <p className="mt-3 text-xs text-slate-dim">
              No recent observations returned for: {overview.data.missing.map((id) => MACRO_MAP.get(id)?.label ?? id).join(', ')}.
            </p>
          )}
          <Panel title="Method & limitations" className="mt-4">
            <div className="grid gap-3 text-xs leading-relaxed text-mist md:grid-cols-3">
              <p>
                FX: ECB euro reference rates (series EXR, daily concertation around 14:10 CET, published ~16:00 CET). They are for
                information only; transaction rates differ. Rates against the US dollar are cross rates computed from two euro
                reference rates on the same day.
              </p>
              <p>
                Policy rates: deposit facility, main refinancing and marginal lending rates (series FM), shown at the level in force
                each business day. Yield: euro-area 10-year spot rate from the ECB yield curve for AAA-rated central-government bonds
                (series YC).
              </p>
              <p>
                Inflation: HICP annual rate of change for the euro area (changing composition, series ICP), monthly; flash estimates
                appear once the ECB data set includes them. Core excludes energy, food, alcohol and tobacco.{' '}
                <a className="text-gold hover:underline" href={ECB_SOURCE.url} target="_blank" rel="noreferrer">
                  ECB Data Portal
                </a>
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
