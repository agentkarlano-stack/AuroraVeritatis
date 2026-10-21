export type TierId = 'free' | 'premium' | 'prime' | 'intelligence';

export interface Tier {
  id: TierId;
  name: string;
  /** Proposed monthly price in EUR — not a final public offer. */
  priceEur: number;
  tagline: string;
  limits: {
    watchlists: number;
    assetsPerWatchlist: number;
    aiRequestsPerDay: number;
    aiReportsPerMonth: number;
    alertRules: number;
    /** Personal Intelligence Brain (proposed quotas, owner brief 2026-10-21). */
    brainGraphs: number;
    brainNodesPerGraph: number;
  };
  features: string[];
}

/** Proposed tiers from the October 2026 project overview. Used for feature gating once billing exists. */
export const TIERS: Tier[] = [
  {
    id: 'free', name: 'Free', priceEur: 0, tagline: 'Explore the platform',
    limits: { watchlists: 1, assetsPerWatchlist: 10, aiRequestsPerDay: 3, aiReportsPerMonth: 0, alertRules: 2, brainGraphs: 1, brainNodesPerGraph: 10 },
    features: ['Basic global news', 'Conflict Radar — basic layers', 'Country summaries', 'Basic financial charts', 'Market Impact Radar preview'],
  },
  {
    id: 'premium', name: 'Premium', priceEur: 4.99, tagline: 'For engaged readers',
    limits: { watchlists: 3, assetsPerWatchlist: 25, aiRequestsPerDay: 15, aiReportsPerMonth: 2, alertRules: 10, brainGraphs: 3, brainNodesPerGraph: 100 },
    features: ['Full global news', 'Extended radar layers', 'Detailed country dossiers', 'Advanced charts', 'Text + voice daily briefing', 'Scenario Desk — basic', 'Limited data exports'],
  },
  {
    id: 'prime', name: 'Prime', priceEur: 12.99, tagline: 'For active researchers',
    limits: { watchlists: 10, assetsPerWatchlist: 50, aiRequestsPerDay: 40, aiReportsPerMonth: 10, alertRules: 30, brainGraphs: 15, brainNodesPerGraph: 500 },
    features: ['Everything in Premium', 'Full chart toolkit', 'Personalised briefing', 'Advanced Market Impact Radar', 'Strategy Lab', 'CSV exports', 'Selected early access'],
  },
  {
    id: 'intelligence', name: 'Intelligence', priceEur: 24.99, tagline: 'For professionals',
    limits: { watchlists: 25, assetsPerWatchlist: 100, aiRequestsPerDay: 100, aiReportsPerMonth: 30, alertRules: 100, brainGraphs: 50, brainNodesPerGraph: 2000 },
    features: ['Everything in Prime', 'Licensed-maximum radar layers', 'Advanced country comparisons', 'CSV + research reports', 'Priority early access'],
  },
];
