import { describe, expect, it } from 'vitest';
import { canZoom, clampView, MAX_ZOOM, pinch, wheelFactor, zoomAround } from './mapView';

const W = 960;
const H = 500;

describe('map view maths', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    const v = zoomAround({ k: 1, x: 0, y: 0 }, 2, 300, 200, W, H);
    expect(v.k).toBe(2);
    // World point under the cursor before: (300, 200). After: screen = world × 2 + offset = 300.
    expect(300 * v.k + v.x).toBeCloseTo(300);
    expect(200 * v.k + v.y).toBeCloseTo(200);
  });
  it('clamps zoom and pan to the frame', () => {
    expect(zoomAround({ k: 1, x: 0, y: 0 }, 0.5, 100, 100, W, H)).toEqual({ k: 1, x: 0, y: 0 });
    expect(zoomAround({ k: 10, x: 0, y: 0 }, 10, 0, 0, W, H).k).toBe(MAX_ZOOM);
    const v = clampView({ k: 2, x: 500, y: -9999 }, W, H);
    expect(v.x).toBe(0);
    expect(v.y).toBe(H - 2 * H);
  });
  it('turns wheel deltas into smooth factors: up zooms in, down zooms out', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(100) * wheelFactor(-100)).toBeCloseTo(1);
    // A line-mode wheel step (Firefox) is treated like ~48 px.
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(48));
    // Huge deltas are capped.
    expect(wheelFactor(5000)).toBeCloseTo(wheelFactor(200));
  });
  it('knows when zooming is exhausted so the page can scroll', () => {
    expect(canZoom({ k: 1, x: 0, y: 0 }, 100)).toBe(false);
    expect(canZoom({ k: 1, x: 0, y: 0 }, -100)).toBe(true);
    expect(canZoom({ k: MAX_ZOOM, x: 0, y: 0 }, -100)).toBe(false);
    expect(canZoom({ k: 3, x: 0, y: 0 }, 100)).toBe(true);
  });
  it('measures pinch gestures', () => {
    expect(pinch({ x: 0, y: 0 }, { x: 30, y: 40 })).toEqual({ d: 50, cx: 15, cy: 20 });
  });
});
