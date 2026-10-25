import { ArrowLeft, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { INDICATORS } from '../../shared/indicators';
import type { ComparePoint, CompareYear } from '../../shared/types';
import { ErrorState, PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { getJson } from '../lib/api';
import { fmtIndicator } from '../lib/format';
import { linearScale, logScale, padExtent } from '../lib/scales';
import { usePrefs } from '../store/prefs';

const W = 900;
const H = 520;
const PAD = { l: 92, r: 16, t: 16, b: 44 };
const MIN_YEAR = 1990;
const MAX_YEAR = new Date().getUTCFullYear() - 1;
/** World Bank series typically lag 1–2 years; start on a year most indicators cover. */
const DEFAULT_YEAR = MAX_YEAR - 2;

/** World Bank regions, coloured with the muted brand palette. Matched by prefix to tolerate renames. */
const REGION_COLORS: [string, string][] = [
  ['East Asia', '#c9a35a'],
  ['Europe', '#7d9cc0'],
  ['Latin America', '#5e9f7e'],
  ['Middle East', '#c98a5a'],
  ['North America', '#9d8bb8'],
  ['South Asia', '#d8c27a'],
  ['Sub-Saharan', '#c2605b'],
];

function regionColor(region: string): string {
  return REGION_COLORS.find(([k]) => region.startsWith(k))?.[1] ?? '#77756f';
}

const LOG_DEFAULT = new Set(['NY.GDP.PCAP.CD', 'NY.GDP.MKTP.CD', 'SP.POP.TOTL', 'AG.SRF.TOTL.K2', 'MS.MIL.XPND.CD', 'MS.MIL.TOTL.P1']);
const def = (id: string) => INDICATORS.find((i) => i.id === id)!;
const fmt = (id: string, v: number) => fmtIndicator({ id, label: '', unit: def(id).unit, value: v, date: null });

export default function Compare() {
  const navigate = useNavigate();
  const favorites = usePrefs((s) => s.favorites);
  const [x, setX] = useState('NY.GDP.PCAP.CD');
  const [y, setY] = useState('SP.DYN.LE00.IN');
  const [size, setSize] = useState('SP.POP.TOTL');
  const [logX, setLogX] = useState(true);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [playing, setPlaying] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<ComparePoint | null>(null);
  const [cache, setCache] = useState<Record<string, CompareYear | { error: string }>>({});
  const [retry, setRetry] = useState(0);
  const requested = useRef(new Set<string>());

  const key = `${year}|${x}|${y}|${size}`;
  const entry = cache[key];

  // Fetch the current year and prefetch the next one. Each key is requested once and cached, so playback and
  // scrubbing are instant; requests are not aborted because every response is worth keeping.
  useEffect(() => {
    for (const yr of [year, Math.min(MAX_YEAR, year + 1)]) {
      const k = `${yr}|${x}|${y}|${size}`;
      if (requested.current.has(k)) continue;
      requested.current.add(k);
      getJson<CompareYear>(`/api/compare/${yr}?x=${x}&y=${y}&size=${size}`)
        .then((d) => setCache((c) => ({ ...c, [k]: d })))
        .catch((e: Error) => setCache((c) => ({ ...c, [k]: { error: e.message } })));
    }
  }, [year, x, y, size, retry]);

  // Advance one year per tick while playing, waiting until the year on screen has loaded.
  useEffect(() => {
    if (!playing || !entry) return;
    const t = setTimeout(() => {
      if (year >= MAX_YEAR) setPlaying(false);
      else setYear((v) => v + 1);
    }, 900);
    return () => clearTimeout(t);
  }, [playing, entry, year]);

  // Keep showing the most recent loaded frame for these axes while a new year loads.
  const shown = useMemo(() => {
    if (entry && 'points' in entry) return entry;
    for (let d = 1; d <= MAX_YEAR - MIN_YEAR; d++) {
      for (const yr of [year - d, year + d]) {
        const e = cache[`${yr}|${x}|${y}|${size}`];
        if (e && 'points' in e) return e;
      }
    }
    return null;
  }, [entry, cache, year, x, y, size]);

  const regions = useMemo(() => [...new Set((shown?.points ?? []).map((p) => p.region))].sort(), [shown]);
  const points = useMemo(() => (shown?.points ?? []).filter((p) => !hidden.has(p.region) && (!logX || p.x > 0)), [shown, hidden, logX]);

  const chart = useMemo(() => {
    // Generous padding so the largest bubbles (radius up to ~37px) stay inside the plot area.
    const [x0, x1] = padExtent(points.map((p) => p.x), logX, 0.1);
    const [y0, y1] = padExtent(points.map((p) => p.y), false, 0.14);
    const xs = (logX ? logScale : linearScale)(x0, x1, PAD.l, W - PAD.r);
    const ys = linearScale(y0, y1, H - PAD.b, PAD.t);
    const maxSize = Math.max(1, ...points.map((p) => p.size ?? 0));
    const r = (s: number | null) => (s == null ? 4 : 3 + Math.sqrt(s / maxSize) * 34);
    return { xs, ys, r };
  }, [points, logX]);

  const loading = !entry;
  const err = entry && 'error' in entry ? entry.error : null;
  const sorted = [...points].sort((a, b) => (b.size ?? 0) - (a.size ?? 0));

  const select = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="block min-w-0 flex-1">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {INDICATORS.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link to="/countries" className="btn-quiet -ml-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Country dossiers
      </Link>
      <PageHeader eyebrow="Country Intelligence" title="Compare countries over time">
        Plot any two World Bank indicators against each other, size bubbles by a third, and play the years forward. Click a
        bubble to open the country dossier.
      </PageHeader>

      <Panel bodyClass="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          {select('Horizontal axis', x, (v) => {
            setX(v);
            setLogX(LOG_DEFAULT.has(v));
          })}
          {select('Vertical axis', y, setY)}
          {select('Bubble size', size, setSize)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-mist">
            <input type="checkbox" className="accent-[#c9a35a]" checked={logX} onChange={(e) => setLogX(e.target.checked)} /> Log scale (horizontal)
          </label>
          <span className="flex items-center gap-1.5 text-xs text-slate-dim">
            <ProvenanceBadge kind="confirmed" /> World Bank WDI
          </span>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_240px]">
        <section className="panel relative min-w-0 p-2">
          <div aria-hidden className="pointer-events-none absolute right-6 bottom-24 font-display text-7xl font-bold text-ink-700/80 select-none md:text-8xl">
            {shown?.year ?? year}
          </div>
          {err && !shown && (
            <div className="p-4">
              <ErrorState
                message={err}
                onRetry={() => {
                  requested.current.delete(key);
                  setCache((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== key)));
                  setRetry((n) => n + 1);
                }}
              />
            </div>
          )}
          {!err && !shown && <p className="p-6 text-sm text-mist">Loading World Bank data…</p>}
          {shown && points.length === 0 && <p className="p-6 text-sm text-mist">No observations for these indicators in {year}. Try an earlier year.</p>}
          {shown && points.length > 0 && (
            <svg viewBox={`0 0 ${W} ${H}`} className="relative w-full" role="img" aria-label={`${def(y).label} versus ${def(x).label}, ${shown.year}`}>
              <g fontSize="11" fill="#77756f">
                {chart.ys.ticks.map((t) => (
                  <g key={`y${t}`}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={chart.ys(t)} y2={chart.ys(t)} stroke="#1f1f23" />
                    <text x={PAD.l - 8} y={chart.ys(t) + 4} textAnchor="end">
                      {fmt(y, t)}
                    </text>
                  </g>
                ))}
                {chart.xs.ticks.map((t) => (
                  <g key={`x${t}`}>
                    <line x1={chart.xs(t)} x2={chart.xs(t)} y1={PAD.t} y2={H - PAD.b} stroke="#1f1f23" />
                    <text x={chart.xs(t)} y={H - PAD.b + 16} textAnchor="middle">
                      {fmt(x, t)}
                    </text>
                  </g>
                ))}
                <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fill="#adaba5">
                  {def(x).label}
                  {logX ? ' (log)' : ''}
                </text>
                <text transform={`translate(16 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" fill="#adaba5">
                  {def(y).label}
                </text>
              </g>
              {sorted.map((p) => {
                const fav = favorites.includes(p.iso3);
                return (
                  <circle
                    key={p.iso3}
                    r={chart.r(p.size)}
                    style={{ transform: `translate(${chart.xs(p.x)}px, ${chart.ys(p.y)}px)`, transition: 'transform 0.8s ease' }}
                    fill={regionColor(p.region)}
                    fillOpacity={hover && hover.iso3 !== p.iso3 ? 0.25 : 0.7}
                    stroke={fav || hover?.iso3 === p.iso3 ? '#f1f0ec' : '#0d0d0e'}
                    strokeWidth={fav || hover?.iso3 === p.iso3 ? 1.6 : 0.6}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.name}: ${fmt(x, p.x)}, ${fmt(y, p.y)}`}
                    onMouseEnter={() => setHover(p)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(p)}
                    onBlur={() => setHover(null)}
                    onClick={() => navigate(`/countries/${p.iso3}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/countries/${p.iso3}`)}
                  />
                );
              })}
            </svg>
          )}
          {hover && (
            <div className="absolute left-4 top-4 z-10 rounded-md border border-line bg-ink-900/95 px-3 py-2 text-xs shadow-xl">
              <div className="font-semibold text-platinum">{hover.name}</div>
              <div className="text-slate-dim">{hover.region}</div>
              <div className="num mt-1 text-mist">
                {def(x).label}: <span className="text-platinum">{fmt(x, hover.x)}</span>
              </div>
              <div className="num text-mist">
                {def(y).label}: <span className="text-platinum">{fmt(y, hover.y)}</span>
              </div>
              {hover.size != null && (
                <div className="num text-mist">
                  {def(size).label}: <span className="text-platinum">{fmt(size, hover.size)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 px-3 pb-2 pt-1">
            <button className="btn-ghost px-2.5" aria-label={playing ? 'Pause' : 'Play years'} onClick={() => {
                if (playing) return setPlaying(false);
                if (year >= MAX_YEAR) setYear(MIN_YEAR);
                setPlaying(true);
              }}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={year}
              onChange={(e) => {
                setPlaying(false);
                setYear(+e.target.value);
              }}
              className="flex-1 accent-[#c9a35a]"
              aria-label="Year"
            />
            <span className="num w-20 text-right text-sm text-platinum">
              {year}
              {loading && <span className="ml-1 text-[10px] text-slate-dim">…</span>}
            </span>
          </div>
        </section>

        <aside className="space-y-4">
          <Panel title="Regions" bodyClass="p-3">
            <ul className="space-y-1">
              {regions.map((r) => (
                <li key={r}>
                  <button
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${hidden.has(r) ? 'text-slate-dim' : 'text-mist hover:text-platinum'}`}
                    aria-pressed={!hidden.has(r)}
                    onClick={() =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (n.has(r)) n.delete(r);
                        else n.add(r);
                        return n;
                      })
                    }
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: regionColor(r), opacity: hidden.has(r) ? 0.3 : 1 }} />
                    {r}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-dim">
              {points.length} economies with data in {shown?.year ?? year}. Favourites are outlined.
            </p>
          </Panel>
          <p className="text-[11px] leading-relaxed text-slate-dim">
            Each frame uses the values reported for that year; countries without data for an indicator are omitted rather than
            estimated. Chart concept inspired by Gapminder's bubble charts; all data from the World Bank.
          </p>
        </aside>
      </div>
    </div>
  );
}
