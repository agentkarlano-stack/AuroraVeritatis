import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { readJson, writeJson } from "./storage";

/** Headquarters layout and watchlists. Stored locally; synced to Supabase when signed in. */

export const WIDGET_IDS = ["briefing", "watchlist", "radar", "markets", "chokepoints", "status"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface HqPrefs {
  version: 1;
  order: WidgetId[];
  hidden: WidgetId[];
  watchCountries: string[];
  agent: "EVE" | "KNOX";
}

export const DEFAULT_PREFS: HqPrefs = {
  version: 1,
  order: [...WIDGET_IDS],
  hidden: [],
  watchCountries: ["USA", "CHN", "DEU", "SAU", "UKR"],
  agent: "EVE",
};

const KEY = "av.hq.prefs";

export function normalisePrefs(input: Partial<HqPrefs> | null | undefined): HqPrefs {
  const p = { ...DEFAULT_PREFS, ...(input ?? {}) };
  const known = new Set<string>(WIDGET_IDS);
  const order = p.order.filter((id) => known.has(id));
  WIDGET_IDS.forEach((id) => !order.includes(id) && order.push(id));
  return {
    version: 1,
    order,
    hidden: p.hidden.filter((id) => known.has(id)),
    watchCountries: Array.from(new Set(p.watchCountries.map((c) => c.toUpperCase()))).slice(0, 25),
    agent: p.agent === "KNOX" ? "KNOX" : "EVE",
  };
}

export type SyncState = "local" | "syncing" | "synced" | "error";

interface PrefsApi {
  prefs: HqPrefs;
  update: (fn: (p: HqPrefs) => HqPrefs) => void;
  sync: SyncState;
}

const PrefsContext = createContext<PrefsApi | null>(null);

export function HqPrefsProvider({ children }: { children: ReactNode }) {
  const api = usePrefsState();
  return <PrefsContext.Provider value={api}>{children}</PrefsContext.Provider>;
}

export function useHqPrefs(): PrefsApi {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("useHqPrefs must be used inside HqPrefsProvider");
  return ctx;
}

function usePrefsState(): PrefsApi {
  const { client, session } = useAuth();
  const [prefs, setPrefs] = useState<HqPrefs>(() => normalisePrefs(readJson<Partial<HqPrefs>>(KEY, DEFAULT_PREFS)));
  const [sync, setSync] = useState<SyncState>("local");
  const loadedRemote = useRef(false);

  // Pull remote preferences once after sign-in.
  useEffect(() => {
    loadedRemote.current = false;
    if (!client || !session) {
      setSync("local");
      return;
    }
    setSync("syncing");
    client
      .select<{ hq: Partial<HqPrefs> }>("user_preferences", `user_id=eq.${session.user.id}&select=hq`, session)
      .then((rows) => {
        if (rows[0]?.hq) {
          const remote = normalisePrefs(rows[0].hq);
          setPrefs(remote);
          writeJson(KEY, remote);
        }
        loadedRemote.current = true;
        setSync("synced");
      })
      .catch(() => setSync("error"));
  }, [client, session]);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const update = useCallback(
    (fn: (p: HqPrefs) => HqPrefs) => {
      const next = normalisePrefs(fn(prefsRef.current));
      prefsRef.current = next;
      setPrefs(next);
      writeJson(KEY, next);
      if (client && session && loadedRemote.current) {
        setSync("syncing");
        client
          .upsert("user_preferences", { user_id: session.user.id, hq: next }, session, "user_id")
          .then(() => setSync("synced"))
          .catch(() => setSync("error"));
      }
    },
    [client, session],
  );

  return useMemo(() => ({ prefs, update, sync }), [prefs, update, sync]);
}
