/**
 * Lightweight Supabase client (Auth + PostgREST) over plain fetch.
 *
 * Implements the subset of Supabase Auth (GoTrue) and PostgREST endpoints
 * that the first release needs, with no SDK dependency. The interface is
 * intentionally small so it can be swapped for `@supabase/supabase-js`
 * later without touching UI code.
 */

import { readJson, removeKey, writeJson } from "./storage";

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
}

const SESSION_KEY = "av.auth.session";

export class SupabaseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class SupabaseLite {
  constructor(private readonly url: string, private readonly anonKey: string) {}

  private headers(token?: string): HeadersInit {
    return {
      apikey: this.anonKey,
      "content-type": "application/json",
      authorization: `Bearer ${token ?? this.anonKey}`,
    };
  }

  private async call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
    const res = await fetch(`${this.url}${path}`, { ...init, headers: { ...this.headers(init.token), ...(init.headers ?? {}) } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = body?.msg ?? body?.error_description ?? body?.message ?? body?.error ?? `Request failed (${res.status})`;
      throw new SupabaseError(String(msg), res.status);
    }
    return body as T;
  }

  // ---------- Auth ----------

  async signUp(email: string, password: string, displayName?: string): Promise<{ session: Session | null; user: AuthUser | null }> {
    const body = await this.call<Record<string, unknown>>("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: displayName ? { display_name: displayName } : {} }),
    });
    if (typeof body.access_token === "string") {
      const session = toSession(body);
      this.persist(session);
      return { session, user: session.user };
    }
    // Email confirmation enabled: user created, no session yet.
    return { session: null, user: (body.user as AuthUser) ?? (body as unknown as AuthUser) };
  }

  async signIn(email: string, password: string): Promise<Session> {
    const body = await this.call<Record<string, unknown>>("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const session = toSession(body);
    this.persist(session);
    return session;
  }

  async refresh(refreshToken: string): Promise<Session> {
    const body = await this.call<Record<string, unknown>>("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const session = toSession(body);
    this.persist(session);
    return session;
  }

  async recover(email: string, redirectTo?: string): Promise<void> {
    const qs = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    await this.call(`/auth/v1/recover${qs}`, { method: "POST", body: JSON.stringify({ email }) });
  }

  async signOut(session: Session | null): Promise<void> {
    try {
      if (session) await this.call("/auth/v1/logout", { method: "POST", token: session.access_token });
    } finally {
      removeKey(SESSION_KEY);
    }
  }

  /** Restore a stored session, refreshing it if it is close to expiry. */
  async restore(): Promise<Session | null> {
    const stored = readJson<Session | null>(SESSION_KEY, null);
    if (!stored) return null;
    const now = Math.floor(Date.now() / 1000);
    if (stored.expires_at - now > 60) return stored;
    try {
      return await this.refresh(stored.refresh_token);
    } catch {
      removeKey(SESSION_KEY);
      return null;
    }
  }

  private persist(session: Session): void {
    writeJson(SESSION_KEY, session);
  }

  // ---------- Data (PostgREST, protected by RLS) ----------

  async select<T>(table: string, query: string, session: Session): Promise<T[]> {
    return this.call<T[]>(`/rest/v1/${table}?${query}`, { token: session.access_token });
  }

  async upsert<T>(table: string, row: Record<string, unknown>, session: Session, onConflict?: string): Promise<T[]> {
    const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
    return this.call<T[]>(`/rest/v1/${table}${qs}`, {
      method: "POST",
      token: session.access_token,
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
  }
}

function toSession(body: Record<string, unknown>): Session {
  const expiresIn = Number(body.expires_in ?? 3600);
  return {
    access_token: String(body.access_token),
    refresh_token: String(body.refresh_token),
    expires_at: Number(body.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn),
    user: body.user as AuthUser,
  };
}
