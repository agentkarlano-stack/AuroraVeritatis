export type IntroMode = 'session' | 'every' | 'login' | 'off';

export const INTRO_MODES: { id: IntroMode; label: string }[] = [
  { id: 'session', label: 'Once per browser session' },
  { id: 'every', label: 'Every time I open the site' },
  { id: 'login', label: 'Only after I sign in' },
  { id: 'off', label: 'Never' },
];

/**
 * Whether the brand intro plays on this page load. Never with reduced motion or on the social-card render route;
 * a manual replay always plays. "session" plays once per browser session, "every" on each full page load, "login"
 * once after a fresh sign-in. Internal route changes never trigger it (the caller decides only on load or sign-in).
 */
export function shouldPlayIntro(o: { mode: IntroMode; reducedMotion: boolean; path: string; shownThisSession: boolean; loginPending: boolean; replay: boolean }): boolean {
  if (o.path.startsWith('/share/card')) return false;
  if (o.reducedMotion) return false;
  if (o.replay) return true;
  switch (o.mode) {
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
