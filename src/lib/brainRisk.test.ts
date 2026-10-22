import { describe, expect, it } from 'vitest';
import { addNode, emptyGraph, exportJson, exportMarkdown, parseGraph } from './brain';
import { RISK_LEVELS, RISK_METHODS, effectiveRisk, parseRelevance, parseRisk, riskFromEvent, riskSummary } from './brainRisk';

const LIMITS = { graphs: 5, nodesPerGraph: 100, edgesPerGraph: 200 };
const quake = { id: 'usgs-us7000abcd', severity: 4 as const, time: '2026-10-01T03:00:00Z', provenance: 'confirmed' as const, summary: 'Magnitude 6.7 earthquake at 10 km depth.' };

describe('Brain risk scale', () => {
  it('documents all six levels, including grey for missing data', () => {
    expect(Object.keys(RISK_LEVELS)).toEqual(['low', 'elevated', 'significant', 'severe', 'critical', 'unknown']);
    for (const m of Object.values(RISK_METHODS)) {
      expect(m.rule.length).toBeGreaterThan(20);
      expect(m.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('assigns automatic risk only from documented methods', () => {
    const r = riskFromEvent(quake, '2026-10-22')!;
    expect(r).toEqual({ level: 'severe', origin: 'auto', method: 'usgs-magnitude', basis: 'Magnitude 6.7', asOf: '2026-10-01' });
    const g = riskFromEvent({ ...quake, id: 'gdacs-TC-1-2', severity: 3, summary: 'x' }, '2026-10-22')!;
    expect(g).toMatchObject({ level: 'significant', method: 'gdacs-alert', basis: 'GDACS Orange alert', asOf: '2026-10-22' });
    // Simulated scenarios and undocumented feeds get nothing.
    expect(riskFromEvent({ ...quake, provenance: 'simulated' }, '2026-10-22')).toBeUndefined();
    expect(riskFromEvent({ ...quake, id: 'sim-1' }, '2026-10-22')).toBeUndefined();
  });

  it('shows the user override without altering the automatic assessment', () => {
    const autoRisk = riskFromEvent(quake, '2026-10-22')!;
    const node = { autoRisk, risk: { level: 'low' as const, origin: 'user' as const, asOf: '2026-10-22', basis: 'Remote area' } };
    const e = effectiveRisk(node, '2026-10-22');
    expect(e).toMatchObject({ level: 'low', from: 'user' });
    expect(node.autoRisk.level).toBe('severe');
    expect(riskSummary(e)).toContain('your assessment');
    expect(effectiveRisk({ autoRisk }, '2026-10-22')).toMatchObject({ level: 'severe', from: 'auto', outdated: false });
    expect(effectiveRisk({}, '2026-10-22')).toMatchObject({ level: 'unknown', from: 'none' });
  });

  it('greys out an automatic assessment once its method says it is outdated', () => {
    const gdacs = { level: 'critical' as const, origin: 'auto' as const, method: 'gdacs-alert', asOf: '2026-10-01' };
    expect(effectiveRisk({ autoRisk: gdacs }, '2026-10-10').level).toBe('critical');
    const old = effectiveRisk({ autoRisk: gdacs }, '2026-10-20');
    expect(old).toMatchObject({ level: 'unknown', outdated: true });
    expect(riskSummary(old)).toMatch(/^Outdated: Critical per GDACS alert level/);
    // Magnitude does not expire.
    expect(effectiveRisk({ autoRisk: { ...gdacs, method: 'usgs-magnitude' } }, '2030-01-01').level).toBe('critical');
  });

  it('parses strictly', () => {
    expect(parseRisk({ level: 'severe', asOf: '2026-10-01', method: 'made-up' }, 'auto')).toBeUndefined();
    expect(parseRisk({ level: 'extreme', asOf: '2026-10-01' }, 'user')).toBeUndefined();
    expect(parseRisk({ level: 'severe', asOf: 'yesterday' }, 'user')).toBeUndefined();
    expect(parseRisk({ level: 'severe', asOf: '2026-10-01', method: 'usgs-magnitude', origin: 'user' }, 'user')).toEqual({ level: 'severe', origin: 'user', asOf: '2026-10-01' });
    expect(parseRelevance(3)).toBe(3);
    expect(parseRelevance(7)).toBeUndefined();
    expect(parseRelevance('5')).toBeUndefined();
  });

  it('round-trips risk and relevance through JSON and documents them in Markdown', () => {
    let g = emptyGraph('Risk test');
    g = addNode(g, { kind: 'event', label: 'Quake', x: 0, y: 0, autoRisk: riskFromEvent(quake, '2026-10-22'), risk: { level: 'elevated', origin: 'user', asOf: '2026-10-22' }, relevance: 4 }).graph;
    const back = parseGraph(exportJson(g), LIMITS);
    expect(back.nodes[0]).toMatchObject({ autoRisk: { level: 'severe', method: 'usgs-magnitude' }, risk: { level: 'elevated', origin: 'user' }, relevance: 4 });
    const md = exportMarkdown(g);
    expect(md).toContain('Relevance (author): 4/5, Important');
    expect(md).toContain('Risk (automatic): Severe, Magnitude 6.7. Method: Earthquake magnitude band; source: USGS Earthquake Hazards Program; as of 2026-10-01');
    expect(md).toContain("Risk (author's assessment): Elevated");
  });
});

describe('Brain node module links', () => {
  it('points modules at the linked entity and explains unavailable ones', async () => {
    const { moduleLinks } = await import('./brainEntities');
    const deu = moduleLinks({ type: 'country', iso3: 'DEU' });
    expect(deu.find((m) => m.id === 'dossier')?.href).toBe('/countries/DEU');
    expect(deu.find((m) => m.id === 'currency')?.href).toBe('/currency?c=DEU');
    const afg = moduleLinks({ type: 'country', iso3: 'AFG' }).find((m) => m.id === 'currency')!;
    expect(afg.href).toBeNull();
    expect(afg.reason).toMatch(/not covered/);
    const none = moduleLinks(undefined);
    expect(none.find((m) => m.id === 'dossier')).toMatchObject({ href: null, reason: expect.stringMatching(/Link this node/) });
    expect(moduleLinks({ type: 'macro', id: 'HICP' }).find((m) => m.id === 'macro')?.href).toBe('/macro?s=HICP');
    expect(moduleLinks({ type: 'instrument', symbol: 'GOLD.D' }).find((m) => m.id === 'markets')?.href).toBe('/markets?symbol=GOLD.D');
    expect(none.every((m) => m.href !== null || m.reason)).toBe(true);
  });
});
