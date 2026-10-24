/**
 * Device and session management helpers (server side: supabase/migrations/20261024000000_sessions.sql).
 * Devices are described from the browser's user agent only: no fingerprinting, IP addresses or locations.
 */

/** "Chrome on Windows", "Safari on iPhone", … from a user agent string; "Unknown device" when it cannot tell. */
export function describeDevice(ua: string): string {
  const u = ua || '';
  const os = /iPhone/.test(u)
    ? 'iPhone'
    : /iPad/.test(u)
      ? 'iPad'
      : /Android/.test(u)
        ? 'Android'
        : /Windows/.test(u)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(u)
            ? 'macOS'
            : /CrOS/.test(u)
              ? 'ChromeOS'
              : /Linux/.test(u)
                ? 'Linux'
                : null;
  const browser = /Edg\//.test(u)
    ? 'Edge'
    : /OPR\/|Opera/.test(u)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(u)
        ? 'Firefox'
        : /SamsungBrowser/.test(u)
          ? 'Samsung Internet'
          : /Chrome\/|CriOS/.test(u)
            ? 'Chrome'
            : /Safari\//.test(u)
              ? 'Safari'
              : null;
  if (!os && !browser) return 'Unknown device';
  return browser && os ? `${browser} on ${os}` : (browser ?? os)!;
}

export interface SessionRow {
  id: string;
  created_at: string;
  last_active: string;
  user_agent: string;
  current: boolean;
}

/** Why this browser was signed out, in plain words (null: no explanation needed). */
export function signedOutMessage(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'ended_by_takeover':
      return 'You were signed out because your account was signed in on another device. Your plan allows one active device at a time; sign in again here to continue on this device.';
    case 'revoked':
      return 'This device was signed out from your account settings on another device.';
    case 'others_revoked':
      return 'This device was signed out when you chose "Sign out of other devices".';
    default:
      return reason ? 'This device was signed out. Sign in again to continue.' : null;
  }
}

/** True when the server functions are not installed yet (database update pending), so the UI can say so. */
export const isMissingFunction = (err: { code?: string; message?: string } | null | undefined) =>
  !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message ?? ''));
