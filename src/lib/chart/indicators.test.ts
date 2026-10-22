import { describe, expect, it } from 'vitest';
import type { Bar } from '../demoMarket';
import { CATEGORIES, INDICATORS, INDICATOR_MAP, defaultParams, ema, indicatorBlocker, indicatorLabel, rma, rolling, sanitizeParams, sma, wma, type Series } from './indicators';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
/** Bars from closes; high/low ±1 around the close, open = previous close, volume 100. */
const fromCloses = (c: number[], spread = 1, vol = 100): Bar[] =>
  c.map((x, i) => ({ time: day(i), open: i ? c[i - 1]! : x, high: x + spread, low: x - spread, close: x, volume: vol }));
const linear = (n: number, a = 100, slope = 1) => Array.from({ length: n }, (_, i) => a + slope * i);
const run = (id: string, bars: Bar[], params: Record<string, number> = {}) => {
  const def = INDICATOR_MAP.get(id)!;
  return def.compute(bars, { ...defaultParams(def), ...params }, { periodsPerYear: 252 });
};
const out = (id: string, bars: Bar[], params: Record<string, number> = {}, key?: string): Series => {
  const r = run(id, bars, params);
  return (key ? r.outputs.find((o) => o.key === key)! : r.outputs[0]!).values;
};
const last = (s: Series) => s.at(-1)!;

describe('building blocks (hand-computed references)', () => {
  it('SMA, EMA, WMA and Wilder smoothing', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    // EMA(3): seed SMA(1,2,3) = 2, alpha 0.5 → 3, 4.
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(wma([1, 2, 3], 3)[2]).toBeCloseTo(14 / 6);
    // RMA(3): seed 2 → (2·2 + 4)/3 = 8/3 → (2·8/3 + 5)/3 = 31/9.
    const r = rma([1, 2, 3, 4, 5], 3);
    expect(r[3]).toBeCloseTo(8 / 3);
    expect(r[4]).toBeCloseTo(31 / 9);
  });
  it('rolling windows skip incomplete data', () => {
    expect(rolling([1, null, 3, 4], 2, (w) => w[0]! + w[1]!)).toEqual([null, null, null, 7]);
  });
});

describe('moving averages', () => {
  const lin = fromCloses(linear(80));
  it('zero-lag averages reproduce a straight line exactly', () => {
    for (const id of ['dema', 'tema', 'lsma']) expect(last(out(id, lin))).toBeCloseTo(179, 6);
    expect(last(out('hma', lin, { length: 4 }))).toBeCloseTo(179, 6);
  });
  it('lagging averages trail a straight line by their known lag', () => {
    expect(last(out('sma', lin, { length: 20 }))).toBeCloseTo(179 - 9.5);
    expect(last(out('ema', lin, { length: 20 }))).toBeCloseTo(179 - 9.5);
    expect(last(out('wma', lin, { length: 20 }))).toBeCloseTo(179 - 19 / 3);
  });
  it('every average of a constant series is that constant', () => {
    const flat = fromCloses(new Array(80).fill(50));
    for (const id of ['sma', 'ema', 'wma', 'vwma', 'smma', 'dema', 'tema', 'hma', 'lsma', 'alma', 'mcginley', 'kama']) {
      expect(last(out(id, flat)), id).toBeCloseTo(50, 9);
    }
  });
  it('VWMA weights by volume', () => {
    const bars = fromCloses([10, 20]);
    bars[1]!.volume = 300;
    expect(last(out('vwma', bars, { length: 2 }))).toBeCloseTo((10 * 100 + 20 * 300) / 400);
  });
  it('KAMA follows a straight line with the fast constant', () => {
    // Efficiency ratio 1 → sc = (2/3)²; KAMA moves 4/9 of the gap each bar and converges below the line.
    const k = out('kama', lin);
    expect(k[10]).toBeCloseTo(109 + (110 - 109) * (4 / 9));
  });
  it('envelopes sit a fixed percentage around the SMA', () => {
    const r = run('envelopes', lin, { length: 10, percent: 10 });
    const basis = last(r.outputs[1]!.values);
    expect(last(r.outputs[0]!.values)).toBeCloseTo(basis * 1.1);
    expect(last(r.outputs[2]!.values)).toBeCloseTo(basis * 0.9);
  });
});

describe('trend and channels', () => {
  it('Bollinger bands use the population standard deviation', () => {
    const r = run('bb', fromCloses([1, 2, 3]), { length: 3, mult: 2 });
    const sd = Math.sqrt(2 / 3);
    expect(last(r.outputs[0]!.values)).toBeCloseTo(2 + 2 * sd);
    expect(last(r.outputs[2]!.values)).toBeCloseTo(2 - 2 * sd);
  });
  it('Donchian channels track the extreme high and low', () => {
    const r = run('donchian', fromCloses([5, 9, 7]), { length: 3 });
    expect(last(r.outputs[0]!.values)).toBe(10);
    expect(last(r.outputs[2]!.values)).toBe(4);
    expect(last(r.outputs[1]!.values)).toBe(7);
  });
  it('Keltner channels are EMA ± k × ATR', () => {
    const r = run('keltner', fromCloses(new Array(40).fill(10)), { length: 20, mult: 2, atr: 10 });
    expect(last(r.outputs[0]!.values)).toBeCloseTo(14);
    expect(last(r.outputs[2]!.values)).toBeCloseTo(6);
  });
  it('Ichimoku conversion line is the 9-bar high–low midpoint', () => {
    const bars = fromCloses(linear(60));
    const conv = run('ichimoku', bars).outputs.find((o) => o.key === 'conversion')!.values;
    expect(last(conv)).toBeCloseTo((160 + 150) / 2);
    const lag = run('ichimoku', bars).outputs.find((o) => o.key === 'lagging')!.values;
    expect(lag[0]).toBe(bars[25]!.close);
  });
  it('Aroon is 100/0 in a steady uptrend', () => {
    const bars = fromCloses(linear(30));
    expect(last(out('aroon', bars, {}, 'up'))).toBe(100);
    expect(last(out('aroon', bars, {}, 'down'))).toBe(0);
  });
  it('ADX is 100 in a steady uptrend with no down moves', () => {
    const bars = fromCloses(linear(80));
    expect(last(out('dmi', bars, {}, 'mdi'))).toBe(0);
    expect(last(out('adx', bars))).toBeCloseTo(100);
  });
  it('linear regression slope recovers the slope', () => {
    expect(last(out('linreg-slope', fromCloses(linear(30, 5, 2))))).toBeCloseTo(2);
  });
  it('52-week high/low uses the previous 52 weeks by date', () => {
    const bars = fromCloses(linear(400));
    expect(last(out('hl52', bars, {}, 'high'))).toBe(bars.at(-1)!.high);
    expect(last(out('hl52', bars, {}, 'low'))).toBe(bars[399 - 364]!.low);
  });
  it('price analysis averages', () => {
    const b: Bar[] = [{ time: day(0), open: 1, high: 4, low: 0, close: 3, volume: 1 }];
    expect(last(out('typical', b))).toBeCloseTo(7 / 3);
    expect(last(out('median', b))).toBe(2);
    expect(last(out('average', b))).toBe(2);
  });
});

describe('momentum', () => {
  it('RSI: hand-computed Wilder values and extremes', () => {
    const r = out('rsi', fromCloses([1, 2, 1, 2]), { length: 2 });
    expect(r[2]).toBe(50);
    expect(r[3]).toBe(75);
    expect(last(out('rsi', fromCloses(linear(30))))).toBe(100);
    expect(last(out('rsi', fromCloses(linear(30, 100, -1))))).toBe(0);
  });
  it('MACD of a straight line is the EMA lag difference', () => {
    const r = run('macd', fromCloses(linear(80)));
    expect(last(r.outputs.find((o) => o.key === 'macd')!.values)).toBeCloseTo(7);
    expect(last(r.outputs.find((o) => o.key === 'signal')!.values)).toBeCloseTo(7);
    expect(last(r.outputs.find((o) => o.key === 'hist')!.values)).toBeCloseTo(0);
  });
  it('PPO of a constant series is zero', () => {
    expect(last(out('ppo', fromCloses(new Array(60).fill(10)), {}, 'ppo'))).toBeCloseTo(0);
  });
  it('stochastic and Williams %R at the top of the range', () => {
    const bars = fromCloses(linear(30), 0);
    expect(last(out('stoch', bars, {}, 'k'))).toBe(100);
    expect(last(out('willr', bars))).toBe(0);
  });
  it('CCI hand-computed', () => {
    // Typical prices 1, 2, 3: SMA 2, mean deviation 2/3 → (3 − 2) / (0.015 × 2/3) = 100.
    expect(last(out('cci', fromCloses([1, 2, 3], 0), { length: 3 }))).toBeCloseTo(100);
  });
  it('ROC, momentum, CMO and TRIX', () => {
    const lin = fromCloses(linear(60));
    expect(last(out('roc', lin, { length: 9 }))).toBeCloseTo((100 * 9) / 150);
    expect(last(out('mom', lin, { length: 10 }))).toBe(10);
    expect(last(out('cmo', lin))).toBe(100);
    expect(last(out('trix', fromCloses(new Array(80).fill(10))))).toBeCloseTo(0);
  });
  it('awesome oscillator, ultimate oscillator and balance of power', () => {
    expect(last(out('ao', fromCloses(new Array(40).fill(10))))).toBeCloseTo(0);
    // Close at the high with no gaps: buying pressure equals true range → 100.
    const bars = linear(40).map((x, i) => ({ time: day(i), open: x - 1, high: x, low: x - 1, close: x, volume: 1 }));
    expect(last(out('uo', bars))).toBeCloseTo(100);
    expect(last(out('bop', bars))).toBe(1);
  });
  it('Stochastic RSI is defined and bounded', () => {
    const c = Array.from({ length: 80 }, (_, i) => 100 + 10 * Math.sin(i / 3));
    const k = out('stochrsi', fromCloses(c), {}, 'k').filter((x): x is number => x != null);
    expect(k.length).toBeGreaterThan(20);
    expect(Math.min(...k)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...k)).toBeLessThanOrEqual(100);
  });
  it('Coppock curve of a constant series is zero', () => {
    expect(last(out('coppock', fromCloses(new Array(40).fill(10))))).toBeCloseTo(0);
  });
});

describe('volatility', () => {
  it('ATR equals a constant bar range', () => {
    expect(last(out('atr', fromCloses(new Array(40).fill(10), 1)))).toBeCloseTo(2);
  });
  it('standard deviation, %B and width', () => {
    expect(last(out('stdev', fromCloses([1, 2, 3]), { length: 3 }))).toBeCloseTo(Math.sqrt(2 / 3));
    const r = out('bbpctb', fromCloses([1, 2, 3]), { length: 3, mult: 1 });
    expect(last(r)).toBeCloseTo((3 - (2 - Math.sqrt(2 / 3))) / (2 * Math.sqrt(2 / 3)));
    expect(last(out('bbwidth', fromCloses([1, 2, 3]), { length: 3, mult: 1 }))).toBeCloseTo((2 * Math.sqrt(2 / 3)) / 2);
  });
  it('historical volatility is zero for constant growth and annualises √252', () => {
    expect(last(out('hv', fromCloses(Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i))))).toBeCloseTo(0);
    // Alternating ±r log returns: sample sd over an even window is r·√(n/(n−1)).
    const r = 0.01;
    const c = Array.from({ length: 41 }, (_, i) => 100 * Math.exp(i % 2 ? r : 0));
    const hv = last(out('hv', fromCloses(c), { length: 20 }))!;
    expect(hv).toBeCloseTo(100 * r * Math.sqrt(20 / 19) * Math.sqrt(252), 6);
  });
  it('mass index of a constant range is the window length', () => {
    expect(last(out('massindex', fromCloses(new Array(80).fill(10))))).toBeCloseTo(25);
  });
  it('choppiness index stays within 0–100 on a sideways series', () => {
    const c = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : -1));
    const v = last(out('chop', fromCloses(c)))!;
    expect(v).toBeGreaterThan(50);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe('volume', () => {
  const bars: Bar[] = [
    { time: day(0), open: 10, high: 11, low: 9, close: 10, volume: 100 },
    { time: day(1), open: 10, high: 12, low: 10, close: 12, volume: 200 },
    { time: day(2), open: 12, high: 12, low: 10, close: 11, volume: 50 },
  ];
  it('OBV, net volume and PVT', () => {
    expect(out('obv', bars)).toEqual([0, 200, 150]);
    expect(out('netvol', bars)).toEqual([null, 200, -50]);
    expect(last(out('pvt', bars))).toBeCloseTo(0.2 * 200 + (-1 / 12) * 50);
  });
  it('accumulation/distribution and Chaikin money flow', () => {
    // Multipliers 0, 1, 0 → A/D 0, 200, 200; CMF over 3 bars = 200 / 350.
    expect(out('ad', bars)).toEqual([0, 200, 200]);
    expect(last(out('cmf', bars, { length: 3 }))).toBeCloseTo(200 / 350);
  });
  it('money flow index', () => {
    // Typical prices 10, 34/3, 11: one positive flow (34/3 × 200), one negative (11 × 50).
    expect(last(out('mfi', bars, { length: 2 }))).toBeCloseTo(100 - 100 / (1 + ((34 / 3) * 200) / (11 * 50)));
  });
  it('force index and volume oscillator of constant data', () => {
    const flat = fromCloses(new Array(30).fill(10));
    expect(last(out('efi', flat))).toBe(0);
    expect(last(out('volosc', flat))).toBeCloseTo(0);
  });
});

describe('catalogue', () => {
  const sample = fromCloses(Array.from({ length: 300 }, (_, i) => 100 + 5 * Math.sin(i / 7) + i / 10));
  it('every available indicator returns finite values aligned with the bars', () => {
    for (const def of INDICATORS.filter((d) => !d.unavailable)) {
      const r = def.compute(sample, defaultParams(def), { periodsPerYear: 252 });
      expect(r.outputs.length, def.id).toBeGreaterThan(0);
      for (const o of r.outputs) {
        expect(o.values.length, def.id).toBe(sample.length);
        expect(o.values.some((v) => v != null), `${def.id}.${o.key} has values`).toBe(true);
        expect(o.values.every((v) => v == null || Number.isFinite(v)), `${def.id}.${o.key} finite`).toBe(true);
      }
    }
  });
  it('has unique ids, valid categories and sane parameter ranges', () => {
    expect(new Set(INDICATORS.map((d) => d.id)).size).toBe(INDICATORS.length);
    for (const d of INDICATORS) {
      expect(CATEGORIES).toContain(d.category);
      for (const p of d.params) expect(p.min <= p.default && p.default <= p.max, `${d.id}.${p.key}`).toBe(true);
    }
  });
  it('explains missing data instead of computing', () => {
    const closeOnly = { hasOhlc: false, hasVolume: false };
    expect(indicatorBlocker(INDICATOR_MAP.get('atr')!, closeOnly)).toMatch(/open, high and low/);
    expect(indicatorBlocker(INDICATOR_MAP.get('obv')!, { hasOhlc: true, hasVolume: false })).toMatch(/volume/);
    expect(indicatorBlocker(INDICATOR_MAP.get('vwap')!, { hasOhlc: true, hasVolume: true })).toMatch(/intraday/);
    expect(indicatorBlocker(INDICATOR_MAP.get('rsi')!, closeOnly)).toBeNull();
  });
  it('sanitises parameters and labels instances', () => {
    const def = INDICATOR_MAP.get('macd')!;
    expect(sanitizeParams(def, { fast: '3.6', slow: -5, extra: 1 })).toEqual({ fast: 4, slow: 1, signal: 9 });
    expect(indicatorLabel(def, defaultParams(def))).toBe('MACD 12 26 9');
  });
});
