/**
 * Briefing and tour plans: a ranked, de-duplicated and frozen set of scenes for the Global Radar presentation.
 *
 * - Events: invalid coordinates are dropped (never moved to a default spot); reports of the same real event are merged
 *   (`dedupeEvents`), and closely related events (same category and country within 48 hours, e.g. an aftershock
 *   sequence) form one storyline, so the briefing does not repeat itself. Multiple reports are not treated as
 *   independent confirmation.
 * - News: grouped stories that name a country (so the map can frame it), confirmed or corroborated first.
 * - Every scene has a lead analyst (EVE: economy, markets, trade, energy; KNOX: security, defence, geopolitics and
 *   hazards) and short lines built only from the source facts. The plan keeps the whole presentation within about
 *   one minute by dropping lower-ranked stories, never by shortening text.
 */
import type { CoverageStatus, Story } from '../../shared/news';
import type { GeoEvent, SourceRef } from '../../shared/types';
import { countryNameOf, dedupeEvents, type BriefingItem } from './worldBriefing';

export type ReportingWindow = '24h' | '3d' | '7d';
export const WINDOWS: Record<ReportingWindow, { label: string; hours: number }> = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '3d': { label: 'Last 3 days', hours: 72 },
  '7d': { label: 'Last 7 days', hours: 168 },
};
export type Analyst = 'eve' | 'knox';
export const ANALYSTS: Record<Analyst, { name: string; role: string }> = {
  eve: { name: 'EVE', role: 'Economy and markets' },
  knox: { name: 'KNOX', role: 'Security and geopolitics' },
};

export interface Line {
  speaker: Analyst;
  text: string;
}

export interface Scene {
  id: string;
  kind: 'event' | 'news';
  title: string;
  /** One or two sentences from the source facts. */
  explanation: string;
  /** ISO time of the latest development in the scene. */
  date: string;
  sources: SourceRef[];
  /** Point to frame, or a country to fit (news without coordinates). */
  lat?: number;
  lon?: number;
  iso3?: string;
  /** How many related reports or developments the scene combines. */
  related: number;
  lead: Analyst;
  lines: Line[];
  /** Planned duration in the written presentation (ms). */
  readMs: number;
  /** Planned duration in the narrated presentation (ms); the narration may run slightly longer. */
  speakMs: number;
}

export interface Plan {
  window: ReportingWindow;
  /** Content version: changes only when the selected stories change (used for caching scripts and audio). */
  version: string;
  scenes: Scene[];
  intro: Line;
}

/** Valid map location: finite, in range, not the 0,0 placeholder. */
export function validLocation(e: Pick<GeoEvent, 'lat' | 'lon'>): boolean {
  return Number.isFinite(e.lat) && Number.isFinite(e.lon) && Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180 && !(e.lat === 0 && e.lon === 0);
}

const ECONOMY = /\b(econom\w*|market\w*|stocks?|shares?|trade|tariffs?|exports?|imports?|inflation|interest rates?|central bank|currenc\w*|bonds?|oil|gas|lng|energy|electricity|prices?|gdp|recession|budget|debt|supply chains?|shipping|ports?|commodit\w*|investment|banks?|wheat|grain)\b/i;
export const leadFor = (text: string): Analyst => (ECONOMY.test(text) ? 'eve' : 'knox');

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** Comfortable reading time plus camera movement. */
const readMs = (text: string) => Math.min(13_000, Math.max(6_500, 1_800 + (words(text) / 3.2) * 1000));
/** Speaking time at a calm pace (about 2.6 words per second) plus a short pause per line. */
const speakMs = (lines: Line[]) => lines.reduce((t, l) => t + (words(l.text) / 2.6) * 1000 + 450, 1_200);
const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
/** Lead of a source summary: the first sentence, plus the second while it stays short. */
const summaryLead = (s: string) => {
  const one = firstSentence(s);
  const two = firstSentence(s.slice(one.length).trim());
  return two && one.length + two.length <= 160 ? `${one} ${two}` : one;
};

export interface Storyline {
  lead: BriefingItem;
  items: BriefingItem[];
}

/** Groups merged events into storylines: same category and country, within 48 hours. */
export function storylines(items: BriefingItem[]): Storyline[] {
  const out: Storyline[] = [];
  for (const it of [...items].sort((a, b) => b.event.severity - a.event.severity || Date.parse(b.event.time) - Date.parse(a.event.time))) {
    const country = countryNameOf(it.event);
    const home = country
      ? out.find(
          (s) =>
            s.lead.event.category === it.event.category &&
            countryNameOf(s.lead.event) === country &&
            Math.abs(Date.parse(s.lead.event.time) - Date.parse(it.event.time)) <= 48 * 3_600_000,
        )
      : undefined;
    if (home) home.items.push(it);
    else out.push({ lead: it, items: [it] });
  }
  return out;
}

function eventScene(s: Storyline, rank: number): Scene {
  const e = s.lead.event;
  // One entry per report; repeated publisher names are numbered so each link stays distinguishable.
  const seen = new Map<string, number>();
  const sources = [...new Map(s.items.flatMap((i) => i.sources).map((x) => [x.url, x])).values()].map((x) => {
    const n = (seen.get(x.name) ?? 0) + 1;
    seen.set(x.name, n);
    return n > 1 ? { ...x, name: `${x.name} (report ${n})` } : x;
  });
  const latest = s.items.reduce((m, i) => (Date.parse(i.event.time) > Date.parse(m) ? i.event.time : m), e.time);
  const lead = leadFor(`${e.title} ${e.summary}`);
  const other: Analyst = lead === 'eve' ? 'knox' : 'eve';
  const more = s.items.length > 1 ? ` ${s.items.length - 1} related ${s.items.length === 2 ? 'report follows' : 'reports follow'} the same storyline.` : '';
  const explanation = `${summaryLead(e.summary) || e.title}${more}`.trim();
  const lines: Line[] = [{ speaker: lead, text: `${e.title}. ${explanation}` }];
  // A viewer's question only where the sources answer it, and only for the two most important stories.
  if (rank < 2 && e.severity >= 4) {
    const gdacs = s.items.find((i) => i.event.id.startsWith('gdacs-'))?.event;
    const usgs = s.items.find((i) => i.event.id.startsWith('usgs-'))?.event;
    if (gdacs) {
      const level = gdacs.severity >= 5 ? 'red, its highest level' : 'orange, a medium level';
      lines.push({ speaker: other, text: 'Why does this matter?' }, { speaker: lead, text: `GDACS rates the modelled humanitarian impact as ${level}.` });
    } else if (usgs) {
      lines.push(
        { speaker: other, text: 'What should we watch next?' },
        { speaker: lead, text: 'Official damage reports and any tsunami messages from the regional warning centre.' },
      );
    }
  }
  return {
    id: `ev:${e.id}`,
    kind: 'event',
    title: e.title,
    explanation,
    date: latest,
    sources,
    lat: e.lat,
    lon: e.lon,
    related: s.items.length - 1,
    lead,
    lines,
    readMs: readMs(`${e.title} ${explanation}`),
    speakMs: speakMs(lines),
  };
}

const STATUS_WORD: Record<CoverageStatus, string> = { confirmed: 'Confirmed by an official source', corroborated: 'Corroborated', unverified: 'Not yet verified' };

function newsScene(st: Story, iso3: string, rank: number): Scene {
  const lead = leadFor(st.title);
  const other: Analyst = lead === 'eve' ? 'knox' : 'eve';
  const n = st.independent.length;
  const explanation = `${STATUS_WORD[st.status]}: ${n} independent ${n === 1 ? 'publisher' : 'publishers'}.`;
  const lines: Line[] = [{ speaker: lead, text: `${st.title}. ${explanation}` }];
  if (rank < 2 && lead === 'eve' && /\b(oil|gas|lng|energy|electricity)\b/i.test(st.title)) {
    lines.push({ speaker: other, text: 'Could this affect energy prices?' }, { speaker: lead, text: 'The reports do not say yet. Watch the benchmark prices in the Commodity Monitor.' });
  } else if (rank < 2 && st.status !== 'confirmed') {
    lines.push({ speaker: other, text: 'How solid is this?' }, { speaker: lead, text: 'Several outlets report it, but no official source yet. Treat details as provisional.' });
  }
  const sources: SourceRef[] = st.articles.slice(0, 3).map((a) => ({ name: a.domain, url: a.url, license: '' }));
  return {
    id: `news:${st.id}`,
    kind: 'news',
    title: st.title,
    explanation,
    date: st.last,
    sources,
    iso3,
    related: Math.max(0, st.articles.length - 1),
    lead,
    lines,
    readMs: readMs(`${st.title} ${explanation}`),
    speakMs: speakMs(lines),
  };
}

export interface PlanInput {
  window: ReportingWindow;
  now: number;
  events: GeoEvent[];
  stories: Story[];
  /** Country named in a headline (ISO3), for framing news without coordinates. */
  countryOf: (text: string) => string | null;
  /** Presentation budget in ms (default 58 s). */
  budgetMs?: number;
  mode: 'read' | 'play';
}

/** Builds a frozen plan: the best stories that fit the time budget, alternating hazards and news where possible. */
export function buildPlan(inp: PlanInput): Plan {
  const from = inp.now - WINDOWS[inp.window].hours * 3_600_000;
  const evs = inp.events.filter((e) => e.provenance !== 'simulated' && validLocation(e) && Date.parse(e.time) >= from && Date.parse(e.time) <= inp.now + 60_000);
  const lines = storylines(dedupeEvents(evs)).filter((s) => s.lead.event.severity >= 3);
  const eventScenes = lines.map((s, i) => eventScene(s, i));
  const statusRank: Record<CoverageStatus, number> = { confirmed: 0, corroborated: 1, unverified: 2 };
  const news = inp.stories
    .filter((s) => Date.parse(s.last) >= from && s.status !== 'unverified')
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.independent.length - a.independent.length)
    .map((s) => ({ s, iso3: inp.countryOf(s.title) }))
    .filter((x): x is { s: Story; iso3: string } => !!x.iso3)
    .map((x, i) => newsScene(x.s, x.iso3, i));
  // Interleave by importance: event, news, event, news…
  const merged: Scene[] = [];
  for (let i = 0; i < Math.max(eventScenes.length, news.length); i++) {
    if (eventScenes[i]) merged.push(eventScenes[i]!);
    if (news[i]) merged.push(news[i]!);
  }
  const budget = inp.budgetMs ?? 58_000;
  const intro: Line = { speaker: 'knox', text: `Aurora briefing. ${WINDOWS[inp.window].label}.` };
  const dur = (s: Scene) => (inp.mode === 'play' ? s.speakMs : s.readMs);
  const scenes: Scene[] = [];
  let used = inp.mode === 'play' ? speakMs([intro]) : 0;
  for (const s of merged) {
    if (used + dur(s) > budget) continue;
    scenes.push(s);
    used += dur(s);
  }
  return { window: inp.window, version: hash(scenes.map((s) => s.id + s.date).join('|')), scenes, intro };
}

/** Small stable hash (FNV-1a, hex) for content versions. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** Auto Tour: the same frozen, de-duplicated scenes over the last three days, read at a calm pace (about two minutes, looped). */
export function buildTour(inp: Omit<PlanInput, 'window' | 'mode' | 'budgetMs'>): Plan {
  return buildPlan({ ...inp, window: '3d', mode: 'read', budgetMs: 120_000 });
}
