import { ExternalLink, MapPin, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { sourceOf, type Story } from '../../../shared/news';
import { SaveButton } from '../SaveButton';

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const STATUS_TEXT: Record<Story['status'], string> = {
  confirmed: 'Confirmed: an official source published it',
  corroborated: 'Corroborated: at least two independent publishers',
  unverified: 'Unverified: one publisher so far',
};
const STATUS_CLS: Record<Story['status'], string> = { confirmed: 'text-up', corroborated: 'text-info', unverified: 'text-warn' };

interface Props {
  story: Story;
  country: { iso3: string; name: string } | null;
  onFocusCountry?: (iso3: string) => void;
  onClose: () => void;
}

/**
 * Full-viewport story view (canonical 11/15): headline, evidence status, timing, the provider's short excerpt with its
 * attribution, every publisher with its own link and time, and the map context. No article text and no images: media
 * appear only once rights are recorded for them. Esc, the close button and the browser Back button return to the
 * feed with its scroll position and the map unchanged.
 */
export function StoryDossier({ story, country, onFocusCountry, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    opener.current = document.activeElement;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);
  const lead = story.articles.find((a) => a.summary) ?? story.articles[0];
  const sorted = [...story.articles].sort((a, b) => a.seen.localeCompare(b.seen));
  return (
    <div className="av-story fixed inset-0 z-[90] overflow-y-auto bg-ink-950/97 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="story-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Development</span>
          <button ref={close} className="grid h-11 w-11 place-items-center rounded-full text-mist hover:bg-ink-900 hover:text-platinum" onClick={onClose} aria-label="Close story">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <h2 id="story-title" className="mt-3 text-2xl font-semibold leading-snug text-platinum sm:text-3xl">
          {story.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className={STATUS_CLS[story.status]}>{STATUS_TEXT[story.status]}</span>
          <span className="num text-slate-dim">First seen {fmt(story.first)}</span>
          {story.last !== story.first && <span className="num text-slate-dim">Latest {fmt(story.last)}</span>}
        </div>

        {story.summary && lead && (
          <figure className="mt-6 border-l-2 border-line pl-4">
            <blockquote className="text-base leading-relaxed text-mist">{story.summary}</blockquote>
            <figcaption className="mt-2 text-[11px] text-slate-dim">
              Excerpt published by {sourceOf(lead.domain)?.name ?? lead.domain}, supplied with the headline. Read the full report at the source.
            </figcaption>
          </figure>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {country && onFocusCountry && (
            <button className="btn-ghost text-xs" onClick={() => onFocusCountry(country.iso3)}>
              <MapPin className="h-3.5 w-3.5" aria-hidden /> Show {country.name} on the map
            </button>
          )}
          {lead && <SaveButton kind="story" title={story.title} url={lead.url} className="btn-ghost text-xs" />}
        </div>

        <section className="mt-8" aria-labelledby="story-sources">
          <h3 id="story-sources" className="eyebrow">
            Sources ({sorted.length})
          </h3>
          <ol className="mt-2 divide-y divide-line/70 border-y border-line/70">
            {sorted.map((a) => {
              const src = sourceOf(a.domain);
              const copy = story.syndicated.includes(a.domain);
              return (
                <li key={a.url} className="py-3">
                  <a href={a.url} target="_blank" rel="noreferrer noopener" className="group block">
                    <span className="text-sm text-platinum group-hover:text-gold-soft">{a.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-dim">
                      <span className="text-mist">{src?.name ?? a.domain}</span>
                      {src && <span>{src.note}</span>}
                      {copy && <span className="text-warn">Same headline as another outlet (likely syndicated)</span>}
                      <span className="num">{fmt(a.seen)}</span>
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[11px] text-slate-dim">
            Headlines, short excerpts and links only; article text and images belong to their publishers. Syndicated copies are not counted as independent confirmation.
          </p>
        </section>
      </div>
    </div>
  );
}
