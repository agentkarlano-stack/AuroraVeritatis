import { describe, expect, it } from 'vitest';
import { commonYears, convertViaEur, currencyCsv, externalValueIndex, inflationBetween, inflationDifferential, pppGap, purchasingPowerIndex, rateOn, realValue, type CurrencyProfile } from './currency';

const cpi = [
  { year: 2000, value: 80 },
  { year: 2010, value: 100 },
  { year: 2020, value: 125 },
];

describe('purchasing power', () => {
  it('indexes purchasing power to the base year', () => {
    const ppi = purchasingPowerIndex(cpi, 2010);
    expect(ppi.map((p) => p.value)).toEqual([125, 100, 80]);
    expect(purchasingPowerIndex(cpi, 1999)).toEqual([]);
  });

  it('converts amounts between years with CPI', () => {
    expect(realValue(100, cpi, 2000, 2020)).toBeCloseTo(156.25);
    expect(realValue(100, cpi, 2020, 2000)).toBeCloseTo(64);
    expect(realValue(100, cpi, 1990, 2020)).toBeNull();
  });

  it('computes cumulative and annualised inflation', () => {
    const r = inflationBetween(cpi, 2010, 2020)!;
    expect(r.cumulative).toBeCloseTo(0.25);
    expect(r.annualised).toBeCloseTo(1.25 ** 0.1 - 1);
    expect(inflationBetween(cpi, 2010, 2010)).toBeNull();
  });
});

describe('exchange rates', () => {
  const fx = [
    { year: 2010, value: 200 },
    { year: 2020, value: 400 },
  ];
  it('indexes the external value against the dollar', () => {
    expect(externalValueIndex(fx, 2010).map((p) => p.value)).toEqual([100, 50]);
  });
  it('measures the market rate against PPP', () => {
    const gap = pppGap(fx, [
      { year: 2010, value: 100 },
      { year: 2020, value: 400 },
      { year: 2021, value: 1 },
    ]);
    expect(gap).toEqual([
      { year: 2010, value: -0.5 },
      { year: 2020, value: 0 },
    ]);
  });
  it('subtracts inflation rates year by year', () => {
    expect(inflationDifferential([{ year: 2020, value: 5 }, { year: 2021, value: 3 }], [{ year: 2021, value: 1 }])).toEqual([{ year: 2021, value: 2 }]);
  });
  it('finds years present in every series', () => {
    expect(commonYears(cpi, fx)).toEqual([2010, 2020]);
  });
  it('uses the latest rate on or before a date', () => {
    const obs = [
      { date: '2024-01-02', value: 1.1 },
      { date: '2024-01-05', value: 1.2 },
    ];
    expect(rateOn(obs, '2024-01-04')?.value).toBe(1.1);
    expect(rateOn(obs, '2024-01-05')?.value).toBe(1.2);
    expect(rateOn(obs, '2023-12-31')).toBeNull();
  });
  it('converts through the euro', () => {
    // 1 EUR = 1.10 USD = 0.85 GBP, so 110 USD = 100 EUR = 85 GBP.
    expect(convertViaEur(110, 1.1, 0.85)).toBeCloseTo(85);
  });
});

describe('CSV export', () => {
  it('writes one row per year with the source', () => {
    const p: CurrencyProfile = {
      iso3: 'AUT',
      name: 'Austria',
      series: { cpi, inflation: [{ year: 2020, value: 1.4 }], fx: [], ppp: [] },
      source: { name: 'World Bank Open Data (WDI)', url: 'https://data.worldbank.org/', license: 'CC BY 4.0' },
      fetchedAt: '2026-10-22T00:00:00Z',
    };
    const lines = currencyCsv(p).trim().split('\n');
    expect(lines[0]).toContain('Source: World Bank');
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('2020,125,1.4,,');
  });
});
