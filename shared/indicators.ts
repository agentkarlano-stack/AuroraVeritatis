import type { IndicatorValue } from './types';

export interface IndicatorDef {
  id: string;
  label: string;
  unit: IndicatorValue['unit'];
  section: 'general' | 'economy' | 'demography' | 'infrastructure' | 'security';
}

/**
 * World Bank WDI indicators used for country dossiers.
 * Source: World Bank Open Data (CC BY 4.0). Military series originate from SIPRI via the WDI.
 */
export const INDICATORS: readonly IndicatorDef[] = [
  { id: 'SP.POP.TOTL', label: 'Population', unit: 'count', section: 'general' },
  { id: 'AG.SRF.TOTL.K2', label: 'Surface area', unit: 'km2', section: 'general' },
  { id: 'SP.URB.TOTL.IN.ZS', label: 'Urban population (% of total)', unit: 'percent', section: 'general' },

  { id: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)', unit: 'usd', section: 'economy' },
  { id: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)', unit: 'usd', section: 'economy' },
  { id: 'NY.GDP.MKTP.KD.ZG', label: 'Real GDP growth (annual)', unit: 'percent', section: 'economy' },
  { id: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual)', unit: 'percent', section: 'economy' },
  { id: 'SL.UEM.TOTL.ZS', label: 'Unemployment (% of labour force, ILO est.)', unit: 'percent', section: 'economy' },
  { id: 'GC.DOD.TOTL.GD.ZS', label: 'Central government debt (% of GDP)', unit: 'percent', section: 'economy' },
  { id: 'NE.EXP.GNFS.ZS', label: 'Exports of goods & services (% of GDP)', unit: 'percent', section: 'economy' },
  { id: 'NE.IMP.GNFS.ZS', label: 'Imports of goods & services (% of GDP)', unit: 'percent', section: 'economy' },

  { id: 'SP.POP.GROW', label: 'Population growth', unit: 'percent', section: 'demography' },
  { id: 'SP.POP.0014.TO.ZS', label: 'Population aged 0–14 (% of total)', unit: 'percent', section: 'demography' },
  { id: 'SP.POP.1564.TO.ZS', label: 'Population aged 15–64 (% of total)', unit: 'percent', section: 'demography' },
  { id: 'SP.POP.65UP.TO.ZS', label: 'Population aged 65+ (% of total)', unit: 'percent', section: 'demography' },
  { id: 'SP.DYN.LE00.IN', label: 'Life expectancy at birth', unit: 'years', section: 'demography' },

  { id: 'IT.NET.USER.ZS', label: 'Internet users (% of population)', unit: 'percent', section: 'infrastructure' },
  { id: 'IT.CEL.SETS.P2', label: 'Mobile subscriptions', unit: 'per100', section: 'infrastructure' },
  { id: 'EG.ELC.ACCS.ZS', label: 'Access to electricity (% of population)', unit: 'percent', section: 'infrastructure' },
  { id: 'EG.FEC.RNEW.ZS', label: 'Renewable share of final energy', unit: 'percent', section: 'infrastructure' },

  { id: 'MS.MIL.XPND.CD', label: 'Military expenditure (current US$)', unit: 'usd', section: 'security' },
  { id: 'MS.MIL.XPND.GD.ZS', label: 'Military expenditure (% of GDP)', unit: 'percent', section: 'security' },
  { id: 'MS.MIL.TOTL.P1', label: 'Armed forces personnel', unit: 'count', section: 'security' },
] as const;

export const INDICATOR_IDS = new Set(INDICATORS.map((i) => i.id));

export const WORLD_BANK_SOURCE = {
  name: 'World Bank Open Data (WDI)',
  url: 'https://data.worldbank.org/',
  license: 'CC BY 4.0',
} as const;
