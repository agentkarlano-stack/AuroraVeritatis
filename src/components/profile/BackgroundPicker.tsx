import { Check } from 'lucide-react';
import { useState } from 'react';
import { countryByIso3 } from '../../lib/countries';
import { COUNTRIES_WITH_LANDMARKS, landmarkById, landmarkSrc, landmarksFor, normalizeBackground, suggestCountry } from '../../lib/profileBackground';
import { usePrefs } from '../../store/prefs';
import { Panel } from '../ui';
import { ProfileBanner } from './ProfileBanner';

const name = (iso3: string) => countryByIso3(iso3)?.name ?? iso3;
const SORTED = [...COUNTRIES_WITH_LANDMARKS].sort((a, b) => name(a).localeCompare(name(b)));

/**
 * Choose an optional country landmark as the profile background: country, landmark, live preview, reset to neutral.
 * Saved in the synced preferences. The suggestion comes only from the country last opened in a dossier.
 */
export function BackgroundPicker() {
  const bg = normalizeBackground(usePrefs((s) => s.profileBackground));
  const set = usePrefs((s) => s.setProfileBackground);
  const lastCountry = usePrefs((s) => s.lastCountry);
  const chosen = landmarkById(bg?.landmark);
  const suggestion = suggestCountry(bg, lastCountry);
  const [country, setCountry] = useState<string>(chosen?.country ?? suggestion ?? SORTED[0]!);
  const options = landmarksFor(country);

  return (
    <Panel title="Profile background" eyebrow="Personalisation">
      <div className="space-y-3 text-sm">
        <ProfileBanner>
          <span className="text-xs uppercase tracking-wider text-gold-soft">Preview</span>
          <span className="text-base font-semibold text-platinum">{chosen ? chosen.label : 'Neutral background'}</span>
        </ProfileBanner>
        {suggestion && (
          <p className="text-xs text-mist">
            Suggested from your recent research:{' '}
            <button className="text-gold hover:underline" onClick={() => setCountry(suggestion)}>
              {name(suggestion)}
            </button>
          </p>
        )}
        <label className="block text-xs text-mist">
          Country
          <select className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)}>
            {SORTED.map((c) => (
              <option key={c} value={c}>
                {name(c)}
              </option>
            ))}
          </select>
        </label>
        <div role="radiogroup" aria-label={`Landmarks in ${name(country)}`} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((l) => {
            const on = chosen?.id === l.id;
            return (
              <button
                key={l.id}
                role="radio"
                aria-checked={on}
                onClick={() => set({ landmark: l.id })}
                className={`group relative overflow-hidden rounded-lg border text-left ${on ? 'border-gold' : 'border-line hover:border-gold-dim'}`}
              >
                <img src={landmarkSrc(l, 320)} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" decoding="async" />
                <span className="block truncate px-2 py-1 text-xs text-mist group-hover:text-platinum">{l.label}</span>
                {on && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-gold p-0.5 text-ink-950">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost text-xs" disabled={!chosen} onClick={() => set(null)}>
            Reset to neutral
          </button>
          <span className="text-[11px] text-slate-dim">
            Shown on your Account page and in Headquarters. Saved in this browser and synced to your account when signed in. Photos are freely licensed
            from Wikimedia Commons and credited under the image.
          </span>
        </div>
      </div>
    </Panel>
  );
}
