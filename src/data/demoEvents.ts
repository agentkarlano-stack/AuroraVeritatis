import type { GeoEvent } from '../../shared/types';

const DEMO_SOURCE = { name: 'Aurora Veritatis demo dataset', url: '/status', license: 'Synthetic — for interface demonstration only' };

function daysAgo(n: number, hour = 9): string {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

/**
 * SIMULATED scenarios used to demonstrate the Conflict Radar and Market Impact links.
 * They describe hypothetical situations, not real events, and contain no casualty figures.
 * Replace with sourced data (GDELT / UCDP / ReliefWeb) in Phase 2.
 */
export const DEMO_EVENTS: GeoEvent[] = [
  {
    id: 'demo-01', title: 'Simulated scenario: shipping disruption in a strategic strait',
    summary: 'Hypothetical exercise: tanker traffic slows after a security alert. Used to demonstrate links between chokepoints, energy prices and freight costs.',
    category: 'energy', severity: 4, lat: 26.5, lon: 56.4, region: 'Middle East', time: daysAgo(1),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['CRUDE.D', 'NATGAS.D', 'SHIP.D', 'GOLD.D'],
  },
  {
    id: 'demo-02', title: 'Simulated scenario: contested election result',
    summary: 'Hypothetical exercise: disputed preliminary results and street protests in a mid-sized economy. Demonstrates political-risk tagging.',
    category: 'political', severity: 3, lat: -1.3, lon: 36.8, region: 'Africa', time: daysAgo(2),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['EM-EQ.D'],
  },
  {
    id: 'demo-03', title: 'Simulated scenario: cross-border artillery exchange',
    summary: 'Hypothetical exercise used to demonstrate conflict-layer filtering by severity and date. No real location or casualty data implied.',
    category: 'conflict', severity: 5, lat: 48.6, lon: 37.9, region: 'Europe', time: daysAgo(0, 6),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['WHEAT.D', 'NATGAS.D', 'DEF.D', 'EUR-EQ.D'],
  },
  {
    id: 'demo-04', title: 'Simulated scenario: naval standoff near disputed reefs',
    summary: 'Hypothetical exercise: coast-guard vessels in a prolonged standoff. Demonstrates maritime security events.',
    category: 'security', severity: 3, lat: 10.2, lon: 114.4, region: 'Southeast Asia', time: daysAgo(4),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['SHIP.D', 'EM-EQ.D'],
  },
  {
    id: 'demo-05', title: 'Simulated scenario: central bank surprise rate decision',
    summary: 'Hypothetical exercise: an unexpected policy move. Demonstrates economic events and rate-sensitive asset links.',
    category: 'economic', severity: 2, lat: 35.7, lon: 139.7, region: 'East Asia', time: daysAgo(3),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['USDJPY.D', 'UST10Y.D'],
  },
  {
    id: 'demo-06', title: 'Simulated scenario: humanitarian corridor negotiations',
    summary: 'Hypothetical exercise: talks on aid access stall. Demonstrates humanitarian-category events.',
    category: 'humanitarian', severity: 4, lat: 15.5, lon: 32.5, region: 'Africa', time: daysAgo(5),
    provenance: 'simulated', source: DEMO_SOURCE,
  },
  {
    id: 'demo-07', title: 'Simulated scenario: pipeline maintenance outage',
    summary: 'Hypothetical exercise: an extended unplanned outage on a gas interconnector. Demonstrates energy-supply risk.',
    category: 'energy', severity: 3, lat: 55.5, lon: 13.0, region: 'Europe', time: daysAgo(6),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['NATGAS.D', 'EUR-EQ.D'],
  },
  {
    id: 'demo-08', title: 'Simulated scenario: export restrictions on critical minerals',
    summary: 'Hypothetical exercise: new licensing requirements for strategic minerals. Demonstrates supply-chain links.',
    category: 'economic', severity: 3, lat: 39.9, lon: 116.4, region: 'East Asia', time: daysAgo(8),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['EM-EQ.D', 'GLB-EQ.D'],
  },
  {
    id: 'demo-09', title: 'Simulated scenario: diplomatic expulsions',
    summary: 'Hypothetical exercise: reciprocal expulsion of diplomats. Demonstrates diplomatic-crisis tagging.',
    category: 'political', severity: 2, lat: 50.8, lon: 4.4, region: 'Europe', time: daysAgo(10),
    provenance: 'simulated', source: DEMO_SOURCE,
  },
  {
    id: 'demo-10', title: 'Simulated scenario: insurgent attack on mining convoy',
    summary: 'Hypothetical exercise used to demonstrate security incidents in resource regions. No real casualty data implied.',
    category: 'security', severity: 4, lat: 14.0, lon: -1.5, region: 'Africa', time: daysAgo(12),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['GOLD.D'],
  },
  {
    id: 'demo-11', title: 'Simulated scenario: sovereign debt downgrade',
    summary: 'Hypothetical exercise: a rating agency downgrade. Demonstrates financial-stress events.',
    category: 'economic', severity: 2, lat: -34.6, lon: -58.4, region: 'Americas', time: daysAgo(14),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['EM-EQ.D'],
  },
  {
    id: 'demo-12', title: 'Simulated scenario: border closure after migration surge',
    summary: 'Hypothetical exercise: temporary closure of a land border. Demonstrates humanitarian and political overlap.',
    category: 'humanitarian', severity: 3, lat: 32.5, lon: -117.0, region: 'Americas', time: daysAgo(18),
    provenance: 'simulated', source: DEMO_SOURCE,
  },
  {
    id: 'demo-13', title: 'Simulated scenario: missile test announcement',
    summary: 'Hypothetical exercise: a state announces a ballistic missile test. Demonstrates strategic security events.',
    category: 'security', severity: 4, lat: 39.0, lon: 125.7, region: 'East Asia', time: daysAgo(21),
    provenance: 'simulated', source: DEMO_SOURCE, marketLinks: ['USDJPY.D', 'DEF.D', 'GOLD.D'],
  },
  {
    id: 'demo-14', title: 'Simulated scenario: grid failure during heatwave',
    summary: 'Hypothetical exercise: rolling blackouts in a large metropolitan area. Demonstrates infrastructure stress.',
    category: 'energy', severity: 2, lat: 28.6, lon: 77.2, region: 'South Asia', time: daysAgo(25),
    provenance: 'simulated', source: DEMO_SOURCE,
  },
];
