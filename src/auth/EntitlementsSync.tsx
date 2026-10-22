import { useEffect } from 'react';
import type { TierId } from '../data/tiers';
import { useEntitlements, type PlanGrant } from '../store/entitlements';
import { useAuth } from './AuthProvider';

const TIERS: TierId[] = ['free', 'premium', 'prime', 'intelligence'];

/**
 * Loads the signed-in user's plan and administrator role from the server. The server enforces both; this copy only
 * drives the interface. Guests and databases without the entitlement functions are treated as Free.
 */
export function EntitlementsSync() {
  const { client, session } = useAuth();
  const userId = session?.user.id ?? null;
  const refresh = useEntitlements((s) => s.refresh);
  useEffect(() => {
    if (!client || !userId) {
      useEntitlements.setState({ status: 'guest', tier: 'free', isAdmin: false, grant: null });
      return;
    }
    let cancelled = false;
    // Only the first load shows a loading state; refreshes keep the current answer until the new one arrives.
    if (useEntitlements.getState().status === 'guest') useEntitlements.setState({ status: 'loading' });
    const load = () =>
      client.rpc('my_entitlements').then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // PGRST202: function not found (migration not applied yet).
          const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message);
          useEntitlements.setState({ status: missing ? 'unavailable' : 'error', tier: 'free', isAdmin: false, grant: null });
          return;
        }
        const e = (data ?? {}) as { tier?: string; is_admin?: boolean; grant?: PlanGrant | null };
        useEntitlements.setState({
          status: 'ready',
          tier: TIERS.includes(e.tier as TierId) ? (e.tier as TierId) : 'free',
          isAdmin: e.is_admin === true,
          grant: e.grant ?? null,
        });
      });
    void load();
    // Grants can expire or change while a tab stays open.
    const timer = setInterval(() => void load(), 10 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, userId, refresh]);
  return null;
}
