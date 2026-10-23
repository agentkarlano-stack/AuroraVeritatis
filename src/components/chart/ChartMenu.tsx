import { ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Gap between the button and the panel, and the minimum distance from the viewport edge (px). */
const GAP = 4;
const EDGE = 8;

/**
 * Compact toolbar menu: a dropdown on wider screens and a bottom sheet on phones. Closes on Escape and outside clicks.
 * `children` receives a `close` callback.
 *
 * The panel is rendered in a portal (into the full-screen element when the chart is in full screen, otherwise into
 * `body`) and positioned against its button, so scrolling or clipping containers such as the toolbar
 * (`overflow-x-auto`) or the chart canvas can never hide it.
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
  const [host, setHost] = useState<Element | null>(null);
  const open = host !== null;
  const close = () => setHost(null);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) setHost(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHost(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Place the panel under its button (flipping above or shifting sideways when it would leave the viewport). Written
  // straight to the element's style; re-run on scroll and resize while open.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = panel.current;
      const btn = anchor.current?.getBoundingClientRect();
      if (!el || !btn) return;
      if (!window.matchMedia('(min-width: 640px)').matches) {
        el.style.top = el.style.left = el.style.maxHeight = '';
        return;
      }
      const w = el.offsetWidth;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === 'right' ? btn.right - w : btn.left;
      left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
      const below = vh - btn.bottom - GAP - EDGE;
      const above = btn.top - GAP - EDGE;
      const h = Math.min(el.scrollHeight, vh * 0.7);
      const flip = h > below && above > below;
      const room = flip ? above : below;
      el.style.maxHeight = `${Math.max(160, Math.min(vh * 0.7, room))}px`;
      el.style.left = `${left}px`;
      el.style.top = `${flip ? Math.max(EDGE, btn.top - GAP - Math.min(h, room)) : btn.bottom + GAP}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  return (
    <div className="relative shrink-0" ref={anchor}>
      <button
        type="button"
        className={`chip whitespace-nowrap ${active ? 'border-gold/60 text-gold-soft' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        disabled={disabled}
        onClick={() => setHost((h) => (h ? null : (document.fullscreenElement ?? document.body)))}
      >
        {icon}
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
      </button>
      {host &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={title}
            className={`fixed inset-x-0 bottom-0 z-[90] max-h-[75vh] overflow-y-auto rounded-t-xl border border-line bg-ink-900 p-3 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:max-w-[calc(100vw-16px)] sm:rounded-lg ${width}`}
          >
            <div className="mb-2 flex items-center justify-between sm:hidden">
              <span className="text-sm font-semibold text-platinum">{title}</span>
              <button className="btn-quiet text-xs" onClick={close}>
                Close
              </button>
            </div>
            {children(close)}
          </div>,
          host,
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
