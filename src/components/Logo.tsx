/**
 * Aurora Veritatis brand marks.
 *
 * The AV monogram is drawn as geometric paths (not live text) so it renders identically everywhere:
 * two bold, flat-apex letters with identical diagonals (A mirrored as V), tightly kerned, in brand gold.
 * Geometry lives in `AV_PATHS`; public/favicon.svg and public/brand/*.svg embed the same path data.
 */
export const BRAND_GOLD = '#C9A35A';

// A: outer silhouette + triangular counter (even-odd fill). V: inverted A without the crossbar; its left
// diagonal runs exactly parallel to the A's right diagonal (constant 14-unit gap).
const AV_PATHS = {
  a: 'M0 100 L40 0 L60 0 L100 100 L76 100 L68.4 81 L31.6 81 L24 100 Z M38.4 64 L61.6 64 L50 35 Z',
  v: 'M74 0 L98 0 L124 65 L150 0 L174 0 L134 100 L114 100 Z',
} as const;

interface MonogramProps {
  className?: string;
  title?: string;
}

export function Monogram({ className = 'h-8 w-auto', title = 'Aurora Veritatis' }: MonogramProps) {
  return (
    <svg viewBox="0 0 174 100" className={className} role="img" aria-label={title}>
      <path d={AV_PATHS.a} fill={BRAND_GOLD} fillRule="evenodd" />
      <path d={AV_PATHS.v} fill={BRAND_GOLD} />
    </svg>
  );
}

/** Horizontal lockup for navigation bars: monogram | wordmark over tagline. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 sm:gap-3">
      <Monogram className="h-6 w-auto shrink-0" />
      <span aria-hidden className="h-7 w-px bg-gold-dim/60" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[13px] font-bold tracking-[0.08em] text-platinum">AURORA VERITATIS</span>
        {!compact && (
          <span className="mt-1.5 hidden whitespace-nowrap font-display text-[8px] font-medium tracking-[0.2em] text-gold sm:block">
            GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT
          </span>
        )}
      </span>
    </span>
  );
}

/** Stacked, centred lockup matching the master logo: monogram, wordmark, tagline. */
export function BrandLockup({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <div className="flex flex-col items-center text-center">
      <Monogram className={lg ? 'h-20 w-auto md:h-24' : 'h-14 w-auto'} />
      <div className={`mt-6 font-display font-bold tracking-[0.06em] text-platinum ${lg ? 'text-2xl md:text-4xl' : 'text-lg'}`}>
        AURORA VERITATIS
      </div>
      <div className={`mt-3 font-display font-medium tracking-[0.2em] text-gold ${lg ? 'text-[11px] md:text-sm' : 'text-[9px]'}`}>
        GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT
      </div>
    </div>
  );
}
