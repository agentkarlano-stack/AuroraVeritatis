import { Download, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  CURRENCY_INDICATORS,
  CURRENCY_OF,
  DEFAULT_COUNTRIES,
  convertViaEur,
  currencyCsv,
  externalValueIndex,
  inflationBetween,
  pppGap,
  purchasingPowerIndex,
  rateOn,
  realValue,
  type CurrencyProfile,
  type YearValue,
} from '../../shared/currency';
import { countryName } from '../../shared/countryNames';
import { ECB_SOURCE, MACRO_SERIES, type MacroResponse } from '../../shared/macro';
import { PerformanceChart, type PerformanceSeries } from '../components/PerformanceChart';
import { ErrorState, Loading, PageHeader, Panel, ProvenanceBadge } from '../components/ui';
import { useApi, type Loadable } from '../lib/api';
import { fmtDate, fmtNumber, fmtPct } from '../lib/format';

const MAX = 4;
const COLORS = ['#c9a35a', '#f1f0ec', '#8a9a7b', '#b07a5a'];
const ECONOMIES = Object.keys(CURRENCY_OF)
  .map((iso3) => ({ iso3, name: countryName(iso3) ?? iso3 }))
  .sort((a, b) => a.name.localeCompare(b.name));
/** ECB reference-rate currencies (quoted per EUR) plus the euro itself. */
const ECB_CODES = ['EUR', ...MACRO_SERIES.filter((s) => s.group === 'fx').map((s) => s.id.slice(3))];
const BASE_YEARS = [1990, 2000, 2010, 2015, 2020];

const idx = (v: number) => v.toFixed(0);
const pctAxis = (v: number) => `${v.toFixed(0)}%`;
const toPoints = (s: YearValue[], scale = 1) => s.map((p) => ({ time: `${p.year}-01-01`, value: p.value * scale }));
const label = (iso3: string) => `${countryName(iso3) ?? iso3} (${CURRENCY_OF[iso3] ?? 'local currency'})`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Currency() {
  const [params, setParams] = useSearchParams();
  const selected = useMemo(() => {
    const list = (params.get('c') ?? '').split(',').filter((c) => CURRENCY_OF[c]);
    return (list.length ? [...new Set(list)] : DEFAULT_COUNTRIES).slice(0, MAX);
  }, [params]);
  const base = BASE_YEARS.includes(Number(params.get('base'))) ? Number(params.get('base')) : 2010;
  const update = (patch: Record<string, string>) => setParams((p) => ({ ...Object.fromEntries(p), ...patch }), { replace: true });

  // Up to four economies: one request slot each (hooks cannot be called in a loop of varying length).
  const r0 = useApi<CurrencyProfile>(selected[0] ? `/api/currency/${selected[0]}` : null);
  const r1 = useApi<CurrencyProfile>(selected[1] ? `/api/currency/${selected[1]}` : null);
  const r2 = useApi<CurrencyProfile>(selected[2] ? `/api/currency/${selected[2]}` : null);
  const r3 = useApi<CurrencyProfile>(selected[3] ? `/api/currency/${selected[3]}` : null);
  const slots: Loadable<CurrencyProfile>[] = [r0, r1, r2, r3].slice(0, selected.length);
  const profiles = slots.flatMap((s) => (s.status === 'ready' ? [s.data] : []));
  const loading = slots.some((s) => s.status === 'loading');
  const failed = slots.flatMap((s, i) => (s.status === 'error' ? [selected[i]!] : []));

  const charts = useMemo(() => {
    const series = (f: (p: CurrencyProfile) => YearValue[], scale = 1): PerformanceSeries[] =>
      profiles.map((p) => ({ label: p.iso3, color: COLORS[selected.indexOf(p.iso3)] ?? '#adaba5', points: toPoints(f(p), scale) })).filter((s) => s.points.length > 1);
    return {
      ppi: series((p) => purchasingPowerIndex(p.series.cpi, base)),
      external: series((p) => externalValueIndex(p.series.fx, base)),
      gap: series((p) => pppGap(p.series.fx, p.series.ppp), 100),
      inflation: series((p) => p.series.inflation),
    };
    // `profiles` is rebuilt every render; its content only changes with these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r0, r1, r2, r3, base, selected]);

  const remove = (iso3: string) => update({ c: selected.filter((c) => c !== iso3).join(',') });
  const add = (iso3: string) => iso3 && update({ c: [...selected, iso3].slice(0, MAX).join(',') });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader eyebrow="Macro & FX" title="Currency and purchasing power">
        What money buys over time, and what currencies are worth against each other. Official annual statistics from the World Bank and daily ECB
        reference rates, with the formulas shown below.
      </PageHeader>

      <Panel title="Economies" eyebrow={`Up to ${MAX}. Values are in each economy’s own currency.`}>
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((iso3, i) => (
            <span key={iso3} className="chip flex items-center gap-1.5" style={{ borderColor: COLORS[i] }}>
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} aria-hidden />
              {label(iso3)}
              {selected.length > 1 && (
                <button className="btn-quiet -mr-1 px-0.5" aria-label={`Remove ${countryName(iso3) ?? iso3}`} onClick={() => remove(iso3)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {selected.length < MAX && (
            <select className="input w-auto" value="" onChange={(e) => add(e.target.value)} aria-label="Add an economy">
              <option value="">Add an economy…</option>
              {ECONOMIES.filter((e) => !selected.includes(e.iso3)).map((e) => (
                <option key={e.iso3} value={e.iso3}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <label className="ml-auto flex items-center gap-2 text-xs text-mist">
            Base year
            <select className="input w-auto" value={base} onChange={(e) => update({ base: e.target.value })} aria-label="Base year">
              {BASE_YEARS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        {failed.length > 0 && <p className="mt-3 text-sm text-down">Data could not be loaded for {failed.map((c) => countryName(c) ?? c).join(', ')}. Try again later.</p>}
      </Panel>

      {loading && !profiles.length ? (
        <div className="mt-4">
          <Loading label="Loading World Bank data" />
        </div>
      ) : !profiles.length && failed.length ? (
        <div className="mt-4">
          <ErrorState message="The World Bank data service is not responding." />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartPanel title="Purchasing power index" note={`What one unit of each currency buys at home, ${base} = 100. Falls as prices rise.`} series={charts.ppi} format={idx} />
          <ChartPanel
            title="Value against the US dollar"
            note={`US dollars per unit of each currency, ${base} = 100. Below 100 means the currency buys fewer dollars than in ${base}.`}
            series={charts.external}
            format={idx}
          />
          <ChartPanel
            title="Market rate against purchasing power parity"
            note="How far the market exchange rate is from PPP. Below 0%: prices are lower than in the US at market rates (undervalued against the dollar in PPP terms)."
            series={charts.gap}
            format={pctAxis}
          />
          <ChartPanel title="Annual inflation" note="Consumer price inflation, percent per year. The gap between two lines is the inflation differential." series={charts.inflation} format={pctAxis} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <InflationCalculator profiles={profiles} />
        <Converter />
        <HistoricalConverter />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Method">
          <ul className="space-y-2 text-sm text-mist">
            <li>
              <span className="text-platinum">Purchasing power index</span> = 100 × CPI<sub>base year</sub> / CPI<sub>year</sub>, within each economy.
            </li>
            <li>
              <span className="text-platinum">Value in another year</span> = amount × CPI<sub>to</sub> / CPI<sub>from</sub>. Annualised inflation = (CPI<sub>to</sub> /
              CPI<sub>from</sub>)<sup>1/years</sup> − 1.
            </li>
            <li>
              <span className="text-platinum">Value against the US dollar</span> = 100 × rate<sub>base year</sub> / rate<sub>year</sub>, with the official annual average
              rate in local currency per US dollar.
            </li>
            <li>
              <span className="text-platinum">Market rate against PPP</span> = PPP conversion factor / market rate − 1.
            </li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-dim">
            Limits: annual CPI averages smooth out changes within a year. PPP factors are revised when new price surveys are published. Euro-area
            members report all years in euros, converted at the fixed 1999 rates. ECB reference rates are for information only, not trading
            rates. This is research data, not investment advice.
          </p>
        </Panel>
        <Panel title="Sources and downloads">
          <p className="flex items-center gap-2 text-sm text-mist">
            <ProvenanceBadge kind="confirmed" /> World Bank WDI · CC BY 4.0
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-dim">
            {Object.values(CURRENCY_INDICATORS).map((d) => (
              <li key={d.id}>
                {d.label} <span className="font-mono">{d.id}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-sm text-mist">
            <ProvenanceBadge kind="confirmed" /> {ECB_SOURCE.name}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button key={p.iso3} className="btn-ghost text-xs" onClick={() => download(`aurora-currency-${p.iso3}.csv`, currencyCsv(p))}>
                <Download className="h-3.5 w-3.5" aria-hidden /> {p.iso3} CSV
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-dim">
            Daily euro reference rates and euro-area inflation: <Link className="text-gold hover:underline" to="/macro">Macro &amp; FX</Link>. Chart any ECB
            rate with indicators and drawings in the{' '}
            <Link className="text-gold hover:underline" to="/markets?symbol=ECB:EURUSD">
              chart editor
            </Link>
            .
          </p>
        </Panel>
      </div>
    </div>
  );
}

function ChartPanel({ title, note, series, format }: { title: string; note: string; series: PerformanceSeries[]; format: (v: number) => string }) {
  return (
    <Panel title={title}>
      {series.length ? (
        <>
          <div className="h-64">
            <PerformanceChart series={series} format={format} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-dim">{note}</p>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-dim">No data for this selection.</p>
      )}
    </Panel>
  );
}

function InflationCalculator({ profiles }: { profiles: CurrencyProfile[] }) {
  const [iso3, setIso3] = useState<string | null>(null);
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const p = profiles.find((x) => x.iso3 === iso3) ?? profiles[0];
  const years = p?.series.cpi.map((v) => v.year) ?? [];
  const fromYear = from !== null && years.includes(from) ? from : (years.find((y) => y >= 2000) ?? years[0]);
  const toYear = to !== null && years.includes(to) ? to : years.at(-1);
  const value = p && fromYear !== undefined && toYear !== undefined ? realValue(Number(amount), p.series.cpi, fromYear, toYear) : null;
  const infl = p && fromYear !== undefined && toYear !== undefined ? inflationBetween(p.series.cpi, fromYear, toYear) : null;
  const code = p ? (CURRENCY_OF[p.iso3] ?? '') : '';
  return (
    <Panel title="Inflation calculator" eyebrow="What an amount is worth in another year">
      {!p ? (
        <p className="text-sm text-slate-dim">Waiting for data.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <select className="input col-span-2" value={p.iso3} onChange={(e) => setIso3(e.target.value)} aria-label="Economy">
              {profiles.map((x) => (
                <option key={x.iso3} value={x.iso3}>
                  {label(x.iso3)}
                </option>
              ))}
            </select>
            <input className="input col-span-2" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
            <select className="input" value={fromYear} onChange={(e) => setFrom(Number(e.target.value))} aria-label="From year">
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <select className="input" value={toYear} onChange={(e) => setTo(Number(e.target.value))} aria-label="To year">
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="rounded-md border border-line p-3" role="status">
            <div className="num text-xl font-semibold text-platinum">
              {value == null ? '—' : `${fmtNumber(value)} ${code}`}
            </div>
            <div className="text-xs text-slate-dim">
              {fmtNumber(Number(amount))} {code} in {fromYear} has the buying power of this amount in {toYear}.
            </div>
            {infl && (
              <div className="mt-2 text-xs text-mist">
                Prices changed by {fmtPct(infl.cumulative, 1, true)} in total, {fmtPct(infl.annualised, 2, true)} a year on average.
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function latestRates(m: MacroResponse | null): Map<string, { value: number; date: string }> {
  const out = new Map<string, { value: number; date: string }>([['EUR', { value: 1, date: '' }]]);
  for (const s of m?.series ?? []) {
    const last = s.obs.at(-1);
    if (s.id.startsWith('EUR') && last) out.set(s.id.slice(3), last);
  }
  return out;
}

function Converter() {
  const res = useApi<MacroResponse>('/api/macro');
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('EUR');
  const [to, setTo] = useState('USD');
  const rates = latestRates(res.status === 'ready' ? res.data : null);
  const a = rates.get(from);
  const b = rates.get(to);
  const value = a && b ? convertViaEur(Number(amount), a.value, b.value) : null;
  const date = [a?.date, b?.date].filter(Boolean).sort().at(-1);
  return (
    <Panel title="Currency converter" eyebrow="Latest ECB reference rates">
      {res.status === 'loading' ? (
        <Loading />
      ) : res.status === 'error' ? (
        <ErrorState message="ECB rates are not available right now." onRetry={res.reload} />
      ) : (
        <div className="space-y-3 text-sm">
          <CurrencyInputs amount={amount} setAmount={setAmount} from={from} setFrom={setFrom} to={to} setTo={setTo} />
          <div className="rounded-md border border-line p-3" role="status">
            <div className="num text-xl font-semibold text-platinum">{value == null || !Number.isFinite(value) ? '—' : `${fmtNumber(value, 4)} ${to}`}</div>
            <div className="text-xs text-slate-dim">{date ? `ECB reference rate of ${fmtDate(date)}. For information only, not a trading rate.` : 'EUR to EUR.'}</div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function HistoricalConverter() {
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('EUR');
  const [to, setTo] = useState('USD');
  const [date, setDate] = useState('2008-09-15');
  const ra = useApi<MacroResponse>(from === 'EUR' ? null : `/api/macro/EUR${from}?years=25`);
  const rb = useApi<MacroResponse>(to === 'EUR' ? null : `/api/macro/EUR${to}?years=25`);
  const obs = (r: Loadable<MacroResponse>, code: string) => (code === 'EUR' ? 'eur' : r.status === 'ready' ? (r.data.series[0]?.obs ?? []) : null);
  const oa = obs(ra, from);
  const ob = obs(rb, to);
  const pick = (o: ReturnType<typeof obs>, d: string) => (o === 'eur' ? { date: d, value: 1 } : o ? rateOn(o, d) : null);
  const then = { a: pick(oa, date), b: pick(ob, date) };
  const latestDay = '9999-12-31';
  const now = { a: pick(oa, latestDay), b: pick(ob, latestDay) };
  const thenValue = then.a && then.b ? convertViaEur(Number(amount), then.a.value, then.b.value) : null;
  const nowValue = now.a && now.b ? convertViaEur(Number(amount), now.a.value, now.b.value) : null;
  // EUR needs no request (its slot stays idle), so only the fetched sides count.
  const pending = (from !== 'EUR' && ra.status === 'loading') || (to !== 'EUR' && rb.status === 'loading');
  const failed = (from !== 'EUR' && ra.status === 'error') || (to !== 'EUR' && rb.status === 'error');
  const usedDate = [then.a?.date, then.b?.date].filter((d) => d && d !== date).sort()[0];
  return (
    <Panel title="Historical exchange rates" eyebrow="Convert at a past ECB reference rate">
      <div className="space-y-3 text-sm">
        <CurrencyInputs amount={amount} setAmount={setAmount} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <input type="date" className="input" min="2001-01-02" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <div className="rounded-md border border-line p-3" role="status">
          {pending ? (
            <Loading />
          ) : failed ? (
            <p className="text-sm text-down">ECB history is not available right now.</p>
          ) : thenValue == null ? (
            <p className="text-sm text-slate-dim">No reference rate on or before this date.</p>
          ) : (
            <>
              <div className="num text-xl font-semibold text-platinum">{`${fmtNumber(thenValue, 4)} ${to}`}</div>
              <div className="text-xs text-slate-dim">
                On {fmtDate(date)}
                {usedDate ? ` (rate of ${fmtDate(usedDate)}, the last publication before)` : ''}.
              </div>
              {nowValue != null && (
                <div className="mt-2 text-xs text-mist">
                  At the latest rate: {fmtNumber(nowValue, 4)} {to} ({fmtPct(nowValue / thenValue - 1, 1, true)} change in {to} terms).
                </div>
              )}
            </>
          )}
        </div>
        <p className="text-[11px] text-slate-dim">ECB reference rates are available from 2001 for these {ECB_CODES.length} currencies.</p>
      </div>
    </Panel>
  );
}

function CurrencyInputs(p: { amount: string; setAmount: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2">
      <input className="input" inputMode="decimal" value={p.amount} onChange={(e) => p.setAmount(e.target.value)} aria-label="Amount" />
      <select className="input w-auto" value={p.from} onChange={(e) => p.setFrom(e.target.value)} aria-label="From currency">
        {ECB_CODES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <select className="input w-auto" value={p.to} onChange={(e) => p.setTo(e.target.value)} aria-label="To currency">
        {ECB_CODES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
