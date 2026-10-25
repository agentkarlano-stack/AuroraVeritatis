import { usePrefs } from '../store/prefs';
import { useSaved } from '../store/saved';

export const LOCAL_UPDATED_KEY = 'av-prefs-updated-at';
/** Id of the account whose data this browser holds. Guest data (no owner) is merged into the first account that signs in. */
export const LOCAL_OWNER_KEY = 'av-prefs-owner';

export function readOwner(): string | null {
  try {
    return localStorage.getItem(LOCAL_OWNER_KEY);
  } catch {
    return null;
  }
}

/** Forget the local copy of an account's data (sign-out, or another account signing in on this browser). */
export function clearLocalAccountData() {
  usePrefs.getState().resetSynced();
  useSaved.getState().reset();
  try {
    localStorage.removeItem(LOCAL_UPDATED_KEY);
    localStorage.removeItem(LOCAL_OWNER_KEY);
  } catch {
    /* storage unavailable */
  }
}
