import { describe, expect, it } from 'vitest';
import type { GeoEvent } from '../../shared/types';
import { buildBriefing, weakest } from './briefing';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const ev = (hoursAgo: number, severity: GeoEvent['severity'], provenance: GeoEvent['provenance'], title = `E${hoursAgo}`): GeoEvent => ({
  id: title, title, summary: '', category: 'conflict', severity, lat: 0, lon: 0, region: 'R',
  time: new Date(NOW - hoursAgo * 3_600_000).toISOString(), provenance, source: { name: 's', url: '', license: '' },
});

describe('daily briefing', () => {
  it('ranks the last 24h of events by severity and keeps provenance', () => {
    const b = buildBriefing({ now: NOW, events: [ev(2, 3, 'confirmed', 'Quake'), ev(5, 5, 'simulated', 'Scenario'), ev(30, 5, 'confirmed', 'Old')], tensionNow: 40, tensionWeekAgo: 35, movers: [] });
    expect(b.headline).toBe('2 events in the last 24 hours; most significant: Scenario.');
    expect(b.sections[0]!.items.map((i) => [i.text.split(' (')[0], i.provenance])).toEqual([['Scenario', 'simulated'], ['Quake', 'confirmed']]);
  });

  it('describes tension direction and labels it with the weakest input provenance', () => {
    const b = buildBriefing({ now: NOW, events: [ev(1, 2, 'confirmed')], tensionNow: 52.4, tensionWeekAgo: 40.1, movers: [] });
    const t = b.sections[1]!.items[0]!;
    expect(t.text).toBe('World Tension Index at 52.4 (elevated), up 12.3 points over 7 days.');
    expect(t.provenance).toBe('simulated');
    const flat = buildBriefing({ now: NOW, events: [], tensionNow: 20, tensionWeekAgo: 20.4, movers: [] });
    expect(flat.sections[1]!.items[0]!.text).toContain('broadly unchanged');
    expect(flat.headline).toBe('A quiet 24 hours across active layers.');
  });

  it('lists the largest absolute movers', () => {
    const b = buildBriefing({ now: NOW, events: [], tensionNow: 10, tensionWeekAgo: 10, movers: [
      { symbol: 'A.D', name: 'A', changePct: 0.001 }, { symbol: 'B.D', name: 'B', changePct: -0.03 }, { symbol: 'C.D', name: 'C', changePct: 0.02 }, { symbol: 'D.D', name: 'D', changePct: 0.0 },
    ] });
    expect(b.sections[2]!.items.map((i) => i.text)).toEqual(['B: -3.00% on the latest session.', 'C: +2.00% on the latest session.', 'A: +0.10% on the latest session.']);
    expect(b.sections[2]!.items[0]!.to).toBe('/markets?symbol=B.D');
  });

  it('orders provenance from strongest to weakest', () => {
    expect(weakest('confirmed', 'estimate')).toBe('estimate');
    expect(weakest('confirmed')).toBe('confirmed');
    expect(weakest('unverified', 'simulated', 'estimate')).toBe('simulated');
  });
});
