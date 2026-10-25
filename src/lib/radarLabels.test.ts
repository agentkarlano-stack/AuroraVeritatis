import { describe, expect, it } from 'vitest';
import { age, flagEmoji } from './radarLabels';

const now = Date.parse('2026-10-25T12:00:00Z');

describe('radar labels', () => {
  it('formats flags and ages', () => {
    expect(flagEmoji('HU')).toBe('🇭🇺');
    expect(flagEmoji('x')).toBe('');
    expect(age(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min ago');
    expect(age(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 h ago');
    expect(age(new Date(now - 72 * 3_600_000).toISOString(), now)).toBe('3 days ago');
  });
});
