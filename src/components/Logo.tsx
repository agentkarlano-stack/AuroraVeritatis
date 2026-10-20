interface MonogramProps {
  className?: string;
  title?: string;
}

/**
 * Flat AV lettermark: the A's right stroke doubles as the V's left stroke —
 * the shared structural line in the brand concept.
 */
export function Monogram({ className = 'h-8 w-auto', title = 'Aurora Veritatis' }: MonogramProps) {
  return (
    <svg viewBox="0 0 132 100" className={className} role="img" aria-label={title}>
      <g fill="none" stroke="currentColor" strokeWidth="15" strokeLinejoin="miter" strokeMiterlimit="10">
        <polyline points="10,94 41,12 72,94 103,12" className="text-gold" stroke="#C8A96B" />
        <line x1="25" y1="68" x2="57" y2="68" stroke="#C8A96B" strokeWidth="12" />
      </g>
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <Monogram className="h-7 w-auto shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[13px] font-bold tracking-[0.2em] text-platinum">AURORA VERITATIS</span>
        {!compact && (
          <span className="mt-1 hidden font-display text-[8.5px] font-medium tracking-[0.24em] text-gold sm:block">
            GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT
          </span>
        )}
      </span>
    </span>
  );
}
