import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { SavedItem } from '../lib/saved';
import { useIsSaved, useSaved } from '../store/saved';

/** Saves to (or removes from) HQ › Saved intelligence. */
export function SaveButton({
  kind,
  title,
  href = '',
  url = '',
  meta,
  className = 'chip text-[11px]',
  label = true,
}: Pick<SavedItem, 'kind' | 'title'> & { href?: string; url?: string; meta?: Record<string, unknown>; className?: string; label?: boolean }) {
  const saved = useIsSaved(kind, href, url);
  const toggle = useSaved((s) => s.toggle);
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      className={className}
      aria-pressed={saved}
      aria-label={saved ? `Remove “${title}” from saved` : `Save “${title}” to HQ`}
      title={saved ? 'Saved in HQ (click to remove)' : 'Save to HQ'}
      onClick={() => toggle({ kind, title, href, url, meta })}
    >
      <Icon className={`h-3.5 w-3.5 ${saved ? 'text-gold' : ''}`} aria-hidden />
      {label && (saved ? 'Saved' : 'Save')}
    </button>
  );
}
