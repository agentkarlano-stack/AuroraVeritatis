const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export function json(body: unknown, init: ResponseInit & { maxAge?: number } = {}): Response {
  const { maxAge, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', maxAge ? `public, max-age=${Math.min(maxAge, 3600)}, s-maxage=${maxAge}` : 'no-store');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(JSON.stringify(body), { ...rest, headers });
}

export function error(status: number, message: string, detail?: string): Response {
  return json(detail ? { error: message, detail } : { error: message }, { status });
}

/** Fetch JSON from an upstream provider with a timeout. Throws on non-2xx. */
export async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'AuroraVeritatis/0.1 (+https://aurorav.app)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Upstream ${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}
