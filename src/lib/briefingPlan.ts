/**
 * Briefing and tour plans: a ranked, de-duplicated and frozen set of scenes for the Global Radar presentation.
 *
 * - Events: invalid coordinates are dropped (never moved to a default spot); reports of the same real event are merged
 *   (`dedupeEvents`), and closely related events (same category and country within 48 hours, e.g. an aftershock
 *   sequence) form one storyline, so the briefing does not repeat itself. Multiple reports are not treated as
 *   independent confirmation.
 * - News: grouped stories that name a country (so the map can frame it), confirmed or corroborated first.
 * - Every scene has a lead analyst (EVE: economy, markets, trade, energy; KNOX: security, defence, geopolitics and
 *   hazards) and one short EVE–KNOX exchange built only from the source facts (`briefingDialogue.ts`). The plan keeps
 *   the presentation near two minutes by selecting fewer stories, never by shortening or speeding up speech.
 */
import type { CoverageStatus, Story } from '../../shared/news';
import type { GeoEvent, SourceRef } from '../../shared/types';
import { eventTurns, exchange, storyTurns, type Analyst, type Line, type Specialist } from './briefingDialogue';
import { countryNameOf, dedupeEvents, type BriefingItem } from './worldBriefing';

export type ReportingWindow = '24h' | '3d' | '7d';
export const WINDOWS: Record<ReportingWindow, { label: string; hours: number }> = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '3d': { label: 'Last 3 days', hours: 72 },
  '7d': { label: 'Last 7 days', hours: 168 },
};
export type { Analyst, Line, Specialist } from './briefingDialogue';
/**
 * Presenter roles (fictional Aurora presentation roles, not real ranks): display title, spoken form of address and
 * remit. EVE and KNOX remain the internal identities of the two specialists.
 */
export const ANALYSTS: Record<Analyst, { name: string; address: string; role: string }> = {
  lead: { name: 'COMMAND', address: 'Commander', role: 'Lead presenter' },
  knox: { name: 'SECURITY OFFICER', address: 'Lieutenant', role: 'Military, security and hazards' },
  eve: { name: 'RISK ANALYST', address: 'Operator', role: 'Economy, markets and civilian risk' },
};
/** One persistent identity colour per presenter (identifies voices only; never severity or territorial actors). */
export const SPEAKER_COLOR: Record<Analyst, string> = { lead: '#C9A35A', knox: '#8FB3D9', eve: '#7CC4B4' };


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
  /** Presenter who reports the scene (COMMAND for the opening and closing). */
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
  /** Closing line by COMMAND (narrated briefings). */
  outro: Line;
}

/** Valid map location: finite, in range, not the 0,0 placeholder. */
export function validLocation(e: Pick<GeoEvent, 'lat' | 'lon'>): boolean {
  return Number.isFinite(e.lat) && Number.isFinite(e.lon) && Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180 && !(e.lat === 0 && e.lon === 0);
}

const ECONOMY = /\b(econom\w*|market\w*|stocks?|shares?|trade|tariffs?|exports?|imports?|inflation|interest rates?|central bank|currenc\w*|bonds?|oil|gas|lng|energy|electricity|prices?|gdp|recession|budget|debt|supply chains?|shipping|ports?|commodit\w*|investment|banks?|wheat|grain)\b/i;
export const leadFor = (text: string): Specialist => (ECONOMY.test(text) ? 'eve' : 'knox');

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

function eventScene(s: Storyline, used: Set<string>): Scene {
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
  const more = s.items.length > 1 ? ` ${s.items.length - 1} related ${s.items.length === 2 ? 'report follows' : 'reports follow'} the same storyline.` : '';
  const explanation = `${summaryLead(e.summary) || e.title}${more}`.trim();
  const updates = Number(e.summary.match(/(\d+) GDACS updates/)?.[1] ?? 1);
  const lines: Line[] = [{ speaker: lead, text: `${e.title}. ${explanation}` }, ...exchange(lead, eventTurns(e, s.items.length - 1, updates), used)];
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

function newsScene(st: Story, iso3: string, used: Set<string>): Scene {
  const lead = leadFor(st.title);
  const n = st.independent.length;
  const explanation = `${STATUS_WORD[st.status]}: ${n} independent ${n === 1 ? 'publisher' : 'publishers'}.`;
  const lines: Line[] = [{ speaker: lead, text: `${st.title}. ${explanation}` }, ...exchange(lead, storyTurns(st.title, st.status, n, lead), used)];
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
  /** Presentation budget in ms (default about two minutes). */
  budgetMs?: number;
  mode: 'read' | 'play';
  /** End of the covered period (epoch ms); default `now`. Voiced editions cover the 24 hours before their edition time. */
  until?: number;
  /** Spoken opening line (default names the period). */
  introText?: string;
}

/** About two minutes, with a modest overrun allowed so a meaningful exchange is never cut. */
export const BUDGET_MS = 120_000;
export const OVERRUN_MS = 15_000;

/** Builds a frozen plan: the best stories that fit the time budget, alternating hazards and news where possible. */
export function buildPlan(inp: PlanInput): Plan {
  const until = inp.until ?? inp.now;
  const from = until - WINDOWS[inp.window].hours * 3_600_000;
  const evs = inp.events.filter((e) => e.provenance !== 'simulated' && validLocation(e) && Date.parse(e.time) >= from && Date.parse(e.time) <= until + 60_000);
  const used = new Set<string>();
  const lines = storylines(dedupeEvents(evs)).filter((s) => s.lead.event.severity >= 3);
  const eventScenes = lines.map((s) => eventScene(s, used));
  const statusRank: Record<CoverageStatus, number> = { confirmed: 0, corroborated: 1, unverified: 2 };
  const news = inp.stories
    .filter((s) => Date.parse(s.last) >= from && Date.parse(s.last) <= until + 60_000 && s.status !== 'unverified')
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.independent.length - a.independent.length)
    .map((s) => ({ s, iso3: inp.countryOf(s.title) }))
    .filter((x): x is { s: Story; iso3: string } => !!x.iso3)
    .map((x) => newsScene(x.s, x.iso3, used));
  // Interleave by importance: event, news, event, news…
  const merged: Scene[] = [];
  for (let i = 0; i < Math.max(eventScenes.length, news.length); i++) {
    if (eventScenes[i]) merged.push(eventScenes[i]!);
    if (news[i]) merged.push(news[i]!);
  }
  const budget = inp.budgetMs ?? BUDGET_MS;
  const intro: Line = { speaker: 'lead', text: inp.introText ?? `Aurora briefing. ${WINDOWS[inp.window].label}.` };
  const dur = (s: Scene) => (inp.mode === 'play' ? s.speakMs : s.readMs);
  const scenes: Scene[] = [];
  let spent = inp.mode === 'play' ? speakMs([intro]) + 2_500 : 0;
  for (const s of merged) {
    // Whole stories only: a story may finish slightly past the budget, but none starts once it is used up.
    if (spent >= budget || spent + dur(s) > budget + OVERRUN_MS) continue;
    scenes.push(s);
    spent += dur(s);
  }
  const outro: Line = { speaker: 'lead', text: 'That concludes this Operations Briefing. The sources and the full transcript follow.' };
  return { window: inp.window, version: hash(scenes.map((s) => s.id + s.date).join('|')), scenes, intro, outro };
}

/** Small stable hash (FNV-1a, hex) for content versions. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** Comfort Mode: the same frozen, de-duplicated scenes over the last three days, read at a calm pace (looped). */
export function buildTour(inp: Omit<PlanInput, 'window' | 'mode' | 'budgetMs'>): Plan {
  return buildPlan({ ...inp, window: '3d', mode: 'read', budgetMs: 150_000 });
}
