import { create } from 'zustand';
import type { TierId } from '../data/tiers';

/** Active manual plan grant (an administrator's complimentary grant, never a payment). */
export interface PlanGrant {
  tier: TierId;
  expires_at: string | null;
  reason: string;
  since: string;
}

export interface EntitlementsState {
  /** guest: not signed in; unavailable: the database has no entitlement functions yet (treated as Free). */
  status: 'guest' | 'loading' | 'ready' | 'unavailable' | 'error';
  tier: TierId;
  isAdmin: boolean;
  grant: PlanGrant | null;
  refresh: number;
}

/** The signed-in user's effective plan and administrator role, as reported by the server (`my_entitlements`). */
export const useEntitlements = create<EntitlementsState>()(() => ({ status: 'guest', tier: 'free', isAdmin: false, grant: null, refresh: 0 }));

export const refreshEntitlements = () => useEntitlements.setState((s) => ({ refresh: s.refresh + 1 }));
