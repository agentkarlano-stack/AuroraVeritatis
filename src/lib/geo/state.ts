import { LAYER_MAP, isActive } from './layers';

/** Base map styles. "satellite" and "grayscale" use the Blue Marble composite; the others are drawn from boundaries. */
export const STYLES = {
  satellite: { label: 'Satellite (composite)', description: 'NASA Blue Marble with shaded relief: realistic, but a static 2004 composite, not live imagery.' },
  dark: { label: 'Dark analytical', description: 'Quiet charcoal land and gold borders, best for data layers.' },
  grayscale: { label: 'Grayscale satellite', description: 'The satellite composite without colour, so data layers stand out.' },
  political: { label: 'Political boundaries', description: 'Countries in distinct muted tones with clear borders.' },
  terrain: { label: 'Terrain (shaded relief)', description: 'Relief emphasised, with lighter oceans.' },
} as const;
export type MapStyleId = keyof typeof STYLES;

export interface LayerState {
  id: string;
  /** 0–1 */
  opacity: number;
}

export interface MapState {
  mode: '2d' | '3d';
  style: MapStyleId;
  layers: LayerState[];
  /** Longitude, latitude */
  center: [number, number];
  zoom: number;
  /** YYYY-MM-DD for daily satellite layers */
  date: string;
  /** Year for country statistics */
  year: number;
  /** Selected country (ISO3), if any */
  country: string | null;
}

export const MAX_LAYERS = 4;

export function defaultState(today: string, year: number): MapState {
  return { mode: '3d', style: 'satellite', layers: [{ id: 'earthquakes', opacity: 1 }, { id: 'disasters', opacity: 1 }], center: [15, 25], zoom: 1.4, date: today, year, country: null };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Compact query string for shareable links, e.g. `?m=2d&s=dark&l=inflation:80,earthquakes&c=10.5,48.2&z=3.2&d=2026-10-21&y=2024`. */
export function encodeState(s: MapState): string {
  const p = new URLSearchParams();
  p.set('m', s.mode);
  p.set('s', s.style);
  if (s.layers.length) p.set('l', s.layers.map((l) => (l.opacity >= 1 ? l.id : `${l.id}:${Math.round(l.opacity * 100)}`)).join(','));
  p.set('c', `${round(s.center[0], 2)},${round(s.center[1], 2)}`);
  p.set('z', String(round(s.zoom, 2)));
  p.set('d', s.date);
  p.set('y', String(s.year));
  if (s.country) p.set('k', s.country);
  return `?${p.toString()}`;
}

/**
 * Reads a shared link defensively: unknown styles, layers and malformed values fall back to the defaults, planned
 * layers are dropped, and dates cannot be in the future.
 */
export function decodeState(search: string, fallback: MapState, bounds: { today: string; minYear: number; maxYear: number }): MapState {
  const p = new URLSearchParams(search);
  if (![...p.keys()].some((k) => ['m', 's', 'l', 'c', 'z', 'd', 'y', 'k'].includes(k))) return fallback;
  const mode = p.get('m') === '2d' ? '2d' : p.get('m') === '3d' ? '3d' : fallback.mode;
  const styleRaw = p.get('s') ?? '';
  const style = (styleRaw in STYLES ? styleRaw : fallback.style) as MapStyleId;
  const layers: LayerState[] = [];
  for (const part of (p.get('l') ?? '').split(',')) {
    const [id, op] = part.split(':');
    const def = id ? LAYER_MAP.get(id) : undefined;
    if (!def || !isActive(def) || layers.some((l) => l.id === id) || layers.length >= MAX_LAYERS) continue;
    const opacity = op === undefined ? 1 : clamp(Number(op) / 100, 0.1, 1);
    layers.push({ id: id!, opacity: Number.isFinite(opacity) ? opacity : 1 });
  }
  const [lon, lat] = (p.get('c') ?? '').split(',').map(Number);
  const center: [number, number] = Number.isFinite(lon) && Number.isFinite(lat) ? [clamp(lon!, -180, 180), clamp(lat!, -85, 85)] : fallback.center;
  const z = Number(p.get('z'));
  const zoom = p.has('z') && Number.isFinite(z) ? clamp(z, 0, 12) : fallback.zoom;
  const d = p.get('d') ?? '';
  const date = DATE.test(d) && d <= bounds.today && d >= '2015-01-01' ? d : fallback.date;
  const y = Number(p.get('y'));
  const year = Number.isInteger(y) && y >= bounds.minYear && y <= bounds.maxYear ? y : fallback.year;
  const k = (p.get('k') ?? '').toUpperCase();
  return { mode, style, layers: p.has('l') ? layers : fallback.layers, center, zoom, date, year, country: /^[A-Z]{3}$/.test(k) ? k : null };
}

/** Adds a layer (respecting the maximum), or removes it when already shown. */
export function toggleLayer(s: MapState, id: string): MapState {
  if (s.layers.some((l) => l.id === id)) return { ...s, layers: s.layers.filter((l) => l.id !== id) };
  if (s.layers.length >= MAX_LAYERS) return s;
  return { ...s, layers: [...s.layers, { id, opacity: 1 }] };
}

/** YYYY-MM-DD shifted by whole days (UTC). */
export function shiftDate(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
