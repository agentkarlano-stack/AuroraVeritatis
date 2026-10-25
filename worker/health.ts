/**
 * Integration health: which provider credentials are present (names only, never values) and a minimal authenticated
 * test per provider. Tests use free endpoints or a single small request, run at most once per deployment (the route
 * caches the result) and never return provider data, only a status, plan/quota facts and a redacted error.
 *
 * Status ladder (owner directive 2026-10-24): CONNECTED (credential present, provider reachable) → TESTED (authenticated
 * test passed) → LICENSED (commercial display allowed) → LIVE (enabled for users). PENDING: credential not supplied yet.
 * BLOCKED: test failed, or display needs a licence that Aurora does not have.
 */
export type HealthStatus = 'CONNECTED' | 'TESTED' | 'LICENSED' | 'LIVE' | 'PENDING' | 'BLOCKED';

export interface ProviderHealth {
  id: string;
  name: string;
  /** Names of the Worker secrets found for this provider (never their values). */
  secrets: string[];
  status: HealthStatus;
  /** Authenticated test result: true passed, false failed, null not run (no credential or no safe test). */
  authenticated: boolean | null;
  /** Short facts from the test (plan, quota, latency); never provider content. */
  facts: Record<string, string | number | boolean | null>;
  licence: string;
  ownerAction: string | null;
  error?: string;
  checkedAt: string;
}

type Env = Record<string, unknown>;

/** Worker secrets whose name matches the pattern (string values only). */
export function secretNames(env: Env, pattern: RegExp): string[] {
  return Object.keys(env)
    .filter((k) => /^[A-Z][A-Z0-9_]*$/.test(k) && pattern.test(k) && typeof env[k] === 'string' && (env[k] as string).length > 0)
    .sort();
}
const first = (env: Env, pattern: RegExp) => {
  const n = secretNames(env, pattern)[0];
  return n ? (env[n] as string) : undefined;
};

/** Removes every secret value of the environment from a message. */
export function scrub(text: string, env: Env): string {
  let out = text;
  for (const v of Object.values(env)) if (typeof v === 'string' && v.length >= 8) out = out.split(v).join('[redacted]');
  return out.slice(0, 160);
}

export const PATTERNS = {
  openai: /^OPENAI_API_KEY$/,
  elevenlabs: /ELEVEN|^XI_API_KEY$/,
  gnews: /GNEWS/,
  aisstream: /AIS_?STREAM/,
  openskyId: /OPEN_?SKY.*(ID|USER(NAME)?)$/,
  openskySecret: /OPEN_?SKY.*(SECRET|PASS(WORD)?)$/,
  cesium: /CESIUM|^ION_/,
  fmp: /^FMP|FINANCIAL_?MODELING/,
  eia: /^EIA/,
  ucdp: /UCDP/,
} as const;

interface Probe {
  id: string;
  name: string;
  pattern: RegExp;
  licence: string;
  /** Display licensed for users (only then can the status reach LICENSED/LIVE). */
  licensed: boolean;
  live?: boolean;
  /** Worker variable that records the owner's licence confirmation; when set, a passing test means LIVE. */
  licensedVar?: [string, string];
  pendingAction?: string;
  blockedAction?: string;
  test?: (env: Env, f: typeof fetch) => Promise<Record<string, string | number | boolean | null>>;
}

const T = (ms: number) => AbortSignal.timeout(ms);
async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`${what} answered ${res.status}`);
  return res;
}

export const PROBES: Probe[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    pattern: PATTERNS.openai,
    licence: 'Own AI answers; users see generated text with citations',
    licensed: true,
    test: async (env, f) => {
      const res = await ok(await f('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${first(env, PATTERNS.openai)}` }, signal: T(8000) }), 'OpenAI');
      const j = (await res.json()) as { data?: unknown[] };
      return { models: j.data?.length ?? 0, cost: 'free (model list)' };
    },
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    pattern: PATTERNS.elevenlabs,
    licence: 'Paid plan: narration of Aurora text may be published',
    licensed: true,
    test: async (env, f) => {
      const res = await ok(await f('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': first(env, PATTERNS.elevenlabs)! }, signal: T(8000) }), 'ElevenLabs');
      const j = (await res.json()) as { tier?: string; character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
      return { plan: j.tier ?? null, charactersUsed: j.character_count ?? null, characterLimit: j.character_limit ?? null, cost: 'free (account endpoint)' };
    },
  },
  {
    id: 'gnews',
    name: 'GNews',
    pattern: PATTERNS.gnews,
    licence: 'Headlines and links with attribution; commercial use depends on the GNews plan',
    licensed: false,
    licensedVar: ['GNEWS_DISPLAY', 'licensed'],
    blockedAction: 'Confirm the GNews plan allows commercial display (free plan: development only), then set the Worker variable GNEWS_DISPLAY=licensed',
    test: async (env, f) => {
      const u = `https://gnews.io/api/v4/top-headlines?max=1&lang=en&apikey=${encodeURIComponent(first(env, PATTERNS.gnews)!)}`;
      const res = await ok(await f(u, { signal: T(10000) }), 'GNews');
      const j = (await res.json()) as { totalArticles?: number; articles?: unknown[] };
      return { articlesReturned: j.articles?.length ?? 0, cost: '1 request of the daily quota' };
    },
  },
  {
    id: 'opensky',
    name: 'OpenSky Network',
    pattern: PATTERNS.openskyId,
    licence: 'Aircraft positions may not be redistributed publicly without OpenSky permission',
    licensed: false,
    blockedAction: 'Ask OpenSky for commercial display permission before any public aircraft layer',
    test: async (env, f) => {
      const id = first(env, PATTERNS.openskyId);
      const secret = first(env, PATTERNS.openskySecret);
      if (!secret) throw new Error('client secret missing (only the client id is set)');
      const t = await openskyToken(id!, secret, f);
      return { tokenExpiresInSeconds: t.expiresIn, cost: 'free (token only)' };
    },
  },
  {
    id: 'aisstream',
    name: 'AISStream',
    pattern: PATTERNS.aisstream,
    licence: 'Vessel positions: public display only after the terms are confirmed',
    licensed: false,
    blockedAction: 'Confirm AISStream terms for public commercial display',
    test: async (env, f) => aisProbe(first(env, PATTERNS.aisstream)!, f),
  },
  {
    id: 'cesium',
    name: 'Cesium',
    pattern: PATTERNS.cesium,
    licence: 'CesiumJS is Apache-2.0; Cesium ion tiles need an ion plan (not purchased)',
    licensed: true,
    test: async (env, f) => {
      const res = await ok(await f('https://api.cesium.com/v1/me', { headers: { Authorization: `Bearer ${first(env, PATTERNS.cesium)}` }, signal: T(8000) }), 'Cesium ion');
      const j = (await res.json()) as { subscription?: string };
      return { plan: j.subscription ?? null, cost: 'free (account endpoint)' };
    },
  },
  {
    id: 'fmp',
    name: 'Financial Modeling Prep',
    pattern: PATTERNS.fmp,
    licence: 'No public display until a Data Display and Licensing Agreement exists',
    licensed: false,
    blockedAction: 'FMP Data Display and Licensing Agreement (only if public display is wanted)',
    test: async (env, f) => {
      const u = `https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=${encodeURIComponent(first(env, PATTERNS.fmp)!)}`;
      const res = await ok(await f(u, { signal: T(10000) }), 'FMP');
      const j = (await res.json()) as unknown;
      const rows = Array.isArray(j) ? j.length : 0;
      if (!rows) throw new Error('FMP returned no profile (plan or key restriction)');
      return { profileFields: Object.keys((j as Record<string, unknown>[])[0]!).length, cost: '1 request of the daily quota' };
    },
  },
  {
    id: 'eia',
    name: 'EIA',
    pattern: PATTERNS.eia,
    licence: 'US government data, public domain',
    licensed: true,
    pendingAction: 'Waiting for the EIA key (requested by the owner)',
    test: async (env, f) => {
      const res = await ok(await f(`https://api.eia.gov/v2/?api_key=${encodeURIComponent(first(env, PATTERNS.eia)!)}`, { signal: T(10000) }), 'EIA');
      await res.text();
      return { cost: 'free' };
    },
  },
  {
    id: 'ucdp',
    name: 'UCDP',
    pattern: PATTERNS.ucdp,
    licence: 'CC BY 4.0 with citation',
    licensed: true,
    pendingAction: 'Waiting for the UCDP token (requested by the owner)',
    test: async (env, f) => {
      const res = await ok(await f('https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=1', { headers: { 'x-ucdp-access-token': first(env, PATTERNS.ucdp)! }, signal: T(10000) }), 'UCDP');
      await res.text();
      return { cost: 'free' };
    },
  },
];

/** OpenSky OAuth2 client-credentials token (official flow). The caller caches it until shortly before expiry. */
export async function openskyToken(clientId: string, secret: string, f: typeof fetch): Promise<{ token: string; expiresIn: number }> {
  const res = await f('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret }),
    // OpenSky's identity server can be slow from cloud networks.
    signal: T(25000),
  });
  if (!res.ok) throw new Error(`OpenSky token endpoint answered ${res.status}`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('OpenSky returned no token');
  return { token: j.access_token, expiresIn: j.expires_in ?? 0 };
}

/**
 * AISStream: opens the WebSocket from the Worker (never from a browser), subscribes to one small box (Strait of Dover)
 * and closes after the first message or 8 seconds. Returns whether a position arrived; no vessel data is kept.
 */
export async function aisProbe(key: string, f: typeof fetch): Promise<Record<string, string | number | boolean | null>> {
  const res = await f('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket' } });
  const ws = (res as Response & { webSocket?: WebSocket | null }).webSocket;
  if (!ws) throw new Error(`AISStream did not open a WebSocket (${res.status})`);
  (ws as WebSocket & { accept(): void }).accept();
  const started = Date.now();
  return await new Promise((resolve, reject) => {
    const done = (v: Record<string, string | number | boolean | null> | Error) => {
      clearTimeout(timer);
      try {
        ws.close(1000, 'probe done');
      } catch {
        /* already closed */
      }
      if (v instanceof Error) reject(v);
      else resolve(v);
    };
    const timer = setTimeout(() => done({ messageReceived: false, waitedMs: Date.now() - started, cost: 'free' }), 8000);
    ws.addEventListener('message', (ev: MessageEvent) => {
      const text = typeof ev.data === 'string' ? ev.data : '';
      if (/error/i.test(text.slice(0, 200)) && !/MessageType/.test(text.slice(0, 200))) done(new Error('AISStream rejected the subscription'));
      else done({ messageReceived: true, firstMessageMs: Date.now() - started, cost: 'free' });
    });
    ws.addEventListener('close', (ev: CloseEvent) => done(new Error(`AISStream closed the connection (${ev.code})`)));
    ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[50.8, 1.2], [51.2, 1.8]]], FilterMessageTypes: ['PositionReport'] }));
  });
}

/** Runs every probe (in parallel, each with its own timeout) and returns one row per provider. */
export async function integrationHealth(env: Env, f: typeof fetch = fetch, now = () => new Date()): Promise<ProviderHealth[]> {
  return Promise.all(
    PROBES.map(async (p): Promise<ProviderHealth> => {
      const secrets = secretNames(env, p.pattern).concat(p.id === 'opensky' ? secretNames(env, PATTERNS.openskySecret) : []);
      const base = { id: p.id, name: p.name, secrets: [...new Set(secrets)], licence: p.licence, checkedAt: now().toISOString() };
      if (!secretNames(env, p.pattern).length) {
        const near = p.id === 'opensky' ? secretNames(env, /OPEN_?SKY/) : [];
        return {
          ...base,
          secrets: near,
          status: 'PENDING',
          authenticated: null,
          facts: {},
          ownerAction:
            p.pendingAction ??
            (near.length
              ? `Found ${near.join(', ')}, but not both a client id and a client secret (expected names like OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET)`
              : `No ${p.name} secret on the Worker. Add it in Cloudflare → Workers → auroraveritatis → Settings → Variables and secrets`),
        };
      }
      if (!p.test) return { ...base, status: 'CONNECTED', authenticated: null, facts: {}, ownerAction: null };
      try {
        const facts = await p.test(env, f);
        const licensedByOwner = p.licensedVar ? env[p.licensedVar[0]] === p.licensedVar[1] : false;
        const status: HealthStatus = licensedByOwner ? 'LIVE' : !p.licensed ? 'BLOCKED' : p.live ? 'LIVE' : 'TESTED';
        return { ...base, status, authenticated: true, facts, ownerAction: p.licensed || licensedByOwner ? null : (p.blockedAction ?? null) };
      } catch (e) {
        return { ...base, status: 'BLOCKED', authenticated: false, facts: {}, ownerAction: 'Check the key and the plan in the provider account', error: scrub((e as Error).message, env) };
      }
    }),
  );
}

/**
 * Public summary: provider, secret names, status, whether authentication passed and, when it failed, the short reason
 * (already scrubbed of every secret value, e.g. "token endpoint answered 401"). No facts.
 */
export function publicSummary(rows: ProviderHealth[]) {
  return rows.map((r) => ({ id: r.id, status: r.status, authenticated: r.authenticated, secrets: r.secrets, ...(r.error ? { reason: r.error } : {}) }));
}
