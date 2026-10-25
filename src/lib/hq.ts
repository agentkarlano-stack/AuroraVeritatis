/**
 * HQ, the personal workspace: what the user follows, what changed since the last visit, and where to resume work.
 * Pure logic (tested); the store keeps the data (`store/prefs.ts`: `recent`, `followRegions`, `hqSeenAt`,
 * `widgetSize`; `store/saved.ts`: saved items).
 */
import type { Story } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';
import type { Region } from './events';

// ---------- Continue where you left off ----------

export type RecentKind = 'country' | 'chart' | 'map' | 'tool';
export interface RecentItem {
  /** Identity: one entry per country, chart symbol, tool; one for the last Map Explorer view. */
  key: string;
  kind: RecentKind;
  label: string;
  /** Link that reopens it with its previous settings (query string included). */
  href: string;
  /** Last opened (ISO). */
  at: string;
  /** Times opened (for Quick access). */
  count: number;
}
export const MAX_RECENT = 24;

const TOOLS: Record<string, string> = {
  '/lab': 'Monte Carlo simulation',
  '/lab?tool=backtest': 'Strategy backtesting',
  '/lab?tool=risk': 'Portfolio risk',
  '/lab?tool=drag': 'Volatility drag',
  '/lab?tool=frontier': 'Efficient frontier',
  '/lab?tool=barrier': 'Triple barrier',
  '/lab/forecasts': 'Prediction research',
  '/strategy': 'Strategy Lab',
  '/impact': 'Market Impact Radar',
  '/tension': 'World Tension Index',
  '/positioning': 'Positioning',
  '/macro': 'Macro dashboard',
  '/currency': 'Currency & purchasing power',
  '/markets/commodities': 'Commodity & Energy Monitor',
  '/news': 'News verification',
  '/brain': 'Brain',
  '/assistant': 'EVE and KNOX',
  '/countries/compare': 'Animated country explorer',
  '/countries/vs': 'Country comparison',
};

/**
 * The resumable item for a page visit, or null for pages that are not work (landing, account, legal…).
 * `countryName` resolves an ISO3 code to a name (null if unknown).
 */
export function visitFor(pathname: string, search: string, countryName: (iso3: string) => string | null): Omit<RecentItem, 'at' | 'count'> | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const dossier = path.match(/^\/countries\/([A-Za-z]{3})$/);
  if (dossier) {
    const iso3 = dossier[1]!.toUpperCase();
    const name = countryName(iso3);
    return name ? { key: `country:${iso3}`, kind: 'country', label: name, href: `/countries/${iso3}` } : null;
  }
  if ((path === '/' || path === '/radar') && params.get('k')) {
    const iso3 = params.get('k')!.toUpperCase();
    const name = countryName(iso3);
    return name ? { key: `country:${iso3}`, kind: 'country', label: name, href: `/countries/${iso3}` } : null;
  }
  if (path === '/markets') {
    const symbol = params.get('symbol');
    return symbol ? { key: `chart:${symbol}`, kind: 'chart', label: `${symbol} chart`, href: `/markets?symbol=${encodeURIComponent(symbol)}` } : null;
  }
  if (path === '/geo') return { key: 'map', kind: 'map', label: 'Map Explorer: last view', href: `/geo${search}` };
  const tool = path === '/lab' && params.get('tool') ? `/lab?tool=${params.get('tool')}` : path;
  const label = TOOLS[tool];
  return label ? { key: `tool:${tool}`, kind: 'tool', label, href: tool === path ? `${path}${search}` : tool } : null;
}

/** Adds or refreshes a visit: newest first, one entry per key, at most MAX_RECENT. */
export function recordVisit(list: RecentItem[], item: Omit<RecentItem, 'at' | 'count'>, now: string): RecentItem[] {
  const prev = list.find((r) => r.key === item.key);
  // Count sessions, not page updates: reopening within 30 minutes (or a map view changing) refreshes the entry only.
  const fresh = !prev || Date.parse(now) - Date.parse(prev.at) > 30 * 60_000;
  return [{ ...item, at: now, count: (prev?.count ?? 0) + (fresh ? 1 : 0) }, ...list.filter((r) => r.key !== item.key)].slice(0, MAX_RECENT);
}

/** Most used tools, charts and map views (Quick access), most opened first; ties by recency. */
export function frequent(list: RecentItem[], n = 6): RecentItem[] {
  return list.filter((r) => r.kind !== 'country' && r.count >= 2).sort((a, b) => b.count - a.count || b.at.localeCompare(a.at)).slice(0, n);
}

export function normalizeRecent(v: unknown): RecentItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is RecentItem => !!r && typeof r === 'object' && typeof r.key === 'string' && typeof r.href === 'string' && r.href.startsWith('/') && typeof r.label === 'string' && typeof r.at === 'string')
    .map((r) => ({ ...r, count: Number.isFinite(r.count) && r.count > 0 ? r.count : 1 }))
    .slice(0, MAX_RECENT);
}

// ---------- Watchlists and changes since the last visit ----------

export function normalizeRegions(v: unknown): Region[] {
  return Array.isArray(v) ? v.filter((r, i, a): r is Region => typeof r === 'string' && a.indexOf(r) === i && r !== 'Oceans & other').slice(0, 10) as Region[] : [];
}

export interface Update {
  title: string;
  /** ISO time of the development. */
  at: string;
  source: string;
  /** In-app link (dossier, Radar) or the source URL. */
  href: string;
  external: boolean;
}
export interface FollowUpdates {
  key: string;
  label: string;
  href: string;
  updates: Update[];
}

export interface UpdatesInput {
  countries: { iso3: string; name: string }[];
  regions: Region[];
  events: GeoEvent[];
  stories: Story[];
  /** Previous visit (epoch ms); null on the first visit: the last 24 hours are shown instead. */
  since: number | null;
  now: number;
  /** Country (ISO3) an event is located in. */
  eventCountry: (e: GeoEvent) => string | null;
  /** Countries (ISO3) a headline names. */
  storyCountries: (title: string) => string[];
  /** Region of a location (lib/events.ts `regionOf`, injected to keep this module light). */
  regionOf: (lat: number, lon: number) => Region;
}

/**
 * Developments for each followed country and region after `since`: real hazard signals (never simulated) and
 * confirmed or corroborated news stories that name the country. Newest first.
 */
export function updatesSince(inp: UpdatesInput): FollowUpdates[] {
  const from = inp.since ?? inp.now - 86_400_000;
  const evs = inp.events.filter((e) => e.provenance !== 'simulated' && Date.parse(e.time) > from);
  const sts = inp.stories.filter((s) => s.status !== 'unverified' && Date.parse(s.last) > from);
  const evUpdate = (e: GeoEvent): Update => ({ title: e.title, at: e.time, source: e.source.name, href: e.source.url, external: true });
  const byTime = (a: Update, b: Update) => b.at.localeCompare(a.at);
  const out: FollowUpdates[] = inp.countries.map((c) => ({
    key: `country:${c.iso3}`,
    label: c.name,
    href: `/?k=${c.iso3}`,
    updates: [
      ...evs.filter((e) => inp.eventCountry(e) === c.iso3).map(evUpdate),
      ...sts
        .filter((s) => inp.storyCountries(s.title).includes(c.iso3))
        .map((s) => ({ title: s.title, at: s.last, source: `${s.status}, ${s.independent.length} ${s.independent.length === 1 ? 'publisher' : 'publishers'}`, href: s.articles[0]?.url ?? '/news', external: !!s.articles[0] })),
    ].sort(byTime),
  }));
  for (const r of inp.regions)
    out.push({ key: `region:${r}`, label: r, href: '/', updates: evs.filter((e) => inp.regionOf(e.lat, e.lon) === r).map(evUpdate).sort(byTime) });
  return out;
}

/** Follow types without a connected source yet: shown with their actual status, never with invented activity. */
export const NOT_CONNECTED = [
  { kind: 'Conflicts', status: 'Not connected yet. Needs a sourced conflict dataset (UCDP access token requested; ACLED requires a licence).' },
  { kind: 'Companies', status: 'Not connected yet. Company news and filings need a licensed data feed.' },
] as const;
