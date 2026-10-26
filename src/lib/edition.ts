/**
 * Voiced briefing editions: 07:00 and 19:00 Europe/Budapest (daylight saving handled by the time-zone database),
 * each covering the 24 hours before its edition time. Every viewer of the same edition gets the same period, so the
 * frozen plan (and its cached audio) is shared.
 */
export const EDITION_HOURS = [7, 19] as const;
export const EDITION_TZ = 'Europe/Budapest';

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: EDITION_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const localHourMinute = (t: number) => {
  const parts = fmt.formatToParts(new Date(t));
  return { h: Number(parts.find((p) => p.type === 'hour')?.value), m: Number(parts.find((p) => p.type === 'minute')?.value) };
};

/** The latest edition time at or before `now` (epoch ms, on a whole UTC minute). */
export function editionAt(now: number): number {
  // Budapest is always a whole-hour offset from UTC, so edition times fall on whole UTC hours.
  let t = Math.floor(now / 3_600_000) * 3_600_000;
  for (let i = 0; i < 30; i++, t -= 3_600_000) {
    const { h, m } = localHourMinute(t);
    if (m === 0 && (EDITION_HOURS as readonly number[]).includes(h)) return t;
  }
  return t;
}

/** The next edition after `now`. */
export function nextEdition(now: number): number {
  let t = Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000;
  for (let i = 0; i < 30; i++, t += 3_600_000) {
    const { h, m } = localHourMinute(t);
    if (m === 0 && (EDITION_HOURS as readonly number[]).includes(h)) return t;
  }
  return t;
}

const labelFmt = new Intl.DateTimeFormat('en-GB', { timeZone: EDITION_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "26 Oct, 19:00 Budapest" */
export const editionLabel = (t: number) => `${labelFmt.format(new Date(t)).replace(',', '').replace(/(\d+ \w+) /, '$1, ')} Budapest`;
