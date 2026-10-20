import type { EventCategory, GeoEvent } from '../../shared/types';
import { CATEGORY_COLOR } from '../lib/events';
import { bucketByDay } from '../lib/timeline';

interface Props {
  events: GeoEvent[];
  days: number;
  now: number;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

const H = 64;

/** Daily event counts stacked by category. Click a day to filter; click again to clear. */
export function EventTimeline({ events, days, now, selectedDay, onSelectDay }: Props) {
  const buckets = bucketByDay(events, days, now);
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const w = 100 / buckets.length;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-dim">
        <span>
          {buckets[0]?.day} → {buckets.at(-1)?.day} · events per day
        </span>
        {selectedDay && (
          <button className="text-gold hover:underline" onClick={() => onSelectDay(null)}>
            Clear day filter ({selectedDay})
          </button>
        )}
      </div>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-16 w-full" role="group" aria-label="Event timeline">
        {buckets.map((b, i) => {
          let y = H;
          const selected = b.day === selectedDay;
          return (
            <g
              key={b.day}
              // The SVG group's native focus outline renders as a solid block; show focus inside the chart instead.
              className="cursor-pointer outline-none [&:focus-visible>rect:first-of-type]:fill-[rgba(200,169,107,0.22)]"
              role="button"
              tabIndex={0}
              aria-label={`${b.day}: ${b.total} event${b.total === 1 ? '' : 's'}`}
              aria-pressed={selected}
              onClick={() => onSelectDay(selected ? null : b.day)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectDay(selected ? null : b.day)}
            >
              <title>{`${b.day}: ${b.total} event${b.total === 1 ? '' : 's'}`}</title>
              <rect x={i * w} y={0} width={w} height={H} fill={selected ? 'rgba(200,169,107,0.12)' : 'transparent'} />
              {(Object.entries(b.byCategory) as [EventCategory, number][]).map(([cat, n]) => {
                const h = (n / max) * (H - 4);
                y -= h;
                return <rect key={cat} x={i * w + w * 0.15} width={w * 0.7} y={y} height={h} fill={CATEGORY_COLOR[cat]} opacity={selectedDay && !selected ? 0.35 : 0.9} />;
              })}
            </g>
          );
        })}
        <line x1="0" x2="100" y1={H - 0.25} y2={H - 0.25} stroke="#233149" strokeWidth="0.5" />
      </svg>
    </div>
  );
}
