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
  /** `planned: true` marks features that do not exist yet; the plans page labels them. */
  features: { label: string; planned?: boolean }[];
}

/** Proposed tiers from the October 2026 project overview. Used for feature gating once billing exists. */
export const TIERS: Tier[] = [
  {
    id: 'free', name: 'Free', priceEur: 0, tagline: 'Explore the platform',
    limits: { watchlists: 1, assetsPerWatchlist: 10, aiRequestsPerDay: 3, aiReportsPerMonth: 0, alertRules: 2, brainGraphs: 1, brainNodesPerGraph: 10 },
    features: [{ label: 'Global Radar with live hazard layers' }, { label: 'Country dossiers and comparisons' }, { label: 'Charts, macro and futures positioning' }, { label: 'Market Impact Radar' }, { label: 'Personal Intelligence Brain demo graph' }, { label: 'News and events feed', planned: true }],
  },
  {
    id: 'premium', name: 'Premium', priceEur: 4.99, tagline: 'For engaged readers',
    limits: { watchlists: 3, assetsPerWatchlist: 25, aiRequestsPerDay: 15, aiReportsPerMonth: 2, alertRules: 10, brainGraphs: 3, brainNodesPerGraph: 100 },
    features: [{ label: 'Everything in Free' }, { label: 'Personal Intelligence Brain: 3 graphs' }, { label: 'CSV exports' }, { label: 'Extended radar layers', planned: true }, { label: 'Text and voice daily briefing', planned: true }, { label: 'Basic scenario desk', planned: true }],
  },
  {
    id: 'prime', name: 'Prime', priceEur: 12.99, tagline: 'For active researchers',
    limits: { watchlists: 10, assetsPerWatchlist: 50, aiRequestsPerDay: 40, aiReportsPerMonth: 10, alertRules: 30, brainGraphs: 15, brainNodesPerGraph: 500 },
    features: [{ label: 'Everything in Premium' }, { label: 'Strategy Lab and backtesting' }, { label: 'Personal Intelligence Brain: 15 graphs' }, { label: 'Full chart toolkit', planned: true }, { label: 'Personalised briefing', planned: true }, { label: 'Early access to new modules', planned: true }],
  },
  {
    id: 'intelligence', name: 'Intelligence', priceEur: 24.99, tagline: 'For professionals',
    limits: { watchlists: 25, assetsPerWatchlist: 100, aiRequestsPerDay: 100, aiReportsPerMonth: 30, alertRules: 100, brainGraphs: 50, brainNodesPerGraph: 2000 },
    features: [{ label: 'Everything in Prime' }, { label: 'Personal Intelligence Brain: 50 graphs' }, { label: 'All licensed radar layers', planned: true }, { label: 'Research reports', planned: true }, { label: 'Priority early access', planned: true }],
  },
];
