/** The 3D map (MapLibre GL) needs WebGL 2; without it Aurora shows the lightweight SVG map instead. */
export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
