/**
 * Geo Intelligence layer catalogue. Each layer documents where its data comes from, how fresh it is, what it covers
 * and how to read it. Nothing here is decorative: a layer is listed as available only when Aurora can actually load
 * it; planned layers state what they need. Pure data, tested in `layers.test.ts`.
 */

/** What kind of information a layer shows. Never call monthly, annual or delayed data "live". */
export const DATA_NATURE = {
  'near-real-time': { label: 'Near real time', description: 'Observed recently (minutes to a day old), not a live feed.' },
  observation: { label: 'Daily observation', description: 'Satellite observation for the selected day; available a few hours after the overpass.' },
  historical: { label: 'Historical statistics', description: 'Official annual statistics; the latest year is usually one or two years old.' },
  composite: { label: 'Static composite', description: 'A fixed image assembled from many past observations. Not live and not current.' },
  modelled: { label: 'Modelled', description: 'Estimated by a model, not observed.' },
  simulated: { label: 'Simulated', description: 'Hypothetical scenario for demonstration. Not real data.' },
} as const;
export type DataNature = keyof typeof DATA_NATURE;

export const CATEGORIES = ['Base maps', 'Weather & environment', 'Energy & infrastructure', 'Energy & commodities', 'Economics & trade', 'Finance & markets', 'Geopolitics & security', 'Society'] as const;
export type GeoCategory = (typeof CATEGORIES)[number];

export interface LegendStop {
  value: number;
  color: string;
  label?: string;
}

interface Meta {
  id: string;
  name: string;
  category: GeoCategory;
  provider: string;
  providerUrl: string;
  license: string;
  attribution: string;
  nature: DataNature;
  updateFrequency: string;
  coverage: string;
  resolution: string;
  units?: string;
  /** How to read the layer, including its limits. */
  interpretation: string;
  uncertainty?: string;
}

/**
 * NASA GIBS WMTS layer (EPSG:3857), raster or vector tiles. `daily` layers take the selected date, limited to the
 * newest day the product publishes (`lagDays` behind today); fixed layers use their composite date.
 */
export interface GibsLayer extends Meta {
  kind: 'gibs';
  gibs: { layer: string; matrixSet: string; ext: 'jpg' | 'png' | 'mvt'; time: 'daily' | { fixed: string }; maxZoom: number; lagDays?: number; sourceLayer?: string };
  legend?: { stops: LegendStop[]; units: string };
}

/** Country choropleth from World Bank indicators (via Aurora's API). `derive` combines two indicators. */
export interface ChoroplethLayer extends Meta {
  kind: 'choropleth';
  indicator: string;
  derive?: { numerator: string; denominator: string; scale?: number };
  /** Fixed class breaks (ascending); colours run from low to high. */
  breaks: number[];
  palette: string[];
  format: 'percent' | 'usd' | 'intl' | 'months' | 'number' | 'years' | 'density';
  /**
   * Most recent value per country (each with its own year) instead of one selected year: for series that are
   * published with different lags per country or only every few years. Served by /api/map/:indicator.
   */
  latest?: boolean;
}

/** Point events from Aurora's live feeds (USGS, GDACS) and labelled simulated scenarios. */
export interface EventLayer extends Meta {
  kind: 'events';
  feed: 'earthquakes' | 'disasters' | 'scenarios';
}

/** Listed so users can see what is coming and why it is not available yet. */
export interface PlannedLayer extends Omit<Meta, 'nature' | 'updateFrequency' | 'coverage' | 'resolution' | 'license' | 'attribution'> {
  kind: 'planned';
  needs: string;
}

export type GeoLayer = GibsLayer | ChoroplethLayer | EventLayer | PlannedLayer;
export type ActiveLayer = Exclude<GeoLayer, PlannedLayer>;

const GIBS = {
  provider: 'NASA Global Imagery Browse Services (GIBS)',
  providerUrl: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api',
  license: 'NASA open data; no restrictions on use',
  attribution: 'Imagery: NASA EOSDIS GIBS',
};
const WB = {
  provider: 'World Bank, World Development Indicators',
  providerUrl: 'https://data.worldbank.org/',
  license: 'CC BY 4.0',
  attribution: 'Data: World Bank (CC BY 4.0)',
  nature: 'historical' as const,
  updateFrequency: 'Annual; Aurora refreshes daily',
  coverage: 'About 200 economies',
  resolution: 'Country level',
};
const SEQ = ['#2b2a26', '#4a3f2a', '#6e5a31', '#957636', '#bf9a45', '#e3c98f'];
const DIV = ['#3d6e8f', '#6f9cb5', '#a9bfc9', '#d9b46a', '#c9733f', '#a33a2c'];

type LatestSpec = [id: string, name: string, category: GeoCategory, indicator: string, units: string, breaks: number[], format: ChoroplethLayer['format'], interpretation: string, extra?: Partial<ChoroplethLayer>];
const LATEST: LatestSpec[] = [
  // Finance & markets
  ['bank-branches', 'Commercial bank branches', 'Finance & markets', 'FB.CBK.BRCH.P5', 'Per 100,000 adults', [2, 5, 10, 20, 40], 'number', 'Physical banking reach. Low values can mean weak access, or banking that has moved to mobile and digital channels (for example in East Africa).'],
  ['atms', 'ATMs', 'Finance & markets', 'FB.ATM.TOTL.P5', 'Per 100,000 adults', [5, 20, 40, 70, 120], 'number', 'Cash infrastructure. Falling counts in rich economies usually reflect card and mobile payments, not weaker banking.'],
  ['private-credit', 'Domestic credit to the private sector', 'Finance & markets', 'FS.AST.PRVT.GD.ZS', '% of GDP', [15, 30, 60, 100, 150], 'percent', 'Depth of bank lending to firms and households. High values mean deep credit markets and higher sensitivity to interest rates and credit cycles.'],
  ['market-cap', 'Stock market capitalisation', 'Finance & markets', 'CM.MKT.LCAP.GD.ZS', '% of GDP', [10, 30, 60, 100, 200], 'percent', 'Value of listed domestic companies relative to the economy. Coverage is limited to economies with a stock exchange that reports to the World Federation of Exchanges.', { uncertainty: 'About 90 economies report recent values.' }],
  ['listed-companies', 'Listed domestic companies', 'Finance & markets', 'CM.MKT.LDOM.NO', 'Number of companies', [20, 100, 300, 1000, 3000], 'number', 'Breadth of the local equity market. A few very large firms can dominate even where the count is high.', { uncertainty: 'About 90 economies report recent values.' }],
  ['reserves', 'Foreign exchange reserves', 'Finance & markets', 'FI.RES.TOTL.MO', 'Months of imports', [2, 3, 6, 9, 15], 'months', 'How many months of imports reserves could pay for. Below three months is a common warning level for external payment stress.'],
  ['lending-rate', 'Bank lending interest rate', 'Finance & markets', 'FR.INR.LEND', '% per year', [3, 6, 10, 15, 25], 'percent', 'Typical rate banks charge on loans. Definitions differ between countries, so compare levels with care.', { uncertainty: 'Definitions differ by country; about 150 economies.' }],
  // Economic geography
  ['gdp-ppp', 'GDP per capita (purchasing power)', 'Economics & trade', 'NY.GDP.PCAP.PP.CD', 'International $ (PPP)', [3000, 8000, 20000, 40000, 70000], 'intl', 'Output per person adjusted for price levels, so it compares living standards better than market exchange rates.'],
  ['industry-share', 'Industry share of the economy', 'Economics & trade', 'NV.IND.TOTL.ZS', '% of GDP (value added)', [15, 22, 30, 40, 55], 'percent', 'Industry including mining, construction and utilities. Very high values often reflect oil and gas extraction rather than manufacturing.'],
  ['manufacturing', 'Manufacturing share of the economy', 'Economics & trade', 'NV.IND.MANF.ZS', '% of GDP (value added)', [5, 10, 15, 20, 28], 'percent', 'Where factories carry the economy. High values mean exposure to global supply chains, energy prices and export demand.'],
  ['industry-jobs', 'Employment in industry', 'Economics & trade', 'SL.IND.EMPL.ZS', '% of total employment', [10, 18, 24, 30, 38], 'percent', 'Share of workers in industry (ILO-modelled estimate).', { uncertainty: 'Modelled estimates for many economies.' }],
  // Trade & logistics
  ['trade-share', 'Trade (exports plus imports)', 'Economics & trade', 'NE.TRD.GNFS.ZS', '% of GDP', [30, 50, 75, 100, 150], 'percent', 'Openness to international trade. Trade hubs can exceed 100% because goods pass through them.'],
  ['logistics', 'Logistics Performance Index', 'Economics & trade', 'LP.LPI.OVRL.XQ', 'Score from 1 (low) to 5 (high)', [2.2, 2.6, 3.0, 3.5, 3.9], 'number', 'Survey-based quality of customs, infrastructure, shipping and tracking. Published every few years (latest 2022).', { uncertainty: 'Survey-based; latest edition 2022.' }],
  ['container-ports', 'Container port traffic', 'Economics & trade', 'IS.SHP.GOOD.TU', 'TEU per year', [100000, 500000, 2000000, 8000000, 30000000], 'number', 'Twenty-foot container units handled by the country\'s ports: a proxy for the role in global shipping. Landlocked countries have no value.'],
  ['fdi', 'Foreign direct investment, net inflows', 'Economics & trade', 'BX.KLT.DINV.WD.GD.ZS', '% of GDP', [0, 1, 3, 6, 10], 'percent', 'New long-term foreign investment. Financial centres show very large or negative swings from corporate flows passing through.', { palette: DIV }],
  ['current-account', 'Current account balance', 'Economics & trade', 'BN.CAB.XOKA.GD.ZS', '% of GDP', [-8, -3, 0, 3, 8], 'percent', 'Whether a country earns more abroad than it spends (surplus) or relies on foreign financing (deficit). Large deficits raise currency risk.', { palette: DIV }],
  // Energy & commodities
  ['fuel-exports', 'Fuel exports', 'Energy & commodities', 'TX.VAL.FUEL.ZS.UN', '% of merchandise exports', [5, 15, 40, 70, 90], 'percent', 'Dependence on oil, gas and coal sales. High values mean public finances and the currency move with energy prices.'],
  ['metal-exports', 'Ores and metals exports', 'Energy & commodities', 'TX.VAL.MMTL.ZS.UN', '% of merchandise exports', [3, 10, 25, 45, 70], 'percent', 'Dependence on mining exports such as copper, iron ore and gold-bearing ores.'],
  ['food-exports', 'Food exports', 'Energy & commodities', 'TX.VAL.FOOD.ZS.UN', '% of merchandise exports', [10, 20, 35, 50, 70], 'percent', 'Dependence on agricultural and food exports, which are exposed to weather, harvests and trade restrictions.'],
  ['fuel-imports', 'Fuel imports', 'Energy & commodities', 'TM.VAL.FUEL.ZS.UN', '% of merchandise imports', [5, 10, 15, 20, 30], 'percent', 'How much of the import bill goes on fuel: exposure to oil and gas price shocks.'],
  ['energy-dependence', 'Net energy imports', 'Energy & commodities', 'EG.IMP.CONS.ZS', '% of energy use', [-100, -20, 0, 30, 70], 'percent', 'Positive: the country imports this share of the energy it uses. Negative: a net exporter (values far below −100% mean exports are several times domestic use).', { palette: DIV }],
  ['resource-rents', 'Natural resource rents', 'Energy & commodities', 'NY.GDP.TOTL.RT.ZS', '% of GDP', [2, 5, 10, 20, 35], 'percent', 'Income from oil, gas, coal, minerals and forests above extraction costs. High values signal commodity dependence and often weaker diversification.'],
  ['oil-rents', 'Oil rents', 'Energy & commodities', 'NY.GDP.PETR.RT.ZS', '% of GDP', [1, 5, 10, 20, 35], 'percent', 'Oil income above production cost relative to the economy.'],
  ['gas-rents', 'Natural gas rents', 'Energy & commodities', 'NY.GDP.NGAS.RT.ZS', '% of GDP', [0.5, 1, 3, 6, 12], 'percent', 'Gas income above production cost relative to the economy.'],
  ['mineral-rents', 'Mineral rents', 'Energy & commodities', 'NY.GDP.MINR.RT.ZS', '% of GDP', [0.5, 1, 3, 6, 12], 'percent', 'Income from metals and minerals (for example copper, gold, iron ore, bauxite) above extraction costs.'],
  ['power-coal', 'Electricity from coal', 'Energy & commodities', 'EG.ELC.COAL.ZS', '% of electricity generated', [5, 20, 40, 60, 80], 'percent', 'Coal in the power mix: exposure to coal prices and carbon policy.'],
  ['power-gas', 'Electricity from natural gas', 'Energy & commodities', 'EG.ELC.NGAS.ZS', '% of electricity generated', [10, 25, 45, 65, 85], 'percent', 'Gas in the power mix: electricity prices follow gas prices where this share is high.'],
  ['power-nuclear', 'Electricity from nuclear', 'Energy & commodities', 'EG.ELC.NUCL.ZS', '% of electricity generated', [1, 10, 20, 35, 55], 'percent', 'Nuclear in the power mix; zero where no reactors operate.'],
  ['power-renewable', 'Renewable electricity', 'Energy & commodities', 'EG.ELC.RNEW.ZS', '% of electricity generated', [10, 25, 50, 75, 95], 'percent', 'Hydro, wind, solar, geothermal and biomass in power generation. Hydro dominates many high values.'],
  ['energy-use', 'Energy use per person', 'Energy & commodities', 'EG.USE.PCAP.KG.OE', 'kg of oil equivalent', [500, 1000, 2500, 5000, 8000], 'number', 'Primary energy consumed per person: a proxy for industrial intensity and climate.'],
];

function latestLayers(): ChoroplethLayer[] {
  return LATEST.map(([id, name, category, indicator, units, breaks, format, interpretation, extra]) => ({
    kind: 'choropleth',
    id,
    name,
    category,
    ...WB,
    updateFrequency: 'Annual, published with a lag that differs by country; Aurora shows each country\'s most recent value and its year',
    units,
    indicator,
    breaks,
    palette: SEQ,
    format,
    interpretation,
    latest: true,
    ...extra,
  }));
}

export const GEO_LAYERS: GeoLayer[] = [
  // Base maps (also used as styles).
  {
    kind: 'gibs',
    id: 'blue-marble',
    name: 'Blue Marble (satellite composite)',
    category: 'Base maps',
    ...GIBS,
    nature: 'composite',
    updateFrequency: 'Fixed (2004 composite)',
    coverage: 'Global',
    resolution: 'About 500 m',
    interpretation: 'A cloud-free mosaic assembled from many 2004 observations, with shaded relief and ocean depth. It shows what the surface generally looks like, not current conditions.',
    gibs: { layer: 'BlueMarble_ShadedRelief_Bathymetry', matrixSet: 'GoogleMapsCompatible_Level8', ext: 'jpg', time: { fixed: '2004-08-01' }, maxZoom: 8 },
  },
  {
    kind: 'gibs',
    id: 'true-color',
    name: 'Satellite observation (VIIRS true colour)',
    category: 'Weather & environment',
    ...GIBS,
    nature: 'observation',
    updateFrequency: 'Daily (near real time, a few hours after the overpass)',
    coverage: 'Global, daytime; gaps between orbits and under polar night',
    resolution: 'About 250 m',
    interpretation: 'What the Suomi NPP satellite saw on the selected day: clouds, smoke, dust, snow and storms. Diagonal gaps are areas between orbits, not missing countries.',
    gibs: { layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', matrixSet: 'GoogleMapsCompatible_Level9', ext: 'jpg', time: 'daily', maxZoom: 9 },
  },
  {
    kind: 'gibs',
    id: 'night-lights',
    name: 'Night lights (Black Marble)',
    category: 'Energy & infrastructure',
    ...GIBS,
    nature: 'composite',
    updateFrequency: 'Fixed (2016 composite)',
    coverage: 'Global',
    resolution: 'About 500 m',
    interpretation: 'Artificial light at night, a proxy for settlement, electrification and economic activity. A composite: it does not show current outages.',
    gibs: { layer: 'VIIRS_Black_Marble', matrixSet: 'GoogleMapsCompatible_Level8', ext: 'png', time: { fixed: '2016-01-01' }, maxZoom: 8 },
  },
  {
    kind: 'gibs',
    id: 'aerosol',
    name: 'Air quality: aerosol optical depth',
    category: 'Weather & environment',
    ...GIBS,
    nature: 'observation',
    updateFrequency: 'Daily (near real time)',
    coverage: 'Global, cloud-free daytime areas',
    resolution: 'About 10 km',
    units: 'Aerosol optical depth (unitless)',
    interpretation: 'How much smoke, dust and haze is in the air column. Higher values mean hazier air. It is not a ground-level pollution reading.',
    uncertainty: 'No values under clouds or over bright surfaces such as snow.',
    gibs: { layer: 'MODIS_Combined_Value_Added_AOD', matrixSet: 'GoogleMapsCompatible_Level6', ext: 'png', time: 'daily', maxZoom: 6 },
    legend: { units: 'AOD', stops: [{ value: 0, color: '#fffeb3' }, { value: 0.5, color: '#f7a43c' }, { value: 1, color: '#c83b25' }, { value: 2, color: '#6b0f1a' }] },
  },
  {
    kind: 'gibs',
    id: 'no2',
    name: 'Air pollution: nitrogen dioxide',
    category: 'Weather & environment',
    ...GIBS,
    nature: 'observation',
    updateFrequency: 'Daily, published about 4 days after observation',
    coverage: 'Global, daytime',
    resolution: 'About 13 × 24 km',
    units: 'Tropospheric column (molecules/cm²)',
    interpretation: 'NO₂ from traffic, power plants and industry, a marker of fuel combustion. Daily values are noisy; compare several days before drawing conclusions.',
    gibs: { layer: 'OMI_Nitrogen_Dioxide_Tropo_Column', matrixSet: 'GoogleMapsCompatible_Level6', ext: 'png', time: 'daily', maxZoom: 6, lagDays: 4 },
  },
  {
    kind: 'gibs',
    id: 'precipitation',
    name: 'Precipitation rate (IMERG)',
    category: 'Weather & environment',
    ...GIBS,
    nature: 'observation',
    updateFrequency: 'Every 30 minutes; daily images published about 2 days later',
    coverage: 'Global between 60°N and 60°S',
    resolution: 'About 10 km',
    units: 'mm per hour',
    interpretation: 'Satellite-estimated rainfall and snowfall rate. Useful for storms and flooding; it is an estimate from microwave and infrared sensors, not a rain-gauge reading.',
    gibs: { layer: 'IMERG_Precipitation_Rate', matrixSet: 'GoogleMapsCompatible_Level6', ext: 'png', time: 'daily', maxZoom: 6, lagDays: 2 },
  },
  {
    kind: 'gibs',
    id: 'land-temperature',
    name: 'Land surface temperature (day)',
    category: 'Weather & environment',
    ...GIBS,
    nature: 'observation',
    updateFrequency: 'Daily',
    coverage: 'Global land, cloud-free areas',
    resolution: 'About 1 km',
    units: 'Kelvin (shown as colour)',
    interpretation: 'How hot the ground surface was during the satellite pass. Surface temperature can differ greatly from air temperature.',
    gibs: { layer: 'MODIS_Terra_Land_Surface_Temp_Day', matrixSet: 'GoogleMapsCompatible_Level7', ext: 'png', time: 'daily', maxZoom: 7 },
  },
  // Live event feeds.
  {
    kind: 'events',
    id: 'earthquakes',
    name: 'Earthquakes (M4.5+, last 7 days)',
    category: 'Geopolitics & security',
    provider: 'USGS Earthquake Hazards Program',
    providerUrl: 'https://earthquake.usgs.gov/',
    license: 'Public domain (U.S. Government)',
    attribution: 'Earthquakes: USGS',
    nature: 'near-real-time',
    updateFrequency: 'Aurora refreshes every 10 minutes',
    coverage: 'Global',
    resolution: 'Point locations',
    units: 'Moment magnitude',
    interpretation: 'Circle size grows with magnitude. Magnitude measures energy released; damage depends on depth, distance to people and building standards.',
    feed: 'earthquakes',
  },
  {
    kind: 'events',
    id: 'disasters',
    name: 'Disaster alerts (GDACS)',
    category: 'Geopolitics & security',
    provider: 'GDACS (UN OCHA and the European Commission JRC)',
    providerUrl: 'https://www.gdacs.org/',
    license: 'Free use with attribution',
    attribution: 'Alerts: GDACS',
    nature: 'modelled',
    updateFrequency: 'Aurora refreshes every 30 minutes',
    coverage: 'Global',
    resolution: 'Point locations',
    interpretation: 'Earthquakes, cyclones, floods, volcanoes, droughts and wildfires with a modelled humanitarian alert level (green, orange, red). The alert is a model estimate and can change as an event develops.',
    feed: 'disasters',
  },
  {
    kind: 'events',
    id: 'scenarios',
    name: 'Simulated geopolitical scenarios',
    category: 'Geopolitics & security',
    provider: 'Aurora Veritatis (demonstration)',
    providerUrl: '/status',
    license: 'Aurora demonstration content',
    attribution: 'Simulated scenarios: Aurora',
    nature: 'simulated',
    updateFrequency: 'Fixed',
    coverage: 'Selected regions',
    resolution: 'Point locations',
    interpretation: 'Hypothetical exercises used to demonstrate the platform. They are not real events.',
    feed: 'scenarios',
  },

  // Country statistics.
  // Economic and financial maps (owner directive "Institutional market intelligence", priority 1). Most recent value
  // per country; every code was checked against the World Bank API for coverage (2026-10-23).
  ...latestLayers(),

  { kind: 'choropleth', id: 'gdp-per-capita', name: 'GDP per capita', category: 'Economics & trade', ...WB, units: 'Current US$', indicator: 'NY.GDP.PCAP.CD', breaks: [1000, 4000, 12000, 25000, 50000], palette: SEQ, format: 'usd', interpretation: 'Economic output per person at market exchange rates. It does not account for price differences between countries (see the Currency module for purchasing power).' },
  { kind: 'choropleth', id: 'gdp-growth', name: 'Real GDP growth', category: 'Economics & trade', ...WB, units: '% per year', indicator: 'NY.GDP.MKTP.KD.ZG', breaks: [-2, 0, 2, 4, 6], palette: DIV, format: 'percent', interpretation: 'Annual change in inflation-adjusted output. Single years can be distorted by crises, commodity swings or rebounds.' },
  { kind: 'choropleth', id: 'inflation', name: 'Inflation (consumer prices)', category: 'Economics & trade', ...WB, units: '% per year', indicator: 'FP.CPI.TOTL.ZG', breaks: [0, 2, 5, 10, 20], palette: DIV, format: 'percent', interpretation: 'Annual change in consumer prices. Above 10% erodes purchasing power quickly; very high values often signal currency crises.' },
  { kind: 'choropleth', id: 'unemployment', name: 'Unemployment', category: 'Economics & trade', ...WB, units: '% of labour force', indicator: 'SL.UEM.TOTL.ZS', breaks: [3, 5, 8, 12, 20], palette: SEQ, format: 'percent', interpretation: 'ILO-modelled estimate. Definitions and informal work make cross-country comparisons approximate.', uncertainty: 'Modelled estimates for many economies.' },
  { kind: 'choropleth', id: 'trade-openness', name: 'Exports (% of GDP)', category: 'Economics & trade', ...WB, units: '% of GDP', indicator: 'NE.EXP.GNFS.ZS', breaks: [15, 25, 40, 60, 100], palette: SEQ, format: 'percent', interpretation: 'Exports of goods and services relative to the economy. High values mean exposure to external demand and trade disruptions.' },
  { kind: 'choropleth', id: 'debt', name: 'Central government debt', category: 'Economics & trade', ...WB, units: '% of GDP', indicator: 'GC.DOD.TOTL.GD.ZS', breaks: [30, 60, 90, 120, 150], palette: SEQ, format: 'percent', interpretation: 'Gross central government debt. Coverage is incomplete: many economies do not report it to the World Bank.', uncertainty: 'Sparse coverage.' },
  { kind: 'choropleth', id: 'electricity-access', name: 'Access to electricity', category: 'Energy & infrastructure', ...WB, units: '% of population', indicator: 'EG.ELC.ACCS.ZS', breaks: [25, 50, 75, 90, 99], palette: SEQ, format: 'percent', interpretation: 'Share of the population with an electricity connection. It says nothing about reliability or outages.' },
  { kind: 'choropleth', id: 'renewables', name: 'Renewable share of final energy', category: 'Energy & infrastructure', ...WB, units: '% of final energy', indicator: 'EG.FEC.RNEW.ZS', breaks: [5, 10, 20, 40, 60], palette: SEQ, format: 'percent', interpretation: 'Includes traditional biomass, so some low-income economies show high values without modern renewable power.' },
  { kind: 'choropleth', id: 'internet', name: 'Internet users', category: 'Energy & infrastructure', ...WB, units: '% of population', indicator: 'IT.NET.USER.ZS', breaks: [20, 40, 60, 80, 95], palette: SEQ, format: 'percent', interpretation: 'Share of people who used the internet in the last three months. Not a measure of outages or speed.' },
  { kind: 'choropleth', id: 'military', name: 'Military expenditure', category: 'Geopolitics & security', ...WB, provider: 'World Bank (from SIPRI)', units: '% of GDP', indicator: 'MS.MIL.XPND.GD.ZS', breaks: [1, 1.5, 2, 3, 5], palette: SEQ, format: 'percent', interpretation: 'Public aggregate defence spending relative to the economy. Some governments do not publish complete figures.' },
  { kind: 'choropleth', id: 'density', name: 'Population density (country average)', category: 'Society', ...WB, units: 'People per km²', indicator: 'SP.POP.TOTL', derive: { numerator: 'SP.POP.TOTL', denominator: 'AG.SRF.TOTL.K2' }, breaks: [10, 50, 100, 250, 500], palette: SEQ, format: 'density', interpretation: 'Population divided by surface area. Averages hide strong regional differences; use the gridded population layer for detail.' },
  { kind: 'choropleth', id: 'urban', name: 'Urbanisation', category: 'Society', ...WB, units: '% of population', indicator: 'SP.URB.TOTL.IN.ZS', breaks: [30, 45, 60, 75, 90], palette: SEQ, format: 'percent', interpretation: 'Share living in urban areas as defined by each country, so definitions differ.' },
  { kind: 'choropleth', id: 'life-expectancy', name: 'Life expectancy', category: 'Society', ...WB, units: 'Years at birth', indicator: 'SP.DYN.LE00.IN', breaks: [60, 65, 70, 75, 80], palette: SEQ, format: 'years', interpretation: 'A summary indicator of public health and living conditions.' },

  // Planned.
  { kind: 'planned', id: 'wind', name: 'Wind speed and animated wind', category: 'Weather & environment', provider: 'ECMWF open data or NOAA GFS', providerUrl: 'https://www.ecmwf.int/en/forecasts/datasets/open-data', interpretation: 'Forecast wind fields with particle animation.', needs: 'A forecast-grid processing job (GRIB to tiles) and storage; free data, but it needs Cloudflare R2 or similar for the processed tiles.' },
  { kind: 'planned', id: 'power-flows', name: 'European electricity: generation mix, prices and cross-border flows', category: 'Energy & infrastructure', provider: 'ENTSO-E Transparency Platform', providerUrl: 'https://transparency.entsoe.eu/', interpretation: 'Hourly generation by source, day-ahead prices and flows between countries.', needs: 'A free ENTSO-E API token (registration by the owner).' },
  { kind: 'planned', id: 'pipelines', name: 'Power plants, pipelines and LNG terminals', category: 'Energy & infrastructure', provider: 'Global Energy Monitor (CC BY 4.0) and OpenStreetMap', providerUrl: 'https://globalenergymonitor.org/', interpretation: 'Locations and capacity of major energy infrastructure.', needs: 'Licence review for public display and preprocessing into vector tiles.' },
  { kind: 'planned', id: 'conflicts', name: 'Armed conflict events', category: 'Geopolitics & security', provider: 'UCDP (Uppsala Conflict Data Program)', providerUrl: 'https://ucdp.uu.se/', interpretation: 'Georeferenced, verified conflict events with fatality estimates.', needs: 'A UCDP API token (owner: send "UCDP token added").' },
  { kind: 'planned', id: 'ports', name: 'Ports, shipping corridors and chokepoints', category: 'Economics & trade', provider: 'World Port Index (NGA, public domain) and IMF PortWatch', providerUrl: 'https://portwatch.imf.org/', interpretation: 'Major ports, trade chokepoints and disruption indicators.', needs: 'Data preparation and a licence check for PortWatch.' },
  { kind: 'planned', id: 'outages', name: 'Internet outages', category: 'Energy & infrastructure', provider: 'IODA (Georgia Tech) and Cloudflare Radar', providerUrl: 'https://ioda.inetintel.cc.gatech.edu/', interpretation: 'Documented national and regional connectivity disruptions.', needs: 'API integration and a terms review.' },
  { kind: 'planned', id: 'drought', name: 'Drought and soil moisture', category: 'Weather & environment', provider: 'Copernicus European Drought Observatory / NASA SMAP', providerUrl: 'https://edo.jrc.ec.europa.eu/', interpretation: 'Drought indicators and soil moisture anomalies.', needs: 'Layer identifiers verified against the provider services.' },
  { kind: 'planned', id: 'population-density', name: 'Population density (gridded)', category: 'Society', provider: 'WorldPop (CC BY 4.0) or GHSL (European Commission)', providerUrl: 'https://www.worldpop.org/', interpretation: 'Where people live at about 1 km resolution.', needs: 'NASA GIBS refuses the GPW layer (HTTP 403, verified 2026-10-23); an alternative needs preprocessing into tiles and storage.' },
  { kind: 'planned', id: 'fires', name: 'Active fires and thermal anomalies', category: 'Weather & environment', provider: 'NASA FIRMS (VIIRS), via GIBS vector tiles', providerUrl: 'https://firms.modaps.eosdis.nasa.gov/', interpretation: 'Daily satellite heat detections: wildfires, agricultural burning, gas flares and volcanoes.', needs: 'The vector tile address could not be confirmed yet (verified in CI on 2026-10-23); it is enabled once a test tile loads.' },
  { kind: 'planned', id: 'labels', name: 'Place names and progressive labels', category: 'Base maps', provider: 'OpenMapTiles schema with Natural Earth and OpenStreetMap data (ODbL)', providerUrl: 'https://openmaptiles.org/', interpretation: 'Countries, seas, regions, rivers and cities appearing with zoom, with collision handling.', needs: 'Self-hosted label fonts (glyphs) and vector tiles built and stored for the app (Cloudflare R2 or similar).' },
  { kind: 'planned', id: 'coats-of-arms', name: 'Country coats of arms', category: 'Geopolitics & security', provider: 'Wikimedia Commons (licence checked per file)', providerUrl: 'https://commons.wikimedia.org/', interpretation: 'National emblems shown subtly for the selected country, with attribution.', needs: 'A per-file licence review and a self-hosted, credited image set.' },
  { kind: 'planned', id: 'crises', name: 'Ongoing crises (wars, prolonged operations, sustained emergencies)', category: 'Geopolitics & security', provider: 'Aurora crisis registry built from cited sources', providerUrl: '/status', interpretation: 'Persistent situations shown as areas with status, last assessment and sources, separate from recent events.', needs: 'A curated, sourced registry with assessment dates; never inferred from headline volume.' },
  { kind: 'planned', id: 'territory', name: 'Territorial control, claims and armed presence', category: 'Geopolitics & security', provider: 'Per-case sourced datasets (licence checked per source)', providerUrl: '/status', interpretation: 'De jure, de facto and combined views; control fills, dashed claims and hatched presence with explicit legends.', needs: 'Sourced, dated boundary datasets for each case; many conflict maps restrict reuse, so each source needs a licence check.' },
  { kind: 'planned', id: 'airports', name: 'Airports (international and military)', category: 'Energy & infrastructure', provider: 'OurAirports (public domain)', providerUrl: 'https://ourairports.com/data/', interpretation: 'Large and medium airports and documented military airfields.', needs: 'Preprocessing the public-domain airport list into a map file (planned next).' },
  { kind: 'planned', id: 'aviation', name: 'Live aircraft (event context)', category: 'Energy & infrastructure', provider: 'OpenSky Network', providerUrl: 'https://opensky-network.org/', interpretation: 'Aircraft positions with callsign, altitude and age, shown in Map Explorer; Radar shows only event-related traffic.', needs: 'OpenSky refuses Cloudflare (HTTP 522); a relay outside Cloudflare and OpenSky\'s permission for public display.' },
  { kind: 'planned', id: 'maritime', name: 'Ship positions (event context)', category: 'Economics & trade', provider: 'AISStream', providerUrl: 'https://aisstream.io/', interpretation: 'Vessel positions with identity and age; Map Explorer shows the full feed, Radar only event-related ships.', needs: 'Confirmation of AISStream terms for public display and a server-side collector.' },
  { kind: 'planned', id: 'alliances', name: 'Military alliances and agreements', category: 'Geopolitics & security', provider: 'Treaty texts and official member lists (curated)', providerUrl: '/status', interpretation: 'Membership, partnership and pending accession with signature, ratification and entry-into-force dates; binding defence commitments distinguished.', needs: 'A curated, dated treaty dataset with sources.' },
  { kind: 'planned', id: 'trade-agreements', name: 'Trade agreements', category: 'Economics & trade', provider: 'WTO Regional Trade Agreements database', providerUrl: 'https://rtais.wto.org/', interpretation: 'Agreements by type and status with dates and parties.', needs: 'Import of the WTO database (free) with a terms check.' },
  { kind: 'planned', id: 'displacement', name: 'Refugees and displacement', category: 'Geopolitics & security', provider: 'UNHCR Refugee Data Finder', providerUrl: 'https://www.unhcr.org/refugee-statistics/', interpretation: 'Refugees by country of origin and asylum.', needs: 'API integration (free, attribution required).' },
];

export const LAYER_MAP = new Map(GEO_LAYERS.map((l) => [l.id, l]));
export const isActive = (l: GeoLayer): l is ActiveLayer => l.kind !== 'planned';

/** The date a daily layer actually shows: the selected date, but never newer than the product publishes. */
export function effectiveDate(l: GibsLayer, selected: string, today: string): string {
  if (l.gibs.time !== 'daily') return l.gibs.time.fixed;
  const newest = new Date(Date.parse(`${today}T00:00:00Z`) - (l.gibs.lagDays ?? 1) * 86_400_000).toISOString().slice(0, 10);
  return selected < newest ? selected : newest;
}

/** GIBS tile URL template for MapLibre. `date` is the date to show (see `effectiveDate`). */
export function gibsTiles(l: GibsLayer, date: string): string {
  const t = l.gibs.time === 'daily' ? date : l.gibs.time.fixed;
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l.gibs.layer}/default/${t}/${l.gibs.matrixSet}/{z}/{y}/{x}.${l.gibs.ext}`;
}

/** Class index for a value against ascending breaks (0 … breaks.length). */
export function classOf(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value >= breaks[i]!) i++;
  return i;
}

export function formatValue(v: number, format: ChoroplethLayer['format']): string {
  const abs = Math.abs(v);
  const compact = (n: number) => (abs >= 1e9 ? `${(n / 1e9).toFixed(1)} bn` : abs >= 1e6 ? `${(n / 1e6).toFixed(1)} m` : abs >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString('en-GB', { maximumFractionDigits: 1 }));
  switch (format) {
    case 'percent':
      return `${v.toFixed(1)}%`;
    case 'usd':
      return `US$ ${compact(v)}`;
    case 'intl':
      return `Int$ ${compact(v)}`;
    case 'months':
      return `${v.toFixed(1)} months`;
    case 'years':
      return `${v.toFixed(1)} years`;
    case 'density':
      return `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-GB')} per km²`;
    default:
      return compact(v);
  }
}

/** Legend rows for a choropleth: "< b0", "b0 to b1", …, "≥ bn". */
export function choroplethLegend(l: ChoroplethLayer): { color: string; label: string }[] {
  const f = (v: number) => formatValue(v, l.format);
  return l.palette.map((color, i) => ({
    color,
    label: i === 0 ? `Below ${f(l.breaks[0]!)}` : i === l.breaks.length ? `${f(l.breaks[i - 1]!)} and above` : `${f(l.breaks[i - 1]!)} to ${f(l.breaks[i]!)}`,
  }));
}

/** Layer pairs worth combining, with why (shown as suggestions). */
export const COMBINATIONS: { layers: [string, string]; why: string }[] = [
  { layers: ['true-color', 'aerosol'], why: 'Smoke and dust plumes in the satellite image next to measured haze.' },
  { layers: ['precipitation', 'disasters'], why: 'Heavy rain next to flood and cyclone alerts.' },
  { layers: ['night-lights', 'electricity-access'], why: 'Where light at night matches or contradicts reported electricity access.' },
  { layers: ['inflation', 'gdp-growth'], why: 'Stagflation risk: high inflation with weak growth.' },
  { layers: ['earthquakes', 'density'], why: 'Earthquakes in densely populated countries carry the highest human risk.' },
  { layers: ['no2', 'night-lights'], why: 'Combustion and industrial activity next to settlement patterns.' },
];

