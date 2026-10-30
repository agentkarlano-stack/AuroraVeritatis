/**
 * The status beside the logo (master plan 24B): "System Loading" while the interface is not yet usable, "System
 * Active" once the first page has rendered and the account/configuration check has finished. It describes the
 * application only, never whether every data feed is live. Optional background feeds do not hold it in Loading.
 */
export type SystemState = 'loading' | 'active' | 'limited' | 'offline';

export interface SystemInputs {
  /** The first route's content has rendered (its lazy chunk loaded). */
  routeReady: boolean;
  /** The public configuration and session check finished (successfully or not). */
  authSettled: boolean;
  /** /api/config answered. */
  configOk: boolean;
  online: boolean;
}

export function systemState(i: SystemInputs): SystemState {
  if (!i.online) return 'offline';
  if (!i.routeReady || !i.authSettled) return 'loading';
  return i.configOk ? 'active' : 'limited';
}

export const SYSTEM_LABEL: Record<SystemState, string> = {
  loading: 'System Loading',
  active: 'System Active',
  limited: 'System Limited',
  offline: 'Offline',
};

/** Shown on hover/focus and to screen readers: what the state means and what it does not claim. */
export const SYSTEM_DETAIL: Record<SystemState, string> = {
  loading: 'The interface is still loading.',
  active: 'The interface is ready. Each data feed shows its own freshness.',
  limited: 'The interface works, but the configuration service did not answer: sign-in and some features are unavailable.',
  offline: 'This device is offline. Pages already loaded still work; new data cannot be fetched.',
};
