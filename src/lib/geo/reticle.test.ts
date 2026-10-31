import { describe, expect, it } from 'vitest';
import { metresPerPixel, radiusPx, reticleShape } from './reticle';

const vp = { width: 1440, height: 900 };

describe('narrative reticle', () => {
  it('converts geographic radius to pixels with latitude and zoom', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(78_271.5, 0);
    // 10 km at the equator, zoom 10: 10,000 / 76.44 ≈ 131 px; half as many metres per pixel one zoom closer.
    expect(radiusPx(10, 0, 10)).toBeCloseTo(130.8, 0);
    expect(radiusPx(10, 0, 11)).toBeCloseTo(261.7, 0);
    // At 60° latitude the same distance covers twice the pixels.
    expect(radiusPx(10, 60, 10) / radiusPx(10, 0, 10)).toBeCloseTo(2, 2);
  });

  it('changes shape, size and opacity across camera phases (never a fixed square)', () => {
    const t = { lon: 139.7, lat: 35.7, kind: 'point' as const };
    const far = reticleShape(t, 2, null, vp);
    const mid = reticleShape(t, 5, null, vp);
    const near = reticleShape(t, 8, null, vp);
    const locked = reticleShape(t, 10, 500, vp);
    const settled = reticleShape(t, 10, 4000, vp);
    expect(far).toMatchObject({ phase: 'candidate', form: 'mark' });
    expect(mid.form).toBe('brackets');
    expect(mid.size).toBeGreaterThan(near.size);
    expect(locked).toMatchObject({ phase: 'locked', form: 'ring' });
    expect(settled.phase).toBe('settled');
    expect(settled.opacity).toBeLessThan(locked.opacity);
  });

  it('draws an approximate area at its stated radius and labels it', () => {
    const s = reticleShape({ lon: 30, lat: 50, kind: 'area', radiusKm: 25 }, 8, 100, vp);
    expect(s.form).toBe('circle');
    expect(s.size).toBeCloseTo(radiusPx(25, 50, 8), 0);
    expect(s.label).toBe('Approximate area');
  });

  it('never draws a centre mark for a country-wide story', () => {
    expect(reticleShape({ lon: 10, lat: 51, kind: 'country' }, 5, 100, vp)).toMatchObject({ form: 'none', opacity: 0 });
  });

  it('clamps huge extents to the viewport', () => {
    const s = reticleShape({ lon: 0, lat: 0, kind: 'sea', radiusKm: 2000 }, 6, 100, vp);
    expect(s.size).toBeLessThanOrEqual(900 * 0.42);
    expect(s.label).toBe('Sea area');
  });
});
