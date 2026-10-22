import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicConfig } from '../../shared/types';
import { getJson } from '../lib/api';
import { friendlyLinkError } from './linkErrors';

type AuthStatus = 'loading' | 'unconfigured' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  config: PublicConfig | null;
  /** Supabase client when accounts are configured (used for data sync), otherwise null. */
  client: SupabaseClient | null;
  sendMagicLink: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** True after arriving from a password-recovery email link, until a new password is set. */
  recovery: boolean;
  /** Error reported by Supabase in the redirect URL (expired link, etc.), if any. */
  urlError: string | null;
}

/** Supabase reports redirect errors as `error_description` in the hash or query string. */
function readUrlError(): string | null {
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
  const msg = params.get('error_description');
  return msg ? friendlyLinkError(msg.replace(/\+/g, ' ').slice(0, 200)) : null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Supabase auth wiring. Public Supabase settings are read at runtime from /api/config
 * (Cloudflare Worker vars) so no rebuild is needed to enable auth. When they are
 * absent the app runs in guest mode and auth controls are shown as unavailable.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [recovery, setRecovery] = useState(false);
  const [urlError, setUrlError] = useState(readUrlError);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getJson<PublicConfig>('/api/config');
        if (cancelled) return;
        setConfig(cfg);
        if (!cfg.supabase) {
          setStatus('unconfigured');
          return;
        }
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(cfg.supabase.url, cfg.supabase.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
        });
        if (cancelled) return;
        setClient(sb);
        // A PKCE link opened in a different browser from the one that requested it cannot sign in there.
        const init = await sb.auth.initialize();
        if (init.error && !cancelled) setUrlError(friendlyLinkError(init.error.message));
        const { data } = await sb.auth.getSession();
        setSession(data.session);
        setStatus(data.session ? 'signed-in' : 'signed-out');
        const sub = sb.auth.onAuthStateChange((event, s) => {
          if (event === 'PASSWORD_RECOVERY') setRecovery(true);
          setSession(s);
          setStatus(s ? 'signed-in' : 'signed-out');
        });
        unsub = () => sub.data.subscription.unsubscribe();
      } catch {
        if (!cancelled) setStatus('unconfigured');
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const require = useCallback(() => {
    if (!client) throw new Error('Accounts are not enabled yet.');
    return client;
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      config,
      client,
      sendMagicLink: async (email) => {
        const { error } = await require().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/account` } });
        if (error) throw error;
      },
      signInWithPassword: async (email, password) => {
        const { error } = await require().auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email, password) => {
        const { error } = await require().auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/account` } });
        if (error) throw error;
      },
      signOut: async () => {
        await require().auth.signOut();
      },
      requestPasswordReset: async (email) => {
        const { error } = await require().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/account` });
        if (error) throw error;
      },
      updatePassword: async (password) => {
        const { error } = await require().auth.updateUser({ password });
        if (error) throw error;
        setRecovery(false);
      },
      recovery,
      urlError,
    }),
    [status, session, config, client, require, recovery, urlError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
