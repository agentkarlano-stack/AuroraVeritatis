import { ArrowRight, BarChart3, Bookmark, Compass, ExternalLink, Globe2, Landmark, Map as MapIcon, Pencil, Trash2, Wrench } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Story } from '../../../shared/news';
import { useAuth } from '../../auth/AuthProvider';
import { useApi } from '../../lib/api';
import { countriesInText, countryByIso3, countryByName } from '../../lib/countries';
import { REGIONS, regionOf, useEvents, type Region } from '../../lib/events';
import { frequent, normalizeRecent, normalizeRegions, NOT_CONNECTED, updatesSince, type RecentItem } from '../../lib/hq';
import { INTRO_EXPERIENCES, type IntroExperience } from '../../lib/intro';
import { relativeTime } from '../../lib/format';
import { collections, SAVED_KINDS, type SavedItem, type SavedKind } from '../../lib/saved';
import { countryNameOf } from '../../lib/worldBriefing';
import { normalizeIdle, usePrefs } from '../../store/prefs';
import { useChartLibrary } from '../../store/chartLibrary';
import { useSaved } from '../../store/saved';

const KIND_ICON: Record<RecentItem['kind'], typeof Globe2> = { country: Landmark, chart: BarChart3, map: MapIcon, tool: Wrench };

/** Empty state: what to do, and a direct shortcut to do it. */
function Empty({ children, to, action }: { children: ReactNode; to: string; action: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-slate-dim">
      <p>{children}</p>
      <Link to={to} className="mt-2 inline-flex items-center gap-1 text-xs text-gold hover:underline">
        {action} <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

const ago = (iso: string) => relativeTime(iso);
/** Country entries are recorded with their ISO3 code (keeps the country list out of the main bundle). */
const labelOf = (r: RecentItem) => (r.kind === 'country' ? (countryByIso3(r.label)?.name ?? r.label) : r.label);

// ---------- Continue where you left off ----------

export function ResumeWidget() {
  const recent = normalizeRecent(usePrefs((s) => s.recent));
  const clearRecent = usePrefs((s) => s.clearRecent);
  if (!recent.length)
    return (
      <Empty to="/countries" action="Open a country dossier">
        Country dossiers, market charts, Map Explorer views and research tools you open appear here, so you can reopen them with the same settings.
      </Empty>
    );
  const [first, ...rest] = recent;
  const Icon = KIND_ICON[first!.kind];
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Link to={first!.href} className="group rounded-lg border border-line p-4 transition-colors hover:border-gold-dim">
        <div className="eyebrow !text-[10px]">Last opened · {ago(first!.at)}</div>
        <div className="mt-2 flex items-center gap-2">
          <Icon className="h-4 w-4 text-gold" aria-hidden />
          <span className="text-lg font-semibold text-platinum group-hover:text-gold-soft">{labelOf(first!)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-dim">Reopens with its previous settings.</p>
        <span className="mt-3 inline-flex items-center gap-1 text-xs text-gold">
          Resume <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </Link>
      <div>
        <ul className="divide-y divide-line/60">
          {rest.slice(0, 7).map((r) => {
            const I = KIND_ICON[r.kind];
            return (
              <li key={r.key}>
                <Link to={r.href} className="flex items-center gap-2 py-1.5 text-sm text-mist hover:text-platinum">
                  <I className="h-3.5 w-3.5 shrink-0 text-slate-dim" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{labelOf(r)}</span>
                  <span className="shrink-0 text-[11px] text-slate-dim">{ago(r.at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <button className="mt-2 text-[11px] text-slate-dim hover:text-mist" onClick={clearRecent}>
          Clear history
        </button>
      </div>
    </div>
  );
}

// ---------- Following: changes since the last visit ----------

export function FollowingWidget({ since }: { since: string | null }) {
  const favorites = usePrefs((s) => s.favorites);
  const regions = normalizeRegions(usePrefs((s) => s.followRegions));
  const toggleRegion = usePrefs((s) => s.toggleRegion);
  const { quakes, disasters, quakeStatus } = useEvents();
  const news = useApi<{ stories: Story[] }>('/api/news?t=7d');
  const [now] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const groups = useMemo(
    () =>
      updatesSince({
        countries: favorites.flatMap((iso3) => {
          const c = countryByIso3(iso3);
          return c ? [{ iso3, name: c.name }] : [];
        }),
        regions,
        events: [...quakes, ...disasters],
        stories: news.status === 'ready' ? news.data.stories : [],
        since: since ? Date.parse(since) : null,
        now,
        eventCountry: (e) => countryByName(countryNameOf(e))?.iso3 ?? null,
        storyCountries: (t) => countriesInText(t).map((c) => c.iso3),
        regionOf,
      }),
    [favorites, regions, quakes, disasters, news, since, now],
  );
  const total = groups.reduce((n, g) => n + g.updates.length, 0);
  const loading = quakeStatus === 'loading' || news.status === 'loading';

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-dim">
        {since ? `Since your last visit, ${relativeTime(since)}` : 'Last 24 hours (first visit)'}: hazard signals from USGS and GDACS and confirmed or corroborated news.
        {loading ? ' Loading…' : ''}
      </p>
      {groups.length === 0 ? (
        <Empty to="/countries" action="Find a country to follow">
          Follow countries (star them in a dossier or below in Followed countries) or regions to see what changed since your last visit.
        </Empty>
      ) : (
        <>
          <div className="text-sm text-platinum">
            <span className="num text-2xl font-semibold">{total}</span> {total === 1 ? 'development' : 'developments'} across {groups.length} followed
          </div>
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.key} className="rounded-md border border-line/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <Link to={g.href} className="text-sm font-medium text-platinum hover:text-gold-soft">
                    {g.label}
                  </Link>
                  <span className={`num text-xs ${g.updates.length ? 'text-gold' : 'text-slate-dim'}`}>{g.updates.length ? `${g.updates.length} new` : 'No change'}</span>
                </div>
                {g.updates.slice(0, 3).map((u) => (
                  <a key={u.href + u.title} href={u.href} target={u.external ? '_blank' : undefined} rel="noreferrer noopener" className="mt-1 block text-xs text-mist hover:text-platinum">
                    {u.title} <span className="text-slate-dim">· {u.source} · {relativeTime(u.at)}</span>
                    {u.external && <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" aria-hidden />}
                  </a>
                ))}
                {g.updates.length > 3 && <div className="mt-1 text-[11px] text-slate-dim">and {g.updates.length - 3} more</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="border-t border-line pt-2">
        <button className="text-xs text-gold hover:underline" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          {adding ? 'Done' : 'Follow regions, conflicts, companies'}
        </button>
        {adding && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Followed regions">
              {REGIONS.filter((r) => r !== 'Oceans & other').map((r) => (
                <button key={r} className="chip text-[11px]" aria-pressed={regions.includes(r)} onClick={() => toggleRegion(r as Region)}>
                  {r}
                </button>
              ))}
            </div>
            {NOT_CONNECTED.map((n) => (
              <p key={n.kind} className="text-[11px] text-slate-dim">
                <span className="text-mist">{n.kind}:</span> {n.status}
              </p>
            ))}
            <p className="text-[11px] text-slate-dim">
              Instruments: <Link to="/markets" className="text-gold hover:underline">add to the instrument watchlist</Link> (simulated prices until a licensed feed is connected).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Saved intelligence ----------

export function SavedWidget() {
  const { items, update, remove, renameCollection, sync, syncMessage } = useSaved();
  const { status } = useAuth();
  const [kind, setKind] = useState<SavedKind | 'all'>('all');
  const [coll, setColl] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const cols = collections(items);
  const kinds = [...new Set(items.map((i) => i.kind))];
  const shown = items.filter((i) => (kind === 'all' || i.kind === kind) && (coll === null || i.collection === coll));
  const syncText =
    status !== 'signed-in'
      ? 'Saved in this browser. Sign in to keep them with your account.'
      : sync === 'synced'
        ? 'Synced with your account.'
        : sync === 'syncing'
          ? 'Syncing…'
          : (syncMessage ?? 'Saved in this browser.');

  if (!items.length)
    return (
      <Empty to="/" action="Open Global Radar">
        Use the Save button on an event, a news story, a briefing summary, a country dossier or a Map Explorer view. Saved items can be grouped into collections and annotated here.
      </Empty>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <button className="chip text-[11px]" aria-pressed={kind === 'all' && coll === null} onClick={() => (setKind('all'), setColl(null))}>
          All {items.length}
        </button>
        {kinds.map((k) => (
          <button key={k} className="chip text-[11px]" aria-pressed={kind === k} onClick={() => setKind(kind === k ? 'all' : k)}>
            {SAVED_KINDS[k]}
          </button>
        ))}
      </div>
      {cols.length > 1 || cols[0]?.name ? (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-slate-dim">Collections:</span>
          {cols.map((c) => (
            <button key={c.name || '_'} className="chip text-[11px]" aria-pressed={coll === c.name} onClick={() => setColl(coll === c.name ? null : c.name)}>
              {c.name || 'Unsorted'} <span className="num text-slate-dim">{c.count}</span>
            </button>
          ))}
          {coll && (
            <button
              className="text-[11px] text-gold hover:underline"
              onClick={() => {
                const to = window.prompt('Rename collection', coll);
                if (to !== null) {
                  renameCollection(coll, to.trim());
                  setColl(to.trim());
                }
              }}
            >
              Rename
            </button>
          )}
        </div>
      ) : null}
      <ul className="divide-y divide-line/60">
        {shown.slice(0, 12).map((i) => (
          <SavedRow key={i.id} item={i} editing={editing === i.id} onEdit={() => setEditing(editing === i.id ? null : i.id)} update={update} remove={remove} collections={cols.map((c) => c.name).filter(Boolean)} />
        ))}
      </ul>
      {shown.length > 12 && <p className="text-[11px] text-slate-dim">{shown.length - 12} more; filter by type or collection.</p>}
      <p className={`text-[11px] ${sync === 'error' ? 'text-warn' : 'text-slate-dim'}`}>{syncText}</p>
    </div>
  );
}

function SavedRow({
  item,
  editing,
  onEdit,
  update,
  remove,
  collections: names,
}: {
  item: SavedItem;
  editing: boolean;
  onEdit: () => void;
  update: (id: string, patch: Partial<Pick<SavedItem, 'title' | 'collection' | 'note'>>) => void;
  remove: (id: string) => void;
  collections: string[];
}) {
  const [note, setNote] = useState(item.note);
  const [collection, setCollection] = useState(item.collection);
  const link = item.href ? (
    <Link to={item.href} className="text-sm text-platinum hover:text-gold-soft">
      {item.title}
    </Link>
  ) : (
    <a href={item.url} target="_blank" rel="noreferrer noopener" className="text-sm text-platinum hover:text-gold-soft">
      {item.title} <ExternalLink className="inline h-3 w-3" aria-hidden />
    </a>
  );
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          {link}
          <div className="text-[11px] text-slate-dim">
            {SAVED_KINDS[item.kind]} · saved {relativeTime(item.createdAt)}
            {item.collection && ` · ${item.collection}`}
            {item.href && item.url && (
              <a href={item.url} target="_blank" rel="noreferrer noopener" className="ml-1 text-gold hover:underline">
                source
              </a>
            )}
          </div>
          {item.note && !editing && <p className="mt-1 whitespace-pre-line text-xs text-mist">{item.note}</p>}
        </div>
        <button className="btn-quiet px-1" aria-label={`Edit note for ${item.title}`} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button className="btn-quiet px-1" aria-label={`Remove ${item.title}`} onClick={() => remove(item.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {editing && (
        <form
          className="mt-2 space-y-2 pl-5"
          onSubmit={(e) => {
            e.preventDefault();
            update(item.id, { note, collection });
            onEdit();
          }}
        >
          <textarea className="input min-h-16 text-xs" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Personal note" aria-label="Personal note" />
          <div className="flex gap-2">
            <input className="input text-xs" list={`cols-${item.id}`} value={collection} onChange={(e) => setCollection(e.target.value)} maxLength={60} placeholder="Collection (e.g. Energy security)" aria-label="Collection" />
            <datalist id={`cols-${item.id}`}>
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button className="btn-primary text-xs">Save</button>
          </div>
        </form>
      )}
    </li>
  );
}

// ---------- Quick access ----------

const STARTERS: [string, string][] = [
  ['/', 'Global Radar'],
  ['/geo', 'Map Explorer'],
  ['/countries', 'Countries'],
  ['/markets', 'Market terminal'],
  ['/lab', 'Quant Research'],
  ['/news', 'News verification'],
];

export function QuickWidget() {
  const recent = normalizeRecent(usePrefs((s) => s.recent));
  const top = frequent(recent);
  // Select stable store values, then derive (a selector returning a new array re-renders forever).
  const items = useSaved((s) => s.items);
  const views = items.filter((i) => i.kind === 'map' || i.kind === 'chart').slice(0, 6);
  const layouts = useChartLibrary((s) => s.layouts).slice(-4).reverse();
  return (
    <div className="space-y-3">
      {top.length > 0 ? (
        <div>
          <div className="eyebrow mb-1.5 !text-[10px]">Used most</div>
          <div className="flex flex-wrap gap-1.5">
            {top.map((r) => (
              <Link key={r.key} to={r.href} className="chip text-xs">
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="eyebrow mb-1.5 !text-[10px]">Start here</div>
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map(([to, label]) => (
              <Link key={to} to={to} className="chip text-xs">
                {label}
              </Link>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-dim">Tools you open on two or more occasions replace these shortcuts.</p>
        </div>
      )}
      <div>
        <div className="eyebrow mb-1.5 !text-[10px]">Saved map views and charts</div>
        {views.length ? (
          <ul className="space-y-1">
            {views.map((v) => (
              <li key={v.id}>
                <Link to={v.href} className="flex items-center gap-1.5 text-xs text-mist hover:text-platinum">
                  {v.kind === 'map' ? <Compass className="h-3 w-3" aria-hidden /> : <BarChart3 className="h-3 w-3" aria-hidden />} {v.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-slate-dim">
            None yet. Use Save view in <Link to="/geo" className="text-gold hover:underline">Map Explorer</Link> or Save on a chart.
          </p>
        )}
      </div>
      {layouts.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5 !text-[10px]">Chart analyses (this browser)</div>
          <ul className="space-y-1">
            {layouts.map((l) => (
              <li key={l.savedAt}>
                <Link to={`/markets?symbol=${encodeURIComponent(l.symbol)}`} className="text-xs text-mist hover:text-platinum">
                  {l.name} <span className="text-slate-dim">· {l.symbol}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Preferences ----------

export function PreferencesWidget() {
  const idle = normalizeIdle(usePrefs((s) => s.idle));
  const setIdle = usePrefs((s) => s.setIdle);
  const intro = usePrefs((s) => s.intro);
  const setIntro = usePrefs((s) => s.setIntro);
  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center justify-between gap-3 text-mist">
        <span>
          Idle tour in Global Radar
          <span className="block text-[11px] text-slate-dim">Full screen after inactivity; any click returns.</span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-[#c9a35a]" checked={idle.radar} onChange={(e) => setIdle({ radar: e.target.checked })} aria-label="Automatic idle tour in Global Radar" />
      </label>
      <p className="text-[11px] text-slate-dim">Markets and Countries idle presentations: not available yet.</p>
      <label className="block text-mist">
        Introduction
        <select className="input mt-1 text-xs" value={intro ?? 'auto'} onChange={(e) => setIntro(e.target.value === 'auto' ? null : (e.target.value as IntroExperience))}>
          <option value="auto">Automatic (film once, then brand)</option>
          {INTRO_EXPERIENCES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-slate-dim">
        Notifications: price alerts are shown in the app only; email and push delivery are not connected yet.
      </p>
      <Link to="/account" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">
        Profile background and all settings <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

