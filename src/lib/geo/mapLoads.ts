/**
 * Mapbox web map loads in this browser session: each `new mapboxgl.Map()` is a billed load (50,000 a month included),
 * so the count is kept for tests and cost checks. Changing style, panning or zooming does not add a load.
 */
const KEY = 'av-mapbox-loads';
export const mapLoads = () => {
  try {
    return Number(sessionStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
};
export const countMapLoad = () => {
  try {
    sessionStorage.setItem(KEY, String(mapLoads() + 1));
  } catch {
    /* storage unavailable */
  }
};
