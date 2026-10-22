/** Pan/zoom state of a 2D map drawn in a fixed W × H coordinate space: screen = world × k + (x, y). */
export interface MapView {
  k: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 16;

/** Keep the map covering the frame: no empty margins at any zoom. */
export function clampView(v: MapView, w: number, h: number): MapView {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k));
  return { k, x: Math.min(0, Math.max(w - w * k, v.x)), y: Math.min(0, Math.max(h - h * k, v.y)) };
}

/** Zoom by `factor` keeping the point (cx, cy) fixed on screen. */
export function zoomAround(v: MapView, factor: number, cx: number, cy: number, w: number, h: number): MapView {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
  const f = k / v.k;
  return clampView({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }, w, h);
}

/**
 * Zoom factor for a wheel event: smooth and proportional to the scroll distance (trackpads send many small deltas,
 * mouse wheels fewer large ones). Wheel up (negative delta) zooms in. Line and page deltas are normalised to pixels.
 */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const clamped = Math.max(-200, Math.min(200, px));
  return Math.exp(-clamped * 0.0025);
}

/** Whether a wheel step in this direction can still change the zoom (otherwise the page may scroll). */
export function canZoom(v: MapView, deltaY: number): boolean {
  return deltaY < 0 ? v.k < MAX_ZOOM - 1e-6 : deltaY > 0 ? v.k > MIN_ZOOM + 1e-6 : false;
}

/** Distance and midpoint of two touch points, for pinch gestures. */
export function pinch(a: { x: number; y: number }, b: { x: number; y: number }): { d: number; cx: number; cy: number } {
  return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}
