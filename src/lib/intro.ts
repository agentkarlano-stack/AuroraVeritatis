/**
 * Introduction experience (IntroSplash.tsx). Three choices, kept in the synced `intro` preference:
 * - none: no introduction;
 * - brand: the AURORA VERITATIS → AV animation on each new visit and after an interactive sign-in;
 * - cinematic: the city montage followed by the brand animation on each new visit (brand only after sign-in).
 * Without an explicit choice (null) the first-ever visit on this device gets the cinematic intro and later visits the
 * brand intro. Nothing plays with reduced motion, on reloads or back/forward inside a visit, or on route changes.
 */
export type IntroExperience = 'none' | 'brand' | 'cinematic';
export type IntroPlay = 'none' | 'brand' | 'cinematic';

export const INTRO_EXPERIENCES: { id: IntroExperience; label: string; description: string }[] = [
  { id: 'none', label: 'No intro', description: 'The site opens immediately.' },
  { id: 'brand', label: 'Brand intro', description: 'The Aurora Veritatis name becomes the AV monogram, about 4 seconds, on each new visit and after you sign in.' },
  { id: 'cinematic', label: 'Cinematic intro', description: 'A short film of world cities, then the brand animation, on each new visit. Never on reloads or page changes.' },
];
const IDS = new Set<string>(INTRO_EXPERIENCES.map((m) => m.id));

/** Legacy intro modes (before October 2026): visit | session | every | login | off. */
export type LegacyIntroMode = 'visit' | 'session' | 'every' | 'login' | 'off';

/**
 * The explicit choice in effect, or null for the automatic default. Earlier settings carry over: an explicit "off"
 * stays off; "every page load" and "only after sign-in" become the brand intro; the old defaults ("visit", "session")
 * count as no choice.
 */
export function resolveIntroExperience(choice: unknown, legacyChoice?: unknown, legacyMode?: unknown): IntroExperience | null {
  if (typeof choice === 'string' && IDS.has(choice)) return choice as IntroExperience;
  for (const legacy of [legacyChoice, legacyMode]) {
    if (legacy === 'off') return 'none';
    if (legacy === 'every' || legacy === 'login') return 'brand';
  }
  return null;
}

/** A visit starts again after this much inactivity, even in a tab that stayed open (phones keep tabs for days). */
export const VISIT_GAP_MS = 30 * 60_000;

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

export type IntroTrigger = 'load' | 'return' | 'login' | 'preview-brand' | 'preview-cinematic';

/**
 * What plays. `load` is a page load (plays only on a fresh visit), `return` a tab coming back after the visit gap,
 * `login` an interactive sign-in, `preview-*` the Account page buttons. `cinematicSeen` is whether this device has
 * ever started the cinematic intro; `cinematicThisSession` whether it played in this browser session (a reload in the
 * same session never repeats it). `saveData` (browser data saver or a 2G connection) downgrades cinematic to brand.
 */
export function decideIntro(o: {
  pref: IntroExperience | null;
  trigger: IntroTrigger;
  freshVisit?: boolean;
  reducedMotion: boolean;
  path: string;
  cinematicSeen: boolean;
  cinematicThisSession: boolean;
  saveData?: boolean;
}): IntroPlay {
  if (o.path.startsWith('/share/card') || o.reducedMotion) return 'none';
  if (o.trigger === 'preview-brand') return 'brand';
  if (o.trigger === 'preview-cinematic') return o.saveData ? 'brand' : 'cinematic';
  if (o.pref === 'none') return 'none';
  if (o.trigger === 'login') return 'brand';
  if (o.trigger === 'load' && !o.freshVisit) return 'none';
  const wantsCinematic = o.pref === 'cinematic' || (o.pref === null && !o.cinematicSeen);
  return wantsCinematic && !o.cinematicThisSession && !o.saveData ? 'cinematic' : 'brand';
}

/** Brand animation length (keep in sync with the av2-* keyframes in index.css). */
export const BRAND_INTRO_MS = 4200;
/** If the film has not started playing by then (slow network, autoplay blocked), the brand intro plays instead. */
export const CINEMATIC_START_TIMEOUT_MS = 3500;

/** Cinematic edits in rotation (public/media/intro/*-<edit>.*): v1 London, New York, Tokyo; v2 Budapest, Moscow and more. */
export const FILM_EDITS = ['v1', 'v2'] as const;
export type FilmEdit = (typeof FILM_EDITS)[number];

/** The edit to play next: the one after the last played (stored per browser), starting with the first. */
export function nextFilmEdit(last: string | null): FilmEdit {
  const i = FILM_EDITS.indexOf(last as FilmEdit);
  return FILM_EDITS[(i + 1) % FILM_EDITS.length]!;
}
