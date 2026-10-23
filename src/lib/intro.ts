export type IntroMode = 'visit' | 'session' | 'every' | 'login' | 'off';

/** The default for everyone who has not chosen explicitly. */
export const DEFAULT_INTRO_MODE: IntroMode = 'visit';

export const INTRO_MODES: { id: IntroMode; label: string }[] = [
  { id: 'visit', label: 'Every new visit and after signing in (default)' },
  { id: 'every', label: 'Every page load, including reloads' },
  { id: 'session', label: 'Once per browser session' },
  { id: 'login', label: 'Only after I sign in' },
  { id: 'off', label: 'Never' },
];
const MODE_IDS = new Set<string>(INTRO_MODES.map((m) => m.id));

/** A visit starts again after this much inactivity, even in a tab that stayed open (phones keep tabs for days). */
export const VISIT_GAP_MS = 30 * 60_000;

/**
 * The mode in effect. `choice` is the user's explicit setting (null: none). `legacy` is the setting stored before
 * explicit choices were tracked; its old default "session" counts as no choice, so those users get the new default,
 * while an explicit "off", "every" or "login" is kept.
 */
export function resolveIntroMode(choice: unknown, legacy?: unknown): IntroMode {
  if (typeof choice === 'string' && MODE_IDS.has(choice)) return choice as IntroMode;
  if (typeof legacy === 'string' && legacy !== 'session' && MODE_IDS.has(legacy)) return legacy as IntroMode;
  return DEFAULT_INTRO_MODE;
}

/**
 * Whether this page load starts a new visit: the user arrived from outside the site (typed address, bookmark,
 * external link, new tab), or returns after `VISIT_GAP_MS` of inactivity. Reloads and back/forward navigation inside
 * an ongoing visit do not count; client-side route changes never reach this check.
 */
export function isFreshVisit(o: { navigationType: string | undefined; referrer: string; origin: string; lastSeen: number | null; now: number }): boolean {
  if (o.lastSeen === null || o.now - o.lastSeen > VISIT_GAP_MS) return true;
  if (o.navigationType !== 'navigate') return false;
  try {
    return !o.referrer || new URL(o.referrer).origin !== o.origin;
  } catch {
    return true;
  }
}

/**
 * Whether the brand intro plays on this page load. Never with reduced motion or on the social-card render route;
 * a manual replay always plays. "visit" plays on a fresh visit and after a sign-in, "session" once per browser
 * session, "every" on each full page load, "login" once after a fresh sign-in. Internal route changes never trigger
 * it (the caller decides only on load or sign-in).
 */
export function shouldPlayIntro(o: { mode: IntroMode; reducedMotion: boolean; path: string; shownThisSession: boolean; loginPending: boolean; replay: boolean; freshVisit?: boolean }): boolean {
  if (o.path.startsWith('/share/card')) return false;
  if (o.reducedMotion) return false;
  if (o.replay) return true;
  switch (o.mode) {
    case 'visit':
      return !!o.freshVisit || o.loginPending;
    case 'every':
      return true;
    case 'session':
      return !o.shownThisSession || o.loginPending;
    case 'login':
      return o.loginPending;
    default:
      return false;
  }
}
