import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadConfig, type PublicConfig } from "./config";
import { SupabaseLite, type Session } from "./supabase";

export type AuthStatus = "loading" | "unconfigured" | "signed-out" | "signed-in";

export interface Profile {
  id: string;
  display_name: string | null;
  plan: "free" | "premium" | "prime" | "intelligence";
  created_at?: string;
}

interface AuthState {
  status: AuthStatus;
  config: PublicConfig | null;
  session: Session | null;
  profile: Profile | null;
  client: SupabaseLite | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  recover: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [client, setClient] = useState<SupabaseLite | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    loadConfig().then(async (cfg) => {
      if (cancelled) return;
      setConfig(cfg);
      if (!cfg.supabase) {
        setStatus("unconfigured");
        return;
      }
      const sb = new SupabaseLite(cfg.supabase.url, cfg.supabase.anonKey);
      setClient(sb);
      const restored = await sb.restore();
      if (cancelled) return;
      setSession(restored);
      setStatus(restored ? "signed-in" : "signed-out");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!client || !session) {
      setProfile(null);
      return;
    }
    client
      .select<Profile>("profiles", `id=eq.${session.user.id}&select=id,display_name,plan,created_at`, session)
      .then((rows) => setProfile(rows[0] ?? null))
      .catch(() => setProfile(null));
  }, [client, session]);

  const require = useCallback(() => {
    if (!client) throw new Error("Authentication is not configured for this environment.");
    return client;
  }, [client]);

  const signIn = useCallback(async (email: string, password: string) => {
    const s = await require().signIn(email, password);
    setSession(s);
    setStatus("signed-in");
  }, [require]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const { session: s } = await require().signUp(email, password, displayName);
    if (s) {
      setSession(s);
      setStatus("signed-in");
    }
    return { needsConfirmation: !s };
  }, [require]);

  const signOut = useCallback(async () => {
    await client?.signOut(session);
    setSession(null);
    setStatus(client ? "signed-out" : "unconfigured");
  }, [client, session]);

  const recover = useCallback(async (email: string) => {
    await require().recover(email, `${window.location.origin}/account`);
  }, [require]);

  const value = useMemo<AuthState>(
    () => ({ status, config, session, profile, client, signIn, signUp, signOut, recover }),
    [status, config, session, profile, client, signIn, signUp, signOut, recover],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
