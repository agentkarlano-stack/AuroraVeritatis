import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { signedOutMessage } from '../lib/sessions';
import { refreshEntitlements } from '../store/entitlements';
import { useAuth } from './AuthProvider';

const CHECK_MS = 2 * 60_000;
const REASON_KEY = 'av-signed-out-reason';

/**
 * Keeps this browser's session honest with the server (lib/sessions.ts):
 * - after an interactive sign-in it claims the session (with the one-device rule on for paid plans, other devices are
 *   signed out; tabs of this browser share the session and are unaffected);
 * - every two minutes and when the tab becomes visible it asks whether the session is still active; if another device
 *   took over or revoked it, it signs out locally and explains why.
 * Quietly does nothing until the database update that adds these functions is applied.
 */
export function SessionGuard() {
  const { client, status } = useAuth();
  const [message, setMessage] = useState<string | null>(() => {
    try {
      return signedOutMessage(sessionStorage.getItem(REASON_KEY));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!client) return;
    const onLogin = () => {
      void client.rpc('claim_session').then(({ data }) => {
        if ((data as { revoked?: number } | null)?.revoked) refreshEntitlements();
      });
    };
    window.addEventListener('av-intro-login', onLogin);
    return () => window.removeEventListener('av-intro-login', onLogin);
  }, [client]);

  useEffect(() => {
    if (!client || status !== 'signed-in') return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data, error } = await client.rpc('session_status');
      if (stopped || error || !data) return;
      const st = data as { active: boolean; reason: string | null };
      if (st.active) return;
      const text = signedOutMessage(st.reason ?? 'unknown');
      try {
        sessionStorage.setItem(REASON_KEY, st.reason ?? 'unknown');
      } catch {
        /* storage unavailable */
      }
      setMessage(text);
      await client.auth.signOut({ scope: 'local' });
    };
    void check();
    const t = setInterval(() => void check(), CHECK_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [client, status]);

  if (!message) return null;
  return (
    <div role="alert" className="fixed inset-x-2 top-2 z-[95] mx-auto max-w-xl rounded-lg border border-warn/50 bg-ink-900/97 p-3 text-sm text-platinum shadow-2xl">
      <div className="flex items-start gap-3">
        <p className="flex-1">{message}</p>
        <button
          className="btn-quiet tap -mr-1"
          aria-label="Dismiss"
          onClick={() => {
            setMessage(null);
            try {
              sessionStorage.removeItem(REASON_KEY);
            } catch {
              /* storage unavailable */
            }
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
