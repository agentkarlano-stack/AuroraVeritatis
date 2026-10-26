/**
 * EVE–KNOX exchanges for the voiced briefing. Every story gets one short exchange: the second analyst asks what an
 * informed non-specialist would ask, and the lead answers only from the facts in the source record (magnitude, depth,
 * tsunami flag, GDACS alert level and update count, publisher counts, storyline size). No quotations, no invented
 * figures, no filler. Questions rotate so the same wording is not heard twice in one briefing.
 */
import type { CoverageStatus } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';

export type Analyst = 'eve' | 'knox';
export interface Line {
  speaker: Analyst;
  text: string;
}

interface Turn {
  /** Alternative phrasings of the same question; the first unused one is asked. */
  ask: string[];
  answer: string;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Facts USGS publishes in Aurora's summary line: "Magnitude 6.4 earthquake at 15 km depth" (+ tsunami flag). */
export function quakeFacts(summary: string): { magnitude: number | null; depthKm: number | null; tsunami: boolean } {
  const m = summary.match(/Magnitude\s+(\d+(?:\.\d+)?)/i);
  const d = summary.match(/at\s+(\d+(?:\.\d+)?)\s*km depth/i);
  return { magnitude: m ? Number(m[1]) : null, depthKm: d ? Number(d[1]) : null, tsunami: /tsunami flag set/i.test(summary) };
}

const GDACS_LEVEL: Record<number, string> = {
  5: 'red, its highest level: a high modelled humanitarian impact',
  3: 'orange: a medium modelled impact',
  1: 'green: a low modelled impact',
};

/** Candidate turns for an event, most informative first. */
export function eventTurns(e: GeoEvent, relatedReports: number, gdacsUpdates: number): Turn[] {
  const turns: Turn[] = [];
  if (e.id.startsWith('usgs-')) {
    const f = quakeFacts(e.summary);
    if (f.tsunami)
      turns.push({
        ask: ['Is there a tsunami risk?', 'Should coastal areas be worried?'],
        answer: 'USGS has set its tsunami flag. That is a prompt to check the regional tsunami warning centre, which issues the actual warnings.',
      });
    if (f.depthKm !== null)
      turns.push({
        ask: ['How deep was it?', 'Was it a shallow quake?'],
        answer:
          f.depthKm <= 70
            ? `About ${num(f.depthKm)} kilometres down. Shallow quakes like this tend to be felt more strongly near the epicentre.`
            : `About ${num(f.depthKm)} kilometres down. At that depth, shaking at the surface is usually weaker than for a shallow quake of the same size.`,
      });
  }
  if (e.id.startsWith('gdacs-')) {
    // The opening line already names the alert colour, so a developing event leads with its update history.
    if (gdacsUpdates > 1)
      turns.push({
        ask: ['Is it still developing?', 'Has the picture changed since it started?'],
        answer: `GDACS has issued ${gdacsUpdates} updates so far, and its alert is ${GDACS_LEVEL[e.severity] ?? 'a modelled level'}. That is a model estimate and can still change.`,
      });
    turns.push({
      ask: ['How serious is it?', 'What does the alert level tell us?'],
      answer: `GDACS rates it ${GDACS_LEVEL[e.severity] ?? 'with a modelled alert level'}. That is a model estimate, and it can change as the event develops.`,
    });
  }
  if (relatedReports > 0)
    turns.push({
      ask: ['Is this a single event?', 'Is this part of a larger sequence?'],
      answer: `No. It is part of a storyline: ${relatedReports} related ${relatedReports === 1 ? 'report' : 'reports'} in the same area within two days.`,
    });
  turns.push({
    ask: ['What do we actually know so far?', 'How much is confirmed?'],
    answer: 'Location, time and the measured or modelled size from the source. Damage and casualty figures are not in our sources yet.',
  });
  return turns;
}

const ECON = /\b(oil|gas|lng|energy|electricity|prices?|inflation|tariffs?|trade|exports?|imports?|markets?|currenc\w*|rates?|bank|debt|budget)\b/i;

export function storyTurns(title: string, status: CoverageStatus, independent: number, lead: Analyst): Turn[] {
  const turns: Turn[] = [];
  const pubs = `${independent} independent ${independent === 1 ? 'publisher' : 'publishers'}`;
  if (lead === 'eve' && ECON.test(title))
    turns.push({
      ask: ['Could this move prices?', 'Is there a market angle here?'],
      answer: `The reports do not say yet, and a headline alone is not evidence of a market effect. The relevant benchmarks are in the Market and Commodity views.`,
    });
  if (status === 'confirmed')
    turns.push({
      ask: ['Who confirmed it?', 'Is this officially confirmed?'],
      answer: `An official source published it, and ${pubs} carry it as well.`,
    });
  else
    turns.push({
      ask: ['How solid is this?', 'Can we rely on it yet?'],
      answer: `${pubs[0]!.toUpperCase()}${pubs.slice(1)} report it, but no official source yet. Treat the details as provisional.`,
    });
  return turns;
}

/**
 * The exchange for one story: the second analyst asks, the lead answers. Picks the first turn with an unused
 * phrasing; `used` collects the questions asked so far in this briefing.
 */
export function exchange(lead: Analyst, turns: Turn[], used: Set<string>): Line[] {
  const other: Analyst = lead === 'eve' ? 'knox' : 'eve';
  for (const t of turns) {
    const q = t.ask.find((a) => !used.has(a));
    if (!q) continue;
    used.add(q);
    return [
      { speaker: other, text: q },
      { speaker: lead, text: t.answer },
    ];
  }
  return [];
}
