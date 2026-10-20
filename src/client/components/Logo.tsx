/**
 * Geometric AV monogram: the right leg of the A is the left leg of the V —
 * one continuous line, symbolising unity and clarity.
 */
export function AvMonogram({ size = 32, title = "Aurora Veritatis" }: { size?: number; title?: string }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 80 50" role="img" aria-label={title} fill="none">
      <title>{title}</title>
      <path
        d="M4 46 L23 5 L42 46 L61 5"
        stroke="#C2A46B"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.6 28 H33.4" stroke="#C2A46B" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function Lockup() {
  return (
    <div className="lockup">
      <AvMonogram size={64} />
      <h1 className="wordmark">AURORA VERITATIS</h1>
      <p className="subtitle">GLOBAL ANALYSIS &amp; STRATEGIC INSIGHT</p>
    </div>
  );
}
