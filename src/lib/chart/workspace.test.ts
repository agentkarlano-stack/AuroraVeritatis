import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES, DEFAULT_SETTINGS, normalizeSettings, parseLayout } from './workspace';

describe('chart settings', () => {
  it('migrates settings saved before the chart editor', () => {
    const s = normalizeSettings({ style: 'line', sma20: true, sma50: true, ema20: false, bollinger: true, volume: false, rsi: true, events: false, range: 252 });
    expect(s.type).toBe('line');
    expect(s.range).toEqual({ preset: '1Y' });
    expect(s.indicators.map((i) => `${i.id}:${Object.values(i.params).join(',')}`)).toEqual(['sma:20', 'sma:50', 'bb:20,2', 'rsi:14']);
    expect(s.events).toBe(false);
  });
  it('keeps valid settings and repairs invalid parts', () => {
    const s = normalizeSettings({
      v: 2,
      interval: '1W',
      range: { from: '2024-01-01', to: '2024-06-30' },
      type: 'heikinAshi',
      indicators: [{ id: 'rsi', params: { length: 999 }, colors: { rsi: '#ffffff', bad: 'red' } }, { id: 'nope' }, { id: 'vwap' }],
      appearance: { up: 'green', scale: 'log' },
    });
    expect(s.interval).toBe('1W');
    expect(s.range).toEqual({ from: '2024-01-01', to: '2024-06-30' });
    expect(s.type).toBe('heikinAshi');
    expect(s.indicators).toHaveLength(1);
    expect(s.indicators[0]!.params.length).toBe(500);
    expect(s.indicators[0]!.colors).toEqual({ rsi: '#ffffff' });
    expect(s.appearance.up).toBe(DEFAULT_SETTINGS.appearance.up);
    expect(s.appearance.scale).toBe('log');
    expect(normalizeSettings({ v: 2, interval: '7m', type: 'pie' })).toMatchObject({ interval: '1D', type: 'candles' });
    expect(normalizeSettings(null)).toBe(DEFAULT_SETTINGS);
  });
  it('built-in templates only use catalogue indicators', () => {
    for (const t of BUILT_IN_TEMPLATES) expect(normalizeSettings(t.settings).indicators).toHaveLength(t.settings.indicators.length);
  });
});

describe('saved layouts', () => {
  it('round-trips and rejects foreign files', () => {
    const layout = { kind: 'aurora-chart-layout', version: 1, name: 'Gold', savedAt: '2026-10-22T10:00:00Z', symbol: 'GOLD.D', settings: DEFAULT_SETTINGS, drawings: [{ id: 'a', kind: 'hline', price: 2000 }, { id: 'b', kind: 'trend', a: { time: '2026-01-02', price: 1 }, b: { time: 'x', price: 2 } }] };
    const parsed = parseLayout(JSON.stringify(layout))!;
    expect(parsed.name).toBe('Gold');
    expect(parsed.drawings).toEqual([{ id: 'a', kind: 'hline', price: 2000 }]);
    expect(parseLayout('{"kind":"something-else"}')).toBeNull();
    expect(parseLayout('not json')).toBeNull();
  });
});
