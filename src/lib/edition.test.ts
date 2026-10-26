import { describe, expect, it } from 'vitest';
import { editionAt, editionLabel, nextEdition } from './edition';

describe('briefing editions (Europe/Budapest)', () => {
  it('uses 07:00 and 19:00 local time in winter (UTC+1)', () => {
    // 26 Oct 2026 is after the end of daylight saving (25 Oct).
    expect(new Date(editionAt(Date.parse('2026-10-26T19:30:00Z'))).toISOString()).toBe('2026-10-26T18:00:00.000Z');
    expect(new Date(editionAt(Date.parse('2026-10-26T05:59:00Z'))).toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(new Date(nextEdition(Date.parse('2026-10-26T06:30:00Z'))).toISOString()).toBe('2026-10-26T18:00:00.000Z');
  });

  it('follows daylight saving in summer (UTC+2)', () => {
    expect(new Date(editionAt(Date.parse('2026-07-01T06:00:00Z'))).toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(new Date(editionAt(Date.parse('2026-07-01T04:59:00Z'))).toISOString()).toBe('2026-06-30T17:00:00.000Z');
  });

  it('labels editions in Budapest time', () => {
    expect(editionLabel(Date.parse('2026-10-26T18:00:00Z'))).toBe('26 Oct, 19:00 Budapest');
  });
});
