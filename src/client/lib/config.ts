export interface PublicConfig {
  env: string;
  supabase: { url: string; anonKey: string } | null;
  features: {
    auth: boolean;
    liveEvents: boolean;
    liveMarkets: boolean;
    aiAgents: boolean;
    subscriptions: boolean;
  };
}

export const OFFLINE_CONFIG: PublicConfig = {
  env: "unknown",
  supabase: null,
  features: { auth: false, liveEvents: false, liveMarkets: false, aiAgents: false, subscriptions: false },
};

let pending: Promise<PublicConfig> | null = null;

/** Runtime config served by the Worker (public values only — never secrets). */
export function loadConfig(): Promise<PublicConfig> {
  pending ??= fetch("/api/config", { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? (r.json() as Promise<PublicConfig>) : OFFLINE_CONFIG))
    .catch(() => OFFLINE_CONFIG);
  return pending;
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}
