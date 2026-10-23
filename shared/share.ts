/**
 * Social sharing assets. One catalogue drives the Open Graph / Twitter tags (Worker + client), the /share page and
 * `scripts/render-share-assets.ts`, which renders every asset from the real interface (`/share/card`).
 * Files live in `public/media/` and are served at https://aurorav.app/media/… (bypassing the Worker).
 */

export const MEDIA_BASE = '/media';

export type CardVariant = 'home' | 'radar' | 'countries' | 'markets' | 'brain';

export interface ShareImage {
  id: string;
  file: string;
  width: number;
  height: number;
  label: string;
  use: string;
  variant: CardVariant;
  alt: string;
}

const HOME_ALT = 'Aurora Veritatis: See the world. Understand its impact. A globe and the AV monogram on charcoal.';

export const SHARE_IMAGES: readonly ShareImage[] = [
  { id: 'og', file: 'og.png', width: 1200, height: 630, label: 'Link preview', use: 'Open Graph and X/Twitter card (1200 × 630)', variant: 'home', alt: HOME_ALT },
  { id: 'story', file: 'story.png', width: 1080, height: 1920, label: 'Story', use: 'Instagram and Facebook Stories (1080 × 1920)', variant: 'home', alt: HOME_ALT },
  { id: 'post', file: 'post.png', width: 1080, height: 1350, label: 'Portrait post', use: 'Instagram and LinkedIn feed (1080 × 1350)', variant: 'home', alt: HOME_ALT },
  { id: 'square', file: 'square.png', width: 1080, height: 1080, label: 'Square post', use: 'Square feeds and profile posts (1080 × 1080)', variant: 'home', alt: HOME_ALT },
  { id: 'og-radar', file: 'og-radar.png', width: 1200, height: 630, label: 'Global Radar preview', use: 'Link preview for the Global Radar', variant: 'radar', alt: 'Aurora Veritatis Global Radar: earthquakes, disaster alerts and world events on one map.' },
  { id: 'og-countries', file: 'og-countries.png', width: 1200, height: 630, label: 'Country dossiers preview', use: 'Link preview for country pages', variant: 'countries', alt: 'Aurora Veritatis country dossiers: official indicators for every economy.' },
  { id: 'og-markets', file: 'og-markets.png', width: 1200, height: 630, label: 'Market Terminal preview', use: 'Link preview for markets, macro and positioning', variant: 'markets', alt: 'Aurora Veritatis Market Terminal: charts, ECB rates and CFTC futures positioning.' },
  { id: 'og-brain', file: 'og-brain.png', width: 1200, height: 630, label: 'Brain preview', use: 'Link preview for the Personal Intelligence Brain', variant: 'brain', alt: 'Aurora Veritatis Personal Intelligence Brain: map how events, countries and markets connect.' },
];

export const STORY_VIDEO = { mp4: 'story.mp4', webm: 'story.webm', poster: 'story.png', width: 1080, height: 1920, seconds: 10 } as const;

export const SHARE_TEXT = 'Aurora Veritatis: see the world, understand its impact. Track global events, countries and markets in one place.';

/** Copy for each card variant (home uses the approved homepage copy). */
export const CARD_COPY: Record<Exclude<CardVariant, 'home'>, { title: string; line: string }> = {
  radar: { title: 'Global Radar', line: 'Earthquakes, disaster alerts and world events on one map.' },
  countries: { title: 'Country dossiers', line: 'Official indicators for every economy, with sources and history.' },
  markets: { title: 'Market Terminal', line: 'Charts, ECB rates and CFTC futures positioning.' },
  brain: { title: 'Personal Intelligence Brain', line: 'Map how events, countries and markets connect.' },
};

/** Preview image for a route (absolute URL), so shared links show the matching module. */
export function shareImageFor(path: string, origin: string): ShareImage & { url: string } {
  const id = path.startsWith('/radar')
    ? 'og-radar'
    : path.startsWith('/countries')
      ? 'og-countries'
      : /^\/(markets|macro|currency|positioning|impact|lab|strategy)/.test(path)
        ? 'og-markets'
        : path.startsWith('/brain')
          ? 'og-brain'
          : 'og';
  const img = SHARE_IMAGES.find((i) => i.id === id)!;
  return { ...img, url: `${origin}${MEDIA_BASE}/${img.file}` };
}
