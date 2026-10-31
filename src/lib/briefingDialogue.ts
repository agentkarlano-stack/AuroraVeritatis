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

/** Publisher display name for a domain (registry name, else the bare domain). */
export type NameOf = (domain: string) => string;

function storyTurns(st: NewsTalk, nameOf: NameOf): Turn[] {
  const pubs = st.publishers.map(nameOf);
  const two = pubs.slice(0, 2).join(' and ');
  const t: Turn[] = [];
  if (st.summary)
    t.push({
      ask: ['What do we know beyond the headline?', "What's actually happened?", 'Give me the detail.', 'Go on.'],
      answer: `${firstSentence(st.summary)}`,
    });
  t.push(
    st.status === 'confirmed'
      ? { ask: ['Is that official?', 'Who has confirmed it?'], answer: `It's on the record: ${st.official ? nameOf(st.official) : 'an official source'} has published it.` }
      : st.status === 'corroborated'
        ? { ask: ['How firm is that?', 'Is anyone else carrying it?'], answer: `${two} are both reporting it, each with their own sourcing.` }
        : { ask: ['How firm is that?', 'Who else has it?'], answer: `So far only ${pubs[0] ?? 'one outlet'} has it. We treat it as a lead, not a fact.` },
  );
  return t;
}

const firstSentence = (s: string) => {
  const one = (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
  return one.length > 230 ? `${one.slice(0, 227).replace(/\s+\S*$/, '')}…` : one;
};

/** The Security Officer's short interjection: source confidence or operational caution, from the record only. */
function securityLine(kind: 'quake' | 'gdacs' | 'news', facts: { tsunami?: boolean; severity: number; status?: CoverageStatus; related: number }, used: Set<string>): string | null {
  if (kind === 'quake' && facts.tsunami) return pick(['Coastal warnings come from the regional tsunami centre. Follow those, not social media.', 'Flag for coastal areas: the official tsunami centre issues the warnings.'], used);
  if (kind === 'gdacs' && facts.severity >= 5) return pick(['For context, red is the level at which GDACS flags a likely need for international assistance.', 'Red means GDACS sees a possible need for outside assistance. Worth watching.'], used);
  if (kind === 'news' && facts.status === 'unverified') return pick(['Until there is official confirmation, I would treat the details as provisional.', 'Single-source for now. Details may still change.'], used);
  if (facts.related > 0) return pick(['Several reports in one area. We are tracking them as one storyline, not separate incidents.'], used);
  if (facts.severity >= 4) return pick(['No damage reports in our sources yet, so treat casualty claims online with caution.', 'Nothing in our sources on damage yet. Worth a check later today.'], used);
  return null;
}

export interface NewsTalk {
  title: string;
  status: CoverageStatus;
  /** Independent publisher domains, most established first. */
  publishers: string[];
  official?: string | null;
  /** Provider excerpt of the lead article (attributed to its publisher when spoken). */
  summary?: string | null;
}

export interface StoryInput {
  kind: 'event' | 'news';
  event?: GeoEvent;
  related?: number;
  story?: NewsTalk;
  /** Spoken place for the Commander's handover (country or region), if known. */
  place: string | null;
  index: number;
}

/**
 * One story as a short conversation: Commander handover → Analyst report → Commander question → Analyst answer →
 * (Security Officer interjection). The handover is spoken while the camera travels, so there is no silence between
 * stories.
 */
export function storyConversation(s: StoryInput, used: Set<string>, nameOf: NameOf = (d) => d): Line[] {
  const place = s.place;
  const ack = s.index === 0 ? '' : pick(['Understood. ', 'Right. ', 'Copy. ', '', ''], used);
  // The Commander's opening already names the first story: the Analyst starts it directly.
  const handover =
    s.index === 0
      ? null
      : place
        ? `${ack}${pick([`Moving to ${place}.`, `${place}, Operator.`, `Shift to ${place}.`, `What about ${place}?`, `And ${place}?`], used)}`
        : `${ack}${pick(['What else?', 'Next item.', 'Go on.'], used)}`;
  const lines: Line[] = handover ? [{ speaker: 'lead', text: handover }] : [];
  if (s.kind === 'event' && s.event) {
    const e = s.event;
    const isQuake = e.id.startsWith('usgs-');
    const updates = Number(e.summary.match(/(\d+) GDACS updates/)?.[1] ?? 1);
    lines.push({ speaker: 'eve', text: eventHeadline(e) });
    const turns = isQuake ? quakeTurns(e, s.related ?? 0) : gdacsTurns(e, updates);
    const turn = turns.find((t) => t.ask.some((a) => !used.has(a))) ?? turns[0];
    if (turn) lines.push({ speaker: 'lead', text: pick(turn.ask, used) }, { speaker: 'eve', text: turn.answer });
    const sec = securityLine(isQuake ? 'quake' : 'gdacs', { tsunami: quakeFacts(e.summary).tsunami, severity: e.severity, related: s.related ?? 0 }, used);
    if (sec) lines.push({ speaker: 'knox', text: sec });
  } else if (s.story) {
    const st = s.story;
    const by = st.publishers[0] ? nameOf(st.publishers[0]) : null;
    const head = st.title.replace(/[.\s]+$/, '');
    lines.push({ speaker: 'eve', text: by ? pick([`${by} reports: ${head}.`, `${head}. That's from ${by}.`], used) : `${head}.` });
    // Detail first, then confidence: at most two questions, never the same formula twice in an edition.
    for (const turn of storyTurns(st, nameOf).slice(0, 2)) {
      const ask = turn.ask.find((a) => !used.has(a));
      if (!ask) continue;
      used.add(ask);
      lines.push({ speaker: 'lead', text: ask }, { speaker: 'eve', text: turn.answer });
    }
    const sec = securityLine('news', { severity: 3, status: st.status, related: 0 }, used);
    if (sec) lines.push({ speaker: 'knox', text: sec });
  }
  return lines;
}

/** Short spoken description of a story for the Commander's opening ("a magnitude 6.1 earthquake in Japan"). */
export function topicOf(s: StoryInput): string {
  if (s.kind === 'event' && s.event) {
    const e = s.event;
    const m = e.title.match(/^M\s?(\d+(?:\.\d+)?)/);
    if (e.id.startsWith('usgs-') && m) return `a magnitude ${m[1]} earthquake${s.place ? ` in ${s.place}` : ''}`;
    const name = speakName(e.title).replace(/^(Green|Orange|Red)\s+/i, '');
    return `${name.charAt(0).toLowerCase()}${name.slice(1)}${s.place && !name.includes(s.place) ? ` affecting ${s.place}` : ''}`;
  }
  const t = s.story?.title ?? '';
  const where = s.place ?? 'one region';
  if (/\b(strikes?|attacks?|clash\w*|fighting|missiles?|drones?|shelling|troops|offensive|killed|militants?|war)\b/i.test(t)) return `security reporting from ${where}`;
  if (/\b(talks|summit|ceasefire|truce|minister|election\w*|vote|sanctions?|treaty|diplomat\w*|president|parliament)\b/i.test(t)) return `political developments in ${where}`;
  if (/\b(econom\w*|inflation|tariffs?|trade|oil|gas|markets?|currency|bank|debt|prices?)\b/i.test(t)) return `economic news from ${where}`;
  return `a developing story in ${where}`;
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
const join = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** Commander's opening: the actual items of the period, then a direct tasking of the Analyst. */
export function openingLine(topics: string[], firstPlace: string | null, variant: number): string {
  const lead = ["All right, let's get started.", "Let's begin.", 'Okay, listen up.'][variant % 3]!;
  if (!topics.length) return `${lead} Quiet period. Operator, anything I should know?`;
  const n = NUMBER_WORDS[topics.length] ?? String(topics.length);
  const items = `${n} ${topics.length === 1 ? 'item' : 'items'} from the last twenty-four hours: ${join(topics)}.`;
  return `${lead} ${items} Operator, ${firstPlace ? `start with ${firstPlace}` : 'take the first one'}.`;
}

/** Commander's closing: names what to keep watching. */
export function closingLine(places: string[], variant: number): string {
  const watch = places.length ? `Keep watching ${join(places.slice(0, 2))}` : 'Keep monitoring';
  return [`Understood. ${watch}, and update the assessment if anything moves. That's all for now.`, `Good. ${watch}; flag any change straight away. That's all.`, `Copy that. ${watch} and brief me on any change. That's all for now.`][variant % 3]!;
}
