/**
 * Layer finder for the map Layers panel: task-oriented categories, plain-English aliases and search. The catalogue
 * itself (provider, licence, freshness) stays in `layers.ts`.
 */
import { GEO_LAYERS, type GeoLayer } from './layers';

export const PANEL_CATEGORIES = [
  'Base Map',
  'Geography & Labels',
  'Events',
  'Ongoing Crises',
  'Territory & Claims',
  'Infrastructure',
  'Aviation',
  'Maritime',
  'Alliances & Trade',
  'Environment',
  'Connectivity',
  'Economy & Society',
] as const;
export type PanelCategory = (typeof PANEL_CATEGORIES)[number];

const BY_ID: Record<string, PanelCategory> = {
  labels: 'Geography & Labels',
  'coats-of-arms': 'Geography & Labels',
  earthquakes: 'Events',
  disasters: 'Events',
  scenarios: 'Events',
  conflicts: 'Events',
  crises: 'Ongoing Crises',
  displacement: 'Ongoing Crises',
  territory: 'Territory & Claims',
  airports: 'Infrastructure',
  pipelines: 'Infrastructure',
  'power-flows': 'Infrastructure',
  'electricity-access': 'Infrastructure',
  aviation: 'Aviation',
  maritime: 'Maritime',
  ports: 'Maritime',
  alliances: 'Alliances & Trade',
  'trade-agreements': 'Alliances & Trade',
  'trade-openness': 'Alliances & Trade',
  outages: 'Connectivity',
  internet: 'Connectivity',
};

export function panelCategoryOf(l: GeoLayer): PanelCategory {
  const byId = BY_ID[l.id];
  if (byId) return byId;
  if (l.category === 'Base maps') return 'Base Map';
  if (l.category === 'Weather & environment') return 'Environment';
  if (l.category === 'Energy & infrastructure') return 'Infrastructure';
  return 'Economy & Society';
}

/** Everyday words people search for. */
const ALIASES: Record<string, string[]> = {
  earthquakes: ['quake', 'seismic', 'usgs', 'tremor'],
  disasters: ['flood', 'cyclone', 'hurricane', 'typhoon', 'volcano', 'wildfire', 'drought', 'gdacs', 'hazard'],
  labels: ['names', 'cities', 'places', 'rivers', 'regions', 'text'],
  'coats-of-arms': ['emblem', 'arms', 'heraldry', 'national symbol'],
  airports: ['airfield', 'airbase', 'air base', 'runway', 'military airport'],
  aviation: ['planes', 'aircraft', 'flights', 'adsb', 'opensky'],
  maritime: ['ships', 'vessels', 'ais', 'shipping', 'boats'],
  ports: ['harbour', 'harbor', 'chokepoint', 'strait', 'shipping lanes'],
  crises: ['war', 'conflict', 'emergency', 'crisis'],
  conflicts: ['war', 'battle', 'fighting', 'ucdp', 'violence'],
  territory: ['control', 'occupation', 'frontline', 'front line', 'claims', 'de facto', 'de jure', 'sovereignty'],
  alliances: ['nato', 'csto', 'treaty', 'defence pact', 'defense pact', 'military agreement'],
  'trade-agreements': ['fta', 'free trade', 'customs union', 'wto'],
  outages: ['internet outage', 'blackout', 'shutdown', 'connectivity'],
  internet: ['online', 'connectivity'],
  'night-lights': ['night', 'lights at night', 'electricity'],
  'true-color': ['satellite', 'imagery', 'photo'],
  'blue-marble': ['satellite', 'relief', 'base map'],
  military: ['defence', 'defense', 'army', 'sipri', 'military spending'],
  inflation: ['prices', 'cpi'],
  'gdp-per-capita': ['income', 'wealth', 'economy'],
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Layers matching every word of the query in the name, category, provider or aliases; all layers for an empty query. */
export function searchLayers(query: string, layers: GeoLayer[] = GEO_LAYERS): GeoLayer[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return layers;
  return layers.filter((l) => {
    const hay = norm([l.name, l.id, panelCategoryOf(l), l.provider, ...(ALIASES[l.id] ?? [])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Layers grouped by panel category, in panel order, empty categories omitted. */
export function groupLayers(layers: GeoLayer[]): { category: PanelCategory; layers: GeoLayer[] }[] {
  return PANEL_CATEGORIES.map((category) => ({ category, layers: layers.filter((l) => panelCategoryOf(l) === category) })).filter((g) => g.layers.length > 0);
}
