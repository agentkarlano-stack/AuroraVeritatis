import type { EventCategory, GeoEvent } from '../../shared/types';

export interface DayBucket {
  /** YYYY-MM-DD (UTC) */
  day: string;
  total: number;
  byCategory: Partial<Record<EventCategory, number>>;
}

/** Group events into consecutive UTC days ending at `now`, including empty days. */
export function bucketByDay(events: GeoEvent[], days: number, now: number): DayBucket[] {
  const end = new Date(now);
  const buckets: DayBucket[] = [];
  const index = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - i)).toISOString().slice(0, 10);
    const b: DayBucket = { day: d, total: 0, byCategory: {} };
    buckets.push(b);
    index.set(d, b);
  }
  for (const e of events) {
    const b = index.get(e.time.slice(0, 10));
    if (!b) continue;
    b.total++;
    b.byCategory[e.category] = (b.byCategory[e.category] ?? 0) + 1;
  }
  return buckets;
}
