/**
 * Narrative target indicator (canonical 02 B / 12): a geographic overlay, separate from the mouse cursor, whose shape
 * and on-screen size follow the event's real geometry and the camera. Pure logic, so it can be tested without a map.
 *
 * Shapes by precision: `point` (verified coordinate: small ring), `area` (approximate location: dashed circle at the
 * stated radius, labelled "Approximate area"), `country` (country-wide story: no centre mark; the country outline is
 * highlighted by the map), `sea` (maritime event: dashed sea-area circle). Phases follow the camera: far away it is a
 * small candidate mark, closer it acquires (brackets sized to the extent), then it locks and settles to a faint outline.
 */
export type TargetKind = 'point' | 'area' | 'country' | 'sea';
export type ReticlePhase = 'candidate' | 'acquiring' | 'locked' | 'settled';

export interface ReticleTarget {
  lon: number;
  lat: number;
  kind: TargetKind;
  /** Radius of the evidence extent in kilometres (uncertainty or affected area); only drawn when stated. */
  radiusKm?: number | null;
}

/** Metres per screen pixel for Mapbox/MapLibre (512 px tiles) at a latitude and zoom. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (40_075_016.686 * Math.cos((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Screen radius (px) of a geographic radius at the current camera. */
export const radiusPx = (radiusKm: number, lat: number, zoom: number) => (radiusKm * 1000) / metresPerPixel(lat, zoom);

export interface ReticleShape {
  phase: ReticlePhase;
  /** What to draw: brackets during acquisition; ring for a locked point; dashed circle for an area or sea. */
  form: 'mark' | 'brackets' | 'ring' | 'circle' | 'none';
  /** Half size of the drawn shape in px (clamped so it never covers the screen or vanishes). */
  size: number;
  opacity: number;
  label: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Shape for the target at the current zoom. `sinceLockMs` is the time since the camera reached its final stage
 * (null while still travelling); after about 2.5 s the reticle settles so it never obscures the story.
 */
export function reticleShape(t: ReticleTarget, zoom: number, sinceLockMs: number | null, viewport: { width: number; height: number }): ReticleShape {
  const max = Math.min(viewport.width, viewport.height) * 0.42;
  const extent = t.radiusKm ? radiusPx(t.radiusKm, t.lat, zoom) : 0;
  if (t.kind === 'country') return { phase: sinceLockMs === null ? 'acquiring' : 'locked', form: 'none', size: 0, opacity: 0, label: null };
  if (zoom < 3.2 && sinceLockMs === null) return { phase: 'candidate', form: 'mark', size: 7, opacity: 0.75, label: null };
  const settled = sinceLockMs !== null && sinceLockMs > 2_500;
  if (sinceLockMs === null) {
    // Acquiring: brackets close in on the extent (or a small default box for a point) as the camera descends.
    const size = clamp(t.kind === 'point' ? 22 + Math.max(0, 9 - zoom) * 6 : Math.max(extent, 26), 18, max);
    return { phase: 'acquiring', form: 'brackets', size, opacity: 0.9, label: null };
  }
  if (t.kind === 'point') return { phase: settled ? 'settled' : 'locked', form: 'ring', size: clamp(Math.max(extent, 11), 9, max), opacity: settled ? 0.45 : 0.95, label: null };
  const size = clamp(extent || 40, 16, max);
  return { phase: settled ? 'settled' : 'locked', form: 'circle', size, opacity: settled ? 0.4 : 0.85, label: t.kind === 'sea' ? 'Sea area' : 'Approximate area' };
}
