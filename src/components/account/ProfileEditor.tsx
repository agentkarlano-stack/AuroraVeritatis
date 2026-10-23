import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { COUNTRIES } from '../../lib/countries';
import { AVATAR_STYLES } from '../../lib/avatar';
import { Avatar } from '../Avatar';
import { Panel } from '../ui';

export interface ProfileRow {
  display_name: string | null;
  bio: string | null;
  avatar_style: string | null;
  region: string | null;
  language: string | null;
  timezone: string | null;
  visibility: Record<string, boolean>;
}

const EMPTY: ProfileRow = { display_name: '', bio: '', avatar_style: 'gold', region: null, language: 'en', timezone: null, visibility: {} };
const PUBLIC_FIELDS: { key: keyof ProfileRow; label: string }[] = [
  { key: 'display_name', label: 'Display name' },
  { key: 'avatar_style', label: 'Avatar' },
  { key: 'bio', label: 'Biography' },
  { key: 'region', label: 'Country or region' },
];
const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'German (interface planned)' },
  { id: 'hu', label: 'Hungarian (interface planned)' },
];
const zones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
})();

/**
 * Public profile fields stored in `profiles` (RLS: own row only; only these columns are writable). The email address
 * is never stored here and never shown publicly. Visibility defaults to private for every field.
 */
export function ProfileEditor({ onLoaded }: { onLoaded?: (p: ProfileRow) => void }) {
  const { client, session } = useAuth();
  const [row, setRow] = useState<ProfileRow>(EMPTY);
  const [state, setState] = useState<{ kind: 'loading' | 'ready' | 'saving' | 'saved' | 'unavailable' | 'error'; text?: string }>({ kind: 'loading' });
  const uid = session?.user.id;

  useEffect(() => {
    if (!client || !uid) return;
    let cancelled = false;
    client
      .from('profiles')
      .select('display_name, bio, avatar_style, region, language, timezone, visibility')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // 42703: the profile columns do not exist yet (database update pending).
          setState(error.code === '42703' ? { kind: 'unavailable' } : { kind: 'error', text: error.message });
          return;
        }
        const p = { ...EMPTY, ...(data as Partial<ProfileRow> | null), visibility: ((data as ProfileRow | null)?.visibility ?? {}) as Record<string, boolean> };
        setRow(p);
        onLoaded?.(p);
        setState({ kind: 'ready' });
      });
    return () => {
      cancelled = true;
    };
  }, [client, uid, onLoaded]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !uid) return;
    setState({ kind: 'saving' });
    const patch = {
      display_name: row.display_name?.trim().slice(0, 80) || null,
      bio: row.bio?.trim().slice(0, 500) || null,
      avatar_style: row.avatar_style,
      region: row.region || null,
      language: row.language || 'en',
      timezone: row.timezone || null,
      visibility: row.visibility,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('profiles').update(patch).eq('id', uid);
    if (error) return setState({ kind: 'error', text: error.message });
    onLoaded?.(row);
    setState({ kind: 'saved' });
  };

  const set = (p: Partial<ProfileRow>) => setRow((r) => ({ ...r, ...p }));

  if (state.kind === 'unavailable') {
    return (
      <Panel title="Public profile">
        <p className="text-sm text-slate-dim">Profile editing becomes available after a pending database update. Your account works as before.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Public profile" eyebrow="Everything is private unless you tick Public">
      {state.kind === 'loading' ? (
        <p className="text-sm text-slate-dim">Loading profile…</p>
      ) : (
        <form className="space-y-4 text-sm" onSubmit={(e) => void save(e)}>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={row.display_name} email={session?.user.email} style={row.avatar_style} size={52} />
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Avatar style">
              {AVATAR_STYLES.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={row.avatar_style === a.id} title={a.label} onClick={() => set({ avatar_style: a.id })} className={`rounded-full p-0.5 ${row.avatar_style === a.id ? 'ring-1 ring-gold' : ''}`}>
                  <Avatar name={row.display_name} email={session?.user.email} style={a.id} size={26} />
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs text-mist">
            Display name
            <input className="input mt-1" value={row.display_name ?? ''} maxLength={80} onChange={(e) => set({ display_name: e.target.value })} />
          </label>
          <label className="block text-xs text-mist">
            Short biography
            <textarea className="input mt-1 min-h-20" value={row.bio ?? ''} maxLength={500} onChange={(e) => set({ bio: e.target.value })} placeholder="Field of research, interests, affiliation" />
            <span className="text-[11px] text-slate-dim">{(row.bio ?? '').length}/500</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-mist">
              Country or region (optional)
              <select className="input mt-1" value={row.region ?? ''} onChange={(e) => set({ region: e.target.value || null })}>
                <option value="">Not set</option>
                {COUNTRIES.map((c) => (
                  <option key={c.iso3} value={c.iso3}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-mist">
              Language
              <select className="input mt-1" value={row.language ?? 'en'} onChange={(e) => set({ language: e.target.value })}>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-mist">
              Time zone
              <select className="input mt-1" value={row.timezone ?? ''} onChange={(e) => set({ timezone: e.target.value || null })}>
                <option value="">Browser default</option>
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="text-xs text-mist">Public visibility</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {PUBLIC_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-xs text-mist">
                  <input type="checkbox" aria-label={`Show ${f.label.toLowerCase()} publicly`} checked={row.visibility[f.key] === true} onChange={(e) => set({ visibility: { ...row.visibility, [f.key]: e.target.checked } })} /> {f.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-dim">Your email address, notes, saved research and Brain graphs are always private. Public profile pages are planned; nothing is published yet.</p>
          </fieldset>
          <div className="flex items-center gap-3">
            <button className="btn-primary text-xs" disabled={state.kind === 'saving'}>
              {state.kind === 'saving' ? 'Saving…' : 'Save profile'}
            </button>
            {state.kind === 'saved' && (
              <span role="status" className="text-xs text-up">
                Saved.
              </span>
            )}
            {state.kind === 'error' && (
              <span role="alert" className="text-xs text-down">
                {state.text}
              </span>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}
