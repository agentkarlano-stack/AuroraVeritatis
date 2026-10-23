import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BRAND_INTRO_MS, CINEMATIC_START_TIMEOUT_MS, VISIT_GAP_MS, decideIntro, isFreshVisit, resolveIntroExperience, type IntroPlay, type IntroTrigger } from '../lib/intro';
import { usePrefs } from '../store/prefs';
import { Monogram } from './Logo';

const WORD = 'AURORA VERITATIS';
/** Indices of the initials that become the monogram: the A of AURORA and the V of VERITATIS. */
const INITIALS = [0, 7];
export const INTRO_SHOWN_KEY = 'av-intro-shown';
export const INTRO_LOGIN_KEY = 'av-intro-login';
/** Dispatch with `detail: 'brand' | 'cinematic'` to preview an intro (Account → Introduction). */
export const INTRO_REPLAY_EVENT = 'av-intro-replay';
/** Set once this device has started the cinematic intro (the automatic default then switches to the brand intro). */
const CINEMATIC_SEEN_KEY = 'av-cinematic-seen';
/** Set when the cinematic intro played in this browser session (a reload never repeats it). */
const CINEMATIC_SESSION_KEY = 'av-cinematic-session';
const LAST_SEEN_KEY = 'av-last-seen';

/** Film variants in public/media/intro (see docs/INTRO.md for the edit, sources and licences). */
const film = (name: string) => ({ webm: `/media/intro/${name}-v1.webm`, mp4: `/media/intro/${name}-v1.mp4`, poster: `/media/intro/${name}-v1.jpg` });
const FILM = { large: film('aurora-intro-1920'), landscape: film('aurora-intro-1280'), portrait: film('aurora-intro-720x1280') };
/** Portrait screens get the vertical edit; large landscape screens the 1080p file; everything else 720p. */
function pickFilm() {
  if (window.innerHeight > window.innerWidth * 1.1) return FILM.portrait;
  return window.innerWidth * (window.devicePixelRatio || 1) > 1600 ? FILM.large : FILM.landscape;
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
function saveData() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === '2g' || c.effectiveType === 'slow-2g');
}
const local = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};
const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};
/** When an intro last started in this page (a sign-in completing during the same load must not replay it). */
let playedAt = 0;

/** Decided once per page load, before this load records itself as the latest activity. */
function freshVisit(): boolean {
  if (typeof window === 'undefined') return false;
  const v = Number(local.get(LAST_SEEN_KEY));
  const lastSeen = Number.isFinite(v) && v > 0 ? v : null;
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return isFreshVisit({ navigationType: nav?.type, referrer: document.referrer, origin: location.origin, lastSeen, now: Date.now() });
}
const FRESH_VISIT = freshVisit();
const touch = () => local.set(LAST_SEEN_KEY, String(Date.now()));

function decide(trigger: IntroTrigger): IntroPlay {
  if (typeof window === 'undefined') return 'none';
  const s = usePrefs.getState();
  return decideIntro({
    pref: resolveIntroExperience(s.intro, s.introChoice, s.introMode),
    trigger,
    freshVisit: FRESH_VISIT,
    reducedMotion: reducedMotion(),
    path: location.pathname,
    cinematicSeen: local.get(CINEMATIC_SEEN_KEY) === '1',
    cinematicThisSession: session.get(CINEMATIC_SESSION_KEY) === '1',
    saveData: saveData(),
  });
}

/**
 * Introduction overlay. The app renders underneath while it plays. Which intro plays is the user's choice
 * (Account → Introduction; lib/intro.ts): none, the brand animation, or the cinematic film followed by the brand
 * animation; automatic by default (the film on the first-ever visit, the brand animation afterwards). It is decided on
 * page load, on returning to a tab after a visit gap and after an interactive sign-in; never on route changes, token
 * refreshes or data fetching. Silent, always skippable (button or Esc), never shown with reduced motion.
 */
export function IntroSplash() {
  const [play, setPlay] = useState<IntroPlay>(() => decide('load'));

  useEffect(() => {
    const onLogin = () => {
      const next = decide('login');
      if (next !== 'none' && Date.now() - playedAt > 15_000) setPlay(next);
      else session.set(INTRO_LOGIN_KEY, null);
    };
    // Coming back to a tab left in the background for longer than a visit gap starts a new visit.
    touch();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return touch();
      const last = Number(local.get(LAST_SEEN_KEY)) || 0;
      touch();
      if (last && Date.now() - last > VISIT_GAP_MS) {
        const next = decide('return');
        if (next !== 'none') setPlay(next);
      }
    };
    const onReplay = (e: Event) => {
      const which = (e as CustomEvent<string>).detail === 'cinematic' ? 'preview-cinematic' : 'preview-brand';
      setPlay(decide(which));
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', touch);
    window.addEventListener('av-intro-login', onLogin);
    window.addEventListener(INTRO_REPLAY_EVENT, onReplay);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', touch);
      window.removeEventListener('av-intro-login', onLogin);
      window.removeEventListener(INTRO_REPLAY_EVENT, onReplay);
    };
  }, []);

  useEffect(() => {
    if (play === 'none') return;
    playedAt = Date.now();
    session.set(INTRO_SHOWN_KEY, '1');
    session.set(INTRO_LOGIN_KEY, null);
    if (play === 'cinematic') {
      local.set(CINEMATIC_SEEN_KEY, '1');
      session.set(CINEMATIC_SESSION_KEY, '1');
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlay('none');
    window.addEventListener('keydown', onKey);
    const timer = play === 'brand' ? setTimeout(() => setPlay('none'), BRAND_INTRO_MS) : undefined;
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [play]);

  if (play === 'none') return null;
  if (play === 'cinematic') return <CinematicStage onEnd={() => setPlay('brand')} onSkip={() => setPlay('none')} />;
  return <BrandStage onSkip={() => setPlay('none')} />;
}

function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      className="btn-quiet tap absolute bottom-6 right-6 z-10 text-xs text-platinum/80 hover:text-platinum"
      onClick={(e) => {
        e.stopPropagation();
        onSkip();
      }}
      autoFocus
    >
      Skip intro
    </button>
  );
}

/**
 * The film (about 13 s, muted). It is requested only when it is about to play. If it fails to load or has not started
 * within CINEMATIC_START_TIMEOUT_MS, the brand animation plays instead; at the end it fades into the brand animation.
 */
function CinematicStage({ onEnd, onSkip }: { onEnd: () => void; onSkip: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  const [film] = useState(pickFilm);
  const done = useRef(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onEnd();
    };
    const timeout = setTimeout(() => v.currentTime === 0 && finish(), CINEMATIC_START_TIMEOUT_MS);
    const onTime = () => {
      if (v.duration && v.duration - v.currentTime < 0.6) setFading(true);
    };
    v.addEventListener('ended', finish);
    v.addEventListener('error', finish);
    v.addEventListener('timeupdate', onTime);
    // Autoplay can be refused (power saving); then the brand animation plays.
    void v.play().catch(finish);
    return () => {
      clearTimeout(timeout);
      v.removeEventListener('ended', finish);
      v.removeEventListener('error', finish);
      v.removeEventListener('timeupdate', onTime);
    };
  }, [onEnd]);

  return (
    <div className={`av-film fixed inset-0 z-[100] bg-ink-950 ${fading ? 'av-film-out' : ''}`} role="presentation">
      <video ref={video} className="h-full w-full object-cover" muted playsInline autoPlay preload="auto" poster={film.poster} aria-hidden disablePictureInPicture>
        <source src={film.webm} type="video/webm" onError={() => undefined} />
        <source src={film.mp4} type="video/mp4" onError={() => video.current?.dispatchEvent(new Event('error'))} />
      </video>
      <SkipButton onSkip={onSkip} />
    </div>
  );
}

/**
 * Brand animation, about 4.2 s: AURORA VERITATIS appears letter by letter and stays readable for about 1.5 s; the
 * other letters dissolve while the A and the V glide together and settle into the AV monogram; the tagline follows and
 * the page fades in. Timings live in the av2-* keyframes (index.css).
 */
function BrandStage({ onSkip }: { onSkip: () => void }) {
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
              <span className="av2-letter inline-block" style={{ animationDelay: `${120 + i * 45}ms` }}>
                {ch === ' ' ? ' ' : ch}
              </span>
            </span>
          ))}
        </div>
        <div className="av2-line mt-5 h-px w-64 bg-gold/70 md:w-[28rem]" />
        <div className="av2-tag absolute left-1/2 top-full mt-14 whitespace-nowrap font-display text-[10px] font-medium tracking-[0.24em] text-gold md:mt-20 md:text-xs">
          GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT
        </div>
      </div>
      <SkipButton onSkip={onSkip} />
    </div>
  );
}
