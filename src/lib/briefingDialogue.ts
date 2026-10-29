/**
 * Conversation composer for the Operations Briefing (owner patch of 29 October): three roles with a natural rhythm.
 * - COMMANDER (`lead`, Xavian) frames priorities, hands over between stories and asks the questions.
 * - ANALYST (`eve`, Anna/Emma) explains every story and answers: the Commander and the Analyst carry the briefing.
 * - SECURITY OFFICER (`knox`, Adam) interjects briefly with caution, validation or operational relevance.
 * Every line is built from the facts in the source record (magnitude, depth, tsunami flag, GDACS alert level and update
 * count, publisher counts, storyline size); nothing is quoted or invented. Phrasings rotate, so the same wording is not
 * heard twice in one briefing, and each story opens with a spoken handover so there is no dead air between events.
 */
import type { CoverageStatus } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';

/** Presenter roles. Internal ids are kept: lead = Commander, eve = Analyst, knox = Security Officer. */
export type Analyst = 'lead' | 'knox' | 'eve';
export type Specialist = 'knox' | 'eve';
export interface Line {
  speaker: Analyst;
  text: string;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Facts USGS publishes in Aurora's summary line: "Magnitude 6.4 earthquake at 15 km depth" (+ tsunami flag). */
export function quakeFacts(summary: string): { magnitude: number | null; depthKm: number | null; tsunami: boolean } {
  const m = summary.match(/Magnitude\s+(\d+(?:\.\d+)?)/i);
  const d = summary.match(/at\s+(\d+(?:\.\d+)?)\s*km depth/i);
  return { magnitude: m ? Number(m[1]) : null, depthKm: d ? Number(d[1]) : null, tsunami: /tsunami flag set/i.test(summary) };
}

const DIRS: Record<string, string> = {
  N: 'north', S: 'south', E: 'east', W: 'west', NE: 'northeast', NW: 'northwest', SE: 'southeast', SW: 'southwest',
  NNE: 'north-northeast', ENE: 'east-northeast', ESE: 'east-southeast', SSE: 'south-southeast',
  SSW: 'south-southwest', WSW: 'west-southwest', WNW: 'west-northwest', NNW: 'north-northwest',
};

/** "50 km ENE of Miyako, Japan" → "50 kilometres east-northeast of Miyako, Japan" (speakable). */
export function speakPlace(place: string): string {
  return place.replace(/\b(\d+)\s*km\s+([NSEW]{1,3})\s+of\b/g, (_, d: string, dir: string) => `${d} kilometres ${DIRS[dir] ?? dir} of`).trim();
}

/** All-caps names (e.g. storm names) in title case so they are read as words, not letters. */
const speakName = (s: string) => s.replace(/\b([A-Z]{3,})(-[A-Z]{2,})?\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());

const GDACS_COLOUR: Record<number, string> = { 5: 'red', 3: 'orange', 1: 'green' };

/** The Analyst's opening sentence for an event, in plain speech. */
export function eventHeadline(e: GeoEvent): string {
  if (e.id.startsWith('usgs-')) {
    const m = e.title.match(/^M\s?(\d+(?:\.\d+)?)\s*-\s*(.+)$/);
    if (m) return `A magnitude ${m[1]} earthquake struck ${speakPlace(m[2]!)}.`;
  }
  if (e.id.startsWith('gdacs-')) {
    const where = e.region && e.region !== 'Unknown' ? ` affecting ${e.region}` : '';
    return `GDACS is tracking ${speakName(e.title)}${where}, with a ${GDACS_COLOUR[e.severity] ?? 'modelled'} alert.`;
  }
  return `${speakName(e.title)}.`;
}

/** A rotating pick: the first phrasing not used yet in this briefing (then the first one). */
function pick(options: string[], used: Set<string>): string {
  const o = options.find((x) => !used.has(x)) ?? options[0]!;
  used.add(o);
  return o;
}

interface Turn {
  ask: string[];
  answer: string;
}

function quakeTurns(e: GeoEvent, related: number): Turn[] {
  const f = quakeFacts(e.summary);
  const t: Turn[] = [];
  if (f.depthKm !== null)
    t.push({
      ask: ['How deep was it?', 'Shallow or deep?', 'What depth are we talking about?'],
      answer:
        f.depthKm <= 70
          ? `About ${num(f.depthKm)} kilometres. That's shallow, so shaking near the epicentre tends to be stronger.`
          : `Around ${num(f.depthKm)} kilometres. At that depth, surface shaking is usually weaker than for a shallow quake of the same size.`,
    });
  if (related > 0)
    t.push({
      ask: ['Is this a one-off?', 'Anything else in that area?'],
      answer: `No. There ${related === 1 ? 'is one related report' : `are ${related} related reports`} nearby within two days, so we're treating it as one sequence.`,
    });
  t.push({ ask: ['What do we know so far?', 'How much is confirmed?'], answer: 'Location, time, magnitude and depth from USGS. Damage figures are not in our sources yet.' });
  return t;
}

function gdacsTurns(e: GeoEvent, updates: number): Turn[] {
  const t: Turn[] = [];
  if (updates > 1)
    t.push({
      ask: ['Is it still developing?', 'Has the picture changed?', 'Still evolving?'],
      answer: `Yes. GDACS has issued ${updates} updates so far; we're on the latest one.`,
    });
  t.push({
    ask: ['How serious is that alert?', 'What does the colour tell us?'],
    answer:
      e.severity >= 5
        ? 'Red is the top level: GDACS models a high humanitarian impact. It is a model estimate, and it can change.'
        : e.severity >= 3
          ? 'Orange is the middle level, a medium modelled impact. It is an estimate, and it can still move.'
          : 'Green is the lowest level, a limited modelled impact.',
  });
  return t;
}

const ECON = /\b(oil|gas|lng|energy|electricity|prices?|inflation|tariffs?|trade|exports?|imports?|markets?|currenc\w*|rates?|bank|debt|budget)\b/i;

function storyTurns(title: string, status: CoverageStatus, independent: number): Turn[] {
  const pubs = `${independent} independent ${independent === 1 ? 'outlet' : 'outlets'}`;
  const t: Turn[] = [];
  if (ECON.test(title))
    t.push({
      ask: ['Any market angle?', 'Could this move prices?'],
      answer: "Not established. A headline alone doesn't show a market effect; the benchmarks are in the Market view if you want to check.",
    });
  t.push(
    status === 'confirmed'
      ? { ask: ['Who confirmed it?', 'Is that official?'], answer: `An official source published it, and ${pubs} carry it too.` }
      : { ask: ['How solid is that?', 'Can we rely on it?'], answer: `${pubs[0]!.toUpperCase()}${pubs.slice(1)} report it, but there's no official confirmation yet.` },
  );
  return t;
}

/** The Security Officer's short interjection: caution, validation or operational relevance (or none). */
function securityLine(kind: 'quake' | 'gdacs' | 'news', facts: { tsunami?: boolean; severity: number; status?: CoverageStatus; related: number }, used: Set<string>): string | null {
  if (kind === 'quake' && facts.tsunami) return pick(['Coastal warnings come from the regional tsunami centre. Follow those, not social media.', 'Flag for coastal areas: the official tsunami centre issues the warnings.'], used);
  if (kind === 'gdacs' && facts.severity >= 5) return pick(['For context, red is the level at which GDACS flags a likely need for international assistance.', 'Red means GDACS sees a possible need for outside assistance. Worth watching.'], used);
  if (kind === 'news' && facts.status !== 'confirmed') return pick(['Until there is official confirmation, I would treat the details as provisional.', 'Noting it, but unconfirmed. Details may still change.'], used);
  if (kind === 'news') return pick(['Officially confirmed, so this one is solid.', 'Confirmed at source. No caveats from my side.'], used);
  if (facts.related > 0) return pick(['Several reports in one area. We are tracking them as one storyline, not separate incidents.'], used);
  if (facts.severity >= 4) return pick(['No damage reports in our sources yet, so treat casualty claims online with caution.', 'Nothing in our sources on damage yet. Worth a check later today.'], used);
  return null;
}

export interface StoryInput {
  kind: 'event' | 'news';
  event?: GeoEvent;
  related?: number;
  story?: { title: string; status: CoverageStatus; independent: number };
  /** Spoken place for the Commander's handover (country or region), if known. */
  place: string | null;
  index: number;
}

/**
 * One story as a short conversation: Commander handover → Analyst report → Commander question → Analyst answer →
 * (Security Officer interjection). The handover is spoken while the camera travels, so there is no silence between
 * stories.
 */
export function storyConversation(s: StoryInput, used: Set<string>): Line[] {
  const place = s.place;
  const ack = s.index === 0 ? '' : pick(['Noted. ', 'Understood. ', 'Good. ', 'Right. ', ''], used);
  // The first story follows the Commander's question directly: the Analyst opens it, no handover needed.
  const handover =
    s.index === 0
      ? null
      : place
        ? `${ack}${pick([`Next, ${place}.`, `What about ${place}?`, `${place} now.`, `Go on, ${place}.`, `And ${place}?`], used)}`
        : `${ack}${pick(['What else?', 'Next.', 'Go on.'], used)}`;
  const lines: Line[] = handover ? [{ speaker: 'lead', text: handover }] : [];
  const lead0 = s.index === 0 ? (place ? `First, ${place}. ` : 'First, ') : '';
  if (s.kind === 'event' && s.event) {
    const e = s.event;
    const isQuake = e.id.startsWith('usgs-');
    const updates = Number(e.summary.match(/(\d+) GDACS updates/)?.[1] ?? 1);
    lines.push({ speaker: 'eve', text: `${lead0}${s.index === 0 && !place ? eventHeadline(e).charAt(0).toLowerCase() + eventHeadline(e).slice(1) : eventHeadline(e)}` });
    const turns = isQuake ? quakeTurns(e, s.related ?? 0) : gdacsTurns(e, updates);
    const turn = turns.find((t) => t.ask.some((a) => !used.has(a))) ?? turns[0];
    if (turn) lines.push({ speaker: 'lead', text: pick(turn.ask, used) }, { speaker: 'eve', text: turn.answer });
    const sec = securityLine(isQuake ? 'quake' : 'gdacs', { tsunami: quakeFacts(e.summary).tsunami, severity: e.severity, related: s.related ?? 0 }, used);
    if (sec) lines.push({ speaker: 'knox', text: sec });
  } else if (s.story) {
    const st = s.story;
    lines.push({ speaker: 'eve', text: `${lead0}${s.index === 0 && !place ? 'reports' : 'Reports'} from ${st.independent} independent ${st.independent === 1 ? 'outlet' : 'outlets'}: ${st.title.replace(/[.\s]+$/, '')}.` });
    const turns = storyTurns(st.title, st.status, st.independent);
    const turn = turns.find((t) => t.ask.some((a) => !used.has(a))) ?? turns[0]!;
    lines.push({ speaker: 'lead', text: pick(turn.ask, used) }, { speaker: 'eve', text: turn.answer });
    const sec = securityLine('news', { severity: 3, status: st.status, related: 0 }, used);
    if (sec) lines.push({ speaker: 'knox', text: sec });
  }
  return lines;
}
