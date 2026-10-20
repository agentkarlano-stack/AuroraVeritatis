import assert from "node:assert/strict";
import { test } from "node:test";
import { backtest } from "../src/shared/quant/backtest";
import { parsePriceCsv } from "../src/shared/quant/csv";
import { correlation, ema, macd, maxDrawdown, returns, rsi, sma, stdev } from "../src/shared/quant/indicators";
import { mulberry32, syntheticPath } from "../src/shared/quant/random";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("sma aligns and averages", () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.throws(() => sma([1, 2], 0));
});

test("ema seeds with sma then smooths", () => {
  const e = ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(e.slice(0, 2), [null, null]);
  close(e[2]!, 2);
  close(e[3]!, 3); // 4*0.5 + 2*0.5
  close(e[4]!, 4);
});

test("rsi bounds and monotone input", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up, 14)[29], 100);
  const flat = Array.from({ length: 30 }, () => 100);
  assert.equal(rsi(flat, 14)[29], 50);
  const path = syntheticPath({ seed: "rsi", points: 300, start: 100, drift: 0, volatility: 0.3 });
  for (const v of rsi(path, 14)) if (v != null) assert.ok(v >= 0 && v <= 100);
});

test("macd histogram equals macd minus signal", () => {
  const path = syntheticPath({ seed: "macd", points: 120, start: 50, drift: 0.05, volatility: 0.2 });
  const m = macd(path);
  m.histogram.forEach((h, i) => {
    if (h != null) close(h, m.macd[i]! - m.signal[i]!);
  });
  assert.equal(m.signal.findIndex((v) => v != null), 25 + 8);
});

test("returns, stdev, drawdown, correlation", () => {
  const r = returns([100, 110, 99]);
  close(r[0]!, 0.1);
  close(r[1]!, -0.1);
  close(stdev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
  close(maxDrawdown([1, 1.2, 0.9, 1.3, 1.04]), 0.25);
  close(correlation([1, 2, 3], [2, 4, 6]), 1);
  close(correlation([1, 2, 3], [3, 2, 1]), -1);
});

test("synthetic data is deterministic", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert.equal(a(), b());
  const p1 = syntheticPath({ seed: "X", points: 50, start: 100, drift: 0.1, volatility: 0.2 });
  const p2 = syntheticPath({ seed: "X", points: 50, start: 100, drift: 0.1, volatility: 0.2 });
  assert.deepEqual(p1, p2);
  assert.equal(p1[0], 100);
  assert.ok(p1.every((v) => v > 0));
});

test("buy and hold matches the benchmark", () => {
  const prices = [100, 105, 102, 110, 120];
  const r = backtest(prices, { kind: "buy-and-hold" });
  close(r.equity.at(-1)!, 1.2);
  close(r.stats.totalReturn, r.benchmarkStats.totalReturn);
  assert.equal(r.trades, 1);
});

test("crossover has no look-ahead: signal applies from the next bar", () => {
  // A jump at the final bar must not be captured by a signal formed on that bar.
  const prices = [10, 10, 10, 10, 10, 10, 20];
  const r = backtest(prices, { kind: "sma-crossover", fast: 2, slow: 3 });
  close(r.equity.at(-1)!, 1);
});

test("costs reduce returns", () => {
  const prices = syntheticPath({ seed: "cost", points: 400, start: 100, drift: 0.05, volatility: 0.25 });
  const free = backtest(prices, { kind: "sma-crossover", fast: 5, slow: 20 });
  const costly = backtest(prices, { kind: "sma-crossover", fast: 5, slow: 20, costPerTrade: 0.01 });
  assert.ok(costly.equity.at(-1)! < free.equity.at(-1)!);
  assert.equal(free.equity.length, prices.length);
});

test("backtest validates input", () => {
  assert.throws(() => backtest([1, 2], { kind: "buy-and-hold" }));
  assert.throws(() => backtest([1, -2, 3], { kind: "buy-and-hold" }));
  assert.throws(() => backtest([1, 2, 3, 4], { kind: "sma-crossover", fast: 5, slow: 3 }));
});

test("csv parser picks the close column and skips bad rows", () => {
  const p = parsePriceCsv("Date,Open,Close,Volume\n2026-01-01,1,10,5\n2026-01-02,1,x,5\n2026-01-03,1,11,5\n2026-01-04,1,12.5,5");
  assert.equal(p.column, "close");
  assert.deepEqual(p.values, [10, 11, 12.5]);
  assert.deepEqual(p.labels, ["2026-01-01", "2026-01-03", "2026-01-04"]);
  assert.equal(p.skipped, 1);
  assert.deepEqual(parsePriceCsv("1\n2\n3").values, [1, 2, 3]);
  assert.deepEqual(parsePriceCsv("d;price\na;1\nb;2\nc;3").values, [1, 2, 3]);
  assert.throws(() => parsePriceCsv("a,b\nx,y"));
});
