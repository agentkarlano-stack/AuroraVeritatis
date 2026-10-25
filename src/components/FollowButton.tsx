import { Star } from 'lucide-react';
import { countryByIso3 } from '../lib/countries';
import { usePrefs } from '../store/prefs';

/** Follow a country: it appears in HQ with the changes since the last visit. */
export function FollowButton({ iso3, className = 'btn-quiet' }: { iso3: string; className?: string }) {
  const following = usePrefs((s) => s.favorites.includes(iso3));
  const toggle = usePrefs((s) => s.toggleFavorite);
  const name = countryByIso3(iso3)?.name ?? iso3;
  return (
    <button className={className} aria-pressed={following} onClick={() => toggle(iso3)} aria-label={following ? `Stop following ${name}` : `Follow ${name} in HQ`} title={following ? 'Following in HQ' : 'Follow in HQ'}>
      <Star className={`h-4 w-4 ${following ? 'text-gold' : ''}`} fill={following ? 'currentColor' : 'none'} aria-hidden />
    </button>
  );
}
