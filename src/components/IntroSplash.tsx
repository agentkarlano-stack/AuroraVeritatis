import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { VISIT_GAP_MS, isFreshVisit, resolveIntroMode, shouldPlayIntro } from '../lib/intro';
import { usePrefs } from '../store/prefs';
import { Monogram } from './Logo';

const DURATION_MS = 2600;
const WORD = 'AURORA VERITATIS';
/** Indices of the initials that become the monogram: the A of AURORA and the V of VERITATIS. */
const INITIALS = [0, 7];
export const INTRO_SHOWN_KEY = 'av-intro-shown';
export const INTRO_LOGIN_KEY = 'av-intro-login';
export const INTRO_REPLAY_EVENT = 'av-intro-replay';

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
const LAST_SEEN_KEY = 'av-last-seen';
/** When the intro last started in this page (prevents a second play when a sign-in completes during the same load). */
let playedAt = 0;

/** Decided once per page load, before this load records itself as the latest activity. */
function freshVisit(): boolean {
  if (typeof window === 'undefined') return false;
  let lastSeen: number | null = null;
  try {
    const v = Number(localStorage.getItem(LAST_SEEN_KEY));
    lastSeen = Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    /* storage unavailable: treat as a new visit */
  }
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return isFreshVisit({ navigationType: nav?.type, referrer: document.referrer, origin: location.origin, lastSeen, now: Date.now() });
}
const FRESH_VISIT = freshVisit();
const touch = () => {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};

const read = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

/**
 * Brand intro: AURORA VERITATIS appears letter by letter; the other letters fall away while the A and the V glide
 * together and settle into the AV monogram. About 2.6 s, silent, skippable (button, Esc, click) and never shown with
 * reduced motion. When it plays is the user's choice (Account → Preferences): by default on every new visit and
 * after signing in; or every page load, once per session, only after signing in, or never. It is decided on page load and after a fresh sign-in, never on route changes.
 */
export function IntroSplash() {
  const mode = usePrefs((s) => resolveIntroMode(s.introChoice, s.introMode));
  const [visible, setVisible] = useState(() =>
    shouldPlayIntro({
      mode,
      freshVisit: FRESH_VISIT,
      reducedMotion: reducedMotion(),
      path: typeof location === 'undefined' ? '/' : location.pathname,
      shownThisSession: read(INTRO_SHOWN_KEY) === '1',
      loginPending: read(INTRO_LOGIN_KEY) === '1',
      replay: false,
    }),
  );

  // A fresh sign-in or a manual replay (Account → Preferences) can start it later in the session.
  useEffect(() => {
    const onLogin = () => {
      const s = usePrefs.getState();
      const play = shouldPlayIntro({ mode: resolveIntroMode(s.introChoice, s.introMode), reducedMotion: reducedMotion(), path: location.pathname, shownThisSession: true, loginPending: true, replay: false });
      // A sign-in completing during the same load (e.g. arriving from an email link) must not replay it.
      if (play && Date.now() - playedAt > 15_000) setVisible(true);
      else write(INTRO_LOGIN_KEY, null);
    };
    // Record activity. Coming back to a tab that was left in the background for longer than a visit gap is a new
    // visit: with the default mode the intro plays then.
    touch();
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        touch();
        return;
      }
      let last = 0;
      try {
        last = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
      } catch {
        /* ignore */
      }
      touch();
      const s = usePrefs.getState();
      if (last && Date.now() - last > VISIT_GAP_MS && resolveIntroMode(s.introChoice, s.introMode) === 'visit' && !reducedMotion() && !location.pathname.startsWith('/share/card')) setVisible(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', touch);
    const onReplay = () => !reducedMotion() && setVisible(true);
    window.addEventListener('av-intro-login', onLogin);
    window.addEventListener(INTRO_REPLAY_EVENT, onReplay);
    return () => {
      window.removeEventListener('av-intro-login', onLogin);
      window.removeEventListener(INTRO_REPLAY_EVENT, onReplay);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', touch);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    playedAt = Date.now();
    write(INTRO_SHOWN_KEY, '1');
    write(INTRO_LOGIN_KEY, null);
    const timer = setTimeout(() => setVisible(false), DURATION_MS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setVisible(false);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [visible]);

  if (!visible) return null;
  return <IntroStage onSkip={() => setVisible(false)} />;
}

function IntroStage({ onSkip }: { onSkip: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const mono = useRef<HTMLDivElement>(null);
  const letters = useRef<(HTMLSpanElement | null)[]>([]);

  // Measure where the A and V of the word must travel to land on the monogram's A and V (FLIP). Written straight to
  // CSS variables on the letters, so no re-render is needed; re-measured once the display font has loaded.
  useLayoutEffect(() => {
    const place = () => {
      const svg = mono.current?.querySelector('svg');
      const paths = svg?.querySelectorAll('path');
      if (!svg || !paths || paths.length < 2 || !stage.current) return;
      INITIALS.forEach((idx, k) => {
        const el = letters.current[idx];
        const target = paths[k]!.getBoundingClientRect();
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--dx', `${target.left + target.width / 2 - (r.left + r.width / 2)}px`);
        el.style.setProperty('--dy', `${target.top + target.height / 2 - (r.top + r.height / 2)}px`);
        el.style.setProperty('--s', `${Math.max(0.5, target.height / Math.max(1, r.height * 0.72))}`);
      });
    };
    place();
    void document.fonts?.ready.then(place);
  }, []);

  return (
    <div ref={stage} className="av2-intro fixed inset-0 z-[100] flex items-center justify-center bg-ink-950" onClick={onSkip} role="presentation">
      <div className="relative flex flex-col items-center" aria-hidden>
        <div ref={mono} className="av2-mono absolute left-1/2 top-1/2">
          <Monogram className="h-20 w-auto md:h-28" />
        </div>
        <div className="av2-word whitespace-nowrap font-display text-2xl font-bold tracking-[0.12em] text-platinum md:text-5xl">
          {WORD.split('').map((ch, i) => (
            <span
              key={i}
              ref={(el) => {
                letters.current[i] = el;
              }}
              className={`inline-block ${INITIALS.includes(i) ? 'av2-initial' : 'av2-rest'}`}
            >
              <span className="av2-letter inline-block" style={{ animationDelay: `${i * 32}ms` }}>
                {ch === ' ' ? '\u00a0' : ch}
              </span>
            </span>
          ))}
        </div>
        <div className="av2-line mt-5 h-px w-64 bg-gold/70 md:w-[28rem]" />
        <div className="av2-tag absolute left-1/2 top-full mt-14 whitespace-nowrap font-display text-[10px] font-medium tracking-[0.24em] text-gold md:mt-20 md:text-xs">
          GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT
        </div>
      </div>
      <button
        type="button"
        className="btn-quiet absolute bottom-6 right-6 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
        autoFocus
      >
        Skip intro
      </button>
    </div>
  );
}
