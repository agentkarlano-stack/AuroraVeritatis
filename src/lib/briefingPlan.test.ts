import { describe, expect, it } from 'vitest';
import type { Story } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';
import { BUDGET_MS, buildPlan, leadFor, OVERRUN_MS, storylines, validLocation } from './briefingPlan';
import { exchange, quakeFacts, storyTurns } from './briefingDialogue';
import { dedupeEvents } from './worldBriefing';

const now = Date.parse('2026-10-25T12:00:00Z');
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
const ev = (id: string, o: Partial<GeoEvent> = {}): GeoEvent => ({
  id,
  title: `Quake ${id}`,
  summary: 'Magnitude 6.0 earthquake at 10 km depth.',
  category: 'natural-disaster',
  severity: 4,
  lat: 38,
  lon: 142,
  region: '80 km E of Ofunato, Japan',
  time: ago(2),
  provenance: 'confirmed',
  source: { name: 'USGS', url: `https://usgs.gov/${id}`, license: '' },
  ...o,
});
const story = (id: string, title: string, o: Partial<Story> = {}): Story => ({
  id,
  title,
  articles: [{ url: `https://a.com/${id}`, title, domain: 'a.com', seen: ago(3), language: 'English', sourceCountry: '' }],
  independent: ['a.com', 'b.com'],
  syndicated: [],
  official: [],
  status: 'corroborated',
  first: ago(4),
  last: ago(3),
  ...o,
});
const countryOf = (t: string) => (/japan/i.test(t) ? 'JPN' : /germany/i.test(t) ? 'DEU' : null);

describe('briefing plan', () => {
  it('rejects placeholder and invalid coordinates', () => {
    expect(validLocation({ lat: 0, lon: 0 })).toBe(false);
    expect(validLocation({ lat: 91, lon: 10 })).toBe(false);
    expect(validLocation({ lat: NaN, lon: 10 })).toBe(false);
    expect(validLocation({ lat: 10, lon: -170 })).toBe(true);
  });

  it('groups an aftershock sequence into one storyline instead of repeating it', () => {
    const items = dedupeEvents([ev('usgs-1'), ev('usgs-2', { time: ago(5), severity: 3 }), ev('usgs-3', { time: ago(20), severity: 3 })]);
    expect(storylines(items)).toHaveLength(1);
    expect(storylines(items)[0]!.items).toHaveLength(3);
  });

  it('builds a frozen plan near two minutes, never using simulated events or 0,0 locations', () => {
    const events = [
      ev('usgs-1'),
      ev('usgs-2', { time: ago(5), severity: 3 }),
      ev('usgs-9', { lat: 0, lon: 0, region: 'Unknown', title: 'Bad' }),
      ev('scn-1', { provenance: 'simulated', title: 'Scenario' }),
      ev('gdacs-FL-5', { lat: 23, lon: 90, region: 'Bangladesh', title: 'Flood Bangladesh', severity: 5, time: ago(30) }),
      ev('usgs-old', { time: ago(200), title: 'Old' }),
    ];
    const stories = [story('s1', 'Germany cuts gas price forecast as energy market eases'), story('s2', 'Talks in Geneva', { status: 'unverified' })];
    const p24 = buildPlan({ window: '24h', now, events, stories, countryOf, mode: 'play' });
    expect(p24.scenes.map((s) => s.title)).toEqual(['Quake usgs-1', 'Germany cuts gas price forecast as energy market eases']);
    expect(p24.scenes[0]!.related).toBe(1);
    const p7 = buildPlan({ window: '7d', now, events, stories, countryOf, mode: 'play' });
    expect(p7.scenes.some((s) => s.title === 'Flood Bangladesh')).toBe(true);
    expect(p7.scenes.some((s) => /Bad|Scenario|Old/.test(s.title))).toBe(false);
    const total = p7.scenes.reduce((t, s) => t + s.speakMs, 0);
    expect(total).toBeLessThanOrEqual(BUDGET_MS + OVERRUN_MS);
    // Same content, same version; the plan does not change between calls.
    expect(buildPlan({ window: '7d', now, events, stories, countryOf, mode: 'play' }).version).toBe(p7.version);
  });

  it('gives every story one grounded exchange (COMMAND asks, the specialist answers) without repeating a question', () => {
    const events = [ev('usgs-1'), ev('usgs-5', { lat: -20, lon: -70, region: 'Tarapaca, Chile', title: 'Quake Chile', summary: 'Magnitude 5.5 earthquake at 110 km depth.' })];
    const stories = [story('s1', 'Germany cuts gas price forecast as energy market eases'), story('s2', 'Japan confirms new defence budget', { status: 'confirmed' })];
    const p = buildPlan({ window: '24h', now, events, stories, countryOf: (t) => (/japan/i.test(t) ? 'JPN' : /germany/i.test(t) ? 'DEU' : null), mode: 'play' });
    expect(p.scenes.length).toBe(4);
    const questions = p.scenes.map((sc) => sc.lines[1]!.text);
    for (const sc of p.scenes) {
      expect(sc.lines).toHaveLength(3);
      expect(sc.lines[1]!.speaker).not.toBe(sc.lead);
      expect(sc.lines[2]!.speaker).toBe(sc.lead);
    }
    expect(new Set(questions).size).toBe(questions.length);
    // Answers use only source facts: the Chilean quake's depth comes from its summary.
    expect(p.scenes.find((sc) => sc.title === 'Quake Chile')!.lines[2]!.text).toContain('110 kilometres');
  });

  it('reads magnitude, depth and tsunami flag from the USGS summary and rotates phrasings', () => {
    expect(quakeFacts('Magnitude 6.4 earthquake at 15 km depth. USGS tsunami flag set — check official warning centres.')).toEqual({ magnitude: 6.4, depthKm: 15, tsunami: true });
    const used = new Set<string>();
    const a = exchange('eve', storyTurns('Oil exports fall', 'corroborated', 3, 'eve'), used);
    const b = exchange('eve', storyTurns('Gas tariffs rise', 'corroborated', 2, 'eve'), used);
    expect(a[0]!.text).not.toBe(b[0]!.text);
    expect(a[0]!.speaker).toBe('lead');
  });

  it('covers only the edition period when an end time is given', () => {
    const p = buildPlan({ window: '24h', now, until: now - 6 * 3_600_000, events: [ev('usgs-1'), ev('usgs-2', { time: ago(10), title: 'Earlier', region: 'Atacama, Chile', lat: -27, lon: -70 })], stories: [], countryOf, mode: 'play' });
    expect(p.scenes.map((sc) => sc.title)).toEqual(['Earlier']);
  });

  it('assigns economic stories to EVE and security or hazard stories to KNOX, with viewer questions only where sources answer them', () => {
    expect(leadFor('Oil exports fall as tariffs rise')).toBe('eve');
    expect(leadFor('Troops move near the border')).toBe('knox');
    const p = buildPlan({ window: '24h', now, events: [ev('gdacs-TC-1', { title: 'Typhoon X', severity: 5, region: 'Philippines', lat: 14, lon: 125 })], stories: [], countryOf, mode: 'play' });
    expect(p.scenes[0]!.lines.map((l) => l.speaker)).toEqual(['knox', 'lead', 'knox']);
    expect(p.scenes[0]!.lines[2]!.text).toContain('red');
  });
});
