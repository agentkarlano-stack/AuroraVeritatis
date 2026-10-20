import { TIERS, type Tier, type TierId } from '../data/tiers';

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
 * Current plan for the UI. Everyone is on Free until billing exists; the server-side source of
 * truth will be `profiles.tier` (updated only by the billing webhook, enforced by RLS).
 */
export function useTier(): TierId {
  return 'free';
}
