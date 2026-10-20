import { useMemo, useState } from "react";
import { DEMO_INSTRUMENTS, demoDates, demoSeries } from "../../shared/data/demoMarkets";
import { backtest, type BacktestResult, type StrategyKind } from "../../shared/quant/backtest";
import { parsePriceCsv } from "../../shared/quant/csv";
import { rollingVolatility } from "../../shared/quant/indicators";
import { LineChart, SERIES } from "../components/charts";
import { DemoTag, Notice, SourceTag } from "../components/Tags";
import { num, pct } from "../lib/format";

type Source = { kind: "demo"; symbol: string } | { kind: "csv" };

const SAMPLE_CSV = "date,close\n2026-01-02,100\n2026-01-05,101.2\n2026-01-06,100.7\n…";

export function QuantLab() {
  const [source, setSource] = useState<Source>({ kind: "demo", symbol: "DEMO-EQX" });
  const [csv, setCsv] = useState("");
  const [kind, setKind] = useState<StrategyKind>("sma-crossover");
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [lower, setLower] = useState(30);
  const [upper, setUpper] = useState(70);
  const [costBp, setCostBp] = useState(5);

  const data = useMemo((): { labels: string[]; values: number[]; note: string } | { error: string } => {
    if (source.kind === "demo") {
      const inst = DEMO_INSTRUMENTS.find((i) => i.symbol === source.symbol)!;
      const values = demoSeries(inst);
      const labels = demoDates(values.length).map((d) => d.toISOString().slice(0, 10));
      return { labels, values, note: `${inst.name}: ${values.length} synthetic daily points` };
    }
    if (!csv.trim()) return { error: "Paste a CSV with a date column and a close or price column." };
    try {
      const p = parsePriceCsv(csv);
      return { labels: p.labels, values: p.values, note: `${p.values.length} rows from column “${p.column}”${p.skipped ? `, ${p.skipped} skipped` : ""}` };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [source, csv]);

  const result = useMemo((): BacktestResult | { error: string } | null => {
    if ("error" in data) return null;
    try {
      return backtest(data.values, {
        kind,
        fast,
        slow,
        rsiPeriod,
        rsiLower: lower,
        rsiUpper: upper,
        costPerTrade: costBp / 10_000,
      });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [data, kind, fast, slow, rsiPeriod, lower, upper, costBp]);

  const vol = useMemo(() => ("error" in data ? [] : rollingVolatility(data.values, 21).map((v) => (v == null ? null : v * 100))), [data]);

  return (
    <div className="shell">
      <header className="page-head">
        <h1>Quantitative Research Lab</h1>
        <p>Test simple rules on a synthetic series or on your own data. Calculations run entirely in your browser; nothing you paste is uploaded.</p>
      </header>

      <div className="split section" style={{ paddingTop: 0 }}>
        <div className="stack-lg">
          {"error" in data ? (
            <Notice>{data.error}</Notice>
          ) : result && "error" in result ? (
            <Notice tone="error">{result.error}</Notice>
          ) : result ? (
            <>
              <section className="panel">
                <div className="panel-head">
                  <div className="stack">
                    <h2>Equity curve</h2>
                    <span className="tiny muted">Growth of 1 unit, strategy against buy and hold</span>
                  </div>
                  {source.kind === "demo" ? <DemoTag>Synthetic series</DemoTag> : <SourceTag>Your data</SourceTag>}
                </div>
                <LineChart
                  series={[
                    { name: "Strategy", values: result.equity },
                    { name: "Buy & hold", values: result.benchmark, color: SERIES[1] },
                  ]}
                  labels={data.labels}
                  yFormat={(v) => v.toFixed(2)}
                  baseline={1}
                  ariaLabel="Strategy equity curve against buy and hold"
                />
              </section>
              <section className="panel">
                <div className="panel-head"><h2>Performance statistics</h2></div>
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Measure</th><th className="num">Strategy</th><th className="num">Buy &amp; hold</th></tr></thead>
                    <tbody>
                      <Row label="Total return" a={pct(result.stats.totalReturn)} b={pct(result.benchmarkStats.totalReturn)} />
                      <Row label="Annualised return" a={pct(result.stats.cagr)} b={pct(result.benchmarkStats.cagr)} />
                      <Row label="Annualised volatility" a={pct(result.stats.volatility).replace("+", "")} b={pct(result.benchmarkStats.volatility).replace("+", "")} />
                      <Row label="Sharpe ratio (rf = 0)" a={num(result.stats.sharpe)} b={num(result.benchmarkStats.sharpe)} />
                      <Row label="Maximum drawdown" a={`−${(result.stats.maxDrawdown * 100).toFixed(1)}%`} b={`−${(result.benchmarkStats.maxDrawdown * 100).toFixed(1)}%`} />
                      <Row label="Time in market" a={`${(result.stats.exposure * 100).toFixed(0)}%`} b="100%" />
                      <Row label="Position changes" a={String(result.trades)} b="—" />
                    </tbody>
                  </table>
                </div>
                <div className="panel-foot">
                  Signals use the close of each period and apply to the next period, so there is no look-ahead. Long or flat only, costs charged on each change.
                  Past results, especially on synthetic data, say nothing about future returns.
                </div>
              </section>
              <section className="panel">
                <div className="panel-head"><h2>Rolling volatility</h2><span className="tiny muted">21-period, annualised %</span></div>
                <LineChart height={180} series={[{ name: "Volatility", values: vol, color: SERIES[2] }]} labels={data.labels} yFormat={(v) => `${v.toFixed(0)}%`} ariaLabel="Rolling 21-period annualised volatility" />
              </section>
            </>
          ) : null}
        </div>

        <aside className="stack">
          <section className="panel stack-lg">
            <h2>Data</h2>
            <div className="segmented" role="group" aria-label="Data source">
              <button aria-pressed={source.kind === "demo"} onClick={() => setSource({ kind: "demo", symbol: "DEMO-EQX" })}>Demo series</button>
              <button aria-pressed={source.kind === "csv"} onClick={() => setSource({ kind: "csv" })}>Paste CSV</button>
            </div>
            {source.kind === "demo" ? (
              <div className="field">
                <label htmlFor="lab-series">Series</label>
                <select id="lab-series" className="input" value={source.symbol} onChange={(e) => setSource({ kind: "demo", symbol: e.target.value })}>
                  {DEMO_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="lab-csv">CSV with date and close columns</label>
                <textarea id="lab-csv" className="input" placeholder={SAMPLE_CSV} value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} />
              </div>
            )}
            {!("error" in data) && <p className="tiny muted">{data.note}</p>}
          </section>

          <section className="panel stack-lg">
            <h2>Strategy</h2>
            <div className="field">
              <label htmlFor="lab-kind">Rule</label>
              <select id="lab-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as StrategyKind)}>
                <option value="sma-crossover">Moving-average crossover</option>
                <option value="rsi-reversion">RSI mean reversion</option>
                <option value="buy-and-hold">Buy and hold</option>
              </select>
            </div>
            {kind === "sma-crossover" && (
              <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <NumField id="f" label="Fast SMA" value={fast} set={setFast} min={2} max={200} />
                <NumField id="s" label="Slow SMA" value={slow} set={setSlow} min={3} max={400} />
              </div>
            )}
            {kind === "rsi-reversion" && (
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <NumField id="rp" label="Period" value={rsiPeriod} set={setRsiPeriod} min={2} max={100} />
                <NumField id="lo" label="Buy below" value={lower} set={setLower} min={1} max={99} />
                <NumField id="up" label="Sell above" value={upper} set={setUpper} min={1} max={99} />
              </div>
            )}
            <NumField id="cost" label="Cost per change (basis points)" value={costBp} set={setCostBp} min={0} max={500} />
            <p className="tiny muted">
              {kind === "sma-crossover" && "Long while the fast average is above the slow average, flat otherwise."}
              {kind === "rsi-reversion" && "Buys when RSI falls below the lower band and exits when it rises above the upper band."}
              {kind === "buy-and-hold" && "Holds the series for the whole period. Useful as a baseline."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  return <tr><td>{label}</td><td className="num">{a}</td><td className="num">{b}</td></tr>;
}

function NumField({ id, label, value, set, min, max }: { id: string; label: string; value: number; set: (n: number) => void; min: number; max: number }) {
  return (
    <div className="field">
      <label htmlFor={`lab-${id}`}>{label}</label>
      <input
        id={`lab-${id}`}
        className="input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) set(Math.max(min, Math.min(max, n)));
        }}
      />
    </div>
  );
}
