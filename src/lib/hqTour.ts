/**
 * Headquarters auto tour: which events it presents and when it may move on. Pure logic, no timers.
 * - Only real, sourced events (never simulated scenarios); significant first (severity, then recency), within the
 *   last `maxAgeHours`; at most `limit`.
 * - Any deliberate interaction pauses the tour; it resumes after `idleMs` without interaction unless the user paused it
 *   explicitly or switched it off. Idle time never overrides an explicit pause.
 */
import type { GeoEvent } from '../../shared/types';

export function tourEvents(events: GeoEvent[], now: number, maxAgeHours = 72, limit = 12): GeoEvent[] {
  const seen = new Set<string>();
  return events
    .filter((e) => e.provenance !== 'simulated' && e.severity >= 3 && now - Date.parse(e.time) <= maxAgeHours * 3_600_000 && Date.parse(e.time) <= now + 60_000)
    .sort((a, b) => b.severity - a.severity || Date.parse(b.time) - Date.parse(a.time))
    .filter((e) => {
      // One stop per place and title: repeated alerts for the same event are shown once.
      const key = `${e.title.toLowerCase()}|${Math.round(e.lat)}|${Math.round(e.lon)}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .slice(0, limit);
}

export interface TourState {
  /** Auto tour switched on (saved preference). */
  enabled: boolean;
  /** Paused by the user's explicit Pause button: only Resume restarts it. */
  pausedByUser: boolean;
  /** Last deliberate interaction (epoch ms), or 0. */
  lastInteraction: number;
  index: number;
}

/** Whether the tour is running at `now`. */
export function tourRunning(s: TourState, now: number, idleMs: number): boolean {
  return s.enabled && !s.pausedByUser && now - s.lastInteraction >= idleMs;
}

/** Milliseconds until the tour resumes after an interaction (0 when running or never resuming). */
export function resumesIn(s: TourState, now: number, idleMs: number): number {
  if (!s.enabled || s.pausedByUser) return 0;
  return Math.max(0, s.lastInteraction + idleMs - now);
}

export const step = (index: number, delta: number, length: number) => (length ? (((index + delta) % length) + length) % length : 0);

/** Regional indicator flag emoji for an ISO 3166-1 alpha-2 code ("" when invalid). */
export function flagEmoji(iso2: string): string {
  return /^[A-Z]{2}$/.test(iso2) ? String.fromCodePoint(...[...iso2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';
}

/** "12 min ago", "3 h ago", "2 days ago". */
export function age(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
