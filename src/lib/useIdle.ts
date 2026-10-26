import { useEffect, useRef } from 'react';

/** Inactivity before Comfort Mode starts: a documented five-minute default (not a user setting). */
export const IDLE_MS = 5 * 60_000;

/** True while the user is typing, a dialog is open, the page is hidden or something is in full screen. */
export function idleBlocked(doc: Document = document): boolean {
  if (doc.hidden || doc.fullscreenElement) return true;
  const a = doc.activeElement as HTMLElement | null;
  if (a && (a.matches('input, textarea, select') || a.isContentEditable)) return true;
  return !!doc.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]');
}

/**
 * Calls `onIdle` after `ms` without input, while `enabled`. Any input restarts the wait; when the moment comes but
 * entry is blocked (typing, dialog, presentation), the wait starts again. Re-enabling restarts the timer, so the tour
 * does not return straight after the user leaves it.
 */
export function useIdle(enabled: boolean, onIdle: () => void, ms = IDLE_MS) {
  const cb = useRef(onIdle);
  useEffect(() => {
    cb.current = onIdle;
  }, [onIdle]);
  useEffect(() => {
    if (!enabled) return;
    let t = 0;
    const arm = () => {
      clearTimeout(t);
      t = window.setTimeout(() => (idleBlocked() ? arm() : cb.current()), ms);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, arm, { passive: true, capture: true });
    arm();
    return () => {
      clearTimeout(t);
      for (const e of events) window.removeEventListener(e, arm, { capture: true });
    };
  }, [enabled, ms]);
}
