import { describe, expect, it } from 'vitest';
import type { GeoEvent } from '../../shared/types';
import { age, flagEmoji, resumesIn, step, tourEvents, tourRunning } from './hqTour';

const now = Date.parse('2026-10-25T12:00:00Z');
const ev = (id: string, severity: number, hoursAgo: number, extra: Partial<GeoEvent> = {}): GeoEvent => ({
  id,
  title: `Event ${id}`,
  summary: '',
  category: 'natural-disaster',
  severity: severity as GeoEvent['severity'],
  lat: Number(id.charCodeAt(0)),
  lon: 0,
  region: 'x',
  time: new Date(now - hoursAgo * 3_600_000).toISOString(),
  provenance: 'confirmed',
  source: { name: 'USGS', url: 'https://usgs.gov', license: 'Public domain' },
  ...extra,
});

describe('headquarters tour', () => {
  it('keeps significant, recent, real events, most severe first, without repeats', () => {
    const list = tourEvents(
      [ev('a', 3, 1), ev('b', 5, 10), ev('c', 2, 1), ev('d', 4, 100), ev('e', 4, 2, { provenance: 'simulated' }), ev('b', 5, 11, { id: 'b2' })],
      now,
    );
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('pauses on interaction, resumes after the idle time, never overrides an explicit pause', () => {
    const s = { enabled: true, pausedByUser: false, lastInteraction: now - 10_000, index: 0 };
    expect(tourRunning(s, now, 60_000)).toBe(false);
    expect(resumesIn(s, now, 60_000)).toBe(50_000);
    expect(tourRunning(s, now + 50_000, 60_000)).toBe(true);
    expect(tourRunning({ ...s, pausedByUser: true }, now + 10 * 60_000, 60_000)).toBe(false);
    expect(tourRunning({ ...s, enabled: false }, now + 10 * 60_000, 60_000)).toBe(false);
  });

  it('steps around the list and formats flags and ages', () => {
    expect(step(0, -1, 3)).toBe(2);
    expect(step(2, 1, 3)).toBe(0);
    expect(step(0, 1, 0)).toBe(0);
    expect(flagEmoji('HU')).toBe('🇭🇺');
    expect(flagEmoji('x')).toBe('');
    expect(age(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min ago');
    expect(age(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 h ago');
  });
});
