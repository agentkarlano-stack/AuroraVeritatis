import { useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { SYSTEM_DETAIL, SYSTEM_LABEL, systemState } from '../lib/systemStatus';
import { useReadiness } from '../store/readiness';

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

const DOT: Record<string, string> = { loading: 'bg-warn av-load-dot', active: 'bg-up', limited: 'bg-warn', offline: 'bg-down' };

/** Small status beside the logo, driven by real readiness (not a timer and not the intro animation). */
export function SystemStatus() {
  const { status, config } = useAuth();
  const routeReady = useReadiness((s) => s.routeReady);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const state = systemState({ routeReady, authSettled: status !== 'loading', configOk: !!config, online });
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-dim" role="status" title={SYSTEM_DETAIL[state]} data-system-state={state}>
      <span key={state} className={`av-status-dot h-1.5 w-1.5 shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
      <span className="hidden md:inline">{SYSTEM_LABEL[state]}</span>
      <span className="sr-only md:hidden">{SYSTEM_LABEL[state]}</span>
      <span className="sr-only">. {SYSTEM_DETAIL[state]}</span>
    </span>
  );
}
