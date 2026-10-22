/** Avatar styles users can choose (no uploads yet): monogram colours in Aurora's palette. */
export const AVATAR_STYLES: { id: string; label: string; bg: string; fg: string }[] = [
  { id: 'gold', label: 'Gold on charcoal', bg: '#1c1b19', fg: '#c9a35a' },
  { id: 'platinum', label: 'Platinum on charcoal', bg: '#1c1b19', fg: '#f1f0ec' },
  { id: 'charcoal', label: 'Charcoal on gold', bg: '#c9a35a', fg: '#151517' },
  { id: 'olive', label: 'Olive', bg: '#2b2e22', fg: '#b9bd8f' },
  { id: 'slate', label: 'Slate', bg: '#22252a', fg: '#aab4c0' },
  { id: 'wine', label: 'Wine', bg: '#2d1f20', fg: '#d0a3a0' },
];

export function initials(name: string | null | undefined, email?: string | null): string {
  const src = (name ?? '').trim() || (email ?? '').split('@')[0] || '?';
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : (parts[0]?.[1] ?? ''))).toUpperCase();
}

