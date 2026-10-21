import { useMemo, useState } from 'react';
import { INSTRUMENTS, INSTRUMENT_MAP } from '../data/instruments';
import { backtest, type BacktestStats, type StrategySpec } from '../lib/backtest';
import { demoBars } from '../lib/demoMarket';
import { fmtNumber, fmtPct } from '../lib/format';
import { PerformanceChart, type PerformanceSeries } from './PerformanceChart';
import { DemoNotice, Panel } from './ui';

type Kind = StrategySpec['kind'];

const PERIODS = [
  { label: '1Y', bars: 253 },
  { label: '2Y', bars: 520 },
];

interface Inputs {
  symbol: string;
  kind: Kind;
  fast: number;
  slow: number;
  period: number;
  lower: number;
  upper: number;
  costBps: number;
  bars: number;
}

function validate(i: Inputs): string | null {
  if (i.kind === 'sma' && !(i.fast >= 2 && i.slow > i.fast && i.slow <= 200)) return 'Moving averages need 2 ≤ fast < slow ≤ 200.';
  if (i.kind === 'rsi' && !(i.period >= 2 && i.period <= 50 && i.lower >= 0 && i.lower < i.upper && i.upper <= 100)) return 'RSI needs a period of 2–50 and 0 ≤ entry < exit ≤ 100.';
  if (!(i.costBps >= 0 && i.costBps <= 200)) return 'Costs must be 0–200 basis points.';
  return null;
}

/** Long-only rule backtests on the synthetic demo series, with costs and a buy-and-hold benchmark. */
export function BacktestTool() {
  const [inp, setInp] = useState<Inputs>({ symbol: 'GLB-EQ.D', kind: 'sma', fast: 20, slow: 50, period: 14, lower: 30, upper: 55, costBps: 5, bars: 520 });
  const error = validate(inp);
  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setInp((s) => ({ ...s, [k]: k === 'symbol' || k === 'kind' ? e.target.value : Number(e.target.value) }));

  const result = useMemo(() => {
    if (validate(inp)) return null;
    const bars = demoBars(inp.symbol).slice(-inp.bars);
    const spec: StrategySpec = inp.kind === 'hold' ? { kind: 'hold' } : inp.kind === 'sma' ? { kind: 'sma', fast: inp.fast, slow: inp.slow } : { kind: 'rsi', period: inp.period, lower: inp.lower, upper: inp.upper };
    const r = backtest(bars.map((b) => b.close), spec, inp.costBps);
    const series: PerformanceSeries[] = [
      { label: 'Strategy', color: '#c9a35a', points: bars.map((b, i) => ({ time: b.time, value: r.equity[i]! * 100 })) },
      { label: 'Buy & hold', color: '#7d9cc0', points: bars.map((b, i) => ({ time: b.time, value: r.benchmark[i]! * 100 })) },
    ];
    return { r, series };
  }, [inp]);

  const num = (k: keyof Inputs, label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input num" type="number" value={inp[k] as number} onChange={set(k)} />
    </label>
  );

  const rows: [string, (s: BacktestStats) => string][] = [
    ['Total return', (s) => fmtPct(s.totalReturn, 1, true)],
    ['Annualised return', (s) => fmtPct(s.cagr, 1, true)],
    ['Annualised volatility', (s) => fmtPct(s.vol, 1)],
    ['Sharpe ratio (rf = 0)', (s) => fmtNumber(s.sharpe, 2)],
    ['Max drawdown', (s) => fmtPct(s.maxDrawdown, 1)],
    ['Trades', (s) => String(s.trades)],
    ['Time invested', (s) => fmtPct(s.exposure, 0)],
  ];

  return (
    <div className="space-y-4">
      <DemoNotice>
        Backtests run on <strong>simulated prices</strong>, so results only illustrate the method. Past or simulated
        performance does not predict future results.
      </DemoNotice>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="Strategy rules" bodyClass="p-4">
          <div className="space-y-3">
            <label className="block">
              <span className="label">Instrument</span>
              <select className="input" value={inp.symbol} onChange={set('symbol')}>
                {INSTRUMENTS.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} · {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Rule</span>
              <select className="input" value={inp.kind} onChange={set('kind')}>
                <option value="sma">Moving-average crossover (long when fast &gt; slow)</option>
                <option value="rsi">RSI mean reversion (buy oversold, sell on recovery)</option>
                <option value="hold">Buy and hold</option>
              </select>
            </label>
            {inp.kind === 'sma' && (
              <div className="grid grid-cols-2 gap-3">
                {num('fast', 'Fast SMA')}
                {num('slow', 'Slow SMA')}
              </div>
            )}
            {inp.kind === 'rsi' && (
              <div className="grid grid-cols-3 gap-3">
                {num('period', 'Period')}
                {num('lower', 'Enter <')}
                {num('upper', 'Exit >')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {num('costBps', 'Costs (bps/trade)')}
              <label className="block">
                <span className="label">Period</span>
                <select className="input" value={inp.bars} onChange={set('bars')}>
                  {PERIODS.map((p) => (
                    <option key={p.label} value={p.bars}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-down">
                {error}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-slate-dim">
              Signals use only data up to each day's close and are applied from the next session (no look-ahead). Costs are
              charged on every position change.
            </p>
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          {result && (
            <>
              <Panel title={`Equity curve · ${inp.symbol}`} eyebrow="Growth of 100">
                <div className="h-72">
                  <PerformanceChart series={result.series} />
                </div>
                <p className="mt-2 text-[11px] text-slate-dim">
                  <span className="text-gold">Gold</span>: strategy after costs. <span className="text-info">Blue</span>: buy and hold.{' '}
                  {INSTRUMENT_MAP.get(inp.symbol)?.name}.
                </p>
              </Panel>
              <Panel title="Performance statistics">
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[420px] text-sm">
                    <thead className="text-left text-xs text-mist">
                      <tr className="border-b border-line">
                        <th className="py-2 font-medium">Metric</th>
                        <th className="py-2 text-right font-medium text-gold">Strategy</th>
                        <th className="py-2 text-right font-medium text-info">Buy &amp; hold</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {rows.map(([label, f]) => (
                        <tr key={label}>
                          <td className="py-1.5 font-sans text-mist">{label}</td>
                          <td className="py-1.5 text-right text-platinum">{f(result.r.strategy)}</td>
                          <td className="py-1.5 text-right">{f(result.r.buyHold)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
