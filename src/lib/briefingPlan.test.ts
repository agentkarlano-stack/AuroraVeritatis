import { describe, expect, it } from 'vitest';
import type { Story } from '../../shared/news';
import type { GeoEvent } from '../../shared/types';
import { BUDGET_MS, buildPlan, leadFor, OVERRUN_MS, storylines, validLocation } from './briefingPlan';
import { eventHeadline, quakeFacts, speakPlace } from './briefingDialogue';
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

  it('gives the Analyst every story, with the Commander handing over and asking and the Security Officer interjecting', () => {
    const events = [ev('usgs-1'), ev('usgs-5', { lat: -20, lon: -70, region: 'Tarapaca, Chile', title: 'M5.5 - 30 km W of Iquique, Chile', summary: 'Magnitude 5.5 earthquake at 110 km depth.' })];
    const stories = [story('s1', 'Germany cuts gas price forecast as energy market eases'), story('s2', 'Japan confirms new defence budget', { status: 'confirmed' })];
    const p = buildPlan({ window: '24h', now, events, stories, countryOf: (t) => (/japan/i.test(t) ? 'JPN' : /germany/i.test(t) ? 'DEU' : null), placeName: (c) => ({ JPN: 'Japan', DEU: 'Germany' })[c] ?? null, mode: 'play' });
    expect(p.scenes.length).toBe(4);
    p.scenes.forEach((sc, i) => {
      // The first story follows the Commander's opening question directly; later stories open with his handover.
      expect(sc.lines[0]!.speaker).toBe(i === 0 ? 'eve' : 'lead');
      expect(sc.lines.filter((l) => l.speaker === 'eve').length).toBeGreaterThanOrEqual(2);
      expect(sc.lines.filter((l) => l.speaker === 'knox').length).toBeLessThanOrEqual(1);
    });
    const all = p.scenes.flatMap((sc) => sc.lines);
    const by = (r: string) => all.filter((l) => l.speaker === r).reduce((n, l) => n + l.text.length, 0);
    // The Analyst and the Commander carry the briefing; the Security Officer supports.
    expect(by('eve')).toBeGreaterThan(by('knox'));
    expect(by('lead')).toBeGreaterThan(0);
    const handovers = p.scenes.map((sc) => sc.lines[0]!.text);
    expect(new Set(handovers).size).toBe(handovers.length);
    // The opening names the actual items of the period and tasks the Analyst with the first one (no agenda line).
    expect(p.intro.text).toMatch(/Four items from the last twenty-four hours: /);
    expect(p.intro.text).toMatch(/affecting Japan.*magnitude 5.5 earthquake in Chile/);
    expect(p.intro.text).toMatch(/Operator, start with Japan\.$/);
    expect(p.agenda.text).toBe('');
    // News is reported as attributed facts, never as a count of outlets.
    expect(all.map((l) => l.text).join(' ')).not.toMatch(/independent outlets?|Reports from \d/);
    // The Security Officer speaks at least once in every edition.
    expect(all.some((l) => l.speaker === 'knox')).toBe(true);
    expect(p.outro.text).toMatch(/Keep watching Japan/);
    expect(p.intro.text).not.toMatch(/Aurora|Operations Briefing|live preview/i);
    expect(p.outro.text).toMatch(/That's all/);
    expect(p.outro.text).not.toMatch(/transcript|sources/i);
    // Answers use only source facts: the Chilean quake's depth comes from its summary.
    expect(p.scenes.find((sc) => /Iquique/.test(sc.title))!.lines.map((l) => l.text).join(' ')).toContain('110 kilometres');
  });

  it('speaks headlines naturally and reads magnitude, depth and tsunami flag from the USGS summary', () => {
    expect(quakeFacts('Magnitude 6.4 earthquake at 15 km depth. USGS tsunami flag set — check official warning centres.')).toEqual({ magnitude: 6.4, depthKm: 15, tsunami: true });
    expect(speakPlace('50 km ENE of Miyako, Japan')).toBe('50 kilometres east-northeast of Miyako, Japan');
    expect(eventHeadline(ev('usgs-9', { title: 'M6.1 - 50 km E of Miyako, Japan' }))).toBe('A magnitude 6.1 earthquake struck 50 kilometres east of Miyako, Japan.');
    expect(eventHeadline(ev('gdacs-TC-1', { title: 'Tropical Cyclone KONG-REY', region: 'Philippines', severity: 5 }))).toBe('GDACS is tracking Tropical Cyclone Kong-rey affecting Philippines, with a red alert.');
  });

  it('covers only the edition period when an end time is given', () => {
    const p = buildPlan({ window: '24h', now, until: now - 6 * 3_600_000, events: [ev('usgs-1'), ev('usgs-2', { time: ago(10), title: 'Earlier', region: 'Atacama, Chile', lat: -27, lon: -70 })], stories: [], countryOf, mode: 'play' });
    expect(p.scenes.map((sc) => sc.title)).toEqual(['Earlier']);
  });

  it('keeps the economic lead rule for compatibility, and every hazard story still includes the Analyst', () => {
    expect(leadFor('Oil exports fall as tariffs rise')).toBe('eve');
    expect(leadFor('Troops move near the border')).toBe('knox');
    const p = buildPlan({ window: '24h', now, events: [ev('gdacs-TC-1', { title: 'Typhoon X', severity: 5, region: 'Philippines', lat: 14, lon: 125 })], stories: [], countryOf, mode: 'play' });
    expect(p.scenes[0]!.lines.map((l) => l.speaker)).toEqual(['eve', 'lead', 'eve', 'knox']);
    expect(p.scenes[0]!.lines[2]!.text).toContain('Red');
  });
});
