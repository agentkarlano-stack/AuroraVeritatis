/**
 * Optional country landmark backgrounds for the profile (directive §3). Pure helpers: which countries have photos, what
 * to suggest, how to credit a photo. The choice is stored in the synced `prefs.profileBackground`; nothing is inferred
 * from the user's location, and a manual choice is never replaced by a suggestion.
 */
import { LANDMARKS, type Landmark } from '../data/landmarks';

export interface ProfileBackground {
  landmark: string;
}

const BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]));

export function landmarkById(id: string | undefined | null): Landmark | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The stored choice if it still names a shipped photo, otherwise none (neutral background). */
export function normalizeBackground(raw: unknown): ProfileBackground | null {
  const id = raw && typeof raw === 'object' ? (raw as { landmark?: unknown }).landmark : undefined;
  return typeof id === 'string' && BY_ID.has(id) ? { landmark: id } : null;
}

export const landmarksFor = (iso3: string) => LANDMARKS.filter((l) => l.country === iso3);

/** ISO3 codes that have at least one photo, in catalogue order. */
export const COUNTRIES_WITH_LANDMARKS = [...new Set(LANDMARKS.map((l) => l.country))];

/**
 * Country to suggest when nothing is chosen yet: the country most recently opened in Aurora's research (dossier), if it
 * has photos. Returns null otherwise; never overrides an existing choice.
 */
export function suggestCountry(current: ProfileBackground | null, lastCountry: string | null | undefined): string | null {
  if (current || !lastCountry) return null;
  return COUNTRIES_WITH_LANDMARKS.includes(lastCountry) ? lastCountry : null;
}

/** Attribution text: author, licence, source, and that the copy was resized (required by CC BY and CC BY-SA). */
export function credit(l: Landmark): string {
  const lic = l.license === 'Public domain' || l.license === 'CC0' ? l.license : `${l.license}, resized`;
  return `Photo: ${l.author} (${lic}), via Wikimedia Commons`;
}

export const landmarkSrc = (l: Landmark, w: 320 | 640 | 1280) => `/media/landmarks/${l.id}-${w}.webp`;
