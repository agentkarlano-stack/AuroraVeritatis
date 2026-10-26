import { describe, expect, it } from 'vitest';
import { formatLngLat } from './coords';

describe('formatLngLat', () => {
  it('formats hemispheres and wraps longitude', () => {
    expect(formatLngLat(141.4, 38.21)).toBe('38.21° N, 141.40° E');
    expect(formatLngLat(-74.006, -12.5)).toBe('12.50° S, 74.01° W');
    expect(formatLngLat(190, 0)).toBe('0.00° N, 170.00° W');
  });
});
