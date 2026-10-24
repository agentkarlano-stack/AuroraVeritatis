import type { ReactNode } from 'react';
import { countryByIso3 } from '../../lib/countries';
import { credit, landmarkById, landmarkSrc, normalizeBackground } from '../../lib/profileBackground';
import { usePrefs } from '../../store/prefs';

/**
 * Header banner with the user's optional landmark background (neutral when none is chosen). A dark gradient keeps the
 * text readable over any photo; the photo credit is always shown, as the licences require.
 */
export function ProfileBanner({ children, className = '' }: { children?: ReactNode; className?: string }) {
  const bg = normalizeBackground(usePrefs((s) => s.profileBackground));
  const l = landmarkById(bg?.landmark);
  return (
    <figure className={`relative overflow-hidden rounded-xl border border-line bg-ink-900 ${className}`}>
      {l ? (
        <img
          src={landmarkSrc(l, 1280)}
          srcSet={`${landmarkSrc(l, 640)} 640w, ${landmarkSrc(l, 1280)} 1280w`}
          sizes="(max-width: 768px) 100vw, 1100px"
          alt={`${l.label}, ${countryByIso3(l.country)?.name ?? l.country}`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,163,90,0.12),transparent_60%)]" />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/55 to-ink-950/15" />
      <div className="relative flex min-h-36 flex-col justify-end p-4 sm:min-h-44 sm:p-5">{children}</div>
      {l && (
        <figcaption className="relative border-t border-white/5 bg-ink-950/70 px-4 py-1 text-[10px] leading-relaxed text-slate-dim">
          {l.label}.{' '}
          <a className="hover:text-mist hover:underline" href={l.page} target="_blank" rel="noreferrer">
            {credit(l)}
          </a>
          {l.licenseUrl && (
            <>
              {' · '}
              <a className="hover:text-mist hover:underline" href={l.licenseUrl} target="_blank" rel="noreferrer license">
                licence
              </a>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
