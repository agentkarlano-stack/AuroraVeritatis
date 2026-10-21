import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { searchItems, type SearchItem as Item } from '../lib/search';

/** Global quick search (⌘K / Ctrl+K or "/"): pages, countries and instruments. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchItems(q), [q]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const go = (it: Item | undefined) => {
    if (!it) return;
    navigate(it.to);
    setQ('');
    setActive(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onMouseDown={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-ink-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-dim" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') go(results[active]);
            }}
            placeholder="Search pages, countries, instruments…"
            className="h-12 w-full bg-transparent text-sm text-platinum placeholder:text-slate-dim focus:outline-none"
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-slate-dim">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-dim">No matches</li>}
          {results.map((it, i) => (
            <li
              key={it.id}
              id={`palette-${it.id}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${i === active ? 'bg-ink-800' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it)}
            >
              <span className="w-20 shrink-0 text-[10px] font-semibold tracking-wider text-gold-dim uppercase">{it.group}</span>
              <span className="min-w-0 flex-1 truncate text-platinum">{it.label}</span>
              <span className="truncate text-xs text-slate-dim">{it.hint}</span>
              {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-dim" aria-hidden />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
