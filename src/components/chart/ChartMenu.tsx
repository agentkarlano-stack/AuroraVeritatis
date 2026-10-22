import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Compact toolbar menu: a dropdown on wider screens and a bottom sheet on phones. Closes on Escape and outside clicks.
 * `children` receives a `close` callback.
 */
export function ChartMenu({ label, icon, title, children, width = 'sm:w-72', align = 'left', active = false, disabled = false }: {
  label: ReactNode;
  icon?: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  width?: string;
  align?: 'left' | 'right';
  active?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className={`chip whitespace-nowrap ${active ? 'border-gold/60 text-gold-soft' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className={`fixed inset-x-0 bottom-0 z-[70] max-h-[75vh] overflow-y-auto rounded-t-xl border border-line bg-ink-900 p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-1 sm:max-h-[70vh] sm:rounded-lg ${width} ${align === 'right' ? 'sm:right-0' : 'sm:left-0'}`}
        >
          <div className="mb-2 flex items-center justify-between sm:hidden">
            <span className="text-sm font-semibold text-platinum">{title}</span>
            <button className="btn-quiet text-xs" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A selectable row inside a menu, optionally disabled with a visible reason. */
export function MenuOption({ selected, disabled, reason, onSelect, children, hint }: { selected?: boolean; disabled?: boolean; reason?: string | null; onSelect: () => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={!!selected}
      disabled={disabled}
      title={reason ?? undefined}
      onClick={onSelect}
      className={`flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${selected ? 'bg-gold/10 text-gold-soft' : 'text-mist hover:bg-ink-800'} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent`}
    >
      <span className="min-w-0">
        <span className="block">{children}</span>
        {disabled && reason && <span className="block text-[11px] leading-snug text-slate-dim">{reason}</span>}
        {!disabled && hint && <span className="block text-[11px] leading-snug text-slate-dim">{hint}</span>}
      </span>
    </button>
  );
}
