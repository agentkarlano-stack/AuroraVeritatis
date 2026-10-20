import { useMemo, useState } from "react";
import { CHOKEPOINTS } from "../../shared/data/chokepoints";
import { DEMO_INSTRUMENTS, DEMO_POINTS, demoCandles, demoDates, demoSeries } from "../../shared/data/demoMarkets";
import { correlation, returns, rsi, sma } from "../../shared/quant/indicators";
import { CandleChart, LineChart, SERIES } from "../components/charts";
import { DemoTag, Notice, PlannedTag } from "../components/Tags";

const RANGES = [
  { id: "3M", days: 63 },
  { id: "6M", days: 126 },
  { id: "1Y", days: 252 },
  { id: "2Y", days: DEMO_POINTS },
] as const;

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export function Markets() {
  const all = useMemo(() => DEMO_INSTRUMENTS.map((i) => ({ inst: i, values: demoSeries(i) })), []);
  const dates = useMemo(() => demoDates(), []);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1Y");
  const [selected, setSelected] = useState<string[]>(["DEMO-ENR", "DEMO-MTL", "DEMO-EQX"]);
  const [focus, setFocus] = useState("DEMO-ENR");
  const [chokeId, setChokeId] = useState("hormuz");

  const days = RANGES.find((r) => r.id === range)!.days;
  const start = DEMO_POINTS - days;
  const labels = dates.slice(start).map(fmtDate);

  // Rebase each selected series to 100 at the start of the window so they share one axis.
  const compare = selected.map((sym) => {
    const s = all.find((a) => a.inst.symbol === sym)!;
    const win = s.values.slice(start);
    const base = win[0]!;
    return { name: s.inst.name.replace("Demo ", "").replace(" Series", ""), values: win.map((v) => (v / base) * 100), color: SERIES[DEMO_INSTRUMENTS.findIndex((i) => i.symbol === sym) % SERIES.length] };
  });

  const focusInst = DEMO_INSTRUMENTS.find((i) => i.symbol === focus)!;
  const candles = useMemo(
    () => demoCandles(focusInst, 90).map((c) => ({ ...c, label: new Date(c.t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) })),
    [focusInst],
  );
  const focusValues = all.find((a) => a.inst.symbol === focus)!.values;
  const focusWin = focusValues.slice(start);
  const ma50 = sma(focusValues, 50).slice(start);
  const rsiWin = rsi(focusValues, 14).slice(start);

  const matrix = useMemo(() => {
    const rets = all.map((a) => returns(a.values.slice(start)));
    return rets.map((ra) => rets.map((rb) => correlation(ra, rb)));
  }, [all, start]);

  const toggle = (sym: string) =>
    setSelected((prev) => (prev.includes(sym) ? prev.filter((s) => s !== sym) : prev.length >= 4 ? prev : [...prev, sym]));

  const choke = CHOKEPOINTS.find((c) => c.id === chokeId)!;

  return (
    <div className="shell">
      <header className="page-head">
        <h1>Markets &amp; economic analysis</h1>
        <p>Cross-asset comparison, technical structure and correlation, with the Market Impact Radar linking geopolitical chokepoints to the markets they affect.</p>
      </header>

      <Notice>
        <strong>Synthetic data.</strong> Every series on this page is a seeded random walk with a generic name. None of it is a real price.
        Live or delayed quotes will appear only once a licensed or public data source is connected, and will be labelled as such.
      </Notice>

      <div className="section stack-lg" style={{ paddingTop: 16 }}>
        <section className="panel">
          <div className="panel-head">
            <div className="stack">
              <h2>Relative performance</h2>
              <span className="tiny muted">Rebased to 100 at the start of the window. Select up to four series.</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <DemoTag />
              <div className="segmented" role="group" aria-label="Time range">
                {RANGES.map((r) => (
                  <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.id}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {DEMO_INSTRUMENTS.map((i) => (
              <label key={i.symbol} className="check" style={{ marginRight: 8 }}>
                <input type="checkbox" checked={selected.includes(i.symbol)} onChange={() => toggle(i.symbol)} disabled={!selected.includes(i.symbol) && selected.length >= 4} />
                {i.name.replace("Demo ", "").replace(" Series", "")}
              </label>
            ))}
          </div>
          {compare.length > 0 ? (
            <LineChart series={compare} labels={labels} baseline={100} ariaLabel="Relative performance of synthetic demo series" />
          ) : (
            <p className="muted small">Select at least one series to compare.</p>
          )}
        </section>

        <div className="grid grid-2">
          <section className="panel">
            <div className="panel-head">
              <h2>Price structure</h2>
              <select className="input" style={{ maxWidth: 240, minHeight: 32 }} value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Series">
                {DEMO_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.name}</option>)}
              </select>
            </div>
            <CandleChart candles={candles} ariaLabel={`Daily candles for ${focusInst.name}, last 90 sessions`} />
            <div className="panel-foot">Last 90 synthetic sessions. Hollow candles closed higher than they opened.</div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Trend and momentum</h2>
              <DemoTag />
            </div>
            <LineChart
              height={170}
              series={[
                { name: "Level", values: focusWin },
                { name: "50-day SMA", values: ma50, color: SERIES[1], dashed: true },
              ]}
              labels={labels}
              ariaLabel="Series level with 50-day moving average"
            />
            <div style={{ marginTop: 10 }}>
              <LineChart height={110} series={[{ name: "RSI 14", values: rsiWin, color: SERIES[2] }]} labels={labels} yFormat={(v) => v.toFixed(0)} ariaLabel="14-day RSI" />
            </div>
            <div className="panel-foot">RSI above 70 is conventionally read as overbought and below 30 as oversold.</div>
          </section>
        </div>

        <div className="grid grid-2">
          <section className="panel">
            <div className="panel-head">
              <h2>Return correlation</h2>
              <DemoTag>{range} window</DemoTag>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th />
                    {DEMO_INSTRUMENTS.map((i) => <th key={i.symbol} className="num" title={i.name}>{i.assetClass.slice(0, 4)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_INSTRUMENTS.map((row, a) => (
                    <tr key={row.symbol}>
                      <td>{row.assetClass}</td>
                      {matrix[a]!.map((v, b) => (
                        <td key={b} className="num" style={{ background: corrColor(v), color: "var(--platinum)" }}>{a === b ? "1.00" : v.toFixed(2)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-foot">Pearson correlation of daily returns. Blue is positive, red negative. The synthetic series are independent, so values near zero are expected.</div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Market Impact Radar</h2>
              <select className="input" style={{ maxWidth: 240, minHeight: 32 }} value={chokeId} onChange={(e) => setChokeId(e.target.value)} aria-label="Chokepoint">
                {CHOKEPOINTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <p className="small muted" style={{ marginBottom: 8 }}>{choke.significance}</p>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Market</th><th>Class</th><th>Transmission</th></tr></thead>
                <tbody>
                  {choke.channels.map((ch) => (
                    <tr key={ch.market}><td>{ch.market}</td><td className="muted">{ch.assetClass}</td><td className="small">{ch.mechanism}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-foot">Qualitative framework, not a forecast. Event studies on historical data are planned.</div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-head"><h2>On the roadmap for this module</h2></div>
          <ul className="planned-list">
            <li><span>Licensed live and delayed quotes for indices, FX, commodities and crypto</span><PlannedTag /></li>
            <li><span>Strategic calendar: central banks, inflation releases, elections</span><PlannedTag /></li>
            <li><span>Macro indicators from FRED, ECB and Eurostat</span><PlannedTag /></li>
            <li><span>Historical event studies for the Market Impact Radar</span><PlannedTag /></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Diverging scale: red (−1) → neutral grey (0) → blue (+1). */
function corrColor(v: number): string {
  if (!Number.isFinite(v)) return "transparent";
  const t = Math.max(-1, Math.min(1, v));
  const a = Math.abs(t) * 0.55;
  return t >= 0 ? `rgba(57,135,229,${a})` : `rgba(230,103,103,${a})`;
}
