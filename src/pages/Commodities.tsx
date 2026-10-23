import { Download, LineChart as LineIcon, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Loading, PageHeader, Panel, ProvenanceBadge, Unavailable } from '../components/ui';
import { useApi } from '../lib/api';
import { COMMODITY_DATA_PATH, COT_LINKS, GROUPS, change, correlation, lastIndex, monthAt, percentile, rebased, toCsv, volatility, type CommodityData, type CommoditySeries } from '../lib/commodities';
import { usePrefs } from '../store/prefs';

const PERIODS = [
  { id: '1y', label: '1 year', months: 12 },
  { id: '3y', label: '3 years', months: 36 },
  { id: '5y', label: '5 years', months: 60 },
  { id: '10y', label: '10 years', months: 120 },
  { id: 'max', label: 'Since 1990', months: 10_000 },
] as const;
const MAX_COMPARE = 4;
const COLORS = ['#c9a35a', '#e8e4d8', '#6f9cb5', '#c9733f'];
/** Map Explorer layers that show which economies depend on each group. */
const MAP_LINKS: Record<string, { layer: string; label: string }[]> = {
  Energy: [
    { layer: 'fuel-exports', label: 'Fuel exporters' },
    { layer: 'energy-dependence', label: 'Energy importers' },
    { layer: 'power-gas', label: 'Gas in the power mix' },
  ],
  'Precious metals': [{ layer: 'mineral-rents', label: 'Mineral rents' }],
  'Base metals and ores': [
    { layer: 'metal-exports', label: 'Metal exporters' },
    { layer: 'manufacturing', label: 'Manufacturing economies' },
  ],
  Agriculture: [{ layer: 'food-exports', label: 'Food exporters' }],
  Fertilisers: [{ layer: 'food-exports', label: 'Food exporters' }],
};

const pct = (v: number | null, digits = 1) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`);
const tone = (v: number | null) => (v == null ? 'text-slate-dim' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-mist');
const price = (v: number | null | undefined) => (v == null ? '–' : v >= 1000 ? Math.round(v).toLocaleString('en-GB') : v.toLocaleString('en-GB', { maximumFractionDigits: v >= 100 ? 1 : 2 }));

/**
 * Commodity & Energy Monitor: official World Bank monthly average prices for energy, metals, agriculture and fertilisers,
 * with period changes, volatility, historical position, comparison, correlations and links to positioning, exposure maps
 * and the chart editor. Monthly averages only; daily, spot and futures data need a licensed feed.
 */
export default function Commodities() {
  const res = useApi<CommodityData>(COMMODITY_DATA_PATH);
  const { commodityWatch, toggleCommodity } = usePrefs();
  const [group, setGroup] = useState<string>('all');
  const [selected, setSelected] = useState<string[]>(['brent', 'gas-eu', 'copper']);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('5y');
  const data = res.status === 'ready' ? res.data : null;

  const rows = useMemo(
    () =>
      (data?.series ?? []).map((s) => {
        const i = lastIndex(s.values);
        return { s, latest: i >= 0 ? s.values[i] : null, month: i >= 0 && data ? monthAt(data.start, i) : '', m1: change(s.values, 1), m3: change(s.values, 3), m12: change(s.values, 12), vol: volatility(s.values, 12), pos: percentile(s.values, 120) };
      }),
    [data],
  );

  if (res.status === 'loading') return <div className="mx-auto max-w-7xl px-4 py-8"><Loading /></div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-mist">
        The commodity price file could not be loaded. Please try again later.
      </div>
    );
  }

  const visible = rows.filter((r) => (group === 'all' ? true : group === 'watchlist' ? commodityWatch.includes(r.s.id) : r.s.group === group));
  const months = PERIODS.find((p) => p.id === period)!.months;
  const compared = selected.map((id) => data.series.find((s) => s.id === id)).filter((s): s is CommoditySeries => !!s);
  const toggleSelected = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPARE ? [...cur.slice(1), id] : [...cur, id]));
  const download = () => {
    const ids = compared.length ? compared.map((s) => s.id) : data.series.map((s) => s.id);
    const url = URL.createObjectURL(new Blob([toCsv(data, ids)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurora-commodities-${data.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        eyebrow="Market Terminal"
        title="Commodity & Energy Monitor"
        actions={
          <>
            <Link to="/markets" className="btn-ghost text-xs">
              Chart editor
            </Link>
            <Link to="/positioning" className="btn-ghost text-xs">
              Futures positioning (CFTC)
            </Link>
          </>
        }
      >
        Energy, metals, agricultural and fertiliser benchmarks with changes, volatility, long-run position and comparisons. Prices are official
        monthly averages, not live or spot quotes.
      </PageHeader>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-dim">
        <ProvenanceBadge kind="confirmed" />
        <span>
          {data.source.attribution}. {data.kind}. Latest month {data.end}; published {data.publisherUpdated}. The World Bank publishes once a month,
          usually in the first week.
        </span>
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter commodities">
        {['all', 'watchlist', ...GROUPS].map((g) => (
          <button key={g} className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
            {g === 'all' ? 'All' : g === 'watchlist' ? `Watchlist (${commodityWatch.length})` : g}
          </button>
        ))}
      </div>

      <Panel title="Benchmarks" bodyClass="p-0" actions={<span className="text-[11px] text-slate-dim">Tick up to {MAX_COMPARE} to compare</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="text-slate-dim">
              <tr>
                <th className="w-8 px-2 py-2">
                  <span className="sr-only">Watchlist</span>
                </th>
                <th className="px-2 py-2">Commodity</th>
                <th className="px-2 py-2 text-right">Latest</th>
                <th className="px-2 py-2 text-right">1 month</th>
                <th className="px-2 py-2 text-right">3 months</th>
                <th className="px-2 py-2 text-right">12 months</th>
                <th className="px-2 py-2 text-right" title="Annualised standard deviation of the last 12 monthly log returns">
                  Volatility (12m)
                </th>
                <th className="px-2 py-2" title="Where the latest value sits among the last 10 years of monthly averages">
                  10-year position
                </th>
                <th className="px-2 py-2 text-right">Compare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map(({ s, latest, month, m1, m3, m12, vol, pos }) => (
                <tr key={s.id} className="align-top">
                  <td className="px-2 py-2">
                    <button
                      className="tap text-slate-dim hover:text-gold"
                      onClick={() => toggleCommodity(s.id)}
                      aria-pressed={commodityWatch.includes(s.id)}
                      aria-label={`${commodityWatch.includes(s.id) ? 'Remove' : 'Add'} ${s.name} ${commodityWatch.includes(s.id) ? 'from' : 'to'} the watchlist`}
                    >
                      <Star className={`h-3.5 w-3.5 ${commodityWatch.includes(s.id) ? 'fill-gold text-gold' : ''}`} />
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-platinum">{s.name}</div>
                    <div className="text-[11px] text-slate-dim">
                      {s.benchmark} · {s.group}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <Link className="inline-flex min-h-6 items-center text-gold hover:underline" to={`/markets?symbol=CMD:${s.id}`}>
                        <LineIcon className="mr-0.5 inline h-3 w-3" aria-hidden />
                        Chart
                      </Link>
                      {COT_LINKS[s.id] && (
                        <Link className="inline-flex min-h-6 items-center text-gold hover:underline" to={`/positioning?m=${COT_LINKS[s.id]}`}>
                          Positioning
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-right text-platinum">
                    {price(latest)}
                    <div className="text-[11px] text-slate-dim">
                      {s.unit} · {month}
                    </div>
                  </td>
                  <td className={`num px-2 py-2 text-right ${tone(m1)}`}>{pct(m1)}</td>
                  <td className={`num px-2 py-2 text-right ${tone(m3)}`}>{pct(m3)}</td>
                  <td className={`num px-2 py-2 text-right ${tone(m12)}`}>{pct(m12)}</td>
                  <td className="num px-2 py-2 text-right text-mist">{vol == null ? '–' : `${vol.toFixed(0)}%`}</td>
                  <td className="px-2 py-2">
                    {pos == null ? (
                      <span className="text-slate-dim">–</span>
                    ) : (
                      <div className="flex items-center gap-2" title={`Higher than or equal to ${pos.toFixed(0)}% of the last 120 monthly averages`}>
                        <div className="relative h-1.5 w-24 rounded bg-ink-700">
                          <div className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded bg-gold" style={{ left: `calc(${pos}% - 2px)` }} />
                        </div>
                        <span className="num text-[11px] text-mist">{pos.toFixed(0)}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input type="checkbox" className="tap accent-[#c9a35a]" checked={selected.includes(s.id)} onChange={() => toggleSelected(s.id)} aria-label={`Compare ${s.name}`} />
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-slate-dim">
                    No commodities in this view. Star commodities to build your watchlist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Comparison (rebased to 100)">
          <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Comparison period">
            {PERIODS.map((p) => (
              <button key={p.id} className="chip" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          {compared.length ? (
            <CompareChart series={compared.map((s, k) => ({ name: s.name, color: COLORS[k]!, points: rebased(s.values, data.start, months) }))} />
          ) : (
            <p className="text-sm text-slate-dim">Tick commodities in the table to compare them.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-dim">
            <span>Each line starts at 100 at the beginning of the period, so moves are comparable across units.</span>
            <button className="btn-ghost text-xs" onClick={download}>
              <Download className="h-3.5 w-3.5" /> CSV {compared.length ? `(${compared.length} selected)` : '(all)'}
            </button>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Correlation of monthly changes" eyebrow="Last 5 years">
            {compared.length >= 2 ? (
              <table className="w-full text-xs">
                <tbody>
                  {compared.flatMap((a, i) =>
                    compared.slice(i + 1).map((b) => {
                      const c = correlation(a.values, b.values, 60);
                      return (
                        <tr key={`${a.id}-${b.id}`}>
                          <td className="py-1 text-mist">
                            {a.name} · {b.name}
                          </td>
                          <td className="num py-1 text-right text-platinum">{c == null ? '–' : c.toFixed(2)}</td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-dim">Select two or more commodities.</p>
            )}
            <p className="mt-2 text-[11px] text-slate-dim">Pearson correlation of monthly log returns (−1 to 1). An observed co-movement, not evidence that one price drives the other.</p>
          </Panel>
          <Panel title="Who is exposed" eyebrow="Map Explorer">
            <ul className="space-y-1 text-xs">
              {[...new Set(compared.map((s) => s.group))].flatMap((g) =>
                (MAP_LINKS[g] ?? []).map((m) => (
                  <li key={`${g}-${m.layer}`}>
                    <Link className="text-gold hover:underline" to={`/geo?m=2d&l=${m.layer}`}>
                      {m.label}
                    </Link>{' '}
                    <span className="text-slate-dim">({g})</span>
                  </li>
                )),
              )}
              {!compared.length && <li className="text-slate-dim">Select commodities to see related exposure maps.</li>}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Unavailable phase="planned">
          Daily, spot and futures prices (including futures curves) need a licensed market data feed with public display rights. Twelve Data is connected
          but its display licence is not confirmed, so those prices are not shown.
        </Unavailable>
        <Unavailable phase="planned">
          Electricity prices need the ENTSO-E Transparency Platform (free token, owner registration). Uranium has no free source with publication rights
          yet. Event overlays on commodity charts come with Market Impact Intelligence.
        </Unavailable>
      </div>
    </div>
  );
}

/** Rebased multi-line comparison (SVG), with a hover readout. */
function CompareChart({ series }: { series: { name: string; color: string; points: { date: string; value: number | null }[] }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 260;
  const P = { l: 40, r: 12, t: 12, b: 24 };
  const n = Math.max(...series.map((s) => s.points.length));
  const all = series.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v != null));
  if (n < 2 || !all.length) return <p className="text-sm text-slate-dim">Not enough observations in this period.</p>;
  const lo = Math.min(...all, 100);
  const hi = Math.max(...all, 100);
  const pad = (hi - lo) * 0.06 || 5;
  const y = (v: number) => P.t + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - P.t - P.b);
  const x = (i: number) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const ref = series.find((s) => s.points.length === n)!.points;
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));
  const step = Math.max(1, Math.ceil(n / 6));
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Comparison of ${series.map((s) => s.name).join(', ')}, rebased to 100`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const sx = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((sx - P.l) / (W - P.l - P.r)) * (n - 1)))));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#2a2a2e" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8a8a92">
              {t}
            </text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={y(100)} y2={y(100)} stroke="#4a4a50" strokeDasharray="3 3" />
        {ref.map((p, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="10" fill="#8a8a92">
              {p.date}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const offset = n - s.points.length;
          let d = '';
          s.points.forEach((p, k) => {
            if (p.value == null) return;
            d += `${d && s.points[k - 1]?.value != null ? 'L' : 'M'}${x(k + offset)},${y(p.value)}`;
          });
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth="1.8" />;
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="#3a3a40" />}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {series.map((s) => {
          const offset = n - s.points.length;
          const v = hover != null ? s.points[hover - offset]?.value : s.points.at(-1)?.value;
          return (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: s.color }} />
              <span className="text-mist">{s.name}</span>
              <span className="num text-platinum">{v == null ? '–' : v.toFixed(0)}</span>
            </li>
          );
        })}
        {hover != null && <li className="text-slate-dim">{ref[hover]?.date}</li>}
      </ul>
    </div>
  );
}
