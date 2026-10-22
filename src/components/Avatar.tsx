import { AVATAR_STYLES, initials } from '../lib/avatar';

export function Avatar({ name, email, style, size = 40 }: { name?: string | null; email?: string | null; style?: string | null; size?: number }) {
  const s = AVATAR_STYLES.find((a) => a.id === style) ?? AVATAR_STYLES[0]!;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line font-display font-semibold tracking-wide"
      style={{ width: size, height: size, background: s.bg, color: s.fg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}
