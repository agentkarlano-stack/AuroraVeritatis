import { TIERS, type Tier, type TierId } from '../data/tiers';
import { useEntitlements } from '../store/entitlements';

export type LimitKey = keyof Tier['limits'];
export type Feature = 'scenarioDesk' | 'strategyLab' | 'csvExport' | 'voiceBriefing' | 'advancedImpactRadar' | 'countryComparisons';

/** Lowest tier that includes each feature, mirroring the proposed plan table. */
const FEATURE_MIN_TIER: Record<Feature, TierId> = {
  scenarioDesk: 'premium',
  voiceBriefing: 'premium',
  csvExport: 'prime',
  strategyLab: 'prime',
  advancedImpactRadar: 'prime',
  countryComparisons: 'intelligence',
};

const ORDER: TierId[] = ['free', 'premium', 'prime', 'intelligence'];

/**
 * During the free early-access preview every feature is unlocked, while numeric limits
 * (watchlist size, alert rules) are already enforced at the Free-tier level. Flip to false
 * when subscriptions launch (Phase 5, owner approval required).
 */
export const EARLY_ACCESS_ALL_FEATURES = true;

export function tier(id: TierId): Tier {
  return TIERS.find((t) => t.id === id) ?? TIERS[0]!;
}

export function limitOf(id: TierId, key: LimitKey): number {
  return tier(id).limits[key];
}

export function checkLimit(id: TierId, key: LimitKey, used: number): { allowed: boolean; limit: number; remaining: number } {
  const limit = limitOf(id, key);
  return { allowed: used < limit, limit, remaining: Math.max(0, limit - used) };
}

export function minTierFor(feature: Feature): TierId {
  return FEATURE_MIN_TIER[feature];
}

export function hasFeature(id: TierId, feature: Feature, earlyAccess = EARLY_ACCESS_ALL_FEATURES): boolean {
  return earlyAccess || ORDER.indexOf(id) >= ORDER.indexOf(FEATURE_MIN_TIER[feature]);
}

/**
 * Effective plan for the interface: the server's answer for signed-in users (manual grants by an administrator;
 * payments are disabled), Free for guests. Quotas on server-stored data are enforced by the database as well.
 */
export function useTier(): TierId {
  return useEntitlements((s) => s.tier);
}

/**
 * Brain graphs live only in the user's browser during early access (no server cost), so the preview uses the proposed
 * Premium quota rather than the Free demonstration limit. Server-side enforcement arrives with cloud sync.
 */
export const EARLY_ACCESS_BRAIN_TIER: TierId = 'premium';

export function brainLimits(id: TierId, earlyAccess = EARLY_ACCESS_ALL_FEATURES): { graphs: number; nodesPerGraph: number; edgesPerGraph: number } {
  const t = earlyAccess && ORDER.indexOf(id) < ORDER.indexOf(EARLY_ACCESS_BRAIN_TIER) ? EARLY_ACCESS_BRAIN_TIER : id;
  const nodes = limitOf(t, 'brainNodesPerGraph');
  return { graphs: limitOf(t, 'brainGraphs'), nodesPerGraph: nodes, edgesPerGraph: nodes * 4 };
}
