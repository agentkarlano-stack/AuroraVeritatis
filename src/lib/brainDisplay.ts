/** Brain canvas display options (stored per device in `prefs.brainCanvas`). */
export const BRAIN_BACKGROUNDS = {
  dots: { label: 'Dots', fill: '#111113', mark: '#2a2a2f' },
  grid: { label: 'Grid', fill: '#111113', mark: '#1f1f23' },
  plain: { label: 'Plain', fill: '#111113', mark: null },
  night: { label: 'Night', fill: '#0a0a0b', mark: '#1a1a1d' },
} as const;
export type BrainBackground = keyof typeof BRAIN_BACKGROUNDS;
export type BrainColorMode = 'type' | 'risk';
