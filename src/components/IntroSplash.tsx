import { useEffect, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { Monogram } from './Logo';

const DURATION_MS = 2600;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * One-time brand intro: the AURORA VERITATIS wordmark condenses into the AV monogram,
 * which then settles before the interface appears. Skippable (button, Esc, click), never shown
 * with reduced motion, and shown only until it has been seen once. No sound.
 */
export function IntroSplash() {
  const { introSeen, setIntroSeen } = usePrefs();
  const [visible, setVisible] = useState(() => !introSeen && !prefersReducedMotion());

  useEffect(() => {
    if (!visible) return;
    const done = () => {
      setVisible(false);
      setIntroSeen();
    };
    const timer = setTimeout(done, DURATION_MS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [visible, setIntroSeen]);

  if (!visible) return null;
  const skip = () => {
    setVisible(false);
    setIntroSeen();
  };

  return (
    <div className="av-intro fixed inset-0 z-[100] flex items-center justify-center bg-ink-950" onClick={skip} role="presentation">
      <div className="relative flex flex-col items-center" aria-hidden>
        <div className="av-intro-mono">
          <Monogram className="h-20 w-auto md:h-24" />
        </div>
        <div className="av-intro-word mt-6 font-display text-2xl font-bold text-platinum md:text-4xl">AURORA VERITATIS</div>
        <div className="av-intro-tag mt-3 font-display text-[11px] font-medium tracking-[0.2em] text-gold md:text-sm">
          GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT
        </div>
      </div>
      <button
        type="button"
        className="btn-quiet absolute bottom-6 right-6 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        autoFocus
      >
        Skip intro
      </button>
    </div>
  );
}
